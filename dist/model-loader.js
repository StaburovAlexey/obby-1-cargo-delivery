import {GLTFLoader} from './vendor/GLTFLoader.js';
import {KTX2Loader} from './vendor/KTX2Loader.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.module.js';

let textures;
let configuredRenderer;

// The vendored KTX2Loader uses literal local decoder URLs for both static and
// hashed platform builds, without a CDN or an extra network origin.
export function configureModelLoading(renderer) {
  if (configuredRenderer === renderer) return;
  if (configuredRenderer) throw new Error('Model loading already belongs to another renderer.');
  textures = new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
  configuredRenderer = renderer;
}

export function createModelLoader() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (textures) loader.setKTX2Loader(textures);
  return loader;
}
