// Screenshots of the real game, no browser or GPU needed: the app runs in Node on Dawn (with the
// SwiftShader software driver in a container without a GPU) behind a small browser stand-in, renders
// the named review views through its own ?bench&shots path (src/core/Bench.js) and writes one PNG per
// view plus a contact sheet (tools/shots/node-runner.mjs, browser.mjs).
//
//   npm run shots -- [--views=beach,pier] [--w=960] [--h=540] [--frames=12] [--time=15.2]
//                    [--styles=photoreal,poster] [--times=12.4,15.5] [--adapt] [--dt=0.0167]
//                    [--params="setting=flannan"] [--tag=name] [--out=dir] [--cols=3]
//                    [--compile=async|serial|sync] [--maxmem=12] [--timeout=30]
//
// The views are src/core/DebugViews.js's review cameras (beach, pier, sunGlitter, village, underwater,
// aerial, palms, ...) and the bench's boatFish / boatHelm. --styles and --times repeat them per style
// (src/style/Styles.js) and per time of day in one run (loading is the slow part); the contact sheet
// has a row per time and style. --adapt: the auto exposure adapts at once (dusk and night exposed as
// the eye would see them; otherwise it holds its starting value with the clock stopped). --dt: the
// clock's step per frame, 1/60 s by default (the waves and clouds move as in play); --dt=0 holds
// everything still for pixel-comparable reference shots, but the volumetric clouds' temporal
// reconstruction is then still blocky after 24 frames. --params is appended to the page's query
// string (setting / any ?flag the app reads).
//
// Software rendering: loading (every pipeline compiled on the CPU) takes a minute or two, then each
// frame about a second at 960 x 540. The temporal filters settle in ~8 frames; the clouds, rebuilt a
// slice per frame, want more (~24) to be clean.
//
// The game runs in a child process watched from here: past --maxmem GB (default 12) or --timeout
// minutes it is stopped. --compile=serial compiles one pipeline at a time and prints each one's time,
// which names a shader the software driver chokes on (see src/ocean/WakeSim.js wakeInWindow).

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries( process.argv.slice( 2 ).map( ( a ) => {

	const m = a.match( /^--([^=]+)(?:=(.*))?$/ );
	return m ? [ m[ 1 ], m[ 2 ] ?? 'true' ] : [ a, 'true' ];

} ) );

const views = ( args.views || 'beach,pier,village' ).split( ',' );
const W = Number( args.w || 960 ), H = Number( args.h || 540 );
const frames = Number( args.frames || 12 );
const tag = args.tag || 'shot';
const out = resolve( args.out || 'shots' );
const styles = args.styles ? args.styles.split( ',' ) : [];
const cols = Number( args.cols || ( views.length > 1 ? Math.min( 4, views.length ) : Math.max( 1, Math.min( 4, styles.length ) ) ) );
const extra = `&dt=${ Number( args.dt ?? 1 / 60 ) }` + ( args.styles ? '&styles=' + args.styles : '' ) + ( args.times ? '&times=' + args.times : '' ) + ( args.adapt ? '&adapt' : '' )
	+ ( args.params ? '&' + args.params.replace( /^[?&]/, '' ) : '' );
const TIMEOUT = Number( args.timeout || 30 ) * 60 * 1000;
const MAX_MB = Number( args.maxmem || 12 ) * 1024;
const COMPILE = { async: '', serial: '&serialPipelines', sync: '&syncPipelines' }[ args.compile || 'async' ];
if ( COMPILE === undefined ) throw new Error( '--compile must be async, serial or sync' );

mkdirSync( out, { recursive: true } );
const search = `?bench&noAudio${ COMPILE }&shots=${ views.join( ',' ) }&w=${ W }&h=${ H }&frames=${ frames }&tag=${ tag }`
	+ ( args.time ? `&time=${ args.time }` : '' ) + extra;
console.log( 'page', search );

const runner = join( dirname( fileURLToPath( import.meta.url ) ), 'node-runner.mjs' );
const child = spawn( process.execPath, [ runner, JSON.stringify( { search, width: W, height: H, out, tag, cols } ) ], { stdio: [ 'ignore', 'inherit', 'inherit' ] } );
const t0 = Date.now();
const secs = () => ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 );
let peak = 0, stopped = null;
const stop = ( why ) => {

	stopped = why;
	child.kill( 'SIGKILL' );

};

const watch = setInterval( () => {

	try {

		const m = readFileSync( `/proc/${ child.pid }/status`, 'utf8' ).match( /VmRSS:\s+(\d+)/ );
		const mb = m ? Number( m[ 1 ] ) / 1024 : 0;
		peak = Math.max( peak, mb );
		if ( mb > MAX_MB ) stop( `memory passed ${ MAX_MB / 1024 } GB at ${ secs() } s (the last "compiling" line names what was building)` );

	} catch { /* exited, or no /proc */ }

}, 1000 );
const timer = setTimeout( () => stop( `timed out after ${ TIMEOUT / 60000 } min` ), TIMEOUT );

child.on( 'exit', ( code ) => {

	clearInterval( watch );
	clearTimeout( timer );
	const mem = peak ? `, peak memory ${ ( peak / 1024 ).toFixed( 1 ) } GB` : '';
	if ( stopped ) console.error( `shots stopped: ${ stopped }` );
	else console.log( `${ code === 0 ? 'done' : 'failed' } in ${ secs() } s${ mem }` );
	process.exit( stopped ? 1 : code ?? 1 );

} );
