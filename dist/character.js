import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';
import { CHARACTER_CATALOG, getCharacterEntry } from './character-catalog.js';
import { CHARACTER_SUPPORT } from './character-support.js';
import { makeSeatPose } from './character-seat-pose.js';
import { CHARACTER_SEAT } from './character-seat-calibration.js';
export { CHARACTER_CATALOG } from './character-catalog.js';

export const BACON_HEIGHT = 3.5;
export const BACON_ASSET_URL = new URL('./assets/bacon.glb', import.meta.url);








const BACON_IDLE_SUPPORT = [
  0.04453476, 0.04454886, 0.04456538, 0.04457741, 0.04459185, 0.04460458, 0.04461834, 0.04463977,
  0.04466250, 0.04469266, 0.04472253, 0.04476912, 0.04481523, 0.04488426, 0.04495239, 0.04504931,
  0.04514500, 0.04526377, 0.04538053, 0.04551174, 0.04564248, 0.04577906, 0.04591383, 0.04604285,
  0.04616932, 0.04627111, 0.04636918, 0.04643045, 0.04648709, 0.04650830, 0.04652473, 0.04650738,
  0.04648247, 0.04642907, 0.04636667, 0.04629140, 0.04620624, 0.04611873, 0.04602042, 0.04595553,
  0.04588337, 0.04586040, 0.04583059, 0.04585128, 0.04586680, 0.04593428, 0.04599837, 0.04609939,
  0.04619044, 0.04629821, 0.04639638, 0.04650093, 0.04659734, 0.04668512, 0.04676555, 0.04683220,
  0.04688975, 0.04692456, 0.04694660, 0.04693827, 0.04691634, 0.04686438, 0.04683189, 0.04684007,
  0.04683904, 0.04681957, 0.04679582, 0.04676330, 0.04672687, 0.04668988, 0.04665076, 0.04661010,
  0.04656350, 0.04651353, 0.04645843, 0.04640605, 0.04635028, 0.04629428, 0.04623544, 0.04617085,
  0.04610362, 0.04605621, 0.04601212, 0.04593778, 0.04584809, 0.04574876, 0.04563969, 0.04552694,
  0.04540690, 0.04528502, 0.04515742, 0.04503034, 0.04489926, 0.04476721, 0.04463339, 0.04449547,
  0.04435598, 0.04421298, 0.04406835, 0.04392429, 0.04378087, 0.04363735, 0.04349035, 0.04347043,
  0.04352016, 0.04353212, 0.04353177, 0.04352709, 0.04351840, 0.04351224, 0.04350216, 0.04350019,
  0.04349493, 0.04349821, 0.04349797, 0.04350725, 0.04351223, 0.04352431, 0.04353082, 0.04354184,
  0.04354613, 0.04355228, 0.04355040, 0.04354863, 0.04353786, 0.04352926, 0.04351184, 0.04349780,
  0.04347502, 0.04345337, 0.04342187, 0.04340320, 0.04338017, 0.04338086, 0.04338080, 0.04340233,
  0.04342178, 0.04345939, 0.04349417, 0.04354069, 0.04358113, 0.04362770, 0.04366549, 0.04370415,
  0.04373110, 0.04375418, 0.04376289, 0.04376330, 0.04374771, 0.04371993, 0.04367341, 0.04360743,
  0.04352357, 0.04341438, 0.04328321, 0.04313300, 0.04297057, 0.04281286, 0.04265356, 0.04250894,
  0.04236837, 0.04224775, 0.04213546, 0.04202930, 0.04192875, 0.04183714, 0.04175433, 0.04169086,
  0.04164314, 0.04159278, 0.04154663, 0.04148309, 0.04141758, 0.04133082, 0.04124007, 0.04114281,
  0.04104769, 0.04094213, 0.04083654, 0.04070490, 0.04056393, 0.04040376, 0.04023517, 0.04006209,
  0.03989365, 0.03971183, 0.03951839, 0.03935971, 0.03922186, 0.03910470, 0.03900063, 0.03892170,
  0.03885930, 0.03881302, 0.03877869, 0.03874906, 0.03872445, 0.03870322, 0.03868336, 0.03866583,
  0.03864977, 0.03862683, 0.03859826, 0.03855291, 0.03849458, 0.03841016, 0.03830554, 0.03817086,
  0.03801227, 0.03782709, 0.03761942, 0.03739066, 0.03714245, 0.03685902, 0.03654349, 0.03651389,
  0.03660522, 0.03668114, 0.03674801, 0.03679516, 0.03682909, 0.03683875, 0.03683417, 0.03680948,
  0.03677293, 0.03672185, 0.03666297, 0.03659636, 0.03652770, 0.03660780, 0.03674323, 0.03687866,
  0.03701370, 0.03714369, 0.03726797, 0.03738702, 0.03749920, 0.03760829, 0.03771679, 0.03782691,
  0.03793132, 0.03803165, 0.03812748, 0.03822135, 0.03831089, 0.03839671, 0.03847652, 0.03855232,
  0.03862197, 0.03868700, 0.03874539, 0.03879698, 0.03883993, 0.03887414, 0.03890055, 0.03892125,
  0.03893691, 0.03903205, 0.03920946, 0.03939445, 0.03958793, 0.03978730, 0.03999394, 0.04020463,
  0.04042145, 0.04063908, 0.04086045, 0.04107949, 0.04129855, 0.04150684, 0.04170531, 0.04187972,
  0.04203153, 0.04215454, 0.04228400, 0.04242458, 0.04256964, 0.04271381, 0.04284856, 0.04296908,
  0.04306516, 0.04314211, 0.04319371, 0.04323222, 0.04324927, 0.04326133, 0.04325839, 0.04325966,
  0.04326493, 0.04327909, 0.04344585, 0.04363326, 0.04383710, 0.04405214, 0.04427329, 0.04449520,
  0.04472066, 0.04494947, 0.04518657, 0.04542477, 0.04566933, 0.04590703, 0.04614113, 0.04636402,
  0.04657478, 0.04676436, 0.04693528, 0.04708634, 0.04723554, 0.04738651, 0.04754488, 0.04770435,
  0.04786946, 0.04803083, 0.04818948, 0.04833915, 0.04847462, 0.04859660, 0.04870172, 0.04879593,
  0.04887725, 0.04895042, 0.04901503, 0.04905935, 0.04907930, 0.04908911, 0.04907749, 0.04906852,
  0.04906546, 0.04905752, 0.04904696, 0.04903292, 0.04902071, 0.04901073, 0.04900700, 0.04900595,
  0.04901058, 0.04901857, 0.04903147, 0.04905045, 0.04907805, 0.04911465, 0.04916317, 0.04921896,
  0.04928148, 0.04934901, 0.04941487, 0.04948168, 0.04954877, 0.04962159, 0.04969599, 0.04977448,
  0.04985292, 0.04993427, 0.05001444, 0.05009621, 0.05017479, 0.05025363, 0.05032800, 0.05040153,
  0.05046964, 0.05053562, 0.05059607, 0.05065775, 0.05071627, 0.05077741, 0.05083492, 0.05089110,
  0.05093924, 0.05098597, 0.05102319, 0.05105996, 0.05108826, 0.05111726, 0.05113977, 0.05116443,
  0.05118519, 0.05120819, 0.05122675, 0.05124866, 0.05126731, 0.05128804, 0.05130568, 0.05132624,
  0.05134521, 0.05136754, 0.05138846, 0.05141301, 0.05143857, 0.05147224, 0.05150685, 0.05154602,
  0.05157635, 0.05160884, 0.05162705, 0.05164668, 0.05164848, 0.05164840, 0.05162346, 0.05159483,
  0.05153858, 0.05147737, 0.05138947, 0.05130531, 0.05121548, 0.05112793, 0.05103509, 0.05094504,
  0.05085934, 0.05077578, 0.05070425, 0.05063550, 0.05059160, 0.05054650, 0.05051849, 0.05048889,
  0.05047257, 0.05045422, 0.05045630, 0.05045283, 0.05046787, 0.05047468, 0.05049042, 0.05049542,
  0.05050251, 0.05049633, 0.05048338, 0.05046010, 0.05041940, 0.05036404, 0.05029573, 0.05022727,
  0.05014806, 0.05006912, 0.04998081, 0.04989400, 0.04980374, 0.04971513, 0.04962436, 0.04953521,
  0.04944296, 0.04934605, 0.04924871, 0.04915109, 0.04905620, 0.04895961, 0.04886687, 0.04877180,
  0.04868228, 0.04859067, 0.04850837, 0.04842365, 0.04834560, 0.04826383, 0.04818357, 0.04809876,
  0.04801213, 0.04792046, 0.04782856, 0.04773152, 0.04763889, 0.04754073, 0.04744662, 0.04734645,
  0.04725091, 0.04714933, 0.04705773, 0.04695940, 0.04687624, 0.04678934, 0.04671884, 0.04664557,
  0.04659239, 0.04653579, 0.04649833, 0.04645568, 0.04642590, 0.04639205, 0.04636479, 0.04633032,
  0.04630324, 0.04626169, 0.04620096, 0.04612944, 0.04604490, 0.04595290, 0.04585148, 0.04574597,
  0.04563019, 0.04550915, 0.04537805, 0.04524473, 0.04510324, 0.04496322, 0.04481962, 0.04467991,
  0.04462113, 0.04462531, 0.04460446, 0.04458530, 0.04456164,
];
const BACON_RUN_SUPPORT = 0.17910760167428974;
const BACON_TRANSITION_SUPPORT = [
  0.00000000, 0.02449714, 0.05168496, 0.07465372, 0.09569764, 0.11275801, 0.12532092, 0.13419590, 0.14162307, 0.14780461, 0.15073915, 0.15263905, 0.15472762, 0.15738722, 0.16006514, 0.16095964, 0.16193497, 0.16226048, 0.16110800, 0.15846215, 0.15430970, 0.14863963, 0.14144314, 0.13317244, 0.12408573, 0.11345694, 0.10128448, 0.08756913, 0.07231399, 0.05552455, 0.03720865, 0.01737652, 0.00000000
];




