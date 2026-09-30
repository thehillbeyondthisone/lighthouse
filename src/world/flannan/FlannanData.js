// The baked terrain of the Flannan Isles and the coasts seen from them (public/terrain/flannan, made
// by tools/terrain/flannan.mjs from the Copernicus 30 m DEM): grids in the engine's frame, metres
// around the Flannan light (x east, z south, y up from sea level).
//
//   const F = await loadFlannanData();
//   F.grids.island   { x0, z0, dx, nx, nz, heights: Float32Array, at( x, z ) }   Eilean Mòr, Eilean Tighe, seabed
//   F.grids.flannans / hebrides / uig / stkilda                                     land only (0 over the sea)
//   F.places.gallanHead { x, z }

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'terrain/flannan/';

async function inflate( buffer ) {

	const stream = new Blob( [ buffer ] ).stream().pipeThrough( new DecompressionStream( 'deflate' ) );
	return new Response( stream ).arrayBuffer();

}

// bilinear height at local ( x, z ); `outside` beyond the grid
function sampler( g, outside ) {

	return ( x, z ) => {

		const fx = ( x - g.x0 ) / g.dx, fz = ( z - g.z0 ) / g.dx;
		if ( fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1 ) return outside;
		const i = Math.min( Math.floor( fx ), g.nx - 2 ), j = Math.min( Math.floor( fz ), g.nz - 2 );
		const tx = fx - i, tz = fz - j, H = g.heights, k = j * g.nx + i;
		return ( H[ k ] * ( 1 - tx ) + H[ k + 1 ] * tx ) * ( 1 - tz ) + ( H[ k + g.nx ] * ( 1 - tx ) + H[ k + g.nx + 1 ] * tx ) * tz;

	};

}

export async function loadFlannanData( base = BASE ) {

	const meta = await ( await fetch( base + 'flannan.json' ) ).json();
	const grids = {};
	await Promise.all( meta.grids.map( async ( g ) => {

		const r = await fetch( base + g.file );
		if ( ! r.ok ) throw new Error( 'Flannan terrain: ' + g.file + ' ' + r.status );
		const raw = await inflate( await r.arrayBuffer() );
		const q = g.format === 'int16' ? new Int16Array( raw ) : new Uint8Array( raw );
		const heights = new Float32Array( q.length );
		for ( let i = 0; i < q.length; i ++ ) heights[ i ] = q[ i ] * g.step;
		const grid = { ...g, heights };
		grid.at = sampler( grid, g.name === 'island' ? - 60 : 0 );
		grids[ g.name ] = grid;

	} ) );
	return { meta, grids, places: meta.places };

}
