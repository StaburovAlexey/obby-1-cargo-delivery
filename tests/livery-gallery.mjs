import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createVehicleLiveryGallery } from '../dist/vehicle-livery-preview.js';
import { clearVehicleLiveryTextureCache, getVehicleLiveryTextureCacheStats } from '../dist/vehicle-livery-materials.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';

function setup(options = {}) {
  const { doc, win, root } = createInputDom(), Element = root.constructor;
  const frames = new Map(), canvases = [], renderers = []; let next = 0;
  win.innerHeight = 600;
  win.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  win.cancelAnimationFrame = id => frames.delete(id);
  doc.createElement = tag => {
    const node = new Element(); node.ownerDocument = doc; node.isConnected = true; node.tagName = tag;
    node.clientWidth = 320; node.clientHeight = 200; node.bounds = { top: 0, bottom: 200, width: 320, height: 200 };
    node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter(item => item !== node); node.parent = null; };
    if (tag === 'canvas') { node.copies = 0; node.getContext = () => ({ clearRect() {}, drawImage() { node.copies++; } }); canvases.push(node); }
    return node;
  };
  const hosts = new Map(['pickup', 'bmwreward', 'van'].map(id => [id, doc.createElement('div')]));
  hosts.get('van').bounds = { top: 800, bottom: 1000, width: 320, height: 200 };
  const gallery = createVehicleLiveryGallery(THREE, id => hosts.get(id), {
    ...options,
    createRenderer() {
      const renderer = { domElement: doc.createElement('canvas'), draws: 0, disposals: 0, losses: 0, resizes: 0,
        setDrawingBufferSize() { this.resizes++; }, setPixelRatio() {}, setSize() {}, setClearColor() {}, render() { this.draws++; },
        dispose() { this.disposals++; }, forceContextLoss() { this.losses++; } };
      renderers.push(renderer); return renderer;
    },
  });
  const tick = async time => { const work = [...frames]; frames.clear(); for (const [, fn] of work) fn(time); await Promise.resolve(); await Promise.resolve(); };
  const model = () => {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const material = new THREE.MeshStandardMaterial(); material.name = 'Material.015';
    body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), material));
    return { group, body, metadata: { id: 'bmwreward' } };
  };
  return { doc, win, frames, hosts, gallery, renderers, canvases, tick, model };
}

test('Multiple visible card canvases share one GPU context and offscreen cards load lazily', async () => {
  const f = setup(), a = f.model(), b = f.model();
  const first = f.gallery.show(a, 'pickup'), second = f.gallery.show(b, 'bmwreward');
  let offscreenDone = false;
  const offscreen = f.gallery.show(f.model(), 'van').then(value => { offscreenDone = true; return value; });
  await f.tick(100);
  assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(f.renderers.length, 1); assert.equal(f.hosts.get('pickup').children.length, 1);
  assert.equal(f.hosts.get('bmwreward').children.length, 1); assert.equal(f.hosts.get('van').children.length, 0);
  assert.equal(offscreenDone, false);
  const drawings = f.renderers[0].draws;
  assert.equal(f.renderers[0].resizes, 1);
  await f.tick(150); assert.ok(f.renderers[0].draws > drawings);
  assert.equal(f.renderers[0].resizes, 1, 'Stationary equal-sized cards do not resize the GPU framebuffer every draw');
  f.hosts.get('van').bounds.top = 100; f.hosts.get('van').bounds.bottom = 300;
  await f.tick(200); assert.equal(await offscreen, true); assert.equal(f.renderers.length, 1);
  f.gallery.close(); assert.equal(f.frames.size, 0);
  assert.equal(f.renderers[0].disposals, 1); assert.equal(f.renderers[0].losses, 1);
  for (const host of f.hosts.values()) assert.equal(host.children.length, 0);
  const reopened = f.gallery.show(a, 'pickup'); await f.tick(250); assert.equal(await reopened, true);
  assert.equal(f.renderers.length, 2); f.gallery.dispose();
});

test('Hidden cards do not render; pending rows cancel on close and stale selections settle false', async () => {
  const f = setup(), model = f.model();
  const old = f.gallery.show(model, 'van'), latest = f.gallery.show(model, 'van');
  assert.equal(await old, false);
  const visible = f.gallery.show(model, 'pickup'); await f.tick(100); await visible;
  f.hosts.get('pickup').bounds.top = 900; f.hosts.get('pickup').bounds.bottom = 1100;
  const before = f.renderers[0].draws; await f.tick(150); assert.equal(f.renderers[0].draws, before);
  f.gallery.close(); assert.equal(await latest, false); assert.equal(f.frames.size, 0);
  f.gallery.dispose(); assert.equal(await f.gallery.show(model, 'pickup'), false);
});


test('Offscreen rows release all paint resources and restore their last selection lazily', async () => {
  clearVehicleLiveryTextureCache();
  const f = setup({ textureLoader: async () => new THREE.Texture() }), source = f.model();
  const shown = f.gallery.show(source, 'bmwreward', 'anime'); await f.tick(100); assert.equal(await shown, true);
  assert.equal(getVehicleLiveryTextureCacheStats().users, 4);
  const host = f.hosts.get('bmwreward'); host.bounds.top = 900; host.bounds.bottom = 1100;
  await f.tick(150);
  assert.equal(host.children.length, 0); assert.equal(getVehicleLiveryTextureCacheStats().users, 0);
  assert.equal(f.renderers[0].disposals, 0, 'Leaving a row does not dispose the shared GPU context');
  host.bounds.top = 20; host.bounds.bottom = 220; await f.tick(200);
  for (let n = 0; n < 10; n++) await Promise.resolve();
  assert.equal(host.children.length, 1); assert.equal(f.renderers.length, 1);
  assert.equal(getVehicleLiveryTextureCacheStats().users, 4);
  f.gallery.close(); assert.equal(getVehicleLiveryTextureCacheStats().users, 0); clearVehicleLiveryTextureCache();
});

test('Scrolling away during a texture request keeps the latest request pending until its row returns', async () => {
  clearVehicleLiveryTextureCache();
  const loads = [];
  const f = setup({ textureLoader: () => new Promise(resolve => loads.push(resolve)) }), source = f.model();
  let settled = false;
  const shown = f.gallery.show(source, 'bmwreward', 'anime').then(value => { settled = true; return value; });
  await f.tick(100); const host = f.hosts.get('bmwreward');
  host.bounds.top = 900; host.bounds.bottom = 1100; await f.tick(150);
  loads.forEach(resolve => resolve(new THREE.Texture()));
  for (let n = 0; n < 10; n++) await Promise.resolve();
  assert.equal(settled, false); assert.equal(getVehicleLiveryTextureCacheStats().users, 0);
  host.bounds.top = 20; host.bounds.bottom = 220; await f.tick(200);
  assert.equal(await shown, true); assert.equal(f.renderers.length, 1);
  f.gallery.close(); assert.equal(getVehicleLiveryTextureCacheStats().users, 0); clearVehicleLiveryTextureCache();
});
