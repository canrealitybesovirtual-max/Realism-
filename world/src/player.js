// Walking: one Rapier world with every static collider of the apartment, a kinematic capsule
// moved by Rapier's character controller (slides along walls, climbs the stair ramp, snaps to
// the ground). Computer: click to capture the mouse, WASD / arrows, Shift to run. Headset: left
// stick walks where you look, right stick turns smoothly; walking for real in the room is
// collided too (the rig is pulled back when your head goes into a wall).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const CAP_R = 0.24, CAP_H = 0.62;                        // capsule radius, half-height of the cylinder
const FOOT = CAP_H + CAP_R;                               // body centre above the feet
const EYE = 1.66;

export async function createPlayer(colliders, rig, camera, renderer, spawn) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  let n = 0;
  for (const c of colliders) {
    let d = null;
    if (c.t === 'box') {
      const h = [(c.max[0] - c.min[0]) / 2, (c.max[1] - c.min[1]) / 2, (c.max[2] - c.min[2]) / 2];
      d = RAPIER.ColliderDesc.cuboid(h[0], h[1], h[2]).setTranslation((c.max[0] + c.min[0]) / 2, (c.max[1] + c.min[1]) / 2, (c.max[2] + c.min[2]) / 2);
    } else if (c.t === 'obox') {
      d = RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]).setTranslation(c.c[0], c.c[1], c.c[2])
        .setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) });
    } else if (c.t === 'hull') {
      d = RAPIER.ColliderDesc.convexHull(new Float32Array(c.p));
    } else if (c.t === 'tri') {
      d = RAPIER.ColliderDesc.trimesh(c.v, c.i);
    }
    if (d) { world.createCollider(d, fixed); n++; }
  }

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + FOOT, spawn.z));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_H, CAP_R), body);
  const kcc = world.createCharacterController(0.02);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableAutostep(0.32, 0.12, false);
  kcc.enableSnapToGround(0.45);
  kcc.setMaxSlopeClimbAngle(52 * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(65 * Math.PI / 180);
  kcc.setSlideEnabled(true);
  world.step();

  // ---- input ----------------------------------------------------------------------------------
  const keys = new Set();
  const look = { yaw: spawn.yaw || 0, pitch: 0 };
  const el = renderer.domElement;
  addEventListener('keydown', (e) => { keys.add(e.code); });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  addEventListener('blur', () => keys.clear());
  el.addEventListener('click', () => { if (!renderer.xr.isPresenting && document.pointerLockElement !== el) el.requestPointerLock(); });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== el) return;
    look.yaw -= e.movementX * 0.0022;
    look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - e.movementY * 0.0022));
  });

  let vy = 0, grounded = true;
  const pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);         // feet
  const head = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let vrYaw = spawn.yaw || 0;

  function move(dx, dz, dt) {
    vy = grounded ? -0.5 : Math.max(-20, vy - 9.81 * dt);
    const t = body.translation();
    kcc.computeColliderMovement(col, { x: dx, y: vy * dt, z: dz });
    const m = kcc.computedMovement();
    grounded = kcc.computedGrounded();
    body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    world.step();
    const b = body.translation();
    pos.set(b.x, b.y - FOOT, b.z);
    if (pos.y < -20) { body.setTranslation({ x: spawn.x, y: spawn.y + FOOT, z: spawn.z }, true); vy = 0; }
  }

  function axes(handed) {
    const s = renderer.xr.getSession(); if (!s) return null;
    for (const src of s.inputSources) if (src.handedness === handed && src.gamepad) {
      const a = src.gamepad.axes; return a.length >= 4 ? [a[2], a[3]] : [a[0], a[1]];
    }
    return null;
  }
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (renderer.xr.isPresenting) {
      // headset: stick walking relative to where you look, smooth turning, room-scale collided
      const xrCam = renderer.xr.getCamera();
      xrCam.getWorldPosition(head);
      xrCam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      right.set(-fwd.z, 0, fwd.x);
      const L = axes('left') || [0, 0], Rr = axes('right') || [0, 0];
      const run = 1.6;
      const mx = dz(L[0]), my = dz(L[1]);
      // desired = stick motion + the head's offset from the body (real walking)
      const b = body.translation();
      let dx = (right.x * mx - fwd.x * my) * run * dt + (head.x - b.x);
      let dzv = (right.z * mx - fwd.z * my) * run * dt + (head.z - b.z);
      move(dx, dzv, dt);
      // put the rig so the head sits over the (collided) body
      const nb = body.translation();
      rig.position.x += nb.x - head.x; rig.position.z += nb.z - head.z;
      rig.position.y = nb.y - FOOT;
      // smooth turn about the head
      const tr = dz(Rr[0]);
      if (tr) {
        const a = -tr * 1.9 * dt;
        xrCam.getWorldPosition(head);
        tmp.copy(rig.position).sub(head).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
        rig.position.copy(head).add(tmp); rig.rotation.y += a; vrYaw += a;
      }
    } else {
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.2 : 1.5;
      let f = 0, s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      const l = Math.hypot(f, s) || 1;
      const sy = Math.sin(look.yaw), cy = Math.cos(look.yaw);
      // yaw 0 looks along -z
      const dx = ((-sy) * f + cy * s) / l * speed * dt, dzv = ((-cy) * f - sy * s) / l * speed * dt;
      move(dx, dzv, dt);
      rig.position.set(pos.x, pos.y, pos.z);
      rig.rotation.set(0, look.yaw, 0);
      camera.position.set(0, EYE, 0);
      camera.rotation.set(look.pitch, 0, 0, 'YXZ');
    }
  }

  renderer.xr.addEventListener('sessionstart', () => {
    rig.rotation.set(0, look.yaw, 0); vrYaw = look.yaw;
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  });
  renderer.xr.addEventListener('sessionend', () => {
    look.yaw = rig.rotation.y; look.pitch = 0;
    const b = body.translation(); rig.position.set(b.x, b.y - FOOT, b.z);
  });

  return { update, pos, look, colliders: n, teleport(x, y, z, yaw) { body.setTranslation({ x, y: y + FOOT, z }, true); vy = 0; if (yaw !== undefined) look.yaw = yaw; } };
}
