// Screenshots of the real game without a GPU: the app runs in headless Chromium with WebGPU on the
// SwiftShader software driver, renders the named review views through the ?bench&shots path
// (src/core/Bench.js) and uploads each frame to a small collector here, which writes PNGs and one
// contact sheet per run.
//
//   npm run shots -- [--views=beach,pier] [--w=960] [--h=540] [--frames=12] [--time=15.2]
//                    [--params="style=poster&setting=flannan"] [--tag=name] [--out=dir] [--cols=3]
//
// --params is appended to the page URL (style / setting / any ?flag the app reads). Software
// rendering is slow: the first load compiles every pipeline on the CPU (minutes), then each frame
// takes a second or more at 960 x 540. Keep --frames low; the temporal filters settle in ~8.
// Needs Playwright's Chromium (preinstalled in Claude Code cloud containers under /opt/pw-browsers).

import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { writePNG } from './png.mjs';

const args = Object.fromEntries( process.argv.slice( 2 ).map( ( a ) => {

	const m = a.match( /^--([^=]+)(?:=(.*))?$/ );
	return m ? [ m[ 1 ], m[ 2 ] ?? 'true' ] : [ a, 'true' ];

} ) );

const views = ( args.views || 'beach,pier,village' ).split( ',' );
const W = Number( args.w || 960 ), H = Number( args.h || 540 );
const frames = Number( args.frames || 12 );
const tag = args.tag || 'shot';
const out = resolve( args.out || 'shots' );
const cols = Number( args.cols || Math.min( 3, views.length ) );
const extra = args.params ? '&' + args.params.replace( /^[?&]/, '' ) : '';
const APP_PORT = Number( args.port || 5192 ), COLLECT_PORT = APP_PORT + 1;
const TIMEOUT = Number( args.timeout || 30 ) * 60 * 1000;

mkdirSync( out, { recursive: true } );

