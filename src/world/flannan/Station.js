import { Color, Matrix4, Vector3 } from '../../engine/index.js';
import { Part, quad01Part, sagPoints } from '../village/GeoBuilder.js';
import { windowUnit, doorUnit } from '../village/Buildings.js';
import { lin, WOOD, HARD, C, bollard, ropeCoil } from '../Props.js';
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

// a flat polygon (convex, counter-clockwise seen from the front) in the current frame; uvs from a function
function poly( B, key, pts, uvOf, { tint, data } ) {

	const a = new Vector3( ...pts[ 0 ] ), b = new Vector3( ...pts[ 1 ] ), c = new Vector3( ...pts[ 2 ] );
	const nrm = b.sub( a ).cross( c.sub( a ) ).normalize();
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
// the profile) with stone uvs in metres: u around (whole 2 m periods), v = y - v0
function revolve( B, key, profile, { segs = 48, v0 = Y0, tint, data } ) {

	const rRef = Math.max( ...profile.map( ( q ) => q[ 0 ] ) ), C0 = 2 * Math.PI * rRef;
	const ws = Math.max( 1, Math.round( C0 / 2 ) ) * 2 / C0;
	const p = [], n = [], uv = [], idx = [];
	for ( let i = 0; i < profile.length - 1; i ++ ) {

		const [ r0, y0 ] = profile[ i ], [ r1, y1 ] = profile[ i + 1 ];
		const dr = r1 - r0, dy = y1 - y0, l = Math.hypot( dr, dy ) || 1;
		const nr = dy / l, ny = - dr / l, base = p.length / 3;
		for ( let j = 0; j <= segs; j ++ ) {

			const t = j / segs * Math.PI * 2, c = Math.cos( t ), s = Math.sin( t ), u = t * rRef * ws;
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

			B.pushAt( 0, 0, - 0.16 );
			doorUnit( B, rand, o.at, S.floor, { ...WINDOW, doorPattern: 3, paint: 0.7, weather: 0.4 } );
			B.pop();
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

// the keepers' house: an L round the tower's south-west, the tower at its north-east corner
function keepersHouse( ctx, village ) {

	const S = { floor: Y0 + 0.45, eaves: Y0 + 3.95, top: Y0 + 4.5, t: 0.6, seed: 0.37 };
	// outline (outer faces) from the tower corner, counter-clockwise in plan: north face west, west face
	// south, the south faces and the inner corner, the east face back north to the tower
	const walls = [
		{ a: [ 1.8, - 1.8 ], b: [ - 22, - 1.8 ], quoins: [ false, true ], openings: [ { at: 8.3 }, { at: 12.3 }, { at: 16.3 }, { at: 20.3 } ] },
		{ a: [ - 22, - 1.8 ], b: [ - 22, 6 ], quoins: [ true, true ], openings: [ { at: 2.2 }, { at: 5.6 } ] },
		{ a: [ - 22, 6 ], b: [ - 6, 6 ], quoins: [ true, false ], openings: [ { at: 2.0 }, { at: 5.5 }, { at: 9.0 }, { at: 12.0, kind: 'door' }, { at: 14.4 } ] },
		{ a: [ - 6, 6 ], b: [ - 6, 15 ], quoins: [ false, true ], openings: [ { at: 2.4, kind: 'door' }, { at: 6.0 } ] },
		{ a: [ - 6, 15 ], b: [ 1.8, 15 ], quoins: [ true, true ], openings: [ { at: 2.2 }, { at: 5.6 } ] },
		{ a: [ 1.8, 15 ], b: [ 1.8, - 1.8 ], quoins: [ true, false ], openings: [ { at: 2.0 }, { at: 5.4 }, { at: 8.8, kind: 'door' } ] },
	];
	let u0 = 0;
	const lit = [];
	for ( const W of walls ) {

		W.u0 = u0;
		lit.push( ...stationWall( ctx, S, W ) );
		u0 += wallFrame( W.a, W.b ).L;

	}

	flatRoof( ctx, - 21.6, - 1.4, 1.4, 5.6, S.eaves );
	flatRoof( ctx, - 5.6, 5.6, 1.4, 14.6, S.eaves );
	chimney( ctx, - 15.5, 2.1, S.eaves - 0.2, Y0 + 5.9, 0.61 );
	chimney( ctx, - 8.5, 2.1, S.eaves - 0.2, Y0 + 5.9, 0.67 );
	chimney( ctx, - 2.1, 10.5, S.eaves - 0.2, Y0 + 5.9, 0.73 );

	const { colliders } = ctx;
	colliders.addBox( new Vector3( - 10.1, Y0 + 2.2, 2.1 ), new Vector3( 11.9, 2.6, 3.9 ), 0, { tag: 'house' } );
	colliders.addBox( new Vector3( - 2.1, Y0 + 2.2, 10.5 ), new Vector3( 3.9, 2.6, 4.5 ), 0, { tag: 'house' } );
	village.buildings.push( { name: 'house', x: - 10.1, z: 2.1, floorY: S.floor, roofTop: S.top, stilts: false } );
	village.buildings.push( { name: 'house-south', x: - 2.1, z: 10.5, floorY: S.floor, roofTop: S.top, stilts: false } );
	return lit;

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

function tower( ctx ) {

	const { B, rand, lights, colliders } = ctx;
	const white = { tint: P.white, data: PLASTER( 0.13 ) }, ochre = { tint: P.ochre, data: PLASTER( 0.19 ) };
	const iron = { tint: P.black, data: IRON( 0.23, 0.12 ) };
	const r = ( y ) => lerp( 3.2, 2.95, clamp( ( y - Y0 - 0.9 ) / 15.7, 0, 1 ) );

	// stage 1: the ochre base and the white shaft
	revolve( B, 'stone', [ [ 3.45, Y0 - 0.5 ], [ 3.45, Y0 + 0.72 ], [ 3.3, Y0 + 0.92 ], [ 3.2, Y0 + 0.92 ] ], ochre );
	revolve( B, 'stone', [ [ 3.2, Y0 + 0.9 ], [ 2.95, Y0 + 16.6 ] ], white );
	// stage 2: the corbelled walkway (a stone floor, iron railings)
	revolve( B, 'stone', [ [ 2.95, Y0 + 16.2 ], [ 3.02, Y0 + 16.35 ], [ 3.02, Y0 + 16.5 ], [ 3.28, Y0 + 16.65 ], [ 3.28, Y0 + 16.85 ], [ 3.58, Y0 + 17.05 ], [ 3.58, Y0 + 17.22 ], [ 3.86, Y0 + 17.32 ], [ 3.86, Y0 + 17.58 ], [ 3.82, Y0 + 17.6 ] ], ochre );
	B.cyl( 'stone', 0, Y0 + 17.55, 0, 3.82, 3.82, 0.06, { segs: 48, tint: P.flags, data: PLASTER( 0.29, 0.3 ) } );
	const railR = 3.72, deck = Y0 + 17.61;
	for ( let i = 0; i < 40; i ++ ) {

		const a = ( i + 0.5 ) / 40 * Math.PI * 2;
		B.rod( 'hard', [ Math.cos( a ) * railR, deck, Math.sin( a ) * railR ], [ Math.cos( a ) * railR, deck + 1.06, Math.sin( a ) * railR ], 0.022, 0.018, { segs: 5, ...iron } );

	}

	B.torus( 'hard', 0, deck + 1.06, 0, railR, 0.032, { radial: 6, tubular: 64, ...iron } );
	B.torus( 'hard', 0, deck + 0.55, 0, railR, 0.018, { radial: 5, tubular: 64, ...iron } );
	B.torus( 'hard', 0, deck + 0.08, 0, railR, 0.014, { radial: 4, tubular: 64, ...iron } );

	// stage 3: the lantern's cast-iron pedestal and deck, with a light rail for cleaning the glazing
	B.cyl( 'hard', 0, deck, 0, 2.3, 2.34, 1.38, { segs: 32, ...iron } );
	B.box( 'hard', 0, deck + 0.62, - 2.28, 0.62, 1.22, 0.08, { tint: P.black, data: IRON( 0.31, 0.2 ) } ); // the door onto the walkway
	const top = deck + 1.38;
	B.cyl( 'hard', 0, top, 0, 2.75, 2.72, 0.1, { segs: 40, ...iron } );
	for ( let i = 0; i < 24; i ++ ) {

		const a = ( i + 0.5 ) / 24 * Math.PI * 2;
		B.rod( 'hard', [ Math.cos( a ) * 2.66, top + 0.1, Math.sin( a ) * 2.66 ], [ Math.cos( a ) * 2.66, top + 0.95, Math.sin( a ) * 2.66 ], 0.016, 0.014, { segs: 4, ...iron } );

	}

	B.torus( 'hard', 0, top + 0.95, 0, 2.66, 0.022, { radial: 5, tubular: 48, ...iron } );

	// the lantern: sixteen panes, a diamond lattice of astragals, a sill and a cornice ring
	const g0 = top + 0.12, g1 = g0 + 2.8, R = 2.0, N = 16;
	B.cyl( 'hard', 0, top + 0.1, 0, 2.08, 2.1, 0.14, { segs: 32, ...iron } );
	const pw = 2 * R * Math.sin( Math.PI / N ), pc = R * Math.cos( Math.PI / N );
	for ( let i = 0; i < N; i ++ ) {

		const a = ( i + 0.5 ) / N * Math.PI * 2;
		B.pushAt( 0, 0, 0, Math.PI / 2 - a );
		// (glass kind 2: the lens shows through it, src/materials/Beacons.js)
		B.part( 'glass', quad01Part( pw, g1 - g0 ), 0, ( g0 + g1 ) / 2, pc, { tint: [ 0.2, 0.22, 0.2 ], data: [ rand.next() * 0.3, 2, 1, 0 ] } );
		B.pop();

	}

	const at = ( k, y, rr = R + 0.04 ) => {

		const a = k / N * Math.PI * 2;
		return [ Math.cos( a ) * rr, y, Math.sin( a ) * rr ];

	};

	const gm = ( g0 + g1 ) / 2;
	for ( let k = 0; k < N; k ++ ) {

		for ( const s of [ 1, - 1 ] ) {

			B.rod( 'hard', at( k, g0 ), at( k + s, gm ), 0.024, 0.024, { segs: 4, ...iron } );
			B.rod( 'hard', at( k + s, gm ), at( k + 2 * s, g1 ), 0.024, 0.024, { segs: 4, ...iron } );

		}

	}

	B.torus( 'hard', 0, g0, 0, R + 0.04, 0.04, { radial: 5, tubular: 48, ...iron } );
	B.torus( 'hard', 0, g1, 0, R + 0.04, 0.05, { radial: 5, tubular: 48, ...iron } );

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

	colliders.addCylinder( 0, 0, 3.4, Y0 - 0.5, deck, { tag: 'tower' } );
	// the lamp's glow on the lantern and the gallery (the beams and the lens: src/station/Lamp.js)
	lights.push( { position: new Vector3( 0, gm, 0 ), color: new Color( 1.0, 0.8, 0.52 ), intensity: 10, kind: 'lantern' } );
	return { focal: gm };

}

// ------------------------------------------------------------------ the compound

function compound( ctx, village ) {

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
			colliders.addBox( B.toWorld( - ( ta + tb ) / 2, y - 0.3, 0 ), new Vector3( ( tb - ta ) / 2, 0.3, W / 2 ), ry, { walkable: true, tag: 'steps' } );

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
	T.buildMinMax();

	// ---- the buildings
	const light = tower( ctx );
	const lit = keepersHouse( ctx, village );
	oilStore( ctx, village );
	compound( ctx, village );
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

	village.station = { focal: light.focal, landings: { east: E, west: W }, tracks: { east: eastTrack, west: westTrack } };
	return village.station;

}
