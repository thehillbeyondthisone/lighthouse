// Style presets for the Style Lab (docs/PLAN.md §4). A preset is plain data; the StyleDirector
// (StyleDirector.js) turns it into the frame uniforms (`frame.style*`) and the post grade every frame.
//
// Colours are authored as display colours (sRGB hex, what should end up on screen before the grade).
// Keys, gradients, ramps and the fog's opacity blend them in sRGB, like paint in an image editor, and
// they reach scene radiance through the inverse of the final pass's tone curve
// (src/engine/render/wgsl/common.js styleScene), so an authored fog colour lands on screen as authored.
//
// `keys`: the colour script, keyed by the TRUE sun elevation in degrees (so the same keys work at
// 58°N in December, where the sun never passes 8.4°, and in the tropics). Keys are blended
// linearly between neighbours. Per key:
//   sky:   zenith, horizon, glow (around the sun), glowWidth (rad), exponent (horizon weight: < 1 more horizon)
//   fog:   near / far (away from the sun), sunNear / sunFar (toward the sun), sunBlend (0..1),
//          start / end (m: where the ramp runs), max (opacity at the far end), gamma (opacity curve)
//   light: sun (tint of the key light), shadow (hue of the shadowed side)
//   clouds: lit / shade
// Per style: lightShape { bands, softness, wrap, gamma (of N.L before banding), specular, shadowTint,
// sunTint }, cloudShape { levels, softness }, fogShape { heightScale }.
//
// Missing sections fall back to the photoreal renderer (their mix is 0).

const KEYS_POSTER = [
	{ // deep night, lamplight only (sun far below the horizon)
		elev: - 18,
		sky: { zenith: '#070b16', horizon: '#111827', glow: '#111827', glowWidth: 0.5, exponent: 0.6 },
		fog: { near: '#131a2a', far: '#141c2c', sunNear: '#131a2a', sunFar: '#141c2c', sunBlend: 0, start: 10, end: 900, max: 0.9, gamma: 0.8 },
		light: { sun: '#8fa3d0', shadow: '#1e2a55' },
		clouds: { lit: '#1a2236', shade: '#0c111e' },
	},
	{ // blue hour
		elev: - 6,
		sky: { zenith: '#1c2444', horizon: '#4f5f8f', glow: '#6d6f9e', glowWidth: 0.6, exponent: 0.55 },
		fog: { near: '#3b4670', far: '#4f5f8f', sunNear: '#5a5d86', sunFar: '#6d6f9e', sunBlend: 0.6, start: 20, end: 1600, max: 0.82, gamma: 0.9 },
		light: { sun: '#a7a8d6', shadow: '#2c3170' },
		clouds: { lit: '#5d5f8e', shade: '#262d52' },
	},
	{ // sunset: warm toward the sun, violet away from it
		elev: 0,
		sky: { zenith: '#2f3a66', horizon: '#f08d5a', glow: '#ffa860', glowWidth: 0.4, exponent: 0.45 },
		fog: { near: '#5d5a86', far: '#7a78a3', sunNear: '#c7866a', sunFar: '#ee9a66', sunBlend: 1, start: 30, end: 2200, max: 0.75, gamma: 1 },
		light: { sun: '#ff9a5c', shadow: '#2c3358' },
		clouds: { lit: '#f7a878', shade: '#5b4c78' },
	},
	{ // low winter sun, early afternoon
		elev: 3,
		sky: { zenith: '#40527e', horizon: '#f0b27a', glow: '#ffcf8f', glowWidth: 0.32, exponent: 0.5 },
		fog: { near: '#7e7f9c', far: '#8d93b0', sunNear: '#d49a72', sunFar: '#efb57f', sunBlend: 0.9, start: 30, end: 2400, max: 0.72, gamma: 1 },
		light: { sun: '#ffc07e', shadow: '#34406a' },
		clouds: { lit: '#f8d2a6', shade: '#666a8e' },
	},
	{ // a Hebridean winter noon: the sun at 8 degrees
		elev: 8.4,
		sky: { zenith: '#3f6690', horizon: '#e6cba2', glow: '#ffe0ae', glowWidth: 0.26, exponent: 0.45 },
		fog: { near: '#8f97a6', far: '#9fb0c0', sunNear: '#cfb28c', sunFar: '#e8cc9f', sunBlend: 0.75, start: 35, end: 2600, max: 0.7, gamma: 1 },
		light: { sun: '#ffe0b0', shadow: '#3d4a70' },
		clouds: { lit: '#f3eadb', shade: '#7d8aa3' },
	},
	{ // a high sun (the tropical island, or summer)
		elev: 35,
		sky: { zenith: '#2f6aa8', horizon: '#c6dbe8', glow: '#fff1d0', glowWidth: 0.22, exponent: 0.6 },
		fog: { near: '#a3bccb', far: '#b8cfdc', sunNear: '#d8d8c6', sunFar: '#e6e4d2', sunBlend: 0.35, start: 40, end: 3000, max: 0.65, gamma: 1 },
		light: { sun: '#fff1da', shadow: '#44587e' },
		clouds: { lit: '#ffffff', shade: '#9fb0c4' },
	},
];

