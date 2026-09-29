// Compare two PNGs of the same size: prints the largest channel difference, the share of pixels
// that differ and the mean difference, and writes an amplified difference image.
//   node tools/shots/diff.mjs a.png b.png [diff.png]
import { readFileSync } from 'node:fs';
import { readPNG, writePNG } from './png.mjs';

const [ fa, fb, out ] = process.argv.slice( 2 );
if ( ! fa || ! fb ) {

	console.log( 'usage: node tools/shots/diff.mjs a.png b.png [diff.png]' );
	process.exit( 2 );

}

const a = readPNG( readFileSync( fa ) ), b = readPNG( readFileSync( fb ) );
if ( a.width !== b.width || a.height !== b.height ) {

	console.log( `different sizes: ${ a.width }x${ a.height } vs ${ b.width }x${ b.height }` );
	process.exit( 1 );

}

const n = a.width * a.height, d = new Uint8Array( n * 4 );
let max = 0, changed = 0, sum = 0;
for ( let i = 0; i < n; i ++ ) {

	let m = 0;
	for ( let c = 0; c < 3; c ++ ) {

		const v = Math.abs( a.rgba[ i * 4 + c ] - b.rgba[ i * 4 + c ] );
		m = Math.max( m, v );
		sum += v;
		d[ i * 4 + c ] = Math.min( 255, v * 8 );

	}

	d[ i * 4 + 3 ] = 255;
	if ( m > 0 ) changed ++;
	max = Math.max( max, m );

}

console.log( `max ${ max } · changed ${ ( changed / n * 100 ).toFixed( 3 ) }% of pixels · mean ${ ( sum / n / 3 ).toFixed( 4 ) }` );
if ( out ) writePNG( out, a.width, a.height, d );
process.exit( max === 0 ? 0 : 1 );
