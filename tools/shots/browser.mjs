// Just enough of a browser for the game to run in Node on Dawn (the `webgpu` package, see
// test/headless.mjs): window, document, location, localStorage, a canvas whose WebGPU context renders
// into a plain texture, fetch from public/, and image decoding (PNG, and JPEG through jpeg-js) for the
// loaders' asset hooks (__assetFile / __assetImage, __debrisFile / __debrisImage).
//
// Elements are inert: the UI builds into them and nothing shows; no input arrives. A property the stand-in
// doesn't know reads as `inert` (callable, every property is itself, 0 or '' as a primitive), so UI code
// runs through without doing anything.
//
//   import '../../test/headless.mjs';
//   installBrowser( { search: '?bench&noAudio', width: 960, height: 540, root: 'public', onPost } );
//   const { App } = await import( '../../src/App.js' );

import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import jpeg from 'jpeg-js';
import { readPNG } from './png.mjs';

const inert = new Proxy( function () {}, {
	get: ( t, k ) => {

		if ( k === Symbol.toPrimitive ) return ( hint ) => ( hint === 'number' ? 0 : '' );
		if ( k === Symbol.iterator ) return function* () {};
		if ( k === 'then' || typeof k === 'symbol' ) return undefined; // not a promise, not special
		if ( k === 'length' ) return 0;
		return inert;

	},
	set: () => true,
	apply: () => inert,
	construct: () => inert,
} );

// unknown properties of the stand-in's objects read as `inert`
const permissive = ( o ) => new Proxy( o, { get: ( t, k, r ) => ( k in t ? Reflect.get( t, k, r ) : typeof k === 'symbol' ? undefined : inert ) } );

class Element {

	constructor( tag, ns ) {

		this.tagName = this.nodeName = String( tag ).toUpperCase();
		this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml';
		this.nodeType = 1;
		this.children = [];
		this.childNodes = this.children;
		this.parentNode = this.parentElement = null;
		this.style = new Proxy( {}, { get: ( t, k ) => ( k in t ? t[ k ] : k === 'setProperty' || k === 'removeProperty' ? () => {} : k === 'getPropertyValue' ? () => '' : typeof k === 'symbol' ? undefined : '' ) } );
		this.dataset = {};
		this._attrs = new Map();
		const set = new Set();
		this.classList = {
			add: ( ...c ) => c.forEach( ( x ) => set.add( x ) ), remove: ( ...c ) => c.forEach( ( x ) => set.delete( x ) ),
			toggle: ( c, force ) => ( ( force ?? ! set.has( c ) ) ? ( set.add( c ), true ) : ( set.delete( c ), false ) ),
			contains: ( c ) => set.has( c ), replace: ( a, b ) => ( set.delete( a ), set.add( b ) ), forEach: ( f ) => set.forEach( f ),
			get length() { return set.size; }, [ Symbol.iterator ]: () => set.values(),
		};
		this.width = 300; this.height = 150; // a canvas's defaults
		this.value = ''; this.checked = false; this.disabled = false; this.hidden = false;
		this.scrollTop = this.scrollLeft = 0;
		this.clientWidth = this.clientHeight = this.offsetWidth = this.offsetHeight = this.scrollWidth = this.scrollHeight = 0;
		this._text = ''; this._html = '';
		this._gpu = this._2d = null; // (set on first use: unset, they would read as inert)

	}

	get className() { return [ ...this.classList ].join( ' ' ); }
	set className( v ) { for ( const c of [ ...this.classList ] ) this.classList.remove( c ); this.classList.add( ...String( v ).split( /\s+/ ).filter( Boolean ) ); }
	get textContent() { return this._text; }
	set textContent( v ) { this._text = String( v ?? '' ); this.children.length = 0; }
	get innerText() { return this._text; }
	set innerText( v ) { this.textContent = v; }
	get innerHTML() { return this._html; }
	set innerHTML( v ) { this._html = String( v ?? '' ); this.children.length = 0; }
	get outerHTML() { return ''; }
	get firstChild() { return this.children[ 0 ] || null; }
	get lastChild() { return this.children[ this.children.length - 1 ] || null; }
	get firstElementChild() { return this.firstChild; }
	get lastElementChild() { return this.lastChild; }
	get childElementCount() { return this.children.length; }
	get nextSibling() { return null; }
	get previousSibling() { return null; }
	get nextElementSibling() { return null; }
	get previousElementSibling() { return null; }
	get isConnected() { return true; }
	get ownerDocument() { return globalThis.document; }

