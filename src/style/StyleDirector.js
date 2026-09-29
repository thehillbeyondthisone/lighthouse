import { Vector4 } from '../engine/math/index.js';
import { FrameUniforms } from '../engine/render/Frame.js';
import { Readback } from '../engine/gpu/Readback.js';
import { STYLES } from './Styles.js';

// Drives the active style (Styles.js) every frame:
//   - blends the colour script's keys by the true sun elevation;
//   - converts the authored display colours (fog, sky, clouds) into scene radiance through the
//     inverse of the tone curve at the current exposure (the app's exposure times the auto exposure,
//     read back from the GPU a frame or two late), so they land on screen as authored;
//   - writes the `frame.style*` uniforms read by the haze (fog), the sky (gradient, clouds) and the
//     lighting (bands, tints), and the post chain's grade parameters.
// The photoreal style writes zeros: every style branch in the shaders is skipped.
//
//   const style = new StyleDirector( app ); style.set( 'poster' );
//   per frame: style.update() before the render, style.afterRender() after the post chain

// ---- the final pass's tone curve (three's ACES fit, src/post/PostFX.js) and its inverse
const ACES_IN = [ [ 0.59719, 0.35458, 0.04823 ], [ 0.07600, 0.90834, 0.01566 ], [ 0.02840, 0.13383, 0.83777 ] ];
const ACES_OUT = [ [ 1.60475, - 0.53108, - 0.07367 ], [ - 0.10208, 1.10813, - 0.00605 ], [ - 0.00327, - 0.07276, 1.07602 ] ];

function inv3( m ) {

	const [ [ a, b, c ], [ d, e, f ], [ g, h, i ] ] = m;
	const A = e * i - f * h, B = - ( d * i - f * g ), C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [
		[ A / det, - ( b * i - c * h ) / det, ( b * f - c * e ) / det ],
		[ B / det, ( a * i - c * g ) / det, - ( a * f - c * d ) / det ],
		[ C / det, - ( a * h - b * g ) / det, ( a * e - b * d ) / det ],
	];

}

const ACES_IN_INV = inv3( ACES_IN ), ACES_OUT_INV = inv3( ACES_OUT );
const mul = ( m, v ) => m.map( ( r ) => r[ 0 ] * v[ 0 ] + r[ 1 ] * v[ 1 ] + r[ 2 ] * v[ 2 ] );

// the tone curve's input (scene colour x exposure) that produces the display-linear colour `rgb`
export function acesInverse( rgb ) {

	const y = mul( ACES_OUT_INV, rgb.map( ( v ) => Math.min( Math.max( v, 1e-5 ), 0.985 ) ) ).map( ( v ) => Math.max( v, 0 ) );
	const x = y.map( ( v ) => {

		// RRTAndODTFit( x ) = v, solved for x >= 0
		const a = 1 - 0.983729 * v, b = 0.0245786 - 0.4329510 * v, c = - ( 0.000090537 + 0.238081 * v );
		return ( - b + Math.sqrt( b * b - 4 * a * c ) ) / ( 2 * a );

	} );
	return mul( ACES_IN_INV, x ).map( ( v ) => Math.max( v * 0.6, 0 ) );

}

// forward curve, for tests: scene colour x exposure -> display linear
export function acesForward( c ) {

	const x = mul( ACES_IN, c.map( ( v ) => v / 0.6 ) ).map( ( v ) => ( v * ( v + 0.0245786 ) - 0.000090537 ) / ( v * ( 0.983729 * v + 0.4329510 ) + 0.238081 ) );
	return mul( ACES_OUT, x ).map( ( v ) => Math.min( Math.max( v, 0 ), 1 ) );

}

const srgbToLinear = ( c ) => ( c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ) );

// '#rrggbb' -> linear rgb (cached)
const _hex = new Map();
export function hexToLinear( hex ) {

	let v = _hex.get( hex );
	if ( ! v ) {

		const n = parseInt( hex.slice( 1 ), 16 );
		v = [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ].map( ( x ) => srgbToLinear( x / 255 ) );
		_hex.set( hex, v );

	}

	return v;

}

const lum = ( c ) => 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ];
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const lerp3 = ( a, b, t ) => [ lerp( a[ 0 ], b[ 0 ], t ), lerp( a[ 1 ], b[ 1 ], t ), lerp( a[ 2 ], b[ 2 ], t ) ];

// hue of a colour at luminance 1 (a multiplier that tints without changing brightness)
function chroma( c ) {

	const l = Math.max( lum( c ), 1e-4 );
	return c.map( ( v ) => Math.min( v / l, 3 ) );

}

// the colour script at a sun elevation: every leaf blended between the two neighbouring keys;
// colours as linear display rgb, numbers as numbers
function blendKeys( keys, elev ) {

	let i = 0;
	while ( i < keys.length - 2 && elev > keys[ i + 1 ].elev ) i ++;
	const a = keys[ i ], b = keys[ i + 1 ] || a;
	const t = b === a ? 0 : Math.min( Math.max( ( elev - a.elev ) / ( b.elev - a.elev ), 0 ), 1 );
	const out = {};
	for ( const sec of [ 'sky', 'fog', 'light', 'clouds' ] ) {

		out[ sec ] = {};
		for ( const k in a[ sec ] ) {

			const va = a[ sec ][ k ], vb = b[ sec ][ k ] ?? va;
			out[ sec ][ k ] = typeof va === 'string' ? lerp3( hexToLinear( va ), hexToLinear( vb ), t ) : lerp( va, vb, t );

		}

	}

	return out;

}

