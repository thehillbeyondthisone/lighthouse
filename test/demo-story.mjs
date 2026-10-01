// The demo's night played through (no GPU): the Story director on the real station, terrain, colliders,
// player and lamp, with its pages answered by script (the code book: the first answer each time, unless
// SAY_NAME, then the island's name at the end). Checks the beats in order, the Watcher's exchange, the
// lamp's character, the haar, the light on Eilean Tighe, the gate, the journal at dawn, and the save.
//   node test/demo-story.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowser } from '../tools/shots/browser.mjs';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../public' );
Object.defineProperty( globalThis, 'navigator', { value: {}, writable: true, configurable: true } );
installBrowser( { search: '', root: ROOT } );

const E = await import( '../src/engine/index.js' );
const { loadFlannanData } = await import( '../src/world/flannan/FlannanData.js' );
const { FlannanTerrainData } = await import( '../src/world/flannan/FlannanTerrain.js' );
const { buildStation, TOWER, ROOM, STATION } = await import( '../src/world/flannan/Station.js' );
const { CURVATURE } = await import( '../src/world/flannan/FarShore.js' );
const { Builder } = await import( '../src/world/village/GeoBuilder.js' );
const { InstancedProps, Rand } = await import( '../src/world/Props.js' );
const { Colliders } = await import( '../src/world/Colliders.js' );
const { mulberry32 } = await import( '../src/util/Noise.js' );
const { Player } = await import( '../src/player/Player.js' );
const { Lamp } = await import( '../src/station/Lamp.js' );
const { HandLamp } = await import( '../src/station/HandLamp.js' );
const { Beams, hazeTransmittance } = await import( '../src/station/Beams.js' );
const { Story, clockText, weatherAt } = await import( '../src/story/Story.js' );
const { morse } = await import( '../src/story/Watcher.js' );
const { hazeDensityForVisibility } = await import( '../src/post/AirHaze.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- Morse
{

	const m = morse( 'SOS' );
	ok( m.on.length === 9 && m.letters.map( ( l ) => l[ 0 ] ).join( '' ) === 'SOS', 'Morse: SOS is nine elements, three letters' );
	ok( m.on[ 3 ][ 1 ] - m.on[ 3 ][ 0 ] === 3 && m.on[ 3 ][ 0 ] - m.on[ 2 ][ 1 ] === 3, 'Morse: a dash is three units, letters three apart' );

}

// ---- the weather and her lamp's visibility
{

	const her = new E.Vector3( 32503, 60, 5435 ), eye = new E.Vector3( 3, 99.8, 1 );
	const T = ( h ) => hazeTransmittance( eye, her, hazeDensityForVisibility( weatherAt( h ).vis ) );
	ok( T( 17 ) > 0.15, `at dusk her lamp is seen through ${ ( T( 17 ) * 100 ).toFixed( 0 ) } % of the haze` );
	ok( T( 22 ) < 1e-6, `in the haar it is lost (${ T( 22 ).toExponential( 1 ) })` );

}

// ---- the world, as the app builds it at the Flannans
const F = await loadFlannanData();
const terrainData = new FlannanTerrainData( F.grids.island );
const B = new Builder(), colliders = new Colliders();
const village = { buildings: [], footprints: [] };
const st = buildStation( { B, terrain: terrainData, colliders, rand: new Rand( mulberry32( 90210 ) ), lights: [], inst: new InstancedProps( B ), checks: [] }, village );
st.moving = { doors: st.parts.doors, telescope: { visible: true }, lens: null };

const keys = new Set();
const input = { enabled: true, keys, rightDown: false, down: ( c ) => keys.has( c ), hit: () => false, consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0, requestLock() {} };
const query = { n: 0, cpu: new Float32Array( 64 ), cpuValid: true, allocate( n, k ) { const s = this.n; this.n += k; return s; }, setPoint() {} };
const camera = new E.PerspectiveCamera( 70, 16 / 9, 0.1, 150000 );
const player = new Player( { camera, input, terrain: terrainData, colliders, query, boat: null } );
const toasts = [];
const handLamp = new HandLamp();
handLamp.setRest( new E.Vector3( - 4.95, TOWER.floor + 0.74, 3.12 ), 0.4 );
const app = {
	handLamp,
	village: { station: st }, lamp: new Lamp( { origin: new E.Vector3( 0, st.focal, 0 ) } ), input, camera, player, terrainData, colliders,
	settings: { timeOfDay: 12, timeSpeed: 0 }, setting: { dayOffset: 0 }, haze: { density: { value: 1 } }, clouds: { coverage: { value: 0.4 } },
	flannan: F, curvature: CURVATURE, freeCam: false, ui: { ui: { toast: ( t ) => toasts.push( t ) } },
};

const story = new Story( app );
const S = await import( '../src/story/Script.js' );
const shown = { cards: 0, read: [], choose: [], forms: 0, journal: null, end: null };
const SAY_NAME = process.argv.includes( '--say' );
story.ui.card = async () => { shown.cards ++; };
story.ui.fade = async () => {};
story.ui.read = async ( n ) => { shown.read.push( n.title ); };
story.ui.choose = async ( q ) => {

	shown.choose.push( q.title );
	if ( q.title === 'The code book' && SAY_NAME && q.options.length === 3 && q.options[ 1 ].label.includes( 'FLANNAN' ) ) return 1;
	return q.options[ 0 ].value;

};
story.ui.form = async ( f ) => {

	shown.forms ++;
	return Object.fromEntries( f.fields.map( ( q ) => [ q.key, q.options[ 2 ] ] ) );

};
story.ui.journal = async ( j ) => {

	shown.journal = j;
	return Object.fromEntries( j.remarks.map( ( r ) => [ r.key, true ] ) );

};
story.ui.end = ( e ) => { shown.end = e; };

const item = ( id ) => story.interact.get( id );
const step = ( sec, dt = 1 / 30 ) => {

	for ( let t = 0; t < sec; t += dt ) {

		player.update( dt );
		story.update( dt );

	}

};

// the landing
await story.start();
ok( story.beat === 'climb' && shown.cards === 2, `the night opens on two cards at ${ clockText( story.h ) }, the beat '${ story.beat }'` );
ok( Math.hypot( player.position.x - st.landings.east.stage.x, player.position.z - st.landings.east.stage.z ) < 3, 'you stand on the east landing\'s stage' );

// up to the yard, in at the keepers' door
player.position.set( 0, STATION.yard, 15 );
step( 0.2 );
ok( story.beat === 'room', `in the yard: '${ story.beat }'` );
player.position.set( - 3, TOWER.floor, 3 );
step( 0.2 );
ok( story.beat === 'letter', `in the keepers' room: '${ story.beat }'` );
await item( 'letter' ).use();
ok( story.beat === 'light' && shown.read.includes( S.LETTER.title ), 'the Board\'s letter read: now light the lamp' );

// the storm lantern on the table: looked at from across it, taken
ok( ! handLamp.carried && item( 'handLamp' ).when(), 'the storm lantern stands on the table' );
player.position.set( - 4.0, TOWER.floor, 2.4 );
player.yaw = Math.atan2( - ( - 4.95 + 4.0 ), - ( 3.12 - 2.4 ) );
player.pitch = - 0.6;
step( 0.1 );
ok( story.interact.current && story.interact.current.id === 'handLamp', `looking at it, the prompt: '${ story.interact.current && story.interact.current.id }'` );
item( 'handLamp' ).use();
ok( handLamp.carried && ! item( 'handLamp' ).when(), 'the lantern taken' );

// in the lantern, the lens is found looking at it at eye level (its focal plane is above your head)
{

	const a = TOWER.crankAngle + 2.2, r = 1.25;
	player.position.set( Math.cos( a ) * r, TOWER.deck, Math.sin( a ) * r );
	player.yaw = Math.atan2( Math.cos( a ), Math.sin( a ) );
	player.pitch = 0;
	step( 0.1 );
	ok( story.interact.current && story.interact.current.id === 'lens', `facing the lens: '${ story.interact.current && story.interact.current.id }'` );
	ok( story.goal() === S.GOALS.lightWait, `in the lantern before sunset: '${ story.goal() }'` );

}

// the lamp: wait for sunset, light it, wind the machine
ok( item( 'lens' ).text() === 'Wait for sunset', `before sunset the lens offers: '${ item( 'lens' ).text() }'` );
await item( 'lens' ).use();
ok( Math.abs( story.h - ( S.SUNSET - 0.03 ) ) < 0.01, `waited until ${ clockText( story.h ) }` );
step( 2 );
await item( 'lens' ).use();
ok( app.lamp.lit && story.beat === 'machine', `lamp lit at ${ clockText( story.h ) }` );
for ( let i = 0; i < 200 && app.lamp.wind < 1; i ++ ) item( 'crank' ).onHold( 1 / 30 );
step( 1 );
ok( app.lamp.wind > 0.99 && story.beat === 'watch', `machine wound (${ app.lamp.wind.toFixed( 2 ) }): '${ story.beat }'` );
step( 20 );
ok( app.lamp.glow > 0.9 && app.lamp.speed > 0.9, `after 20 s the flame is up (${ app.lamp.glow.toFixed( 2 ) }) and the lens turning` );

// keep the watch until Gallan Head shows
const watchText = item( 'stool' ).text();
ok( /Keep the watch \(until 16\.2\d\)/.test( watchText ), `the stool: '${ watchText }'` );
await item( 'stool' ).use();
step( 8 );
ok( story.watcher.state === 'calling' && story.beat === 'gallan', `${ clockText( story.h ) }: Gallan Head is ${ story.watcher.state } ('${ story.beat }')` );
ok( Beams.uniforms.far.value[ 0 ].w > 0 || story.watcher.lamp === 0, 'her lamp is drawn as a far light' );

// the telescope and the signal lamp
await item( 'telescope' ).use();
ok( story.hasTelescope && ! st.moving.telescope.visible, 'the telescope taken from the sill' );
player.position.set( TOWER.signalStand.x, TOWER.deck, TOWER.signalStand.z );
item( 'signal' ).use();
ok( story.signal && story.watcher.state === 'sending', 'at the signal lamp: she sends' );
const t0 = story.h;
for ( let i = 0; i < 6000 && story.watcher.state !== 'done'; i ++ ) {

	step( 0.1 );
	await new Promise( ( r ) => setImmediate( r ) );

}

const said = story.watcher.log.filter( ( l ) => l.from === 'you' ).map( ( l ) => l.text );
ok( story.watcher.state === 'done' && said.length >= 4, `the exchange: ${ said.length } answers from you, ${ clockText( t0 ) } to ${ clockText( story.h ) }` );
console.log( '     you sent: ' + said.join( ' / ' ) );
ok( story.rows.some( ( r ) => r[ 1 ].includes( 'Signals exchanged' ) ), 'the journal has it' );
step( 2.5 );
ok( ! story.signal && input.enabled, 'back from the signal lamp' );

// the six o'clock observations, the machine's bell
if ( story.h < 17.9 ) await item( 'stool' ).use();
while ( story.h < 17.95 ) step( 1 );
ok( story.goal().startsWith( 'Chalk the six' ), `${ clockText( story.h ) }: '${ story.goal() }'` );
await item( 'slate' ).use();
ok( story.obs[ 18 ] && shown.forms === 1, 'six o\'clock chalked on the slate' );
let bell = false;
const onWarn = app.lamp.onWarning;
app.lamp.onWarning = () => { bell = true; onWarn(); };
for ( let i = 0; i < 400 && ! bell; i ++ ) step( 1 );
ok( bell && story.goal() === S.GOALS.bell, `${ clockText( story.h ) }: the bell, '${ story.goal() }'` );
for ( let i = 0; i < 200 && app.lamp.wind < 1; i ++ ) item( 'crank' ).onHold( 1 / 30 );
ok( app.lamp.wind > 0.99 && story.goal() !== S.GOALS.bell, 'wound again' );

// the haar
while ( story.h < story.haar + 0.1 ) {

	const t = item( 'stool' ).text();
	if ( t && story.watcher.state === 'done' ) await item( 'stool' ).use();
	else step( 1 );
	if ( story._obsDue() ) await item( 'slate' ).use();

}

step( 1 );
ok( story.beat === 'haar' && weatherAt( story.h + 0.5, story.haar ).vis < 2, `${ clockText( story.h ) }: the haar ('${ story.beat }'), visibility ${ weatherAt( story.h + 0.5, story.haar ).vis.toFixed( 1 ) } km` );

// out on the walkway: the light on Eilean Tighe, then the gate
player.position.set( Math.cos( 1.2 ) * 3.0, TOWER.deck, Math.sin( 1.2 ) * 3.0 );
player.yaw = Math.atan2( - ( 164 - player.position.x ), - ( 540 - player.position.z ) );
player.pitch = - 0.1;
for ( let i = 0; i < 120 && ! story.islet; i ++ ) step( 1 );
ok( !! story.islet, `${ clockText( story.h ) }: a light on Eilean Tighe` );
step( 42 );
ok( story.flags.isletSeen && story.beat === 'gate', `seen (${ clockText( story.flags.isletSeen ) }); then the gate: '${ story.goal() }'` );
const gateWas = st.parts.doors.find( ( d ) => d.name === 'gate' ).target;
item( 'gate' ).use();
ok( story.beat === 'night' && st.parts.doors.find( ( d ) => d.name === 'gate' ).target !== gateWas, 'the gate seen to' );

// to dawn
if ( story._obsDue() ) await item( 'slate' ).use();
ok( item( 'stool' ).text() === 'Keep the watch until dawn', `the stool: '${ item( 'stool' ).text() }'` );
await item( 'stool' ).use();
ok( story.beat === 'dawn' && story.h > 32, `the small hours pass: ${ clockText( story.h ) } on the 4th ('${ story.beat }')` );
await item( 'lens' ).use();
step( 1 );
await item( 'lens' ).use();
ok( ! app.lamp.lit && story.beat === 'journal', `${ clockText( story.h ) }: the lamp out` );

// the journal
await item( 'journal' ).use();
ok( shown.end && story.beat === 'end', 'the journal written and signed: the end' );
const rows = shown.end.rows.map( ( r ) => r.join( ' ' ) );
console.log( rows.map( ( r ) => '     ' + r ).join( '\n' ) );
ok( rows.some( ( r ) => r.includes( 'Lamp lit' ) ) && rows.some( ( r ) => r.includes( 'Lamp extinguished' ) ), 'lit and extinguished' );
ok( rows.some( ( r ) => r.includes( 'Eilean Tighe' ) ) && rows.some( ( r ) => r.includes( 'gate' ) ), 'the remarks entered' );
ok( rows.some( ( r ) => r.startsWith( '03.00' ) && ( SAY_NAME ? r.includes( 'country' ) : r.includes( 'west landing' ) ) ), 'and a line at three o\'clock' );
ok( localStorage.getItem( 'sevenhunters.night1.v1' ) === null, 'the save is cleared at the end' );

// a night where the machine is wound before the lamp is lit: lighting it sets the watch going
{

	const s3 = new Story( app );
	s3.ui.card = s3.ui.fade = async () => {};
	s3.ui.read = async () => {};
	app.lamp.lit = false;
	app.lamp.wind = 0;
	await s3.start();
	s3.setBeat( 'light' );
	for ( let i = 0; i < 200 && app.lamp.wind < 1; i ++ ) s3.interact.get( 'crank' ).onHold( 1 / 30 );
	s3.h = S.SUNSET;
	await s3.interact.get( 'lens' ).use();
	ok( app.lamp.lit && s3.beat === 'watch', `wound first, then lit: '${ s3.beat }'` );
	s3.clearSave();

}

// a night where she is never answered: the haar takes her, the objective moves on
{

	const s2 = new Story( app );
	s2.ui.card = s2.ui.fade = async () => {};
	s2.ui.read = async () => {};
	await s2.start();
	app.lamp.lit = true;
	app.lamp.wind = 1;
	app.lamp.running = true;
	s2.setBeat( 'watch' );
	s2.h = 16.6;
	s2.update( 0.1 );
	s2.h = 21.5;
	app.lamp.wind = 1;
	for ( let i = 0; i < 5; i ++ ) s2.update( 0.1 );
	ok( s2.watcher.state === 'done' && ! /Gallan Head/.test( s2.goal() ), `unanswered, the haar takes her: '${ s2.goal() }'` );

}

console.log( fails ? `${ fails } failed` : 'all passed' );
process.exit( fails ? 1 : 0 );
