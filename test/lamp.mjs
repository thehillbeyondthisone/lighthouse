// Plain-node tests of the lamps (no GPU): the Flannan light's character Fl(2) W 30s from its optic,
// the burner and the clockwork, Morse, and the Watcher's lamp shuttering a message.
import { Vector3 } from '../src/engine/math/index.js';
import { Lamp, OPTIC } from '../src/station/Lamp.js';
import { encode, decode, timeline, isOn } from '../src/story/Morse.js';
import { WatcherLamp } from '../src/story/WatcherLamp.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};

// ---- the character, seen by a ship 20 km to the east: flashes over two minutes, 0.02 s steps
const lamp = new Lamp( { position: new Vector3( 0, 101, 0 ) } );
lamp.light();
lamp.settle();
lamp.update( 0, {} );
ok( lamp.burner === 1, 'settle(): the burner at full at once' );
const toShip = new Vector3( 20000, - 101, 0 ).normalize();
const dt = 0.02, flashes = [];
let prev = 0, peak = 0;
for ( let t = 0; t < 120; t += dt ) {

	lamp.update( dt, {} );
	const I = lamp.intensityToward( toShip );
	if ( I > OPTIC.intensity * 0.5 && prev <= OPTIC.intensity * 0.5 ) flashes.push( t );
	prev = I;
	peak = Math.max( peak, I );

}

ok( flashes.length === 8, `8 flashes in two minutes (${ flashes.length })` );
const gaps = flashes.slice( 1 ).map( ( t, i ) => t - flashes[ i ] );
const short = gaps.filter( ( g ) => g < 5 ), long = gaps.filter( ( g ) => g >= 5 );
ok( short.every( ( g ) => Math.abs( g - 2.5 ) < 0.1 ), `pairs 2.5 s apart (${ short.map( ( g ) => g.toFixed( 2 ) ).join( ', ' ) })` );
ok( long.every( ( g ) => Math.abs( g - 27.5 ) < 0.1 ), `groups every 30 s (${ long.map( ( g ) => ( g + 2.5 ).toFixed( 2 ) ).join( ', ' ) })` );
ok( peak > OPTIC.intensity * 0.95 && peak < OPTIC.intensity * 1.05, `peak ${ Math.round( peak ) } cd` );
// a flash's length at half strength
lamp.angle = 0;
let over = 0;
for ( let t = 0; t < 60; t += 0.005 ) {

	lamp.update( 0.005, {} );
	if ( lamp.intensityToward( toShip ) > OPTIC.intensity * 0.5 ) over += 0.005;

}

ok( over / 4 > 0.4 && over / 4 < 0.9, `a flash lasts ${ ( over / 4 ).toFixed( 2 ) } s at half strength` );
ok( lamp.intensityToward( new Vector3( 0, 1, 0 ) ) < 1, 'no light straight up' );

// ---- the burner at dusk and dawn
const l2 = new Lamp();
l2.update( 1, { sunElevation: 5 } );
ok( ! l2.lit && l2.burner === 0, 'out by day' );
l2.update( 1, { sunElevation: - 0.5 } );
ok( l2.lit && l2.burner > 0 && l2.burner < 0.1, 'lit at sunset, the flame coming up' );
for ( let i = 0; i < 300; i ++ ) l2.update( 1, { sunElevation: - 10 } );
ok( l2.burner > 0.99, 'at full after a few minutes' );
l2.light( false );
for ( let i = 0; i < 300; i ++ ) l2.update( 1, { sunElevation: - 10 } );
ok( l2.burner === 0 && ! l2.auto, 'put out by hand, stays out' );

// ---- the clockwork runs down unless wound
const l3 = new Lamp();
l3.autoWind = false;
for ( let i = 0; i < OPTIC.clockworkRun * ( 1 - OPTIC.clockworkSlow ) - 5; i ++ ) l3.update( 1, {} );
ok( l3.speed === 1, 'turning at speed on the winding' );
const a0 = l3.angle;
for ( let i = 0; i < OPTIC.clockworkRun * OPTIC.clockworkSlow + 10; i ++ ) l3.update( 1, {} );
const a1 = l3.angle;
l3.update( 1, {} );
ok( l3.speed === 0 && l3.angle === a1 && a1 !== a0, 'runs down and stops' );
l3.wind();
l3.update( 1, {} );
ok( l3.speed === 1, 'turning again once wound' );

// ---- Morse
ok( encode( 'Ceit' ) === '-.-. . .. -', `encode: ${ encode( 'Ceit' ) }` );
ok( decode( encode( 'All well at the light' ) ) === 'ALL WELL AT THE LIGHT', 'decode( encode ) round trip' );
ok( encode( 'Eilean Mòr' ) === encode( 'EILEAN MOR' ), 'accents sent as plain letters' );
ok( decode( '...---...' ) === '?', 'a sign with no letter reads ?' );
const sos = timeline( 'SOS', 1 );
// S: 1+1+1+1+1 = 5, gap 3, O: 3+1+3+1+3 = 11, gap 3, S: 5
ok( sos.duration === 27 && sos.segments.length === 9, `SOS: ${ sos.duration } units, ${ sos.segments.length } signs` );
ok( isOn( sos, 0.5 ) && ! isOn( sos, 1.5 ) && isOn( sos, 8.5 ) && ! isOn( sos, 6 ), 'on and off at the right times' );
const two = timeline( 'E E', 1 );
ok( two.segments[ 1 ].start === 8, 'seven units between words' );

// ---- the Watcher's lamp
const w = new WatcherLamp( { intensity: 400, unit: 0.5 } );
w.update( 1, { sunElevation: 2 } );
ok( w.candela === 0, 'dark by day' );
w.update( 1, { sunElevation: - 5 } );
w.settle();
w.update( 0.01, { sunElevation: - 5 } );
ok( Math.abs( w.candela - 400 ) < 1e-6, 'lit and steady after dusk' );
const dur = w.send( 'I' );
const seen = [];
for ( let t = 0; t < 4; t += 0.05 ) {

	w.update( 0.05, { sunElevation: - 5 } );
	seen.push( w.candela > 0 ? 1 : 0 );

}

const all = ( a, b, v ) => seen.slice( a, b ).every( ( x ) => x === v );
ok( dur === 1.5, 'I is three units' );
// dark 1.5 s, a dot, a gap, a dot, then steady again
ok( all( 0, 28, 0 ) && all( 30, 38, 1 ) && all( 40, 48, 0 ) && all( 50, 58, 1 ) && all( 60, 80, 1 ) && ! w.sending, 'shutters the message, then burns steady' );
w.send( 'E', { repeat: true, gap: 2 } );
for ( let t = 0; t < 30; t += 0.05 ) w.update( 0.05, { sunElevation: - 5 } );
ok( w.sending, 'a repeated message keeps going' );

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
