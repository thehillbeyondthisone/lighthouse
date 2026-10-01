import { Vector3, MathUtils } from '../engine/math/index.js';
import { Interact } from './Interact.js';
import { StoryUI } from './StoryUI.js';
import { Watcher, morseText } from './Watcher.js';
import * as S from './Script.js';
import { WARN } from '../station/Lamp.js';
import { Beams, hazeTransmittance } from '../station/Beams.js';
import { hazeDensityForVisibility } from '../post/AirHaze.js';
import { STATION, TOWER, ROOM, updateDoor } from '../world/flannan/Station.js';

// The first night (docs/PLAN.md §3, the demo): Thursday 3rd January 1901, from the landing at 13.40 to the
// journal written after sunrise. It keeps the game's clock, the weather (clear at dusk, the haar from the
// west at night), the beats and their objectives, the interactions, the Watcher, the eerie beats, the
// journal, and a save in the browser.
//
// The clock: h, hours since midnight at the start of the 3rd (the setting's day 19 after 15 December 1900).
// It runs 1 game minute in 2.5 s before the lamp is lit, a minute a second after; it stops while a page
// is open; "keep the watch" skips to what comes next.

const DAY0 = 19; // Setting.js dayOffset of 3 January 1901
const START = 13 + 40 / 60;
const RATE_DAY = 1 / 150; // game hours per real second
const RATE_NIGHT = 1 / 60;
const HER_APPEAR = 16.4, HER_CALL = 16.5;
const HAAR = 20.6; // the haar comes down (earlier if you said the island's name)
const DAWN_SKIP = 32.4; // 08.24 on the 4th
const SAVE_KEY = 'sevenhunters.night1.v1';
const HER_LAMP = 7e5; // the Watcher's lamp (Beams far light intensity)
const ISLET = new Vector3( 164, 44.6, 540 ); // Eilean Tighe's top

const _v = new Vector3(), _w = new Vector3(), _eye = new Vector3();
const lc = ( t ) => t.charAt( 0 ).toLowerCase() + t.slice( 1 ); // ("Fresh breeze, SW" -> "fresh breeze, SW")

// "15.09" (the log's own way of writing the time), from hours since midnight on the 3rd
export function clockText( h ) {

	const m = Math.floor( ( ( h % 24 ) + 24 ) % 24 * 60 + 1e-6 );
	return `${ String( Math.floor( m / 60 ) ).padStart( 2, '0' ) }.${ String( m % 60 ).padStart( 2, '0' ) }`;

}

// visibility at sea level (km) and the cloud cover through the night
export function weatherAt( h, haar = HAAR ) {

	const clear = 60, fog = 1.3;
	let vis = clear;
	if ( h > haar ) vis = fog + ( clear - fog ) * Math.exp( - ( h - haar ) / 0.18 );
	// a little breathing in the haar
	if ( h > haar + 0.6 && h < 29.5 ) vis = fog * ( 1 + 0.35 * Math.sin( h * 5.1 ) * Math.sin( h * 2.3 + 1 ) );
	if ( h >= 29.5 ) vis = fog + ( 25 - fog ) * MathUtils.smoothstep( h, 29.5, 32.2 );
	const clouds = h < haar ? 0.3 : h < 29.5 ? 0.55 : 0.4;
	return { vis, clouds };

}

export class Story {

	constructor( app ) {

		this.app = app;
		const st = app.village.station;
		this.station = st;
		this.moving = st.moving;
		this.lamp = app.lamp;
		this.ui = new StoryUI( { input: app.input } );
		this.ui.onRestart = () => {

			this.clearSave();
			location.reload();

		};

		this.interact = new Interact( { camera: app.camera, input: app.input, player: app.player } );
		this.watcher = new Watcher();
		this.watcher.onSent = ( text, minutes ) => {

			this.h += minutes / 60;

		};

		this.h = START;
		this.beat = 'intro';
		this.flags = {};
		this.rows = []; // the journal: [ hours, text ]
		this.obs = {}; // the hour -> the chalked observation
		this.hasTelescope = false;
		this.signal = false; // at the signal lamp, talking
		this.tel = 0; // the telescope's raise 0..1
		this.paused = true;
		this.saidName = false;
		this.haar = HAAR;
		this.islet = null; // { t: seconds showing, seen }
		this.saveT = 0;
		this.baseFov = app.camera.fov;
		this.doors = {};
		for ( const d of this.moving.doors ) ( this.doors[ d.name ] = this.doors[ d.name ] || [] ).push( d );
		this.her = this._herPosition();
		this.lamp.onWarning = () => this._bell();
		this.lamp.onStopped = () => {

			if ( this.lamp.lit ) this.flags.stoppedAt = this.h;

		};

		// a new night starts on the landing stage (a saved one where it was left: start())
		if ( ! this.loadSave() ) this._placeAtLanding();
		this.signalLight = app.signalLight;
		this._keys = ( e ) => this._key( e );
		window.addEventListener( 'keydown', this._keys, true );
		this._items();

	}

