// Headless WebGPU (Dawn via the `webgpu` npm package) for engine tests.
import { create, globals } from 'webgpu';

Object.assign( globalThis, globals );
Object.defineProperty( globalThis, 'navigator', { value: { gpu: create( [] ) }, configurable: true } );
globalThis.location = { search: '' };

// WEBGPU_DEFAULT_LIMITS=1: the adapter reports WebGPU's default limits (16 sampled and 4 storage
// textures per stage, ...), as software renderers and some mobile GPUs do: the engine must run there
if ( process.env.WEBGPU_DEFAULT_LIMITS ) {

	const DEFAULTS = {
		maxSampledTexturesPerShaderStage: 16, maxStorageTexturesPerShaderStage: 4, maxStorageBuffersPerShaderStage: 8,
		maxSamplersPerShaderStage: 16, maxUniformBuffersPerShaderStage: 12, maxBindingsPerBindGroup: 1000,
		maxColorAttachmentBytesPerSample: 32, maxComputeWorkgroupStorageSize: 16384,
	};
	const gpu = navigator.gpu, request = gpu.requestAdapter.bind( gpu );
	gpu.requestAdapter = async ( o ) => {

		const a = await request( o );
		if ( ! a ) return a;
		const limits = new Proxy( a.limits, { get: ( l, k ) => ( k in DEFAULTS ? Math.min( DEFAULTS[ k ], l[ k ] ) : l[ k ] ) } );
		return new Proxy( a, { get: ( t, k ) => ( k === 'limits' ? limits : typeof t[ k ] === 'function' ? t[ k ].bind( t ) : t[ k ] ) } );

	};

}

// the PNG writer lives with the screenshot tool (tools/shots), which runs without Dawn
export { writePNG } from '../tools/shots/png.mjs';
