import { TerrainData } from '../TerrainData.js';
import { Noise2D, smoothstep, clamp, lerp } from '../../util/Noise.js';
import { upsample2, boxBlur } from '../terrain/TerrainNoise.js';
import { polylineDistance } from '../terrain/IslandShape.js';

// Eilean Mòr and Eilean Tighe from the real 30 m DEM (FlannanData.js grids.island, 8 m), made walkable
// at 1 m: the same grids and queries as TerrainData, filled here.
//
//   1. Catmull-Rom upsample of the DEM to 1 m, the coastline roughened by noise, the land lifted 15 %
//      (the 30 m surface model rounds off the summit: the light's focal plane is 101 m, its tower 23 m,
//      so the ground there is ~80 m, the DEM says ~70)
//   2. distance to the coast on both sides (chamfer transform)
//   3. cliffs: near the coast the land takes the height found a little inland (a max filter) and drops
//      to the sea over a few metres, with rough, ledged faces: the Flannans are sheer on every side
//   4. the landing geos (narrow inlets with a concrete stage at their head, see Station.js) cut into
//      the cliffs where the station's tramways come down
//   5. the seabed: steep off the cliffs, boulders at their foot, then the baked bathymetry, fading to
//      -90 m at the domain's border
//   6. masks: rock on steep ground, outcrops and the seabed; the paths and tramways the station adds
//      (addPath); no sand, seagrass or scarp
//
//   const T = new FlannanTerrainData( flannanData.grids.island );
//   T.landing( 'east' )  -> { x, z, dir: [ dx, dz ], top: { x, z }, stage: { x, z, y } }   (see Station.js)

const LAND_SCALE = 1.15;
const CLIFF_TOP_R = 20; // m: the max filter radius that carries the plateau out to the cliff edge
const COAST_NOISE = 7; // m of height noise at the coast before thresholding (headlands, coves)

// landings: the bearing from the light the tramway leaves on (degrees from north), and the geo cut at
// the coast there. The west landing is the exposed one (docs/PLAN.md §3.7: the rope box 33 m up).
const LANDINGS = {
	east: { bearing: 112, geo: { width: 10, length: 18, wall: 0.6 } },
	west: { bearing: 254, geo: { width: 9, length: 22, wall: 0.7 } },
};

// two-pass chamfer distance (m) from every texel to the nearest texel where `inside` is false
function chamfer( inside, n ) {

	const D = new Float32Array( n * n );
	const BIG = 1e9, A = 1, B = Math.SQRT2;
	for ( let k = 0; k < n * n; k ++ ) D[ k ] = inside[ k ] ? BIG : 0;
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

		const k = j * n + i;
		let d = D[ k ];
		if ( d === 0 ) continue;
		if ( i > 0 ) d = Math.min( d, D[ k - 1 ] + A );
		if ( j > 0 ) {

			d = Math.min( d, D[ k - n ] + A );
			if ( i > 0 ) d = Math.min( d, D[ k - n - 1 ] + B );
			if ( i < n - 1 ) d = Math.min( d, D[ k - n + 1 ] + B );

		}

		D[ k ] = d;

	}

	for ( let j = n - 1; j >= 0; j -- ) for ( let i = n - 1; i >= 0; i -- ) {

		const k = j * n + i;
		let d = D[ k ];
		if ( d === 0 ) continue;
		if ( i < n - 1 ) d = Math.min( d, D[ k + 1 ] + A );
		if ( j < n - 1 ) {

			d = Math.min( d, D[ k + n ] + A );
			if ( i < n - 1 ) d = Math.min( d, D[ k + n + 1 ] + B );
			if ( i > 0 ) d = Math.min( d, D[ k + n - 1 ] + B );

		}

		D[ k ] = d;

	}

	return D;

}

// separable running max over a (2r + 1)^2 window (van Herk / Gil-Werman)
function maxFilter( src, n, r ) {

	const w = 2 * r + 1, tmp = new Float32Array( n * n ), out = new Float32Array( n * n );
	const g = new Float32Array( n + w ), h = new Float32Array( n + w );
	const pass = ( read, write ) => {

		for ( let line = 0; line < n; line ++ ) {

			// g: prefix max within blocks of w, h: suffix max within blocks, over the line padded by r
			const len = n + 2 * r;
			for ( let t = 0; t < len; t ++ ) {

				const v = read( line, Math.min( n - 1, Math.max( 0, t - r ) ) );
				g[ t ] = t % w === 0 ? v : Math.max( g[ t - 1 ], v );

			}

			for ( let t = len - 1; t >= 0; t -- ) {

				const v = read( line, Math.min( n - 1, Math.max( 0, t - r ) ) );
				h[ t ] = t === len - 1 || ( t + 1 ) % w === 0 ? v : Math.max( h[ t + 1 ], v );

			}

			for ( let i = 0; i < n; i ++ ) write( line, i, Math.max( h[ i ], g[ i + 2 * r ] ) );

		}

	};

	pass( ( j, i ) => src[ j * n + i ], ( j, i, v ) => { tmp[ j * n + i ] = v; } );
	pass( ( i, j ) => tmp[ j * n + i ], ( i, j, v ) => { out[ j * n + i ] = v; } );
	return out;

}