const F = FrameUniforms.fields;
const setV = ( field, rgb, w = 0 ) => field.value.set( rgb[ 0 ], rgb[ 1 ], rgb[ 2 ], w );

export class StyleDirector {

	constructor( app ) {

		this.app = app;
		this.name = 'photoreal';
		this.preset = STYLES.photoreal;
		this.autoExposure = 1; // the GPU's adapted exposure multiplier, read back
		this._readback = new Readback( { byteLength: 4, label: 'style exposure' } );
		this._readback.onData = ( buf ) => {

			const v = new Float32Array( buf )[ 0 ];
			if ( Number.isFinite( v ) && v > 0 ) this.autoExposure = v;

		};
		// the grade the Effects tab had before a style took over (restored by the photoreal style)
		const P = app.post.params;
		this._photorealPost = { saturation: P.saturation.value, contrast: P.contrast.value, warmth: P.warmth.value, grain: P.grain.value, vignette: P.vignette.value, sharpen: P.sharpen.value, bloom: P.bloom.value };
		this.key = null; // the blended key of the last update (debug / UI)
		for ( const k of [ 'styleMix', 'styleFogNear', 'styleFogFar', 'styleFogSunNear', 'styleFogSunFar', 'styleFogShape', 'styleFogShape2',
			'styleSkyZenith', 'styleSkyHorizon', 'styleSkyGlow', 'styleCloudLit', 'styleCloudShade', 'styleLight', 'styleShadowTint', 'styleSunTint' ] ) {

			if ( ! F[ k ] ) throw new Error( 'StyleDirector: frame uniform ' + k + ' missing' );
			F[ k ].value = new Vector4();

		}

	}

	set( name ) {

		this.name = STYLES[ name ] ? name : 'photoreal';
		this.preset = STYLES[ this.name ];
		const P = this.app.post.params;
		const post = { ...this._photorealPost, ...( this.preset.post || {} ) };
		for ( const k in post ) if ( P[ k ] ) P[ k ].value = post[ k ];
		const g = this.preset.grade || { mode: 0 };
		P.gradeMode.value = g.mode || 0;
		if ( g.mode === 1 ) {

			P.gradeLift.value.set( ...g.lift, 0 );
			P.gradeGamma.value.set( ...g.gamma, 0 );
			P.gradeGain.value.set( ...g.gain, g.saturation ?? 1 );

		} else if ( g.mode === 2 ) {

			P.printResponse.value.set( ...g.response, g.contrast );
			setV( P.printDark, hexToLinear( g.dark ) );
			setV( P.printMid, hexToLinear( g.mid ) );
			setV( P.printLight, hexToLinear( g.light ) );
			setV( P.printHalation, hexToLinear( g.halationColor ), g.halation );
			P.printFx.value.set( g.swirl, g.vignette, g.paper, g.dust );
			P.printFx2.value.set( g.grain, g.exposure ?? 0, 0, 0 );

		}

		if ( this.app.ui && this.app.ui.onStyleChanged ) this.app.ui.onStyleChanged( this.name );
		return this.name;

	}

	// scene radiance that shows as the linear display colour `rgb` at the current exposure
	toScene( rgb ) {

		const E = Math.max( this.app.settings.exposure * this.autoExposure, 1e-4 );
		return acesInverse( rgb ).map( ( v ) => v / E );

	}

	update() {

		const p = this.preset;
		const m = p.mix || {};
		F.styleMix.value.set( p.keys ? m.fog || 0 : 0, p.keys ? m.sky || 0 : 0, p.keys ? m.light || 0 : 0, p.keys ? m.clouds || 0 : 0 );
		if ( ! p.keys ) {

			this.key = null;
			return;

		}

		const sun = this.app.atmosphere.sunDir.value;
		const elev = Math.asin( Math.max( - 1, Math.min( 1, sun.y ) ) ) * 180 / Math.PI;
		const k = this.key = blendKeys( p.keys, elev );
		const fs = p.fogShape || {}, ls = p.lightShape || {}, cs = p.cloudShape || {};

		setV( F.styleFogNear, this.toScene( k.fog.near ) );
		setV( F.styleFogFar, this.toScene( k.fog.far ) );
		setV( F.styleFogSunNear, this.toScene( k.fog.sunNear ) );
		setV( F.styleFogSunFar, this.toScene( k.fog.sunFar ) );
		F.styleFogShape.value.set( k.fog.start, k.fog.end, k.fog.gamma, fs.heightScale ?? 260 );
		F.styleFogShape2.value.set( k.fog.max, k.fog.sunBlend, 0, 0 );

		setV( F.styleSkyZenith, this.toScene( k.sky.zenith ), k.sky.exponent );
		setV( F.styleSkyHorizon, this.toScene( k.sky.horizon ) );
		setV( F.styleSkyGlow, this.toScene( k.sky.glow ), k.sky.glowWidth );
		setV( F.styleCloudLit, this.toScene( k.clouds.lit ), cs.levels ?? 3 );
		setV( F.styleCloudShade, this.toScene( k.clouds.shade ), cs.softness ?? 0.07 );

		F.styleLight.value.set( ls.bands ?? 3, ls.softness ?? 0.1, ls.wrap ?? 0.25, ls.specular ?? 0.35 );
		setV( F.styleShadowTint, chroma( k.light.shadow ), ls.shadowTint ?? 0.6 );
		setV( F.styleSunTint, chroma( k.light.sun ), ls.sunTint ?? 0.5 );

	}

	// after the post chain has metered this frame: read its exposure back (used a frame or two later)
	afterRender() {

		if ( this.preset.keys ) this._readback.request( this.app.post.exposure );

	}

}
