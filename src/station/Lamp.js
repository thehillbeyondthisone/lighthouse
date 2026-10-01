import { Vector3 } from '../engine/math/index.js';
import { Beams } from './Beams.js';
import { BULLSEYES } from '../world/flannan/StationMaterials.js';

// The light (docs/PLAN.md §6 Lamp): the paraffin burner in the lens, the clockwork that turns the lens,
// and the beams.
//
//   lit / glow: the burner is lit and warms up to full brightness over WARM seconds (real time), or dies
//     away when put out
//   wind: the clockwork's weight, 1 fully wound .. 0 run down; it runs down over RUN_HOURS of the game's
//     clock while the machine turns. The warning bell rings below WARN (onWarning). Run down, the lens
//     slows to a stop: the light no longer flashes its character, two white flashes every 30 s
//     (Fl(2) W 30s: two pairs of bullseyes 25° apart in a pair, one turn a minute; the flashes come
//     4.2 s apart)
//   angle: the lens's turn (radians, world azimuth of local azimuth 0)
//
// The beams leave the lens horizontally, dipped a little toward the sea horizon 38 km off.
export const PERIOD = 60; // s per turn of the lens
export const RUN_HOURS = 3; // game hours of running on one winding
export const WARN = 0.06;
const WARM = 18; // s from lighting to full brightness
const DIP = 0.004; // rad: the beams aim at the horizon

export class Lamp {

	constructor( { lens = null, lensMaterial = null, light = null, origin = new Vector3( 0, 101, 0 ), intensity = 1.2e5 } = {} ) {

		this.lens = lens; // the turning group (Station.js assembleStation)
		this.lensMaterial = lensMaterial;
		this.light = light; // the LocalLights source inside the lens
		this.origin = origin;
		this.intensity = intensity;
		this.lit = false;
		this.glow = 0;
		this.wind = 0;
		this.running = false; // the machine's brake is off
		this.speed = 0; // 0..1 of the lens's full speed
		this.angle = 0;
		this.warned = false;
		this.onWarning = null; // () the bell
		this.onStopped = null; // () the lens has come to a stop
		this._dirs = [ 0, 1, 2, 3 ].map( () => new Vector3() );

	}

	// light the burner
	ignite() {

		this.lit = true;

	}

	extinguish() {

		this.lit = false;

	}

	// add a winding (0..1 of a full winding) and release the brake
	addWind( amount ) {

		this.wind = Math.min( 1, this.wind + amount );
		this.running = true;
		if ( this.wind > WARN ) this.warned = false;

	}

	stop() {

		this.running = false;

	}

	get turning() {

		return this.speed > 0.5;

	}

	// the four beams' axes now (world, unit)
	beamDirections() {

		const c = Math.cos( DIP ), s = Math.sin( - DIP );
		return BULLSEYES.map( ( b, i ) => this._dirs[ i ].set( Math.cos( b + this.angle ) * c, s, Math.sin( b + this.angle ) * c ) );

	}

	// dt: real seconds; gameHours: the game's clock advanced this frame (hours)
	update( dt, gameHours = 0 ) {

		// the flame warms up or dies away
		const target = this.lit ? 1 : 0;
		const rate = this.lit ? 1 / WARM : 1 / 3;
		this.glow += Math.sign( target - this.glow ) * Math.min( Math.abs( target - this.glow ), rate * dt );

		// the clockwork: runs down with the game's clock while the lens turns
		const going = this.running && this.wind > 0;
		if ( going ) {

			this.wind = Math.max( 0, this.wind - gameHours / RUN_HOURS );
			if ( this.wind < WARN && ! this.warned ) {

				this.warned = true;
				if ( this.onWarning ) this.onWarning();

			}

		}

		const wasTurning = this.speed > 0.02;
		const want = going ? 1 : 0;
		this.speed += ( want - this.speed ) * ( 1 - Math.exp( - dt / ( going ? 6 : 10 ) ) );
		if ( this.speed < 1e-3 && ! going ) this.speed = 0;
		this.angle = ( this.angle + this.speed * dt * Math.PI * 2 / PERIOD ) % ( Math.PI * 2 );
		if ( wasTurning && this.speed <= 0.02 && this.onStopped ) this.onStopped();

		// the scene
		if ( this.lens ) this.lens.rotation.y = - this.angle;
		if ( this.lensMaterial ) {

			this.lensMaterial.uniforms.glow.value = this.glow;
			this.lensMaterial.uniforms.angle.value = this.angle;

		}

		if ( this.light ) this.light.scale = this.glow;
		const B = Beams.uniforms;
		B.origin.value.copy( this.origin );
		B.count.value = this.glow > 0.002 ? 4 : 0;
		const dirs = this.beamDirections();
		for ( let i = 0; i < 4; i ++ ) B.dirs.value[ i ].set( dirs[ i ].x, dirs[ i ].y, dirs[ i ].z, this.intensity * this.glow * this.glow );

	}

	// how bright the light looks from a direction (unit vector from the lens toward the viewer), 0..1: the
	// flashes as the bullseyes sweep past (the story checks the character with it)
	flashToward( v ) {

		let f = 0;
		const az = Math.atan2( v.z, v.x );
		for ( const b of BULLSEYES ) {

			const d = Math.atan2( Math.sin( az - b - this.angle ), Math.cos( az - b - this.angle ) );
			f = Math.max( f, Math.exp( - d * d / ( 2 * 0.035 * 0.035 ) ) );

		}

		return f * this.glow;

	}

	save() {

		return { lit: this.lit, glow: this.glow, wind: this.wind, running: this.running, angle: this.angle, warned: this.warned };

	}

	load( s ) {

		if ( ! s ) return;
		Object.assign( this, { lit: !! s.lit, glow: s.glow || 0, wind: s.wind || 0, running: !! s.running, angle: s.angle || 0, warned: !! s.warned } );
		this.speed = this.running && this.wind > 0 ? 1 : 0;

	}

}
