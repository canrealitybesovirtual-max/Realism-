// Training enemies in the apartment: the CQC soldier (../cqc/models/enemy-soldier.glb) standing as a
// shootable target, spawned at the spot farthest from you (both floors). Not the CQC AI: he turns to
// face you, flinches when hit, falls when killed (scripted topple about the heels) and gets back up
// after a while. Hits land on invisible capsules (head / torso / legs) via userData.onBulletHit.
// Ported from the old studio add-on (relaxed arms, merged skinned parts, capsules, fall).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MAX = 6, HEIGHT = 1.8, GET_UP_AFTER = 7;
const UP = new THREE.Vector3(0, 1, 0);
// standing spots in open floor (x, floor y, z); the farthest clear one from you is used
const SPOTS = [
  [5.2, 0, 5.6], [12.3, 0, 5.9], [16.15, 0, 4.9], [2.2, 0, 15.7], [9.4, 0, 6.2], [4.1, 0, 10.4],
  [9.0, 4.6, 1.4], [16.1, 4.6, 1.6], [5.6, 4.6, 15.8], [12.4, 4.6, 16.2], [8.6, 4.6, 16.4], [13.9, 4.6, 10.5],
];
const BONES = {
  head: /(mixamorig)?Head(_\d+)?$|CC_Base_Head(_\d+)?$/,
  neck: /(mixamorig)?Neck(_\d+)?$|CC_Base_NeckTwist01(_\d+)?$/,
  hips: /(mixamorig)?Hips(_\d+)?$|CC_Base_Hip(_\d+)?$/,
  spine: /(mixamorig)?Spine1(_\d+)?$|CC_Base_Spine01(_\d+)?$/,
  lArm: /LeftArm(_\d+)?$|CC_Base_L_Upperarm(_\d+)?$/, lFore: /LeftForeArm(_\d+)?$|CC_Base_L_Forearm(_\d+)?$/, lHand: /LeftHand(_\d+)?$|CC_Base_L_Hand(_\d+)?$/,
  rArm: /RightArm(_\d+)?$|CC_Base_R_Upperarm(_\d+)?$/, rFore: /RightForeArm(_\d+)?$|CC_Base_R_Forearm(_\d+)?$/, rHand: /RightHand(_\d+)?$|CC_Base_R_Hand(_\d+)?$/,
  lFoot: /LeftFoot(_\d+)?$|CC_Base_L_Foot(_\d+)?$/,
};
const DMG = { head: 100, torso: 40, legs: 25 };

