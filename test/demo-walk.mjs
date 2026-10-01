// The demo's route on foot (no GPU): the real Player walks the Flannan station's colliders from the east
// landing stage up the flight, through the gate and the keepers' room, up the tower's stair and the iron
// stair through the hatch into the lantern, and out onto the walkway. Each leg is steered at waypoints.
//   node test/demo-walk.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../src/engine/index.js';

const DATA = join( dirname( fileURLToPath( import.meta.url ) ), '../public/terrain/flannan/' );
globalThis.fetch = async ( u ) => new Response( readFileSync( DATA + String( u ).split( '/' ).pop() ) );
const { loadFlannanData } = await import( '../src/world/flannan/FlannanData.js' );
const { FlannanTerrainData } = await import( '../src/world/flannan/FlannanTerrain.js' );
const { buildStation, TOWER, ROOM, STATION } = await import( '../src/world/flannan/Station.js' );
const { Builder } = await import( '../src/world/village/GeoBuilder.js' );
const { InstancedProps, Rand } = await import( '../src/world/Props.js' );
const { Colliders } = await import( '../src/world/Colliders.js' );
const { mulberry32 } = await import( '../src/util/Noise.js' );
const { Player } = await import( '../src/player/Player.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

const F = await loadFlannanData( DATA );
const terrain = new FlannanTerrainData( F.grids.island );
const B = new Builder(), colliders = new Colliders();
const village = { buildings: [], footprints: [] };
const st = buildStation( { B, terrain, colliders, rand: new Rand( mulberry32( 90210 ) ), lights: [], inst: new InstancedProps( B ), checks: [] }, village );

// the station's faces point the way they should: every lantern floor top faces up
{

	let up = 0, n = 0;
	const b = B.batches.hard;
	for ( let i = 0; i < b.idx.length; i += 3 ) {

		const p = ( k ) => new E.Vector3( b.pos[ b.idx[ i + k ] * 3 ], b.pos[ b.idx[ i + k ] * 3 + 1 ], b.pos[ b.idx[ i + k ] * 3 + 2 ] );
		const a = p( 0 ), c = p( 1 ), d = p( 2 );
		if ( Math.abs( a.y - TOWER.deck ) > 1e-4 || Math.abs( c.y - TOWER.deck ) > 1e-4 || Math.abs( d.y - TOWER.deck ) > 1e-4 || Math.max( Math.hypot( a.x, a.z ), Math.hypot( c.x, c.z ), Math.hypot( d.x, d.z ) ) > 1.9 ) continue;
		n ++;
		if ( c.clone().sub( a ).cross( d.clone().sub( a ) ).y >= - 1e-9 ) up ++;

	}

	ok( n > 10 && up === n, `the lantern floor's ${ n } top triangles all face up (${ up })` );

}

// ---- the player, on stubs for the sea (far below) and the input
const query = {
	n: 0, cpu: new Float32Array( 64 ), cpuValid: true,
	allocate( name, k ) { const s = this.n; this.n += k; return s; },
	setPoint() {},
};
const keys = new Set();
const input = { enabled: true, down: ( c ) => keys.has( c ), hit: () => false, consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0 };
const camera = new E.PerspectiveCamera( 60, 2, 0.1, 5000 );
const player = new Player( { camera, input, terrain, colliders, query, boat: null } );
const E0 = st.landings.east;
player.position.set( E0.stage.x, E0.stage.y, E0.stage.z );
player.position.y = Math.max( terrain.heightAt( E0.stage.x, E0.stage.z ), colliders.groundHeightAt( E0.stage.x, E0.stage.z, E0.stage.y + 1 ) );

// open the gate and the doors (the story does this with E)
for ( const d of st.parts.doors ) d.block.solid = false;

// walk to each waypoint in turn: face it, hold W; fails if stuck for 4 s
const dt = 1 / 60;
let t = 0;
function walk( pts, label, { reach = 0.45, expectStuck = false } = {} ) {

	keys.add( 'KeyW' );
	for ( const [ x, z ] of pts ) {

		let best = Infinity, since = 0;
		for ( ;; ) {

			const dx = x - player.position.x, dz = z - player.position.z, d = Math.hypot( dx, dz );
			if ( d < reach ) break;
			if ( d < best - 0.05 ) { best = d; since = 0; } else since += dt;
			if ( since > 4 ) {

				keys.delete( 'KeyW' );
				if ( ! expectStuck ) ok( false, `${ label }: stuck at ( ${ player.position.x.toFixed( 2 ) }, ${ player.position.y.toFixed( 2 ) }, ${ player.position.z.toFixed( 2 ) } ) going to ( ${ x.toFixed( 2 ) }, ${ z.toFixed( 2 ) } )` );
				return false;

			}

			player.yaw = Math.atan2( - dx, - dz );
			player.update( dt );
			t += dt;

		}

	}

	keys.delete( 'KeyW' );
	for ( let i = 0; i < 20; i ++ ) player.update( dt );
	return true;

}

const pos = () => `( ${ player.position.x.toFixed( 1 ) }, ${ player.position.y.toFixed( 2 ) }, ${ player.position.z.toFixed( 1 ) } )`;

// up the east flight (its graded points), then along the tramway to the gate
const flight = E0.steps.pts.filter( ( p, i ) => i % 4 === 0 ).map( ( p ) => [ p[ 0 ], p[ 2 ] ] );
const eg = STATION.eastGate;
if ( walk( [ [ E0.steps.from.x, E0.steps.from.z ], ...flight, [ E0.steps.to.x, E0.steps.to.z ], [ 18.5, 7.4 ], [ eg.x + 2, eg.z ] ], 'the east flight' ) ) {

	ok( Math.abs( player.position.y - STATION.yard ) < 1.5, `at the east gate after ${ t.toFixed( 0 ) } s: ${ pos() }` );

}

// through the gate, across the yard, in at the keepers' door
const D = ROOM.door;
if ( walk( [ [ eg.x - 2, eg.z ], [ 4.5, D.z ], [ D.x + 0.4, D.z ], [ D.x - 1.2, D.z ] ], 'the yard' ) ) {

	ok( Math.abs( player.position.y - TOWER.floor ) < 0.05, `in the keepers' room on its floor: ${ pos() }` );

}

// to the tower's doorway and in
const da = TOWER.doorAngle, at = ( r, a ) => [ Math.cos( a ) * r, Math.sin( a ) * r ];
if ( walk( [ [ - 2.5, 3.2 ], at( 4.0, da ), at( 3.0, da ), at( 1.8, da ) ], 'the tower door' ) ) {

	ok( Math.hypot( player.position.x, player.position.z ) < TOWER.rIn && Math.abs( player.position.y - TOWER.floor ) < 0.05, `inside the tower: ${ pos() }` );

}

// up the stair: round at r = 1.3 from the first tread to the landing
const helix = [];
for ( let a = TOWER.start + 0.2; a < TOWER.landingFrom + 0.15; a += 0.25 ) helix.push( at( 1.3, a ) );
const t0 = t;
if ( walk( helix, 'the stair', { reach: 0.35 } ) ) {

	ok( Math.abs( player.position.y - TOWER.landing ) < 0.05, `at the head of the stair after ${ ( t - t0 ).toFixed( 0 ) } s of climbing: ${ pos() }` );

}

// the iron stair through the hatch, then round the lantern to its door and out
const H = TOWER.hatch, hc = Math.cos( H.angle ), hs = Math.sin( H.angle );
const hp = ( s ) => [ hc * H.r - hs * s, hs * H.r + hc * s ];
const top = hp( H.run + 0.15 ), topA = Math.atan2( top[ 1 ], top[ 0 ] );
if ( walk( [ hp( - 0.05 ), hp( 0.8 ), top, at( 1.7, topA + 0.35 ) ], 'the hatch', { reach: 0.2 } ) ) {

	ok( Math.abs( player.position.y - TOWER.deck ) < 0.05, `in the lantern: ${ pos() }` );

}

const ga = TOWER.galleryDoor;
// round the lens the way that does not cross the hatch (increasing angle from its head)
const round = [];
const a1 = Math.atan2( player.position.z, player.position.x );
const da2 = ( ( ga - a1 ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 );
for ( let k = 1; k <= 8; k ++ ) round.push( at( 1.5, a1 + da2 * k / 8 ) );
if ( walk( [ ...round, at( 2.2, ga ), at( 3.0, ga ), at( 3.1, ga + 0.6 ) ], 'the lantern door' ) ) {

	const r = Math.hypot( player.position.x, player.position.z );
	ok( r > 2.5 && r < 3.5 && Math.abs( player.position.y - TOWER.deck ) < 0.05, `on the walkway: ${ pos() }, ${ t.toFixed( 0 ) } s from the landing stage` );

}

// the railing holds: walking straight out stops at it
walk( [ at( 6, ga + 0.6 ) ], 'the railing', { reach: 0.4, expectStuck: true } );
ok( Math.hypot( player.position.x, player.position.z ) < 3.7, `the railing holds you on the walkway: r ${ Math.hypot( player.position.x, player.position.z ).toFixed( 2 ) }` );

// a shut door holds too
for ( const d of st.parts.doors ) d.block.solid = true;
player.position.set( ...[ at( 1.4, ga )[ 0 ], TOWER.deck, at( 1.4, ga )[ 1 ] ] );
walk( [ at( 3.0, ga ) ], 'the shut door', { expectStuck: true } );
ok( Math.hypot( player.position.x, player.position.z ) < 2.2, `the shut lantern door holds you in: r ${ Math.hypot( player.position.x, player.position.z ).toFixed( 2 ) }` );

console.log( fails ? `${ fails } failed` : 'all passed' );
process.exit( fails ? 1 : 0 );