export class FlannanTerrainData extends TerrainData {

	constructor( island, seed = 11 ) {

		super( seed, { generate: false } );
		this.island = island;
		this.paths = []; // { pts: [ [ x, z ], ... ], w } (addPath)
		this.landings = {};
		this.noise = new Noise2D( seed );
		this.noise2 = new Noise2D( seed * 31 + 5 );
		const t0 = performance.now();
		this.generate();
		this.buildMinMax();
		this.timings.total = performance.now() - t0;

	}

	generate() {

		const n = this.res, texel = this.texel, origin = this.origin, N = this.noise, N2 = this.noise2;
		const X = ( i ) => origin + ( i + 0.5 ) * texel;
		const g = this.island;
		if ( g.nx !== 256 || g.dx * g.nx !== this.size ) throw new Error( 'FlannanTerrainData: a 256 x 256 island grid over the terrain domain expected' );

		// ---- 1. the DEM at 1 m, coastline roughened
		let H0 = g.heights;
		for ( let m = g.nx; m < n; m *= 2 ) H0 = upsample2( H0, m, true );
		const land = new Uint8Array( n * n );
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

			const k = j * n + i, x = X( i ), z = X( j );
			const h = H0[ k ];
			// near the coast (|h| small) the threshold wanders: headlands, coves, skerries
			const w = Math.abs( h ) < 25 ? smoothstep( 25, 0, Math.abs( h ) ) * COAST_NOISE * ( N.fbm( x / 45, z / 45, 3 ) * 0.75 + N2.noise( x / 13, z / 13 ) * 0.35 ) : 0;
			land[ k ] = h + w > 0.5 ? 1 : 0;

		}

		// ---- 2. distances to the coast
		const dLand = chamfer( land, n ); // on land: distance to the sea
		const sea = new Uint8Array( n * n );
		for ( let k = 0; k < n * n; k ++ ) sea[ k ] = 1 - land[ k ];
		const dSea = chamfer( sea, n ); // at sea: distance to land

		// ---- the landing sites: where a ray from the light at each landing's bearing reaches the sea.
		// Around them the coast keeps the DEM's steep slope instead of a sheer face (a landing is made
		// where the cliff can be climbed): the flight of steps follows it (see _landing)
		const idx = ( x, z ) => {

			const i = Math.round( ( x - origin ) / texel - 0.5 ), j = Math.round( ( z - origin ) / texel - 0.5 );
			return i < 0 || j < 0 || i >= n || j >= n ? - 1 : j * n + i;

		};

		const sites = [];
		for ( const name in LANDINGS ) {

			const L = LANDINGS[ name ], a = L.bearing * Math.PI / 180, dx = Math.sin( a ), dz = - Math.cos( a );
			let r = 30;
			while ( r < 900 && land[ idx( dx * r, dz * r ) ] ) r += 1;
			const coast = { x: dx * r, z: dz * r };
			const head = { x: coast.x - dx * L.geo.length, z: coast.z - dz * L.geo.length };
			sites.push( { name, L, dx, dz, coast, head, axis: [ [ coast.x + dx * 10, coast.z + dz * 10 ], [ head.x - dx * 90, head.z - dz * 90 ] ] } );

		}

		// ---- 3. cliffs: the plateau carried out to the edge, then a sheer, rough face
		const lifted = new Float32Array( n * n );
		for ( let k = 0; k < n * n; k ++ ) lifted[ k ] = Math.max( H0[ k ], 0 ) * LAND_SCALE;
		const top = maxFilter( lifted, n, CLIFF_TOP_R );
		const H = this.heights, rock = this.rock;
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