export function createEnemies({ scene, camera, player, onNote = () => {} }) {
  const list = [], puffs = [];
  let tplP = null;
  const bone = (root, re) => { let f = null; root.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
  function aim(b, child, dir) {
    if (!b || !child) return;
    b.updateMatrixWorld(true);
    const a = b.getWorldPosition(new THREE.Vector3()), cur = child.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
    if (cur.lengthSq() < 1e-8) return;
    const dq = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
    const wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pq.invert().multiply(dq).multiply(wq)); b.updateMatrixWorld(true);
  }
  function relax(root) {   // arms from the bind pose down beside the body, elbows a little bent
    const B = {}; for (const k in BONES) B[k] = bone(root, BONES[k]);
    if (!B.lArm || !B.rArm || !B.hips) return;
    root.updateMatrixWorld(true);
    const side = B.lArm.getWorldPosition(new THREE.Vector3()).sub(B.rArm.getWorldPosition(new THREE.Vector3())); side.y = 0; side.normalize();
    const fwd = new THREE.Vector3().crossVectors(side, UP).normalize(), down = new THREE.Vector3(0, -1, 0);
    aim(B.lArm, B.lFore, down.clone().addScaledVector(side, 0.16).addScaledVector(fwd, 0.08));
    aim(B.rArm, B.rFore, down.clone().addScaledVector(side, -0.16).addScaledVector(fwd, 0.08));
    aim(B.lFore, B.lHand, down.clone().addScaledVector(side, 0.05).addScaledVector(fwd, 0.35));
    aim(B.rFore, B.rHand, down.clone().addScaledVector(side, -0.05).addScaledVector(fwd, 0.35));
    root.userData.front = fwd.clone();
  }
  function load() {
    if (tplP) return tplP;
    tplP = new GLTFLoader().loadAsync('../cqc/models/enemy-soldier.glb').then((g) => {
      const root = g.scene; root.updateMatrixWorld(true);
      root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; if (o.material && o.material.transparent && o.material.opacity > 0.98) o.material.transparent = false; } });
      relax(root); root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root, true), k = HEIGHT / ((box.max.y - box.min.y) || 1);
      const wrap = new THREE.Group(); wrap.add(root);
      root.scale.multiplyScalar(k);
      root.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
      wrap.updateMatrixWorld(true);
      return wrap;
    });
    return tplP;
  }
  function cloneSkinned(src) {
    const clone = src.clone(true), map = new Map(), rev = new Map();
    (function walk(a, b) { map.set(a, b); rev.set(b, a); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); })(src, clone);
    clone.traverse((o) => {
      if (o.isMesh) o.raycast = () => {};
      if (!o.isSkinnedMesh) return;
      const s = rev.get(o);
      o.skeleton = s.skeleton.clone(); o.skeleton.bones = s.skeleton.bones.map((b) => map.get(b));
      o.bind(o.skeleton, s.bindMatrix.clone()); o.frustumCulled = false;
    });
    return clone;
  }
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  function addProxies(e) {
    const root = e.model; root.updateMatrixWorld(true);
    const inv = e.body.matrixWorld.clone().invert();
    const loc = (b, fb) => (b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : fb);
    const B = {}; for (const k in BONES) B[k] = bone(root, BONES[k]);
    const head = loc(B.head, new THREE.Vector3(0, 1.62, 0)), neck = loc(B.neck, new THREE.Vector3(0, 1.5, 0)), hips = loc(B.hips, new THREE.Vector3(0, 0.95, 0));
    head.y = Math.max(head.y, neck.y + 0.04);
    const cap = (r, l) => new THREE.CapsuleGeometry(r, Math.max(0.01, l), 4, 8);
    e.proxies = [
      ['head', new THREE.SphereGeometry(0.13, 10, 8), head.clone().setY(head.y + 0.06)],
      ['torso', cap(0.19, Math.max(0.1, neck.y - hips.y - 0.2)), new THREE.Vector3((neck.x + hips.x) / 2, (neck.y + hips.y) / 2, (neck.z + hips.z) / 2)],
      ['legs', cap(0.17, Math.max(0.1, hips.y - 0.4)), new THREE.Vector3(hips.x, hips.y / 2 + 0.02, hips.z)],
    ].map(([part, geo, at]) => {
      const m = new THREE.Mesh(geo, proxyMat); m.position.copy(at);
      m.userData.enemy = e; m.userData.onBulletHit = (info) => hit(e, part, info.dir, info.point);
      e.body.add(m); return m;
    });
    e.bones = B;
  }
  // a spot is clear when a 0.3 m capsule there touches nothing, and no other man stands within 0.8 m
  function clear([x, y, z]) {
    const P = player, R = P.RAPIER, shape = new R.Capsule(0.6, 0.3);
    let hitAny = false;
    P.world.intersectionsWithShape({ x, y: y + 0.95, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, () => { hitAny = true; return false; }, undefined, undefined, P.body);
    return !hitAny && !list.some((e) => e.root.position.distanceTo(new THREE.Vector3(x, y, z)) < 0.8);
  }
  function farthestSpot() {
    const p = player.pos;
    const score = ([x, y, z]) => Math.hypot(x - p.x, z - p.z) + 7 * Math.abs(y - p.y);
    const ok = SPOTS.filter(clear).sort((a, b) => score(b) - score(a));
    return ok[0] || null;
  }
  async function spawn() {
    if (list.length >= MAX) { onNote(`At most ${MAX} enemies`); return null; }
    const tpl = await load();
    const s = farthestSpot(); if (!s) { onNote('No free spot'); return null; }
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const model = cloneSkinned(tpl); body.add(model);
    const front = (tpl.children[0] && tpl.children[0].userData.front) || new THREE.Vector3(0, 0, 1);
    model.rotation.y = -Math.atan2(front.x, front.z);
    root.position.set(s[0], s[1], s[2]);
    root.rotation.y = Math.atan2(player.pos.x - s[0], player.pos.z - s[2]);
    scene.add(root); root.updateMatrixWorld(true);
    const e = { root, body, model, hp: 100, state: 'up', t: 0, flinch: 0, flinchDir: new THREE.Vector3(), fallAxis: new THREE.Vector3(1, 0, 0), fallDir: new THREE.Vector3(0, 0, -1) };
    addProxies(e);
    e.spineRest = e.bones.spine ? e.bones.spine.quaternion.clone() : null;
    e.headRest = e.bones.head ? e.bones.head.quaternion.clone() : null;
    list.push(e);
    onNote(`Enemy at the far end (${s[1] > 2 ? 'upstairs' : 'downstairs'})`);
    return e;
  }
  function remove(e) { const i = list.indexOf(e); if (i < 0) return; list.splice(i, 1); scene.remove(e.root); e.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
  function clearAll() { list.slice().forEach(remove); }

  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(120,10,8,0.95)'); g.addColorStop(0.5, 'rgba(90,6,6,0.6)'); g.addColorStop(1, 'rgba(60,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function puff(point) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    sp.position.copy(point); sp.scale.setScalar(0.06); sp.raycast = () => {};
    scene.add(sp); puffs.push({ s: sp, t: 0 });
  }
  function hit(e, part, dir, point) {
    if (point) puff(point);
    if (e.state !== 'up') return part;
    const d = dir.clone(); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, -1); d.normalize();
    e.hp -= DMG[part] || 30;
    const local = d.clone().applyQuaternion(e.root.quaternion.clone().invert());
    if (e.hp <= 0) { e.state = 'falling'; e.t = 0; e.fallDir.copy(local); e.fallAxis.crossVectors(UP, local).normalize(); }
    else { e.flinch = 1; e.flinchDir.copy(local); }
    return part;
  }
  const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _q2 = new THREE.Quaternion();
  function update(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.t += dt; p.s.scale.setScalar(0.06 + p.t * 0.5); p.s.material.opacity = Math.max(0, 1 - p.t / 0.45);
      if (p.t > 0.45) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
    }
    for (const e of list) {
      const B = e.bones;
      if (e.state === 'up') {   // turn slowly to face you
        const want = Math.atan2(player.pos.x - e.root.position.x, player.pos.z - e.root.position.z);
        let dA = want - e.root.rotation.y; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        e.root.rotation.y += Math.max(-1, Math.min(1, dA)) * Math.min(1, dt * 1.5);
      }
      if (e.flinch > 0 && B.spine && e.spineRest) {
        e.flinch = Math.max(0, e.flinch - dt * 3.2);
        _ax.crossVectors(UP, e.flinchDir).normalize().applyQuaternion(B.spine.parent.getWorldQuaternion(_q2).invert().multiply(e.root.getWorldQuaternion(_q)));
        B.spine.quaternion.copy(e.spineRest).premultiply(_q.setFromAxisAngle(_ax, Math.sin(e.flinch * Math.PI) * 0.22));
      } else if (e.spineRest && B.spine && e.state === 'up') B.spine.quaternion.copy(e.spineRest);
      if (e.state === 'falling' || e.state === 'rising') {
        e.t += dt;
        let w;
        if (e.state === 'falling') { const u = Math.min(1, e.t / 0.75); w = u * u; if (e.t > 1.0) { e.state = 'down'; e.t = 0; } }
        else { const v = Math.max(0, 1 - e.t / 1.3); w = v * v * (3 - 2 * v); if (v <= 0) { e.state = 'up'; e.hp = 100; } }
        e.body.quaternion.setFromAxisAngle(e.fallAxis, (Math.PI / 2 - 0.06) * w);
        e.body.position.copy(e.fallDir).multiplyScalar(-0.08 * w).setY(0.14 * w);
        if (B.head && e.headRest) B.head.quaternion.copy(e.headRest).premultiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.4 * w));
      } else if (e.state === 'down') { e.t += dt; if (e.t > GET_UP_AFTER) { e.state = 'rising'; e.t = 0; } }
    }
  }
  const proxies = () => list.flatMap((e) => (e.root.updateMatrixWorld(true), [])).concat(list.flatMap((e) => (e.state === 'down' ? [] : e.proxies)));
  return { spawn, remove, clear: clearAll, update, proxies, list, load };
}
