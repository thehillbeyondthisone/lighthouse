// International Morse, for the lamps (docs/PLAN.md §3.4). Timing in units: a dot is one unit on, a
// dash three; one unit dark between the signs of a letter, three between letters, seven between
// words.
//
//   encode( 'Ceit' )                    '-.-. . .. -'
//   decode( '-.-. . .. -' )             'CEIT'
//   const t = timeline( 'SOS', 0.35 )   { segments: [ { on, start, end } ], duration } in seconds
//   isOn( t, seconds )                  whether the lamp shows at that time

export const CODE = {
	A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
	K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
	U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
	0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
	'.': '.-.-.-', ',': '--..--', '?': '..--..', '\'': '.----.', '/': '-..-.', '-': '-....-', '(': '-.--.', ')': '-.--.-',
	'=': '-...-', '+': '.-.-.', '@': '.--.-.', ':': '---...',
};

const DECODE = Object.fromEntries( Object.entries( CODE ).map( ( [ k, v ] ) => [ v, k ] ) );

// letters with accents are sent as their plain letters (the Gaelic grave: à è ì ò ù)
const plain = ( s ) => s.normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' ).toUpperCase();

// letters separated by spaces, words by ' / '; characters with no code are left out
export function encode( text ) {

	return plain( text ).split( /\s+/ ).filter( Boolean )
		.map( ( w ) => [ ...w ].map( ( c ) => CODE[ c ] ).filter( Boolean ).join( ' ' ) )
		.filter( Boolean ).join( ' / ' );

}

// '?' for a sign with no letter (a garbled reading)
export function decode( code ) {

	return code.trim().split( /\s*\/\s*/ ).map( ( w ) => w.split( /\s+/ ).filter( Boolean ).map( ( s ) => DECODE[ s ] ?? '?' ).join( '' ) ).join( ' ' );

}

// the lamp's on periods (seconds) for a text at `unit` seconds per unit
export function timeline( text, unit = 0.35 ) {

	const segments = [];
	let t = 0;
	const words = encode( text ).split( ' / ' ).filter( Boolean );
	words.forEach( ( w, wi ) => {

		if ( wi > 0 ) t += 7 * unit;
		w.split( ' ' ).forEach( ( letter, li ) => {

			if ( li > 0 ) t += 3 * unit;
			[ ...letter ].forEach( ( sign, si ) => {

				if ( si > 0 ) t += unit;
				const len = ( sign === '-' ? 3 : 1 ) * unit;
				segments.push( { on: true, start: t, end: t + len } );
				t += len;

			} );

		} );

	} );
	return { segments, duration: t, unit };

}

export function isOn( tl, t ) {

	// (few segments: a linear scan; a binary search if messages grow long)
	for ( const s of tl.segments ) {

		if ( t < s.start ) return false;
		if ( t < s.end ) return true;

	}

	return false;

}
