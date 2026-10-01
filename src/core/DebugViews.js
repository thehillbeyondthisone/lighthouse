import { Vector3 } from '../engine/math/index.js';
import { hazeDensityForVisibility } from '../post/AirHaze.js';

// Named review cameras used to check every change from the same set of angles.
// window.__view( name ) jumps there; window.__views lists them.
export const VIEWS = {
	beach: { p: [ 15, 3.0, - 58 ], yaw: Math.PI, pitch: - 0.08, time: 16.2 },
	surf: { p: [ 12, 1.7, - 44 ], yaw: Math.PI + 0.25, pitch: - 0.02, time: 16.2 },
	surfSide: { p: [ 40, 2.2, - 36 ], yaw: Math.PI * 0.62, pitch: - 0.08, time: 10.5 },
	swash: { p: [ 10, 1.6, - 49 ], yaw: Math.PI + 0.1, pitch: - 0.35, time: 16.2 },
	sunGlitter: { p: [ 0, 12, 120 ], yaw: Math.PI * 0.5, pitch: - 0.1, time: 16.2 },
	deepBlue: { p: [ 0, 3, 200 ], yaw: - Math.PI * 0.5, pitch: - 0.06, time: 12.5 },
	aerial: { p: [ 60, 95, 140 ], yaw: Math.PI * 0.08, pitch: - 0.55, time: 15.0 },
	shallowSeabed: { p: [ 8, 1.6, - 30 ], yaw: Math.PI, pitch: - 0.75, time: 13.0 },
	underwater: { p: [ - 70, - 2.5, 50 ], yaw: Math.PI * 0.8, pitch: 0.25, time: 13.0 },
	waterline: { p: [ 5, 0.02, - 10 ], yaw: Math.PI, pitch: 0.0, time: 14.0 },
	sunset: { p: [ 20, 2.5, - 50 ], yaw: Math.PI * 1.35, pitch: 0.02, time: 18.35 },
	sunsetWest: { p: [ 20, 2.5, - 50 ], yaw: 2.02, pitch: 0.03, time: 18.05 },
	pier: { p: [ 75, 4, - 10 ], yaw: Math.PI * 1.15, pitch: - 0.1, time: 15.5 },
	village: { p: [ 62, 7, - 62 ], yaw: 0.34, pitch: - 0.12, time: 15.5 },
	// from the pier over the shallows, looking down (refraction near the bottom edge of the screen)
	pierShallows: { p: [ 53.4, 3.92, 5 ], yaw: 1.2, pitch: - 0.45, time: 9.0 },
	pierShallowsE: { p: [ 56.6, 3.92, 5 ], yaw: - 1.2, pitch: - 0.45, time: 16.5 },
	// looking at the sun from the beach, a little off axis (lens flare, sun disc); lookSun: aimed once the sky has updated
	sunFlare: { p: [ 15, 3.0, - 58 ], yaw: 0, pitch: 0, time: 11.0, lookSun: [ 0.18, - 0.08 ] },
	// at the waterline looking down toward the sun over the swash film (its edge on the wet sand)
	swashFilm: { p: [ 10, 1.7, - 44 ], yaw: 0, pitch: 0, time: 16.2, lookSun: [ - 0.5, - 1.0 ] },
	swashFilmE: { p: [ 30, 1.7, - 39 ], yaw: 0, pitch: 0, time: 16.2, lookSun: [ - 0.5, - 0.9 ] },
	// from above the beach: the back edge of the swash sheet in the backwash (Dan's view)
	swashAbove: { p: [ 46.08, 23.35, - 53.27 ], yaw: 1.87, pitch: - 0.57, time: 16.2 },
	palms: { p: [ - 30, 3.2, - 58 ], yaw: Math.PI * 0.42, pitch: - 0.1, time: 9.5 },
	tHeadW: { p: [ - 150, 6, 40 ], yaw: 1.156, pitch: 0.02, time: 15.0 },
	tLowSun: { p: [ 60, 95, 140 ], yaw: Math.PI * 0.08, pitch: - 0.35, time: 17.6 },
	tValley: { p: [ 35, 16, - 175 ], yaw: 0.1, pitch: 0.12, time: 10.0 },
	tSummit: { p: [ - 60, 300, - 470 ], yaw: Math.PI * 1.02, pitch: - 0.35, time: 16.0 },
	tStacks: { p: [ - 240, 8, 300 ], yaw: 0.15, pitch: - 0.05, time: 16.5 },
	tCove: { p: [ - 160, 2.2, - 30 ], yaw: 1.35, pitch: - 0.08, time: 10.5 },
	tMorning: { p: [ 18, 3.0, - 60 ], yaw: 0.2, pitch: 0.05, time: 7.2 },

	// ?setting=flannan (src/world/flannan): given as a target (`at`) instead of yaw / pitch
	fStation: { p: [ - 42, 73.4, 44 ], at: [ - 3, 88, 3 ], time: 12.4 }, // the station from the south-west
	fYard: { p: [ - 10.5, 82.25, 18.5 ], at: [ - 2, 89, 1 ], time: 12.4 }, // inside the south gate
	fChapel: { p: [ - 16, 71.8, 62 ], at: [ - 7, 74.5, 49 ], time: 12.4 }, // St Flannan's chapel below the light
	fLewis: { p: [ 3.2, 99.9, 0.8 ], at: [ 943, 99.9, 343 ], time: 12.4 }, // from the gallery east to Lewis and Harris
	fLewisClear: { p: [ 3.2, 99.9, 0.8 ], at: [ 943, 99.9, 343 ], time: 12.4, vis: 90 }, // ... on a clear day
	// through a telescope (fov in degrees): Gallan Head, 33 km, where the Watcher keeps his post; the Harris hills
	fGallan: { p: [ 3.2, 99.9, 0.8 ], at: [ 32503, 60, 5435 ], fov: 5, time: 12.4, vis: 90 },
	fHarris: { p: [ 3.2, 99.9, 0.8 ], at: [ 45000, 160, 38000 ], fov: 9, time: 12.4, vis: 90 },
	fStKilda: { p: [ - 3.2, 99.9, 0.8 ], at: [ - 59400, 150, 52300 ], fov: 4, time: 12.4, vis: 110 },
	fEastSea: { p: [ 185, 10, 95 ], at: [ 110, 25, 40 ], time: 12.4 }, // the east landing from the sea
	fWestLanding: { p: [ - 420, 16, 145 ], at: [ - 330, 22, 92 ], time: 12.4 }, // the west landing's geo
	fAerial: { p: [ 230, 230, 320 ], at: [ - 80, 40, 10 ], time: 12.4 },
	fDusk: { p: [ - 42, 73.4, 44 ], at: [ - 3, 88, 3 ], time: 15.3 },
	// the demo's spaces (?lamp lights the lamp): the keepers' room, the tower's stair, the lantern, the
	// beams over the yard in the haar, the east landing where the night begins
	dRoom: { p: [ 0.4, 82.67, 4.6 ], at: [ - 6.5, 81.6, - 0.6 ], time: 14.2 },
	dStair: { p: [ - 0.1, 87.0, - 1.25 ], at: [ 1.2, 87.9, 0.3 ], time: 14.2 },
	dKeyart: { p: [ - 46, 76.5, 48 ], at: [ - 2, 92, 2 ], time: 15.55, vis: 60 },
	dLantern: { p: [ 1.65, 99.83, - 0.5 ], at: [ 0, 100.9, 0 ], time: 16.4 },
	dBeams: { p: [ - 14, 82.3, 16 ], at: [ 0, 104, - 3 ], time: 21.5, vis: 1.3 },
	dBeamsClear: { p: [ - 14, 82.3, 16 ], at: [ 0, 104, - 3 ], time: 18.5, vis: 60 },
	dWalkway: { p: [ 2.55, 99.83, 1.75 ], at: [ 32503, 60, 5435 ], time: 16.8, vis: 60 },
	dLanding: { p: [ 128, 5.0, 51.5 ], at: [ 70, 50, 28 ], time: 13.7 },
	dYardMoon: { p: [ 8, 82.3, 14 ], at: [ - 10, 83, 2 ], time: 19.0, vis: 60 },
	dRoomNight: { p: [ 0.4, 82.67, 4.6 ], at: [ - 6.5, 81.6, - 0.6 ], time: 19.0 },
};

