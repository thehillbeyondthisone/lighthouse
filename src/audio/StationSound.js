import { BANK } from './soundBank.js';

// The light station's own sounds, on the SoundScape's audio graph (docs/PLAN.md §7). The island's beds
// (wind, the sea, gulls, footsteps) are the SoundScape's recordings; the machinery here has no recording
// in the bank yet and is synthesised from noise and a few partials:
//   the rotation machine's escapement ticking while the lens turns; its warning bell; the winding ratchet
//   the paraffin burner's soft roar while lit
//   the wind in the lantern's glazing (a whistle that wanders with the gusts), in the lantern and on the walkway
//   doors and the gate (a creak and a thud), the signal lamp's shutter, the burner catching
// and from the bank: the sea booming in the geos below the cliffs (the surf crashes, slowed and dulled).
//
//   const ss = new StationSound( soundScape ); ss.update( dt, { listener, lampGlow, lensTurning, indoor,
//     inLantern, onWalkway, windGust } )

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );

export class StationSound {

	constructor( scape, { tower } ) {

		this.s = scape;
		this.tower = tower; // TOWER: crank, deck
		this.ready = false;
		this._tick = 0;
		this._tickSide = 0;
		this._boomT = 4;
		this._ratchet = false;
		this._ratchetT = 0;
		this._bellT = - 1;
		this._bells = 0;

	}

	_build() {

		const s = this.s, c = s.ctx;
		this.c = c;
		// two seconds of white noise, shared
		const n = c.sampleRate * 2, buf = c.createBuffer( 1, n, c.sampleRate ), d = buf.getChannelData( 0 );
		for ( let i = 0; i < n; i ++ ) d[ i ] = Math.random() * 2 - 1;
		this.noise = buf;
		const pan = ( ref = 1.5, roll = 1.2 ) => s._panner( s.aboveOut, ref, roll );
		// the machine, at the pedestal
		this.machine = pan( 1, 1.4 );
		// the burner: a looping roar, at the lens
		this.burnerPan = pan( 1.2, 1.3 );
		this.burnerGain = c.createGain();
		this.burnerGain.gain.value = 0;
		const roar = this._loop( this.burnerGain );
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 380;
		roar.disconnect();
		roar.connect( lp ).connect( this.burnerGain );
		this.burnerGain.connect( this.burnerPan );
		// the wind in the glazing: band-passed noise, its centre wandering
		this.whistleGain = c.createGain();
		this.whistleGain.gain.value = 0;
		this.whistleBP = c.createBiquadFilter();
		this.whistleBP.type = 'bandpass';
		this.whistleBP.frequency.value = 900;
		this.whistleBP.Q.value = 18;
		const wsrc = this._loop( this.whistleBP );
		this.whistleBP.connect( this.whistleGain ).connect( s.aboveOut );
		this._wsrc = wsrc;
		this.ready = true;

	}

	_loop( dest ) {

		const src = this.c.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		src.connect( dest );
		src.start( this.c.currentTime + 0.05, Math.random() * 2 );
		return src;

	}

	// a short filtered noise burst at time t into dest
	_burst( dest, t, dur, type, f, q, g, decay = dur / 3 ) {

		const c = this.c;
		const src = c.createBufferSource();
		src.buffer = this.noise;
		const bq = c.createBiquadFilter();
		bq.type = type;
		bq.frequency.value = f;
		bq.Q.value = q;
		const gn = c.createGain();
		gn.gain.setValueAtTime( 0, t );
		gn.gain.linearRampToValueAtTime( g, t + 0.002 );
		gn.gain.setTargetAtTime( 0, t + 0.002, decay );
		src.connect( bq ).connect( gn ).connect( dest );
		src.start( t, Math.random() * 1.5, dur + decay * 4 );
		src.onended = () => gn.disconnect();

	}

	// a struck metal partial
	_partial( dest, t, f, g, decay ) {

		const c = this.c;
		const o = c.createOscillator();
		o.frequency.value = f;
		const gn = c.createGain();
		gn.gain.setValueAtTime( 0, t );
		gn.gain.linearRampToValueAtTime( g, t + 0.004 );
		gn.gain.setTargetAtTime( 0, t + 0.004, decay );
		o.connect( gn ).connect( dest );
		o.start( t );
		o.stop( t + decay * 6 );
		o.onended = () => gn.disconnect();

	}

	_at( p, x, y, z ) {

		if ( p.positionX ) {

			p.positionX.value = x;
			p.positionY.value = y;
			p.positionZ.value = z;

		} else p.setPosition( x, y, z );

	}

	// ---- events

	bell( at ) {

		if ( ! this._ok() ) return;
		const p = this.s._panner( this.s.aboveOut, 2, 1.1 );
		this._at( p, at.x, at.y + 0.3, at.z );
		const t0 = this.c.currentTime + 0.02;
		for ( let k = 0; k < 4; k ++ ) {

			const t = t0 + k * 1.15;
			for ( const [ f, g, d ] of [ [ 1180, 0.16, 0.9 ], [ 2710, 0.07, 0.5 ], [ 4130, 0.04, 0.3 ], [ 590, 0.05, 1.2 ] ] ) this._partial( p, t, f * ( 1 + ( Math.random() - 0.5 ) * 0.004 ), g, d );

		}

	}

	ratchet( on ) {

		this._ratchet = on;

	}

	ignite() {

		if ( ! this._ok() ) return;
		const t = this.c.currentTime + 0.02;
		this._at( this.burnerPan, 0, this.tower.deck + 2.9, 0 );
		this._burst( this.burnerPan, t, 0.03, 'highpass', 2500, 0.7, 0.25, 0.02 ); // the match
		this._burst( this.burnerPan, t + 0.5, 0.6, 'bandpass', 300, 0.8, 0.5, 0.35 ); // the paraffin taking

	}

