import { ShaderModule, UniformBlock } from '../engine/gpu/Shader.js';
import { commonModule } from '../engine/render/wgsl/common.js';
import { Vector3, Vector4 } from '../engine/math/index.js';

// Light in the air, for the air haze's composite (src/post/AirHaze.js, define HZ_BEAMS):
//  - the lighthouse's beams: four pencils from the lens, each a Gaussian tube that widens with distance,
//    their single scattering in the haze integrated analytically along the view ray (closest approach of
//    the ray to the beam's axis). Faint in clear air, sweeping shafts in sea mist.
//  - far lights: points of light (the Watcher's lamp on Gallan Head, 33 km off) drawn as a core of a
//    pixel or two and a little aureole, dimmed by the haze along the way and dropped by the Earth's
//    curvature like the far shore.
//
// WGSL (prefix `beams`): fn beamsInScatter( cam: vec3f, dir: vec3f, dist: f32, sigma0: f32 ) -> vec3f,
// where sigma0 is the haze's extinction (1/m) at sea level; the haze's height layers set the rest.
//
//   Beams.set( { origin, dirs: [ Vector3 x4 ], intensity, color } ), Beams.lights[ i ] = { position, intensity, color }

export const MAX_FAR = 4;

// the haze's layers as AirHaze has them (sea level extinction 1/m at density 1, scale height m)
export const HAZE_LAYERS = [ { sigma: 1.5e-4, H: 110 }, { sigma: 3.2e-5, H: 1400 } ];

const block = new UniformBlock( 'BeamParams', {
	origin: [ 'vec3f', new Vector3() ],
	count: [ 'f32', 0 ], // beams lit (0 or 4)
	dirs: [ 'vec4f[4]', [ 0, 1, 2, 3 ].map( () => new Vector4() ) ], // xyz axis, w strength
	color: [ 'vec3f', new Vector3( 1, 0.8, 0.55 ) ],
	spread: [ 'f32', 0.035 ], // tan of the beam's half width
	far: [ 'vec4f[4]', [ 0, 1, 2, 3 ].map( () => new Vector4() ) ], // xyz position, w intensity
	farColor: [ 'vec4f[4]', [ 0, 1, 2, 3 ].map( () => new Vector4( 1, 0.75, 0.45, 0 ) ) ],
	pixel: [ 'f32', 0.001 ], // one pixel's angle (rad): the far lights' core
	gain: [ 'f32', 1 ], // far lights' brightness (a telescope gathers more)
}, { label: 'beams' } );

export const Beams = {

	uniforms: block.fields,

	module: new ShaderModule( {
		name: 'beams',
		deps: [ commonModule ],
		uniforms: block,
		uniformName: 'beamParams',
		code: /* wgsl */`
// the haze's extinction at height h above the sea (1/m), sigma0: its sea level value at density 1 x density
fn beamsSigma( h: f32, density: f32 ) -> f32 {
	return ( ${ HAZE_LAYERS[ 0 ].sigma } * exp( - max( h, 0.0 ) / ${ HAZE_LAYERS[ 0 ].H.toFixed( 1 ) } ) + ${ HAZE_LAYERS[ 1 ].sigma } * exp( - max( h, 0.0 ) / ${ HAZE_LAYERS[ 1 ].H.toFixed( 1 ) } ) ) * density;
}

// forward-peaked scattering (as the haze's)
fn beamsPhase( c: f32 ) -> f32 {
	let g = 0.6; let g2 = g * g;
	return ( 1.0 - g2 ) / ( 4.0 * PI * pow( max( 1.0 + g2 - 2.0 * g * c, 1e-4 ), 1.5 ) ) * 0.75 + 0.25 / ( 4.0 * PI );
}

fn beamsInScatter( cam: vec3f, dir: vec3f, dist: f32, density: f32, seaLevel: f32 ) -> vec3f {
	var out = vec3f( 0.0 );
	let O = beamParams.origin;
	let r = cam - O;
	let sigB = beamsSigma( O.y - seaLevel, density );
	for ( var i = 0; i < i32( beamParams.count ); i++ ) {
		let D = beamParams.dirs[ i ].xyz;
		let b = dot( dir, D );
		let denom = max( 1.0 - b * b, 1e-4 );
		let d1 = dot( dir, r ); let e = dot( D, r );
		// closest approach of the view ray to the beam's axis, kept in front of the camera and the scene
		let t = clamp( ( b * e - d1 ) / denom, 0.0, dist );
		let s = e + t * b;
		if ( s <= 0.0 ) { continue; }
		let q = r + dir * t - D * s;
		let w = 0.25 + s * beamParams.spread;
		let sinP = sqrt( denom );
		// the tube's cross-section integrated along the ray (bounded where the ray runs along the beam)
		let across = 2.5066 * w / max( sinP, w / max( s, 1.0 ) + 0.02 );
		let core = exp( - dot( q, q ) / ( 2.0 * w * w ) );
		let T = exp( - sigB * ( s + t ) );
		out += beamParams.color * beamParams.dirs[ i ].w * sigB * beamsPhase( - b ) * core * across / ( w * w ) * T;
	}
	// far lights
	for ( var j = 0; j < ${ MAX_FAR }; j++ ) {
		let f = beamParams.far[ j ];
		if ( f.w <= 0.0 ) { continue; }
		let p = vec3f( f.x, f.y - curvatureDrop( f.xz ), f.z ) - cam;
		let L = length( p );
		if ( dist < L - 60.0 ) { continue; }
		let c = dot( dir, p / L );
		let a = sqrt( max( 2.0 * ( 1.0 - c ), 0.0 ) );
		let a0 = beamParams.pixel * 1.3;
		// the haze between: from the camera's height to the light's, at their mean height
		let hm = max( ( cam.y + p.y * 0.5 ) - seaLevel, 0.0 );
		let T = exp( - beamsSigma( hm, density ) * L );
		let E = f.w * T / ( L * L ) * beamParams.gain;
		out += beamParams.farColor[ j ].rgb * E * ( exp( - a * a / ( a0 * a0 ) ) / ( 3.1416 * a0 * a0 ) + exp( - a / ( a0 * 12.0 ) ) * 0.02 / ( a0 * a0 * 900.0 ) );
	}
	return out;
}
`,
	} ),

};

// the haze's transmittance from p to q (both Vector3, y above the sea) at the given density, along the
// straight path at their mean height (what the far lights' shader does): for the story's visibility gates
export function hazeTransmittance( p, q, density ) {

	const L = p.distanceTo( q ), h = Math.max( 0, ( p.y + q.y ) / 2 );
	let sigma = 0;
	for ( const l of HAZE_LAYERS ) sigma += l.sigma * Math.exp( - h / l.H );
	return Math.exp( - sigma * density * L );

}
