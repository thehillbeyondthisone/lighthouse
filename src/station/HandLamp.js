import { Group, Mesh, Vector2, Vector3, CylinderGeometry, SphereGeometry, TorusGeometry, LatheGeometry, MathUtils } from '../engine/index.js';
import { standard } from '../materials/Materials.js';

// The keeper's storm lantern: a tubular paraffin lantern of the 1890s, a tin
// fount, a glass globe in a wire guard, a cap and a bail. It stands on the keepers' room table until taken
// (the story's item); carried, it hangs from your hand at your side, swings as you walk, and lights all
// round it (the app's hand lamp, LocalLights' flashlight, made a point light: see App.js).
//
//   carried: in your hand (else standing at `rest`)
//   lit: the wick is lit; glow warms up over a couple of seconds, flickers, and dies away when put out
//   lightPosition: where the flame is (the light's source)
//
// The lantern's own meshes don't take the local lights (its own flame would blow them out at a few
// centimetres); the globe glows by itself.
const HEIGHT = 0.32; // fount foot to the bail's top
const FLAME = 0.13; // the flame above the foot
// carried: the bail's top below and in front of the eye, to the right (body frame: yaw only)
const HAND = { right: 0.27, forward: 0.36, down: 0.54 };

const _f = new Vector3(), _r = new Vector3(), _v = new Vector3();

function buildLantern() {

	const g = new Group();
	g.name = 'hand_lamp';
	// the tin and brass, lit by their own flame (in place of the local lights): flamePos (world), flameLit
	const metal = ( color, roughness, metalness ) => {

		const m = standard( { color, roughness, metalness, defines: { NO_LOCAL_LIGHTS: 1 }, uniforms: { flamePos: [ 'vec3f', new Vector3() ], flameLit: [ 'f32', 0 ] } } );
		m.surface = /* wgsl */`
	let toF = mat.flamePos - in.P;
	let d2 = dot( toF, toF );
	let wrap = 0.35 + 0.65 * max( dot( s.normal, toF * inverseSqrt( max( d2, 1e-6 ) ) ), 0.0 );
	s.emissive = s.emissive + s.albedo * vec3f( 1.0, 0.62, 0.3 ) * mat.flameLit * wrap * 0.01 / ( d2 + 0.003 );
`;
		return m;

	};

	const tin = metal( 0x3d3830, 0.55, 0.55 );
	const brass = metal( 0x9a7634, 0.38, 0.9 );
	const glass = standard( { color: 0x6b5a40, roughness: 0.15, metalness: 0, emissive: 0x000000, defines: { NO_LOCAL_LIGHTS: 1 } } );
	const flame = standard( { color: 0x000000, roughness: 1, metalness: 0, emissive: 0x000000, defines: { NO_LOCAL_LIGHTS: 1 } } );
	const add = ( geo, mat, x, y, z, rx = 0, rz = 0 ) => {

		const m = new Mesh( geo, mat );
		m.position.set( x, y, z );
		m.rotation.set( rx, 0, rz );
		m.castShadow = false;
		m.receiveShadow = true;
		g.add( m );
		return m;

	};

	// the fount: a squat tin drum with a rolled rim, the wick's raiser on the side
	add( new LatheGeometry( [ [ 0.0, 0 ], [ 0.072, 0 ], [ 0.078, 0.008 ], [ 0.078, 0.045 ], [ 0.06, 0.062 ], [ 0.03, 0.068 ], [ 0, 0.068 ] ].map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) ), 20 ), tin, 0, 0, 0 );
	add( new CylinderGeometry( 0.008, 0.008, 0.02, 8 ), brass, 0.045, 0.072, 0, 0, Math.PI / 2 );
	// the burner's collar and the globe: a fat glass barrel
	add( new CylinderGeometry( 0.032, 0.036, 0.016, 14 ), brass, 0, 0.074, 0 );
	const globe = add( new LatheGeometry( [ [ 0.036, 0 ], [ 0.052, 0.025 ], [ 0.057, 0.06 ], [ 0.052, 0.098 ], [ 0.034, 0.122 ] ].map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) ), 20 ), glass, 0, 0.08, 0 );
	// the flame
	const flm = add( new SphereGeometry( 0.011, 8, 6 ), flame, 0, FLAME, 0 );
	flm.scale.set( 1, 1.9, 1 );
	// the wire guard, and the side tubes that feed the burner's air
	for ( let i = 0; i < 4; i ++ ) {

		const a = ( i + 0.5 ) / 4 * Math.PI * 2;
		add( new CylinderGeometry( 0.0022, 0.0022, 0.13, 4 ), tin, Math.cos( a ) * 0.062, 0.14, Math.sin( a ) * 0.062 );

	}

	for ( const s of [ - 1, 1 ] ) add( new CylinderGeometry( 0.006, 0.006, 0.17, 6 ), tin, s * 0.082, 0.135, 0 );
	add( new TorusGeometry( 0.06, 0.0025, 4, 20 ), tin, 0, 0.14, 0, Math.PI / 2 );
	// the cap: the air chamber over the globe
	add( new LatheGeometry( [ [ 0.0, 0 ], [ 0.088, 0 ], [ 0.07, 0.03 ], [ 0.03, 0.05 ], [ 0.018, 0.058 ], [ 0, 0.058 ] ].map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) ), 20 ), tin, 0, 0.215, 0 );
	// the bail, from the side tubes over the cap
	add( new TorusGeometry( 0.082, 0.003, 4, 18, Math.PI ), tin, 0, HEIGHT - 0.082, 0 );
	return { group: g, glass, flame, globe, metals: [ tin, brass ] };

}

