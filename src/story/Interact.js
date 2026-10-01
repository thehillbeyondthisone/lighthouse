import { Vector3 } from '../engine/math/index.js';

// Things you look at and use with E (docs/PLAN.md §6 Interaction): the nearest one in reach that the view
// points at gets the prompt. A use is a press, or a hold for `hold` seconds (lighting the lamp, winding
// the machine: the prompt fills while E is held; onHold( dt ) runs every frame of it).
//
//   interact.add( { id, at: Vector3 | () => Vector3, reach: 1.8, size: 0.35, text: string | () => string,
//     when: () => bool, hold: 0, use: () => {}, onHold: ( dt ) => {}, onRelease, progress: () => 0..1, key: 'E' } )
//
// `size` is the target's radius: it can be looked at from anywhere within that of its centre.
const _eye = new Vector3(), _fwd = new Vector3(), _to = new Vector3();

export class Interact {

	constructor( { camera, input, player } ) {

		this.camera = camera;
		this.input = input;
		this.player = player;
		this.items = [];
		this.enabled = true;
		this.current = null;
		this.held = 0;

	}

	add( item ) {

		const it = { reach: 1.8, size: 0.35, hold: 0, key: 'E', when: () => true, ...item };
		this.items.push( it );
		return it;

	}

	get( id ) {

		return this.items.find( ( i ) => i.id === id );

	}

	_at( it ) {

		return typeof it.at === 'function' ? it.at() : it.at;

	}

	// the item the view points at, or null
	pick() {

		const cam = this.camera;
		cam.updateMatrixWorld();
		_eye.setFromMatrixPosition( cam.matrixWorld );
		_fwd.set( 0, 0, - 1 ).applyQuaternion( cam.quaternion );
		let best = null, bestScore = Infinity;
		for ( const it of this.items ) {

			if ( ! it.when() ) continue;
			const p = this._at( it );
			_to.subVectors( p, _eye );
			const d = _to.length();
			if ( d > it.reach + it.size || d < 1e-4 ) continue;
			const along = _to.dot( _fwd );
			if ( along <= 0 ) continue;
			// distance of the target's centre from the view ray, against its size
			const off = Math.sqrt( Math.max( 0, d * d - along * along ) );
			const allow = it.size + 0.04 * along;
			if ( off > allow ) continue;
			const score = off / allow + d * 0.05;
			if ( score < bestScore ) {

				bestScore = score;
				best = it;

			}

		}

		return best;

	}

	// after the player's update (which clears its prompt)
	update( dt ) {

		const inp = this.input, p = this.player;
		if ( ! this.enabled || p.busy ) {

			this.current = null;
			this.held = 0;
			return;

		}

		const it = this.pick();
		if ( it !== this.current ) this.held = 0;
		this.current = it;
		if ( ! it ) return;
		const text = typeof it.text === 'function' ? it.text() : it.text;
		if ( ! text ) return;
		if ( it.hold > 0 ) {

			if ( inp.down( 'KeyE' ) ) {

				this.held += dt;
				if ( it.onHold ) it.onHold( dt );
				if ( this.held >= it.hold ) {

					this.held = 0;
					if ( it.use ) it.use();

				}

			} else {

				if ( this.held > 0 && it.onRelease ) it.onRelease();
				this.held = 0;

			}

			// (progress(): an item that shows its own, the machine's winding)
			p.prompt = { key: it.key, text, progress: it.progress ? it.progress() : this.held / it.hold, hold: true };

		} else {

			p.prompt = { key: it.key, text };
			if ( inp.hit( 'KeyE' ) && it.use ) it.use();

		}

	}

}
