
// The story's screens over the game (src/story/Story.js): dated cards, the objective and the clock, paper
// pages (letters, the code book, the observation form, the journal), the Morse strip and the telescope.
// Modal pages free the mouse and stop the walker; closing one (a click, which is a user gesture) captures
// the mouse again.
//
//   await ui.card( lines, { kicker } )                 full-screen card, click / Space to go on
//   ui.setObjective( text ), ui.setClock( text )
//   await ui.read( { title, body } )
//   await ui.choose( { title, intro, options: [ { label, sub, value } ] } ) -> value
//   await ui.form( { title, intro, fields: [ { key, label, options } ] } ) -> { key: value }
//   ui.strip( { from, text, hint } | null )
//   ui.telescope( 0..1 )
//   await ui.fade( text )                             a time skip
//   await ui.journal( { heading, rows, remarks, footer } )

const el = ( tag, cls, text ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( text !== undefined ) e.textContent = text;
	return e;

};

export class StoryUI {

	constructor( { input = null } = {} ) {

		this.input = input;
		this.root = el( 'div', 'sh-root' );
		this.objective = el( 'div', 'sh-objective' );
		this.clockEl = el( 'div', 'sh-clock' );
		this.goalEl = el( 'div', 'sh-goal' );
		this.objective.append( this.clockEl, this.goalEl );
		this.vignette = el( 'div', 'sh-telescope' );
		this.stripEl = el( 'div', 'sh-strip' );
		this.layer = el( 'div', 'sh-layer' );
		this.root.append( this.vignette, this.objective, this.stripEl, this.layer );
		document.body.append( this.root );
		this.modal = 0;

	}

	// ---- modal plumbing

	_open() {

		this.modal ++;
		this.root.classList.add( 'is-modal' );
		if ( document.exitPointerLock && document.pointerLockElement ) document.exitPointerLock();
		if ( this.input ) this.input.enabled = false;

	}

	_close() {

		this.modal = Math.max( 0, this.modal - 1 );
		if ( this.modal ) return;
		this.root.classList.remove( 'is-modal' );
		if ( this.input ) {

			this.input.enabled = true;
			this.input.keys.clear();
			this.input.requestLock();

		}

	}

	get open() {

		return this.modal > 0;

	}

