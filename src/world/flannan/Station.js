import { Color, Matrix4, Vector3 } from '../../engine/index.js';
import { Builder, Part, quad01Part, sagPoints } from '../village/GeoBuilder.js';
import { windowUnit, doorUnit } from '../village/Buildings.js';
import { lin, WOOD, HARD, C, bollard, ropeCoil, lantern } from '../Props.js';
import { smoothstep, lerp, clamp } from '../../util/Noise.js';

// The Flannan Isles light station as it stood in the winter of 1900-01 (docs/PLAN.md §3), on the island
// FlannanTerrain.js makes from the real DEM. Engine frame: the light at x = z = 0, x east, z south.
//
//   the tower      three stages, 23 m (D. A. Stevenson, lit 7 December 1899): a white shaft on an ochre
//                  base; a corbelled walkway with iron railings; the cast-iron deck and the lantern, glazed
//                  in a diamond lattice under a black cupola. The focal plane is 101 m above the sea.
//   the house      one storey, L-plan, flat roofed, limewashed, with the Northern Lighthouse Board's ochre
//                  margins, base course and blocking course; on the inland side, the tower at its north-east
//                  corner
//   the compound   the boundary wall and gatepiers; an oil store in the north-east corner
//   the landings   east and west: a concrete stage at the head of a geo, a flight of steps up the cliff
//                  with iron railings, a derrick crane; on the west flight the box of ropes 33 m up (the
//                  "110 feet above sea level" of Superintendent Muirhead's report)
//   the tramways   narrow-gauge rails from the head of each flight to the compound gates
//   the flagstaff  east of the compound, facing the relief boat's approach (no flag flew on 26 December 1900)
//   the chapel     Teampull Beannachadh, St Flannan's drystone chapel, 28 m south of the wall (Canmore 3971:
//                  2.5 x 1.5 m inside, walls 0.65-0.97 m, a doorway 0.45 x 0.95 m in the west wall)
//
// buildStation( ctx, village ) is Village's `build` option: it grades the ground first (the yard, the
// tracks, the chapel's platform), then builds into ctx.B with the village's materials and adds colliders,
// footprints, `buildings` entries and lights.

export const STATION = {
	yard: 80.6, // m above the sea: the level of the compound (the ground at the light is 80 m)
	tower: { x: 0, z: 0 },
	focal: 101, // the light's focal plane
	compound: { x0: - 27, x1: 13, z0: - 6, z1: 21 }, // outer faces of the boundary wall
	southGate: { x: - 12, z: 21, w: 3.4 },
	eastGate: { x: 13, z: 6, w: 3.4 },
	chapel: { x: - 8, z: 51 },
	flagstaff: { x: 21, z: - 1 },
};

const Y0 = STATION.yard;

// colours (display hex, as the Board painted them)
const P = {
	white: lin( 0xeeeae1 ), // limewash, white paint
	ochre: lin( 0xc79d55 ), // the Board's buff: margins, base and blocking courses
	black: lin( 0x1c1d1d ), // lantern, cupola, railings
	door: lin( 0x2e3a32 ),
	trim: lin( 0xf0ede4 ),
	roof: lin( 0x3a3a38 ), // asphalt
	concrete: lin( 0xaaa79e ),
	cope: lin( 0xd8d5cc ),
	flags: lin( 0x8f8d86 ), // stone flags of the walkway
	curtain: lin( 0xd8cdb4 ),
	gneiss: lin( 0x8c8a86 ),
	pot: lin( 0x9a5a3e ),
	rail: lin( 0x3a2f28 ),
	sleeper: lin( 0x6f6252 ),
	box: lin( 0x5b6a5d ),
};

// stone vdata (VillageMaterials STONE): seed, style (0 coursed rubble, 1 plaster over stone), plaster
// cover (0.25: whole), splash near the ground (1: peat). One seed per building keeps the plaster
// continuous across the pieces of a wall.
const PLASTER = ( seed, cover = 0.25 ) => [ seed, 1, cover, 1 ];
const RUBBLE = ( seed ) => [ seed, 0, 0, 1 ];
const IRON = ( seed, rust = 0.3 ) => HARD( seed, rust, 0.55, 0.5 );

const I4 = new Matrix4();
const WINDOW = { trim: P.trim, trimPaint: 0.85, weather: 0.3, accent: P.door, paint: 0.8, curtain: P.curtain, litChance: 0.45 };

// ------------------------------------------------------------------ geometry helpers

// a box in the builder's current frame with uvs in metres continuous over a whole wall: u = x + u0 along
// the faces (z across on the ends), v = y - v0. skip: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z
function wallBox( B, key, x0, x1, y0, y1, z0, z1, { v0 = Y0, u0 = 0, tint, data, skip = 0 } ) {

	if ( x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3 ) return;
	const p = [], n = [], uv = [], idx = [];
	const face = ( a, b, c, d, nx, ny, nz, uvs ) => {

		const base = p.length / 3;
		p.push( ...a, ...b, ...c, ...d );
		for ( let k = 0; k < 4; k ++ ) n.push( nx, ny, nz );
		uv.push( ...uvs );
		idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );

	};

	const U = ( x ) => x + u0, V = ( y ) => y - v0;
	if ( ! ( skip & 16 ) ) face( [ x0, y0, z1 ], [ x1, y0, z1 ], [ x1, y1, z1 ], [ x0, y1, z1 ], 0, 0, 1, [ U( x0 ), V( y0 ), U( x1 ), V( y0 ), U( x1 ), V( y1 ), U( x0 ), V( y1 ) ] );
	if ( ! ( skip & 32 ) ) face( [ x1, y0, z0 ], [ x0, y0, z0 ], [ x0, y1, z0 ], [ x1, y1, z0 ], 0, 0, - 1, [ U( x1 ), V( y0 ), U( x0 ), V( y0 ), U( x0 ), V( y1 ), U( x1 ), V( y1 ) ] );
	if ( ! ( skip & 4 ) ) face( [ x0, y1, z1 ], [ x1, y1, z1 ], [ x1, y1, z0 ], [ x0, y1, z0 ], 0, 1, 0, [ U( x0 ), z1, U( x1 ), z1, U( x1 ), z0, U( x0 ), z0 ] );
	if ( ! ( skip & 8 ) ) face( [ x0, y0, z0 ], [ x1, y0, z0 ], [ x1, y0, z1 ], [ x0, y0, z1 ], 0, - 1, 0, [ U( x0 ), z0, U( x1 ), z0, U( x1 ), z1, U( x0 ), z1 ] );
	if ( ! ( skip & 1 ) ) face( [ x1, y0, z1 ], [ x1, y0, z0 ], [ x1, y1, z0 ], [ x1, y1, z1 ], 1, 0, 0, [ z1, V( y0 ), z0, V( y0 ), z0, V( y1 ), z1, V( y1 ) ] );
	if ( ! ( skip & 2 ) ) face( [ x0, y0, z0 ], [ x0, y0, z1 ], [ x0, y1, z1 ], [ x0, y1, z0 ], - 1, 0, 0, [ z0, V( y0 ), z1, V( y0 ), z1, V( y1 ), z0, V( y1 ) ] );
	B.add( key, new Part( p, n, uv, idx ), I4, tint, data );

}

// a flat polygon (convex, counter-clockwise seen from the front) in the current frame; uvs from a function.
// face: a direction the front should face (the points are reversed if they wind the other way)
function poly( B, key, pts, uvOf, { tint, data, face = null } ) {

	// Newell's normal (robust when points coincide: a strip that narrows to a triangle)
	let nrm = new Vector3();
	for ( let i = 0; i < pts.length; i ++ ) {

		const p = pts[ i ], q = pts[ ( i + 1 ) % pts.length ];
		nrm.x += ( p[ 1 ] - q[ 1 ] ) * ( p[ 2 ] + q[ 2 ] );
		nrm.y += ( p[ 2 ] - q[ 2 ] ) * ( p[ 0 ] + q[ 0 ] );
		nrm.z += ( p[ 0 ] - q[ 0 ] ) * ( p[ 1 ] + q[ 1 ] );

	}

	nrm.normalize();
	if ( face && nrm.x * face[ 0 ] + nrm.y * face[ 1 ] + nrm.z * face[ 2 ] < 0 ) {

		pts = pts.slice().reverse();
		nrm = nrm.negate();

	}
	const p = [], n = [], uv = [], idx = [];
	for ( const q of pts ) {

		p.push( ...q );
		n.push( nrm.x, nrm.y, nrm.z );
		uv.push( ...uvOf( q ) );

	}

	for ( let i = 1; i < pts.length - 1; i ++ ) idx.push( 0, i, i + 1 );
	B.add( key, new Part( p, n, uv, idx ), I4, tint, data );

}

// surface of revolution around the frame's y axis (profile [[r, y], ...] bottom to top, flat shaded along
// the profile) with stone uvs in metres: u around (whole 2 m periods), v = y - v0. arc: [ a0, a1 ] (radians,
// atan2( z, x )) for part of the way round (a doorway's sides); a profile given top to bottom faces inward
function revolve( B, key, profile, { segs = 48, v0 = Y0, tint, data, arc = null } ) {

	const rRef = Math.max( ...profile.map( ( q ) => Math.abs( q[ 0 ] ) ) ), C0 = 2 * Math.PI * rRef;
	const ws = Math.max( 1, Math.round( C0 / 2 ) ) * 2 / C0;
	const a0 = arc ? arc[ 0 ] : 0, a1 = arc ? arc[ 1 ] : Math.PI * 2;
	if ( arc ) segs = Math.max( 2, Math.ceil( segs * ( a1 - a0 ) / ( Math.PI * 2 ) ) );
	const p = [], n = [], uv = [], idx = [];
	for ( let i = 0; i < profile.length - 1; i ++ ) {

		const [ r0, y0 ] = profile[ i ], [ r1, y1 ] = profile[ i + 1 ];
		const dr = r1 - r0, dy = y1 - y0, l = Math.hypot( dr, dy ) || 1;
		const nr = dy / l, ny = - dr / l, base = p.length / 3;
		for ( let j = 0; j <= segs; j ++ ) {

			const t = a0 + j / segs * ( a1 - a0 ), c = Math.cos( t ), s = Math.sin( t ), u = t * rRef * ws;
			p.push( c * r0, y0, s * r0, c * r1, y1, s * r1 );
			n.push( c * nr, ny, s * nr, c * nr, ny, s * nr );
			uv.push( u, y0 - v0, u, y1 - v0 );

		}

		for ( let j = 0; j < segs; j ++ ) {

			const a = base + j * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

	}

	B.add( key, new Part( p, n, uv, idx ), I4, tint, data );

}

// frame along a wall from a to b (x along it, +z out of the outer face: the outside is on the left
// walking from a to b in the x-east / z-south plan)
function wallFrame( a, b ) {

	const L = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ), ux = ( b[ 0 ] - a[ 0 ] ) / L, uz = ( b[ 1 ] - a[ 1 ] ) / L;
	return { L, ry: Math.atan2( - uz, ux ), n: [ - uz, ux ] };

}

// ------------------------------------------------------------------ the ground

// level a rectangle to height h (smooth falloff outside), clear its rock and wear its surface
function padRect( T, x0, z0, x1, z1, h, falloff, wear = 150 ) {

	const n = T.res;
	const i0 = Math.max( 0, Math.floor( ( x0 - falloff - T.origin ) / T.texel ) ), i1 = Math.min( n - 1, Math.ceil( ( x1 + falloff - T.origin ) / T.texel ) );
	const j0 = Math.max( 0, Math.floor( ( z0 - falloff - T.origin ) / T.texel ) ), j1 = Math.min( n - 1, Math.ceil( ( z1 + falloff - T.origin ) / T.texel ) );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

		const x = T.origin + ( i + 0.5 ) * T.texel, z = T.origin + ( j + 0.5 ) * T.texel;
		const d = Math.hypot( Math.max( x0 - x, 0, x - x1 ), Math.max( z0 - z, 0, z - z1 ) );
		const t = 1 - smoothstep( 0, falloff, d ), k = j * n + i;
		T.heights[ k ] = lerp( T.heights[ k ], h, t );
		T.rock[ k ] *= 1 - t;
		if ( d <= 0 ) T.path[ k ] = Math.max( T.path[ k ], wear );

	}

}

function mean( T, x, z, r ) {

	let s = 0, c = 0;
	for ( let a = - r; a <= r; a += r / 2 ) for ( let b = - r; b <= r; b += r / 2 ) {

		s += T.heightAt( x + a, z + b );
		c ++;

	}

	return s / c;

}

// the top of a flight's tread at t metres up its run (Station.js landing(): one riser per 0.19 m or less of
// each metre of the graded profile)
function flightTop( pts, t ) {

	const i = Math.min( Math.max( Math.ceil( t ), 1 ), pts.length - 1 );
	const y0 = pts[ i - 1 ][ 1 ], dy = pts[ i ][ 1 ] - y0, n = Math.max( 1, Math.round( dy / 0.19 ) );
	const f = clamp( t - ( i - 1 ), 0, 1 );
	return y0 + dy * Math.max( 1, Math.ceil( f * n - 1e-6 ) ) / n;

}