// a view's own visibility (km, `vis`) and field of view (degrees, `fov`), or the app's
export function applyViewVisibility( app, v ) {

	const cam = app.camera;
	if ( cam ) {

		if ( app.defaultFov === undefined ) app.defaultFov = cam.fov;
		const fov = v.fov || app.defaultFov;
		if ( cam.fov !== fov ) {

			cam.fov = fov;
			cam.updateProjectionMatrix();

		}

	}

	if ( ! app.haze ) return;
	if ( v.vis ) app.haze.density.value = hazeDensityForVisibility( v.vis );
	else if ( app.defaultHaze !== null && app.defaultHaze !== undefined ) app.haze.density.value = app.defaultHaze;

}

// entries given as a target point: their yaw / pitch (yaw 0 looks along -z, pi / 2 along -x)
for ( const v of Object.values( VIEWS ) ) if ( v.at ) {

	const dx = v.at[ 0 ] - v.p[ 0 ], dy = v.at[ 1 ] - v.p[ 1 ], dz = v.at[ 2 ] - v.p[ 2 ];
	v.yaw = Math.atan2( - dx, - dz );
	v.pitch = Math.atan2( dy, Math.hypot( dx, dz ) );

}

export function installDebugViews( app ) {

	window.__views = Object.keys( VIEWS );
	// the current camera as a VIEWS entry (paste it back as a named view): __pose()
	window.__pose = () => {

		const c = app.camera, e = new Vector3().setFromMatrixColumn( c.matrixWorld, 2 ).negate();
		const r = ( v ) => Math.round( v * 100 ) / 100;
		return JSON.stringify( { p: [ r( c.position.x ), r( c.position.y ), r( c.position.z ) ], yaw: r( Math.atan2( - e.x, - e.z ) ), pitch: r( Math.asin( e.y ) ), time: r( app.settings.timeOfDay ) } );

	};
	window.__view = ( name ) => {

		const v = VIEWS[ name ];
		if ( ! v ) return 'unknown view';
		if ( v.time !== undefined ) app.settings.timeOfDay = v.time;
		applyViewVisibility( app, v );
		if ( app.setFreeCam ) app.setFreeCam( true );
		app.fly.setPose( new Vector3( ...v.p ), v.yaw, v.pitch );
		app.fly.velocity.set( 0, 0, 0 );
		if ( app.cameraCut ) app.cameraCut();
		return name;

	};

}
