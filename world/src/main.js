// Infinite open world: M0 shell. For now: the apartment (architecture pass) high over a generated
// city, walkable on a computer and in a headset.
import { createHub } from './hub.js';
import { createArms } from './arms.js';
import { createEnemies } from './enemies.js';
import * as THREE from 'three';
import { makeMaterials } from './materials.js';
import { buildApartment } from './apartment.js';
import { furnish } from './furniture.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildCity, SUN as GEN_SUN } from './city.js';
import { buildView } from './view.js';
import { createTiles, keyStore } from './tiles.js';
import { createPlayer } from './player.js';
import { setupSurfaces } from './surface.js';
import { clusterize } from './clusters.js';

const ua = navigator.userAgent;
const QUEST = /OculusBrowser|Quest/i.test(ua) || /[?&]q=quest\b/.test(location.search);   // ?q=quest: the headset settings on a computer (tests)
const Q = {
  quest: QUEST, tex: QUEST ? 512 : 1024, stoneTex: 512, shadow: QUEST ? 1024 : 2048,
  pr: QUEST ? 1 : Math.min(devicePixelRatio, 1.5), cityK: QUEST ? 0.5 : 1,
};
const status = (t) => { const el = document.getElementById('status'); if (el) el.textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.04, 12000);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

async function boot() {
  status('Making materials…');
  await new Promise((r) => setTimeout(r, 20));
  const M = makeMaterials(Q);
  status('Building the apartment…');
  await new Promise((r) => setTimeout(r, 20));
  const apt = buildApartment(M, Q);
  scene.add(apt.group);
  // furniture joins the apartment (surfaces, probes and physics treat it the same)
  const furn = furnish(M, Q);
  for (const m of furn.meshes) m.userData.noOver = true;      // furniture is not a ceiling
  for (const c of furn.colliders) c.furn = true;              // contact shadows (surface.js)
  apt.group.add(furn.group); apt.meshes.push(...furn.meshes); apt.colliders.push(...furn.colliders);
  // scanned pieces (Poly Haven, CC0): marble busts on the dining room plinths (apartment-17)
  try {
    const gl = await new GLTFLoader().loadAsync('./models/ph/marble_bust_01/marble_bust_01_1k.gltf');
    const src = gl.scene; src.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(src), k = 0.44 / (bb.max.y - bb.min.y);
    for (const [bx, top, bz, yaw] of furn.busts) {
      const b = src.clone(true);
      b.scale.setScalar(k); b.rotation.y = yaw;
      b.position.set(bx - (bb.min.x + bb.max.x) / 2 * k, top - bb.min.y * k, bz - (bb.min.z + bb.max.z) / 2 * k);
      b.updateMatrixWorld(true);
      b.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.noField = true; apt.meshes.push(o); } });
      furn.group.add(b);
    }
  } catch (e) { console.warn('bust not loaded', e); }
  status('Loading the view…');
  await new Promise((r) => setTimeout(r, 20));
  // the real city (baked panoramas); ?city=gen or no bake -> the generated stand-in city
  let city = null, view = null, SUN = GEN_SUN;
  if (!/[?&]city=gen\b/.test(location.search)) {
    try { view = await buildView(scene, renderer, Q); SUN = view.sun; camera.far = 100000; camera.updateProjectionMatrix(); } catch (e) { console.warn('city view not available, using the generated city', e); }
  }
  if (!view) city = buildCity(scene, renderer, Q);
  // the baked view has no image light of its own: capture the sky and the city from the
  // apartment (apartment hidden) and prefilter it, so glass, stone and lacquer reflect the real
  // view and the first probe pass has daylight to start from
  if (view && !scene.environment) {
    apt.group.visible = false;
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(1, 100000, rt); cc.position.set(8.8, 1.6, 4); scene.add(cc);
    cc.update(renderer, scene);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromCubemap(rt.texture).texture;
    scene.remove(cc); rt.dispose(); pm.dispose();
    apt.group.visible = true;
  }
  // optional live Google 3D tiles (needs the player's key); G switches
  let gt = null;
  if (view) {
    const F = view.manifest.frame;
    try { gt = F ? createTiles(scene, camera, renderer, { ...F, anchor: view.manifest.anchor, aptCenter: view.manifest.aptCenter, street: view.manifest.street, quest: Q.quest }) : null; } catch (e) { console.warn('Google tiles unavailable', e); }
  }

  // light: sun through the glass (static shadows), soft sky fill, the sky's image light
  const sun = new THREE.DirectionalLight('#fff3e2', 3.2);
  sun.position.copy(SUN).multiplyScalar(60).add(new THREE.Vector3(8.8, 4, 9.5));
  sun.target.position.set(8.8, 3, 9.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 20; sc.far = 110;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#fbf3e8', '#ddd6cc', 1.05);   // sky + warm bounce: seeds the first probe pass, a trace after
  scene.add(hemi);
  scene.environmentIntensity = 0.55;
  renderer.shadowMap.needsUpdate = true;

  // surface realism: room reflection probes, corner / daylight darkening, wet terrace, real glass
  status('Reflections…');
  await new Promise((r) => setTimeout(r, 20));
  const surf = setupSurfaces({ scene, renderer, apt, M, Q, hemi, viewGain: view ? (k) => view.setGain(k) : null, lamps: apt.lamps });
  // meshlet-style clusters for the static apartment and furniture (?clusters=off: whole meshes)
  let clusters = null;
  if (!/[?&]clusters=off\b/.test(location.search)) {
    status('Clusters…');
    try { clusters = await clusterize(apt.meshes); } catch (e) { console.warn('clusters off', e); }
  }
  status('Loading surfaces…');
  await Promise.race([M.ready, new Promise((r) => setTimeout(r, 20000))]);   // the probes must see the scanned floors
  renderer.compile(scene, camera);
  surf.bake();
  // baked irradiance volume (tools/interior/bake_volume.js): 12 half floats per probe
  if (!/[?&]volume=off\b/.test(location.search)) {
    try {
      const meta = await (await fetch('./textures/light/volume.json')).json();
      const h = new Uint16Array(await (await fetch('./textures/light/volume.bin')).arrayBuffer());
      const n = h.length / 12, data = new Float32Array(n * 16);
      for (let j = 0; j < n; j++) for (let m = 0; m < 4; m++) for (let c = 0; c < 3; c++) data[j * 16 + m * 4 + c] = THREE.DataUtils.fromHalfFloat(h[j * 12 + m * 3 + c]);
      surf.useVolume(meta, data);
    } catch (e) { console.info('no baked light volume yet', e.message); }
  }
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyT' && !e.repeat && view) { view.nextSun(); return; }   // T: next baked time of day
    if (e.code === 'KeyG' && !e.repeat && gt) { gt.on = !gt.on; view.world.visible = !gt.on; return; }   // G: Google tiles / baked view
  });

  status('Physics…');
  // back from a destination (Interstate / CQC): you come in at the front door
  const back = /\/(interstate|cqc)\//.test(document.referrer) || /[?&]from=door\b/.test(location.search);
  const spawn = back ? { x: 4.15, y: 0, z: 12.0, yaw: 0 } : { x: 8.9, y: 0, z: 8.4, yaw: 0 };
  const player = await createPlayer(apt.colliders, rig, camera, renderer, spawn);
  const hub = createHub({ scene, camera, renderer, rig, surf, view, screenPose: furn.screen });
  const note = (t) => { const n = document.getElementById('note'); n.textContent = t; n.style.opacity = '1'; clearTimeout(note.t); note.t = setTimeout(() => { n.style.opacity = '0'; }, 2500); };
  const enemies = createEnemies({ scene, camera, player, onNote: note });
  const arms = createArms({ scene, camera, renderer, rig, player, hub, enemies });
  hub.setActions({ spawn: () => enemies.spawn(), clear: () => enemies.clear(), count: () => enemies.list.length });
  addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !e.repeat && document.pointerLockElement) enemies.spawn().then(() => hub.press('none')); });
  window.__world = { arms, enemies, hub, scene, camera, rig, renderer, player, apt, furn, city, view, gt, M, THREE, surf, clusters };
  const gk = document.getElementById('gkey'), gs = document.getElementById('gkeySave');
  if (gk) {
    gk.value = keyStore.get();
    for (const el of [gk, gs]) el.addEventListener('click', (e) => e.stopPropagation());
    gs.addEventListener('click', () => { keyStore.set(gk.value.trim()); location.reload(); });
  }
  status('');
  document.getElementById('start').classList.add('ready');

  // stats
  const fpsEl = document.getElementById('fps');
  let acc = 0, frames = 0;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    player.update(dt);
    hub.update();
    enemies.update(Math.min(dt, 0.1));
    arms.update(Math.min(dt, 0.1), clock.elapsedTime);
    player.look.sens = camera.fov / 72;
    if (city) city.update(clock.elapsedTime);
    if (gt) gt.update(renderer.xr.isPresenting ? renderer.xr.getCamera() : camera, dt);
    if (view) {
      view.update(renderer.xr.isPresenting ? renderer.xr.getCamera() : camera, dt);
      if (view.fadeT >= 0 || view.sunMoved) {          // time of day changing: the sun through the glass follows
        sun.position.copy(view.sun).multiplyScalar(60).add(new THREE.Vector3(8.8, 4, 9.5));
        renderer.shadowMap.needsUpdate = true;
        view.sunMoved = view.fadeT >= 0;
      }
    }
    renderer.render(scene, camera);
    acc += dt; frames++;
    if (acc > 0.5) {
      const p = player.pos;
      fpsEl.textContent = `${Math.round(frames / acc)} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · floor ${p.y > 2.3 ? 2 : 1} · wet ${surf.wet.toFixed(2)}${view ? ' · ' + view.sunName : ''}`;
      acc = 0; frames = 0;
    }
  });

  // VR button
  const vrBtn = document.getElementById('vr');
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
    vrBtn.hidden = false;
    vrBtn.onclick = async () => {
      if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      if (QUEST) renderer.xr.setFoveation(0.5);
      await renderer.xr.setSession(s);
      document.body.classList.add('xr');
      s.addEventListener('end', () => document.body.classList.remove('xr'));
    };
  }
  renderer.domElement.addEventListener('click', () => document.getElementById('start').classList.add('gone'));
  document.getElementById('start').addEventListener('click', () => { document.getElementById('start').classList.add('gone'); renderer.domElement.requestPointerLock(); });
}
boot().catch((e) => { console.error(e); status('Failed to start: ' + e.message); });
