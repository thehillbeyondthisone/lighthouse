import { WATCHER, CALL } from './Script.js';

// The Watcher on Gallan Head (docs/PLAN.md §3.4): her lamp, 33 km across the sea, and talking by it.
//
// Her lamp shows steady while she watches, goes dark and bright in Morse while she sends, and is dimmed or
// hidden by the haze between (the story gates on hazeTransmittance, the shader draws it: Beams.js far
// lights). Her messages decode letter by letter as they come: you read them through the telescope, and
// the reading only advances while her lamp is in view and can be seen.
//
//   w.state: 'away' | 'steady' | 'calling' | 'sending' | 'waiting' (for your answer) | 'replying' | 'done'
//   w.lamp: her lamp's brightness now (0..1)
//   w.text: what has been read of her current message
//   w.options: your answers, while waiting
//
// Timing is in real seconds: a Morse unit is UNIT long (a dot; a dash is three; letters are three apart,
// words seven).
export const UNIT = 0.045;

export const MORSE = {
	A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
	M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
	Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...',
	8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '\'': '.----.',
};

// a message as Morse: { on: [ [ t0, t1 ], ... ] lamp-on spans, letters: [ [ char, tEnd ] ], length } in units
export function morse( text ) {

	const on = [], letters = [];
	let t = 0;
	const words = String( text ).toUpperCase().split( /\s+/ ).filter( Boolean );
	words.forEach( ( w, wi ) => {

		if ( wi > 0 ) {

			t += 7; // seven units between words
			letters.push( [ ' ', t ] );

		}

		[ ...w ].forEach( ( ch, ci ) => {

			const code = MORSE[ ch ];
			if ( ! code ) return;
			if ( ci > 0 ) t += 3; // three between letters
			[ ...code ].forEach( ( e, ei ) => {

				if ( ei > 0 ) t += 1;
				const d = e === '.' ? 1 : 3;
				on.push( [ t, t + d ] );
				t += d;

			} );
			letters.push( [ ch, t ] );

		} );

	} );

	return { on, letters, length: t + 1 };

}

// the dots and dashes of a message, as text (the strip's lamp line)
export function morseText( text ) {

	return String( text ).toUpperCase().split( /\s+/ ).map( ( w ) => [ ...w ].map( ( c ) => ( MORSE[ c ] || '' ).replace( /\./g, '·' ).replace( /-/g, '–' ) ).join( ' ' ) ).join( '   ' );

}

export class Watcher {

	constructor( script = WATCHER ) {

		this.script = script;
		this.state = 'away';
		this.node = null;
		this.lamp = 0;
		this.text = '';
		this.options = null;
		this.log = []; // [ { from: 'her' | 'you', text, minutes? } ]
		this.flags = {};
		this._m = null;
		this._t = 0;
		this._read = 0; // units of the message read so far (advances only while watched)
		this.onSent = null; // ( text, minutes ): your answer went (the story spends the clock)

	}

	// she lights her lamp and watches
	appear() {

		if ( this.state === 'away' ) this.state = 'steady';

	}

	// she flashes the call until it is answered
	call() {

		if ( this.state !== 'steady' ) return;
		this.state = 'calling';
		this._m = morse( CALL );
		this._t = 0;

	}

	// you take up the signal lamp and answer the call: she sends her first message
	answer() {

		if ( this.state !== 'calling' && this.state !== 'steady' ) return false;
		this._send( this.script.start );
		return true;

	}

	_send( id ) {

		this.node = this.script.nodes[ id ];
		this.state = 'sending';
		this._m = morse( this.node.her );
		this._t = 0;
		this._read = 0;
		this.text = '';
		this.options = null;

	}

	// your answer i (while waiting): you send it, then she replies with its next message
	reply( i ) {

		if ( this.state !== 'waiting' || ! this.options ) return null;
		const o = this.options[ i ];
		this.log.push( { from: 'you', text: o.text, code: o.code, minutes: o.minutes } );
		if ( o.say ) this.flags.saidName = true;
		this.state = 'replying';
		this._m = morse( o.text );
		this._t = 0;
		this._next = o.next;
		this._sent = o;
		this.options = null;
		return o;

	}

	// the haze closed in: she is lost mid-message
	lose() {

		if ( this.state === 'away' || this.state === 'done' ) return;
		if ( this.state === 'sending' && this.text ) this.log.push( { from: 'her', text: this.text + '…' } );
		this.state = 'done';
		this.lost = true;
		this.options = null;

	}

	get talking() {

		return this.state === 'sending' || this.state === 'waiting' || this.state === 'replying';

	}

	// dt real seconds; watched: her lamp is in your telescope's field and can be seen; hurry: read faster
	update( dt, { watched = false, hurry = false } = {} ) {

		const u = dt / UNIT;
		switch ( this.state ) {

			case 'away': this.lamp = 0; break;
			case 'steady':
			case 'waiting': this.lamp = 1; break;
			case 'done': this.lamp = Math.max( 0, this.lamp - dt / 20 ); break;
			case 'calling': {

				// the call over and over, a long pause between
				this._t = ( this._t + u ) % ( this._m.length + 30 );
				this.lamp = this._on( this._t ) ? 1 : 0;
				break;

			}

			case 'sending': {

				// her lamp keeps her own time; what you read of it advances only while you watch
				this._t += u * ( hurry ? 4 : 1 );
				this.lamp = this._on( this._t % this._m.length ) ? 1 : 0;
				if ( watched ) this._read = Math.min( this._m.length, this._read + u * ( hurry ? 4 : 1 ) );
				this.text = this._m.letters.filter( ( [ , te ] ) => te <= this._read ).map( ( [ c ] ) => c ).join( '' );
				if ( this._read >= this._m.length ) {

					this.log.push( { from: 'her', text: this.node.her } );
					if ( this.node.end ) {

						this.state = 'done';

					} else {

						this.state = 'waiting';
						this.options = this.node.options;

					}

				}

				break;

			}

			case 'replying': {

				// your lamp sends; she is dark while she reads it
				this.lamp = 0;
				this._t += u * 3; // you send quickly, in the clock's skip
				if ( this._t >= this._m.length ) {

					if ( this.onSent ) this.onSent( this._sent.text, this._sent.minutes );
					this._send( this._next );

				}

				break;

			}

		}

	}

	// your lamp now (while replying): on / off
	get yourLamp() {

		return this.state === 'replying' && this._on( this._t ) ? 1 : 0;

	}

	_on( t ) {

		for ( const [ a, b ] of this._m.on ) if ( t >= a && t < b ) return true;
		return false;

	}

	save() {

		return { state: this.state, node: this.node && Object.keys( this.script.nodes ).find( ( k ) => this.script.nodes[ k ] === this.node ), log: this.log, flags: this.flags, lost: !! this.lost };

	}

	load( s ) {

		if ( ! s ) return;
		this.log = s.log || [];
		this.flags = s.flags || {};
		this.lost = !! s.lost;
		// a conversation in progress starts that message again
		if ( s.state === 'sending' || s.state === 'waiting' || s.state === 'replying' ) this._send( s.node || this.script.start );
		else this.state = s.state === 'calling' ? 'steady' : s.state || 'away';

	}

}
