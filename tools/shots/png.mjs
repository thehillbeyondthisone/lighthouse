import { writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// minimal RGBA8 PNG writer
export function writePNG( path, width, height, rgba ) {

	const crcTable = new Int32Array( 256 ).map( ( _, n ) => {

		let c = n;
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		return c;

	} );
	const crc = ( buf ) => {

		let c = - 1;
		for ( const b of buf ) c = crcTable[ ( c ^ b ) & 255 ] ^ ( c >>> 8 );
		return ( c ^ - 1 ) >>> 0;

	};
	const chunk = ( type, data ) => {

		const out = Buffer.alloc( 12 + data.length );
		out.writeUInt32BE( data.length, 0 );
		out.write( type, 4, 'ascii' );
		data.copy( out, 8 );
		out.writeUInt32BE( crc( out.subarray( 4, 8 + data.length ) ), 8 + data.length );
		return out;

	};
	const raw = Buffer.alloc( ( width * 4 + 1 ) * height );
	for ( let y = 0; y < height; y ++ ) {

		raw[ y * ( width * 4 + 1 ) ] = 0;
		Buffer.from( rgba.buffer, rgba.byteOffset + y * width * 4, width * 4 ).copy( raw, y * ( width * 4 + 1 ) + 1 );

	}

	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( width, 0 );
	ihdr.writeUInt32BE( height, 4 );
	ihdr[ 8 ] = 8; ihdr[ 9 ] = 6;
	writeFileSync( path, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );

}

// minimal PNG reader: 8-bit RGB / RGBA, non-interlaced (what writePNG and browsers write) -> { width, height, rgba }
export function readPNG( buf ) {

	if ( buf.readUInt32BE( 0 ) !== 0x89504e47 ) throw new Error( 'not a PNG' );
	let o = 8, width = 0, height = 0, type = 0;
	const idat = [];
	while ( o < buf.length ) {

		const len = buf.readUInt32BE( o ), kind = buf.toString( 'ascii', o + 4, o + 8 );
		const data = buf.subarray( o + 8, o + 8 + len );
		if ( kind === 'IHDR' ) {

			width = data.readUInt32BE( 0 ); height = data.readUInt32BE( 4 ); type = data[ 9 ];
			if ( data[ 8 ] !== 8 || data[ 12 ] !== 0 || ( type !== 2 && type !== 6 ) ) throw new Error( 'readPNG: 8-bit RGB / RGBA, non-interlaced only' );

		} else if ( kind === 'IDAT' ) idat.push( data );
		else if ( kind === 'IEND' ) break;
		o += 12 + len;

	}

	const bpp = type === 6 ? 4 : 3, stride = width * bpp;
	const raw = inflateSync( Buffer.concat( idat ) );
	const px = new Uint8Array( stride * height );
	for ( let y = 0; y < height; y ++ ) {

		const f = raw[ y * ( stride + 1 ) ], row = raw.subarray( y * ( stride + 1 ) + 1, ( y + 1 ) * ( stride + 1 ) );
		const cur = y * stride, prev = cur - stride;
		for ( let x = 0; x < stride; x ++ ) {

			const a = x >= bpp ? px[ cur + x - bpp ] : 0, b = y ? px[ prev + x ] : 0, c = x >= bpp && y ? px[ prev + x - bpp ] : 0;
			let p = row[ x ];
			if ( f === 1 ) p += a;
			else if ( f === 2 ) p += b;
			else if ( f === 3 ) p += ( a + b ) >> 1;
			else if ( f === 4 ) {

				const pa = Math.abs( b - c ), pb = Math.abs( a - c ), pc = Math.abs( a + b - 2 * c );
				p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;

			}

			px[ cur + x ] = p & 255;

		}

	}

	if ( bpp === 4 ) return { width, height, rgba: px };
	const rgba = new Uint8Array( width * height * 4 );
	for ( let i = 0; i < width * height; i ++ ) {

		rgba.set( px.subarray( i * 3, i * 3 + 3 ), i * 4 );
		rgba[ i * 4 + 3 ] = 255;

	}

	return { width, height, rgba };

}
