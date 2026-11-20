#!/usr/bin/env node
/* CQC automatic test run: plays the game headless and clears N combat rooms.
 *
 *   node cqc/tools/autorun.js [--rooms 5] [--timeout 1500] [--port 0] [--show] [--keep] [--url-extra "&foo=bar"]
 *
 * Serves the repo (python3 http.server), opens cqc/index.html?dev&lite=on&lowmem=on in headless Chromium
 * (SwiftShader), starts the game (title: Computer -> Single player), takes the AKM from the safe room's gun
 * locker and then, room after room: walks to the exit door (the men's own nav paths, the game's own walking:
 * keys + look), presses the door, walks through, and kills every man in the room through the real desktop fire
 * path (look at his head, aim down the sights, trigger). Rendering is stubbed (renderer.render does nothing)
 * except one real frame per room. Unlimited ammo and god mode are on (mods), so a run never ends by dying.
 *
 * Collects: page errors, console errors, FRAME_ERR, unlinked shader programs (LINK_STATUS after the real frame),
 * HTTP >= 400 (favicon ignored), NaN positions (you, men, props), rooms that never clear, men that could not be
 * killed through the fire path (killed by a direct traceBullet fallback instead, reported), stuck walking, tick
 * time per room. Prints a report; exit code 1 on any failure. Only one browser at a time (shared memory).
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ROOMS = +arg('rooms', 5), TIMEOUT = +arg('timeout', 1500) * 1000, EXTRA = arg('url-extra', '') || '';
const ROOT = path.resolve(__dirname, '..', '..');

function freePort() { return new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); }); }

/* ---------------------------------------------------------------------------------------------------------------
 *  The in-page bot. Runs at the start of every game frame (wrapped animation loop), drives the game's own inputs.
 * ------------------------------------------------------------------------------------------------------------- */
