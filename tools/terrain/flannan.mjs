// Bakes the real terrain of the Flannan Isles, and of the coasts seen from them, into
// public/terrain/flannan/ (docs/PLAN.md §5.2). The land comes from the Copernicus DEM GLO-30
// (30 m), the seabed around the islands from the AWS Terrain Tiles (terrarium; GEBCO under the
// sea). Everything is in the engine's frame: metres around the Flannan light (58°17′17″N 7°35′17″W),
// x east, z south, y up from sea level, on an azimuthal equidistant projection centred on the light
// (true bearings and distances from it).
//
//   node tools/terrain/flannan.mjs        downloads ~25 MB into tools/terrain/.cache (git-ignored)
//
// Writes flannan.json (the grids, where they sit, the places) and one deflated binary per grid:
//   island    2048 m around the light at 8 m, Int16 decimetres: Eilean Mòr, Eilean Tighe and the seabed
//             (src/world/flannan/FlannanTerrain.js upsamples it to 1 m and cuts the cliffs)
//   flannans  the other Seven Hunters, 9 km around the light at 20 m, Uint8 in 0.5 m steps
//   hebrides  Lewis and Harris, 18-98 km east, 150 m, Uint8 in 4 m steps
//   stkilda   St Kilda, 71-78 km south-west (Boreray, Hirta), 40 m, Uint8 in 2 m steps
//   uig       the Uig coast of Lewis facing the Flannans (Gallan Head, 33 km), 30 m, Uint8 in 2.5 m steps
// The land grids hold 0 over the sea. Copernicus DEM: © DLR e.V. 2010-2014 and © Airbus Defence and
// Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCOG, sampler } from './cog.mjs';
import { readPNG } from '../shots/png.mjs';

const HERE = dirname( fileURLToPath( import.meta.url ) );
const CACHE = join( HERE, '.cache' );
const OUT = join( HERE, '../../public/terrain/flannan' );
const DEG = Math.PI / 180, R = 6371000;
const LIGHT = { lat: 58 + 17 / 60 + 17 / 3600, lon: - ( 7 + 35 / 60 + 17 / 3600 ) };

// local metres (x east, z south) -> degrees, and back (azimuthal equidistant on a sphere)
function toLatLon( x, z ) {

	const d = Math.hypot( x, z ) / R, th = Math.atan2( x, - z );
	const p1 = LIGHT.lat * DEG, l1 = LIGHT.lon * DEG;
	const p2 = Math.asin( Math.sin( p1 ) * Math.cos( d ) + Math.cos( p1 ) * Math.sin( d ) * Math.cos( th ) );
	const l2 = l1 + Math.atan2( Math.sin( th ) * Math.sin( d ) * Math.cos( p1 ), Math.cos( d ) - Math.sin( p1 ) * Math.sin( p2 ) );
	return [ p2 / DEG, l2 / DEG ];

}

function toLocal( lat, lon ) {

	const p1 = LIGHT.lat * DEG, p2 = lat * DEG, dl = ( lon - LIGHT.lon ) * DEG;
	const a = Math.sin( ( p2 - p1 ) / 2 ) ** 2 + Math.cos( p1 ) * Math.cos( p2 ) * Math.sin( dl / 2 ) ** 2;
	const d = 2 * R * Math.asin( Math.sqrt( a ) );
	const th = Math.atan2( Math.sin( dl ) * Math.cos( p2 ), Math.cos( p1 ) * Math.sin( p2 ) - Math.sin( p1 ) * Math.cos( p2 ) * Math.cos( dl ) );
	return [ d * Math.sin( th ), - d * Math.cos( th ) ];

}

async function download( url, file ) {

	if ( existsSync( file ) ) return file;
	const r = await fetch( url );
	if ( ! r.ok ) throw new Error( url + ': ' + r.status );
	writeFileSync( file, Buffer.from( await r.arrayBuffer() ) );
	console.log( 'downloaded', url.split( '/' ).pop() );
	return file;

}

// ---- land: Copernicus GLO-30 (1 x 1 degree tiles)
async function copernicus( tiles ) {

	const grids = [];
	for ( const t of tiles ) {

		const name = `Copernicus_DSM_COG_10_${ t }_DEM`;
		grids.push( readCOG( await download( `https://copernicus-dem-30m.s3.amazonaws.com/${ name }/${ name }.tif`, join( CACHE, name + '.tif' ) ) ) );

	}

	return sampler( grids );

}

// ---- seabed: terrarium tiles (height = r * 256 + g + b / 256 - 32768)
async function terrarium( z, lat0, lon0, lat1, lon1 ) {

	const tx = ( lon ) => ( lon + 180 ) / 360 * 2 ** z;
	const ty = ( lat ) => ( 1 - Math.log( Math.tan( lat * DEG ) + 1 / Math.cos( lat * DEG ) ) / Math.PI ) / 2 * 2 ** z;
	const tiles = new Map();
	for ( let y = Math.floor( ty( lat1 ) ); y <= Math.floor( ty( lat0 ) ); y ++ ) for ( let x = Math.floor( tx( lon0 ) ); x <= Math.floor( tx( lon1 ) ); x ++ ) {

		const f = await download( `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ z }/${ x }/${ y }.png`, join( CACHE, `terrarium_${ z }_${ x }_${ y }.png` ) );
		const { rgba } = readPNG( readFileSync( f ) );
		const h = new Float32Array( 256 * 256 );
		for ( let i = 0; i < h.length; i ++ ) h[ i ] = rgba[ i * 4 ] * 256 + rgba[ i * 4 + 1 ] + rgba[ i * 4 + 2 ] / 256 - 32768;
		tiles.set( x + ',' + y, h );

	}

	return ( lat, lon ) => {

		const X = tx( lon ) * 256 - 0.5, Y = ty( lat ) * 256 - 0.5;
		const at = ( px, py ) => tiles.get( Math.floor( px / 256 ) + ',' + Math.floor( py / 256 ) )[ ( py & 255 ) * 256 + ( px & 255 ) ];
		const x0 = Math.floor( X ), y0 = Math.floor( Y ), fx = X - x0, fy = Y - y0;
		return ( at( x0, y0 ) * ( 1 - fx ) + at( x0 + 1, y0 ) * fx ) * ( 1 - fy ) + ( at( x0, y0 + 1 ) * ( 1 - fx ) + at( x0 + 1, y0 + 1 ) * fx ) * fy;

	};

}

