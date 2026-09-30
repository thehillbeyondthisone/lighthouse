import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Mesh, Group, Sphere } from '../../engine/index.js';
import { SceneMaterial } from '../../materials/Materials.js';
import { commonModule } from '../../engine/render/wgsl/common.js';

// The coasts seen from the Flannans (FlannanData grids, from the Copernicus DEM): Lewis and Harris
// 18-98 km east (the Uig coast facing the Flannans at 30 m, for the telescope; the rest at 150 m), St Kilda
// 71-78 km south-west, and the rest of the Seven Hunters within 4.5 km. The land
// cells of each grid make one static mesh in world coordinates; the sea corners of coastal cells dip
// below the water. The vertex stage drops every vertex by the Earth's curvature below the camera
// (common.js curvatureDrop), as the sea's does: past the sea horizon (38 km from the lantern) only the
// hills stand above it, and from the landings St Kilda shows no more than its tops.
//
//   const shore = new FarShore( flannanData );
//   scene.add( shore.group );
//
// Nothing here is near: no shadows cast or received. The haze (AirHaze) decides what can be seen.

// the Earth's curvature with standard refraction (k = 0.13): 1 / ( 2 R_eff ) in 1/m
export const CURVATURE = ( 1 - 0.13 ) / ( 2 * 6371000 );

// the central 2 km are the walkable island's own terrain (FlannanTerrain.js)
const TERRAIN_HALF = 1024;

function gridMesh( g, { skip = null, seaY = - 4 } = {} ) {

	const { nx, nz, dx, x0, z0, heights: H } = g;
	const land = ( k ) => H[ k ] > 0.5;
	const index = new Int32Array( nx * nz ).fill( - 1 );
	const pos = [], nrm = [], idx = [];
	const vert = ( i, j ) => {

		const k = j * nx + i;
		if ( index[ k ] >= 0 ) return index[ k ];
		const h = land( k ) ? H[ k ] : seaY;
		// normal from central differences over the land heights (the sea at 0)
		const at = ( a, b ) => H[ Math.min( nz - 1, Math.max( 0, b ) ) * nx + Math.min( nx - 1, Math.max( 0, a ) ) ];
		const gx = ( at( i + 1, j ) - at( i - 1, j ) ) / ( 2 * dx ), gz = ( at( i, j + 1 ) - at( i, j - 1 ) ) / ( 2 * dx );
		const l = Math.hypot( gx, 1, gz );
		index[ k ] = pos.length / 3;
		pos.push( x0 + i * dx, h, z0 + j * dx );
		nrm.push( - gx / l, 1 / l, - gz / l );
		return index[ k ];

	};

	for ( let j = 0; j < nz - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		const k = j * nx + i;
		if ( ! ( land( k ) || land( k + 1 ) || land( k + nx ) || land( k + nx + 1 ) ) ) continue;
		if ( skip && skip( x0 + ( i + 0.5 ) * dx, z0 + ( j + 0.5 ) * dx ) ) continue;
		const a = vert( i, j ), b = vert( i + 1, j ), c = vert( i, j + 1 ), d = vert( i + 1, j + 1 );
		// counter-clockwise seen from above (y up, z south)
		idx.push( a, c, b, b, c, d );

	}

	if ( ! idx.length ) return null;
	const geo = new BufferGeometry();
	geo.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	geo.setAttribute( 'normal', new Float32BufferAttribute( nrm, 3 ) );
	geo.setIndex( new Uint32BufferAttribute( idx, 1 ) );
	// the bounds reach down as far as the curvature can drop the mesh (seen from anywhere near the light)
	geo.computeBoundingBox();
	const far = Math.hypot( Math.max( Math.abs( x0 ), Math.abs( x0 + ( nx - 1 ) * dx ) ), Math.max( Math.abs( z0 ), Math.abs( z0 + ( nz - 1 ) * dx ) ) ) + 2000;
	geo.boundingBox.min.y -= far * far * CURVATURE;
	geo.boundingSphere = geo.boundingBox.getBoundingSphere( new Sphere() );
	return geo;

}

// winter moorland: dead grass and heather, peat, grey gneiss on the steep ground and the hill tops
function createFarShoreMaterial() {

	return new SceneMaterial( {
		name: 'farShore',
		modules: [ commonModule ],
		roughness: 0.95,
		varyings: { vHeight: 'f32', vUp: 'f32' },
		vertex: /* wgsl */`
	o.vHeight = v.position.y;
	o.vUp = v.normal.y;
	v.worldOffset = vec3f( 0.0, - curvatureDrop( v.position.xz ), 0.0 );
`,
		surface: /* wgsl */`
	let h = in.vs.vHeight;
	let steep = 1.0 - smoothstep( 0.72, 0.93, in.vs.vUp );
	let q = in.P.xz * 0.0021;
	let patchy = fract( sin( dot( floor( q ), vec2f( 12.9898, 78.233 ) ) ) * 43758.5453 );
	let moor = mix( vec3f( 0.105, 0.078, 0.047 ), vec3f( 0.062, 0.05, 0.035 ), patchy * 0.7 );
	let rock = vec3f( 0.2, 0.19, 0.175 );
	var col = mix( moor, rock, max( steep, smoothstep( 380.0, 620.0, h ) * 0.6 ) );
	// the shore: dark wet rock at the waterline
	col = mix( col, vec3f( 0.05, 0.05, 0.048 ), 1.0 - smoothstep( 0.0, 8.0, h ) );
	s.albedo = col;
	s.roughness = 0.95;
`,
	} );

}

export class FarShore {

	constructor( data ) {

		this.group = new Group();
		this.group.name = 'FarShore';
		this.material = createFarShoreMaterial();
		this.material.underwaterLighting = 'none';
		this.material.localLightsCheap = true;
		const G = data.grids;
		// where a finer grid covers a coarser one, the coarse cells inside it (less half a cell) are left out
		const inside = ( g, pad ) => g ? ( x, z ) => x > g.x0 + pad && x < g.x0 + ( g.nx - 1 ) * g.dx - pad && z > g.z0 + pad && z < g.z0 + ( g.nz - 1 ) * g.dx - pad : null;
		const uig = inside( G.uig, G.hebrides.dx / 2 );
		const parts = [
			[ 'hebrides', G.hebrides, uig ],
			[ 'uig', G.uig, null ],
			[ 'stkilda', G.stkilda, null ],
			[ 'flannans', G.flannans, ( x, z ) => Math.abs( x ) < TERRAIN_HALF && Math.abs( z ) < TERRAIN_HALF ],
		];
		this.triangles = 0;
		for ( const [ name, g, skip ] of parts ) {

			if ( ! g ) continue;
			const geo = gridMesh( g, { skip } );
			if ( ! geo ) continue;
			const mesh = new Mesh( geo, this.material );
			mesh.name = 'farShore_' + name;
			mesh.castShadow = false;
			mesh.receiveShadow = false;
			mesh.frustumCulled = true;
			mesh.matrixAutoUpdate = false;
			mesh.updateMatrix();
			this.group.add( mesh );
			this.triangles += geo.index.count / 3;

		}

	}

}