	// Gallan Head: the Watcher's lamp on the headland, a few metres above the ground
	_herPosition() {

		const F = this.app.flannan, g = F.places.gallanHead;
		const ground = Math.max( F.grids.uig.at( g.x, g.z ), F.grids.hebrides.at( g.x, g.z ), 0 );
		return new Vector3( g.x, ground + 4, g.z );

	}

	// ---------------------------------------------------------------- the clock

	get hour() {

		return this.h;

	}

	_applyClock() {

		const app = this.app;
		app.settings.timeSpeed = 0;
		app.settings.timeOfDay = ( ( this.h % 24 ) + 24 ) % 24;
		app.setting.dayOffset = DAY0 + Math.floor( this.h / 24 );

	}

	dayText() {

		return this.h < 24 ? 'Thursday 3rd January 1901' : 'Friday 4th January 1901';

	}

	// ---------------------------------------------------------------- start

	async start() {

		const saved = this.loadSave();
		if ( saved ) {

			const v = await this.ui.choose( {
				title: S.TITLE,
				intro: `Your night is saved at ${ clockText( saved.h ) }.`,
				options: [ { label: 'Continue the night', value: 'continue' }, { label: 'Begin again', value: 'new' } ],
				cancel: null,
			} );
			if ( v !== 'new' ) {

				this._restore( saved );
				this.paused = false;
				return;

			}

			this.clearSave();

		}

		this._placeAtLanding();
		this._applyClock();
		await this.ui.card( [ S.DAY.place ], { kicker: S.TITLE, title: S.DAY.date } );
		await this.ui.card( S.PROLOGUE );
		this.row( this.h, 'Landed at the east landing from the Hesperus. The boat could not remain; the Principal Keeper and the Occasional Keeper still aboard.' );
		this.setBeat( 'climb' );
		this.paused = false;

	}

	_placeAtLanding() {

		const p = this.app.player, L = this.station.landings.east;
		p.position.set( L.stage.x - L.dir[ 0 ] * 1.5, L.stage.y, L.stage.z - L.dir[ 1 ] * 1.5 );
		p.position.y = Math.max( this.app.terrainData.heightAt( p.position.x, p.position.z ), this.app.colliders.groundHeightAt( p.position.x, p.position.z, L.stage.y + 1 ) );
		// facing up the flight
		p.yaw = Math.atan2( L.dir[ 0 ], L.dir[ 1 ] );
		p.pitch = 0.12;
		p.velocity.set( 0, 0, 0 );
		p.mode = 'walk';
		if ( this.app.cameraCut ) this.app.cameraCut();

	}

	// ---------------------------------------------------------------- beats and the journal

	setBeat( b ) {

		if ( b === this.beat ) return;
		this.beat = b;
		this.save();

	}

	row( h, text ) {

		this.rows.push( [ h, text ] );

	}

	// the most pressing thing to do now
	goal() {

		const b = this.beat;
		if ( b === 'intro' || b === 'end' ) return '';
		if ( this.lamp.lit && this.lamp.wind < WARN && this.lamp.running ) return S.GOALS.bell;
		if ( this.lamp.lit && this.lamp.wind <= 0 ) return S.GOALS.bell;
		if ( b === 'gate' ) return S.GOALS.gate;
		const due = this._obsDue();
		if ( due && b !== 'dawn' && b !== 'journal' ) return S.GOALS.obs.replace( 'six', due === 18 ? 'six' : 'nine' );
		if ( this.watcher.state === 'calling' || this.watcher.state === 'waiting' || ( this.watcher.state === 'steady' && this.lamp.lit ) ) return this.hasTelescope ? S.GOALS.answer : S.GOALS.gallan;
		if ( b === 'haar' ) return 'The haar is in. Watch the beams from the walkway.';
		return S.GOALS[ b ] || '';

	}

	_obsDue() {

		for ( const at of [ 18, 21 ] ) if ( this.h >= at - 0.1 && ! this.obs[ at ] && this.h < at + 2.5 && this.lamp.lit ) return at;
		return 0;

	}

	// ---------------------------------------------------------------- the interactions

