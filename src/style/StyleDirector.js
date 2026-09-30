import { Vector4 } from '../engine/math/index.js';
import { FrameUniforms } from '../engine/render/Frame.js';
import { Readback } from '../engine/gpu/Readback.js';
import { STYLES } from './Styles.js';

// Drives the active style (Styles.js) every frame:
//   - blends the colour script's keys by the true sun elevation;
//   - writes the `frame.style*` uniforms read by the haze (fog), the sky (gradient, clouds) and the
//     lighting (bands, tints), and the post chain's grade parameters.
// Colours go to the shaders as sRGB display colours (hex / 255): keys blend, and the shaders mix them,
// like paint in an image editor, then bring them to scene radiance through the inverse of the final
// pass's tone curve (common.js styleScene) at the exposure the final pass applies: the app's exposure
// times the auto exposure, read back from the GPU a frame or two late (frame.styleLight2.y). The light
// tints are hue multipliers of scene radiance (linear); the print grade's colours are linear too.
// The photoreal style writes zeros: every style branch in the shaders is skipped.
//
//   const style = new StyleDirector( app ); style.set( 'poster' );
//   per frame: style.update() before the render, style.afterRender() after the post chain

const srgbToLinear = ( c ) => ( c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ) );

// '#rrggbb' -> linear rgb (cached)
const _hex = new Map();
export function hexToLinear( hex ) {

	let v = _hex.get( hex );
	if ( ! v ) {

		const n = parseInt( hex.slice( 1 ), 16 );
		const srgb = [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ].map( ( x ) => x / 255 );
		v = Object.assign( srgb.map( srgbToLinear ), { srgb } );
		_hex.set( hex, v );

	}

	return v;

}

// '#rrggbb' -> sRGB rgb, 0..1
export const hexToSrgb = ( hex ) => hexToLinear( hex ).srgb;

const lum = ( c ) => 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ];
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const lerp3 = ( a, b, t ) => [ lerp( a[ 0 ], b[ 0 ], t ), lerp( a[ 1 ], b[ 1 ], t ), lerp( a[ 2 ], b[ 2 ], t ) ];

// hue of a colour at luminance 1 (a multiplier that tints without changing brightness)
function chroma( c ) {

	const l = Math.max( lum( c ), 1e-4 );
	return c.map( ( v ) => Math.min( v / l, 3 ) );

}

// the colour script at a sun elevation: every leaf blended between the two neighbouring keys;
// colours as sRGB rgb (blended as painted), numbers as numbers
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
			out[ sec ][ k ] = typeof va === 'string' ? lerp3( hexToSrgb( va ), hexToSrgb( vb ), t ) : lerp( va, vb, t );

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
			'styleSkyZenith', 'styleSkyHorizon', 'styleSkyGlow', 'styleCloudLit', 'styleCloudShade', 'styleLight', 'styleShadowTint', 'styleSunTint', 'styleLight2' ] ) {

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

		// sRGB display colours (the shaders blend them as painted and convert: common.js styleScene), at
		// the exposure the final pass will apply
		F.styleLight2.value.y = Math.max( this.app.settings.exposure * this.autoExposure, 1e-4 );
		setV( F.styleFogNear, k.fog.near );
		setV( F.styleFogFar, k.fog.far );
		setV( F.styleFogSunNear, k.fog.sunNear );
		setV( F.styleFogSunFar, k.fog.sunFar );
		F.styleFogShape.value.set( k.fog.start, k.fog.end, k.fog.gamma, fs.heightScale ?? 260 );
		F.styleFogShape2.value.set( k.fog.max, k.fog.sunBlend, 0, 0 );

		setV( F.styleSkyZenith, k.sky.zenith, k.sky.exponent );
		setV( F.styleSkyHorizon, k.sky.horizon );
		setV( F.styleSkyGlow, k.sky.glow, k.sky.glowWidth );
		setV( F.styleCloudLit, k.clouds.lit, cs.levels ?? 3 );
		setV( F.styleCloudShade, k.clouds.shade, cs.softness ?? 0.07 );

		F.styleLight.value.set( ls.bands ?? 3, ls.softness ?? 0.1, ls.wrap ?? 0.25, ls.specular ?? 0.35 );
		F.styleLight2.value.x = ls.gamma ?? 1;
		setV( F.styleShadowTint, chroma( k.light.shadow.map( srgbToLinear ) ), ls.shadowTint ?? 0.6 );
		setV( F.styleSunTint, chroma( k.light.sun.map( srgbToLinear ) ), ls.sunTint ?? 0.5 );

	}

	// after the post chain has metered this frame: read its exposure back (used a frame or two later)
	afterRender() {

		if ( this.preset.keys ) this._readback.request( this.app.post.exposure );

	}

}