	appendChild( c ) {

		if ( ! c || typeof c !== 'object' ) return c;
		if ( c.parentNode && c.parentNode.removeChild ) c.parentNode.removeChild( c );
		this.children.push( c );
		c.parentNode = c.parentElement = this;
		return c;

	}

	append( ...cs ) { for ( const c of cs ) this.appendChild( typeof c === 'object' ? c : textNode( c ) ); }
	prepend( ...cs ) { for ( const c of cs.reverse() ) { this.appendChild( typeof c === 'object' ? c : textNode( c ) ); this.children.unshift( this.children.pop() ); } }
	insertBefore( c ) { return this.appendChild( c ); }
	insertAdjacentElement( pos, c ) { return this.appendChild( c ); }
	insertAdjacentHTML() {}
	insertAdjacentText() {}
	before() {}
	after() {}
	replaceWith() {}
	removeChild( c ) { const i = this.children.indexOf( c ); if ( i >= 0 ) this.children.splice( i, 1 ); if ( c ) c.parentNode = c.parentElement = null; return c; }
	remove() { if ( this.parentNode && this.parentNode.removeChild ) this.parentNode.removeChild( this ); }
	replaceChildren( ...cs ) { this.children.length = 0; this.append( ...cs ); }
	cloneNode() { return element( this.tagName, this.namespaceURI ); }
	setAttribute( k, v ) { this._attrs.set( k, String( v ) ); }
	setAttributeNS( ns, k, v ) { this.setAttribute( k, v ); }
	getAttribute( k ) { return this._attrs.has( k ) ? this._attrs.get( k ) : null; }
	hasAttribute( k ) { return this._attrs.has( k ); }
	removeAttribute( k ) { this._attrs.delete( k ); }
	toggleAttribute( k, force ) { const on = force ?? ! this._attrs.has( k ); on ? this._attrs.set( k, '' ) : this._attrs.delete( k ); return on; }
	addEventListener() {}
	removeEventListener() {}
	dispatchEvent() { return true; }
	// (a fresh element rather than null: UI code that finds a part of its own markup and fills it in)
	querySelector() { return element( 'div' ); }
	querySelectorAll() { return []; }
	getElementsByTagName() { return []; }
	getElementsByClassName() { return []; }
	closest() { return null; }
	matches() { return false; }
	contains( n ) { return n === this; }
	getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
	getClientRects() { return []; }
	focus() {}
	blur() {}
	click() {}
	scrollIntoView() {}
	scrollTo() {}
	animate() { return permissive( { finished: Promise.resolve(), cancel() {}, play() {}, pause() {}, finish() {}, addEventListener() {} } ); }
	getAnimations() { return []; }
	requestPointerLock() {}
	requestFullscreen() { return Promise.resolve(); }
	attachShadow() { return element( '#shadow-root' ); }
	toDataURL() { return 'data:,'; }
	toBlob( cb ) { cb( new Blob( [] ) ); }
	convertToBlob() { return Promise.resolve( new Blob( [] ) ); }
	transferControlToOffscreen() { return this; }

	getContext( kind ) {

		if ( kind === 'webgpu' ) return this._gpu || ( this._gpu = new CanvasGPUContext( this ) );
		if ( kind === '2d' ) return this._2d || ( this._2d = context2d( this ) );
		return null;

	}

}

const element = ( tag, ns ) => permissive( new Element( tag, ns ) );
const textNode = ( text ) => Object.assign( element( '#text' ), { nodeType: 3, _text: String( text ) } );

// a canvas's WebGPU context: renders into a texture of the canvas's size (nothing presents it)
class CanvasGPUContext {

	constructor( canvas ) {

		this.canvas = canvas;
		this.config = null;
		this.texture = null;

	}

	configure( config ) { this.config = config; this.texture = null; }
	unconfigure() { this.config = null; }
	getConfiguration() { return this.config; }

	getCurrentTexture() {

		const { width, height } = this.canvas, c = this.config;
		if ( ! this.texture || this.texture.width !== width || this.texture.height !== height ) {

			if ( this.texture ) this.texture.destroy();
			this.texture = c.device.createTexture( { label: 'canvas', size: [ width, height ], format: c.format, usage: ( c.usage ?? GPUTextureUsage.RENDER_ATTACHMENT ) | GPUTextureUsage.COPY_SRC } );

		}

		return this.texture;

	}

}