function installBot(cfg) {
  const D = window.__cqcDev, T = D.THREE;
  const AR = window.__AR = {
    cfg, st: 'grab', t0: performance.now(), stT: 0, gt: 0, lastT: 0, log: [], rooms: [], cur: null, done: false, fail: null,
    realTick: false, realPend: 0, realMs: [], ticks: 0, tickMs: 0, tickMax: 0, nan: [], stuck: [], unkillable: [], notes: [],
    path: null, pi: 0, lastMove: { t: 0, x: 0, z: 0 }, fireT: 0, tgt: null, tgtT: 0, tgtHp: 0, tgtHitT: 0, fallbacks: 0, pressT: 0,
    combat: 0, programsBad: [], tgtLastSeen: 0
  };
  const say = (m) => { AR.log.push(((performance.now() - AR.t0) / 1000).toFixed(1) + 's ' + m); if (AR.log.length > 400) AR.log.shift(); };
  AR.say = say;
  const v = new T.Vector3(), v2 = new T.Vector3(), dir = new T.Vector3();
  const setSt = (s) => { AR.st = s; AR.stT = AR.gt; say('-> ' + s); };
  const el = () => AR.gt - AR.stT;   // game seconds in this state (the game clamps a frame to 0.1 s, so it runs slower than real time at a low frame rate)
  const head = () => D.headWorld(new T.Vector3());
  const stop = () => { D.keys.delete('KeyW'); D.keys.delete('ShiftLeft'); };
  const yawTo = (wx, wz) => { const h = head(); return Math.atan2(-(wx - h.x), -(wz - h.z)); };
  const lookAt = (p) => {
    const h = head(); const dx = p.x - h.x, dy = p.y - h.y, dz = p.z - h.z;
    D.look.yaw = Math.atan2(-dx, -dz); D.look.pitch = Math.atan2(dy, Math.hypot(dx, dz)); D.applyLook();
  };
  // walk along AR.path (world points); returns true when at the end
  const walk = (run) => {
    if (!AR.path || AR.pi >= AR.path.length) { stop(); return true; }
    const p = AR.path[AR.pi], h = head();
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (d < (AR.pi === AR.path.length - 1 ? 0.25 : 0.4)) { AR.pi++; return walk(run); }
    D.look.yaw = yawTo(p.x, p.z); D.look.pitch = 0; D.applyLook();
    D.keys.add('KeyW'); if (run) D.keys.add('ShiftLeft'); else D.keys.delete('ShiftLeft');
    const now = AR.gt * 1000;
    if (Math.hypot(h.x - AR.lastMove.x, h.z - AR.lastMove.z) > 0.25) { AR.lastMove = { t: now, x: h.x, z: h.z }; }
    else if (now - AR.lastMove.t > 4000) {                    // no progress for 4 s: note it and re-path once
      AR.stuck.push({ room: AR.cur && AR.cur.slot, st: AR.st, x: +h.x.toFixed(2), z: +h.z.toFixed(2), to: [+p.x.toFixed(2), +p.z.toFixed(2)] });
      say('stuck walking at ' + h.x.toFixed(2) + ',' + h.z.toFixed(2));
      AR.lastMove = { t: now, x: h.x, z: h.z };
      AR.repath = true;
    }
    return false;
  };
  // a path in room R from your position to room-local (lx, lz); world points out
  const pathTo = (R, lx, lz, extra) => {
    const h = head();
    const sx = D.rLX(R, h.x), sz = D.rLZ(R, h.z);
    let P = null; try { P = D.findPath(R, sx, sz, lx, lz); } catch (e) { say('findPath threw ' + e.message); }
    const pts = (P || [{ x: lx, y: lz }]).map((q) => new T.Vector3(D.rWX(R, q.x), 0, D.rWZ(R, q.y)));
    if (!P) say('no nav path in slot ' + R.slot + ' (straight line)');
    if (extra) pts.push(...extra);
    AR.path = pts; AR.pi = 0; AR.lastMove = { t: AR.gt * 1000, x: h.x, z: h.z };
  };
  const exitPts = (R) => {   // room-local: a point inside in front of the exit leaf, a point through it (world)
    const E = D.exitLeaf(R);
    const alongZ = Math.abs(Math.abs(E.z) - R.d / 2) < Math.abs(Math.abs(E.x) - R.w / 2);
    const sx = alongZ ? 0 : Math.sign(E.x), sz = alongZ ? Math.sign(E.z) : 0;
    return { inX: E.x - sx * 0.9, inZ: E.z - sz * 0.9, out: new T.Vector3(D.rWX(R, E.x + sx * 1.0), 0, D.rWZ(R, E.z + sz * 1.0)), mid: new T.Vector3(D.rWX(R, E.x + sx * 0.2), 0, D.rWZ(R, E.z + sz * 0.2)) };
  };
  const headOf = (e, out) => {
    const hb = (e.hit || []).find((h) => h.part === 'head');
    if (hb && e.B[hb.b]) { const b = e.B[hb.b]; b.updateMatrixWorld(true); out.set((hb.a[0] + hb.c[0]) / 2, (hb.a[1] + hb.c[1]) / 2, (hb.a[2] + hb.c[2]) / 2).applyMatrix4(b.matrixWorld); return out; }
    return e.B.head.getWorldPosition(out);
  };
  const finite = (o) => o && isFinite(o.x) && isFinite(o.y) && isFinite(o.z);
  const nanCheck = () => {
    const where = AR.cur ? AR.cur.slot : -1;
    if (!finite(D.rig.position)) AR.nan.push({ what: 'rig', room: where });
    for (const e of D.ENEMY.list) { if (!finite(e.root.position) || !isFinite(e.pos.x) || !isFinite(e.pos.y)) { if (!e._nanSeen) { e._nanSeen = 1; AR.nan.push({ what: 'enemy', room: e.room && e.room.slot }); } } }
    for (const p of D.props) { if (p.root && !finite(p.root.position) && !p._nanSeen) { p._nanSeen = 1; AR.nan.push({ what: 'prop ' + (p.name || (p.item && p.item.type) || '?'), room: where }); } }
  };
  const roomRec = (R) => {
    const m = D.roomMem(R), plan = m && m.plan;
    return { slot: R.slot, kind: R.kind, type: R.plan ? R.plan.type : (R.type || '?'), number: R.plan ? R.plan.number : '', men: plan ? plan.dead.length : 0,
      t0: AR.gt * 1000, shots0: D.loop.run.shots, kills0: D.loop.run.kills, tEnd: 0, cleared: false, kills: 0, shots: 0, fallbacks: 0, ticks: 0, tickMs: 0, tickMax: 0, realMs: null, progBad: 0, programs: 0, fightS: 0 };
  };
  // what one round of fireGun would do right now: its origin and direction (as fireGun builds them), the first Rapier hit, the man test
  const fireDiag = (g, e) => {
    const root = g.prop.root; root.updateMatrixWorld(true);
    const q = root.getWorldQuaternion(new T.Quaternion()), o = g.wr.chamber.clone().applyMatrix4(root.matrixWorld), d = g.def;
    const fd = new T.Vector3(d.zero ? (g.sightX || 0) / d.zero : 0, d.zero ? (g.sightY ?? d.eye[1]) / d.zero : 0, -1).normalize().applyQuaternion(q);
    const W = D.getWorld();
    let hit = null;
    try { const r = D.rapierRay(o, fd); const h = W.castRayAndGetNormal(r, 50, true, undefined, D.RAY_GROUPS);
      if (h) { const col = W.getCollider(h.collider); const info = D.colliderInfo.get(h.collider.handle !== undefined ? h.collider.handle : h.collider) || D.colliderInfo.get(col && col.handle);
        hit = { toi: +(h.timeOfImpact ?? h.toi).toFixed(3), info: info ? { kind: info.kind, slot: info.room && info.room.slot } : null, body: col && col.parent() ? col.parent().bodyType() : null, group: col ? col.collisionGroups() : null }; } } catch (err) { hit = 'err ' + err.message; }
    const eh = D.enemyRayTest(o, fd, 5);
    const hp = head(); let inBox = 0; for (const c of D.colliders) { if (hp.y >= c.top) continue; const q = hp.clone(); const k = D.pushOutOf(c, q, 0.2); if (k > 0.01) inBox = Math.max(inBox, +k.toFixed(3)); }
    const eye = D.getWorld().castRayAndGetNormal(D.rapierRay(hp, fd), 50, true, undefined, D.RAY_GROUPS);
    const hv = headOf(e, new T.Vector3());
    return { headInWalkBox: inBox, eyeRayToi: eye ? +(eye.timeOfImpact ?? eye.toi).toFixed(3) : null, rapier: hit, man: eh ? { him: eh.e === e, part: eh.h.part, t: +eh.t.toFixed(3) } : null, angleToHeadDeg: +(fd.angleTo(hv.clone().sub(o)) * 57.3).toFixed(1), canFire: D.canFire(g), gs: { chambered: g.chambered, slideLocked: g.slideLocked, rack: !!g.rack, rackAuto: g.rackAuto, slideHold: g.slideHold, slideOff: +(g.slideOff || 0).toFixed(4), mode: g.mode, free: !!(g.free && g.free.primary), mag: !!g.mag, task: !!(g.task || D.deskHand.task), reloading: !!g.reloading } };
  };
  const curPlan = (R) => { const m = D.roomMem(R); return m && m.plan; };
  const gun = () => D.gunOf(D.deskHand);

  AR.step = function () {
    if (AR.done) return;
    const now = AR.gt * 1000;
    if ((performance.now() - AR.t0) > cfg.timeout) { AR.fail = 'timeout in state ' + AR.st; AR.done = true; stop(); return; }
    if (AR.ticks % 30 === 0) nanCheck();
    { const g = gun();                                                        // watch the chamber: with unlimited ammo it should never run dry
      if (g) { const ch = !!g.chambered, mr = g.mag ? g.mag.item.rounds : -1;
        if (AR.chPrev && !ch && !g.task) { setTimeout(() => { if (!g.chambered && !g.task) { AR.notes.push('chamber empty after a shot: mag ' + (g.mag ? g.mag.item.rounds : 'none') + ' (was ' + AR.mrPrev + '), ammo mod ' + D.MOD.ammo + ', state ' + AR.st + ', slot ' + (R && R.slot)); } }, 400); }
        AR.chPrev = ch; AR.mrPrev = mr; } }
    const R = D.stream.current;
    switch (AR.st) {
      case 'grab': {
        if (!R || R.kind !== 'safe' || el() < 2) return;
        const want = cfg.gun;
        const ps = D.props.filter((p) => p.item && p.item.kind === 'gun' && p.item.type === want);
        if (!ps.length) { if (el() > 30) { AR.fail = 'no ' + want + ' in the safe room'; AR.done = true; } return; }
        const h = head(); ps.sort((a, b) => a.root.position.distanceTo(h) - b.root.position.distanceTo(h));
        D.itemGrab(D.deskHand, ps[0]);
        if (!gun()) { if (el() > 10) { AR.fail = 'could not take the ' + want; AR.done = true; } return; }
        D.MOD.ammo = true; D.MOD.god = true; try { D.applyMenu && D.applyMenu(); } catch (e) { /* mods only */ }
        say('took ' + gun().type);
        AR.cur = roomRec(R);
        setSt('toDoor');
        return;
      }
      case 'toDoor': {
        D.deskInput.fire = false; D.deskInput.ads = false;
        if (!AR.path || AR.repath) { AR.repath = false; const X = exitPts(R); pathTo(R, X.inX, X.inZ); AR.exitR = R; }
        if (walk(true)) setSt('open');
        else if (el() > 90) { AR.fail = 'could not reach the exit door of slot ' + R.slot; AR.done = true; stop(); }
        return;
      }
      case 'open': {
        stop();
        const door = AR.exitR.door, nxt = D.stream.rooms.get(AR.exitR.slot + 1);
        if (!door) { AR.fail = 'slot ' + AR.exitR.slot + ' has no exit door'; AR.done = true; return; }
        const X = exitPts(AR.exitR); lookAt(new T.Vector3(X.mid.x, D.camera.getWorldPosition(v).y, X.mid.z));
        if (door.mode === 'locked' || !nxt || !nxt.active) { if (el() > 120) { AR.fail = 'next room (slot ' + (AR.exitR.slot + 1) + ') never became active'; AR.done = true; } return; }
        if (Math.abs(door.angle) > 0.7) { AR.path = [X.mid, X.out]; AR.pi = 0; AR.lastMove = { t: now, x: head().x, z: head().z }; setSt('through'); return; }
        if (now - AR.pressT > 2500 && Math.abs(door.angle) < 0.4) { D.doorPress(door, null, 'push'); AR.pressT = now; say('door press, angle ' + door.angle.toFixed(2)); }
        if (el() > 40) { AR.fail = 'door of slot ' + AR.exitR.slot + ' did not open (angle ' + door.angle.toFixed(2) + ')'; AR.done = true; }
        return;
      }
      case 'through': {
        const done = walk(false);
        if (R && R.slot === AR.exitR.slot + 1 && done) {
          if (AR.cur) { AR.cur.tEnd = AR.cur.tEnd || now; AR.rooms.push(AR.cur); }
          AR.cur = roomRec(R); AR.realPend = 1;
          AR.path = null; setSt(R.kind === 'stair' ? 'stairs' : 'fight');
          return;
        }
        if (done && el() > 6) { AR.fail = 'walked through the door of slot ' + AR.exitR.slot + ' but the current room is ' + (R && R.slot); AR.done = true; }
        if (el() > 30) { AR.fail = 'could not walk through the door of slot ' + AR.exitR.slot; AR.done = true; stop(); }
        return;
      }
      case 'stairs': {                                     // a U-turn / switchback well: walk its own route (corridor, flights, half landing)
        D.deskInput.fire = false; D.deskInput.ads = false;
        if (!AR.path) {
          const S = R.stair, X = (q) => S.xp - S.side * q;
          let pts;
          if (S && S.u) {
            const zF = (-S.d / 2 + S.zF) / 2, zN = (S.zN + S.zc) / 2, zC = (S.zc + S.d / 2) / 2, sP = -S.pad / 2, sL = S.run + S.mid / 2;
            const up = [[X(sP), zC], [X(sP), zF], [X(sL), zF], [X(sL), zN], [X(sP), zN], [X(sP), zC], [R.exitX, zC]];
            pts = S.up ? up : [[X(sP), zC], [X(sP), zN], [X(sL), zN], [X(sL), zF], [X(sP), zF], [X(sP), zC], [R.exitX, zC]];
          } else if (S) {                                    // straight switchback (CONFIG.stairs.uturn off): flight 1 across, landing, flight 2 back
            const zL = S.zs * S.uLo, zH = -zL, sP = -S.pad / 2, sL = S.run + S.mid / 2, E = D.exitLeaf(R);
            pts = [[X(sP), zL], [X(sL), zL], [X(sL), zH], [X(sP), zH], [E.x, E.z - Math.sign(E.z) * 0.9]];
          }
          if (!pts) { setSt('toDoor'); return; }
          AR.path = pts.map((q) => new T.Vector3(D.rWX(R, q[0]), 0, D.rWZ(R, q[1]))); AR.pi = 0; AR.lastMove = { t: now, x: head().x, z: head().z };
        }
        if (walk(false)) { AR.exitR = R; setSt('open'); }
        else if (el() > 120) { AR.fail = 'could not walk the stairwell in slot ' + R.slot; AR.done = true; stop(); }
        return;
      }
      case 'fight': {
        const plan = curPlan(R), cur = AR.cur;
        const alive = D.ENEMY.list.filter((e) => e.room === R && !e.dead && !e.net && !e.puppet);
        if (plan && plan.cleared) {
          stop(); D.deskInput.fire = false; D.deskInput.ads = false;
          cur.cleared = true; cur.tEnd = now; cur.fightS = el(); if (cur.men > 0) AR.combat++;   // an empty room after a stairwell does not count
          cur.fired = D.loop.run.shots - cur.shots0; cur.killed = D.loop.run.kills - cur.kills0;
          cur.ends = D.ENEMY.list.filter((x) => x.room === R).map((x) => x.surr ? 'surrendered' : x.downed ? 'down' : x.dead ? 'dead' : 'alive').join(',');
          cur.aliveAfter = D.ENEMY.list.filter((x) => x.room === R && !x.dead).map((x) => ({ state: x.state, net: !!x.net, puppet: !!x.puppet, mine3p: !!x.mine3p, rf: !!x.rf, idx: x.idx, surr: !!x.surr, hp: x.hp }));
          if (cur.aliveAfter.length) say('cleared with men alive: ' + JSON.stringify(cur.aliveAfter));
          say('slot ' + R.slot + ' cleared in ' + cur.fightS.toFixed(1) + ' s');
          if (AR.combat >= cfg.rooms) { AR.rooms.push(cur); AR.cur = null; AR.done = true; return; }
          AR.path = null; setSt('toDoor'); return;
        }
        if (!plan && el() > 5) { say('slot ' + R.slot + ' has no plan (no men)'); AR.path = null; setSt('toDoor'); return; }
        if (!alive.length) { stop(); D.deskInput.fire = false; if (el() > 120) { AR.fail = 'slot ' + R.slot + ' never cleared (no man alive, plan.dead ' + JSON.stringify(plan && plan.dead) + ')'; AR.done = true; } return; }
        // target: the nearest alive man
        const h = head();
        if (!AR.tgt || AR.tgt.dead || !alive.includes(AR.tgt)) {
          alive.sort((a, b) => headOf(a, v).distanceTo(h) - headOf(b, v2).distanceTo(h));
          AR.tgt = alive[0]; AR.tgtT = now; AR.tgtHitT = now; AR.tgtHp = AR.tgt.hp; AR.path = null; AR.tgtShots = D.loop.run.shots;
        }
        const e = AR.tgt; headOf(e, v);
        if (e.hp < AR.tgtHp) { AR.tgtHp = e.hp; AR.tgtHitT = now; }
        lookAt(v); D.deskInput.ads = true;
        { const g = gun();                                         // a player racks an empty chamber (F) and reloads an empty magazine (R)
          if (!g || g.task || D.canFire(g) || AR.noFireT === undefined) AR.noFireT = now;   // only a gun that stays unable to fire for 0.6 s (not the slide cycling after a shot)
          if (g && !g.task && now - AR.noFireT > 600 && now - (AR.fixT || 0) > 1500) {
            AR.fixT = now;
            if (!g.chambered && g.mag && g.mag.item.rounds > 0) { D.deskRack(); cur.racks = (cur.racks || 0) + 1; say('rack (chamber empty, magazine ' + g.mag.item.rounds + ')'); }
            else { D.deskReload(); cur.reloads = (cur.reloads || 0) + 1; say('reload (magazine ' + (g.mag ? g.mag.item.rounds : 'none') + ')'); }
          } }
        // can the round reach him? the game's own trace says who is first along the line
        dir.copy(v).sub(h); const dist = dir.length(); dir.normalize();
        const hitE = D.enemyRayTest(h, dir, dist + 0.5);
        // fire: pulse the trigger (semi auto)
        const tick = AR.ticks;
        D.deskInput.fire = (tick % 8) < 2;
        if ((tick % 8) === 0) cur.shots++;
        // no damage for a while: move toward him along the nav path
        const losHit = D.getWorld().castRayAndGetNormal(D.rapierRay(h, dir), dist, true, undefined, D.RAY_GROUPS);
        const los = !losHit || (losHit.timeOfImpact ?? losHit.toi) > dist - 0.25;   // nothing static / a prop / a leaf between your eye and his head
        if (!los || now - AR.tgtHitT > 3000) {
          if (!AR.path || AR.repath || now - (AR.pathT || 0) > 2000) { AR.repath = false; AR.pathT = now; pathTo(R, e.pos.x, e.pos.y); }
          // walk but keep looking at him between steps: walk() turns you; look back for the shot next frame
          walk(false); lookAt(v);
        } else stop();
        if (now - AR.tgtT > 30000 && !los && now - AR.tgtT < 75000) return;   // still walking round to see him
        if (now - AR.tgtT > 30000) {                                  // the fire path never got him: kill him with a direct round (reported)
          const g = gun(); const ch = g ? g.wr.chamber.clone().applyMatrix4(g.prop.root.matrixWorld) : null, mz = g ? g.wr.muzzle.clone().applyMatrix4(g.prop.root.matrixWorld) : null;
          AR.unkillable.push({ room: R.slot, los, hp: e.hp, d: +dist.toFixed(2), firstAlong: hitE ? (hitE.e === e ? 'him' : 'another man') : 'nothing',
            chamberToHead: ch ? +ch.distanceTo(v).toFixed(2) : null, muzzleToHead: mz ? +mz.distanceTo(v).toFixed(2) : null, eyeToChamber: ch ? +ch.distanceTo(h).toFixed(2) : null,
            groupVis: e.room.group.visible, rootVis: e.root.visible, active: e.room.active, state: e.state, ads: D.deskInput.ads, fired: D.loop.run.shots - AR.tgtShots, diag: g ? fireDiag(g, e) : null });
          say('fallback traceBullet on man in slot ' + R.slot);
          for (let i = 0; i < 6 && !e.dead; i++) { headOf(e, v); dir.copy(v).sub(h).normalize(); D.traceBullet(h.clone(), dir, D.WEAPON_DEFS.akmn, 'akmn'); }
          cur.fallbacks++; AR.fallbacks++; AR.tgtT = now; AR.tgtHitT = now;
          if (!e.dead) { AR.fail = 'man in slot ' + R.slot + ' could not be killed even by a direct trace'; AR.done = true; }
        }
        return;
      }
    }
  };
  AR.killCount = () => D.ENEMY.list.filter((e) => e.dead).length;
  // wrap the frame: bot step, then the game's frame; renderer.render stubbed unless a real frame is wanted
  const rend = D.renderer, origRender = rend.render.bind(rend);
  rend.render = function (s, c) { if (AR.realTick) return origRender(s, c); };
  rend.setAnimationLoop((t, f) => {
    if (AR.lastT) AR.gt += Math.min((t - AR.lastT) / 1000, 0.1); AR.lastT = t;
    try { AR.step(); } catch (err) { AR.notes.push('bot error: ' + (err && err.stack || err)); AR.fail = 'bot error ' + err.message; AR.done = true; }
    if (AR.realPend > 0 && AR.cur) { AR.realTick = true; AR.realPend--; }
    const a = performance.now();
    D.tickSafe(t, f);
    const ms = performance.now() - a;
    if (AR.realTick) {
      AR.realTick = false;
      if (AR.cur) {
        AR.cur.realMs = +ms.toFixed(0);
        const gl = rend.getContext(); let bad = 0, n = 0;
        for (const p of rend.info.programs || []) { n++; try { if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) { bad++; AR.programsBad.push({ room: AR.cur.slot, name: p.name, log: gl.getProgramInfoLog(p.program) }); } } catch (e) { /* lost */ } }
        AR.cur.programs = n; AR.cur.progBad = bad;
      }
    } else if (AR.cur) { AR.cur.ticks++; AR.cur.tickMs += ms; AR.cur.tickMax = Math.max(AR.cur.tickMax, ms); }
    AR.ticks++;
  });
  return true;
}