	_items() {

		const I = this.interact, R = ROOM, T = TOWER, st = this.station, m = st.parts.marks;
		const read = ( note ) => () => this.ui.read( note );
		const door = ( name, verb = 'door' ) => ( {
			text: () => ( this.doors[ name ][ 0 ].target > 0.5 ? `Shut the ${ verb }` : `Open the ${ verb }` ),
			use: () => this._toggle( name ),
		} );

		// the gate and the doors
		I.add( { id: 'gate', at: new Vector3( STATION.eastGate.x - 0.25, STATION.yard + 0.8, STATION.eastGate.z ), reach: 2.4, size: 1.3, ...door( 'gate', 'gate' ) } );
		I.add( { id: 'houseDoor', at: new Vector3( R.door.x - 0.1, T.floor + 1.1, R.door.z ), reach: 2.0, size: 0.6, ...door( 'house' ) } );
		I.add( { id: 'galleryDoor', at: () => _v.set( Math.cos( T.galleryDoor ) * 2.28, T.deck + 1.0, Math.sin( T.galleryDoor ) * 2.28 ), reach: 1.8, size: 0.45, ...door( 'gallery' ) } );

		// the keepers' room
		I.add( { id: 'letter', at: R.letter, size: 0.2, text: 'Read the Board\'s letter', use: async () => {

			await this.ui.read( S.LETTER );
			if ( this.beat === 'letter' || this.beat === 'room' ) {

				this.setBeat( 'light' );
				this.toast( `Sunset at ${ clockText( S.SUNSET ) }` );

			}

		} } );
		I.add( { id: 'journal', at: R.journal, size: 0.22, text: () => ( this.beat === 'journal' ? 'Write up the journal' : 'Look at the journal' ), use: () => ( this.beat === 'journal' ? this._writeJournal() : this.ui.read( S.NOTES.journal ) ) } );
		I.add( { id: 'slate', at: R.slate, size: 0.2, text: () => ( this._obsDue() ? 'Chalk the observations on the slate' : 'Look at the slate' ), use: () => ( this._obsDue() ? this._observe( this._obsDue() ) : this._readSlate() ) } );
		I.add( { id: 'barometer', at: R.barometer, size: 0.2, text: 'Read the barometer', use: () => this.toast( 'The barometer: ' + S.barometer( this.h ) ) } );
		I.add( { id: 'clock', at: R.clock, size: 0.2, text: 'The clock', use: () => this.toast( `The clock says ${ clockText( this.h ) }.` ) } );
		I.add( { id: 'oilskins', at: R.oilskins, size: 0.45, text: 'The oilskins', use: read( S.NOTES.oilskins ) } );
		I.add( { id: 'stove', at: R.stove, size: 0.4, text: 'The stove', use: read( S.NOTES.stove ) } );
		I.add( { id: 'westDoor', at: R.westDoor, size: 0.5, text: 'The bedrooms', use: read( S.NOTES.westDoor ) } );
		I.add( { id: 'kitchenDoor', at: R.kitchenDoor, size: 0.5, text: 'The kitchen', use: read( S.NOTES.kitchenDoor ) } );
		I.add( { id: 'chair', at: () => _v.set( R.letter.x + 0.3, T.floor + 0.6, R.letter.z + 0.5 ), size: 0.35, text: () => this._watchText(), when: () => !! this._watchText(), use: () => this._keepWatch() } );

		// the lantern
		I.add( { id: 'lens', at: () => _v.set( 0, st.focal, 0 ), reach: 2.6, size: 0.75, hold: 2.2,
			text: () => this._lensText(),
			when: () => !! this._lensText(),
			use: () => this._useLens(),
		} );
		I.add( { id: 'crank', at: T.crank, reach: 1.7, size: 0.3, hold: 1e9,
			text: () => ( this.lamp.wind >= 0.999 ? 'The machine is fully wound' : 'Wind the machine' ),
			progress: () => this.lamp.wind,
			onHold: ( dt ) => this._wind( dt ),
			onRelease: () => this.sound && this.sound.ratchet( false ),
		} );
		I.add( { id: 'telescope', at: T.telescope, size: 0.3, when: () => ! this.hasTelescope, text: 'Take the telescope', use: () => {

			this.hasTelescope = true;
			this.moving.telescope.visible = false;
			this.toast( 'Hold the right mouse button to look through the telescope.', 5000 );
			this.save();

		} } );
		I.add( { id: 'stool', at: T.stool, size: 0.35, text: () => this._watchText(), when: () => !! this._watchText(), use: () => this._keepWatch() } );
		I.add( { id: 'signal', at: T.signal, reach: 2.0, size: 0.35,
			when: () => this.watcher.state !== 'away' && this.watcher.state !== 'done',
			text: () => ( this.hasTelescope ? 'Signal Gallan Head' : 'The signal lamp (you will want the telescope)' ),
			use: () => ( this.hasTelescope ? this._enterSignal() : this.toast( 'The telescope is on the lantern\'s sill, inside.' ) ),
		} );

		// out on the island
		if ( m.chapel ) I.add( { id: 'chapel', at: m.chapel, reach: 2.2, size: 0.6, text: 'Teampull Beannachadh', use: read( S.NOTES.chapel ) } );
		if ( m.ropeBox ) I.add( { id: 'ropeBox', at: m.ropeBox, reach: 2.4, size: 0.8, text: 'The rope box', use: read( S.NOTES.ropeBox ) } );

	}