// 2D context: draws nothing, except that an image drawn whole at (0, 0) reads back with getImageData
// (how the loaders get the pixels of a decoded image)
function context2d( canvas ) {

	const ctx = {
		canvas, _image: null,
		drawImage( img, x = 0, y = 0 ) { if ( img && img._rgba && ! x && ! y ) this._image = img; },
		getImageData( x, y, w, h ) {

			const im = this._image;
			if ( im && ! x && ! y && im.width === w && im.height === h ) return new ImageData( new Uint8ClampedArray( im._rgba.buffer, im._rgba.byteOffset, im._rgba.byteLength ), w, h );
			return new ImageData( w, h );

		},
		createImageData: ( w, h ) => new ImageData( typeof w === 'object' ? w.width : w, typeof w === 'object' ? w.height : h ),
		putImageData() {},
		measureText: ( t ) => ( { width: String( t ).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 } ),
		createLinearGradient: () => ( { addColorStop() {} } ),
		createRadialGradient: () => ( { addColorStop() {} } ),
		createConicGradient: () => ( { addColorStop() {} } ),
		createPattern: () => null,
		getTransform: () => ( { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } ),
		isPointInPath: () => false,
	};
	// (drawing calls and unknown state are no-ops)
	return new Proxy( ctx, { get: ( t, k ) => ( k in t ? t[ k ] : typeof k === 'symbol' ? undefined : () => {} ), set: ( t, k, v ) => ( ( t[ k ] = v ), true ) } );

}

class ImageData {

	constructor( a, b, c ) {

		if ( typeof a === 'number' ) {

			this.width = a; this.height = b;
			this.data = new Uint8ClampedArray( a * b * 4 );

		} else {

			this.data = a; this.width = b;
			this.height = c ?? a.length / 4 / b;

		}

	}

}

// RGBA8 pixels (top row first) of a PNG or JPEG file's bytes
export function decodeImage( bytes ) {

	const b = Buffer.from( bytes.buffer ? new Uint8Array( bytes.buffer, bytes.byteOffset, bytes.byteLength ) : bytes );
	if ( b[ 0 ] === 0x89 && b[ 1 ] === 0x50 ) {

		const { width, height, rgba } = readPNG( b );
		return { data: rgba, width, height };

	}

	if ( b[ 0 ] === 0xff && b[ 1 ] === 0xd8 ) {

		const { width, height, data } = jpeg.decode( b, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 256, maxMemoryUsageInMB: 2048 } );
		return { data, width, height };

	}

	throw new Error( 'decodeImage: not a PNG or JPEG' );

}

const MIME = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ogg': 'audio/ogg', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary' };

class Storage {

	constructor() { this._m = new Map(); }
	getItem( k ) { return this._m.has( k ) ? this._m.get( k ) : null; }
	setItem( k, v ) { this._m.set( k, String( v ) ); }
	removeItem( k ) { this._m.delete( k ); }
	clear() { this._m.clear(); }
	key( i ) { return [ ...this._m.keys() ][ i ] ?? null; }
	get length() { return this._m.size; }

}

class Observer {

	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() { return []; }

}