export class HandLamp {

	constructor() {

		const L = buildLantern();
		this.group = L.group;
		this._glass = L.glass;
		this._flame = L.flame;
		this._metals = L.metals;
		this.carried = false;
		this.lit = false;
		this.glow = 0;
		this.rest = null; // { position: Vector3 (the foot), ry }
		this.lightPosition = new Vector3();
		this._hand = new Vector3();
		this._lastHand = null;
		this._handVel = new Vector3();
		this._swing = new Vector2(); // the pendulum's lean (rad) toward right / forward of the body
		this._swingV = new Vector2();
		this._yaw = 0;
		this._t = Math.random() * 10;

	}

	setRest( position, ry = 0 ) {

		this.rest = { position: position.clone(), ry };

	}

	// show: carried and in view (not in the free camera, not at the signal lamp)
	update( dt, camera, { show = true } = {} ) {

		this._t += dt;
		// the wick: warms up when lit, and dies quickly when turned down
		const target = this.lit ? 1 : 0;
		this.glow += Math.sign( target - this.glow ) * Math.min( Math.abs( target - this.glow ), dt * ( this.lit ? 0.6 : 2.5 ) );
		const t = this._t;
		const flicker = 0.93 + 0.05 * Math.sin( t * 9.1 ) * Math.sin( t * 5.7 + 1.3 ) + 0.02 * Math.sin( t * 23.0 );
		this.flicker = flicker;
		const k = this.glow * flicker;
		this._glass.emissive.setRGB( 1.0 * 3.2 * k, 0.62 * 3.2 * k, 0.3 * 3.2 * k );
		this._flame.emissive.setRGB( 1.0 * 40 * k, 0.75 * 40 * k, 0.42 * 40 * k );
		for ( const m of this._metals ) m.uniforms.flameLit.value = k;

		const g = this.group;
		if ( ! this.carried ) {

			g.visible = !! this.rest;
			if ( this.rest ) {

				g.position.copy( this.rest.position );
				g.rotation.set( 0, this.rest.ry, 0 );

			}

			this.lightPosition.set( g.position.x, g.position.y + FLAME, g.position.z );
			for ( const m of this._metals ) m.uniforms.flamePos.value.copy( this.lightPosition );
			this._lastHand = null;
			return;

		}

		// the hand, in the body's frame (yaw only)
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		_f.set( - e[ 8 ], 0, - e[ 10 ] );
		if ( _f.lengthSq() > 1e-6 ) this._yaw = Math.atan2( - _f.x, - _f.z );
		_f.set( - Math.sin( this._yaw ), 0, - Math.cos( this._yaw ) );
		_r.set( Math.cos( this._yaw ), 0, - Math.sin( this._yaw ) );
		const hand = this._hand.setFromMatrixPosition( camera.matrixWorld ).addScaledVector( _r, HAND.right ).addScaledVector( _f, HAND.forward );
		hand.y -= HAND.down;

		// the swing: a pendulum from the hand, pushed by the hand's acceleration
		if ( this._lastHand && dt > 0 ) {

			_v.subVectors( hand, this._lastHand ).divideScalar( dt );
			const ax = ( _v.x - this._handVel.x ) / dt, az = ( _v.z - this._handVel.z ) / dt;
			this._handVel.copy( _v );
			const ar = MathUtils.clamp( ax * _r.x + az * _r.z, - 40, 40 ), af = MathUtils.clamp( ax * _f.x + az * _f.z, - 40, 40 );
			const len = HEIGHT - 0.04, w2 = 9.81 / len, damp = 3.2;
			const h = Math.min( dt, 1 / 30 );
			this._swingV.x += ( - w2 * Math.sin( this._swing.x ) - damp * this._swingV.x - ar / len * 0.35 ) * h;
			this._swingV.y += ( - w2 * Math.sin( this._swing.y ) - damp * this._swingV.y - af / len * 0.35 ) * h;
			this._swing.addScaledVector( this._swingV, h );
			this._swing.x = MathUtils.clamp( this._swing.x, - 0.6, 0.6 );
			this._swing.y = MathUtils.clamp( this._swing.y, - 0.6, 0.6 );

		} else this._handVel.set( 0, 0, 0 );

		this._lastHand = ( this._lastHand || new Vector3() ).copy( hand );

		// hang it from the bail's top: the foot lies HEIGHT down the swung axis, and the lantern's up axis
		// leans the other way (yaw, then a lean about the body's right and forward axes)
		const sx = this._swing.x, sf = this._swing.y;
		const down = _v.set( 0, - 1, 0 ).addScaledVector( _r, Math.sin( sx ) ).addScaledVector( _f, Math.sin( sf ) ).normalize();
		g.visible = show;
		g.position.copy( hand ).addScaledVector( down, HEIGHT );
		g.rotation.set( sf, this._yaw, sx, 'YXZ' );
		this.lightPosition.copy( hand ).addScaledVector( down, HEIGHT - FLAME );
		for ( const m of this._metals ) m.uniforms.flamePos.value.copy( this.lightPosition );

	}

	save() {

		return { carried: this.carried, lit: this.lit };

	}

	load( s ) {

		if ( ! s ) return;
		this.carried = !! s.carried;
		this.lit = !! s.lit;
		this.glow = this.lit ? 1 : 0;

	}

}
