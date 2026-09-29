// Style presets for the Style Lab (docs/PLAN.md §4). A preset is plain data; the StyleDirector
// (StyleDirector.js) turns it into the frame uniforms (`frame.style*`) and the post grade every frame.
//
// Colours are authored as display colours (sRGB hex, what should end up on screen). The director
// converts the fog, sky and cloud colours into scene radiance through the inverse of the tone curve at
// the current exposure, so an authored fog colour lands on screen as authored (before the grade).
//
// `keys`: the colour script, keyed by the TRUE sun elevation in degrees (so the same keys work at
// 58°N in December, where the sun never passes 8.4°, and in the tropics). Keys are blended
// linearly between neighbours. Per key:
//   sky:   zenith, horizon, glow (around the sun), glowWidth (rad), exponent (horizon weight: < 1 more horizon)
//   fog:   near / far (away from the sun), sunNear / sunFar (toward the sun), sunBlend (0..1),
//          start / end (m: where the ramp runs), max (opacity at the far end), gamma (opacity curve)
//   light: sun (tint of the key light), shadow (hue of the shadowed side)
//   clouds: lit / shade
//
// Missing sections fall back to the photoreal renderer (their mix is 0).

const KEYS_POSTER = [
	{ // deep night, lamplight only (sun far below the horizon)
		elev: - 18,
		sky: { zenith: '#070b16', horizon: '#111827', glow: '#111827', glowWidth: 0.5, exponent: 0.6 },
		fog: { near: '#131a2a', far: '#141c2c', sunNear: '#131a2a', sunFar: '#141c2c', sunBlend: 0, start: 4, end: 700, max: 0.92, gamma: 0.8 },
		light: { sun: '#8fa3d0', shadow: '#1e2a55' },
		clouds: { lit: '#1a2236', shade: '#0c111e' },
	},
	{ // blue hour
		elev: - 6,
		sky: { zenith: '#1c2444', horizon: '#4f5f8f', glow: '#6d6f9e', glowWidth: 0.9, exponent: 0.55 },
		fog: { near: '#3b4670', far: '#4f5f8f', sunNear: '#5a5d86', sunFar: '#6d6f9e', sunBlend: 0.6, start: 8, end: 1100, max: 0.9, gamma: 0.8 },
		light: { sun: '#a7a8d6', shadow: '#2c3170' },
		clouds: { lit: '#5d5f8e', shade: '#262d52' },
	},
	{ // sunset: warm toward the sun, violet away from it
		elev: 0,
		sky: { zenith: '#353f6b', horizon: '#f08d5a', glow: '#ffb070', glowWidth: 0.7, exponent: 0.45 },
		fog: { near: '#5a5d86', far: '#7c7aa2', sunNear: '#c98a6c', sunFar: '#f08d5a', sunBlend: 1, start: 12, end: 1400, max: 0.88, gamma: 0.75 },
		light: { sun: '#ff9f68', shadow: '#33304f' },
		clouds: { lit: '#f6a877', shade: '#5b4c78' },
	},
	{ // low winter sun, early afternoon
		elev: 3,
		sky: { zenith: '#4e5f86', horizon: '#f1b77e', glow: '#ffd29a', glowWidth: 0.55, exponent: 0.5 },
		fog: { near: '#9b8f9a', far: '#7b7f99', sunNear: '#e0ae82', sunFar: '#f1b77e', sunBlend: 0.85, start: 15, end: 1600, max: 0.85, gamma: 0.75 },
		light: { sun: '#ffc690', shadow: '#3f3d5c' },
		clouds: { lit: '#f7d7ae', shade: '#6d6f8c' },
	},
	{ // a Hebridean winter noon: the sun at 8°
		elev: 8.4,
		sky: { zenith: '#5d7896', horizon: '#e3cfae', glow: '#f7e2bd', glowWidth: 0.45, exponent: 0.55 },
		fog: { near: '#b9ab93', far: '#8c9aa6', sunNear: '#d6c3a0', sunFar: '#e3cfae', sunBlend: 0.7, start: 18, end: 1800, max: 0.82, gamma: 0.75 },
		light: { sun: '#f2d6a8', shadow: '#4b5068' },
		clouds: { lit: '#f1ead9', shade: '#8791a3' },
	},
	{ // a high sun (the tropical island, or summer)
		elev: 35,
		sky: { zenith: '#3f78b8', horizon: '#cfe0ea', glow: '#fff3d8', glowWidth: 0.35, exponent: 0.6 },
		fog: { near: '#a9c1cc', far: '#bcd2de', sunNear: '#dcdcc8', sunFar: '#e9e8d6', sunBlend: 0.35, start: 25, end: 2400, max: 0.78, gamma: 0.8 },
		light: { sun: '#fff1da', shadow: '#4a5a7a' },
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
		fogShape: { heightScale: 260 },
		lightShape: { bands: 3, softness: 0.1, wrap: 0.25, specular: 0.35, shadowTint: 0.65, sunTint: 0.55 },
		cloudShape: { levels: 3, softness: 0.03 },
		post: { saturation: 1, contrast: 1, warmth: 0, grain: 0.008, vignette: 0.22, sharpen: 0.2, bloom: 0.03 },
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
			exposure: - 0.7, contrast: 1.4, halation: 0.45, halationColor: '#ff6a2a', swirl: 0.7, vignette: 0.7,
			paper: 0.55, dust: 0.6, grain: 0.035,
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
			exposure: - 0.5, contrast: 1.35, halation: 0.3, halationColor: '#bfd8ff', swirl: 0.7, vignette: 0.7,
			paper: 0.5, dust: 0.45, grain: 0.03,
		},
	},

};

export const STYLE_NAMES = Object.keys( STYLES );
