// Minimal reader for the Copernicus DEM GLO-30 Cloud Optimized GeoTIFFs (float32, DEFLATE with the
// floating-point predictor, 1024 px tiles, the full-resolution image only), plus bilinear sampling.
//
//   const g = readCOG( 'Copernicus_DSM_COG_10_N58_00_W008_00_DEM.tif' );
//   const h = sampler( [ g, ... ] )( lat, lon ); // m above the geoid, 0 over the sea

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readCOG( path ) {

	const b = readFileSync( path );
	if ( b.toString( 'ascii', 0, 2 ) !== 'II' ) throw new Error( path + ': little-endian TIFF expected' );
	const u16 = ( o ) => b.readUInt16LE( o ), u32 = ( o ) => b.readUInt32LE( o );
	const ifd = u32( 4 ), count = u16( ifd ), T = {};
	const SIZE = { 3: 2, 4: 4, 12: 8 };
	for ( let i = 0; i < count; i ++ ) {

		const e = ifd + 2 + i * 12, tag = u16( e ), type = u16( e + 2 ), n = u32( e + 4 );
		const at = ( SIZE[ type ] || 1 ) * n <= 4 ? e + 8 : u32( e + 8 );
		const v = [];
		for ( let k = 0; k < n; k ++ ) v.push( type === 3 ? u16( at + k * 2 ) : type === 4 ? u32( at + k * 4 ) : type === 12 ? b.readDoubleLE( at + k * 8 ) : 0 );
		T[ tag ] = v;

	}

	const W = T[ 256 ][ 0 ], H = T[ 257 ][ 0 ], tw = T[ 322 ][ 0 ], th = T[ 323 ][ 0 ];
	if ( T[ 259 ][ 0 ] !== 8 || T[ 317 ][ 0 ] !== 3 || T[ 258 ][ 0 ] !== 32 ) throw new Error( path + ': float32 + DEFLATE + floating-point predictor expected' );
	const [ sx, sy ] = T[ 33550 ]; // degrees per pixel
	const lon0 = T[ 33922 ][ 3 ], lat0 = T[ 33922 ][ 4 ]; // corner of pixel ( 0, 0 )
	const data = new Float32Array( W * H );
	const across = Math.ceil( W / tw );
	const view = new DataView( new ArrayBuffer( 4 ) );
	T[ 324 ].forEach( ( offset, t ) => {

		const raw = inflateSync( b.subarray( offset, offset + T[ 325 ][ t ] ) );
		const x0 = ( t % across ) * tw, y0 = Math.floor( t / across ) * th, rowBytes = tw * 4;
		for ( let r = 0; r < th && y0 + r < H; r ++ ) {

			// floating-point predictor: bytes differenced along the row, then split by significance
			const row = raw.subarray( r * rowBytes, ( r + 1 ) * rowBytes );
			for ( let i = 1; i < rowBytes; i ++ ) row[ i ] = ( row[ i ] + row[ i - 1 ] ) & 255;
			for ( let k = 0; k < tw && x0 + k < W; k ++ ) {

				for ( let byte = 0; byte < 4; byte ++ ) view.setUint8( byte, row[ byte * tw + k ] );
				data[ ( y0 + r ) * W + x0 + k ] = view.getFloat32( 0, false );

			}

		}

	} );
	return { W, H, sx, sy, lon0, lat0, data };

}

// bilinear height at lat / lon from the first grid that covers it (pixel centres at
// lon0 + ( i + 0.5 ) sx, lat0 - ( j + 0.5 ) sy); null outside every grid
export function sampler( grids ) {

	return ( lat, lon ) => {

		for ( const g of grids ) {

			const X = ( lon - g.lon0 ) / g.sx - 0.5, Y = ( g.lat0 - lat ) / g.sy - 0.5;
			if ( X < - 0.5 || Y < - 0.5 || X > g.W - 0.5 || Y > g.H - 0.5 ) continue;
			const cx = Math.min( Math.max( X, 0 ), g.W - 1 ), cy = Math.min( Math.max( Y, 0 ), g.H - 1 );
			const x0 = Math.min( Math.floor( cx ), g.W - 2 ), y0 = Math.min( Math.floor( cy ), g.H - 2 );
			const fx = cx - x0, fy = cy - y0, d = g.data, i = y0 * g.W + x0;
			return ( d[ i ] * ( 1 - fx ) + d[ i + 1 ] * fx ) * ( 1 - fy ) + ( d[ i + g.W ] * ( 1 - fx ) + d[ i + g.W + 1 ] * fx ) * fy;

		}

		return null;

	};

}
