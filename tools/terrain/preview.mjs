// Quick look at the Flannan island and the light station without a GPU: builds the terrain and the
// station exactly as the app does (FlannanTerrain.js, Station.js), then rasterizes the builder's batches
// and the nearby ground in software (flat Lambert, z-buffer, material tints; wood / iron / glass in fixed
// colours). Seconds instead of the minutes of `npm run shots`: for checking geometry, not the look.
//
//   node tools/terrain/preview.mjs --views=fStation,fYard [--w=900 --h=600] [--out=shots]
//   node tools/terrain/preview.mjs --view='{"p":[-40,95,55],"at":[-5,86,5],"fov":55,"ground":90}'
//
// Views are the review cameras of src/core/DebugViews.js (or JSON: p, at, fov in degrees, ground: the
// half-size of the terrain drawn around the target in metres).

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePNG } from '../shots/png.mjs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const DATA = join( ROOT, 'public/terrain/flannan/' );
const args = Object.fromEntries( process.argv.slice( 2 ).map( ( a ) => a.replace( /^--/, '' ).split( /=(.*)/s ) ) );
const W = Number( args.w || 900 ), H = Number( args.h || 600 ), OUT = args.out || join( ROOT, 'shots' );

// loadFlannanData fetches the baked files: serve them from disk
globalThis.fetch = async ( u ) => new Response( readFileSync( DATA + String( u ).split( '/' ).pop() ) );
const { loadFlannanData } = await import( '../../src/world/flannan/FlannanData.js' );
const { FlannanTerrainData } = await import( '../../src/world/flannan/FlannanTerrain.js' );
const { buildStation } = await import( '../../src/world/flannan/Station.js' );
const { Builder } = await import( '../../src/world/village/GeoBuilder.js' );
const { InstancedProps, Rand } = await import( '../../src/world/Props.js' );
const { Colliders } = await import( '../../src/world/Colliders.js' );
const { mulberry32 } = await import( '../../src/util/Noise.js' );
const { VIEWS } = await import( '../../src/core/DebugViews.js' );

const F = await loadFlannanData( DATA );
const T = new FlannanTerrainData( F.grids.island );
const B = new Builder(), colliders = new Colliders(), lights = [];
const village = { buildings: [], footprints: [] };
const t0 = performance.now();
buildStation( { B, terrain: T, colliders, rand: new Rand( mulberry32( 90210 ) ), lights, inst: new InstancedProps( B ), checks: [] }, village );
let tris = 0;
for ( const k in B.batches ) tris += B.batches[ k ].triangles;
console.log( `station: ${ ( performance.now() - t0 ).toFixed( 0 ) } ms, ${ tris } triangles, ${ colliders.boxes.length } boxes, ${ colliders.cylinders.length } cylinders, ${ lights.length } lights` );

const views = args.view ? [ [ 'view', JSON.parse( args.view ) ] ] : ( args.views || 'fStation' ).split( ',' ).map( ( n ) => {

	const v = VIEWS[ n ];
	if ( ! v ) throw new Error( 'unknown view ' + n );
	// a target 50 m along the view direction
	const at = v.at || [ v.p[ 0 ] - Math.sin( v.yaw ) * Math.cos( v.pitch ) * 50, v.p[ 1 ] + Math.sin( v.pitch ) * 50, v.p[ 2 ] - Math.cos( v.yaw ) * Math.cos( v.pitch ) * 50 ];
	return [ n, { p: v.p, at } ];

} );

const FIXED = { wood: [ 0.55, 0.45, 0.35 ], hard: [ 0.12, 0.12, 0.12 ], glass: [ 0.1, 0.15, 0.2 ], rope: [ 0.6, 0.5, 0.35 ] };
const norm = ( v ) => {

	const l = Math.hypot( ...v );
	return v.map( ( x ) => x / l );

};

const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
const sun = norm( [ 0.4, 0.55, 0.5 ] );
const toSRGB = ( c ) => Math.round( 255 * Math.min( 1, Math.pow( Math.max( 0, c ), 1 / 2.2 ) ) );
mkdirSync( OUT, { recursive: true } );

