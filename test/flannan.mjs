// Plain-node tests of the Flannan world (no GPU): the baked terrain, Eilean Mòr's cliffs and landings,
// the light station's geometry and colliders, the far shore and the Earth's curvature.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join( dirname( fileURLToPath( import.meta.url ) ), '../public/terrain/flannan/' );
globalThis.fetch = async ( u ) => new Response( readFileSync( DATA + String( u ).split( '/' ).pop() ) );
const { loadFlannanData } = await import( '../src/world/flannan/FlannanData.js' );
const { FlannanTerrainData } = await import( '../src/world/flannan/FlannanTerrain.js' );
const { buildStation, STATION } = await import( '../src/world/flannan/Station.js' );
const { FarShore, CURVATURE } = await import( '../src/world/flannan/FarShore.js' );
const { Builder } = await import( '../src/world/village/GeoBuilder.js' );
const { InstancedProps, Rand } = await import( '../src/world/Props.js' );
const { Colliders } = await import( '../src/world/Colliders.js' );
const { mulberry32 } = await import( '../src/util/Noise.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- the baked data
const F = await loadFlannanData( DATA );
ok( [ 'island', 'flannans', 'hebrides', 'uig', 'stkilda' ].every( ( k ) => F.grids[ k ] && F.grids[ k ].heights.length === F.grids[ k ].nx * F.grids[ k ].nz ), 'five grids baked, sizes match' );
ok( F.grids.island.at( 0, 0 ) > 60 && F.grids.island.at( 0, 0 ) < 80, `the DEM at the light: ${ F.grids.island.at( 0, 0 ).toFixed( 1 ) } m` );
let clisham = 0;
for ( const h of F.grids.hebrides.heights ) clisham = Math.max( clisham, h );
ok( clisham > 700 && clisham < 820, `the highest of Harris: ${ clisham.toFixed( 0 ) } m (the Clisham is 799 m)` );
const gh = F.places.gallanHead, ghd = Math.hypot( gh.x, gh.z ) / 1000;
ok( ghd > 31 && ghd < 35, `Gallan Head ${ ghd.toFixed( 1 ) } km away (33)` );

// ---- the island
const T = new FlannanTerrainData( F.grids.island );
ok( Math.abs( T.heightAt( 0, 0 ) - 80 ) < 3, `the ground at the light: ${ T.heightAt( 0, 0 ).toFixed( 1 ) } m` );
for ( const name of [ 'east', 'west' ] ) {

	const L = T.landing( name ), p = L.steps.pts;
	let rising = true, steepest = 0;
	for ( let i = 1; i < p.length; i ++ ) {

		rising = rising && p[ i ][ 1 ] > p[ i - 1 ][ 1 ];
		steepest = Math.max( steepest, p[ i ][ 1 ] - p[ i - 1 ][ 1 ] );

	}

	ok( rising && steepest <= 1.001, `${ name } flight climbs ${ ( L.steps.to.y - L.stage.y ).toFixed( 0 ) } m, never steeper than 45° (${ steepest.toFixed( 2 ) } m per m)` );
	ok( T.heightAt( L.stage.x + L.dir[ 0 ] * 12, L.stage.z + L.dir[ 1 ] * 12 ) < 0, `${ name } landing: open water off the stage` );

}

// cliffs, not beaches: along the north coast the ground stands 8 m or more above the sea 5 m inland
let sheer = 0;
for ( let x = - 150; x <= 150; x += 10 ) {

	let z = 0;
	while ( T.heightAt( x, z ) > 0.5 && z > - 600 ) z -= 0.5;
	if ( T.heightAt( x, z + 5 ) > 8 ) sheer ++;

}

ok( sheer > 24, `the north coast is cliffed: 8 m up within 5 m of the sea at ${ sheer } of 31 places` );

// ---- the station
const B = new Builder(), colliders = new Colliders(), lights = [];
const village = { buildings: [], footprints: [] };
const st = buildStation( { B, terrain: T, colliders, rand: new Rand( mulberry32( 90210 ) ), lights, inst: new InstancedProps( B ), checks: [] }, village );
ok( Math.abs( st.focal - STATION.focal ) < 0.5, `the lantern's focal plane at ${ st.focal.toFixed( 1 ) } m (101)` );
let finite = true, tris = 0;
for ( const k in B.batches ) {

	tris += B.batches[ k ].triangles;
	for ( const v of B.batches[ k ].pos ) finite = finite && Number.isFinite( v );

}

ok( finite && tris > 20000, `station geometry: ${ tris } triangles, all finite` );
ok( [ 'house', 'tower', 'store', 'chapel' ].every( ( n ) => village.buildings.some( ( b ) => b.name === n ) ), 'house, tower, store and chapel registered' );
ok( colliders.boxes.filter( ( b ) => b.tag === 'steps' && b.walkable ).length > 300, 'walkable steps on both flights' );
ok( lights.some( ( l ) => l.kind === 'lantern' && l.position.y > 95 ), 'the lamp in the lantern' );
ok( Math.abs( T.heightAt( - 12, 10 ) - STATION.yard ) < 0.05, 'the yard is level' );
const ch = STATION.chapel;
ok( Math.abs( ch.z - STATION.compound.z1 - 30 ) < 3, 'the chapel ~28 m south of the wall' );

// ---- the far shore and the curvature
const shore = new FarShore( F );
ok( shore.triangles > 100000 && shore.group.children.length === 4, `far shore: ${ shore.group.children.length } meshes, ${ shore.triangles } triangles` );
const drop35 = 35000 * 35000 * CURVATURE;
ok( drop35 > 80 && drop35 < 88, `the Earth drops ${ drop35.toFixed( 1 ) } m at 35 km (with refraction)` );
const horizon = Math.sqrt( 101 / CURVATURE ) / 1000;
ok( horizon > 37 && horizon < 40, `the sea horizon from the lantern: ${ horizon.toFixed( 1 ) } km` );

console.log( fails ? `${ fails } failed` : 'all passed' );
process.exit( fails ? 1 : 0 );