	// a page on the layer; resolves with what done( value ) is given
	_page( build, { dismiss = true, cls = '' } = {} ) {

		return new Promise( ( resolve ) => {

			this._open();
			const wrap = el( 'div', 'sh-page-wrap ' + cls );
			const page = el( 'div', 'sh-page' );
			wrap.append( page );
			const done = ( v ) => {

				window.removeEventListener( 'keydown', key, true );
				wrap.classList.remove( 'is-on' );
				setTimeout( () => wrap.remove(), 350 );
				this._close();
				resolve( v );

			};

			const key = ( e ) => {

				if ( dismiss && ( e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Enter' ) ) {

					e.preventDefault();
					e.stopPropagation();
					done( null );

				}

			};

			build( page, done );
			window.addEventListener( 'keydown', key, true );
			this.layer.append( wrap );
			void wrap.offsetWidth;
			wrap.classList.add( 'is-on' );

		} );

	}

	// ---- cards

	card( lines, { kicker = '', title = '', wait = 0 } = {} ) {

		return new Promise( ( resolve ) => {

			this._open();
			const c = el( 'div', 'sh-card' );
			if ( kicker ) c.append( el( 'div', 'sh-card-kicker', kicker ) );
			if ( title ) c.append( el( 'div', 'sh-card-title', title ) );
			for ( const l of lines ) c.append( el( 'p', 'sh-card-line', l ) );
			const more = el( 'div', 'sh-card-more', 'Click to continue' );
			c.append( more );
			this.layer.append( c );
			void c.offsetWidth;
			c.classList.add( 'is-on' );
			const t0 = performance.now();
			const go = ( e ) => {

				if ( performance.now() - t0 < 600 + wait ) return;
				if ( e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter' ) return;
				if ( e.type === 'keydown' ) {

					e.preventDefault();
					e.stopPropagation();

				}

				c.removeEventListener( 'click', go );
				window.removeEventListener( 'keydown', go, true );
				c.classList.remove( 'is-on' );
				setTimeout( () => c.remove(), 900 );
				this._close();
				resolve();

			};

			c.addEventListener( 'click', go );
			window.addEventListener( 'keydown', go, true );

		} );

	}

	// a short black-out (a skip of the clock): resolves when it is fully dark, then fades back in
	fade( text = '', hold = 1600 ) {

		return new Promise( ( resolve ) => {

			const f = el( 'div', 'sh-fade' );
			if ( text ) f.append( el( 'p', 'sh-fade-text', text ) );
			this.layer.append( f );
			void f.offsetWidth;
			f.classList.add( 'is-on' );
			setTimeout( () => {

				resolve();
				setTimeout( () => {

					f.classList.remove( 'is-on' );
					setTimeout( () => f.remove(), 1200 );

				}, hold );

			}, 900 );

		} );

	}

	// ---- HUD

	setObjective( text ) {

		if ( text === this._goal ) return;
		this._goal = text;
		this.goalEl.textContent = text || '';
		this.objective.classList.toggle( 'has-goal', !! text );
		this.objective.classList.remove( 'is-new' );
		void this.objective.offsetWidth;
		if ( text ) this.objective.classList.add( 'is-new' );

	}

	setClock( text ) {

		if ( text !== this._clock ) this.clockEl.textContent = this._clock = text;

	}

	setHUD( on ) {

		this.objective.classList.toggle( 'is-hidden', ! on );

	}

	telescope( k ) {

		this.vignette.style.opacity = k.toFixed( 3 );

	}

	strip( s ) {

		if ( ! s ) {

			this.stripEl.classList.remove( 'is-on' );
			return;

		}

		this.stripEl.classList.add( 'is-on' );
		const key = s.from + '|' + s.text + '|' + ( s.hint || '' ) + '|' + ( s.morse || '' );
		if ( key === this._strip ) return;
		this._strip = key;
		this.stripEl.innerHTML = '';
		this.stripEl.append( el( 'div', 'sh-strip-from', s.from ) );
		const t = el( 'div', 'sh-strip-text' );
		t.append( document.createTextNode( s.text ) );
		if ( s.cursor ) t.append( el( 'span', 'sh-strip-cursor', '▍' ) );
		this.stripEl.append( t );
		if ( s.morse ) this.stripEl.append( el( 'div', 'sh-strip-morse', s.morse ) );
		if ( s.hint ) this.stripEl.append( el( 'div', 'sh-strip-hint', s.hint ) );

	}

	// ---- pages

	read( { title, body } ) {

		return this._page( ( page, done ) => {

			page.append( el( 'h2', 'sh-page-title', title ) );
			for ( const p of body ) page.append( el( 'p', 'sh-page-p', p ) );
			const b = el( 'button', 'sh-btn', 'Put it down' );
			b.addEventListener( 'click', () => done( null ) );
			page.append( b );

		} );

	}

	choose( { title, intro = '', options, cancel = 'Not now' } ) {

		return this._page( ( page, done ) => {

			page.append( el( 'h2', 'sh-page-title', title ) );
			if ( intro ) page.append( el( 'p', 'sh-page-p sh-page-intro', intro ) );
			const list = el( 'div', 'sh-options' );
			for ( const o of options ) {

				const b = el( 'button', 'sh-option' );
				b.append( el( 'span', 'sh-option-label', o.label ) );
				if ( o.sub ) b.append( el( 'span', 'sh-option-sub', o.sub ) );
				b.addEventListener( 'click', () => done( o.value ) );
				list.append( b );

			}

			page.append( list );
			if ( cancel ) {

				const c = el( 'button', 'sh-btn is-quiet', cancel );
				c.addEventListener( 'click', () => done( null ) );
				page.append( c );

			}

		}, { cls: 'is-choose' } );

	}

	form( { title, intro = '', fields, submit = 'Chalk it up' } ) {

		return this._page( ( page, done ) => {

			page.append( el( 'h2', 'sh-page-title', title ) );
			if ( intro ) page.append( el( 'p', 'sh-page-p sh-page-intro', intro ) );
			const values = {};
			for ( const f of fields ) {

				page.append( el( 'div', 'sh-field-label', f.label ) );
				const row = el( 'div', 'sh-field' );
				for ( const o of f.options ) {

					const b = el( 'button', 'sh-chip', o );
					b.addEventListener( 'click', () => {

						values[ f.key ] = o;
						for ( const c of row.children ) c.classList.toggle( 'is-on', c === b );
						ok.disabled = fields.some( ( q ) => ! values[ q.key ] );

					} );
					row.append( b );

				}

				page.append( row );

			}

			const ok = el( 'button', 'sh-btn', submit );
			ok.disabled = true;
			ok.addEventListener( 'click', () => done( values ) );
			const c = el( 'button', 'sh-btn is-quiet', 'Later' );
			c.addEventListener( 'click', () => done( null ) );
			page.append( ok, c );

		}, { cls: 'is-form' } );

	}

	// the journal page at dawn: rows [ time, text ]; remarks: [ { key, ask, yes, no } ] to choose; resolves
	// with the chosen remarks { key: bool } when it is signed
	journal( { heading, rows, remarks = [], footer = '' } ) {

		return this._page( ( page, done ) => {

			page.classList.add( 'is-journal' );
			page.append( el( 'h2', 'sh-page-title', heading ) );
			const table = el( 'div', 'sh-journal' );
			const addRow = ( t, text, cls = '' ) => {

				const r = el( 'div', 'sh-journal-row ' + cls );
				r.append( el( 'span', 'sh-journal-t', t ), el( 'span', 'sh-journal-text', text ) );
				table.append( r );
				return r;

			};

			for ( const [ t, text ] of rows ) addRow( t, text );
			page.append( table );
			const chosen = {};
			for ( const r of remarks ) {

				page.append( el( 'div', 'sh-field-label', r.ask ) );
				const row = el( 'div', 'sh-field' );
				for ( const [ label, v ] of [ [ 'Enter it', true ], [ 'Leave it out', false ] ] ) {

					const b = el( 'button', 'sh-chip', label );
					b.addEventListener( 'click', () => {

						chosen[ r.key ] = v;
						for ( const c of row.children ) c.classList.toggle( 'is-on', c === b );
						sign.disabled = remarks.some( ( q ) => chosen[ q.key ] === undefined );

					} );
					row.append( b );

				}

				page.append( row );

			}

			if ( footer ) page.append( el( 'p', 'sh-page-p sh-journal-footer', footer ) );
			const sign = el( 'button', 'sh-btn', 'Sign the page' );
			sign.disabled = remarks.length > 0;
			sign.addEventListener( 'click', () => done( chosen ) );
			page.append( sign );

		}, { dismiss: false, cls: 'is-journal-wrap' } );

	}

	// the last screen: the page as written, and play again
	end( { heading, rows, lines, credits } ) {

		this._open();
		const c = el( 'div', 'sh-end' );
		const page = el( 'div', 'sh-page is-journal' );
		page.append( el( 'h2', 'sh-page-title', heading ) );
		const table = el( 'div', 'sh-journal' );
		for ( const [ t, text ] of rows ) {

			const r = el( 'div', 'sh-journal-row' );
			r.append( el( 'span', 'sh-journal-t', t ), el( 'span', 'sh-journal-text', text ) );
			table.append( r );

		}

		page.append( table );
		const side = el( 'div', 'sh-end-side' );
		for ( const l of lines ) side.append( el( 'p', 'sh-card-line', l ) );
		side.append( el( 'p', 'sh-end-credits', credits ) );
		const again = el( 'button', 'sh-btn', 'Begin again' );
		again.addEventListener( 'click', () => this.onRestart && this.onRestart() );
		const stay = el( 'button', 'sh-btn is-quiet', 'Stay on the island' );
		stay.addEventListener( 'click', () => {

			c.classList.remove( 'is-on' );
			setTimeout( () => c.remove(), 900 );
			this._close();

		} );
		side.append( again, stay );
		c.append( page, side );
		this.layer.append( c );
		void c.offsetWidth;
		c.classList.add( 'is-on' );

	}

}