	_toggle( name ) {

		const ds = this.doors[ name ];
		const open = ds[ 0 ].target > 0.5 ? 0 : 1;
		for ( const d of ds ) d.target = open;
		if ( this.sound ) this.sound.door( name, open, ds[ 0 ].center );
		if ( name === 'gate' && this.beat === 'gate' ) {

			this.flags.gateSecured = this.h;
			this.setBeat( 'night' );

		}

	}

	_lensText() {

		const L = this.lamp, h = this.h;
		if ( this.beat === 'end' ) return '';
		if ( ! L.lit && h < 24 ) {

			if ( this.beat === 'climb' || this.beat === 'room' || this.beat === 'letter' ) return h < S.SUNSET - 0.25 ? 'Wait for sunset' : 'Light the lamp';
			return h < S.SUNSET - 0.25 ? 'Wait for sunset' : 'Light the lamp';

		}

		if ( L.lit && h >= S.SUNRISE + 24 - 0.25 ) return 'Put out the lamp';
		if ( L.lit && this.beat === 'dawn' ) return 'Keep the watch until sunrise';
		return '';

	}

	async _useLens() {

		const L = this.lamp, h = this.h;
		if ( ! L.lit && h < 24 ) {

			if ( h < S.SUNSET - 0.25 ) {

				await this._skipTo( S.SUNSET - 0.03, 'You wait for the sun to go down.' );
				return;

			}

			L.ignite();
			if ( this.sound ) this.sound.ignite();
			this.flags.litAt = h;
			const late = h > S.SUNSET + 0.25;
			this.row( h, late ? 'Lamp lit (late).' : 'Lamp lit.' );
			if ( late ) this.flags.late = true;
			this.setBeat( 'machine' );
			this.toast( 'The burner takes. Now wind the machine.' );
			return;

		}

		if ( L.lit && h >= S.SUNRISE + 24 - 0.25 ) {

			L.extinguish();
			L.stop();
			if ( this.sound ) this.sound.extinguish();
			this.row( h, 'Lamp extinguished. Machine stopped.' );
			this.setBeat( 'journal' );
			return;

		}

		if ( this.beat === 'dawn' ) await this._skipTo( S.SUNRISE + 24 - 0.2, 'The haar thins to the east.' );

	}

	_wind( dt ) {

		const L = this.lamp;
		if ( L.wind >= 0.999 ) {

			if ( this.sound ) this.sound.ratchet( false );
			return;

		}

		const was = L.wind;
		L.addWind( dt / 5 );
		if ( this.sound ) this.sound.ratchet( true );
		if ( was < WARN && L.wind >= WARN && this.beat !== 'machine' ) this.row( this.h, this.flags.stoppedAt ? `Machine going again: the light shown fixed from ${ clockText( this.flags.stoppedAt ) }.` : 'Machine wound.' );
		if ( was < WARN ) this.flags.stoppedAt = 0;
		if ( this.beat === 'machine' && L.wind > 0.5 ) {

			this.row( this.h, 'Machine set going.' );
			this.setBeat( 'watch' );

		}

	}

	_bell() {

		if ( ! this.lamp.lit ) return;
		this.toast( 'The machine\'s bell: the weight is near the foot of the tube.', 4500 );
		if ( this.sound ) this.sound.bell( TOWER.crank );

	}

	// ---- observations

	async _observe( at ) {

		const v = await this.ui.form( {
			title: `The slate: ${ at === 18 ? '6' : '9' } p.m.`,
			intro: `The barometer reads ${ S.barometer( this.h ) } Chalk up the wind, the sea and the visibility.`,
			fields: [
				{ key: 'wind', label: 'Wind', options: S.OBS.wind },
				{ key: 'sea', label: 'Sea', options: S.OBS.sea },
				{ key: 'visibility', label: 'Visibility', options: S.OBS.visibility },
			],
		} );
		if ( ! v ) return;
		this.obs[ at ] = v;
		this.row( at, `Bar. ${ S.barometer( at ).split( ' ' )[ 0 ] }. Wind: ${ lc( v.wind ) }. Sea: ${ lc( v.sea ) }. Visibility: ${ lc( v.visibility ) }.` );
		this.save();

	}

	_readSlate() {

		const lines = Object.keys( this.obs ).sort().map( ( k ) => `${ k === '18' ? '6' : '9' } p.m.: ${ this.obs[ k ].wind }; sea ${ this.obs[ k ].sea.toLowerCase() }; ${ this.obs[ k ].visibility.toLowerCase() }.` );
		return this.ui.read( { title: 'The slate', body: lines.length ? lines : S.NOTES.slate.body } );

	}

	// ---- keeping the watch (the clock skips to what comes next)