// lower the ground under a landing's flight (2.6 m wide) to 5 cm below its treads
function cutUnderFlight( T, L ) {

	const pts = L.steps.pts, [ dx, dz ] = L.dir, hx = L.head.x, hz = L.head.z, n = T.res;
	const end = pts.length - 1, half = 1.3;
	const xs = [ hx, hx - dx * end ], zs = [ hz, hz - dz * end ];
	const i0 = Math.max( 0, Math.floor( ( Math.min( ...xs ) - 3 - T.origin ) / T.texel ) ), i1 = Math.min( n - 1, Math.ceil( ( Math.max( ...xs ) + 3 - T.origin ) / T.texel ) );
	const j0 = Math.max( 0, Math.floor( ( Math.min( ...zs ) - 3 - T.origin ) / T.texel ) ), j1 = Math.min( n - 1, Math.ceil( ( Math.max( ...zs ) + 3 - T.origin ) / T.texel ) );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

		const x = T.origin + ( i + 0.5 ) * T.texel, z = T.origin + ( j + 0.5 ) * T.texel;
		const t = - ( ( x - hx ) * dx + ( z - hz ) * dz ), w = - ( x - hx ) * dz + ( z - hz ) * dx;
		if ( t < 0 || t > end || Math.abs( w ) > half ) continue;
		const k = j * n + i;
		T.heights[ k ] = Math.min( T.heights[ k ], flightTop( pts, t ) - 0.05 );

	}

}

// ------------------------------------------------------------------ buildings

// One wall of a flat-roofed station building in its own frame (wallFrame): limewashed rubble with its
// openings cut, the Board's ochre margins round them, an ochre base course, cornice and blocking course,
// long-and-short quoins at the outer corners. S: the building ({ floor, eaves, top, t, seed }); W: { a, b,
// u0, quoins: [ atA, atB ], openings: [ { at, kind: 'window' | 'door' } ] }. Returns the lit windows.
function stationWall( ctx, S, W ) {

	const { B, rand } = ctx;
	const { L, ry, n } = wallFrame( W.a, W.b );
	const white = { u0: W.u0, tint: P.white, data: PLASTER( S.seed ) };
	const ochre = { u0: W.u0, tint: P.ochre, data: PLASTER( S.seed + 0.31 ) };
	const concrete = { u0: W.u0, tint: P.concrete, data: PLASTER( S.seed + 0.57, 0.3 ) };
	const base = Y0 - 0.45, T = S.t, lit = [];
	const ops = ( W.openings || [] ).map( ( o ) => {

		const door = o.kind === 'door';
		const w = door ? 1.1 : ( o.w ?? 1.0 );
		const y0 = o.y0 ?? ( door ? S.floor - 0.02 : S.floor + 0.8 ), y1 = o.y1 ?? S.floor + 2.3;
		return { ...o, door, w, x0: o.at - w / 2, x1: o.at + w / 2, y0, y1 };

	} ).sort( ( p, q ) => p.at - q.at );

	B.pushAt( W.a[ 0 ], 0, W.a[ 1 ], ry );

	// the wall, cut round its openings
	let x = 0;
	for ( const o of ops ) {

		wallBox( B, 'stone', x, o.x0, base, S.eaves, - T, 0, white );
		wallBox( B, 'stone', o.x0, o.x1, base, o.y0, - T, 0, white );
		wallBox( B, 'stone', o.x0, o.x1, o.y1, S.eaves, - T, 0, white );
		x = o.x1;

	}

	wallBox( B, 'stone', x, L, base, S.eaves, - T, 0, white );

	// base course (broken by the doors), cornice, blocking course and cope
	x = 0;
	for ( const o of ops ) {

		if ( ! o.door ) continue;
		wallBox( B, 'stone', x, o.x0 - 0.2, base, S.floor + 0.05, 0, 0.05, ochre );
		x = o.x1 + 0.2;

	}

	wallBox( B, 'stone', x, L, base, S.floor + 0.05, 0, 0.05, ochre );
	wallBox( B, 'stone', 0, L, S.eaves - 0.32, S.eaves - 0.1, 0, 0.1, ochre );
	wallBox( B, 'stone', 0, L, S.eaves - 0.1, S.top, - T + 0.15, 0.03, ochre );
	wallBox( B, 'stone', - 0.03, L + 0.03, S.top, S.top + 0.07, - T + 0.1, 0.07, { ...ochre, tint: P.cope } );

	// long-and-short quoins at the outer corners
	for ( const [ end, on ] of [ [ 0, W.quoins && W.quoins[ 0 ] ], [ L, W.quoins && W.quoins[ 1 ] ] ] ) {

		if ( ! on ) continue;
		let k = 0;
		for ( let y = S.floor + 0.05; y < S.eaves - 0.34; y += 0.3, k ++ ) {

			const w = k % 2 ? 0.26 : 0.46, y1 = Math.min( y + 0.3, S.eaves - 0.32 );
			if ( end === 0 ) wallBox( B, 'stone', - 0.035, w, y, y1 - 0.012, 0, 0.035, ochre );
			else wallBox( B, 'stone', L - w, L + 0.035, y, y1 - 0.012, 0, 0.035, ochre );

		}

	}

	// the openings: margins, sills, sashes and doors, set back in the reveals
	for ( const o of ops ) {

		const m = 0.2, pr = 0.035;
		wallBox( B, 'stone', o.x0 - m, o.x0, o.door ? S.floor + 0.05 : o.y0 - 0.06, o.y1, 0, pr, ochre );
		wallBox( B, 'stone', o.x1, o.x1 + m, o.door ? S.floor + 0.05 : o.y0 - 0.06, o.y1, 0, pr, ochre );
		wallBox( B, 'stone', o.x0 - m, o.x1 + m, o.y1, o.y1 + m + 0.05, 0, pr, ochre );
		if ( o.door ) {

			// (leaf: false: the door is a moving part of its own)
			if ( o.leaf !== false ) {

				B.pushAt( 0, 0, - 0.16 );
				doorUnit( B, rand, o.at, S.floor, { ...WINDOW, doorPattern: 3, paint: 0.7, weather: 0.4 } );
				B.pop();

			}
			// two steps up to the threshold
			if ( S.floor - Y0 > 0.2 ) {

				wallBox( B, 'stone', o.x0 - 0.2, o.x1 + 0.2, Y0 - 0.25, S.floor - 0.01, 0, 0.36, concrete );
				wallBox( B, 'stone', o.x0 - 0.35, o.x1 + 0.35, Y0 - 0.3, lerp( Y0, S.floor, 0.5 ), 0, 0.72, concrete );

			}

		} else {

			wallBox( B, 'stone', o.x0 - 0.1, o.x1 + 0.1, o.y0 - 0.1, o.y0, - 0.12, 0.1, { ...ochre, tint: P.cope } );
			B.pushAt( 0, 0, - 0.14 );
			const w = windowUnit( B, rand, o.at, o.y0 + 0.02, o.w - 0.16, o.y1 - o.y0 - 0.2, { ...WINDOW, litChance: o.lit ?? WINDOW.litChance } );
			B.pop();
			if ( w ) lit.push( { position: B.toWorld( w.x, w.y, 0.1 ), dir: new Vector3( n[ 0 ], 0, n[ 1 ] ) } );

		}

	}

	B.pop();
	return lit;

}

// a flat roof over a rectangle of the plan (inside the parapets), asphalt
function flatRoof( ctx, x0, z0, x1, z1, y ) {

	ctx.B.box( 'hard', ( x0 + x1 ) / 2, y - 0.12, ( z0 + z1 ) / 2, x1 - x0, 0.24, z1 - z0, { tint: P.roof, data: HARD( 0.41, 0, 0, 0.93 ) } );

}

function chimney( ctx, x, z, y0, y1, seed ) {

	const { B } = ctx;
	B.pushAt( x, 0, z );
	const white = { tint: P.white, data: PLASTER( seed ) }, ochre = { tint: P.ochre, data: PLASTER( seed + 0.3 ) };
	wallBox( B, 'stone', - 0.6, 0.6, y0, y1, - 0.4, 0.4, white );
	wallBox( B, 'stone', - 0.66, 0.66, y1, y1 + 0.12, - 0.46, 0.46, ochre );
	for ( const px of [ - 0.3, 0.3 ] ) B.cyl( 'stone', px, y1 + 0.12, 0, 0.12, 0.14, 0.42, { segs: 10, tint: P.pot, data: [ seed + px, 1, 0.3, 0 ] } );
	B.pop();

}

// a level rectangle less the tower's disc (radius r about the origin, which lies inside the rectangle),
// facing up or down: a fan of strips from the disc's edge out to the rectangle's
function rectAroundTower( B, key, x0, z0, x1, z1, r, y, up, o ) {

	const angles = [];
	for ( let i = 0; i < 96; i ++ ) angles.push( i / 96 * Math.PI * 2 );
	for ( const [ x, z ] of [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ] ) angles.push( ( Math.atan2( z, x ) + Math.PI * 2 ) % ( Math.PI * 2 ) );
	angles.sort( ( a, b ) => a - b );
	angles.push( angles[ 0 ] + Math.PI * 2 );
	// how far a ray from the origin runs to the rectangle's edge
	const edge = ( a ) => {

		const c = Math.cos( a ), s = Math.sin( a );
		const tx = c > 1e-9 ? x1 / c : c < - 1e-9 ? x0 / c : Infinity;
		const tz = s > 1e-9 ? z1 / s : s < - 1e-9 ? z0 / s : Infinity;
		return Math.min( tx, tz );

	};

	for ( let i = 0; i < angles.length - 1; i ++ ) {

		const a = angles[ i ], b = angles[ i + 1 ];
		if ( b - a < 1e-6 ) continue;
		const ea = edge( a ), eb = edge( b );
		if ( ea <= r && eb <= r ) continue;
		const ra = Math.min( r, ea ), rb = Math.min( r, eb );
		const q = [ [ Math.cos( a ) * ra, y, Math.sin( a ) * ra ], [ Math.cos( a ) * ea, y, Math.sin( a ) * ea ], [ Math.cos( b ) * eb, y, Math.sin( b ) * eb ], [ Math.cos( b ) * rb, y, Math.sin( b ) * rb ] ];
		// counter-clockwise in x / z (a to b) faces down
		poly( B, key, up ? q.reverse() : q, ( p ) => [ p[ 0 ], p[ 2 ] ], o );

	}

}

// The keepers' room: the one room of the house that is open (the rest waits for docs/PLAN.md §5.3's
// interiors), off the yard by the east door, with the tower's doorway in its north-east corner
export const ROOM = { x0: - 9, x1: 1.2, z0: - 1.2, z1: 5.4, ceiling: Y0 + 3.6, door: { x: 1.8, z: 4.6, w: 1.1 } };

// the keepers' house: an L round the tower's south-west, the tower at its north-east corner
function keepersHouse( ctx, village, parts ) {

	const S = { floor: TOWER.floor, eaves: Y0 + 3.95, top: Y0 + 4.5, t: 0.6, seed: 0.37 };
	// outline (outer faces) from the tower corner, counter-clockwise in plan: north face west, west face
	// south, the south faces and the inner corner, the east face back north to the tower (the tower's own
	// wall closes the corner)
	const walls = [
		{ a: [ - 2.6, - 1.8 ], b: [ - 22, - 1.8 ], quoins: [ false, true ], openings: [ { at: 3.9 }, { at: 7.9 }, { at: 11.9 }, { at: 15.9 } ] },
		{ a: [ - 22, - 1.8 ], b: [ - 22, 6 ], quoins: [ true, true ], openings: [ { at: 2.2 }, { at: 5.6 } ] },
		{ a: [ - 22, 6 ], b: [ - 6, 6 ], quoins: [ true, false ], openings: [ { at: 2.0 }, { at: 5.5 }, { at: 9.0 }, { at: 12.0, kind: 'door' }, { at: 14.4 } ] },
		{ a: [ - 6, 6 ], b: [ - 6, 15 ], quoins: [ false, true ], openings: [ { at: 2.4, kind: 'door' }, { at: 6.0 } ] },
		{ a: [ - 6, 15 ], b: [ 1.8, 15 ], quoins: [ true, true ], openings: [ { at: 2.2 }, { at: 5.6 } ] },
		{ a: [ 1.8, 15 ], b: [ 1.8, 2.6 ], quoins: [ true, false ], openings: [ { at: 2.0 }, { at: 5.4 }, { at: 15 - ROOM.door.z, kind: 'door', leaf: false } ] },
	];
	let u0 = 0;
	const lit = [];
	for ( const W of walls ) {

		W.u0 = u0;
		lit.push( ...stationWall( ctx, S, W ) );
		u0 += wallFrame( W.a, W.b ).L;

	}

	// the roof round the tower, the south wing's
	rectAroundTower( ctx.B, 'hard', - 21.6, - 1.4, 1.4, 5.6, 3.0, S.eaves, true, { tint: P.roof, data: HARD( 0.41, 0, 0, 0.93 ) } );
	rectAroundTower( ctx.B, 'hard', - 21.6, - 1.4, 1.4, 5.6, 3.0, S.eaves - 0.24, false, { tint: P.roof, data: HARD( 0.41, 0, 0, 0.93 ) } );
	flatRoof( ctx, - 5.6, 5.6, 1.4, 14.6, S.eaves );
	chimney( ctx, - 15.5, 2.1, S.eaves - 0.2, Y0 + 5.9, 0.61 );
	chimney( ctx, - 8.5, 2.1, S.eaves - 0.2, Y0 + 5.9, 0.67 );
	chimney( ctx, - 2.1, 10.5, S.eaves - 0.2, Y0 + 5.9, 0.73 );

	// walls to bump into: the closed parts of the house solid, the keepers' room walled
	const { colliders } = ctx, R = ROOM, hy = new Vector3( 0, 2.6, 0 );
	const box = ( x0, z0, x1, z1, tag = 'house' ) => colliders.addBox( new Vector3( ( x0 + x1 ) / 2, Y0 + 2.2, ( z0 + z1 ) / 2 ), hy.clone().setX( ( x1 - x0 ) / 2 ).setZ( ( z1 - z0 ) / 2 ), 0, { tag } );
	box( - 22, - 1.8, R.x0, 6 ); // the west rooms
	box( - 6, R.z1, 1.8, 15 ); // the south wing
	box( R.x0, 5.4, - 6, 6, 'wall' ); // the room's south wall, west of the wing
	box( R.x0, - 1.8, - 2.6, R.z0, 'wall' ); // its north wall, to the tower
	box( R.x1, 2.6, 1.8, R.door.z - R.door.w / 2, 'wall' ); // its east wall, either side of the door
	box( R.x1, R.door.z + R.door.w / 2, 1.8, R.z1 + 0.6, 'wall' );
	village.buildings.push( { name: 'house', x: - 10.1, z: 2.1, floorY: S.floor, roofTop: S.top, stilts: false } );
	village.buildings.push( { name: 'house-south', x: - 2.1, z: 10.5, floorY: S.floor, roofTop: S.top, stilts: false } );

	keepersRoom( ctx, parts, S );
	return lit;

}

