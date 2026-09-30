import { Vector3, Vector4 } from '../engine/math/index.js';
import { ShaderModule, UniformBlock } from '../engine/gpu/Shader.js';
import { commonModule } from '../engine/render/wgsl/common.js';

// The lights of the night seen through the air (docs/PLAN.md §3.4, §6): the Flannan light's beams
// sweeping through the haze, its lens seen through the lantern glass, and single points of light far
// off (the Watcher's lamp on Gallan Head; the light itself from afar). One uniform block, written once
// a frame from the lamps' CPU state (src/station/Lamp.js, src/story/WatcherLamp.js):
//
//   beams      in-scatter of each panel's beam (a Gaussian beam from the lens: I sigma^2 / R^2
//              exp( -rho^2 / 2 R^2 ), R^2 = r0^2 + s^2 sigma^2, so I / s^2 on the axis far out and finite at
//              the lens) in the same two haze layers as AirHaze, sampled along the view ray around where
//              it passes nearest each beam's axis. AirHaze's composite adds it (hazeApply).
//   the lens   the lantern's glass panes (the village glass, kind 2) show the lens behind them: the
//              burner's glow in the prisms, and the flash filling the lens as a panel's beam sweeps past
//              the eye.
//   points     a lamp too small to resolve: a Gaussian of the pixel's size holding its illuminance at the
//              eye, after the haze's extinction along the line of sight (AirHaze's own layers: the far
//              shore and the lamp on it fade together). Nothing in front of it: it is hidden.
//
// Units: the scene's night is exposed far brighter than physical; lamps use the local lights' scale
// (LocalLights.js: intensity = illuminance at 1 m), about CD scene units per candela.
//
// WGSL (prefix beacons): uniform var beacons: BeaconParams
//   fn beaconsProfile( w: vec3f ) -> f32                       the optic toward w (1 on a panel's axis)
//   fn beaconsBeams( O: vec3f, V: vec3f, tEnd: f32 ) -> vec3f  beam in-scatter along a view ray
//   fn beaconsLantern( P: vec3f ) -> vec3f                     radiance of a lantern pane at P
//   fn beaconsPoint( V: vec3f, u: vec3f, E: f32, ang: f32 ) -> f32   a point's image toward u
export const CD = 0.5;

// samples per side of the nearest approach, per beam
const N = 8;
const BEAMS = 4;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

const params = new UniformBlock( 'BeaconParams', {
	lens: [ 'vec4f', new Vector4( 0, - 1e4, 0, 0.5 ) ], // the lens's centre (focal point), radius
	lensShape: [ 'vec4f', new Vector4( 0.55, 0.026, 0, 1 ) ], // half height, beam sigma (rad), peak intensity (scene units), in-scatter gain
	beams: [ `vec4f[${ BEAMS }]`, Array.from( { length: BEAMS }, () => new Vector4() ) ], // axis, weight
	beamCol: [ 'vec4f', new Vector4( 1, 0.8, 0.55, 0 ) ],
	glow: [ 'vec4f', new Vector4() ], // the burner in the lens (radiance), the lantern's interior share
	air: [ 'vec4f', new Vector4( 0, 110, 0, 1400 ) ], // marine extinction (1/m), scale height (m), aerosol, scale height
	far: [ 'vec4f', new Vector4() ], // the Watcher's lamp: position (m, before the curvature), illuminance at the eye
	farCol: [ 'vec4f', new Vector4( 1, 0.76, 0.48, 0 ) ],
	own: [ 'vec4f', new Vector4() ], // the light itself as a point: illuminance at the eye, weight (sub-pixel)
}, { label: 'beacons' } );
const U = params.fields;