	_nextEvent() {

		const h = this.h, L = this.lamp, out = [];
		if ( this.watcher.state === 'away' ) out.push( HER_APPEAR + 0.02 );
		if ( L.lit && L.running ) out.push( h + Math.max( 0, L.wind - WARN ) * 3 - 0.03 );
		for ( const at of [ 18, 21 ] ) if ( ! this.obs[ at ] ) out.push( at - 0.05 );
		out.push( this.haar + 0.05 );
		return Math.min( ...out.filter( ( t ) => t > h + 0.05 ) );

	}

	_watchText() {

		if ( this.watcher.talking || this.signal ) return '';
		const b = this.beat;
		if ( b === 'night' ) return 'Keep the watch until dawn';
		if ( b === 'dawn' && this.h < S.SUNRISE + 24 - 0.25 ) return 'Keep the watch until sunrise';
		if ( ( b === 'watch' || b === 'evening' || b === 'gallan' ) && this.lamp.lit && this.lamp.wind >= WARN && ! this._obsDue() ) {

			const t = this._nextEvent();
			return Number.isFinite( t ) && t < this.haar + 0.1 ? `Keep the watch (until ${ clockText( t ) })` : '';

		}

		return '';

	}

	async _keepWatch() {

		const b = this.beat;
		if ( b === 'night' ) {

			await this.ui.card( [
				'You wind the machine at midnight, and again at three, and chalk the hours on the slate.',
				'The haar lies on the island all night. The beams go round in it like the spokes of a wheel.',
			], { kicker: 'The small hours' } );
			this.row( 24, 'Machine wound.' );
			this.row( 27, 'Machine wound.' );
			this.obs[ 27 ] = 'auto';
			this.lamp.wind = 0.62;
			this.lamp.warned = false;
			this.h = DAWN_SKIP;
			this.setBeat( 'dawn' );
			return;

		}

		if ( b === 'dawn' ) {

			await this._skipTo( S.SUNRISE + 24 - 0.2, 'The haar thins to the east.' );
			return;

		}

		const t = this._nextEvent();
		if ( Number.isFinite( t ) ) await this._skipTo( t, 'You keep the watch.' );

	}

	async _skipTo( t, text ) {

		await this.ui.fade( text );
		const dh = Math.max( 0, t - this.h );
		this.lamp.update( 0, dh );
		this.h = t;
		this.save();

	}

	// ---- the Watcher: telescope and signal lamp

	_enterSignal() {

		this.signal = true;
		this.app.player.busy = true;
		this.app.input.enabled = false;
		// stand at the lamp
		const p = this.app.player;
		p.position.set( TOWER.signalStand.x, TOWER.deck, TOWER.signalStand.z );
		if ( this.watcher.state === 'calling' || this.watcher.state === 'steady' ) this.watcher.answer();
		this.ui.setHUD( false );

	}

	_leaveSignal() {

		this.signal = false;
		this.app.player.busy = false;
		this.app.input.enabled = true;
		this.ui.strip( null );
		this.ui.setHUD( true );
		// look where the telescope looked
		const p = this.app.player;
		_v.subVectors( this._herRender( _w ), _eye.setFromMatrixPosition( this.app.camera.matrixWorld ) ).normalize();
		p.yaw = Math.atan2( - _v.x, - _v.z );
		p.pitch = Math.asin( MathUtils.clamp( _v.y, - 1, 1 ) );

	}

	// her lamp as drawn (the Earth's curvature drops it below the camera's plane)
	_herRender( out ) {

		const c = this.app.camera.position, dx = this.her.x - c.x, dz = this.her.z - c.z;
		return out.set( this.her.x, this.her.y - ( dx * dx + dz * dz ) * ( this.app.curvature || 0 ), this.her.z );

	}

	_key( e ) {

		if ( ! this.signal || this.ui.open ) return;
		if ( e.code === 'Space' ) {

			this._hurry = true;
			e.preventDefault();

		}

		if ( e.code === 'Escape' || e.code === 'KeyE' ) {

			e.preventDefault();
			this._leaveSignal();

		}

	}

	async _choose() {

		const w = this.watcher;
		this._choosing = true;
		const v = await this.ui.choose( {
			title: 'The code book',
			intro: `Gallan Head: ${ w.node.her.replace( / K$/, '' ) }`,
			options: w.options.map( ( o, i ) => ( {
				label: o.code ? `${ o.code } · ${ o.text }` : o.text,
				sub: o.code ? `The Board's code: about ${ o.minutes } minutes` : `Spelled out letter by letter: about ${ o.minutes } minutes`,
				value: i,
			} ) ),
			cancel: 'Step away from the lamp',
		} );
		this._choosing = false;
		if ( v === null || v === undefined ) {

			this._leaveSignal();
			return;

		}

		w.reply( v );
		if ( this.sound ) this.sound.shutter();

	}