// a grid of samples at local ( x0 + i dx, z0 + j dx ), quantized and deflated
function bake( name, { x0, z0, dx, nx, nz, format, step }, heightAt ) {

	const Arr = format === 'int16' ? Int16Array : Uint8Array, lo = format === 'int16' ? - 32768 : 0, hi = format === 'int16' ? 32767 : 255;
	const q = new Arr( nx * nz );
	let land = 0, max = - Infinity, min = Infinity;
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

		const h = heightAt( x0 + i * dx, z0 + j * dx );
		q[ j * nx + i ] = Math.max( lo, Math.min( hi, Math.round( h / step ) ) );
		if ( h > 0.5 ) land ++;
		max = Math.max( max, h ); min = Math.min( min, h );

	}

	const file = name + '.bin';
	const packed = deflateSync( Buffer.from( q.buffer ), { level: 9 } );
	writeFileSync( join( OUT, file ), packed );
	console.log( `${ name }: ${ nx } x ${ nz } at ${ dx } m, ${ ( land / ( nx * nz ) * 100 ).toFixed( 1 ) }% land, ${ min.toFixed( 1 ) } .. ${ max.toFixed( 1 ) } m, ${ ( packed.length / 1024 ).toFixed( 0 ) } KB` );
	return { name, file, format, step, x0, z0, dx, nx, nz };

}

mkdirSync( CACHE, { recursive: true } );
mkdirSync( OUT, { recursive: true } );
const land = await copernicus( [ 'N58_00_W008_00', 'N58_00_W007_00', 'N57_00_W008_00', 'N57_00_W007_00', 'N57_00_W009_00' ] );
const landAt = ( x, z ) => {

	const [ lat, lon ] = toLatLon( x, z );
	const h = land( lat, lon );
	return h === null || h < 0.5 ? 0 : h;

};

const [ la0, lo0 ] = toLatLon( - 1100, 1100 ), [ la1, lo1 ] = toLatLon( 1100, - 1100 );
const sea = await terrarium( 12, la0, lo0, la1, lo1 );
const islandAt = ( x, z ) => {

	const h = landAt( x, z );
	if ( h > 0 ) return h;
	const [ lat, lon ] = toLatLon( x, z );
	return Math.min( sea( lat, lon ), - 4 ); // (the coarse bathymetry puts land where there is none)

};

const grids = [
	bake( 'island', { x0: - 1020, z0: - 1020, dx: 8, nx: 256, nz: 256, format: 'int16', step: 0.1 }, islandAt ),
	bake( 'flannans', { x0: - 4490, z0: - 4490, dx: 20, nx: 450, nz: 450, format: 'uint8', step: 0.5 }, landAt ),
	bake( 'hebrides', { x0: 18000, z0: - 25000, dx: 150, nx: 534, nz: 754, format: 'uint8', step: 4 }, landAt ),
];
const [ kx, kz ] = toLocal( 57.815, - 8.575 ); // St Kilda (Hirta, Boreray and the stacks)
grids.push( bake( 'stkilda', { x0: Math.round( kx - 3500 ), z0: Math.round( kz - 3500 ), dx: 40, nx: 176, nz: 176, format: 'uint8', step: 2 }, landAt ) );
// the coast of Uig facing the Flannans (Gallan Head to the Uig hills) at the DEM's own 30 m, for the
// telescope; FarShore.js leaves the hebrides grid's cells out where this one is
grids.push( bake( 'uig', { x0: 29000, z0: - 4000, dx: 30, nx: 400, nz: 700, format: 'uint8', step: 2.5 }, landAt ) );

const [ gx, gz ] = toLocal( 58.237972, - 7.032750 ); // Gallan Head (the RAF Aird Uig masts)
const meta = {
	source: 'tools/terrain/flannan.mjs',
	attribution: 'Copernicus DEM GLO-30: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA. Seabed: AWS Terrain Tiles (GEBCO).',
	origin: { lat: LIGHT.lat, lon: LIGHT.lon, note: 'the Flannan light; x east, z south (m), azimuthal equidistant' },
	places: { gallanHead: { x: Math.round( gx ), z: Math.round( gz ), note: 'Gallan Head, Lewis (the Watcher\'s post)' } },
	grids,
};
writeFileSync( join( OUT, 'flannan.json' ), JSON.stringify( meta, null, '\t' ) + '\n' );
console.log( 'Gallan Head at', Math.round( gx ), Math.round( gz ), 'm:', ( Math.hypot( gx, gz ) / 1000 ).toFixed( 1 ), 'km, bearing', ( ( Math.atan2( gx, - gz ) / DEG + 360 ) % 360 ).toFixed( 1 ) );
