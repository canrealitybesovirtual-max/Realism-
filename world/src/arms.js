// Guns in the apartment: the CQC Glock 17, AKM and AWM (../cqc/models), baked into one held-gun
// frame (grip at HOLD, bore along -z), held in front of the camera on a computer and in the right
// hand in a headset. Hitscan rounds: the nearest of an enemy capsule (three raycast) and the
// apartment's colliders (Rapier ray); a hole and a puff of dust where they hit a wall.
// Computer: 1 Glock, 2 AKM, 3 AWM, Q put it away; click fires (hold for the AKM), right button
// aims (AWM: 6x scope, wheel zooms 3-25x), R reloads. Headset: right grip button cycles
// Glock / AKM / AWM / none, trigger fires, A reloads.
// Bake numbers are the old studio range's (measured from the CQC models).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const HOLD = [0, -0.012, 0.02];
const GUNS = {
  g17: { label: 'Glock 17', file: '../cqc/models/g17-glb.glb', bake: { S: 0.113, yb: 1.11, z0: -0.302 },
    parts: (n) => (/frame_0$/.test(n) ? 'body' : /slide_0$/.test(n) ? 'slide' : /^mag_full_g17/.test(n) ? 'mag' : null),
    palm: [0, -0.06, 0.01], muzzle: [0, 0, -0.13], eye: [0, 0.01385, 0.473], cap: 17, rpm: 0, rec: { rise: 0.06, kick: 0.035 },
    snd: ['pistol1'], rate: 1, reload: 1.3, hip: [0.17, -0.18, -0.36], mag: ['glkMagOut1', 'glkMagIn1'], spread: 0.012 },
  akmn: { label: 'AKM', file: '../cqc/models/akmn-glb.glb', bake: { S: 1, yb: 0.085, z0: -0.264 },
    parts: (n) => { const p = n.split('~')[0]; return p === 'mag' || p === 'rounds' ? 'mag' : p === 'ch' ? 'slide' : 'body'; },
    palm: [0, -0.088, 0.004], muzzle: [0, 0, -0.615], eye: [0, 0.047, 0.06], cap: 30, rpm: 600, rec: { rise: 0.018, kick: 0.02 },
    snd: ['ak1', 'ak2', 'ak3', 'ak4', 'ak5'], rate: 1, reload: 2.0, hip: [0.15, -0.17, -0.26], mag: ['akMagOut1', 'akMagIn1'], spread: 0.02 },
  awp: { label: 'AWM', file: '../cqc/models/awp-glb.glb', bake: { S: 0.76, yb: 0.111, z0: 0.013 },
    parts: (n) => { const p = n.split('~')[0]; return p === 'mag' || p === 'rounds' ? 'mag' : p === 'bolt' || p === 'shroud' ? 'slide' : 'body'; },
    palm: [0, -0.088, 0.004], muzzle: [0, 0, -0.958], eye: [0, 0.09, 0.12], cap: 5, rpm: 0, bolt: 1.1, rec: { rise: 0.05, kick: 0.06 },
    snd: ['awp1'], rate: 1, reload: 2.2, hip: [0.16, -0.19, -0.2], mag: ['akMagOut2', 'akMagIn1'], spread: 0.04, scope: true },
};
const ORDER = ['g17', 'akmn', 'awp'];