export const beaconsModule = new ShaderModule( {
	name: 'beacons',
	deps: [ commonModule ],
	uniforms: params,
	uniformName: 'beacons',
	code: /* wgsl */`
// AirHaze's phase function (a Cornette-Shanks forward lobe with some isotropic scattering)
fn beaconsPhase( cosT: f32 ) -> f32 {
	let g = 0.62; let g2 = g * g;
	let cs = 3.0 * ( 1.0 - g2 ) / ( 8.0 * PI * ( 2.0 + g2 ) ) * ( cosT * cosT + 1.0 ) / pow( max( 1.0 + g2 - cosT * 2.0 * g, 1e-4 ), 1.5 );
	return cs * 0.7 + 0.3 / ( 4.0 * PI );
}

// the haze's extinction at height y
fn beaconsSigma( y: f32 ) -> f32 {
	let h = max( y - frame.seaLevel, 0.0 );
	return exp( h / - beacons.air.y ) * beacons.air.x + exp( h / - beacons.air.w ) * beacons.air.z;
}

// the optic toward the unit direction w from the lens: the sum of the panels' Gaussian beams (the
// angle from each axis from 1 - cos: fine at the beam's width)
fn beaconsProfile( w: vec3f ) -> f32 {
	let k = -1.0 / ( beacons.lensShape.y * beacons.lensShape.y );
	var p = 0.0;
	for ( var i = 0; i < ${ BEAMS }; i++ ) {
		let b = beacons.beams[ i ];
		p += b.w * exp( ( 1.0 - min( dot( w, b.xyz ), 1.0 ) ) * k );
	}
	return p;
}

// Light scattered toward the eye from the beams along the ray O + t V, 0 <= t <= tEnd. Per beam: the
// ray's nearest approach to the axis (or to the lens, when that lies behind it), then ${ N } samples
// either side, spaced quadratically away from it over four beam radii (the whole ray when it runs
// along the beam). Extinction: the beam's path from the lens and the view ray, at the sample's height.
fn beaconsBeams( O: vec3f, V: vec3f, tEnd: f32 ) -> vec3f {
	let I = beacons.lensShape.z;
	if ( I <= 0.0 || tEnd <= 0.0 ) { return vec3f( 0.0 ); }
	let A = beacons.lens.xyz;
	let r0 = beacons.lens.w;
	let sg = beacons.lensShape.y;
	let w0 = O - A;
	let d = dot( V, w0 );
	var acc = 0.0;
	for ( var i = 0; i < ${ BEAMS }; i++ ) {
		let bm = beacons.beams[ i ];
		if ( bm.w <= 0.0 ) { continue; }
		let D = bm.xyz;
		let b = dot( V, D );
		let e = dot( D, w0 );
		let den = max( 1.0 - b * b, 0.0 );
		var tc = select( ( b * e - d ) / max( den, 1e-12 ), - d, den < 1e-6 );
		tc = select( tc, - d, e + tc * b < 0.0 );
		tc = clamp( tc, 0.0, tEnd );
		let qc = w0 + V * tc;
		let sc = max( dot( qc, D ), 0.0 );
		let R2c = r0 * r0 + sc * sc * sg * sg;
		// far from this beam (six radii): nothing
		if ( dot( qc, qc ) - sc * sc > R2c * 36.0 ) { continue; }
		let H = 4.0 * sqrt( R2c ) / max( sqrt( den ), 1e-3 );
		let spanLo = tc - max( tc - H, 0.0 );
		let spanHi = min( tc + H, tEnd ) - tc;
		var sum = 0.0;
		for ( var j = 0; j < ${ 2 * N }; j++ ) {
			let side = select( 1.0, -1.0, j < ${ N } );
			let span = select( spanHi, spanLo, j < ${ N } );
			let u = ( f32( j % ${ N } ) + 0.5 ) / ${ f( N ) };
			let t = tc + side * span * u * u;
			let dt = span * 2.0 * u / ${ f( N ) };
			let q = w0 + V * t;
			let s = dot( q, D );
			let R2 = r0 * r0 + s * s * sg * sg;
			let rho2 = max( dot( q, q ) - s * s, 0.0 );
			let E = sg * sg / R2 * exp( -0.5 * rho2 / R2 ) * step( 0.0, s );
			let sig = beaconsSigma( A.y + q.y );
			sum += sig * E * exp( - sig * ( t + max( s, 0.0 ) ) ) * dt;
		}
		// scattered from the beam's direction toward the eye
		acc += sum * beaconsPhase( - b );
	}
	return beacons.beamCol.rgb * ( acc * I * beacons.lensShape.w );
}

// A lantern pane at P: the lens behind it where the view ray passes through the lens (a barrel round
// the vertical axis), a faint glow elsewhere. In the lens: the burner in horizontal bands (the prism
// rings), and the flash: the optic's intensity toward the eye spread over the lens's face.
fn beaconsLantern( P: vec3f ) -> vec3f {
	let O = frame.cameraPos;
	let V = normalize( P - O );
	let A = beacons.lens.xyz;
	let r0 = beacons.lens.w;
	let hh = beacons.lensShape.x;
	let v2 = V.xz;
	let oc = O.xz - A.xz;
	let t = - dot( oc, v2 ) / max( dot( v2, v2 ), 1e-8 );
	let dmin = length( oc + v2 * t );
	let y = O.y + V.y * t - A.y;
	let inLens = ( 1.0 - smoothstep( r0 * 0.7, r0, dmin ) ) * ( 1.0 - smoothstep( hh * 0.8, hh, abs( y ) ) );
	let bands = 0.6 + 0.4 * sin( y * 40.0 ) * ( 1.0 - smoothstep( 0.15, 0.3, abs( y ) ) * 0.5 );
	let toward = beaconsProfile( normalize( O - A ) ) * beacons.lensShape.z;
	let flash = min( toward / ( 4.0 * r0 * hh ), 30000.0 );
	return ( beacons.glow.rgb * bands + beacons.beamCol.rgb * flash ) * inLens + beacons.glow.rgb * beacons.glow.w;
}

// The image of a point light in direction u (unit) seen along the pixel ray V: a Gaussian of angular
// sigma ang holding illuminance E. The angle from the cross product: 1 - cos loses it in f32 below a
// milliradian (a lamp 33 km off through the telescope)
fn beaconsPoint( V: vec3f, u: vec3f, E: f32, ang: f32 ) -> f32 {
	let cr = cross( V, u );
	let a2 = select( 4.0, dot( cr, cr ), dot( V, u ) > 0.0 );
	return E / ( TWO_PI * ang * ang ) * exp( -0.5 * a2 / ( ang * ang ) );
}
`,
} );

