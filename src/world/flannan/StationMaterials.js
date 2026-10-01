import { standard, physical } from '../../materials/Materials.js';

// Materials of the light station's own (Station.js assembleStation): the lantern's glazing and the lens.

// The lantern's sixteen panes: thin clear glass with a salt bloom (the boat's glass, src/world/boat/
// BoatMaterials.js), blended in the late pass so the lens and the lamp show through.
export function createLanternGlass() {

	const m = physical( {
		color: 0xb8c6c4, roughness: 0.05, metalness: 0, ior: 1.5,
		transparent: true, opacity: 0.2, side: 'double', depthWrite: false,
		// what is seen through the glass moves, the glass doesn't: keep the velocity of what lies behind
		velocityWeight: 0,
	} );
	m.name = 'lanternGlass';
	m.surface = /* wgsl */`
	let u = in.uv;
	let salt = sat( sin( u.x * 37.0 + sin( u.y * 11.0 ) * 2.0 ) * sin( u.y * 23.0 + u.x * 5.0 ) * 0.5 + 0.5 );
	let edge = 1.0 - smoothstep( 0.0, 0.12, min( min( u.x, 1.0 - u.x ), min( u.y, 1.0 - u.y ) ) );
	s.albedo = mat.color;
	s.alpha = 0.07 + salt * 0.06 + edge * 0.12;
	s.roughness = 0.03 + salt * 0.2;
`;
	m.output = /* wgsl */`
	r.velocity = vec4f( 0.0 );
`;
	return m;

}

// The lens: a drum of prism rings round the flame with four bullseye panels in two pairs, 25° apart in a
// pair, the pairs opposite: turning once a minute, it gives the light's character, two flashes every 30 s
// (src/station/Lamp.js). Its local frame has y = 0 on the focal plane; the group turns by -angle about y,
// so a panel at local azimuth c faces world azimuth c + angle (atan2( z, x )).
//   glow: the flame (0 out .. 1 burning bright); angle: the lens's turn (radians)
export const BULLSEYES = [ 0, 25 * Math.PI / 180, Math.PI, Math.PI + 25 * Math.PI / 180 ];

export function createLensMaterial() {

	const m = standard( {
		color: 0x0c1412, roughness: 0.06, metalness: 0,
		uniforms: { glow: [ 'f32', 0 ], angle: [ 'f32', 0 ] },
		varyings: { vLocal: 'vec3f' },
		vertex: /* wgsl */`
	o.vLocal = v.position;
`,
	} );
	m.name = 'lens';
	m.surface = /* wgsl */`
	let lp = in.vs.vLocal;
	let az = atan2( lp.z, lp.x );
	let R = max( length( lp.xz ), 0.05 );
	// the horizontal prism rings of the refracting belt and the crowns
	let belt = 0.5 + 0.5 * cos( lp.y * 6.2831853 / 0.045 );
	// which way the viewer looks at the lens, about its axis, and how far above or below its plane
	let vaz = atan2( in.V.z, in.V.x );
	let vy = in.V.y;
	var bull = 0.0;
	var flash = 0.0;
	var cs = array<f32, 4>( ${ BULLSEYES.map( ( v ) => v.toFixed( 6 ) ).join( ', ' ) } );
	for ( var i = 0; i < 4; i++ ) {
		let c = cs[ i ];
		let da = atan2( sin( az - c ), cos( az - c ) );
		let d = length( vec2f( da * R, lp.y ) );
		let inside = 1.0 - smoothstep( 0.26, 0.3, d );
		// concentric rings round the bullseye
		let rings = 0.5 + 0.5 * cos( d * 6.2831853 / 0.04 );
		bull = max( bull, inside * ( 0.55 + 0.45 * rings ) );
		// the panel's beam, as it sweeps past the viewer
		let w = c + mat.angle;
		let dv = atan2( sin( vaz - w ), cos( vaz - w ) );
		flash = max( flash, exp( - dv * dv / ( 2.0 * 0.09 * 0.09 ) ) * exp( - vy * vy / 0.35 ) * inside );
	}
	let flame = vec3f( 1.0, 0.78, 0.5 );
	let glass = mix( 0.25 + 0.35 * belt, 1.0, bull );
	s.albedo = mat.color;
	s.roughness = mix( 0.05, 0.12, belt );
	s.emissive = flame * mat.glow * ( glass * 1.6 + flash * 30.0 );
`;
	return m;

}
