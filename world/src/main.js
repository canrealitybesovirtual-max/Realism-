// Infinite open world: M0 shell. For now: the apartment (architecture pass) high over a generated
// city, walkable on a computer and in a headset.
import * as THREE from 'three';
import { makeMaterials } from './materials.js';
import { buildApartment } from './apartment.js';
import { buildCity, SUN as GEN_SUN } from './city.js';
import { buildView } from './view.js';
import { createTiles, keyStore } from './tiles.js';
import { createPlayer } from './player.js';
import { setupSurfaces } from './surface.js';

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
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 12000);
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
  status('Loading the view…');
  await new Promise((r) => setTimeout(r, 20));
  // the real city (baked panoramas); ?city=gen or no bake -> the generated stand-in city
  let city = null, view = null, SUN = GEN_SUN;
  if (!/[?&]city=gen\b/.test(location.search)) {
    try { view = await buildView(scene, renderer, Q); SUN = view.sun; camera.far = 100000; camera.updateProjectionMatrix(); } catch (e) { console.warn('city view not available, using the generated city', e); }
  }
  if (!view) city = buildCity(scene, renderer, Q);
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
  scene.add(new THREE.HemisphereLight('#fbf3e8', '#ddd6cc', 1.05));   // sky + warm bounce off the floors
  scene.environmentIntensity = 0.55;
  renderer.shadowMap.needsUpdate = true;

  // surface realism: room reflection probes, corner / daylight darkening, wet terrace, real glass
  status('Reflections…');
  await new Promise((r) => setTimeout(r, 20));
  const surf = setupSurfaces({ scene, renderer, apt, M, Q });
  renderer.compile(scene, camera);
  surf.bake();
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyT' && !e.repeat && view) { view.nextSun(); return; }   // T: next baked time of day
    if (e.code === 'KeyG' && !e.repeat && gt) { gt.on = !gt.on; view.world.visible = !gt.on; return; }   // G: Google tiles / baked view
    if (e.code !== 'KeyR' || e.repeat) return;      // R: dry / damp / wet terrace
    const steps = [0, 0.45, 0.8, 1]; const i = steps.findIndex((v) => Math.abs(v - surf.wet) < 0.01);
    surf.setWet(steps[(i + 1) % steps.length]);
  });

  status('Physics…');
  const spawn = { x: 8.9, y: 0, z: 8.4, yaw: 0 };
  const player = await createPlayer(apt.colliders, rig, camera, renderer, spawn);
  window.__world = { scene, camera, rig, renderer, player, apt, city, view, gt, M, THREE, surf };
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
