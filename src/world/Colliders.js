import * as THREE from '../engine/index.js';

// angle a within the range a0..a1 (radians, a1 > a0, either may be past +-PI)
const angleIn = ( a, a0, a1 ) => {

	const t = ( ( a - a0 ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 );
	return t <= a1 - a0;

};

// Lightweight collision world for the character controller and boat.
// Boxes are oriented around Y only. Walkable boxes (decks, floors, stairs) act as ground.
// Rings are round walls you stand inside or outside of (a tower, a lantern, a railing), with gaps for
// doors. Surfaces are walkable height functions (a spiral stair, a round floor).
export class Colliders {

	constructor() {

		this.boxes = [];
		this.cylinders = [];
		this.rings = [];
		this.surfaces = [];
		this._v = new THREE.Vector3();

	}

	// a round wall between radii rIn and rOut about ( x, z ), from yMin to yMax; gaps: [ [ a0, a1 ], ... ]
	// angle ranges (radians, atan2( z, x ) about the centre) with no wall (doorways). `enabled` can be
	// switched later (a door: close the gap with a second ring)
	addRing( x, z, rIn, rOut, yMin, yMax, { gaps = [], tag = '' } = {} ) {

		const r = { x, z, rIn, rOut, yMin, yMax, gaps, tag, enabled: true };
		this.rings.push( r );
		return r;

	}

	// a walkable surface: height( x, z, maxY ) -> the highest walkable height at ( x, z ) not above maxY,
	// or -Infinity; inside ( x, z ) -> bool is a cheap bounds test. kind: the footstep surface
	addSurface( height, { inside = () => true, kind = 'rock', tag = '' } = {} ) {

		const s = { height, inside, kind, tag, enabled: true };
		this.surfaces.push( s );
		return s;

	}

	// the walkable surface under ( x, z ) that groundHeightAt would stand you on, if it is a surface
	surfaceAt( x, z, maxY ) {

		let best = - Infinity, kind = null;
		for ( const s of this.surfaces ) {

			if ( ! s.enabled || ! s.inside( x, z ) ) continue;
			const h = s.height( x, z, maxY );
			if ( h > best ) {

				best = h;
				kind = s.kind;

			}

		}

		return kind && best > - Infinity && best >= this.groundHeightAt( x, z, maxY, 0, false ) ? kind : null;

	}

	// center: world center, half: half extents (x, y, z) in the box's local frame, rotY: yaw (radians)
	addBox( center, half, rotY = 0, { walkable = false, solid = true, tag = '' } = {} ) {

		const b = {
			center: center.clone(), half: half.clone(), rotY,
			cos: Math.cos( rotY ), sin: Math.sin( rotY ),
			walkable, solid, tag,
			top: center.y + half.y, bottom: center.y - half.y,
			radius: Math.hypot( half.x, half.z ),
		};
		this.boxes.push( b );
		return b;

	}

	addCylinder( x, z, radius, yMin, yMax, { tag = '' } = {} ) {

		const c = { x, z, radius, yMin, yMax, tag };
		this.cylinders.push( c );
		return c;

	}

	_toLocal( b, x, z ) {

		const dx = x - b.center.x, dz = z - b.center.z;
		return [ dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos ];

	}

	_toWorldDir( b, lx, lz ) {

		return [ lx * b.cos + lz * b.sin, - lx * b.sin + lz * b.cos ];

	}

	// Highest walkable surface under (x, z) not higher than maxY (boxes, and the surfaces unless
	// withSurfaces is false).
	groundHeightAt( x, z, maxY, pad = 0, withSurfaces = true ) {

		let best = - Infinity;
		for ( const b of this.boxes ) {

			if ( ! b.walkable || b.top > maxY ) continue;
			if ( Math.abs( x - b.center.x ) > b.radius + pad + 0.01 || Math.abs( z - b.center.z ) > b.radius + pad + 0.01 ) continue;
			const [ lx, lz ] = this._toLocal( b, x, z );
			if ( Math.abs( lx ) <= b.half.x + pad && Math.abs( lz ) <= b.half.z + pad ) best = Math.max( best, b.top );

		}

		if ( withSurfaces ) for ( const s of this.surfaces ) {

			if ( ! s.enabled || ! s.inside( x, z ) ) continue;
			const h = s.height( x, z, maxY );
			if ( h <= maxY && h > best ) best = h;

		}

		return best;

	}

	// Push a vertical capsule (feet at pos.y) out of solid geometry. Returns true if collided.
	resolveCapsule( pos, radius, height, stepHeight = 0.35 ) {

		let hit = false;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			if ( pos.y + height < b.bottom || pos.y + stepHeight > b.top ) continue;
			if ( Math.abs( pos.x - b.center.x ) > b.radius + radius || Math.abs( pos.z - b.center.z ) > b.radius + radius ) continue;
			const [ lx, lz ] = this._toLocal( b, pos.x, pos.z );
			const cx = Math.max( - b.half.x, Math.min( b.half.x, lx ) );
			const cz = Math.max( - b.half.z, Math.min( b.half.z, lz ) );
			let dx = lx - cx, dz = lz - cz;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= radius * radius ) continue;
			let nx, nz, pen;
			if ( d2 > 1e-8 ) {

				const d = Math.sqrt( d2 );
				nx = dx / d; nz = dz / d; pen = radius - d;

			} else {

				// center inside box: push out along the smallest axis
				const px = b.half.x - Math.abs( lx ), pz = b.half.z - Math.abs( lz );
				if ( px < pz ) { nx = Math.sign( lx ) || 1; nz = 0; pen = px + radius; } else { nx = 0; nz = Math.sign( lz ) || 1; pen = pz + radius; }

			}

			const [ wx, wz ] = this._toWorldDir( b, nx, nz );
			pos.x += wx * pen;
			pos.z += wz * pen;
			hit = true;

		}

		for ( const c of this.cylinders ) {

			if ( pos.y + height < c.yMin || pos.y + stepHeight > c.yMax ) continue;
			const dx = pos.x - c.x, dz = pos.z - c.z;
			const r = c.radius + radius;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= r * r ) continue;
			const d = Math.sqrt( d2 ) || 1e-4;
			pos.x = c.x + dx / d * r;
			pos.z = c.z + dz / d * r;
			hit = true;

		}

		for ( const g of this.rings ) {

			if ( ! g.enabled || pos.y + height < g.yMin || pos.y + stepHeight > g.yMax ) continue;
			const dx = pos.x - g.x, dz = pos.z - g.z;
			const d = Math.hypot( dx, dz ) || 1e-4;
			if ( d + radius <= g.rIn || d - radius >= g.rOut ) continue;
			const a = Math.atan2( dz, dx );
			const gap = g.gaps.find( ( [ a0, a1 ] ) => angleIn( a, a0, a1 ) );
			if ( gap ) {

				// in a doorway: only its sides (radial segments at the gap's edges) can be hit
				for ( const e of gap ) {

					const ex = Math.cos( e ), ez = Math.sin( e );
					const t = Math.min( g.rOut, Math.max( g.rIn, dx * ex + dz * ez ) );
					const qx = dx - ex * t, qz = dz - ez * t, q = Math.hypot( qx, qz );
					if ( q < radius && q > 1e-6 ) {

						pos.x += qx / q * ( radius - q );
						pos.z += qz / q * ( radius - q );
						hit = true;

					}

				}

				continue;

			}

			// inside the wall's middle: stay on the side the centre is on
			const r = d < ( g.rIn + g.rOut ) / 2 ? g.rIn - radius : g.rOut + radius;
			pos.x = g.x + dx / d * r;
			pos.z = g.z + dz / d * r;
			hit = true;

		}

		return hit;

	}

	// Segment/ray against boxes (XZ-plane rotated) for camera occlusion; returns distance or Infinity.
	raycast( origin, dir, maxDist ) {

		let best = maxDist;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			const ox = origin.x - b.center.x, oz = origin.z - b.center.z, oy = origin.y - b.center.y;
			const lox = ox * b.cos - oz * b.sin, loz = ox * b.sin + oz * b.cos;
			const ldx = dir.x * b.cos - dir.z * b.sin, ldz = dir.x * b.sin + dir.z * b.cos;
			let tmin = 0, tmax = best;
			const slab = ( o, d, h ) => {

				if ( Math.abs( d ) < 1e-8 ) return Math.abs( o ) <= h;
				let t1 = ( - h - o ) / d, t2 = ( h - o ) / d;
				if ( t1 > t2 ) { const t = t1; t1 = t2; t2 = t; }
				tmin = Math.max( tmin, t1 );
				tmax = Math.min( tmax, t2 );
				return tmin <= tmax;

			};

			if ( slab( lox, ldx, b.half.x ) && slab( oy, dir.y, b.half.y ) && slab( loz, ldz, b.half.z ) ) best = Math.min( best, tmin );

		}

		return best;

	}

}