// search: the page's query string ('?bench&...'); width / height: the window; root: the directory the
// page's URLs resolve in (public/); onPost( url, body ): fetch POSTs (the bench's shot uploads)
export function installBrowser( { search = '', width = 960, height = 540, root, onPost = async () => {} } ) {

	const file = ( url ) => {

		const path = String( url ).replace( /^[a-z]+:\/\/[^/]+/i, '' ).split( /[?#]/ )[ 0 ];
		return readFileSync( join( root, decodeURIComponent( path ) ) );

	};

	const arrayBuffer = ( b ) => b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength );

	const html = element( 'html' ), head = element( 'head' ), body = element( 'body' );
	html.append( head, body );
	const document = permissive( {
		documentElement: html, head, body, nodeType: 9,
		createElement: ( t ) => element( t ), createElementNS: ( ns, t ) => element( t, ns ), createTextNode: textNode,
		createDocumentFragment: () => element( '#document-fragment' ), createComment: () => element( '#comment' ),
		getElementById: () => element( 'div' ), querySelector: () => element( 'div' ), querySelectorAll: () => [],
		getElementsByTagName: () => [], getElementsByClassName: () => [], elementFromPoint: () => null,
		addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
		visibilityState: 'visible', hidden: false, readyState: 'complete', pointerLockElement: null, fullscreenElement: null, activeElement: body,
		exitPointerLock() {}, exitFullscreen: () => Promise.resolve(), hasFocus: () => true,
		fonts: permissive( { ready: Promise.resolve(), add() {}, load: async () => [], check: () => true, addEventListener() {} } ),
		cookie: '', title: '',
	} );

	const location = {
		search, hash: '', pathname: '/', origin: 'http://127.0.0.1', protocol: 'http:', host: '127.0.0.1', hostname: '127.0.0.1', port: '',
		href: 'http://127.0.0.1/' + search, reload() {}, assign() {}, replace() {}, toString() { return this.href; },
	};

	const realFetch = globalThis.fetch;
	const fetch = async ( url, opts = {} ) => {

		const u = String( url && url.url ? url.url : url );
		if ( opts.method === 'POST' ) {

			await onPost( u, opts.body );
			return new Response( 'ok' );

		}

		if ( /^(https?:\/\/(?!127\.0\.0\.1[/:]|localhost[/:])|data:|blob:)/.test( u ) ) return realFetch( url, opts );
		try {

			return new Response( file( u ), { status: 200, headers: { 'content-type': MIME[ extname( u.split( /[?#]/ )[ 0 ] ) ] || 'application/octet-stream' } } );

		} catch {

			return new Response( 'Not found: ' + u, { status: 404 } );

		}

	};

	const windowProps = {
		window: globalThis, self: globalThis, document, location, fetch,
		innerWidth: width, innerHeight: height, outerWidth: width, outerHeight: height, devicePixelRatio: 1,
		screen: { width, height, availWidth: width, availHeight: height },
		addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
		requestAnimationFrame: ( cb ) => setTimeout( () => cb( performance.now() ), 16 ),
		cancelAnimationFrame: ( id ) => clearTimeout( id ),
		requestIdleCallback: ( cb ) => setTimeout( () => cb( { didTimeout: false, timeRemaining: () => 10 } ), 1 ),
		cancelIdleCallback: ( id ) => clearTimeout( id ),
		matchMedia: () => ( { matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } ),
		getComputedStyle: () => new Proxy( {}, { get: ( t, k ) => ( k === 'getPropertyValue' ? () => '' : typeof k === 'symbol' ? undefined : '' ) } ),
		scrollTo() {}, focus() {}, blur() {}, open() {}, alert() {}, getSelection: () => null,
		localStorage: new Storage(), sessionStorage: new Storage(),
		ResizeObserver: Observer, MutationObserver: Observer, IntersectionObserver: Observer, PerformanceObserver: Observer,
		Node: Element, Element, HTMLElement: Element, HTMLCanvasElement: Element, HTMLInputElement: Element, HTMLImageElement: Element, SVGElement: Element,
		ImageData,
		OffscreenCanvas: function ( w, h ) { return Object.assign( element( 'canvas' ), { width: w, height: h } ); },
		createImageBitmap: async ( src ) => {

			const img = src instanceof Blob ? decodeImage( new Uint8Array( await src.arrayBuffer() ) ) : src && src.data ? src : { data: new Uint8Array( 4 ), width: 1, height: 1 };
			return { width: img.width, height: img.height, _rgba: img.data, close() {} };

		},
		CSS: { supports: () => false, escape: ( s ) => String( s ) },
		// the loaders' headless hooks (src/engine/loaders/GLTF.js, StallKit.js, ScannedDebris.js)
		__assetFile: async ( url ) => arrayBuffer( file( url ) ),
		__assetImage: async ( bytes ) => decodeImage( bytes ),
		__debrisFile: async ( url ) => arrayBuffer( file( url ) ),
		__debrisImage: async ( url ) => decodeImage( file( url ) ),
	};
	for ( const [ k, v ] of Object.entries( windowProps ) ) Object.defineProperty( globalThis, k, { value: v, writable: true, configurable: true } );
	for ( const k of [ 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'FocusEvent', 'InputEvent', 'TouchEvent', 'CustomEvent' ] ) {

		if ( ! globalThis[ k ] ) globalThis[ k ] = class extends Event {};

	}

	Object.assign( globalThis.navigator, {
		userAgent: 'Node (tools/shots)', platform: 'Linux', language: 'en', languages: [ 'en' ], maxTouchPoints: 0, hardwareConcurrency: 4,
		getGamepads: () => [], vibrate: () => false, clipboard: { writeText: async () => {} },
	} );

}