for ( const [ name, v ] of views ) {

	const eye = v.p, at = v.at, fov = ( v.fov || 55 ) * Math.PI / 180;
	const f = norm( [ at[ 0 ] - eye[ 0 ], at[ 1 ] - eye[ 1 ], at[ 2 ] - eye[ 2 ] ] ), r = norm( cross( f, [ 0, 1, 0 ] ) ), u = cross( r, f );
	const fl = ( H / 2 ) / Math.tan( fov / 2 );
	const img = new Float32Array( W * H * 3 ), zb = new Float32Array( W * H ).fill( Infinity );
	for ( let k = 0; k < W * H; k ++ ) img.set( [ 0.55, 0.62, 0.7 ], k * 3 );
	const proj = ( p ) => {

		const d = [ p[ 0 ] - eye[ 0 ], p[ 1 ] - eye[ 1 ], p[ 2 ] - eye[ 2 ] ];
		const z = d[ 0 ] * f[ 0 ] + d[ 1 ] * f[ 1 ] + d[ 2 ] * f[ 2 ];
		return [ W / 2 + ( d[ 0 ] * r[ 0 ] + d[ 1 ] * r[ 1 ] + d[ 2 ] * r[ 2 ] ) * fl / z, H / 2 - ( d[ 0 ] * u[ 0 ] + d[ 1 ] * u[ 1 ] + d[ 2 ] * u[ 2 ] ) * fl / z, z ];

	};

	const tri = ( a, b, c, col ) => {

		const A = proj( a ), P1 = proj( b ), P2 = proj( c );
		if ( A[ 2 ] < 0.3 || P1[ 2 ] < 0.3 || P2[ 2 ] < 0.3 ) return;
		const n = norm( cross( [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ], [ c[ 0 ] - a[ 0 ], c[ 1 ] - a[ 1 ], c[ 2 ] - a[ 2 ] ] ) );
		if ( ! Number.isFinite( n[ 0 ] ) ) return;
		const lam = 0.35 + 0.65 * Math.abs( n[ 0 ] * sun[ 0 ] + n[ 1 ] * sun[ 1 ] + n[ 2 ] * sun[ 2 ] );
		const area = ( P1[ 0 ] - A[ 0 ] ) * ( P2[ 1 ] - A[ 1 ] ) - ( P1[ 1 ] - A[ 1 ] ) * ( P2[ 0 ] - A[ 0 ] );
		if ( Math.abs( area ) < 1e-9 ) return;
		const x0 = Math.max( 0, Math.floor( Math.min( A[ 0 ], P1[ 0 ], P2[ 0 ] ) ) ), x1 = Math.min( W - 1, Math.ceil( Math.max( A[ 0 ], P1[ 0 ], P2[ 0 ] ) ) );
		const y0 = Math.max( 0, Math.floor( Math.min( A[ 1 ], P1[ 1 ], P2[ 1 ] ) ) ), y1 = Math.min( H - 1, Math.ceil( Math.max( A[ 1 ], P1[ 1 ], P2[ 1 ] ) ) );
		for ( let y = y0; y <= y1; y ++ ) for ( let x = x0; x <= x1; x ++ ) {

			const px = x + 0.5, py = y + 0.5;
			const w0 = ( ( P1[ 0 ] - px ) * ( P2[ 1 ] - py ) - ( P1[ 1 ] - py ) * ( P2[ 0 ] - px ) ) / area;
			const w1 = ( ( P2[ 0 ] - px ) * ( A[ 1 ] - py ) - ( P2[ 1 ] - py ) * ( A[ 0 ] - px ) ) / area;
			const w2 = 1 - w0 - w1;
			if ( w0 < 0 || w1 < 0 || w2 < 0 ) continue;
			const z = 1 / ( w0 / A[ 2 ] + w1 / P1[ 2 ] + w2 / P2[ 2 ] ), k = y * W + x;
			if ( z >= zb[ k ] ) continue;
			zb[ k ] = z;
			img.set( [ col[ 0 ] * lam, col[ 1 ] * lam, col[ 2 ] * lam ], k * 3 );

		}

	};

	// the ground around the target: turf, rock, worn paths, the sea
	const R = v.ground || 120, st = v.step || 1;
	const h = ( x, z ) => Math.max( T.heightAt( x, z ), 0 );
	for ( let z = at[ 2 ] - R; z < at[ 2 ] + R; z += st ) for ( let x = at[ 0 ] - R; x < at[ 0 ] + R; x += st ) {

		const k = Math.round( z - T.origin - 0.5 ) * T.res + Math.round( x - T.origin - 0.5 );
		const rock = T.rock[ k ] || 0, path = ( T.path[ k ] || 0 ) / 255, sea = T.heightAt( x, z ) <= 0;
		let c = sea ? [ 0.08, 0.14, 0.2 ] : [ 0.28 + 0.12 * rock, 0.33 - 0.05 * rock, 0.18 + 0.1 * rock ];
		if ( ! sea && path > 0.3 ) c = [ 0.38, 0.34, 0.27 ];
		const p00 = [ x, h( x, z ), z ], p10 = [ x + st, h( x + st, z ), z ], p01 = [ x, h( x, z + st ), z + st ], p11 = [ x + st, h( x + st, z + st ), z + st ];
		tri( p00, p01, p10, c );
		tri( p10, p01, p11, c );

	}

	for ( const key in B.batches ) {

		const b = B.batches[ key ], P = b.pos, I = b.idx, Tn = b.tint;
		for ( let t = 0; t < I.length; t += 3 ) {

			const [ ia, ib, ic ] = [ I[ t ], I[ t + 1 ], I[ t + 2 ] ];
			const col = FIXED[ key ] || [ Tn[ ia * 3 ], Tn[ ia * 3 + 1 ], Tn[ ia * 3 + 2 ] ];
			tri( [ P[ ia * 3 ], P[ ia * 3 + 1 ], P[ ia * 3 + 2 ] ], [ P[ ib * 3 ], P[ ib * 3 + 1 ], P[ ib * 3 + 2 ] ], [ P[ ic * 3 ], P[ ic * 3 + 1 ], P[ ic * 3 + 2 ] ], col );

		}

	}

	const out = new Uint8Array( W * H * 4 );
	for ( let k = 0; k < W * H; k ++ ) out.set( [ toSRGB( img[ k * 3 ] ), toSRGB( img[ k * 3 + 1 ] ), toSRGB( img[ k * 3 + 2 ] ), 255 ], k * 4 );
	const file = join( OUT, `preview-${ name }.png` );
	writePNG( file, W, H, out );
	console.log( 'wrote', file );

}
