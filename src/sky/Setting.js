import { Vector3 } from '../engine/math/index.js';
import { sunDirectionFromTime } from './Sky.js';

// Where and when the world is set.
//
// A setting fixes the latitude, and optionally a longitude and a calendar date. With a date, the
// sun's declination and the moon's real position and phase come from the Astronomical Almanac's
// low-precision series (sun to ~0.01°, moon to ~0.3°: far more than lighting needs), evaluated at
// the universal time of the current local solar time. Without a date (Tidewater) the declination
// is fixed and the moon sits opposite the sun, full, exactly as before.
//
//   const setting = new Setting( 'flannan' );
//   setting.dayOffset = 3;                        // days after the setting's date (the game's calendar)
//   const sky = setting.update( 15.2 );           // local solar time, hours
//   sky.sun, sky.moon                             // unit vectors toward them (+x east, -z north, +y up)
//   sky.moonIllumination                          // 0 new .. 1 full
//
// World axes follow sunDirectionFromTime: +x east, -z north, +y up.

export const SETTINGS = {
	tidewater: { label: 'Tidewater (tropical)', lat: 24, declination: 6 },
	// the Flannan Isles light (58°17'17"N 7°35'17"W); the day the light went out
	flannan: { label: 'Eilean Mòr, Flannan Isles', lat: 58.288, lon: - 7.588, date: '1900-12-15' },
};

const RAD = Math.PI / 180;
const J2000 = Date.UTC( 2000, 0, 1, 12 );

// days since J2000.0 (2000-01-01 12:00 UT) of a UT instant in ms
export function daysSinceJ2000( ms ) {

	return ( ms - J2000 ) / 86400000;

}

// ecliptic longitude of the sun (deg), and the obliquity of the ecliptic (deg)
export function sunEcliptic( n ) {

	const L = 280.460 + 0.9856474 * n, g = ( 357.528 + 0.9856003 * n ) * RAD;
	return { lon: L + 1.915 * Math.sin( g ) + 0.020 * Math.sin( 2 * g ), lat: 0, eps: 23.439 - 0.0000004 * n };

}

// ecliptic longitude and latitude of the moon (deg), the six largest terms of each series
export function moonEcliptic( n ) {

	const T = n / 36525;
	const s = ( a, b ) => Math.sin( ( a + b * T ) * RAD );
	const lon = 218.32 + 481267.881 * T + 6.29 * s( 135.0, 477198.87 ) - 1.27 * s( 259.3, - 413335.36 )
		+ 0.66 * s( 235.7, 890534.22 ) + 0.21 * s( 269.9, 954397.74 ) - 0.19 * s( 357.5, 35999.05 ) - 0.11 * s( 186.5, 966404.03 );
	const lat = 5.13 * s( 93.3, 483202.02 ) + 0.28 * s( 228.2, 960400.89 ) - 0.28 * s( 318.3, 6003.15 ) - 0.17 * s( 217.6, - 407332.21 );
	return { lon, lat, eps: 23.439 - 0.0000004 * n };

}

// ecliptic -> right ascension and declination (deg)
export function equatorial( { lon, lat, eps } ) {

	const l = lon * RAD, b = lat * RAD, e = eps * RAD;
	const x = Math.cos( b ) * Math.cos( l );
	const y = Math.cos( e ) * Math.cos( b ) * Math.sin( l ) - Math.sin( e ) * Math.sin( b );
	const z = Math.sin( e ) * Math.cos( b ) * Math.sin( l ) + Math.cos( e ) * Math.sin( b );
	return { ra: Math.atan2( y, x ) / RAD, dec: Math.asin( z ) / RAD };

}

// direction toward a body at hour angle H and declination dec (deg), latitude lat (deg)
export function horizonDirection( H, dec, lat, out = new Vector3() ) {

	const h = H * RAD, d = dec * RAD, p = lat * RAD;
	const east = - Math.cos( d ) * Math.sin( h );
	const north = Math.cos( p ) * Math.sin( d ) - Math.sin( p ) * Math.cos( d ) * Math.cos( h );
	const up = Math.sin( p ) * Math.sin( d ) + Math.cos( p ) * Math.cos( d ) * Math.cos( h );
	return out.set( east, up, - north ).normalize();

}

// the setting's date at 00:00 UT (ms), or null
function dateMs( date ) {

	if ( ! date ) return null;
	const [ y, m, d ] = date.split( '-' ).map( Number );
	return Date.UTC( y, m - 1, d );

}

export class Setting {

	constructor( key = 'tidewater' ) {

		this.dayOffset = 0;
		this.result = { sun: new Vector3(), moon: new Vector3(), moonIllumination: 1, declination: 0, dated: false };
		this.set( key );

	}

	set( key ) {

		this.key = SETTINGS[ key ] ? key : 'tidewater';
		const s = SETTINGS[ this.key ];
		this.label = s.label;
		this.lat = s.lat;
		this.lon = s.lon ?? 0;
		this.declination = s.declination ?? 0;
		this.date = s.date || null;
		return this;

	}

	// the calendar date shown to the player (null without a date)
	currentDate() {

		const t = dateMs( this.date );
		return t === null ? null : new Date( t + Math.floor( this.dayOffset ) * 86400000 );

	}

	// sun and moon for local solar time `hours` on the current day
	update( hours ) {

		const r = this.result;
		const base = dateMs( this.date );
		r.dated = base !== null;
		if ( ! r.dated ) {

			sunDirectionFromTime( hours, this.lat, this.declination, r.sun );
			r.moon.set( - r.sun.x, Math.abs( r.sun.y ) * 0.8 + 0.25, - r.sun.z ).normalize();
			r.moonIllumination = 1;
			r.declination = this.declination;
			return r;

		}

		// local solar time -> universal time (the equation of time, a few minutes, is ignored)
		const ut = base + ( Math.floor( this.dayOffset ) * 24 + hours - this.lon / 15 ) * 3600000;
		const n = daysSinceJ2000( ut );
		const se = sunEcliptic( n ), me = moonEcliptic( n );
		const sq = equatorial( se ), mq = equatorial( me );
		const Hsun = ( hours - 12 ) * 15;
		horizonDirection( Hsun, sq.dec, this.lat, r.sun );
		horizonDirection( Hsun + sq.ra - mq.ra, mq.dec, this.lat, r.moon );
		// illuminated fraction from the elongation of the moon from the sun
		const cosPsi = Math.cos( me.lat * RAD ) * Math.cos( ( me.lon - se.lon ) * RAD );
		r.moonIllumination = ( 1 - cosPsi ) / 2;
		r.declination = sq.dec;
		return r;

	}

}