export function createArms({ scene, camera, renderer, rig, player, hub, enemies }) {
  const tpl = {}, state = { cur: null, rounds: {}, aim: 0, mag: 6, reloading: 0, nextShot: 0, kick: 0, trigger: false };
  for (const k of ORDER) state.rounds[k] = GUNS[k].cap;
  const holder = new THREE.Group(); camera.add(holder);           // computer: in front of the eye
  const loader = new GLTFLoader();
  const hold = (d, a) => new THREE.Vector3(a[0] - d.palm[0] + HOLD[0], a[1] - d.palm[1] + HOLD[1], a[2] - d.palm[2] + HOLD[2]);
  function toFloat(g) {
    for (const n of ['position', 'normal', 'uv']) {
      const a = g.attributes[n]; if (!a || (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute)) continue;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(n, new THREE.BufferAttribute(out, a.itemSize));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }
  function load(type) {
    if (tpl[type]) return tpl[type];
    const d = GUNS[type], B = d.bake;
    return (tpl[type] = loader.loadAsync(d.file).then((gltf) => {
      const src = gltf.scene; src.updateMatrixWorld(true);
      const D = new THREE.Matrix4().set(-B.S, 0, 0, 0, 0, B.S, 0, -B.S * B.yb, 0, 0, -B.S, B.S * B.z0, 0, 0, 0, 1)
        .premultiply(new THREE.Matrix4().makeTranslation(HOLD[0] - d.palm[0], HOLD[1] - d.palm[1], HOLD[2] - d.palm[2]));
      const obj = new THREE.Group(), _m = new THREE.Matrix4();
      let eye = hold(d, d.eye);
      src.traverse((o) => {
        if (!o.isMesh) return;
        const part = d.parts(o.name); if (!part) return;
        const g = toFloat(o.geometry.clone()).applyMatrix4(_m.multiplyMatrices(D, o.matrixWorld));
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.side = part === 'mag' ? THREE.DoubleSide : THREE.FrontSide; if (/glass/i.test(m.name || '') || o.name.startsWith('glass')) { m.transparent = true; m.depthWrite = false; } }
        const mesh = new THREE.Mesh(g, o.material); mesh.raycast = () => {}; mesh.userData.part = part; mesh.userData.name = o.name;
        obj.add(mesh);
      });
      if (d.scope) {   // the sight line is the scope axis (rear cluster of the scope glass)
        let y0 = Infinity, y1 = -Infinity, zMax = -Infinity; const zc = hold(d, [0, 0, -0.08]).z;
        obj.children.forEach((m) => { if (!m.userData.name.startsWith('glass')) return; const A = m.geometry.attributes.position; for (let i = 0; i < A.count; i++) { const z = A.getZ(i); if (z > zc) { y0 = Math.min(y0, A.getY(i)); y1 = Math.max(y1, A.getY(i)); zMax = Math.max(zMax, z); } } });
        if (isFinite(zMax)) eye = new THREE.Vector3(0, (y0 + y1) / 2, zMax + 0.085);
      }
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      flash.position.copy(hold(d, d.muzzle)).add(new THREE.Vector3(0, 0, -0.04)); flash.scale.setScalar(type === 'g17' ? 0.12 : 0.22); flash.visible = false; obj.add(flash);
      obj.traverse((o) => { o.frustumCulled = false; });
      return { d, obj, eye, muzzle: hold(d, d.muzzle), flash };
    }));
  }
  const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.25, 'rgba(255,190,90,0.8)'); g.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

  // ---- sound ----------------------------------------------------------------------------------
  let ctx = null; const bufs = {};
  const actx = () => { if (!ctx) { try { ctx = new AudioContext(); } catch (e) { return null; } } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function sound(name) {
    if (bufs[name]) return;
    bufs[name] = 1;
    fetch('../cqc/sounds/' + name + '.mp3').then((r) => r.arrayBuffer()).then((a) => actx().decodeAudioData(a)).then((b) => { bufs[name] = b; }).catch(() => { delete bufs[name]; });
  }
  function play(name, rate = 1, gain = 0.8) {
    const c = actx(), b = bufs[name]; if (!c || !b || b === 1) return;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const g = c.createGain(); g.gain.value = gain; s.connect(g).connect(c.destination); s.start();
  }

  // ---- impacts: bullet holes and dust ----------------------------------------------------------
  const holeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(8,7,6,1)'); g.addColorStop(0.28, 'rgba(25,22,20,0.95)'); g.addColorStop(0.45, 'rgba(90,84,76,0.45)'); g.addColorStop(1, 'rgba(120,110,100,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const holeMat = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const holeGeo = new THREE.PlaneGeometry(0.035, 0.035), holes = [];
  for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(holeGeo, holeMat); m.visible = false; m.raycast = () => {}; scene.add(m); holes.push(m); }
  let holeI = 0;
  const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(225,218,205,0.8)'); g.addColorStop(1, 'rgba(225,218,205,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const dusts = [];
  for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false })); s.visible = false; s.raycast = () => {}; scene.add(s); dusts.push({ s, t: 9, v: new THREE.Vector3() }); }
  let dustI = 0;
  function impact(p, n) {
    const h = holes[holeI++ % holes.length];
    h.position.copy(p).addScaledVector(n, 0.002); h.lookAt(p.clone().add(n)); h.rotateZ(Math.random() * 6.28); h.scale.setScalar(0.8 + Math.random() * 0.5); h.visible = true;
    const u = dusts[dustI++ % dusts.length]; u.s.position.copy(p).addScaledVector(n, 0.03); u.v.copy(n).multiplyScalar(0.5); u.t = 0; u.s.visible = true;
  }

  // ---- shooting ----------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(); ray.far = 300;
  function shoot(origin, dir) {
    let best = null;
    ray.set(origin, dir);
    const eh = ray.intersectObjects(enemies.proxies(), false)[0];
    if (eh) best = { d: eh.distance, fn: () => eh.object.userData.onBulletHit({ dir, point: eh.point }) };
    const R = player.RAPIER, r = new R.Ray(origin, dir);
    const wh = player.world.castRayAndGetNormal(r, 300, true, undefined, undefined, player.body);
    if (wh && (!best || wh.timeOfImpact < best.d)) {
      const p = origin.clone().addScaledVector(dir, wh.timeOfImpact), n = new THREE.Vector3(wh.normal.x, wh.normal.y, wh.normal.z);
      best = { d: wh.timeOfImpact, fn: () => impact(p, n) };
    }
    if (best) best.fn();
  }
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
  function fire() {
    const T = state.cur && tpl[state.cur] && tpl[state.cur].v; if (!T || state.reloading > 0 || state.boltT > 0) return;
    const d = T.d;
    if (state.rounds[state.cur] <= 0) { play('dry1', 1, 0.5); state.trigger = false; return; }
    state.rounds[state.cur]--;
    play(d.snd[Math.floor(Math.random() * d.snd.length)], d.rate, 0.75);
    T.flash.visible = true; T.flash.material.rotation = Math.random() * 6.28; state.flashT = 0.045;
    const xr = renderer.xr.isPresenting;
    if (xr) { T.obj.updateMatrixWorld(true); _o.copy(T.muzzle).applyMatrix4(T.obj.matrixWorld); _d.set(0, 0, -1).transformDirection(T.obj.matrixWorld); }
    else {
      camera.getWorldPosition(_o); camera.getWorldDirection(_d);
      const sp = d.spread * (1 - state.aim);           // hip fire scatters, aimed fire goes to the dot
      _d.x += (Math.random() - 0.5) * sp; _d.y += (Math.random() - 0.5) * sp; _d.z += (Math.random() - 0.5) * sp; _d.normalize();
      player.look.pitch = Math.min(1.45, player.look.pitch + d.rec.rise * (0.6 + 0.4 * Math.random()));
      player.look.yaw += (Math.random() - 0.5) * d.rec.rise * 0.4;
    }
    state.kick = 1;
    shoot(_o, _d);
    if (d.bolt) { state.boltT = d.bolt; setTimeout(() => play('smgBoltBack', 0.8, 0.5), 350); setTimeout(() => play('smgBoltFwd', 0.8, 0.5), 700); }
    if (xr) pulse(0.8, 40);
  }
  function reload() {
    const T = state.cur && tpl[state.cur] && tpl[state.cur].v; if (!T || state.reloading > 0 || state.rounds[state.cur] >= T.d.cap) return;
    state.reloading = T.d.reload; play(T.d.mag[0], 1, 0.6); setTimeout(() => play(T.d.mag[1], 1, 0.6), T.d.reload * 600);
  }
  function equip(type) {
    if (state.cur && tpl[state.cur] && tpl[state.cur].v) tpl[state.cur].v.obj.removeFromParent();
    state.cur = type; state.aim = 0; hud();
    if (!type) return;
    const d = GUNS[type]; d.snd.forEach(sound); d.mag.forEach(sound); ['dry1', 'smgBoltBack', 'smgBoltFwd', 'pickup1'].forEach(sound);
    load(type).then((v) => { tpl[type].v = v; if (state.cur === type) { place(); play('pickup1', 1, 0.5); } });
  }
  function place() {
    const T = state.cur && tpl[state.cur] && tpl[state.cur].v; if (!T) return;
    if (renderer.xr.isPresenting && grip) grip.add(T.obj); else holder.add(T.obj);
  }

  // ---- input ----------------------------------------------------------------------------------
  const desk = () => document.pointerLockElement && !renderer.xr.isPresenting;
  addEventListener('keydown', (e) => {
    if (!desk() || e.repeat) return;
    const i = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (i !== undefined) equip(state.cur === ORDER[i] ? null : ORDER[i]);
    else if (e.code === 'KeyQ') equip(null);
    else if (e.code === 'KeyR') reload();
  });
  addEventListener('mousedown', (e) => {
    if (!desk()) return;
    if (e.button === 0 && state.cur && !hub.aimed()) { state.trigger = true; fire(); }
    if (e.button === 2) state.aimHeld = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) state.trigger = false; if (e.button === 2) state.aimHeld = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { if (desk() && state.cur === 'awp' && state.aim > 0.5) state.mag = Math.max(3, Math.min(25, state.mag * (e.deltaY > 0 ? 0.85 : 1.18))); });

  // headset: the right hand's grip space holds the gun; its controller ray fires
  let grip = null, ctrlR = null, ctrlI = -1, gpPrev = {};
  for (let i = 0; i < 2; i++) {
    const g = renderer.xr.getControllerGrip(i), c = renderer.xr.getController(i);
    rig.add(g);
    c.addEventListener('connected', (ev) => { if (ev.data.handedness === 'right') { grip = g; ctrlR = ev.data; ctrlI = i; place(); } });
    c.addEventListener('selectstart', () => { if (i === ctrlI && state.cur && !hub.aimed(i)) { state.trigger = true; fire(); } });
    c.addEventListener('selectend', () => { if (i === ctrlI) state.trigger = false; });
    c.addEventListener('squeezestart', () => { if (i === ctrlI) { const k = ORDER.indexOf(state.cur); equip(k + 1 < ORDER.length ? ORDER[k + 1] : null); } });
  }
  renderer.xr.addEventListener('sessionstart', place);
  renderer.xr.addEventListener('sessionend', place);
  function pulse(k, ms) { const a = ctrlR && ctrlR.gamepad && ctrlR.gamepad.hapticActuators && ctrlR.gamepad.hapticActuators[0]; if (a && a.pulse) a.pulse(k, ms); }

  // ---- HUD and scope ----------------------------------------------------------------------------
  const hudEl = document.createElement('div');
  hudEl.style.cssText = 'position:fixed;right:16px;bottom:64px;font:600 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;text-align:right;z-index:6';
  document.body.appendChild(hudEl);
  const scopeEl = document.createElement('div');
  scopeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;z-index:4;background:radial-gradient(circle at 50% 50%, transparent 0 38vmin, #000 38.5vmin)';
  scopeEl.innerHTML = '<svg style="position:absolute;left:50%;top:50%;width:76vmin;height:76vmin;transform:translate(-50%,-50%)" viewBox="-100 -100 200 200"><g stroke="#000" stroke-width="0.6" fill="#000"><line x1="-100" y1="0" x2="-4" y2="0"/><line x1="4" y1="0" x2="100" y2="0"/><line x1="0" y1="-100" x2="0" y2="-4"/><line x1="0" y1="4" x2="0" y2="100"/>' +
    [-40, -30, -20, -10, 10, 20, 30, 40].map((v) => `<circle cx="${v}" cy="0" r="1"/><circle cx="0" cy="${v}" r="1"/>`).join('') + '</g></svg>';
  document.body.appendChild(scopeEl);
  let hudText = '';
  function hud() {
    const t = state.cur ? `${GUNS[state.cur].label} · ${state.reloading > 0 ? 'reloading' : state.rounds[state.cur] + ' / ' + GUNS[state.cur].cap}` : (document.pointerLockElement ? '1 Glock · 2 AKM · 3 AWM' : '');
    if (t !== hudText) { hudText = t; hudEl.textContent = t; }
  }
  const baseFov = camera.fov;

  // ---- per frame --------------------------------------------------------------------------------
  const hipV = new THREE.Vector3(), adsV = new THREE.Vector3();
  function update(dt, now) {
    const T = state.cur && tpl[state.cur] && tpl[state.cur].v;
    if (state.reloading > 0) { state.reloading -= dt; if (state.reloading <= 0) state.rounds[state.cur] = GUNS[state.cur].cap; }
    if (state.boltT > 0) state.boltT -= dt;
    if (state.flashT > 0) { state.flashT -= dt; if (state.flashT <= 0 && T) T.flash.visible = false; }
    if (T && state.trigger && T.d.rpm && now >= state.nextShot) { fire(); state.nextShot = now + 60 / T.d.rpm; }
    for (const u of dusts) if (u.t < 1.2) { u.t += dt; u.s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(0.92); u.s.scale.setScalar(0.04 + u.t * 0.25); u.s.material.opacity = Math.max(0, 0.7 * (1 - u.t / 1.2)); if (u.t >= 1.2) u.s.visible = false; }
    state.kick = Math.max(0, state.kick - dt * 9);
    const xr = renderer.xr.isPresenting;
    const aB = !!(xr && ctrlR && ctrlR.gamepad && ctrlR.gamepad.buttons[4] && ctrlR.gamepad.buttons[4].pressed);   // A: reload
    if (aB && !gpPrev.a) reload(); gpPrev.a = aB;
    const aimT = T && !xr && state.aimHeld && state.reloading <= 0 ? 1 : 0;
    state.aim += (aimT - state.aim) * Math.min(1, dt * 12);
    let fov = baseFov;
    if (T && !xr) {
      hipV.fromArray(T.d.hip); adsV.copy(T.eye).negate();
      T.obj.position.lerpVectors(hipV, adsV, state.aim);
      T.obj.position.z += state.kick * T.d.rec.kick;
      T.obj.position.y -= (state.reloading > 0 ? Math.sin(Math.min(1, 1 - state.reloading / T.d.reload) * Math.PI) * 0.12 : 0);
      T.obj.rotation.set(state.kick * T.d.rec.rise * 1.2, 0, 0);
      const scoped = T.d.scope && state.aim > 0.85;
      scopeEl.style.display = scoped ? 'block' : 'none';
      T.obj.visible = !scoped;
      fov = scoped ? 2 * Math.atan(Math.tan(baseFov * Math.PI / 360) / state.mag) * 180 / Math.PI : baseFov - state.aim * (T.d.scope ? 0 : 14);
    } else { scopeEl.style.display = 'none'; if (T) { T.obj.position.set(0, 0, state.kick * T.d.rec.kick); T.obj.rotation.set(state.kick * 0.1, 0, 0); T.obj.visible = true; } }
    if (!xr && Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    hud();
  }
  return { update, equip, reload, fire, state, GUNS };
}
