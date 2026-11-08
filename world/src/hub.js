// The apartment is the hub: a simple computer in the library and the front door (floor one,
// end of the hallway). Both show the same touch screen: pick where the door goes, then GO.
// Computer: aim the centre dot at a screen (within 3 m) and click or press E. Headset: point a
// controller at it and pull the trigger.
import * as THREE from 'three';

export const DESTS = [
  { id: 'interstate', name: 'Interstate', note: 'Highway driving', url: '../interstate/index.html' },
  { id: 'cqc', name: 'CQC Loop', note: 'Close quarters', url: '../cqc/index.html' },
];
const KEY = 'world.door.dest';

export function createHub({ scene, camera, renderer, rig, surf, view, screenPose }) {
  const state = { dest: localStorage.getItem(KEY) || 'interstate', leaving: false };
  if (!DESTS.some((d) => d.id === state.dest)) state.dest = DESTS[0].id;
  const panels = [];

  // ---- a canvas screen -------------------------------------------------------------------------
  function panel({ x, y, z, face, w, h, px, title, extra }) {
    const cv = document.createElement('canvas'); cv.width = px; cv.height = Math.round(px * h / w);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z); mesh.rotation.y = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
    scene.add(mesh);
    const P = { mesh, cv, ctx: cv.getContext('2d'), tex, title, extra, hover: null, buttons: [] };
    panels.push(P); draw(P);
    return P;
  }
  function draw(P) {
    const { ctx, cv } = P, W = cv.width, H = cv.height, k = W / 1024;
    ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(70,90,120,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e9e4da'; ctx.font = `600 ${44 * k}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(P.title, 48 * k, 62 * k);
    ctx.fillStyle = '#8f99a6'; ctx.font = `${24 * k}px system-ui, sans-serif`;
    ctx.fillText('Front door goes to', 48 * k, 118 * k);
    P.buttons = [];
    let yy = 150 * k;
    const rowH = (P.extra ? 92 : 104) * k;
    for (const d of DESTS) {
      const r = [40 * k, yy, W - 80 * k, rowH - 14 * k], on = d.id === state.dest, hv = P.hover === 'd:' + d.id;
      ctx.fillStyle = on ? '#2c4e78' : hv ? '#232a33' : '#171c22'; round(ctx, ...r, 14 * k); ctx.fill();
      ctx.strokeStyle = on ? '#6fa3e0' : '#2b323b'; ctx.lineWidth = 3 * k; ctx.stroke();
      ctx.fillStyle = '#f2efe9'; ctx.font = `600 ${36 * k}px system-ui, sans-serif`; ctx.fillText(d.name, r[0] + 30 * k, r[1] + r[3] / 2 - 2 * k);
      ctx.fillStyle = '#9aa4b0'; ctx.font = `${24 * k}px system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.fillText(d.note, r[0] + r[2] - 30 * k, r[1] + r[3] / 2); ctx.textAlign = 'left';
      P.buttons.push({ id: 'd:' + d.id, r }); yy += rowH;
    }
    const gr = [40 * k, yy + 6 * k, W - 80 * k, 110 * k], gh = P.hover === 'go';
    ctx.fillStyle = state.leaving ? '#3f6b3f' : gh ? '#3d8a4f' : '#2f6f3f'; round(ctx, ...gr, 16 * k); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${52 * k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(state.leaving ? 'Opening…' : 'GO  ›  ' + DESTS.find((d) => d.id === state.dest).name, W / 2, gr[1] + gr[3] / 2);
    ctx.textAlign = 'left';
    P.buttons.push({ id: 'go', r: gr });
    if (P.extra) {
      yy = gr[1] + gr[3] + 22 * k;
      const opts = [['sun', 'Time of day: ' + (view ? view.sunName : '—')], ['wet', 'Terrace: ' + (surf.wet > 0.6 ? 'wet' : surf.wet > 0.1 ? 'damp' : 'dry')], ['fps', 'Frame meter: ' + (document.getElementById('fps').hidden ? 'off' : 'on')]];
      const bw = (W - 80 * k - 2 * 16 * k) / 3;
      opts.forEach(([id, label], i) => {
        const r = [40 * k + i * (bw + 16 * k), yy, bw, 76 * k], hv = P.hover === id;
        ctx.fillStyle = hv ? '#2a323c' : '#1b2027'; round(ctx, ...r, 12 * k); ctx.fill();
        ctx.fillStyle = '#d9d4cb'; ctx.font = `${24 * k}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(label, r[0] + bw / 2, r[1] + r[3] / 2); ctx.textAlign = 'left';
        P.buttons.push({ id, r });
      });
    }
    P.tex.needsUpdate = true;
  }
  function round(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  const redraw = () => panels.forEach(draw);

  // the library computer (furniture.js places the monitor) and the front door's panel: wall-hung
  // beside the hallway's end door (floor one, x 3.46, door z 12.6..13.5)
  if (screenPose) panel({ ...screenPose, px: 1024, title: 'Apartment', extra: true });
  panel({ x: 3.475, y: 1.38, z: 12.15, face: '+x', w: 0.4, h: 0.32, px: 800, title: 'Front door' });
  {   // bronze bezel round the door panel
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.35, 0.43), new THREE.MeshStandardMaterial({ color: '#6b5236', metalness: 1, roughness: 0.35 }));
    b.position.set(3.466, 1.38, 12.15); scene.add(b);
  }

  // ---- actions ----------------------------------------------------------------------------------
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .5s;z-index:20';
  document.body.appendChild(fade);
  async function press(id) {
    if (state.leaving) return;
    if (id.startsWith('d:')) { state.dest = id.slice(2); localStorage.setItem(KEY, state.dest); }
    else if (id === 'sun' && view) view.nextSun();
    else if (id === 'wet') { const st = [0, 0.45, 0.8, 1]; const i = st.findIndex((v) => Math.abs(v - surf.wet) < 0.01); surf.setWet(st[(i + 1) % st.length]); }
    else if (id === 'fps') { const f = document.getElementById('fps'); f.hidden = !f.hidden; }
    else if (id === 'go') {
      state.leaving = true; redraw();
      fade.style.opacity = '1';
      const url = DESTS.find((d) => d.id === state.dest).url;
      const s = renderer.xr.getSession();                     // the next page asks for VR again
      if (s) await s.end().catch(() => {});
      setTimeout(() => { location.href = url; }, 550);
      return;
    }
    redraw();
  }
  addEventListener('pageshow', (e) => { if (e.persisted) { state.leaving = false; fade.style.opacity = '0'; redraw(); } });

  // ---- pointing ----------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(); ray.far = 3.2;
  const meshes = () => panels.map((p) => p.mesh);
  function hit(origin, dir) {
    ray.set(origin, dir);
    const h = ray.intersectObjects(meshes(), false)[0]; if (!h) return null;
    const P = panels.find((p) => p.mesh === h.object), px = h.uv.x * P.cv.width, py = (1 - h.uv.y) * P.cv.height;
    const b = P.buttons.find((b) => px >= b.r[0] && px <= b.r[0] + b.r[2] && py >= b.r[1] && py <= b.r[1] + b.r[3]);
    return { P, id: b ? b.id : null, point: h.point, dist: h.distance };
  }
  function setHover(hs) {
    for (const P of panels) { const id = (hs.find((h) => h && h.P === P) || {}).id || null; if (P.hover !== id) { P.hover = id; draw(P); } }
  }
  // computer: the centre dot
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 2px #000;pointer-events:none;display:none;z-index:5';
  document.body.appendChild(dot);
  let deskHit = null;
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const deskPress = () => { if (deskHit && deskHit.id) press(deskHit.id); };
  addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement && !renderer.xr.isPresenting) deskPress(); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !renderer.xr.isPresenting) deskPress(); });

  // headset: controller rays, a short laser when one points at a screen
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.8 }));
    line.visible = false; c.add(line); rig.add(c);
    const C = { c, line, hit: null };
    c.addEventListener('selectstart', () => { if (C.hit && C.hit.id) press(C.hit.id); });
    return C;
  });

  function update() {
    if (renderer.xr.isPresenting) {
      dot.style.display = 'none';
      const hs = ctrls.map((C) => {
        C.c.getWorldPosition(o); d.set(0, 0, -1).applyQuaternion(C.c.getWorldQuaternion(new THREE.Quaternion()));
        C.hit = hit(o, d);
        C.line.visible = !!C.hit; if (C.hit) C.line.scale.z = C.hit.dist;
        return C.hit;
      });
      setHover(hs);
    } else {
      const locked = !!document.pointerLockElement;
      camera.getWorldPosition(o); camera.getWorldDirection(d);
      deskHit = locked ? hit(o, d) : null;
      dot.style.display = locked ? 'block' : 'none';
      dot.style.background = deskHit && deskHit.id ? '#9fd0ff' : 'rgba(255,255,255,.75)';
      setHover([deskHit]);
    }
  }
  return { update, state, press, panels };
}