	extinguish() {

		if ( ! this._ok() ) return;
		this._burst( this.burnerPan, this.c.currentTime + 0.02, 0.2, 'lowpass', 500, 0.7, 0.3, 0.15 );

	}

	shutter() {

		if ( ! this._ok() ) return;
		const p = this.s._panner( this.s.aboveOut, 1, 1.2 );
		const T = this.tower.signal;
		this._at( p, T.x, T.y, T.z );
		const t = this.c.currentTime + 0.01;
		for ( let k = 0; k < 6; k ++ ) this._burst( p, t + k * 0.22 + Math.random() * 0.06, 0.012, 'bandpass', 3200, 2, 0.35, 0.01 );

	}

	// a door or the gate: a creak, then a thud as it comes to; hard: the gate slammed by the wind
	door( name, open, at, hard = false ) {

		if ( ! this._ok() || ! at ) return;
		const p = this.s._panner( this.s.aboveOut, name === 'gate' ? 4 : 2, name === 'gate' ? 0.8 : 1.2 );
		this._at( p, at.x, at.y, at.z );
		const c = this.c, t = c.currentTime + 0.02;
		// the creak: a narrow band sweeping
		const src = c.createBufferSource();
		src.buffer = this.noise;
		const bq = c.createBiquadFilter();
		bq.type = 'bandpass';
		bq.Q.value = 30;
		bq.frequency.setValueAtTime( open ? 420 : 700, t );
		bq.frequency.linearRampToValueAtTime( open ? 760 : 380, t + 0.7 );
		const gn = c.createGain();
		gn.gain.setValueAtTime( 0, t );
		gn.gain.linearRampToValueAtTime( hard ? 0.5 : 0.9, t + 0.1 );
		gn.gain.linearRampToValueAtTime( 0, t + 0.75 );
		src.connect( bq ).connect( gn ).connect( p );
		src.start( t, Math.random(), 0.8 );
		// the thud
		const td = t + ( hard ? 0.35 : 0.8 );
		this._burst( p, td, 0.05, 'lowpass', name === 'gate' ? 220 : 160, 0.9, hard ? 1.4 : 0.7, 0.08 );
		if ( name === 'gate' && hard ) this._partial( p, td, 310, 0.12, 0.25 );

	}

	_ok() {

		if ( ! this.s.enabled ) return false;
		if ( ! this.ready ) this._build();
		return true;

	}

	// ---- per frame

	update( dt, st ) {

		if ( ! this._ok() ) return;
		const c = this.c, now = c.currentTime, T = this.tower, L = st.listener;
		const toLens = Math.hypot( L.x, L.z ), above = L.y - T.deck;
		const nearLens = toLens < 5 && above > - 3 && above < 6 ? 1 : 0;

		// the escapement: tick... tock while the lens turns, heard in the lantern and faintly down the hatch
		this._at( this.machine, T.crank.x, T.crank.y, T.crank.z );
		if ( st.lensTurning && nearLens ) {

			this._tick -= dt;
			if ( this._tick <= 0 ) {

				this._tick += 0.42;
				this._tickSide ^= 1;
				this._burst( this.machine, now + 0.01, 0.004, 'bandpass', this._tickSide ? 2600 : 1900, 4, 0.22, 0.012 );
				this._burst( this.machine, now + 0.012, 0.01, 'lowpass', 300, 1, 0.12, 0.02 );

			}

		}

		// the ratchet while winding: a pawl over the teeth
		if ( this._ratchet ) {

			this._ratchetT -= dt;
			if ( this._ratchetT <= 0 ) {

				this._ratchetT += 0.07;
				this._burst( this.machine, now + 0.005, 0.003, 'bandpass', 3800, 3, 0.3, 0.008 );

			}

		}

		// the burner
		this._at( this.burnerPan, 0, T.deck + 2.9, 0 );
		this.s._ramp( this.burnerGain.gain, 0.5 * st.lampGlow * nearLens, 0.3 );

		// the wind in the glazing (the lantern and the walkway), with the gusts
		const g = clamp( st.windGust ?? 0.5, 0, 1 );
		const exposed = st.inLantern ? 0.7 : st.onWalkway ? 1 : 0;
		this.s._ramp( this.whistleGain.gain, 0.05 * exposed * ( 0.2 + g ) * clamp( ( st.wind ?? 9 ) / 9, 0.3, 2 ), 0.6 );
		this.s._ramp( this.whistleBP.frequency, 700 + 500 * g + 120 * Math.sin( now * 0.7 ), 0.8 );

		// the sea booming in the geos below the cliffs: slowed, dulled surf crashes, out toward the coast
		this._boomT -= dt;
		if ( this._boomT <= 0 && BANK.surf_crash ) {

			this._boomT = 4 + Math.random() * 7;
			const ox = L.x + 155, oz = L.z - 59, ol = Math.hypot( ox, oz ) || 1;
			const a = Math.atan2( oz / ol, ox / ol ) + ( Math.random() - 0.5 ) * 1.6, d = 90 + Math.random() * 120;
			const v = this.s._shotAt( 'surf_crash', 'crash', L.x + Math.cos( a ) * d, 1, L.z + Math.sin( a ) * d, - 15 + ( Math.random() - 0.5 ) * 5 - 6 * ( st.indoor || 0 ), 0.55 + Math.random() * 0.18, 0, 30, 0.6 );
			if ( v && v.extra && v.extra[ 0 ] ) v.extra[ 0 ].frequency.value = 650;

		}

	}

}
