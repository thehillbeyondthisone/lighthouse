// The game in Node for tools/shots (run by shots.mjs as a child process, which watches its memory):
// Dawn (the `webgpu` package) on the machine's Vulkan driver, or on SwiftShader (found under
// /opt/pw-browsers when VK_ICD_FILENAMES isn't set: a container with no GPU), behind the browser
// stand-in (browser.mjs), running the app's own ?bench path (src/core/Bench.js startBench). Shots are
// written as PNGs, plus a contact sheet when there are several.
//
// (Chromium can't run the game on a software adapter: it holds one to WebGPU's default limits, 16
// sampled textures per shader stage, and the water shader reads 24. Dawn here reports the driver's.)
//
//   node tools/shots/node-runner.mjs '{ "search": "?bench&shots=beach&...", "width": 960, "height": 540,
//                                        "out": "shots", "tag": "shot", "cols": 3 }'

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bgraShot, writePNG, writeSheet } from './png.mjs';

const ROOT = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );

function findSwiftShader() {

	const base = '/opt/pw-browsers';
	if ( ! existsSync( base ) ) return null;
	for ( const d of readdirSync( base ).sort() ) {

		const icd = join( base, d, 'chrome-linux', 'vk_swiftshader_icd.json' );
		if ( existsSync( icd ) ) return icd;

	}

	return null;

}

// search: the page's query string ('?bench&shots=...'); onShot( name, body ): each shot the bench
// uploads (u32 width, u32 height, BGRA8 rows); log( text ): progress
export async function runNode( { search, width, height, onShot, log = console.log } ) {

	if ( ! process.env.VK_ICD_FILENAMES ) {

		const icd = findSwiftShader();
		if ( icd ) {

			process.env.VK_ICD_FILENAMES = icd;
			log( 'Vulkan driver: SwiftShader (' + icd + ')' );

		}

	}

	await import( '../../test/headless.mjs' );
	const { installBrowser } = await import( './browser.mjs' );
	installBrowser( {
		search, width, height, root: join( ROOT, 'public' ),
		onPost: async ( url, body ) => {

			const name = decodeURIComponent( url.split( '/' ).pop() );
			if ( name.endsWith( '.bgra' ) ) onShot( name.slice( 0, - 5 ), Buffer.from( body.buffer, body.byteOffset, body.byteLength ) );

		},
	} );

	await import( '../../src/core/BenchSeed.js' );
	const { App } = await import( '../../src/App.js' );
	const { startBench } = await import( '../../src/core/Bench.js' );
	const { GPU } = await import( '../../src/engine/gpu/GPU.js' );
	const app = new App();
	// what is still compiling, every 30 s (a shader the software driver takes minutes over shows here)
	const beat = setInterval( () => {

		const p = GPU.pendingLabels();
		if ( p.length ) log( `compiling ${ p.length }: ${ p.slice( 0, 6 ).join( ', ' ) }` );

	}, 30000 );
	let stage = '';
	try {

		await app.init( ( p, text ) => {

			if ( text && text !== stage ) log( `${ ( p * 100 ).toFixed( 0 ) }% ${ stage = text }` );

		} );

	} finally {

		clearInterval( beat );

	}

	if ( GPU.syncCompiles.length ) log( `compiled on first use: ${ GPU.syncCompiles.length } pipelines` );
	log( 'loaded' );
	startBench( app );
	if ( ! window.__job ) throw new Error( 'the query string has neither &shots nor &auto' );
	await window.__job;

}

if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {

	const { search, width, height, out, tag, cols } = JSON.parse( process.argv[ 2 ] );
	const t0 = Date.now();
	const log = ( t ) => console.log( `  ${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ) } s: ${ t }` );
	const images = [];
	try {

		await runNode( {
			search, width, height, log,
			onShot: ( name, body ) => {

				const img = bgraShot( body );
				const file = join( out, name + '.png' );
				writePNG( file, img.w, img.h, img.rgba );
				images.push( img );
				log( 'shot ' + file );

			},
		} );
		if ( images.length > 1 ) {

			const file = join( out, `${ tag }-sheet.png` );
			writeSheet( file, images, cols || Math.min( 3, images.length ) );
			log( 'sheet ' + file );

		}

	} catch ( e ) {

		console.error( 'shots failed:', e.stack || e.message );
		process.exit( 1 );

	}

	process.exit( 0 ); // (Dawn keeps the event loop alive)

}