			const k = j * n + i;
			if ( ! land[ k ] ) continue;
			const x = X( i ), z = X( j ), d = dLand[ k ];
			let soft = 0;
			for ( const S of sites ) soft = Math.max( soft, smoothstep( 55, 22, polylineDistance( S.axis, x, z )[ 0 ] ) );
			// the plateau: the lifted DEM inland, the nearby maximum toward the edge (no rounded shoulders)
			const plateau = lerp( lifted[ k ], top[ k ], smoothstep( 45, 8, d ) * ( 1 - soft ) );
			// the face: 2-9 m wide, stepped by ledges; at a landing a steep slope ~70 m wide
			const faceW = lerp( 2 + 7 * ( N.noise( x / 70 + 3.1, z / 70 ) * 0.5 + 0.5 ), 70, soft );
			const ledge = Math.floor( ( d / faceW ) * 4 + N2.noise( x / 7, z / 7 ) * 0.6 ) / 4;
			const f = smoothstep( 0, 1, clamp( lerp( d / faceW, ledge, 0.35 * ( 1 - soft ) ), 0, 1 ) );
			let h = 1.5 + ( plateau - 1.5 ) * f;
			// rough faces, low knolls and outcrops on top
			const face = smoothstep( 0.05, 0.4, f ) * smoothstep( 1, 0.6, f ) * ( 1 - 0.7 * soft );
			h += face * N2.fbm( x / 6, z / 6, 3 ) * 2.5;
			h += f * ( N.fbm( x / 60, z / 60, 3 ) * 1.4 + Math.max( 0, N.ridged( x / 22, z / 22, 3 ) - 0.45 ) * 3.0 );
			H[ k ] = h;
			// rock: the faces, and a few outcrops breaking through the turf (knolls, the cliff edge)
			const knoll = N.fbm( x / 55 + 9.3, z / 55 - 4.1, 3 ) + N2.noise( x / 11, z / 11 ) * 0.25;
			const out = smoothstep( 0.42, 0.62, knoll ) * 0.8 + smoothstep( 14, 4, d ) * 0.35 * ( 1 - soft );
			rock[ k ] = Math.max( ( 1 - smoothstep( 0.7, 0.95, f ) ) * ( 1 - 0.5 * soft ), clamp( out, 0, 0.9 ) );

		}

		// ---- 5. the seabed
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

			const k = j * n + i;
			if ( land[ k ] ) continue;
			const x = X( i ), z = X( j ), d = dSea[ k ];
			// sheer below the waterline too, then the shelf (40-60 m around the Flannans); boulders at the
			// foot of the cliffs (the coarse bathymetry of the bake is too blocky this close in)
			const shelf = - 6 - 26 * smoothstep( 0, 90, d ) - 16 * smoothstep( 90, 700, d ) - 8 * ( N.fbm( x / 400, z / 400, 2 ) * 0.5 + 0.5 );
			let h = lerp( lerp( - 1, shelf, smoothstep( 0, 12, d ) ), shelf, 0.5 ) + N.fbm( x / 25, z / 25, 3 ) * 2.5 * smoothstep( 0, 30, d );
			const boulders = smoothstep( 40, 5, d ) * smoothstep( 0.2, 0.6, N2.noise( x / 4, z / 4 ) );
			h += boulders * 1.5;
			// the domain's border: the open Atlantic (as TerrainData._fadeBorder)
			const edge = Math.min( i, j, n - 1 - i, n - 1 - j ) * texel;
			H[ k ] = lerp( - 90, h, smoothstep( 0, 180, edge ) );
			rock[ k ] = 0.6 + 0.4 * smoothstep( 0.1, 0.5, N.noise( x / 30, z / 30 ) );
			this.rubble[ k ] = Math.round( 255 * clamp( boulders + smoothstep( 25, 0, d ) * 0.5, 0, 1 ) );

		}

		// ---- the coast distance, signed (> 0 water, < 0 land), for coastDistance()
		this.coast = new Int16Array( n * n );
		for ( let k = 0; k < n * n; k ++ ) this.coast[ k ] = Math.round( clamp( land[ k ] ? - dLand[ k ] : dSea[ k ], - 3000, 3000 ) * 10 );

		// ---- 4. the landing geos and their flights of steps
		for ( const S of sites ) this._landing( S, idx );

		// the source DEM and the intermediates are not kept
		this.island = null;

	}

	// a geo cut back into the coast along the landing's axis (its head is the landing stage), and the
	// flight of steps from the stage up the slope to the plateau: the ground along it graded to an
	// even climb (Station.js lays the steps on it)
	_landing( S, idx ) {

		const H = this.heights;
		const { name, L, dx, dz, coast, head } = S;
		const { width, length, wall } = L.geo;
		const px = - dz, pz = dx; // across
		const R = Math.ceil( width + 12 );
		for ( let t = - 3; t <= length + 12; t += 0.5 ) for ( let s = - R; s <= R; s += 0.5 ) {

			const x = head.x + dx * t + px * s, z = head.z + dz * t + pz * s;
			const k = idx( x, z );
			if ( k < 0 ) continue;
			const along = clamp( t / length, 0, 1 );
			const half = width / 2 * ( 0.75 + 0.25 * along ) * ( t < 0 ? smoothstep( - 3, 0, t ) : 1 );
			const inside = smoothstep( half + wall * 4, half, Math.abs( s ) + this.noise2.noise( x / 3, z / 3 ) * 1.2 );
			if ( inside <= 0 ) continue;
			const floor = lerp( 1.0, - 3.5, smoothstep( 0, 1, along ) );
			H[ k ] = lerp( H[ k ], Math.min( H[ k ], floor ), inside );
			this.rock[ k ] = Math.max( this.rock[ k ], inside );
			if ( inside > 0.5 ) this.coast[ k ] = Math.max( this.coast[ k ], 5 );

		}

		// the flight: from the back of the stage (3.2 m) inland along the axis, climbing at most 45 degrees
		// (cut into the rock where the slope is steeper) until it meets the ground where that levels off
		const stageY = 3.2, prof = [];
		for ( let t = 0; t <= 140; t += 1 ) prof.push( Math.max( stageY, this.heightAt( head.x - dx * t, head.z - dz * t ) ) );
		const climb = [ stageY ];
		let end = 0;
		for ( let t = 1; t < prof.length; t ++ ) {

			climb.push( Math.min( Math.max( prof[ t ], climb[ t - 1 ] ), climb[ t - 1 ] + 1.0 ) );
			end = t;
			// on the ground again, where it climbs gently
			if ( t > 6 && climb[ t ] >= prof[ t ] - 0.05 && ( prof[ Math.min( t + 4, prof.length - 1 ) ] - prof[ t ] ) / 4 < 0.27 ) break;

		}

		const smooth = [];
		for ( let t = 0; t <= end; t ++ ) {

			let acc = 0, c = 0;
			for ( let o = - 2; o <= 2; o ++ ) {

				acc += climb[ clamp( t + o, 0, end ) ];
				c ++;

			}

			smooth.push( t === 0 ? stageY : Math.max( acc / c, smooth[ t - 1 ] + 0.05 ) );

		}
		const pts = smooth.map( ( y, t ) => [ head.x - dx * t, y, head.z - dz * t ] );
		// grade a 3.4 m wide band under the steps (and the rock-cut sides a little steeper)
		for ( let t = - 1; t <= end + 3; t += 0.5 ) for ( let s = - 4; s <= 4; s += 0.5 ) {

			const x = head.x - dx * t + px * s, z = head.z - dz * t + pz * s;
			const k = idx( x, z );
			if ( k < 0 ) continue;
			const y = smooth[ clamp( Math.round( t ), 0, end ) ] + Math.max( 0, Math.abs( s ) - 1.7 ) * 0.6;
			const w = smoothstep( 4, 1.7, Math.abs( s ) ) * smoothstep( end + 3, end, t );
			H[ k ] = lerp( H[ k ], y, w );
			this.rock[ k ] = lerp( this.rock[ k ], 0.9, w * 0.8 );
			this.path[ k ] = Math.max( this.path[ k ], Math.round( 255 * smoothstep( 2.2, 1.2, Math.abs( s ) ) * w ) );

		}

		this.paths.push( { pts: pts.map( ( p ) => [ p[ 0 ], p[ 2 ] ] ), w: 0.9 } );
		this.landings[ name ] = {
			bearing: L.bearing, dir: [ dx, dz ], coast, width, head,
			stage: { x: head.x + dx * 4, z: head.z + dz * 4, y: stageY },
			steps: { pts, from: { x: head.x, z: head.z, y: stageY }, to: { x: pts[ end ][ 0 ], z: pts[ end ][ 2 ], y: pts[ end ][ 1 ] } },
			top: { x: head.x - dx * ( end + 3 ), z: head.z - dz * ( end + 3 ) },
		};

	}

	landing( name ) {

		return this.landings[ name ];

	}

	// ------------------------------------------------------------------ paths (the station's)

	// a worn path or a graded track: the path mask along the polyline and, with `grade`, the ground
	// smoothed toward its own running mean along the way (cuttings and embankments for the tramway)
	addPath( pts, { width = 1.2, grade = 0, mask = 1 } = {} ) {

		const n = this.res, texel = this.texel, origin = this.origin, H = this.heights;
		this.paths.push( { pts, w: width / 2 } );
		// the graded profile: ground heights sampled along the line, smoothed
		let profile = null, total = 0;
		if ( grade > 0 ) {

			const steps = [];
			for ( let k = 0; k < pts.length - 1; k ++ ) {

				const [ ax, az ] = pts[ k ], [ bx, bz ] = pts[ k + 1 ], len = Math.hypot( bx - ax, bz - az );
				for ( let s = 0; s < len; s += 1 ) steps.push( this.heightAt( ax + ( bx - ax ) * s / len, az + ( bz - az ) * s / len ) );
				total += len;

			}

			const last = pts[ pts.length - 1 ];
			steps.push( this.heightAt( last[ 0 ], last[ 1 ] ) );
			const r = Math.max( 1, Math.round( grade ) );
			profile = new Float32Array( steps.length );
			for ( let s = 0; s < steps.length; s ++ ) {

				let acc = 0, c = 0;
				for ( let o = - r; o <= r; o ++ ) {

					acc += steps[ clamp( s + o, 0, steps.length - 1 ) ];
					c ++;

				}

				profile[ s ] = acc / c;

			}

		}

		let x0 = Infinity, x1 = - Infinity, z0 = Infinity, z1 = - Infinity;
		for ( const [ x, z ] of pts ) {

			x0 = Math.min( x0, x ); x1 = Math.max( x1, x ); z0 = Math.min( z0, z ); z1 = Math.max( z1, z );

		}

		const pad = width + 3;
		const i0 = Math.max( 0, Math.floor( ( x0 - pad - origin ) / texel ) ), i1 = Math.min( n - 1, Math.ceil( ( x1 + pad - origin ) / texel ) );
		const j0 = Math.max( 0, Math.floor( ( z0 - pad - origin ) / texel ) ), j1 = Math.min( n - 1, Math.ceil( ( z1 + pad - origin ) / texel ) );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

			const x = origin + ( i + 0.5 ) * texel, z = origin + ( j + 0.5 ) * texel;
			const [ d, arc ] = polylineDistance( pts, x, z );
			if ( d > pad ) continue;
			const k = j * n + i;
			const m = smoothstep( width / 2 + 0.6, width / 2 - 0.3, d );
			this.path[ k ] = Math.max( this.path[ k ], Math.round( 255 * m * mask ) );
			if ( profile ) {

				const y = profile[ clamp( Math.round( arc ), 0, profile.length - 1 ) ];
				H[ k ] = lerp( H[ k ], y, smoothstep( width / 2 + 2.5, width / 2, d ) );
				this.rock[ k ] *= 1 - m;

			}

		}

	}

	pathDistance( x, z ) {

		let best = Infinity;
		for ( const p of this.paths ) best = Math.min( best, polylineDistance( p.pts, x, z )[ 0 ] - p.w );
		return best;

	}

	// signed distance to the coast (m): > 0 water, < 0 land (the same shape as TerrainData's)
	coastDistance( x, z ) {

		const n = this.res;
		const i = clamp( Math.round( ( x - this.origin ) / this.texel - 0.5 ), 0, n - 1 ), j = clamp( Math.round( ( z - this.origin ) / this.texel - 0.5 ), 0, n - 1 );
		return { d: this.coast[ j * n + i ] / 10, beachZone: 0 };

	}

	heightFn( x, z ) {

		return { h: this.heightAt( x, z ), rock: 0 };

	}

}

// smooth the heights in a box (e.g. under the station's yard), keeping edges continuous
export function smoothArea( T, x0, z0, x1, z1, r = 2 ) {

	const n = T.res, i0 = Math.max( 0, Math.floor( ( x0 - T.origin ) / T.texel ) ), i1 = Math.min( n - 1, Math.ceil( ( x1 - T.origin ) / T.texel ) );
	const j0 = Math.max( 0, Math.floor( ( z0 - T.origin ) / T.texel ) ), j1 = Math.min( n - 1, Math.ceil( ( z1 - T.origin ) / T.texel ) );
	const w = i1 - i0 + 1, h = j1 - j0 + 1, src = new Float32Array( w * h );
	for ( let j = 0; j < h; j ++ ) for ( let i = 0; i < w; i ++ ) src[ j * w + i ] = T.heights[ ( j0 + j ) * n + i0 + i ];
	const out = boxBlur( src, w, h, r );
	for ( let j = r; j < h - r; j ++ ) for ( let i = r; i < w - r; i ++ ) T.heights[ ( j0 + j ) * n + i0 + i ] = out[ j * w + i ];

}