const JUMP_SUPPORT = {
  'bacon': [0.05486697, 0.20450325],
  'pack1': [0.04485096, 0.23073348],
  'pack2': [0.04197365, 0.22136664],
  'pack3': [0.04160652, 0.20755953],
  'pack4': [0.0427684, 0.2284247],
  'pack5': [0.04365397, 0.23210875],
  'pack6': [0.03904769, 0.21989288],
  'pack7': [0.03734089, 0.25683711],
  'pack9': [0.04113814, 0.15220944],
  'pirate': [0.0302514, 0.26440902],
  'robux-man': [0.03683743, 0.22136517],
  'jeff-the-killer': [0.04325944, 0.20396428],
  'spider-man': [0.04625759, 0.25279664],
  'spyder-sammy': [0.05299198, 0.18853281],
  'kreekcraft': [0.03792078, 0.17523504],
  'jandel': [0.03973908, 0.19797487],
  'dancing-npc-girl': [0.04397285, 0.22087202],
};
const JUMP_TAKEOFF_BLEND = 0.08;
const JUMP_LANDING_BLEND = 0.12;
const JUMP_APPROACH_BLEND = 0.20;
const smoothStep = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };





const parsedCache = new Map();
let parseCount = 0;
function disposeResources(model) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.image?.close?.(); texture.dispose(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}
function resolveEntry(id, url) {
  if (id) return getCharacterEntry(id);
  const knownURL = url && CHARACTER_CATALOG.find(entry => String(url) === String(entry.url)
    || String(url).split(/[?#]/)[0].endsWith('/' + entry.source));
  return knownURL || getCharacterEntry('bacon');
}
async function getCachedAsset(entry, url) {
  const key = String(url);
  let record = parsedCache.get(key);
  if (!record) {
    record = { key, entry, refs: 0, snapshot: null, gltf: null, promise: null };
    record.promise = new GLTFLoader().loadAsync(key).then(gltf => {
      parseCount++; record.gltf = gltf; return record;
    }).catch(error => { parsedCache.delete(key); throw error; });
    parsedCache.set(key, record);
  }
  return record.promise;
}
export function getCharacterCacheStats() {
  return { entries: parsedCache.size, parses: parseCount,
    references: [...parsedCache.values()].reduce((sum,record) => sum + record.refs, 0),
    snapshots: [...parsedCache.values()].filter(record => record.snapshot).length };
}


export function clearCharacterCache() {
  let cleared = 0;
  for (const [key,record] of parsedCache) {
    if (record.refs || !record.gltf) continue;
    for (const part of record.snapshot ?? []) part.geometry.dispose();
    disposeResources(record.gltf.scene); parsedCache.delete(key); cleared++;
  }
  return cleared;
}
export async function loadCharacter(THREE, { id, data, url } = {}) {
  const entry = resolveEntry(id, url);
  if (data) {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    return createCharacter(THREE, gltf, entry);
  }
  const record = await getCachedAsset(entry, url ?? entry.url);
  record.refs++;
  try {
    return createCharacter(THREE, { ...record.gltf, scene: cloneSkeleton(record.gltf.scene) }, entry, record);
  } catch (error) { record.refs--; throw error; }
}
export async function loadBacon(THREE, options = {}) {
  return loadCharacter(THREE, { ...options, id: 'bacon' });
}
export function createBaconCharacter(THREE, gltf) {
  return createCharacter(THREE, gltf, getCharacterEntry('bacon'));
}
function createCharacter(THREE, gltf, entry, cacheRecord = null) {
  const calibration = CHARACTER_SUPPORT[entry.id];
  if (!calibration) throw new Error(`Missing support calibration for ${entry.id}`);
  const IDLE_SUPPORT = entry.id === 'bacon' ? BACON_IDLE_SUPPORT : calibration.idle;
  const RUN_SUPPORT = entry.id === 'bacon' ? BACON_RUN_SUPPORT : calibration.run;
  const TRANSITION_SUPPORT = entry.id === 'bacon' ? BACON_TRANSITION_SUPPORT : calibration.transition;
  const model = gltf.scene;
  const clips = gltf.animations;
  const idleClip = clips.find((clip) => /idle/i.test(clip.name));
  const walkClip = clips.find((clip) => /walk/i.test(clip.name));
  const runClip = clips.find((clip) => /run/i.test(clip.name));
  const jumpClip = clips.find((clip) => /^Jumping$/i.test(clip.name));
  if (!model || !idleClip || !jumpClip || !(walkClip || runClip)) {
    throw new Error(`${entry.name} GLB must contain its mesh, idle, locomotion and native Jumping animation.`);
  }
  const group = new THREE.Group();
  group.name = `${entry.name} player`;
  const pivot = new THREE.Group();
  pivot.name = `${entry.name} normalized mesh`;
  group.add(pivot);
  pivot.add(model);

  model.rotation.y = Math.PI;




  const hipPosition = idleClip.tracks.find((track) => /Hips\.position$/.test(track.name));
  function inPlaceClip(source, removeVertical = false) {
    const clip = source.clone();
    for (const track of clip.tracks) {
      if (track.name !== hipPosition?.name) continue;
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = hipPosition.values[0];
        track.values[i + 2] = hipPosition.values[2];



        if (removeVertical) track.values[i + 1] = hipPosition.values[1];
      }
    }
    return clip;
  }
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(inPlaceClip(idleClip)).play();
  const locomotion = mixer.clipAction(inPlaceClip(walkClip || runClip)).play();
  const run = walkClip && runClip ? mixer.clipAction(inPlaceClip(runClip)).play() : locomotion;
  const jump = mixer.clipAction(inPlaceClip(jumpClip, true)).play();
  jump.setLoop(THREE.LoopOnce, 1);
  jump.clampWhenFinished = true;
  jump.setEffectiveTimeScale(0);
  jump.setEffectiveWeight(0);
  idle.setEffectiveWeight(1);
  locomotion.setEffectiveWeight(0);
  if (run !== locomotion) run.setEffectiveWeight(0);
  mixer.update(0);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Bacon mesh has invalid bounds.');
  const scale = BACON_HEIGHT / size.y;
  pivot.scale.setScalar(scale);
  pivot.position.set(
    -(bounds.min.x + bounds.max.x) * 0.5 * scale,
    -bounds.min.y * scale,
    -(bounds.min.z + bounds.max.z) * 0.5 * scale,
  );
  let meshCount = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshCount++;
    if (entry.textured && ![object.material].flat().some((material) => material?.map)) {
      throw new Error(`${entry.name} embedded color texture failed to load.`);
    }
    object.castShadow = true;
    object.receiveShadow = true;

    object.frustumCulled = false;
  });
  if (!meshCount) throw new Error('Bacon GLB contains no renderable mesh.');
  group.userData.character = {
    id: entry.id, name: entry.name, source: entry.source, sha256: entry.sha256,
    originalUV: true, textured: entry.textured,
    height: BACON_HEIGHT,
    idleClip: idleClip.name,
    walkClip: walkClip?.name ?? null,
    locomotionClip: (walkClip || runClip).name,
    runClip: runClip?.name ?? null,
    jumpClip: jumpClip.name,
    originalHeight: size.y,
  };
  const groundActions = [...new Set([idle, locomotion, run])];
  const actions = [...groundActions, jump];
  const [jumpSupport, jumpClearance] = JUMP_SUPPORT[entry.id];


  const jumpApexTime = Math.min(jumpClip.duration, 19 / 60);
  const jumpTouchdownTime = Math.min(jumpClip.duration, 36 / 60);
  function supportAt(action, time) {
    if (action !== idle) return RUN_SUPPORT;


    const duration = idleClip.duration;
    const phase = ((time % duration) + duration) % duration;
    const frame = phase / duration * IDLE_SUPPORT.length;
    const index = Math.floor(frame), fraction = frame - index;
    return THREE.MathUtils.lerp(IDLE_SUPPORT[index],
      IDLE_SUPPORT[(index + 1) % IDLE_SUPPORT.length], fraction);
  }




  function transitionSupport(weight) {
    const frame = weight * (TRANSITION_SUPPORT.length - 1);
    const i = Math.min(TRANSITION_SUPPORT.length - 2, Math.floor(frame));
    const t = frame - i;
    const a = TRANSITION_SUPPORT[Math.max(0, i - 1)], b = TRANSITION_SUPPORT[i];
    const c = TRANSITION_SUPPORT[i + 1], d = TRANSITION_SUPPORT[Math.min(i + 2, TRANSITION_SUPPORT.length - 1)];
    const curve = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d
      + t * (3 * (b - c) + d - a)));
    return Math.max(0, curve) + 0.008 * Math.sin(Math.PI * weight);
  }
  let movingWeight = 0;
  let runWeight = 0;
  let movingVelocity = 0;
  let cadence = 0.3;
  let disposed = false;
  let seated = false, seatedWeight = 0, seatedVelocity = 0;
  let airborne = false, jumpWeight = 0, airElapsed = 0, airDuration = 16 / 22;
  let landingElapsed = JUMP_LANDING_BLEND, landingStartTime = jumpTouchdownTime;
  let landingDuration = JUMP_LANDING_BLEND, landingBlendStart = 1, takeoffElapsed = 0;
  let jumpClockSupplied = false, takeoffSnapshot = null, takeoffSupport = 0;
  const posePosition = new THREE.Vector3(), poseRotation = new THREE.Quaternion();
  const poseBones = [];
  model.traverse(object => { if (object.isBone) poseBones.push(object); });

  const seatedCalibration = CHARACTER_SEAT[entry.id];
  const seatAnchor = new THREE.Vector3(...seatedCalibration.seatAnchor);
  const seatPose = makeSeatPose(THREE, model, seatedCalibration);
  const seatedPositions = new Map([...seatPose.keys()].map(bone => [bone, bone.position.clone()]));
  function setSeated(value) {
    seated = Boolean(value);
    if (seated) {
      airborne = false; jumpWeight = 0; landingElapsed = JUMP_LANDING_BLEND;
      takeoffSnapshot = null; jump.setEffectiveWeight(0);
    }
  }


  function setAirborne(state = {}) {
    if (disposed) return false;
    const nextAirborne = Boolean(state.airborne) && !seated;
    if (nextAirborne && (!airborne || state.justJumped)) {
      takeoffSnapshot = poseBones.map(bone => ({ bone,
        position: bone.position.clone(), quaternion: bone.quaternion.clone(),
        mixedPosition: null, mixedQuaternion: null }));
      takeoffSupport = pivot.position.y;
      airElapsed = 0; takeoffElapsed = 0; jumpWeight = 0; landingElapsed = 0;
      seatedWeight = 0; seatedVelocity = 0;
      jump.reset().play().setEffectiveTimeScale(0).setEffectiveWeight(0);
    }
    if (airborne && !nextAirborne) {
      landingElapsed = 0;
      landingStartTime = jump.time;
      const approach = Math.min(JUMP_APPROACH_BLEND, airDuration * 0.35);
      landingBlendStart = THREE.MathUtils.clamp((airElapsed - (airDuration - approach))
        / (approach + JUMP_LANDING_BLEND), 0, 1);
      landingDuration = Math.max(0.001, (1 - landingBlendStart) * (approach + JUMP_LANDING_BLEND));
    }
    airborne = nextAirborne;
    if (Number.isFinite(state.duration) && state.duration > 0) airDuration = Math.max(0.1, state.duration);
    if (airborne && Number.isFinite(state.elapsed)) {
      airElapsed = Math.max(0, state.elapsed);
      jumpClockSupplied = true;
    }
    return airborne;
  }
  function updateJump(step) {
    if (airborne) {
      if (!jumpClockSupplied) airElapsed += step;
      jumpClockSupplied = false;
      takeoffElapsed = airElapsed;
      const phase = THREE.MathUtils.clamp(airElapsed / airDuration, 0, 1);
      jump.time = phase <= 0.5
        ? jumpApexTime * phase * 2
        : THREE.MathUtils.lerp(jumpApexTime, jumpTouchdownTime, (phase - 0.5) * 2);
      const approach = Math.min(JUMP_APPROACH_BLEND, airDuration * 0.35);
      jumpWeight = 1 - smoothStep((airElapsed - (airDuration - approach)) / (approach + JUMP_LANDING_BLEND));
    } else if (jumpWeight > 0) {
      landingElapsed = Math.min(landingDuration, landingElapsed + step);
      takeoffElapsed += step;
      const recovery = landingElapsed / landingDuration;
      jumpWeight = 1 - smoothStep(THREE.MathUtils.lerp(landingBlendStart, 1, recovery));
      jump.time = THREE.MathUtils.lerp(landingStartTime, jumpClip.duration, recovery);
    }
    jump.setEffectiveWeight(jumpWeight);
    for (const action of groundActions) action.setEffectiveWeight(action.getEffectiveWeight() * (1 - jumpWeight));
  }
  function restoreTakeoffPose() {



    if (!takeoffSnapshot) return;
    for (const { bone, mixedPosition, mixedQuaternion } of takeoffSnapshot) {
      if (mixedPosition) bone.position.copy(mixedPosition);
      if (mixedQuaternion) bone.quaternion.copy(mixedQuaternion);
    }
  }
  function applyTakeoffPose() {
    if (!takeoffSnapshot) return;
    const weight = smoothStep(takeoffElapsed / JUMP_TAKEOFF_BLEND);
    if (weight >= 1) { takeoffSnapshot = null; return; }
    for (const snapshot of takeoffSnapshot) {
      const { bone, position, quaternion } = snapshot;
      posePosition.copy(bone.position); poseRotation.copy(bone.quaternion);
      if (!snapshot.mixedPosition) {
        snapshot.mixedPosition = posePosition.clone(); snapshot.mixedQuaternion = poseRotation.clone();
      } else {
        snapshot.mixedPosition.copy(posePosition); snapshot.mixedQuaternion.copy(poseRotation);
      }
      bone.position.copy(position).lerp(posePosition, weight);
      bone.quaternion.copy(quaternion).slerp(poseRotation, weight);
    }
  }

  const seatMixedPose = new Map([...seatPose.keys()].map(bone => [bone, {
    quaternion: new THREE.Quaternion(), position: new THREE.Vector3(),
  }]));
  let seatPoseApplied = false;
  function restoreSeatPose() {
    if (!seatPoseApplied) return;
    for (const [bone, pose] of seatMixedPose) {
      bone.quaternion.copy(pose.quaternion); bone.position.copy(pose.position);
    }
    seatPoseApplied = false;
  }
  function applySeatPose() {
    if (seatedWeight < 1e-10) return;
    for (const [bone,target] of seatPose) {
      const mixed = seatMixedPose.get(bone);
      mixed.quaternion.copy(bone.quaternion); mixed.position.copy(bone.position);
      seatPoseApplied = true;
      bone.quaternion.slerp(target, seatedWeight);
      bone.position.lerp(seatedPositions.get(bone), seatedWeight);
    }
  }
  function updateSupport() {



    let height = (1 - movingWeight) * supportAt(idle, idle.time) + movingWeight * RUN_SUPPORT
      + transitionSupport(movingWeight);
    height = THREE.MathUtils.lerp(height, jumpSupport, jumpWeight)
      + jumpClearance * Math.sin(Math.PI * jumpWeight);
    if (takeoffSnapshot) height = THREE.MathUtils.lerp(takeoffSupport, height,
      smoothStep(takeoffElapsed / JUMP_TAKEOFF_BLEND));


    pivot.position.y = THREE.MathUtils.lerp(height, seatedCalibration.seatSupport, seatedWeight)
      + .21 * Math.sin(Math.PI * seatedWeight);
    group.updateMatrixWorld(true);
  }
  function resetMotion(heading = group.rotation.y) {
    if (disposed) return;
    restoreSeatPose();
    movingWeight = 0; movingVelocity = 0; runWeight = 0; cadence = 0.3;
    seated = false; seatedWeight = 0; seatedVelocity = 0;
    airborne = false; jumpWeight = 0; airElapsed = 0; jumpClockSupplied = false;
    landingElapsed = JUMP_LANDING_BLEND; takeoffSnapshot = null;
    if (Number.isFinite(heading)) group.rotation.y = heading;
    for (const action of actions) {
      action.reset().play();
      action.setEffectiveWeight(action === idle ? 1 : 0);
      action.setEffectiveTimeScale(action === jump ? 0 : action === idle ? 1 : cadence);
    }
    mixer.update(0);
    updateSupport();
  }
  resetMotion();
  group.userData.character.motion = {
    inPlaceAxes: 'XZ',
    support: 'precalibrated soles; natural running flight phase',
    blendClearance: Math.max(...TRANSITION_SUPPORT),
    runSupportHeight: RUN_SUPPORT,
    seatedPose: 'runtime bone pose, no source Sit clip',
    jumpPose: 'native Jumping; controller-owned XYZ translation; timed takeoff/flight/landing',
    jumpSourceApex: jumpApexTime, jumpSourceTouchdown: jumpTouchdownTime,
    calibratedSoleVertices: calibration.soleVertices,
  };
  function update(dt, speed = 0, heading = group.rotation.y) {
    if (disposed) return;
    const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const velocity = Math.abs(Number.isFinite(speed) ? speed : 0);
    if (Number.isFinite(heading)) {
      const delta = Math.atan2(Math.sin(heading - group.rotation.y), Math.cos(heading - group.rotation.y));
      group.rotation.y += delta * (1 - Math.exp(-16 * step));
    }
    const blend = 1 - Math.exp(-12 * step);
    const desiredMotion = !seated && velocity > 0.04 ? Math.min(1, velocity) : 0;



    const omega = 8;
    const decay = Math.exp(-omega * step);
    const change = movingWeight - desiredMotion;
    const increment = (movingVelocity + omega * change) * step;
    movingWeight = desiredMotion + (change + increment) * decay;
    movingVelocity = (movingVelocity - omega * increment) * decay;
    runWeight += ((velocity > 5.4 ? 1 : 0) - runWeight) * blend;
    idle.setEffectiveWeight(1 - movingWeight);
    const desiredCadence = Math.max(0.3, Math.min(1.4, velocity / 7));


    const cadenceBlend = 1 - Math.exp(-10 * step);
    const averageCadence = step > 0
      ? desiredCadence + (cadence - desiredCadence) * cadenceBlend / (10 * step)
      : cadence;
    cadence += (desiredCadence - cadence) * cadenceBlend;
    if (run === locomotion) {
      locomotion.setEffectiveWeight(movingWeight);
      locomotion.setEffectiveTimeScale(averageCadence);
    } else {
      locomotion.setEffectiveWeight(movingWeight * (1 - runWeight));
      locomotion.setEffectiveTimeScale(averageCadence * 7 / 4.5);
      run.setEffectiveWeight(movingWeight * runWeight);
      run.setEffectiveTimeScale(averageCadence);
    }
    updateJump(step);
    restoreTakeoffPose();
    restoreSeatPose();
    mixer.update(step);
    applyTakeoffPose();
    const seatTarget = seated ? 1 : 0, seatOmega = 11;
    const seatDecay = Math.exp(-seatOmega * step), seatChange = seatedWeight - seatTarget;
    const seatIncrement = (seatedVelocity + seatOmega * seatChange) * step;
    seatedWeight = seatTarget + (seatChange + seatIncrement) * seatDecay;
    seatedVelocity = (seatedVelocity - seatOmega * seatIncrement) * seatDecay;
    applySeatPose();
    updateSupport();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    if (cacheRecord) {
      cacheRecord.refs--;
      const skeletons = new Set();
      model.traverse(object => { if (object.skeleton) skeletons.add(object.skeleton); });
      for (const skeleton of skeletons) skeleton.dispose();
    } else disposeResources(model);
    group.removeFromParent();
  }
  return { id: entry.id, name: entry.name, group, update, resetMotion, setSeated, setAirborne, seatAnchor,
    get airborne() { return airborne; },
    get jumpState() { return { airborne, weight: jumpWeight, time: jump.time, elapsed: airElapsed, duration: airDuration }; },
    get seated() { return seated; }, get seatedWeight() { return seatedWeight; }, dispose, animations: clips };
}






export async function createCharacterDisplay(THREE, { id, url, height = BACON_HEIGHT } = {}) {
  const entry = resolveEntry(id, url);
  const record = await getCachedAsset(entry, url ?? entry.url);
  if (!record.snapshot) {
    record.refs++;
    const character = createCharacter(THREE,
      { ...record.gltf, scene: cloneSkeleton(record.gltf.scene) }, entry, record);
    character.group.updateMatrixWorld(true);
    const parts = [], vertex = new THREE.Vector3();
    character.group.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone();
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
        position.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      position.needsUpdate = true;
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      parts.push({ geometry, material: object.material, name: object.name });
    });
    character.dispose(); record.snapshot = parts;
  }
  const group = new THREE.Group(); group.name = `${entry.name} frozen display`;
  group.userData.character = { id: entry.id, source: entry.source, frozen: true, originalUV: true };
  group.scale.setScalar(height / BACON_HEIGHT);
  for (const part of record.snapshot) {
    const mesh = new THREE.Mesh(part.geometry, part.material); mesh.name = part.name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  record.refs++; let disposed = false;
  return { id: entry.id, name: entry.name, group, dispose() {
    if (disposed) return; disposed = true; group.removeFromParent(); record.refs--;
  } };
}