	_updateWatcher( dt, density ) {

		const w = this.watcher, cam = this.app.camera;
		if ( w.state === 'away' && this.h >= HER_APPEAR ) {

			w.appear();
			this.row( HER_APPEAR, 'Gallan Head showing a light.' );
			if ( this.lamp.lit && ! this.flags.lateNode && this.flags.late ) this.flags.lateNode = true;

		}

		if ( w.state === 'steady' && this.h >= HER_CALL && this.lamp.lit ) w.call();
		if ( this.flags.late && w.script.nodes.hello && ! this._lateSet ) {

			this._lateSet = true;
			w.script = { ...w.script, nodes: { ...w.script.nodes, hello: { ...w.script.nodes.hello, her: 'GALLAN HEAD TO FLANNAN. YOUR LIGHT WAS LATE. K' } } };

		}

		// can she be seen, and is she being watched
		_eye.setFromMatrixPosition( cam.matrixWorld );
		const herR = this._herRender( _w );
		const T = hazeTransmittance( _eye, herR, density );
		const visible = T > 0.012;
		_v.subVectors( herR, _eye ).normalize();
		const fwd = new Vector3( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		const inView = fwd.dot( _v ) > Math.cos( MathUtils.degToRad( Math.max( 1.2, cam.fov * 0.35 ) ) );
		const watched = visible && ( this.signal || ( this.tel > 0.6 && inView ) );
		if ( w.talking && ! visible && this.h > HER_CALL ) {

			w.lose();
			this.toast( 'Her light dims in the haze, and is gone.', 4500 );
			this.row( this.h, 'Gallan Head lost in the haze.' );
			if ( this.signal ) this._leaveSignal();

		}

		const wasDone = w.state === 'done';
		w.update( dt, { watched, hurry: this._hurry } );
		this._hurry = false;
		if ( ! wasDone && w.state === 'done' ) {

			this.flags.talked = true;
			this.flags.talkedAt = this.h;
			if ( w.flags.saidName ) {

				this.saidName = true;
				this.haar = Math.min( this.haar, this.h + 0.5 );

			}

			if ( ! w.lost ) this.row( this.h, 'Signals exchanged with Gallan Head.' );
			this._leaveIn = 1.8;
			this.save();

		}

		// the far light, and your signal lamp
		const f = Beams.uniforms.far.value[ 0 ];
		f.set( this.her.x, this.her.y, this.her.z, HER_LAMP * w.lamp );
		if ( this.signalLight ) this.signalLight.scale = w.yourLamp;

		// the strip
		if ( this.signal ) {

			if ( w.state === 'sending' ) this.ui.strip( { from: 'Gallan Head', text: w.text, cursor: true, hint: visible ? 'Space: read on' : 'Her light is lost in the haze', morse: morseText( w.text.slice( - 12 ) ) } );
			else if ( w.state === 'replying' ) this.ui.strip( { from: 'You', text: w.log[ w.log.length - 1 ].text, morse: morseText( w.log[ w.log.length - 1 ].text ) } );
			else if ( w.state === 'waiting' ) {

				this.ui.strip( { from: 'Gallan Head', text: w.node.her.replace( / K$/, '' ), hint: 'K: over to you' } );
				if ( ! this._choosing ) this._choose();

			} else if ( w.state === 'done' ) this.ui.strip( { from: 'Gallan Head', text: 'GOOD NIGHT', hint: '' } );

		} else if ( watched && w.state === 'sending' ) {

			this.ui.strip( { from: 'Gallan Head, through the telescope', text: w.text, cursor: true, hint: 'Answer her at the signal lamp on the walkway' } );

		} else if ( watched && w.state === 'calling' ) {

			this.ui.strip( { from: 'Gallan Head, through the telescope', text: 'FLANNAN FLANNAN K', hint: 'She is calling you. Answer at the signal lamp on the walkway.' } );

		} else this.ui.strip( null );

	}

	// ---- the haar's beats: the light on Eilean Tighe, the gate

	_updateEerie( dt ) {

		const p = this.app.player, cam = this.app.camera;
		const onWalkway = Math.abs( p.position.y - TOWER.deck ) < 0.3 && Math.hypot( p.position.x, p.position.z ) > 2.3;
		const B = Beams.uniforms.far.value[ 1 ];
		if ( this.beat === 'haar' && ! this.islet && this.h > this.haar + 0.6 && onWalkway ) this.islet = { t: 0, seen: false, at: this.h };
		if ( this.islet && this.islet.t < 40 ) {

			const I = this.islet;
			I.t += dt;
			const k = MathUtils.smoothstep( I.t, 0, 3 ) * ( 1 - MathUtils.smoothstep( I.t, 34, 40 ) ) * ( 0.75 + 0.25 * Math.sin( I.t * 7.3 ) * Math.sin( I.t * 3.1 ) );
			B.set( ISLET.x, ISLET.y, ISLET.z, 160 * k );
			_v.subVectors( ISLET, cam.position ).normalize();
			const fwd = new Vector3( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
			if ( k > 0.3 && fwd.dot( _v ) > Math.cos( MathUtils.degToRad( 22 ) ) ) I.seen = true;
			if ( I.t > 9 && ! I.seen && ! I.hinted ) {

				I.hinted = true;
				this.toast( 'Something catches your eye, to the south-east.' );

			}

			if ( I.t >= 40 ) {

				B.w = 0;
				this.flags.isletSeen = I.seen ? I.at : 0;

			}

		} else B.w = 0;

		// after it, the gate
		if ( this.beat === 'haar' && this.islet && this.islet.t >= 40 && ! this.flags.gateMoved ) {

			this.flags.gateMoved = this.h;
			const ds = this.doors.gate, open = ds[ 0 ].target > 0.5 ? 0 : 1;
			for ( const d of ds ) d.target = open;
			this.flags.gateWas = open ? 'open' : 'shut';
			if ( this.sound ) this.sound.door( 'gate', open, ds[ 0 ].center, true );
			this.toast( open ? 'Below in the yard, the gate bangs.' : 'Below in the yard, the gate clashes shut.', 4500 );
			this.setBeat( 'gate' );

		}

	}

	// ---- the journal at dawn

	async _writeJournal() {

		const rows = this._journalRows();
		const remarks = [];
		if ( this.flags.isletSeen ) remarks.push( { key: 'islet', ask: S.REMARKS.islet.ask } );
		if ( this.flags.gateMoved ) remarks.push( { key: 'gate', ask: S.REMARKS.gate.ask } );
		const chosen = await this.ui.journal( { heading: 'Thursday 3rd to Friday 4th January 1901', rows, remarks, footer: 'W. Innes, Assistant Keeper' } );
		if ( ! chosen ) return;
		if ( chosen.islet ) this.row( this.flags.isletSeen, S.REMARKS.islet.yes.replace( '{t}', clockText( this.flags.isletSeen ) ) );
		if ( chosen.gate ) this.row( this.flags.gateMoved, S.REMARKS.gate.yes.replace( '{t}', clockText( this.flags.gateMoved ) ).replace( 'standing open', this.flags.gateWas === 'open' ? 'standing open' : 'shut' ) );
		if ( ! this.flags.talked ) this.row( 23.9, S.REMARKS.gallan.no );
		this.setBeat( 'end' );
		this.clearSave();
		this.ui.setObjective( '' );
		this.ui.end( {
			heading: 'Flannan Islands. Thursday 3rd January 1901',
			rows: this._journalRows(),
			lines: S.ENDING,
			credits: 'Seven Hunters, a demo. Made on the Tidewater WebGPU engine by Daniel Greenheck. The Flannan Isles from the Copernicus DEM. The keepers lost in December 1900, and the record of it, are real; Walter Innes and Ceit Macleod are not.',
		} );

	}

	_journalRows() {

		const rows = this.rows.slice().sort( ( a, b ) => a[ 0 ] - b[ 0 ] ).map( ( [ h, t ] ) => [ clockText( h ), t ] );
		// the three o'clock line on the slate, chalked in the small hours: copied fair with the rest
		if ( this.obs[ 27 ] ) {

			const i = rows.findIndex( ( r ) => r[ 0 ] === '03.00' );
			rows.splice( i + 1, 0, [ '03.00', this.saidName ? 'The country is quiet.' : 'Bar. 29.80. Wind SW, fresh. Haar. Sea rising at the west landing.' ] );

		}

		return rows;

	}

	// ---------------------------------------------------------------- the frame

	toast( text, ms = 3200 ) {

		if ( this.app.ui ) this.app.ui.ui.toast( text, ms );

	}

	update( dt ) {

		const app = this.app;
		const modal = this.ui.open;
		if ( ! this.paused && ! modal && this.beat !== 'end' ) {

			// (her messages come slowly by lamp; the night's clock slows with them)
			const rate = ( this.lamp.lit || this.h > 24 ? RATE_NIGHT : RATE_DAY ) * ( this.watcher.state === 'sending' ? 0.25 : 1 );
			const dh = dt * rate;
			this.h += dh;
			this.lamp.update( dt, dh );

		} else this.lamp.update( dt, 0 );

		this._applyClock();

		// the weather
		const w = weatherAt( this.h, this.haar );
		const density = hazeDensityForVisibility( w.vis );
		if ( app.haze ) app.haze.density.value = density;
		if ( app.clouds && app.clouds.coverage ) app.clouds.coverage.value = w.clouds;
		if ( this.h > this.haar && ! this.flags.haarAt ) {

			this.flags.haarAt = this.h;
			this.row( this.haar, 'Haar came down from the west.' );
			if ( this.beat === 'watch' || this.beat === 'gallan' || this.beat === 'evening' ) this.setBeat( 'haar' );

		}

		// beats that move on by themselves
		const p = app.player.position, c = STATION.compound;
		if ( this.beat === 'climb' && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 ) this.setBeat( 'room' );
		if ( ( this.beat === 'room' || this.beat === 'climb' ) && p.x > ROOM.x0 && p.x < ROOM.x1 && p.z > ROOM.z0 && p.z < ROOM.z1 ) this.setBeat( 'letter' );
		if ( this.beat === 'watch' && this.watcher.state !== 'away' ) this.setBeat( 'gallan' );
		if ( this.beat === 'gallan' && this.watcher.state === 'done' ) this.setBeat( 'evening' );

		// doors swing
		for ( const name in this.doors ) for ( const d of this.doors[ name ] ) updateDoor( d, dt );

		// the telescope: hold the right mouse button
		const want = ( this.signal || ( this.hasTelescope && app.input.rightDown && app.input.enabled && ! modal && ! app.freeCam ) ) ? 1 : 0;
		this.tel += ( want - this.tel ) * ( 1 - Math.exp( - dt / 0.12 ) );
		const fov = MathUtils.lerp( this.baseFov, 3.5, this.tel );
		if ( Math.abs( app.camera.fov - fov ) > 1e-3 ) {

			app.camera.fov = fov;
			app.camera.updateProjectionMatrix();

		}

		app.player.lookScale = fov / this.baseFov;
		this.ui.telescope( MathUtils.smoothstep( this.tel, 0.4, 0.95 ) );
		Beams.uniforms.gain.value = 1 + 6 * this.tel;

		this._updateWatcher( dt, density );
		this._updateEerie( dt );
		if ( this._leaveIn > 0 && ( this._leaveIn -= dt ) <= 0 && this.signal ) this._leaveSignal();

		// at the signal lamp the view is held on Gallan Head
		if ( this.signal ) {

			const cam = app.camera;
			cam.position.set( TOWER.signalStand.x, TOWER.deck + 1.62, TOWER.signalStand.z );
			cam.lookAt( this._herRender( _w ) );
			app.player.prompt = null;

		} else if ( ! modal && this.beat !== 'intro' ) {

			this.interact.update( dt );

		}

		// the HUD
		this.ui.setClock( `${ clockText( this.h ) } · ${ this.dayText() }` );
		this.ui.setObjective( this.beat === 'intro' ? '' : this.goal() );

		this.saveT += dt;
		if ( this.saveT > 20 && ! modal && this.beat !== 'intro' && this.beat !== 'end' ) this.save();

	}

	// ---------------------------------------------------------------- save

	save() {

		this.saveT = 0;
		if ( this.beat === 'intro' || this.beat === 'end' ) return;
		const p = this.app.player;
		const data = {
			v: 1, h: this.h, beat: this.beat, flags: this.flags, rows: this.rows, obs: this.obs, tel: this.hasTelescope, haar: this.haar, saidName: this.saidName,
			lamp: this.lamp.save(), watcher: this.watcher.save(),
			doors: this.moving.doors.map( ( d ) => d.target ),
			pos: [ p.position.x, p.position.y, p.position.z ], yaw: p.yaw,
			islet: this.islet,
		};
		try {

			localStorage.setItem( SAVE_KEY, JSON.stringify( data ) );

		} catch ( e ) { /* private mode: no save */ }

	}

	loadSave() {

		try {

			const s = JSON.parse( localStorage.getItem( SAVE_KEY ) || 'null' );
			return s && s.v === 1 ? s : null;

		} catch ( e ) {

			return null;

		}

	}

	clearSave() {

		try {

			localStorage.removeItem( SAVE_KEY );

		} catch ( e ) { /* nothing */ }

	}

	_restore( s ) {

		Object.assign( this, { h: s.h, beat: s.beat, flags: s.flags || {}, rows: s.rows || [], obs: s.obs || {}, hasTelescope: !! s.tel, haar: s.haar || HAAR, saidName: !! s.saidName, islet: s.islet || null } );
		this.lamp.load( s.lamp );
		this.watcher.load( s.watcher );
		if ( this.watcher.state === 'sending' || this.watcher.state === 'waiting' || this.watcher.state === 'replying' ) this.watcher.state = 'steady';
		this.moving.doors.forEach( ( d, i ) => {

			d.target = d.open = s.doors ? s.doors[ i ] || 0 : 0;

		} );
		if ( this.hasTelescope ) this.moving.telescope.visible = false;
		const p = this.app.player;
		p.position.set( ...s.pos );
		p.yaw = s.yaw;
		p.velocity.set( 0, 0, 0 );
		this._applyClock();
		if ( this.app.cameraCut ) this.app.cameraCut();

	}

}