// inside the keepers' room: boards and a plaster ceiling, the partitions with the house's other doors
// (shut), the desk with the station journal and the slate, the barometer, the clock, the stove, a table,
// the oilskins on their pegs by the door
function keepersRoom( ctx, parts, S ) {

	const { B, rand, colliders, lights } = ctx;
	const R = ROOM, F = S.floor;
	const plaster = { tint: P.white, data: PLASTER( 0.43, 0.25 ) };
	const boards = { tint: lin( 0x6b5440 ), data: WOOD( 0.5, 0.45, 0, 0 ) };
	rectAroundTower( B, 'wood', R.x0, R.z0, R.x1 + 0.6, R.z1, 3.3, F, true, boards );
	rectAroundTower( B, 'stone', R.x0, R.z0, R.x1, R.z1, 3.0, R.ceiling, false, plaster );
	// the threshold through the tower's wall, and the step up at the yard door
	sectorSlab( B, 'stone', TOWER.rIn - 0.05, 3.5, TOWER.doorAngle - DOOR_HALF, TOWER.doorAngle + DOOR_HALF, F - 0.12, F, { tint: P.flags, data: RUBBLE( 0.45 ) } );
	colliders.addBox( new Vector3( ( R.x0 + 1.8 ) / 2, F - 0.25, ( R.z0 + R.z1 ) / 2 ), new Vector3( ( 1.8 - R.x0 ) / 2, 0.25, ( R.z1 - R.z0 ) / 2 ), 0, { walkable: true, solid: false, tag: 'floor' } );
	colliders.addBox( new Vector3( 2.16, Y0 + 0.11, R.door.z ), new Vector3( 0.36, 0.115, 0.75 ), 0, { walkable: true, tag: 'step' } );
	colliders.addBox( new Vector3( 1.98, F - 0.2, R.door.z ), new Vector3( 0.18, 0.19, 0.75 ), 0, { walkable: true, tag: 'step' } );

	// the partitions: west (to the bedrooms) and south (to the kitchen), each with a shut door
	const part = ( x0, z0, x1, z1 ) => wallBox( B, 'stone', x0, x1, F - 0.1, R.ceiling + 0.1, z0, z1, { u0: 0, ...plaster } );
	part( R.x0 - 0.6, R.z0, R.x0, R.z1 );
	part( - 5.4, R.z1, R.x1, R.z1 + 0.6 );
	B.pushAt( R.x0, 0, 2.6, Math.PI / 2 );
	doorUnit( B, rand, 0, F, { ...WINDOW, doorPattern: 3, paint: 0.7, weather: 0.1 } );
	B.pop();
	B.pushAt( - 2.2, 0, R.z1, Math.PI );
	doorUnit( B, rand, 0, F, { ...WINDOW, doorPattern: 3, paint: 0.7, weather: 0.1 } );
	B.pop();
	R.westDoor = new Vector3( R.x0 + 0.1, F + 1.0, 2.6 );
	R.kitchenDoor = new Vector3( - 2.2, F + 1.0, R.z1 - 0.1 );

	// the yard door: a ledged and braced leaf, hinged on the north jamb, opening in
	parts.doors.push( door( ctx, {
		name: 'house', hinge: new Vector3( 1.62, F, R.door.z - 0.5 ), ry: - Math.PI / 2, swing: - 1.6, width: 1.0, height: 2.08,
		leaf: ( L ) => {

			const wood = ( s ) => ( { tint: P.door, data: WOOD( s, 0.35, 0.7, 3 ) } );
			L.box( 'wood', 0.5, 1.04, 0, 1.0, 2.08, 0.045, { grain: 1, ...wood( 0.81 ) } );
			for ( const y of [ 0.25, 1.04, 1.83 ] ) L.box( 'wood', 0.5, y, 0.04, 0.9, 0.14, 0.03, { grain: 0, ...wood( 0.83 ) } );
			L.lathe( 'hard', 0.88, 1.0, - 0.03, [ [ 0, 0 ], [ 0.012, 0 ], [ 0.012, 0.03 ], [ 0.028, 0.045 ], [ 0.0, 0.065 ] ], { segs: 8, rx: - Math.PI / 2, tint: C.brass, data: HARD( 0.85, 0.1, 0.9, 0.35 ) } );

		},
	} ) );

	// furniture
	const wood = ( s, w = 0.4 ) => ( { tint: lin( 0x5a4430 ), data: WOOD( s, w, 0, 0 ) } );
	const iron = { tint: P.black, data: IRON( 0.87, 0.2 ) };
	const brass = { tint: C.brass, data: HARD( 0.89, 0.1, 0.9, 0.35 ) };
	const table = ( x, z, w, d, h, ry, s ) => {

		B.pushAt( x, F, z, ry );
		B.box( 'wood', 0, h - 0.025, 0, w, 0.05, d, { grain: 0, ...wood( s ) } );
		for ( const [ lx, lz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) B.box( 'wood', lx * ( w / 2 - 0.05 ), ( h - 0.05 ) / 2, lz * ( d / 2 - 0.05 ), 0.05, h - 0.05, 0.05, { grain: 1, ...wood( s + 0.01 ) } );
		B.pop();
		colliders.addBox( new Vector3( x, F + h / 2, z ), new Vector3( w / 2, h / 2, d / 2 ), ry, { tag: 'furniture' } );

	};

	const chair = ( x, z, ry, s ) => {

		B.pushAt( x, F, z, ry );
		B.box( 'wood', 0, 0.45, 0, 0.42, 0.04, 0.4, { grain: 0, ...wood( s ) } );
		for ( const [ lx, lz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) B.box( 'wood', lx * 0.18, 0.22, lz * 0.17, 0.035, 0.45, 0.035, { grain: 1, ...wood( s + 0.01 ) } );
		for ( const lx of [ - 1, 1 ] ) B.box( 'wood', lx * 0.18, 0.7, 0.18, 0.035, 0.5, 0.035, { grain: 1, ...wood( s + 0.02 ) } );
		B.box( 'wood', 0, 0.88, 0.18, 0.4, 0.1, 0.025, { grain: 0, ...wood( s + 0.03 ) } );
		B.pop();

	};

	// the desk under the north window, with the journal open on it, ink, pen, the slate, the Board's letter
	const desk = { x: - 6.5, z: R.z0 + 0.38 };
	table( desk.x, desk.z, 1.3, 0.62, 0.76, 0, 0.91 );
	chair( desk.x, desk.z + 0.62, 0, 0.93 );
	const top = F + 0.76;
	B.box( 'wood', desk.x + 0.05, top + 0.02, desk.z + 0.04, 0.52, 0.03, 0.36, { grain: 0, tint: lin( 0x3b2a20 ), data: WOOD( 0.95, 0.2, 0, 0 ) } );
	B.box( 'wood', desk.x + 0.05, top + 0.038, desk.z + 0.04, 0.48, 0.008, 0.33, { grain: 0, tint: lin( 0xe6dcc4 ), data: WOOD( 0.96, 0.05, 0.9, 0 ) } );
	B.cyl( 'hard', desk.x + 0.42, top, desk.z - 0.12, 0.03, 0.035, 0.05, { segs: 10, tint: lin( 0x1a1d22 ), data: HARD( 0.97, 0, 0, 0.2 ) } );
	B.rod( 'wood', [ desk.x + 0.38, top + 0.04, desk.z + 0.05 ], [ desk.x + 0.5, top + 0.045, desk.z + 0.16 ], 0.004, 0.003, { segs: 4, tint: lin( 0x2a1a10 ), data: WOOD( 0.98, 0.2 ) } );
	B.pushAt( desk.x - 0.48, top, desk.z - 0.2, 0, - 0.25 );
	B.box( 'wood', 0, 0.2, 0, 0.36, 0.42, 0.025, { grain: 0, tint: lin( 0x6b5036 ), data: WOOD( 0.99, 0.4 ) } );
	B.box( 'stone', 0, 0.2, 0.014, 0.3, 0.36, 0.006, { u0: 0, tint: lin( 0x2e3135 ), data: RUBBLE( 0.79 ) } );
	B.pop();
	B.box( 'wood', desk.x - 0.36, top + 0.004, desk.z + 0.14, 0.21, 0.004, 0.28, { grain: 0, tint: lin( 0xe8e0cc ), data: WOOD( 0.11, 0.05, 0.9, 0 ) } );
	R.journal = new Vector3( desk.x + 0.05, top + 0.05, desk.z + 0.04 );
	R.slate = new Vector3( desk.x - 0.48, top + 0.2, desk.z - 0.18 );
	R.letter = new Vector3( desk.x - 0.36, top + 0.01, desk.z + 0.14 );
	// the desk lamp
	lantern( B, desk.x + 0.5, top, desk.z - 0.12, 0.31, 0.7 );
	lights.push( { position: new Vector3( desk.x + 0.5, top + 0.25, desk.z - 0.05 ), color: new Color( 1.0, 0.68, 0.38 ), intensity: 2.2, range: 7, kind: 'lamp', flicker: 0.06, story: 'deskLamp' } );

	// the barometer and the thermometer on the north wall by the tower, the clock over the kitchen door
	B.pushAt( - 3.6, F, R.z0, 0 );
	B.box( 'wood', 0, 1.65, 0.03, 0.16, 1.0, 0.05, { grain: 1, ...wood( 0.13, 0.2 ) } );
	B.cyl( 'hard', 0, 1.95, 0.06, 0.1, 0.1, 0.02, { rx: Math.PI / 2, segs: 16, ...brass } );
	B.box( 'wood', 0, 1.95, 0.075, 0.15, 0.15, 0.004, { grain: 0, tint: lin( 0xece4d0 ), data: WOOD( 0.15, 0.05, 0.9, 0 ) } );
	B.rod( 'hard', [ 0, 1.2, 0.06 ], [ 0, 1.75, 0.06 ], 0.006, 0.006, { segs: 4, tint: lin( 0x9aa0a6 ), data: HARD( 0.17, 0, 1, 0.1 ) } );
	B.pop();
	R.barometer = new Vector3( - 3.6, F + 1.75, R.z0 + 0.08 );
	B.pushAt( - 2.2, F, R.z1, Math.PI );
	B.cyl( 'wood', 0, 2.55, 0.02, 0.17, 0.17, 0.06, { rx: Math.PI / 2, segs: 20, ...wood( 0.19, 0.2 ) } );
	B.cyl( 'wood', 0, 2.55, 0.05, 0.14, 0.14, 0.01, { rx: Math.PI / 2, segs: 20, tint: lin( 0xece4d0 ), data: WOOD( 0.21, 0.05, 0.9, 0 ) } );
	B.pop();
	R.clock = new Vector3( - 2.2, F + 2.55, R.z1 - 0.06 );

	// the stove against the west partition, its pipe to the ceiling
	B.box( 'hard', R.x0 + 0.4, F + 0.42, 3.9, 0.65, 0.84, 0.58, iron );
	B.box( 'hard', R.x0 + 0.4, F + 0.86, 3.9, 0.7, 0.04, 0.62, iron );
	B.cyl( 'hard', R.x0 + 0.35, F + 0.88, 3.9, 0.07, 0.07, R.ceiling - F - 0.88, { segs: 10, ...iron } );
	colliders.addBox( new Vector3( R.x0 + 0.4, F + 0.45, 3.9 ), new Vector3( 0.35, 0.45, 0.31 ), 0, { tag: 'furniture' } );
	R.stove = new Vector3( R.x0 + 0.5, F + 0.6, 3.9 );

	// the table and chairs
	table( - 5.4, 3.3, 1.4, 0.8, 0.74, 0.1, 0.23 );
	chair( - 5.95, 4.05, Math.PI + 0.25, 0.25 );
	chair( - 4.7, 2.55, - 0.2, 0.27 );
	chair( - 6.4, 2.6, Math.PI * 0.6, 0.29 );

	// the oilskins: one set on the pegs by the door, a peg rail with two empty pegs
	B.pushAt( R.x1, F, 3.5, - Math.PI / 2 );
	B.box( 'wood', 0, 1.75, 0.03, 0.9, 0.08, 0.04, { grain: 0, ...wood( 0.31, 0.3 ) } );
	for ( const x of [ - 0.3, 0, 0.3 ] ) B.rod( 'wood', [ x, 1.75, 0.05 ], [ x, 1.78, 0.14 ], 0.012, 0.012, { segs: 5, ...wood( 0.33, 0.3 ) } );
	const oil = { tint: lin( 0xa58a3c ), data: WOOD( 0.35, 0.2, 0.95, 0 ) };
	B.lathe( 'wood', 0.3, 0.75, 0.13, [ [ 0.2, 0 ], [ 0.24, 0.3 ], [ 0.22, 0.75 ], [ 0.16, 0.95 ], [ 0.05, 1.02 ] ], { segs: 10, sz: 0.45, ...oil } );
	B.lathe( 'wood', 0.3, 1.8, 0.14, [ [ 0.16, 0 ], [ 0.12, 0.06 ], [ 0.1, 0.14 ], [ 0.02, 0.16 ] ], { segs: 10, ...oil } );
	B.pop();
	R.oilskins = new Vector3( R.x1 - 0.15, F + 1.4, 3.2 );

}

// the oil store in the compound's north-east corner: one room, a door to the yard
function oilStore( ctx, village ) {

	const S = { floor: Y0 + 0.15, eaves: Y0 + 3.2, top: Y0 + 3.6, t: 0.45, seed: 0.83 };
	const walls = [
		{ a: [ 11.8, - 4.8 ], b: [ 6.8, - 4.8 ], quoins: [ true, true ] },
		{ a: [ 6.8, - 4.8 ], b: [ 6.8, - 0.4 ], quoins: [ true, true ], openings: [ { at: 2.2, w: 0.7, y0: Y0 + 1.2, y1: Y0 + 2.3, lit: 0 } ] },
		{ a: [ 6.8, - 0.4 ], b: [ 11.8, - 0.4 ], quoins: [ true, true ], openings: [ { at: 2.5, kind: 'door' } ] },
		{ a: [ 11.8, - 0.4 ], b: [ 11.8, - 4.8 ], quoins: [ true, true ] },
	];
	let u0 = 0;
	for ( const W of walls ) {

		W.u0 = u0;
		stationWall( ctx, S, W );
		u0 += wallFrame( W.a, W.b ).L;

	}

	flatRoof( ctx, 7.2, - 4.4, 11.4, - 0.8, S.eaves );
	ctx.colliders.addBox( new Vector3( 9.3, Y0 + 1.6, - 2.6 ), new Vector3( 2.5, 2.0, 2.2 ), 0, { tag: 'shed' } );
	village.buildings.push( { name: 'store', x: 9.3, z: - 2.6, floorY: S.floor, roofTop: S.top, stilts: false } );
	// paraffin barrels by the door
	for ( const [ x, z, ry ] of [ [ 7.6, 0.35, 0.3 ], [ 8.35, 0.5, 1.2 ], [ 7.95, 1.15, 2.6 ] ] ) {

		ctx.inst.add( 'barrel', x, Y0 - 0.02, z, ry, [ 0.55, 0.62, 0.6 ] );
		ctx.colliders.addCylinder( x, z, 0.32, Y0, Y0 + 0.9, { tag: 'barrel' } );

	}

}

// ------------------------------------------------------------------ the tower

// The tower inside (docs/PLAN.md §5.3): a doorway from the keepers' room at the foot, a stone stair winding
// round the weight tube up the shaft to a landing under the lantern, a steep iron stair through a hatch into
// the lantern, and a door from the lantern onto the walkway. Angles are atan2( z, x ) about the tower.
const DOOR_HALF = 0.5 / 3.2; // the doorway: 1 m wide at the outer face
const GALLERY_PANE = 1; // the lantern pane the walkway door replaces (centred at 33.75°, east: Gallan Head)
export const TOWER = {
	floor: Y0 + 0.45, // the keepers' house floor, and the tower's
	rIn: 2.35, // the shaft's inside face
	newel: 0.2, // the weight tube the stair winds round
	doorAngle: Math.PI * 0.75, // the doorway from the keepers' room (south-west)
	doorTop: Y0 + 2.55,
	perTurn: 14, // treads per turn
	landing: Y0 + 15.6, // the head of the stone stair
	deck: Y0 + 17.61, // the walkway, and the lantern floor
	galleryDoor: ( GALLERY_PANE + 0.5 ) / 16 * Math.PI * 2,
	hatch: { r: 0.9, run: 1.45, half: 0.36, steps: 10 }, // the iron stair: along the tangent at r, 1.45 m run
};
{

	const T = TOWER;
	T.start = T.doorAngle + Math.PI / 6; // the first tread, round from the doorway
	T.count = Math.round( ( T.landing - T.floor ) / ( 2.4 / T.perTurn ) );
	T.riser = ( T.landing - T.floor ) / T.count;
	T.pitch = T.riser * T.perTurn;
	T.dTread = Math.PI * 2 / T.perTurn;
	// the landing: the sector after the last tread; the iron stair leaves it along the tangent at hatch.r
	T.landingFrom = T.start + T.count * T.dTread;
	T.landingTo = T.landingFrom + 110 * Math.PI / 180;
	T.hatch.angle = T.landingFrom + 20 * Math.PI / 180;

}

// the tread top under ( x, z ) on the tower's stair, or the landing: the highest not above maxY
export function towerStairHeight( x, z, maxY ) {

	const T = TOWER, r = Math.hypot( x, z );
	if ( r < T.newel || r > T.rIn ) return - Infinity;
	const a = Math.atan2( z, x ), turn = Math.PI * 2;
	const u = ( ( a - T.start ) % turn + turn ) % turn;
	const i0 = Math.floor( u / T.dTread );
	let best = - Infinity;
	for ( let i = i0; i < T.count; i += T.perTurn ) {

		const top = T.floor + ( i + 1 ) * T.riser;
		if ( top <= maxY ) best = top;

	}

	const ul = ( ( a - T.landingFrom ) % turn + turn ) % turn;
	if ( ul <= T.landingTo - T.landingFrom && T.landing <= maxY ) best = Math.max( best, T.landing );
	return best;

}

// the iron stair's frame: s along the run from its foot, w across it (out from the tower's axis)
function hatchFrame( x, z ) {

	const h = TOWER.hatch, c = Math.cos( h.angle ), s = Math.sin( h.angle );
	return { s: - x * s + z * c, w: x * c + z * s - h.r };

}

export function inHatch( x, z ) {

	const f = hatchFrame( x, z ), h = TOWER.hatch;
	return f.s > - 0.15 && f.s < h.run && Math.abs( f.w ) < h.half + 0.06;

}

// an annular sector, solid: radii r0..r1, angles a0..a1, heights y0..y1 (uvs in metres)
function sectorSlab( B, key, r0, r1, a0, a1, y0, y1, o, segs = 3 ) {

	const p = [], n = [], uv = [], idx = [];
	const quad = ( a, b, c, d, nn, uvs ) => {

		const base = p.length / 3;
		p.push( ...a, ...b, ...c, ...d );
		for ( let k = 0; k < 4; k ++ ) n.push( ...( typeof nn === 'function' ? nn( k ) : nn ) );
		uv.push( ...uvs );
		idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );

	};

	const at = ( r, a, y ) => [ Math.cos( a ) * r, y, Math.sin( a ) * r ];
	for ( let j = 0; j < segs; j ++ ) {

		const aa = a0 + ( a1 - a0 ) * j / segs, ab = a0 + ( a1 - a0 ) * ( j + 1 ) / segs;
		const ua = aa * r1, ub = ab * r1;
		// top and bottom (counter-clockwise seen from outside the solid)
		quad( at( r0, aa, y1 ), at( r0, ab, y1 ), at( r1, ab, y1 ), at( r1, aa, y1 ), [ 0, 1, 0 ], [ r0, ua, r0, ub, r1, ub, r1, ua ] );
		quad( at( r0, aa, y0 ), at( r1, aa, y0 ), at( r1, ab, y0 ), at( r0, ab, y0 ), [ 0, - 1, 0 ], [ r0, ua, r1, ua, r1, ub, r0, ub ] );
		// the outer and inner edges
		const no = ( a ) => [ Math.cos( a ), 0, Math.sin( a ) ];
		quad( at( r1, aa, y0 ), at( r1, aa, y1 ), at( r1, ab, y1 ), at( r1, ab, y0 ), ( k ) => no( k < 2 ? aa : ab ), [ ua, y0, ua, y1, ub, y1, ub, y0 ] );
		quad( at( r0, ab, y0 ), at( r0, ab, y1 ), at( r0, aa, y1 ), at( r0, aa, y0 ), ( k ) => no( k < 2 ? ab : aa ).map( ( v ) => - v ), [ ub, y0, ub, y1, ua, y1, ua, y0 ] );

	}

	// the two radial ends
	const ta = [ Math.sin( a0 ), 0, - Math.cos( a0 ) ], tb = [ - Math.sin( a1 ), 0, Math.cos( a1 ) ];
	quad( at( r0, a0, y0 ), at( r0, a0, y1 ), at( r1, a0, y1 ), at( r1, a0, y0 ), ta, [ r0, y0, r0, y1, r1, y1, r1, y0 ] );
	quad( at( r1, a1, y0 ), at( r1, a1, y1 ), at( r0, a1, y1 ), at( r0, a1, y0 ), tb, [ r1, y0, r1, y1, r0, y1, r0, y0 ] );
	B.add( key, new Part( p, n, uv, idx ), I4, o.tint, o.data );

}

// the lantern floor inside the pedestal (r < 2.24), in strips across the iron stair's frame so the hatch
// has straight edges: top at y, underside 0.2 below, the hatch's sides
function lanternFloor( B, y, top, under ) {

	const H = TOWER.hatch, R = 2.24, c = Math.cos( H.angle ), s = Math.sin( H.angle );
	// frame: x = r̂ ( H.r + w ) + t̂ s, so a point is ( w + H.r ) along r̂ and s along t̂
	const P = ( S, W, yy ) => [ c * W - s * S, yy, s * W + c * S ];
	const w0 = H.r - H.half - 0.06, w1 = H.r + H.half + 0.06, s0 = - 0.15, s1 = H.run;
	const bands = [];
	for ( let w = w0; w > - R; w -= 0.14 ) bands.unshift( [ Math.max( w - 0.14, - R ), w ] );
	for ( let k = 0; k < 6; k ++ ) bands.push( [ w0 + k * ( w1 - w0 ) / 6, w0 + ( k + 1 ) * ( w1 - w0 ) / 6 ] );
	for ( let w = w1; w < R; w += 0.14 ) bands.push( [ w, Math.min( w + 0.14, R ) ] );
	const ext = ( W ) => Math.sqrt( Math.max( R * R - W * W, 0 ) );
	const quad = ( Sa0, Sa1, Sb0, Sb1, W0, W1 ) => {

		// a strip from S..S at W0 to S..S at W1: top face up, underside down
		const t = [ P( Sa0, W0, y ), P( Sb0, W1, y ), P( Sb1, W1, y ), P( Sa1, W0, y ) ];
		poly( B, 'hard', t, ( q ) => [ q[ 0 ], q[ 2 ] ], { ...top, face: [ 0, 1, 0 ] } );
		const b = [ P( Sa0, W0, y - 0.2 ), P( Sa1, W0, y - 0.2 ), P( Sb1, W1, y - 0.2 ), P( Sb0, W1, y - 0.2 ) ];
		poly( B, 'stone', b, ( q ) => [ q[ 0 ], q[ 2 ] ], { ...under, face: [ 0, - 1, 0 ] } );

	};

	for ( const [ W0, W1 ] of bands ) {

		const e0 = ext( W0 ), e1 = ext( W1 );
		if ( e0 < 1e-3 && e1 < 1e-3 ) continue;
		if ( W0 >= w0 - 1e-6 && W1 <= w1 + 1e-6 ) {

			quad( - e0, s0, - e1, s0, W0, W1 );
			quad( s1, e0, s1, e1, W0, W1 );

		} else quad( - e0, e0, - e1, e1, W0, W1 );

	}

	// the hatch's sides (facing into the opening)
	const mid = P( ( s0 + s1 ) / 2, H.r, y );
	const side = ( a, b ) => poly( B, 'hard', [ a, b, [ b[ 0 ], y - 0.2, b[ 2 ] ], [ a[ 0 ], y - 0.2, a[ 2 ] ] ], ( q ) => [ q[ 0 ] + q[ 2 ], q[ 1 ] ], { ...top, face: [ mid[ 0 ] - ( a[ 0 ] + b[ 0 ] ) / 2, 0, mid[ 2 ] - ( a[ 2 ] + b[ 2 ] ) / 2 ] } );
	side( P( s1, w0, y ), P( s0, w0, y ) );
	side( P( s0, w1, y ), P( s1, w1, y ) );
	side( P( s0, w0, y ), P( s0, w1, y ) );
	side( P( s1, w1, y ), P( s1, w0, y ) );

}

// a door that swings about a vertical hinge: the leaf is built by leaf( B ) in a frame with the hinge at
// the origin, the leaf along +x, its outside toward -z; open( 0..1 ) turns it by up to `swing` (radians, +:
// the free end toward -z). While shut, `block` (a solid collider box) fills the opening.
function door( ctx, { name, hinge, ry, swing, width, height, leaf, prompt } ) {

	const B = new Builder();
	leaf( B );
	const c = Math.cos( ry ), s = Math.sin( ry ), mid = width / 2;
	const center = new Vector3( hinge.x + c * mid, hinge.y + height / 2, hinge.z - s * mid );
	const block = ctx.colliders.addBox( center, new Vector3( mid, height / 2, 0.12 ), ry, { tag: 'door-' + name } );
	return { name, B, hinge, ry, swing, width, height, block, center, prompt, open: 0, target: 0 };

}

// the walkway door: an iron leaf with a glazed upper half, hinged at the jamb ah (atan2 angle)
function lanternDoor( ctx, hinge, ah, width, height, rand ) {

	return door( ctx, {
		name: 'gallery', hinge, ry: Math.atan2( - Math.cos( ah ), - Math.sin( ah ) ), swing: 1.75, width, height,
		leaf: ( B ) => {

			const iron = { tint: P.black, data: IRON( 0.61, 0.25 ) };
			B.box( 'hard', width / 2, height * 0.3, 0, width, height * 0.6, 0.04, iron );
			for ( const x of [ 0.03, width - 0.03 ] ) B.box( 'hard', x, height * 0.8, 0, 0.06, height * 0.4, 0.05, iron );
			B.box( 'hard', width / 2, height - 0.03, 0, width, 0.06, 0.05, iron );
			B.part( 'glass', quad01Part( width - 0.1, height * 0.38 ), width / 2, height * 0.8, - 0.01, { tint: [ 0.2, 0.22, 0.2 ], data: [ rand.next() * 0.3, 0, 0, 0 ] } );
			B.box( 'hard', width - 0.1, height * 0.5, - 0.05, 0.03, 0.12, 0.05, { tint: P.black, data: IRON( 0.66, 0.6 ) } );

		},
	} );

}

// the lens's cast-iron pedestal with the rotation machine in it (the crank is a moving part), the lens
// table, the burner; the lens itself (brass frame and glass drum, centred on the focal plane gm) turns
function lensPedestal( ctx, parts, deck, gm ) {

	const { B } = ctx;
	const iron = { tint: lin( 0x2c3a33 ), data: IRON( 0.71, 0.15 ) };
	const brass = { tint: lin( 0xb08a3e ), data: HARD( 0.73, 0, 0.9, 0.35 ) };
	B.cyl( 'hard', 0, deck, 0, 0.55, 0.6, 0.15, { segs: 24, ...iron } );
	B.cyl( 'hard', 0, deck + 0.15, 0, 0.36, 0.42, 1.55, { segs: 24, ...iron } );
	// the machine: a cabinet on the column facing the hatch, the winding square and its crank
	const ca = TOWER.crankAngle = TOWER.hatch.angle + 1.05;
	B.pushAt( 0, 0, 0, Math.PI / 2 - ca );
	B.box( 'hard', 0, deck + 0.95, 0.45, 0.62, 0.7, 0.3, iron );
	B.box( 'hard', 0, deck + 0.95, 0.61, 0.5, 0.58, 0.02, brass );
	B.cyl( 'hard', 0, deck + 1.0, 0.62, 0.05, 0.05, 0.08, { rx: Math.PI / 2, segs: 10, ...brass } );
	B.pop();
	TOWER.crank = new Vector3( Math.cos( ca ) * 0.7, deck + 1.0, Math.sin( ca ) * 0.7 );
	const crank = new Builder();
	crank.box( 'hard', 0, 0.12, 0, 0.03, 0.26, 0.03, brass );
	crank.cyl( 'hard', 0, 0.22, 0, 0.022, 0.022, 0.14, { rx: Math.PI / 2, segs: 8, tint: lin( 0x3a2a1c ), data: WOOD( 0.75, 0.4 ) } );
	parts.crank = { B: crank, position: TOWER.crank.clone(), ry: Math.PI / 2 - ca };
	B.cyl( 'hard', 0, deck + 1.7, 0, 0.62, 0.58, 0.12, { segs: 24, ...brass } );
	// the burner: a brass column with the concentric wicks at the focus
	B.cyl( 'hard', 0, deck + 1.82, 0, 0.09, 0.12, gm - deck - 1.92, { segs: 12, ...brass } );

	// the lens (local: y = 0 on the focal plane): brass rings and bars round a glass drum, prism crowns
	const L = new Builder(), G = new Builder(), rL = 0.55, y0 = - 0.7, y1 = 0.7;
	L.cyl( 'hard', 0, deck + 1.82 - gm, 0, 0.6, 0.6, 0.08, { segs: 24, ...brass } );
	for ( const y of [ y0 - 0.06, y1 ] ) L.torus( 'hard', 0, y + 0.03, 0, rL + 0.02, 0.03, { radial: 5, tubular: 32, ...brass } );
	for ( let i = 0; i < 8; i ++ ) {

		const a = ( i + 0.5 ) / 8 * Math.PI * 2;
		L.rod( 'hard', [ Math.cos( a ) * ( rL + 0.02 ), y0 - 0.25, Math.sin( a ) * ( rL + 0.02 ) ], [ Math.cos( a ) * ( rL + 0.02 ), y1 + 0.32, Math.sin( a ) * ( rL + 0.02 ) ], 0.012, 0.012, { segs: 5, ...brass } );

	}

	L.lathe( 'hard', 0, y1 + 0.3, 0, [ [ 0.3, 0 ], [ 0.12, 0.08 ], [ 0.06, 0.1 ] ], { segs: 16, ...brass } );
	G.cyl( 'lens', 0, y0, 0, rL, rL, y1 - y0, { segs: 48, capTop: false } );
	G.lathe( 'lens', 0, y1, 0, [ [ rL, 0 ], [ 0.48, 0.12 ], [ 0.38, 0.22 ], [ 0.3, 0.3 ] ], { segs: 48 } );
	G.lathe( 'lens', 0, y0 - 0.25, 0, [ [ 0.32, 0 ], [ 0.42, 0.1 ], [ 0.5, 0.18 ], [ rL, 0.25 ] ], { segs: 48 } );
	parts.lens = { B: L, glass: G, position: new Vector3( 0, gm, 0 ), radius: rL };

}

function tower( ctx, parts ) {

	const { B, rand, lights, colliders } = ctx;
	const T = TOWER;
	const white = { tint: P.white, data: PLASTER( 0.13 ) }, ochre = { tint: P.ochre, data: PLASTER( 0.19 ) };
	const iron = { tint: P.black, data: IRON( 0.23, 0.12 ) };
	const r = ( y ) => lerp( 3.2, 2.95, clamp( ( y - Y0 - 0.9 ) / 15.7, 0, 1 ) );
	const dA = T.doorAngle, dw = DOOR_HALF, past = [ dA + dw, dA - dw + Math.PI * 2 ];

	// stage 1: the ochre base and the white shaft, cut for the doorway from the keepers' room
	revolve( B, 'stone', [ [ 3.45, Y0 - 0.5 ], [ 3.45, Y0 + 0.72 ], [ 3.3, Y0 + 0.92 ], [ 3.2, Y0 + 0.92 ] ], { ...ochre, arc: past } );
	revolve( B, 'stone', [ [ 3.2, Y0 + 0.9 ], [ r( T.doorTop ), T.doorTop ] ], { ...white, arc: past } );
	revolve( B, 'stone', [ [ r( T.doorTop ), T.doorTop ], [ 2.95, Y0 + 16.6 ] ], white );
	// the inside: limewashed, the doorway cut through; a flagged floor; the reveals and the lintel
	const inside = { tint: P.white, data: PLASTER( 0.17, 0.2 ) };
	revolve( B, 'stone', [ [ T.rIn, T.deck - 0.2 ], [ T.rIn, T.doorTop ] ], inside );
	revolve( B, 'stone', [ [ T.rIn, T.doorTop ], [ T.rIn, T.floor ] ], { ...inside, arc: past } );
	revolve( B, 'stone', [ [ T.rIn + 0.1, T.floor ], [ 0.001, T.floor ] ], { segs: 32, tint: P.flags, data: RUBBLE( 0.47 ) } );
	revolve( B, 'stone', [ [ T.rIn, T.doorTop ], [ 3.24, T.doorTop ] ], { ...inside, arc: [ dA - dw, dA + dw ] } );
	for ( const s of [ - 1, 1 ] ) {

		// each side faces into the opening
		const a = dA + s * dw, c = Math.cos( a ), sn = Math.sin( a );
		const q = [ [ T.rIn * c, T.floor, T.rIn * sn ], [ 3.46 * c, T.floor, 3.46 * sn ], [ 3.46 * c, T.doorTop, 3.46 * sn ], [ T.rIn * c, T.doorTop, T.rIn * sn ] ];
		poly( B, 'stone', q, ( p ) => [ Math.hypot( p[ 0 ], p[ 2 ] ), p[ 1 ] - Y0 ], { ...inside, face: [ s * sn, 0, - s * c ] } );

	}

	// the stair: stone treads cantilevered from the wall round the weight tube, 14 to a turn
	const tread = { tint: lin( 0x9a968c ), data: RUBBLE( 0.51 ) };
	for ( let i = 0; i < T.count; i ++ ) {

		const a = T.start + i * T.dTread, top = T.floor + ( i + 1 ) * T.riser;
		sectorSlab( B, 'stone', T.newel, T.rIn + 0.05, a - 0.012, a + T.dTread + 0.012, top - 0.13, top, tread );

	}

	sectorSlab( B, 'stone', T.newel, T.rIn + 0.05, T.landingFrom, T.landingTo, T.landing - 0.16, T.landing, tread, 8 );
	B.cyl( 'hard', 0, T.floor, 0, T.newel, T.newel, T.deck - T.floor, { segs: 16, ...iron } );
	// a rope handrail on iron eyes up the wall
	const rail = [];
	for ( let i = 0; i <= T.count; i += 2 ) {

		const a = T.start + i * T.dTread, y = T.floor + i * T.riser + 0.95;
		rail.push( new Vector3( Math.cos( a ) * ( T.rIn - 0.08 ), y, Math.sin( a ) * ( T.rIn - 0.08 ) ) );

	}

	B.tube( 'rope', rail, 0.018, { tint: C.rope, data: [ rand.next(), 0, 0, 0 ] } );
	colliders.addRing( 0, 0, T.rIn, 3.45, Y0 - 0.5, T.deck - 0.05, { gaps: [ [ dA - dw, dA + dw ] ], tag: 'tower' } );
	colliders.addCylinder( 0, 0, T.newel, T.floor, T.deck, { tag: 'newel' } );
	colliders.addSurface( ( x, z, maxY ) => Math.hypot( x, z ) < T.rIn + 0.05 && T.floor <= maxY ? T.floor : - Infinity, { inside: ( x, z ) => x * x + z * z < 6, kind: 'rock', tag: 'towerFloor' } );
	colliders.addSurface( towerStairHeight, { inside: ( x, z ) => x * x + z * z < T.rIn * T.rIn, kind: 'rock', tag: 'stair' } );

	// the iron stair from the landing up through the hatch: open treads between two plate stringers
	const H = T.hatch, hc = Math.cos( H.angle ), hs = Math.sin( H.angle );
	const hp = ( s, w, y ) => [ hc * ( H.r + w ) - hs * s, y, hs * ( H.r + w ) + hc * s ];
	const rise = ( T.deck - T.landing ) / H.steps, run = H.run / ( H.steps - 1 );
	const hry = Math.atan2( - hc, - hs ); // a box's x along the run
	for ( let j = 1; j < H.steps; j ++ ) {

		const y = T.landing + j * rise, c = hp( ( j - 0.5 ) * run, 0, 0 );
		B.box( 'hard', c[ 0 ], y - 0.02, c[ 2 ], run + 0.04, 0.04, H.half * 2, { ry: hry, ...iron } );
		colliders.addBox( new Vector3( c[ 0 ], y - 0.1, c[ 2 ] ), new Vector3( run / 2 + 0.02, 0.1, H.half ), hry, { walkable: true, solid: false, tag: 'hatchStair' } );

	}

	for ( const w of [ - H.half - 0.02, H.half + 0.02 ] ) {

		B.beam( 'hard', hp( - 0.1, w, T.landing - 0.05 ), hp( H.run + 0.05, w, T.deck - 0.05 ), 0.025, 0.24, iron );
		B.rod( 'hard', hp( 0.05, w, T.landing + 0.95 ), hp( H.run, w, T.deck + 0.9 ), 0.018, 0.018, { segs: 5, ...iron } );
		B.rod( 'hard', hp( 0.05, w, T.landing ), hp( 0.05, w, T.landing + 0.95 ), 0.018, 0.018, { segs: 5, ...iron } );

	}

	// a guard rail round the hatch, open at the stair's head
	const top1 = T.deck + 1.0, hq = H.half + 0.08;
	const guard = [ [ H.run, - hq ], [ - 0.2, - hq ], [ - 0.2, hq ], [ H.run, hq ] ];
	for ( let k = 0; k < guard.length; k ++ ) {

		const [ s0, w0 ] = guard[ k ];
		B.rod( 'hard', hp( s0, w0, T.deck ), hp( s0, w0, top1 ), 0.02, 0.02, { segs: 5, ...iron } );
		if ( k === 0 ) continue;
		const [ s1, w1 ] = guard[ k - 1 ];
		B.rod( 'hard', hp( s1, w1, top1 ), hp( s0, w0, top1 ), 0.02, 0.02, { segs: 5, ...iron } );
		B.rod( 'hard', hp( s1, w1, T.deck + 0.5 ), hp( s0, w0, T.deck + 0.5 ), 0.014, 0.014, { segs: 4, ...iron } );
		const m = hp( ( s0 + s1 ) / 2, ( w0 + w1 ) / 2, T.deck + 0.5 ), along = s0 === s1;
		colliders.addBox( new Vector3( m[ 0 ], m[ 1 ], m[ 2 ] ), new Vector3( along ? 0.03 : Math.abs( s1 - s0 ) / 2, 0.5, along ? Math.abs( w1 - w0 ) / 2 : 0.03 ), hry, { tag: 'hatchRail' } );

	}

	// stage 2: the corbelled walkway (a stone floor, iron railings)
	revolve( B, 'stone', [ [ 2.95, Y0 + 16.2 ], [ 3.02, Y0 + 16.35 ], [ 3.02, Y0 + 16.5 ], [ 3.28, Y0 + 16.65 ], [ 3.28, Y0 + 16.85 ], [ 3.58, Y0 + 17.05 ], [ 3.58, Y0 + 17.22 ], [ 3.86, Y0 + 17.32 ], [ 3.86, Y0 + 17.58 ], [ 3.82, Y0 + 17.6 ] ], ochre );
	revolve( B, 'stone', [ [ 3.82, T.deck ], [ 2.2, T.deck ] ], { segs: 48, tint: P.flags, data: PLASTER( 0.29, 0.3 ) } );
	revolve( B, 'stone', [ [ 2.2, T.deck - 0.2 ], [ T.rIn + 0.6, T.deck - 0.2 ] ], { segs: 48, tint: P.white, data: PLASTER( 0.31, 0.2 ) } );
	// the lantern floor: iron plates, top and underside, with the hatch left open
	lanternFloor( B, T.deck, { tint: lin( 0x2b2a27 ), data: IRON( 0.37, 0.25 ) }, { tint: P.white, data: PLASTER( 0.33, 0.2 ) } );
	const railR = 3.72, deck = T.deck;
	for ( let i = 0; i < 40; i ++ ) {

		const a = ( i + 0.5 ) / 40 * Math.PI * 2;
		B.rod( 'hard', [ Math.cos( a ) * railR, deck, Math.sin( a ) * railR ], [ Math.cos( a ) * railR, deck + 1.06, Math.sin( a ) * railR ], 0.022, 0.018, { segs: 5, ...iron } );

	}

	B.torus( 'hard', 0, deck + 1.06, 0, railR, 0.032, { radial: 6, tubular: 64, ...iron } );
	B.torus( 'hard', 0, deck + 0.55, 0, railR, 0.018, { radial: 5, tubular: 64, ...iron } );
	B.torus( 'hard', 0, deck + 0.08, 0, railR, 0.014, { radial: 4, tubular: 64, ...iron } );

	// stage 3: the lantern's cast-iron pedestal and deck, with a light rail for cleaning the glazing; a
	// door through the pedestal and one pane's height onto the walkway (pane 11, north-west)
	const ga = T.galleryDoor, gw = 0.16, gPast = [ ga + gw, ga - gw + Math.PI * 2 ];
	const top = deck + 1.38;
	revolve( B, 'hard', [ [ 2.34, deck ], [ 2.3, top ] ], { segs: 32, ...iron, arc: gPast } );
	revolve( B, 'hard', [ [ 2.2, top ], [ 2.2, deck ] ], { segs: 32, ...iron, arc: gPast } );
	sectorSlab( B, 'hard', 2.2, 2.75, gPast[ 0 ], gPast[ 1 ], top, top + 0.1, iron, 40 );
	for ( let i = 0; i < 24; i ++ ) {

		const a = ( i + 0.5 ) / 24 * Math.PI * 2;
		if ( Math.abs( Math.atan2( Math.sin( a - ga ), Math.cos( a - ga ) ) ) < gw + 0.12 ) continue;
		B.rod( 'hard', [ Math.cos( a ) * 2.66, top + 0.1, Math.sin( a ) * 2.66 ], [ Math.cos( a ) * 2.66, top + 0.95, Math.sin( a ) * 2.66 ], 0.016, 0.014, { segs: 4, ...iron } );

	}

	B.torus( 'hard', 0, top + 0.95, 0, 2.66, 0.022, { radial: 5, tubular: 48, ...iron } );
	// the door's frame: jambs through the pedestal and the sill, a head; the leaf is a moving part
	const doorTop = deck + 1.95;
	for ( const a of [ ga - gw, ga + gw ] ) {

		B.pushAt( 0, 0, 0, Math.PI / 2 - a );
		B.box( 'hard', 0, ( deck + doorTop ) / 2, 2.21, 0.06, doorTop - deck, 0.3, iron );
		B.pop();

	}

	B.pushAt( 0, 0, 0, Math.PI / 2 - ga );
	B.box( 'hard', 0, doorTop + 0.03, 2.1, 0.76, 0.06, 0.5, iron );
	B.pop();
	const leafHinge = new Vector3( Math.cos( ga - gw ) * 2.32, deck, Math.sin( ga - gw ) * 2.32 );
	parts.doors.push( lanternDoor( ctx, leafHinge, ga - gw, 2 * 2.32 * Math.sin( gw ) - 0.02, doorTop - deck - 0.02, rand ) );

	// the lantern: sixteen panes (a transparent mesh of their own), a diamond lattice of astragals, a sill
	// and a cornice ring
	const g0 = top + 0.12, g1 = g0 + 2.8, R = 2.0, N = 16;
	sectorSlab( B, 'hard', 1.98, 2.1, gPast[ 0 ], gPast[ 1 ], top + 0.1, top + 0.24, iron, 32 );
	const pw = 2 * R * Math.sin( Math.PI / N ), pc = R * Math.cos( Math.PI / N );
	for ( let i = 0; i < N; i ++ ) {

		const a = ( i + 0.5 ) / N * Math.PI * 2, y0 = i === GALLERY_PANE ? doorTop + 0.06 : g0;
		parts.glass.pushAt( 0, 0, 0, Math.PI / 2 - a );
		parts.glass.part( 'glass', quad01Part( pw, g1 - y0 ), 0, ( y0 + g1 ) / 2, pc, { tint: [ 0.2, 0.22, 0.2 ], data: [ rand.next(), 0, 0, 0 ] } );
		parts.glass.pop();

	}

	const at = ( k, y, rr = R + 0.04 ) => {

		const a = k / N * Math.PI * 2;
		return [ Math.cos( a ) * rr, y, Math.sin( a ) * rr ];

	};

	const gm = ( g0 + g1 ) / 2;
	for ( let k = 0; k < N; k ++ ) {

		for ( const s of [ 1, - 1 ] ) {

			// (not across the doorway)
			if ( ! ( ( k === GALLERY_PANE && s === 1 ) || ( k === GALLERY_PANE + 1 && s === - 1 ) ) ) B.rod( 'hard', at( k, g0 ), at( k + s, gm ), 0.024, 0.024, { segs: 4, ...iron } );
			B.rod( 'hard', at( k + s, gm ), at( k + 2 * s, g1 ), 0.024, 0.024, { segs: 4, ...iron } );

		}

	}

	const paneEnd = ( GALLERY_PANE + 1 ) / N * Math.PI * 2;
	B.torus( 'hard', 0, g0, 0, R + 0.04, 0.04, { radial: 5, tubular: 44, arc: Math.PI * 2 * ( 1 - 1 / N ), ry: - paneEnd, ...iron } );
	B.torus( 'hard', 0, g1, 0, R + 0.04, 0.05, { radial: 5, tubular: 48, ...iron } );

	// inside the lantern: the lens on its pedestal (the lens and its carriage turn: a moving part), the
	// clockwork in the pedestal, the burner's chimney up to the ventilator
	lensPedestal( ctx, parts, deck, gm );
	B.rod( 'hard', [ 0, gm + 0.75, 0 ], [ 0, g1 + 1.2, 0 ], 0.05, 0.05, { segs: 8, ...iron } );

	// walls to stand inside or outside of, the floor, the door
	colliders.addRing( 0, 0, 2.2, 2.4, deck - 0.05, g1, { gaps: [ [ ga - gw, ga + gw ] ], tag: 'lantern' } );
	colliders.addRing( 0, 0, 3.64, 3.9, deck - 0.05, deck + 2.6, { tag: 'railing' } );
	colliders.addCylinder( 0, 0, 0.55, deck - 0.05, gm + 0.8, { tag: 'pedestal' } );
	colliders.addSurface( ( x, z, maxY ) => deck <= maxY && x * x + z * z < 3.75 * 3.75 && ! inHatch( x, z ) ? deck : - Infinity, { inside: ( x, z ) => x * x + z * z < 15, kind: 'rock', tag: 'deck' } );

	// the cupola, the ventilator and the vane
	B.lathe( 'hard', 0, g1, 0, [ [ 2.24, 0 ], [ 2.24, 0.1 ], [ 2.02, 0.22 ], [ 1.72, 0.48 ], [ 1.3, 0.78 ], [ 0.78, 1.0 ], [ 0.36, 1.12 ], [ 0.3, 1.16 ], [ 0.3, 1.2 ] ], { segs: 32, ...iron } );
	B.lathe( 'hard', 0, g1 + 1.2, 0, [ [ 0.3, 0 ], [ 0.42, 0.14 ], [ 0.45, 0.3 ], [ 0.38, 0.46 ], [ 0.12, 0.58 ], [ 0.05, 0.62 ] ], { segs: 16, ...iron } );
	B.rod( 'hard', [ 0, g1 + 1.8, 0 ], [ 0, g1 + 2.6, 0 ], 0.022, 0.012, { segs: 5, ...iron } );
	B.pushAt( 0, g1 + 2.35, 0, 0.7 );
	B.box( 'hard', 0.25, 0, 0, 0.5, 0.14, 0.012, { tint: P.black, data: IRON( 0.5, 0.2 ) } );
	B.box( 'hard', - 0.3, 0, 0, 0.12, 0.02, 0.02, { tint: P.black, data: IRON( 0.5, 0.2 ) } );
	B.pop();

	// small windows lighting the stair, above the house's roof: their margins and sashes stand just
	// proud of the curved wall
	for ( const [ deg, h ] of [ [ 90, 6.4 ], [ 0, 9.4 ], [ - 90, 12.4 ], [ 180, 14.9 ] ] ) {

		const a = deg * Math.PI / 180, y = Y0 + h, rr = r( y );
		B.pushAt( 0, 0, 0, Math.PI / 2 - a );
		const w = 0.56, hh = 0.95, z0 = rr - 0.07, o = { tint: P.ochre, data: PLASTER( 0.19 ), u0: 0 };
		wallBox( B, 'stone', - w / 2 - 0.16, - w / 2, y - hh / 2 - 0.06, y + hh / 2, z0, rr + 0.05, o );
		wallBox( B, 'stone', w / 2, w / 2 + 0.16, y - hh / 2 - 0.06, y + hh / 2, z0, rr + 0.05, o );
		wallBox( B, 'stone', - w / 2 - 0.16, w / 2 + 0.16, y + hh / 2, y + hh / 2 + 0.18, z0, rr + 0.05, o );
		wallBox( B, 'stone', - w / 2 - 0.08, w / 2 + 0.08, y - hh / 2 - 0.1, y - hh / 2, z0, rr + 0.1, { ...o, tint: P.cope } );
		B.part( 'glass', quad01Part( w, hh ), 0, y, rr + 0.02, { tint: P.curtain, data: [ rand.next() * 0.3, 0, 0, 0 ] } );
		B.box( 'wood', 0, y, rr + 0.035, w, 0.04, 0.03, { grain: 0, tint: P.trim, data: WOOD( rand.next(), 0.3, 0.85 ) } );
		B.pop();

	}

	// the light itself: the flame inside the lens (src/station/Lamp.js lights it and turns the lens); it
	// lights the lantern and the walkway, and down the hatch
	lights.push( { position: new Vector3( 0, gm, 0 ), color: new Color( 1.0, 0.8, 0.52 ), intensity: 10, range: 6, kind: 'lantern', story: 'lamp' } );
	return { focal: gm };

}

// ------------------------------------------------------------------ the compound

function compound( ctx, village, parts ) {

	const { B, colliders } = ctx;
	const { x0, x1, z0, z1 } = STATION.compound, sg = STATION.southGate, eg = STATION.eastGate;
	const top = Y0 + 1.75, T = 0.5;
	const white = { tint: P.white, data: PLASTER( 0.53, 0.06 ) };
	const cope = { tint: P.cope, data: PLASTER( 0.59, 0.3 ) };
	// the four sides (outside on the left walking a -> b) and the gaps for the gates, in metres along each
	const sides = [
		{ a: [ x1, z0 ], b: [ x0, z0 ], gaps: [] },
		{ a: [ x0, z0 ], b: [ x0, z1 ], gaps: [] },
		{ a: [ x0, z1 ], b: [ x1, z1 ], gaps: [ [ sg.x - x0 - sg.w / 2, sg.x - x0 + sg.w / 2 ] ] },
		{ a: [ x1, z1 ], b: [ x1, z0 ], gaps: [ [ z1 - eg.z - eg.w / 2, z1 - eg.z + eg.w / 2 ] ] },
	];
	let u0 = 0;
	for ( const s of sides ) {

		const { L, ry } = wallFrame( s.a, s.b );
		B.pushAt( s.a[ 0 ], 0, s.a[ 1 ], ry );
		let x = 0;
		const runs = [];
		for ( const [ g0, g1 ] of s.gaps ) {

			runs.push( [ x, g0 ] );
			x = g1;

		}

		runs.push( [ x, L ] );
		for ( const [ a, b ] of runs ) {

			wallBox( B, 'stone', a, b, Y0 - 0.5, top, - T, 0, { ...white, u0 } );
			wallBox( B, 'stone', a - 0.03, b + 0.03, top, top + 0.1, - T - 0.04, 0.04, { ...cope, u0 } );
			const c = B.toWorld( ( a + b ) / 2, ( Y0 + top ) / 2, - T / 2 );
			colliders.addBox( c, new Vector3( ( b - a ) / 2, ( top - Y0 ) / 2 + 0.3, T / 2 ), ry, { tag: 'wall' } );

		}

		// gatepiers either side of each gap: square, white, with an ochre cap
		for ( const [ g0, g1 ] of s.gaps ) {

			for ( const gx of [ g0 - 0.36, g1 + 0.36 ] ) {

				wallBox( B, 'stone', gx - 0.38, gx + 0.38, Y0 - 0.5, Y0 + 2.25, - T / 2 - 0.38, - T / 2 + 0.38, { tint: P.white, data: PLASTER( 0.71, 0.2 ) } );
				wallBox( B, 'stone', gx - 0.44, gx + 0.44, Y0 + 2.25, Y0 + 2.4, - T / 2 - 0.44, - T / 2 + 0.44, { tint: P.ochre, data: PLASTER( 0.77 ) } );
				B.lathe( 'stone', gx, Y0 + 2.4, - T / 2, [ [ 0.001, 0 ], [ 0.52, 0 ], [ 0.44, 0.06 ], [ 0.001, 0.4 ] ], { segs: 4, ry: Math.PI / 4, tint: P.ochre, data: PLASTER( 0.79 ) } );
				const c = B.toWorld( gx, Y0 + 1.2, - T / 2 );
				colliders.addBox( c, new Vector3( 0.4, 1.3, 0.4 ), ry, { tag: 'wall' } );

			}

		}

		B.pop();
		u0 += L;

	}

	village.footprints.push( { x: ( x0 + x1 ) / 2, z: ( z0 + z1 ) / 2, r: Math.hypot( x1 - x0, z1 - z0 ) / 2 + 1, kind: 'building' } );

	// the east gate: two ledged and braced leaves hung on the gatepiers, opening into the yard
	const gx = x1 - T / 2, gh = 1.4, gl = eg.w / 2 - 0.02;
	const leaf = ( L ) => {

		const wood = ( s ) => ( { tint: P.door, data: WOOD( s, 0.45, 0.7, 3 ) } );
		L.box( 'wood', gl / 2, 0.15 + gh / 2, 0, gl, gh, 0.04, { grain: 1, ...wood( 0.51 ) } );
		for ( const y of [ 0.35, 0.15 + gh - 0.2 ] ) L.box( 'wood', gl / 2, y, 0.035, gl - 0.06, 0.12, 0.03, { grain: 0, ...wood( 0.53 ) } );
		L.beam( 'wood', [ 0.08, 0.38, 0.035 ], [ gl - 0.08, 0.15 + gh - 0.24, 0.035 ], 0.1, 0.03, { grain: 0, ...wood( 0.55 ) } );
		for ( const y of [ 0.35, 0.15 + gh - 0.2 ] ) L.box( 'hard', 0.2, y, - 0.03, 0.4, 0.04, 0.012, { tint: P.black, data: IRON( 0.57, 0.6 ) } );

	};

	for ( const [ hz, ry, swing ] of [ [ eg.z + eg.w / 2, Math.PI / 2, 1.45 ], [ eg.z - eg.w / 2, - Math.PI / 2, - 1.45 ] ] ) {

		parts.doors.push( door( ctx, { name: 'gate', hinge: new Vector3( gx, Y0, hz ), ry, swing, width: gl, height: gh + 0.2, leaf } ) );

	}

}

// ------------------------------------------------------------------ the landings

function landing( ctx, name, L ) {

	const { B, rand, colliders, terrain } = ctx;
	const [ dx, dz ] = L.dir, ry = Math.atan2( - dz, dx );
	const concrete = ( s ) => ( { tint: P.concrete, data: PLASTER( s, 0.3 ), v0: 0 } );
	const iron = { tint: P.black, data: IRON( 0.43, 0.55 ) };
	const head = L.head, pts = L.steps.pts, stageY = L.stage.y;
	B.pushAt( head.x, 0, head.z, ry ); // local x: seaward along the geo, z across it

	// the stage at the head of the geo, with its bollards and crane
	wallBox( B, 'stone', - 1.5, 7.5, - 2.5, stageY, - 3.3, 3.3, concrete( 0.11 ) );
	bollard( B, 6.6, stageY, - 2.6, rand.next() );
	bollard( B, 6.6, stageY, 2.6, rand.next() );
	derrick( B, 4.2, stageY, 2.45, rand );
	colliders.addBox( B.toWorld( 3, stageY - 1.5, 0 ), new Vector3( 4.5, 1.5, 3.3 ), ry, { walkable: true, tag: 'stage' } );

	// the flight: one riser per 0.19 m (or less) of the graded profile, one metre of run per point
	const W = 1.7, riser = 0.19;
	const at = ( t ) => {

		const i = clamp( Math.floor( t ), 0, pts.length - 2 ), f = clamp( t - i, 0, 1 );
		return lerp( pts[ i ][ 1 ], pts[ i + 1 ][ 1 ], f );

	};

	for ( let i = 1; i < pts.length; i ++ ) {

		const y0 = pts[ i - 1 ][ 1 ], dy = pts[ i ][ 1 ] - y0, n = Math.max( 1, Math.round( dy / riser ) );
		for ( let k = 1; k <= n; k ++ ) {

			const ta = i - 1 + ( k - 1 ) / n, tb = i - 1 + k / n, y = y0 + dy * k / n;
			wallBox( B, 'stone', - tb, - ta, y - 0.6, y, - W / 2, W / 2, { ...concrete( 0.13 ), u0: 0 } );
			colliders.addBox( B.toWorld( - ( ta + tb ) / 2, y - 0.3, 0 ), new Vector3( ( tb - ta ) / 2, 0.3, W / 2 ), ry, { walkable: true, solid: false, tag: 'steps' } );

		}

	}

	// iron railings on both sides: stanchions every 1.6 m, a handrail and a middle rail
	const end = pts.length - 1;
	for ( const side of [ - 1, 1 ] ) {

		const zs = side * ( W / 2 + 0.08 ), posts = [];
		for ( let t = 0.3; t <= end; t += 1.6 ) posts.push( [ - t, at( t ), zs ] );
		for ( let i = 0; i < posts.length; i ++ ) {

			const [ x, y, z ] = posts[ i ];
			B.rod( 'hard', [ x, y - 0.25, z ], [ x, y + 1.0, z ], 0.022, 0.02, { segs: 5, ...iron } );
			if ( i === 0 ) continue;
			const [ px, py, pz ] = posts[ i - 1 ];
			B.rod( 'hard', [ px, py + 1.0, pz ], [ x, y + 1.0, z ], 0.02, 0.02, { segs: 5, ...iron } );
			B.rod( 'hard', [ px, py + 0.5, pz ], [ x, y + 0.5, z ], 0.014, 0.014, { segs: 4, ...iron } );

		}

	}

	// the box of ropes and landing gear on the west flight, in a cleft beside the steps 33 m up
	if ( name === 'west' ) {

		let t = 0;
		while ( t < end && pts[ t ][ 1 ] < 33 ) t ++;
		const x = - t - 0.5, z = W / 2 + 1.1, w = B.toWorld( x, 0, z ), gy = terrain.heightAt( w.x, w.z );
		B.pushAt( x, gy, z, 0.06 );
		B.box( 'wood', 0, 0.36, 0, 1.5, 0.72, 0.82, { grain: 0, tint: P.box, data: WOOD( rand.next(), 0.55, 0.62, 3 ) } );
		B.box( 'wood', 0, 0.76, 0, 1.58, 0.07, 0.9, { grain: 0, tint: P.box, data: WOOD( rand.next(), 0.5, 0.6, 0 ) } );
		for ( const sx of [ - 0.5, 0.5 ] ) B.box( 'hard', sx, 0.38, 0, 0.05, 0.76, 0.84, { tint: C.iron, data: HARD( rand.next(), 0.7, 0.4, 0.6 ) } );
		ropeCoil( B, 1.25, 0, 0.1, 0.07, 0.3, 4, rand.next() );
		B.pop();
		colliders.addBox( B.toWorld( x, gy + 0.4, z ), new Vector3( 0.8, 0.4, 0.45 ), ry + 0.06, { tag: 'ropeBox' } );

	}

	B.pop();
	return { top: L.steps.to };

}

// a derrick crane on a landing stage: a mast, a jib over the water, a stay, the fall and hook, a winch
function derrick( B, x, y, z, rand ) {

	const iron = { tint: lin( 0x2a2c2c ), data: IRON( rand.next(), 0.5 ) };
	B.box( 'hard', x, y + 0.03, z, 0.8, 0.06, 0.8, iron );
	const mastTop = [ x, y + 4.4, z ], jibFoot = [ x + 0.1, y + 0.5, z ];
	const a = 38 * Math.PI / 180, jl = 5.6;
	const tip = [ x + 0.1 + Math.cos( a ) * jl, y + 0.5 + Math.sin( a ) * jl, z - 0.4 ];
	B.rod( 'hard', [ x, y, z ], mastTop, 0.11, 0.08, { segs: 8, ...iron } );
	B.rod( 'hard', jibFoot, tip, 0.09, 0.06, { segs: 8, ...iron } );
	B.tube( 'rope', [ new Vector3( ...mastTop ), new Vector3( ...tip ) ], 0.012, { tint: C.iron, data: [ rand.next(), 0, 0, 0 ] } );
	B.tube( 'rope', sagPoints( tip, [ tip[ 0 ] + 0.05, y + 1.6, tip[ 2 ] ], 0.02, 3 ), 0.012, { tint: C.iron, data: [ rand.next(), 0, 0, 0 ] } );
	B.torus( 'hard', tip[ 0 ] + 0.05, y + 1.5, tip[ 2 ], 0.07, 0.016, { rx: Math.PI / 2, radial: 4, tubular: 10, ...iron } );
	// the winch: two cheeks, the drum, a crank each side
	for ( const s of [ - 0.3, 0.3 ] ) B.box( 'hard', x - 0.55, y + 0.45, z + s, 0.5, 0.9, 0.05, iron );
	B.rod( 'hard', [ x - 0.55, y + 0.62, z - 0.3 ], [ x - 0.55, y + 0.62, z + 0.3 ], 0.12, 0.12, { segs: 10, ...iron } );
	B.tube( 'rope', [ new Vector3( x - 0.55, y + 0.74, z ), new Vector3( ...mastTop ), new Vector3( ...tip ) ], 0.012, { tint: C.iron, data: [ rand.next(), 0, 0, 0 ] } );
	for ( const s of [ - 0.36, 0.36 ] ) B.box( 'hard', x - 0.55, y + 0.47, z + s, 0.05, 0.36, 0.04, iron );

}

// ------------------------------------------------------------------ the tramways

// narrow-gauge rails (2 ft 6 in) on sleepers along a polyline, following the graded ground
function tramway( ctx, pts, { bufferEnd = true } = {} ) {

	const { B, rand, terrain } = ctx;
	const gauge = 0.762, step = 0.8;
	const samples = [];
	for ( let k = 0; k < pts.length - 1; k ++ ) {

		const [ ax, az ] = pts[ k ], [ bx, bz ] = pts[ k + 1 ], len = Math.hypot( bx - ax, bz - az );
		const n = Math.max( 1, Math.round( len / step ) );
		for ( let i = k ? 1 : 0; i <= n; i ++ ) samples.push( [ ax + ( bx - ax ) * i / n, az + ( bz - az ) * i / n ] );

	}

	const rails = [ [], [] ];
	for ( let i = 0; i < samples.length; i ++ ) {

		const [ x, z ] = samples[ i ];
		const [ ax, az ] = samples[ Math.max( 0, i - 1 ) ], [ bx, bz ] = samples[ Math.min( samples.length - 1, i + 1 ) ];
		const tx = bx - ax, tz = bz - az, tl = Math.hypot( tx, tz ) || 1, nx = - tz / tl, nz = tx / tl;
		const y = terrain.heightAt( x, z ) + 0.02;
		B.box( 'wood', x, y + 0.03, z, 1.25, 0.1, 0.18, { grain: 0, ry: Math.atan2( - nz, nx ), tint: P.sleeper, data: WOOD( rand.next(), 0.95 ) } );
		for ( const s of [ 0, 1 ] ) {

			const o = ( s - 0.5 ) * gauge;
			rails[ s ].push( [ x + nx * o, y + 0.115, z + nz * o ] );

		}

	}

	for ( const r of rails ) for ( let i = 1; i < r.length; i ++ ) {

		B.beam( 'hard', r[ i - 1 ], r[ i ], 0.05, 0.07, { extend: 0.02, tint: P.rail, data: HARD( rand.next(), 0.85, 0.7, 0.6 ) } );

	}

	// a timber buffer stop at the end of the line
	if ( bufferEnd ) {

		const [ x, z ] = samples[ samples.length - 1 ], [ px, pz ] = samples[ samples.length - 2 ];
		const y = terrain.heightAt( x, z );
		const ry = Math.atan2( - ( z - pz ), x - px );
		B.pushAt( x, y, z, ry );
		B.box( 'wood', 0.1, 0.45, 0, 0.25, 0.3, 1.3, { grain: 2, tint: P.sleeper, data: WOOD( rand.next(), 0.8 ) } );
		for ( const s of [ - 0.45, 0.45 ] ) B.box( 'wood', 0.25, 0.25, s, 0.2, 0.6, 0.2, { grain: 1, tint: P.sleeper, data: WOOD( rand.next(), 0.85 ) } );
		B.pop();

	}

}

// ------------------------------------------------------------------ the flagstaff, the chapel

function flagstaff( ctx, x, z ) {

	const { B, rand, colliders, terrain } = ctx;
	const gy = terrain.heightAt( x, z ), h = 9.5;
	wallBox( B, 'stone', x - 0.55, x + 0.55, gy - 0.4, gy + 0.45, z - 0.55, z + 0.55, { tint: P.white, data: PLASTER( 0.91, 0.1 ) } );
	B.cyl( 'wood', x, gy + 0.45, z, 0.07, 0.13, h, { segs: 10, tint: P.trim, data: WOOD( rand.next(), 0.5, 0.75 ) } );
	B.lathe( 'wood', x, gy + 0.45 + h, z, [ [ 0.07, 0 ], [ 0.11, 0.04 ], [ 0.11, 0.12 ], [ 0.001, 0.16 ] ], { segs: 10, tint: P.trim, data: WOOD( rand.next(), 0.5, 0.75 ) } );
	const yard = gy + 0.45 + h * 0.72;
	B.rod( 'wood', [ x - 1.1, yard, z ], [ x + 1.1, yard, z ], 0.04, 0.04, { segs: 6, tint: P.trim, data: WOOD( rand.next(), 0.5, 0.75 ) } );
	// halyards from the truck and the yardarms down to a cleat on the pole
	for ( const [ ax, ay ] of [ [ 0.1, gy + 0.45 + h ], [ 1.05, yard ], [ - 1.05, yard ] ] ) {

		B.tube( 'rope', [ new Vector3( x + ax, ay, z ), new Vector3( x + ax * 0.5 + 0.1, ( ay + gy + 1.6 ) / 2, z + 0.04 ), new Vector3( x + 0.13, gy + 1.6, z ) ], 0.007, { tint: C.rope, data: [ rand.next(), 0, 0, 0 ] } );

	}

	colliders.addBox( new Vector3( x, gy, z ), new Vector3( 0.55, 0.45, 0.55 ), 0, { tag: 'flagstaff' } );
	colliders.addCylinder( x, z, 0.14, gy, gy + h, { tag: 'flagstaff' } );

}

// Teampull Beannachadh: a drystone cell, 2.5 x 1.5 m inside, its long axis east-west, the doorway in the
// west wall offset to the south; a corbelled roof, 2.5 m high at the west gable and 2 m at the east
function chapel( ctx, village, cx, cz, gy ) {

	const { B, colliders } = ctx;
	const stone = ( s ) => ( { tint: P.gneiss, data: RUBBLE( s ), v0: gy } );
	const xw = - 1.95, xi0 = - 1.3, xi1 = 1.2, xe = 2.0, zn = - 1.72, zi0 = - 0.75, zi1 = 0.75, zs = 1.55;
	const eaves = gy + 1.3, ridgeZ = ( zn + zs ) / 2;
	const ridge = ( x ) => gy + lerp( 2.5, 2.0, ( x - xw ) / ( xe - xw ) );
	B.pushAt( cx, 0, cz );
	wallBox( B, 'stone', xw, xe, gy - 0.4, eaves, zn, zi0, stone( 0.21 ) );
	wallBox( B, 'stone', xw, xe, gy - 0.4, eaves, zi1, zs, stone( 0.23 ) );
	wallBox( B, 'stone', xi1, xe, gy - 0.4, eaves, zi0, zi1, stone( 0.25 ) );
	// the west wall, cut for the doorway (0.45 x 0.95 m, south of centre)
	const d0 = 0.02, d1 = 0.47, dh = gy + 0.95;
	wallBox( B, 'stone', xw, xi0, gy - 0.4, eaves, zi0, d0, stone( 0.27 ) );
	wallBox( B, 'stone', xw, xi0, gy - 0.4, eaves, d1, zi1, stone( 0.27 ) );
	wallBox( B, 'stone', xw, xi0, dh, eaves, d0, d1, stone( 0.27 ) );
	wallBox( B, 'stone', xw - 0.06, xi0 + 0.06, dh, dh + 0.14, d0 - 0.2, d1 + 0.2, stone( 0.29 ) ); // lintel
	// the dark inside, seen through the doorway
	poly( B, 'hard', [ [ xi0 + 0.25, gy, d0 ], [ xi0 + 0.25, gy, d1 ], [ xi0 + 0.25, dh, d1 ], [ xi0 + 0.25, dh, d0 ] ], ( q ) => [ q[ 2 ], q[ 1 ] ], { tint: [ 0.008, 0.008, 0.008 ], data: HARD( 0.3, 0, 0, 1 ) } );
	// the corbelled roof: two stone slopes up to the ridge, the gables filled, rough upstand copes
	const uv = ( q ) => [ q[ 0 ], Math.hypot( q[ 1 ] - eaves, q[ 2 ] - zn ) ];
	poly( B, 'stone', [ [ xw, eaves, zn ], [ xw, ridge( xw ), ridgeZ ], [ xe, ridge( xe ), ridgeZ ], [ xe, eaves, zn ] ], uv, stone( 0.33 ) );
	poly( B, 'stone', [ [ xe, eaves, zs ], [ xe, ridge( xe ), ridgeZ ], [ xw, ridge( xw ), ridgeZ ], [ xw, eaves, zs ] ], uv, stone( 0.35 ) );
	poly( B, 'stone', [ [ xw, eaves, zs ], [ xw, ridge( xw ), ridgeZ ], [ xw, eaves, zn ] ], ( q ) => [ q[ 2 ], q[ 1 ] - gy ], stone( 0.37 ) );
	poly( B, 'stone', [ [ xe, eaves, zn ], [ xe, ridge( xe ), ridgeZ ], [ xe, eaves, zs ] ], ( q ) => [ q[ 2 ], q[ 1 ] - gy ], stone( 0.39 ) );
	for ( const [ x, dx ] of [ [ xw, 1 ], [ xe, - 1 ] ] ) {

		// each half of the gable: a line of upright slabs along the slope, standing 0.1-0.2 m proud
		for ( const [ za, zb ] of [ [ zn, ridgeZ ], [ ridgeZ, zs ] ] ) {

			const ya = za === zn ? eaves : ridge( x ), yb = za === zn ? ridge( x ) : eaves;
			const L = Math.hypot( zb - za, yb - ya ), th = - Math.atan2( yb - ya, zb - za );
			B.pushAt( x + dx * 0.215, ( ya + yb ) / 2, ( za + zb ) / 2, 0, th );
			for ( let i = 0, n = 4; i < n; i ++ ) {

				const up = 0.1 + 0.08 * ( ( i * 3 + ( dx > 0 ? 1 : 2 ) + ( za === zn ? 0 : 1 ) ) % 3 ) / 2;
				wallBox( B, 'stone', - 0.235, 0.235, - 0.25, up, - L / 2 + i * L / n, - L / 2 + ( i + 1 ) * L / n - 0.02, stone( 0.41 + i * 0.07 ) );

			}

			B.pop();

		}

	}

	B.pop();
	colliders.addBox( new Vector3( cx + ( xw + xe ) / 2, gy + 1.2, cz + ( zn + zs ) / 2 ), new Vector3( ( xe - xw ) / 2, 1.3, ( zs - zn ) / 2 ), 0, { tag: 'chapel' } );
	village.footprints.push( { x: cx, z: cz, r: 3.2, kind: 'building' } );
	village.buildings.push( { name: 'chapel', x: cx, z: cz, floorY: gy, roofTop: gy + 2.5, stilts: false } );

}

// ------------------------------------------------------------------ the station

export function buildStation( ctx, village ) {

	const T = ctx.terrain, E = T.landing( 'east' ), W = T.landing( 'west' );
	const { x0, x1, z0, z1 } = STATION.compound, eg = STATION.eastGate, sg = STATION.southGate;

	// ---- the ground: the yard levelled, the tramways graded, the chapel's platform
	padRect( T, x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, Y0, 8 );
	T.pads.push( { x: ( x0 + x1 ) / 2, z: ( z0 + z1 ) / 2, radius: 18, height: Y0 } );
	const eTop = E.steps.to, wTop = W.steps.to;
	const eastTrack = [ [ eTop.x, eTop.z ], [ 18.5, 7.4 ], [ eg.x + 1.5, eg.z ] ];
	const westTrack = [ [ wTop.x, wTop.z ], [ - 280, 80 ], [ - 240, 62 ], [ - 200, 46 ], [ - 160, 35 ], [ - 120, 29 ], [ - 80, 27 ], [ - 45, 27.5 ], [ - 22, 27 ], [ sg.x, sg.z + 2.5 ] ];
	T.addPath( eastTrack, { width: 2.4, grade: 6, mask: 0.85 } );
	T.addPath( westTrack, { width: 2.4, grade: 8, mask: 0.85 } );
	const inEast = [ [ eg.x + 1.5, eg.z ], [ eg.x - 1.5, eg.z ], [ 4.4, eg.z ] ];
	const inSouth = [ [ sg.x, sg.z + 2.5 ], [ sg.x, sg.z - 2 ], [ sg.x, 11.5 ] ];
	T.addPath( inEast, { width: 1.8, mask: 0.9 } );
	T.addPath( inSouth, { width: 1.8, mask: 0.9 } );
	const ch = STATION.chapel, chY = mean( T, ch.x, ch.z, 2.5 );
	T.flatten( ch.x, ch.z, 3.2, chY, 3 );
	T.addPath( [ [ sg.x, sg.z + 2.5 ], [ - 13, 34 ], [ - 11.8, 45 ], [ ch.x - 2.9, ch.z + 0.25 ] ], { width: 0.9, mask: 0.7 } );
	T.addPath( [ [ eg.x + 1.5, eg.z - 1.2 ], [ STATION.flagstaff.x - 0.8, STATION.flagstaff.z + 0.8 ] ], { width: 0.8, mask: 0.6 } );
	// the tracks' grading lifts the ground near the heads of the flights: keep it under the treads
	cutUnderFlight( T, E );
	cutUnderFlight( T, W );
	T.buildMinMax();

	// ---- the buildings (and their moving parts: the lens, the doors and gate, the lantern's glass, built
	// apart and assembled by assembleStation)
	const parts = { doors: [], glass: new Builder(), lens: null, crank: null };
	const light = tower( ctx, parts );
	const lit = keepersHouse( ctx, village, parts );
	oilStore( ctx, village );
	compound( ctx, village, parts );
	village.buildings.push( { name: 'tower', x: 0, z: 0, floorY: Y0, roofTop: light.focal + 2.8, stilts: false } );

	// ---- the landings, the tramways, the flagstaff, the chapel
	landing( ctx, 'east', E );
	landing( ctx, 'west', W );
	tramway( ctx, [ ...eastTrack, ...inEast.slice( 1 ) ] );
	tramway( ctx, [ ...westTrack, ...inSouth.slice( 1 ) ] );
	flagstaff( ctx, STATION.flagstaff.x, STATION.flagstaff.z );
	chapel( ctx, village, ch.x, ch.z, chY );

	// a few of the lit windows light the yard at night (those facing it first)
	lit.sort( ( a, b ) => b.dir.z - a.dir.z );
	for ( const w of lit.slice( 0, 3 ) ) ctx.lights.push( { position: w.position, dir: w.dir, color: new Color( 1.0, 0.7, 0.42 ), intensity: 3, kind: 'window' } );

	village.station = { focal: light.focal, landings: { east: E, west: W }, tracks: { east: eastTrack, west: westTrack }, parts, room: ROOM, tower: TOWER };
	return village.station;

}