export const STYLES = {

	// the engine as it was: physically based, ACES, the Effects tab's grade
	photoreal: {
		label: 'Photoreal',
		description: 'The physically based renderer, unchanged.',
	},

	// S1: the Firewatch lineage. Fog from colour ramps sampled by distance (a second ramp toward the
	// sun), a painted gradient sky with the clouds cut into flat layers, the sunlight in a few soft
	// bands with coloured shadows.
	poster: {
		label: 'Poster',
		description: 'Ramped fog, a painted sky, banded light (the Firewatch lineage).',
		keys: KEYS_POSTER,
		mix: { fog: 1, sky: 1, light: 1, clouds: 1 },
		fogShape: { heightScale: 220 },
		// gamma < 1: the winter sun's weak N.L still reaches the upper bands
		lightShape: { bands: 3, softness: 0.08, wrap: 0.15, gamma: 0.45, specular: 0.35, shadowTint: 0.5, sunTint: 0.5 },
		cloudShape: { levels: 3, softness: 0.03 },
		post: { saturation: 1.05, contrast: 1.1, warmth: 0, grain: 0.008, vignette: 0.22, sharpen: 0.2, bloom: 0.03 },
		// display-space grade after the tone curve: lift / gamma / gain per channel, saturation
		grade: { mode: 1, lift: [ 0.012, 0.006, 0.028 ], gamma: [ 1, 1, 1 ], gain: [ 1.02, 1, 0.97 ], saturation: 1.06 },
	},

	// S2: an albumen print of 1900. Blue-sensitive film (skies burn white, reds go dark), halation,
	// a Petzval lens's swirl and fall-off, warm brown-purple toning, paper, dust.
	albumen: {
		label: 'Albumen print',
		description: 'A photograph of 1900: blue-sensitive film, halation, lens swirl, sepia paper.',
		post: { saturation: 1, contrast: 1, warmth: 0, grain: 0, vignette: 0, sharpen: 0.15, bloom: 0.05 },
		grade: {
			mode: 2,
			response: [ 0.06, 0.34, 0.6 ], // film sensitivity per channel (blue-sensitive emulsion)
			dark: '#24160f', mid: '#8a6446', light: '#f3e4c8', // toning: shadows, mid-tones, paper white
			exposure: - 0.45, contrast: 1.4, halation: 0.45, halationColor: '#ff6a2a', swirl: 0.5, vignette: 0.55,
			paper: 0.55, dust: 0.5, grain: 0.035,
		},
	},

	// S2 variant: the same photograph as a cyanotype (Prussian blue)
	cyanotype: {
		label: 'Cyanotype',
		description: 'The 1900 photograph printed in Prussian blue.',
		post: { saturation: 1, contrast: 1, warmth: 0, grain: 0, vignette: 0, sharpen: 0.15, bloom: 0.05 },
		grade: {
			mode: 2,
			response: [ 0.06, 0.34, 0.6 ],
			dark: '#0a2240', mid: '#2f5f8f', light: '#e7eef0',
			exposure: - 0.3, contrast: 1.35, halation: 0.3, halationColor: '#bfd8ff', swirl: 0.5, vignette: 0.55,
			paper: 0.5, dust: 0.4, grain: 0.03,
		},
	},

};

export const STYLE_NAMES = Object.keys( STYLES );