const _d = new Vector3();

// CPU side: packs the lamps into the uniforms every frame.
export class Beacons {

	constructor() {

		this.lamp = null; // src/station/Lamp.js
		this.watcher = null; // src/story/WatcherLamp.js
		// in-scatter gain over the physical single scattering. The scene's moonless night sky is about ten
		// times a real one against the lamps (App.js nightAmb): at 1 the beams would be lost in it, where
		// on a real dark night they stand out several times brighter than the sky
		this.beamGain = 40;
		this.glowRadiance = 8; // the burner seen in the lens (scene radiance, burner at full)
		this.interior = 0.08; // the lantern's lit interior, as a share of that, on the whole pane
		this.watcherGain = 1; // multiplies the Watcher's lamp (the telescope's aperture: set by the app)
		this.time = 0;
		this.module = beaconsModule;

	}

	// haze: AirHaze (its layers and density); camera: the view's camera
	update( dt, { camera, haze = null } ) {

		this.time += dt;
		const lamp = this.lamp;
		if ( haze ) {

			const L = haze.layers, k = haze.density.value * ( haze.enabled.value > 0.5 ? 1 : 0 );
			U.air.value.set( L.marine.sigma * k, L.marine.H, L.aerosol.sigma * k, L.aerosol.H );

		}

		if ( lamp ) {

			const o = lamp.optic, p = lamp.position;
			U.lens.value.set( p.x, p.y, p.z, o.lensRadius );
			U.lensShape.value.set( o.lensHalfHeight, o.divergence * Math.PI / 180, o.intensity * CD * lamp.burner, this.beamGain );
			const B = U.beams.value;
			for ( let i = 0; i < B.length; i ++ ) {

				const b = lamp.beams[ i ];
				if ( b ) B[ i ].set( b.dir.x, b.dir.y, b.dir.z, b.weight );
				else B[ i ].set( 1, 0, 0, 0 );

			}

			const g = this.glowRadiance * lamp.burner;
			U.glow.value.set( g * 1.0, g * 0.62, g * 0.3, this.interior );
			// the light as a point from afar: its intensity toward the camera over the distance squared
			_d.subVectors( camera.position, p );
			const d = Math.max( _d.length(), 1 );
			_d.multiplyScalar( 1 / d );
			const glow = this.glowRadiance * lamp.burner * 4 * o.lensRadius * o.lensHalfHeight;
			U.own.value.set( ( lamp.intensityToward( _d ) * CD + glow ) / ( d * d ), 1, 0, 0 );

		} else {

			U.lensShape.value.z = 0;
			U.own.value.set( 0, 0, 0, 0 );

		}

		const w = this.watcher;
		if ( w && w.candela > 0 ) {

			const p = w.position;
			const d2 = Math.max( camera.position.distanceToSquared( p ), 1 );
			// scintillation: a long path low over the sea (a few tens of percent, a few times a second)
			const t = this.time;
			const tw = 1 + 0.22 * Math.sin( t * 13.1 ) * Math.sin( t * 7.3 + 1.1 ) + 0.12 * Math.sin( t * 29.7 + 2.3 );
			U.far.value.set( p.x, p.y, p.z, w.candela * CD / d2 * tw * this.watcherGain );

		} else U.far.value.w = 0;

	}

}
