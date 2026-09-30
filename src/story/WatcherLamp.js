import { Vector3 } from '../engine/math/index.js';
import { timeline, isOn } from './Morse.js';

// The Watcher's lamp on Gallan Head, 33 km across the sea (docs/PLAN.md §3.4): the only other light in
// the winter night. She lights it after dusk and it burns steady; to signal, she shutters it in Morse.
// Whether you can see it at all is the air's business: src/materials/Beacons.js draws it as a point of
// light through the same haze as the far shore, so sea mist means silence.
//
//   const w = new WatcherLamp( { position } );      // a few metres above the headland (engine frame)
//   w.send( 'ALL WELL', { repeat: true } );         // Morse, then steady again (or over and over)
//   w.update( dt, { sunElevation } );
//   w.candela                                        // cd toward the Flannans this frame (0: dark)
//
// A signal lamp lent by the Board (a fiction: the real observer watched for the light and telegraphed
// Edinburgh, docs/PLAN.md §2.2): a paraffin lamp behind a bull's-eye lens, aimed at the light, about
// 5000 cd. From the gallery that is a bright star on a clear night (90 km visibility), at the edge of
// sight at 30 km, and gone below 20 km or so.

export class WatcherLamp {

	constructor( { position = new Vector3(), intensity = 5000, unit = 0.4 } = {} ) {

		this.position = position.clone();
		this.intensity = intensity; // cd
		this.unit = unit; // s per Morse unit (about 3 words a minute: a shutter, by hand, across 33 km)
		this.auto = true; // lit once it is dark, out by morning
		this.lit = false;
		this.flame = 0; // 0..1: the wick turned up
		this.message = null; // { tl, t, repeat, gap }
		this.shutter = 1; // 1 open
		this.candela = 0;

	}

	// shutter a message in Morse; `repeat`: again after `gap` seconds, until another message or stop()
	send( text, { repeat = false, gap = 6 } = {} ) {

		const tl = timeline( text, this.unit );
		this.message = tl.segments.length ? { text, tl, t: - 1.5, repeat, gap } : null;
		return tl.duration;

	}

	stop() {

		this.message = null;

	}

	// the flame at its steady state at the next update (a camera cut to another time of day)
	settle() {

		this._settle = true;

	}

	get sending() {

		return !! this.message;

	}

	update( dt, { sunElevation = null } = {} ) {

		// she lights it once the light should be showing (the sun a few degrees down), out after dawn
		if ( this.auto && sunElevation !== null ) this.lit = sunElevation < - 3;
		this.flame += ( ( this.lit ? 1 : 0 ) - this.flame ) * ( this._settle ? 1 : 1 - Math.exp( - dt / 20 ) );
		this._settle = false;
		if ( this.flame < 2e-3 && ! this.lit ) this.flame = 0;

		// the shutter: open between messages; a short dark before each message marks its start
		let open = 1;
		const m = this.message;
		if ( m ) {

			m.t += dt;
			if ( m.t < 0 ) open = 0;
			else if ( m.t < m.tl.duration ) open = isOn( m.tl, m.t ) ? 1 : 0;
			else if ( m.repeat ) {

				open = m.t < m.tl.duration + m.gap ? 1 : 0;
				if ( m.t >= m.tl.duration + m.gap ) m.t = - 1.5;

			} else this.message = null;

		}

		this.shutter = open;
		this.candela = this.intensity * this.flame * open;

	}

}