(async () => {
  const port = +arg('port', 0) || await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const cleanup = () => { try { srv.kill(); } catch (e) { /* gone */ } };
  process.on('exit', cleanup);
  await new Promise((r) => setTimeout(r, 800));
  const url = `http://127.0.0.1:${port}/cqc/index.html?dev&lite=on&lowmem=on${EXTRA}`;
  const errs = { page: [], console: [], http: [] };
  const browser = await chromium.launch({ headless: !arg('show', false), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.page.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.console.push(m.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.http.push(r.status() + ' ' + r.url()); });
  page.on('crash', () => errs.page.push('PAGE CRASHED (renderer died: out of memory?)'));
  const t0 = Date.now();
  const tsec = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  console.log(`[autorun] ${url}`);
  let report = null, exitCode = 0;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__cqcDev && window.__cqcDev.isReady && window.__cqcDev.isReady(), null, { timeout: 600000, polling: 1000 });
    console.log(`[autorun] ${tsec()} game loaded`);
    await page.click('#playPC');
    await page.waitForTimeout(500);
    const solo = await page.$('[data-play="solo"]');
    if (solo && await solo.isVisible()) await solo.click();
    await page.waitForFunction(() => window.__cqcDev.isStarted(), null, { timeout: 120000 });
    console.log(`[autorun] ${tsec()} started`);
    await page.evaluate(installBot, { rooms: ROOMS, gun: arg('gun', 'akmn'), timeout: TIMEOUT });
    let last = '';
    for (;;) {
      const s = await page.evaluate(() => { const A = window.__AR; const D = window.__cqcDev; const c = D.stream.current; return { st: A.st, done: A.done, fail: A.fail, combat: A.combat, slot: c && c.slot, kind: c && c.kind, ticks: A.ticks, alive: D.ENEMY.list.filter((e) => c && e.room === c && !e.dead).length, last: A.log[A.log.length - 1] || '' }; });
      const line = `${s.st} slot ${s.slot} (${s.kind}) cleared ${s.combat}/${ROOMS} alive ${s.alive} ticks ${s.ticks} | ${s.last}`;
      if (line !== last) { console.log(`[autorun] ${tsec()} ${line}`); last = line; }
      if (s.done) break;
      if (Date.now() - t0 > TIMEOUT + 900000) throw new Error('harness timeout');
      await page.waitForTimeout(2000);
    }
    report = await page.evaluate(() => { const A = window.__AR, D = window.__cqcDev; if (A.cur && !A.rooms.includes(A.cur)) A.rooms.push(A.cur); return { fail: A.fail, rooms: A.rooms, nan: A.nan, stuck: A.stuck, unkillable: A.unkillable, programsBad: A.programsBad, notes: A.notes, frameErr: D.frameErr().list.slice(), log: A.log.slice(-60), fallbacks: A.fallbacks, hp: D.playerState.hp }; });
  } catch (e) {
    report = { fail: 'harness: ' + (e && e.message || e), rooms: [], nan: [], stuck: [], unkillable: [], programsBad: [], notes: [], frameErr: [], log: [] };
    try { Object.assign(report, await page.evaluate(() => ({ log: window.__AR ? window.__AR.log.slice(-60) : [], frameErr: window.__cqcDev ? window.__cqcDev.frameErr().list.slice() : [] }))); } catch (e2) { /* page gone */ }
  }
  await browser.close().catch(() => {});
  cleanup();

  // ---------------------------------------------------------------- report
  const R = report, fails = [];
  console.log('\n===== CQC autorun report (' + tsec() + ') =====');
  for (const r of R.rooms) {
    const avg = r.ticks ? (r.tickMs / r.ticks).toFixed(1) : '-';
    console.log(`slot ${String(r.slot).padStart(2)} ${String(r.kind).padEnd(6)} ${String(r.type).padEnd(10)} ${String(r.number || '').padEnd(10)} men ${r.men} ` +
      `${r.kind === 'safe' || r.kind === 'stair' ? 'pass' : (r.cleared ? 'CLEARED in ' + r.fightS.toFixed(1) + ' s' : 'NOT CLEARED')} fired ${r.fired ?? '-'} kills ${r.killed ?? '-'} [${r.ends || ''}] racks ${r.racks || 0} reloads ${r.reloads || 0} fallbacks ${r.fallbacks} ` +
      `tick avg ${avg} ms max ${r.tickMax.toFixed(0)} ms real frame ${r.realMs == null ? '-' : r.realMs + ' ms'} programs ${r.programs} bad ${r.progBad}`);
  }
  const combat = R.rooms.filter((r) => r.cleared).length;
  if (R.fail) fails.push('run: ' + R.fail);
  if (combat < ROOMS) fails.push(`cleared ${combat} of ${ROOMS} rooms`);
  if (errs.page.length) fails.push('page errors: ' + errs.page.length);
  if (R.frameErr.length) fails.push('frame errors: ' + R.frameErr.length);
  if (R.programsBad.length) fails.push('unlinked programs: ' + R.programsBad.length);
  if (errs.http.length) fails.push('HTTP errors: ' + errs.http.length);
  if (R.nan.length) fails.push('NaN positions: ' + R.nan.length);
  if (R.unkillable.length) fails.push('men the fire path could not kill: ' + R.unkillable.length);
  if (errs.console.length) fails.push('console errors: ' + errs.console.length);
  const show = (k, a) => { if (a && a.length) { console.log(`-- ${k} (${a.length})`); for (const x of a.slice(0, 15)) console.log('   ' + (typeof x === 'string' ? x : JSON.stringify(x))); } };
  show('page errors', errs.page); show('frame errors', R.frameErr); show('console errors', [...new Set(errs.console)]); show('HTTP', [...new Set(errs.http)]);
  show('unlinked programs', R.programsBad); show('NaN', R.nan); show('stuck walking (re-pathed)', R.stuck); show('fallback kills', R.unkillable); show('notes', R.notes);
  if (fails.length || arg('log', false)) show('last log lines', R.log);
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
  exitCode = fails.length ? 1 : 0;
  process.exit(exitCode);
})();