async function loadPlaywright() {

	for ( const spec of [ 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs' ] ) {

		try {

			return ( await import( spec ) ).chromium;

		} catch { /* next */ }

	}

	throw new Error( 'Playwright not found: npm i -g playwright (its Chromium must be installed)' );

}

// ---- collector: tag-view.bgra (u32 width, u32 height, BGRA8 rows) -> PNG, kept for the contact sheet
const images = [];
const collector = http.createServer( ( req, res ) => {

	res.setHeader( 'Access-Control-Allow-Origin', '*' );
	res.setHeader( 'Access-Control-Allow-Headers', '*' );
	if ( req.method !== 'POST' ) return res.end();
	const chunks = [];
	req.on( 'data', ( c ) => chunks.push( c ) );
	req.on( 'end', () => {

		const body = Buffer.concat( chunks );
		const name = decodeURIComponent( req.url.slice( 1 ) );
		if ( name.endsWith( '.bgra' ) ) {

			const w = body.readUInt32LE( 0 ), h = body.readUInt32LE( 4 );
			const rgba = new Uint8Array( w * h * 4 );
			for ( let i = 0; i < w * h; i ++ ) {

				const s = 8 + i * 4;
				rgba[ i * 4 ] = body[ s + 2 ]; rgba[ i * 4 + 1 ] = body[ s + 1 ]; rgba[ i * 4 + 2 ] = body[ s ]; rgba[ i * 4 + 3 ] = 255;

			}

			const file = join( out, name.replace( /\.bgra$/, '.png' ) );
			writePNG( file, w, h, rgba );
			images.push( { name, w, h, rgba } );
			console.log( 'shot', file );

		} else writeFileSync( join( out, name ), body );

		res.end( 'ok' );

	} );

} ).listen( COLLECT_PORT, '127.0.0.1' );

// contact sheet: the run's shots in a grid (same size each), 4 px gutters
function writeSheet() {

	if ( images.length < 2 ) return;
	const { w, h } = images[ 0 ], G = 4;
	const rows = Math.ceil( images.length / cols );
	const SW = cols * w + ( cols + 1 ) * G, SH = rows * h + ( rows + 1 ) * G;
	const sheet = new Uint8Array( SW * SH * 4 ).fill( 18 );
	for ( let i = 3; i < sheet.length; i += 4 ) sheet[ i ] = 255;
	images.forEach( ( img, k ) => {

		if ( img.w !== w || img.h !== h ) return;
		const ox = G + ( k % cols ) * ( w + G ), oy = G + Math.floor( k / cols ) * ( h + G );
		for ( let y = 0; y < h; y ++ ) sheet.set( img.rgba.subarray( y * w * 4, ( y + 1 ) * w * 4 ), ( ( oy + y ) * SW + ox ) * 4 );

	} );
	const file = join( out, `${ tag }-sheet.png` );
	writePNG( file, SW, SH, sheet );
	console.log( 'sheet', file );

}

// ---- the app (Vite dev server) and the browser
const vite = await createServer( { logLevel: 'error', server: { port: APP_PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } } );
await vite.listen();
const chromium = await loadPlaywright();
const browser = await chromium.launch( {
	// --channel=chromium: the full browser in its new headless mode (default: Playwright's headless shell)
	...( args.channel ? { channel: args.channel } : {} ),
	// software rendering: compiles and frames take long enough to trip the GPU watchdog and the hang
	// monitor, which kill the GPU process (the WebGPU device is lost) or the page
	args: [ '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface', '--ignore-gpu-blocklist',
		'--disable-gpu-watchdog', '--disable-hang-monitor', '--disable-gpu-process-crash-limit', '--disable-renderer-backgrounding',
		...( args.chromelog ? [ '--enable-logging=stderr', '--v=0' ] : [] ) ],
	// --chromelog: the browser's own log (GPU process exits, crashes) on stderr
	...( args.chromelog ? { logger: { isEnabled: ( n ) => n === 'browser', log: ( n, sev, msg ) => console.error( '[chrome]', String( msg ).slice( 0, 300 ) ) } } : {} ),
} );

let failed = false;
try {

	const page = await browser.newPage( { viewport: { width: W, height: H } } );
	let errors = 0;
	page.on( 'console', ( m ) => {

		const t = m.text();
		if ( m.type() === 'error' || /WebGPU|failed|Error/.test( t ) ) if ( errors ++ < 40 ) console.log( '[page]', t.split( '\n' ).slice( 0, 4 ).join( ' | ' ) );

	} );
	page.on( 'pageerror', ( e ) => console.log( '[page error]', e.message ) );
	const crashed = new Promise( ( _, reject ) => page.on( 'crash', () => reject( new Error( 'the page crashed' ) ) ) );
	crashed.catch( () => {} );
	const url = `http://127.0.0.1:${ APP_PORT }/?bench&noAudio&syncPipelines&shots=${ views.join( ',' ) }&w=${ W }&h=${ H }&frames=${ frames }&tag=${ tag }`
		+ ( args.time ? `&time=${ args.time }` : '' ) + `&collector=${ encodeURIComponent( `http://127.0.0.1:${ COLLECT_PORT }/` ) }${ extra }`;
	console.log( 'open', url );
	const t0 = Date.now();
	const secs = () => ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 );
	// the loading screen's status every 30 s (the first load compiles every pipeline in software)
	const progress = setInterval( () => {

		page.evaluate( () => {

			const st = [ '.loader-status', '.loader-pct' ].map( ( s ) => ( document.querySelector( '#loader ' + s ) || {} ).textContent || '' ).join( ' ' );
			// the pipelines still compiling (src/engine/gpu/GPU.js pendingLabels)
			const g = window.__app && window.__app.gpu;
			const pending = g && g.pendingLabels ? g.pendingLabels() : [];
			return st + ( pending.length ? ` · compiling ${ pending.length }: ${ pending.slice( 0, 6 ).join( ', ' ) }` : '' );

		} ).then( ( st ) => console.log( `  ${ secs() } s: ${ st }` ), () => {} );

	}, 30000 );
	await page.goto( url, { timeout: TIMEOUT } );
	// the loader gets .tw-error when init throws (src/ui/UI.js setLoadingError)
	await Promise.race( [ crashed, page.waitForFunction( () => window.__job || document.querySelector( '#loader.tw-error' ), null, { timeout: TIMEOUT, polling: 1000 } ) ] );
	if ( ! await page.evaluate( () => !! window.__job ) ) throw new Error( 'the app failed to start: ' + await page.textContent( '#loader .loader-status' ) );
	console.log( `loaded in ${ secs() } s, rendering ${ views.length } view(s)` );
	await Promise.race( [ crashed, page.evaluate( () => window.__job ) ] );
	clearInterval( progress );
	console.log( `done in ${ secs() } s` );
	writeSheet();

} catch ( e ) {

	failed = true;
	console.error( 'shots failed:', e.message );

} finally {

	await browser.close();
	await vite.close();
	collector.close();

}

process.exit( failed ? 1 : 0 );
