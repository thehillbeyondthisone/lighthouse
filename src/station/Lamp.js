import { Vector3 } from '../engine/math/index.js';

// The Flannan light: the paraffin burner, the lens turning on its clockwork, and the beams it throws
// (docs/PLAN.md §6 `Lamp`). CPU state only; src/materials/Beacons.js draws it (the beams in the haze,
// the lens through the lantern glass, the light as a point from afar).
//
// The character is Fl(2) W 30s: two white flashes every thirty seconds. The optic here does it with two
// groups of two panels on opposite sides of the lens, turning once a minute: a group sweeps past every
// thirty seconds, its two panels 2½ s apart. (*verify* the 1899 optic: its order, panels and period.)
//
//   const lamp = new Lamp( { position: new Vector3( 0, 101, 0 ) } );
//   lamp.update( dt, { sunElevation } );   // lit from sunset to sunrise while `auto`
//   lamp.beams                             // [ { dir: Vector3, weight } ] the panels' axes, world frame
//   lamp.intensityToward( dir )            // cd toward a unit direction from the lens
//   lamp.light( false ) / lamp.wind()      // the keeper's hands (docs/PLAN.md §3.3)
//   lamp.settle()                          // the burner at its steady state next update (a time jump)

export const OPTIC = {
	character: 'Fl(2) W 30s',
	groups: 2, // panel groups round the lens
	panels: 2, // panels per group
	panelSpacing: 15, // degrees between the panels of a group: 2.5 s between the flashes
	rotation: 60, // s per turn: groups x 30 s
	// the beam's angular spread (Gaussian sigma, degrees): the flame's width over the focal length.
	// A flash lasts about 0.6 s at half strength
	divergence: 1.5,
	// peak intensity of a panel's beam (cd) with the burner at full (*verify*: "140,000 candlepower")
	intensity: 140000,
	dip: 0.3, // degrees below the horizontal: the beams are aimed at the sea horizon (38 km from 101 m)
	lensRadius: 0.5, // m (a third-order lens has a 500 mm focal length)
	lensHalfHeight: 0.55, // m
	burnerRise: 45, // s: the flame's time constant after lighting (and in dying down)
	clockworkRun: 45 * 60, // s the clockwork runs on one winding (*verify*)
	clockworkSlow: 0.08, // the last share of the winding, over which the lens slows to a stop
};

const DEG = Math.PI / 180;

export class Lamp {

	constructor( { position = new Vector3( 0, 101, 0 ), optic = OPTIC } = {} ) {

		this.position = position.clone();
		this.optic = optic;
		this.angle = 0; // rad: the azimuth of the first group's centre (x east, z south)
		this.auto = true; // lit at sunset, put out at sunrise
		this.lit = false; // the burner is (being) lit
		this.burner = 0; // 0 out .. 1 at full
		// the clockwork's winding left (1 = fully wound). Until the keeper's duties exist the weight is
		// wound up for you (autoWind)
		this.wound = 1;
		this.autoWind = true;
		this.speed = 1; // the lens's speed relative to its proper rotation
		this.time = 0;
		const n = optic.groups * optic.panels;
		this.beams = Array.from( { length: n }, () => ( { dir: new Vector3( 1, 0, 0 ), weight: 1 } ) );
		this._layout = [];
		for ( let g = 0; g < optic.groups; g ++ ) for ( let p = 0; p < optic.panels; p ++ ) {

			// offsets from the group's centre: the panels in a group, then the groups round the lens
			this._layout.push( g / optic.groups * Math.PI * 2 + ( p - ( optic.panels - 1 ) / 2 ) * optic.panelSpacing * DEG );

		}

		this._aim();

	}

	light( on = true ) {

		this.lit = on;
		this.auto = false;

	}

	wind() {

		this.wound = 1;

	}

	// jump to the steady state at the next update (a camera cut to another time of day)
	settle() {

		this._settle = true;

	}

	// sunElevation (degrees): the lamp is lit at sunset and put out at sunrise while `auto`
	update( dt, { sunElevation = null } = {} ) {

		const o = this.optic;
		this.time += dt;
		if ( this.auto && sunElevation !== null ) this.lit = sunElevation < 0;
		// the flame comes up (and dies down) over a minute or so
		const k = 1 - Math.exp( - dt / o.burnerRise );
		this.burner += ( ( this.lit ? 1 : 0 ) - this.burner ) * ( this._settle ? 1 : k );
		this._settle = false;
		if ( this.burner < 2e-3 && ! this.lit ) this.burner = 0;

		// the clockwork: the weight runs down; the lens slows to a stop over the last of the winding
		if ( this.autoWind ) this.wound = 1;
		else this.wound = Math.max( 0, this.wound - dt / o.clockworkRun );
		this.speed = Math.min( 1, this.wound / o.clockworkSlow );
		this.angle = ( this.angle + dt * this.speed * Math.PI * 2 / o.rotation ) % ( Math.PI * 2 );
		this._aim();

	}

	_aim() {

		const c = Math.cos( this.optic.dip * DEG ), s = Math.sin( this.optic.dip * DEG );
		for ( let i = 0; i < this.beams.length; i ++ ) {

			const a = this.angle + this._layout[ i ];
			this.beams[ i ].dir.set( Math.cos( a ) * c, - s, Math.sin( a ) * c );

		}

	}

	// the optic's intensity (cd) toward a unit direction from the lens: each panel's Gaussian beam
	intensityToward( dir ) {

		const sg = this.optic.divergence * DEG;
		let p = 0;
		for ( const b of this.beams ) {

			const c = Math.min( 1, b.dir.dot( dir ) );
			p += b.weight * Math.exp( - 2 * ( 1 - c ) / ( 2 * sg * sg ) );

		}

		return this.optic.intensity * this.burner * p;

	}

}
