// The view through the glass: real Manhattan, baked offline (bake/, tools/nyc/) into cube
// panoramas at eye points around the apartment. Each panorama face is drawn as a mesh pushed
// out to the baked distance, so nearby towers move against the far city as you walk (true
// parallax, not a flat picture); walking between rooms fades to the nearest bake point.
// The sky is drawn live with the same colours the bake used, so the skyline edges blend.
import * as THREE from 'three';

const BASE = './city/';
const FAR = 60000;                      // sky texels and the horizon
const LOGMAX = Math.log(200000 / 5);

const CITY_VS = /* glsl */`
uniform sampler2D uDist; uniform vec3 uO, uD, uX, uY; uniform float uN;
varying vec2 vUv;
void main(){
  vUv = uv;
  // distance at this grid corner (decoded from the log encoding; 0 = sky)
  float e = texture2D(uDist, uv).r;
  float d = e > 0.0 ? 5.0 * exp(e * ${LOGMAX.toFixed(6)}) : ${FAR.toFixed(1)};
  vec3 dir = normalize(uD + (uv.x * 2.0 - 1.0) * uX + (uv.y * 2.0 - 1.0) * uY);
  vec3 p = uO + dir * d;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const CITY_FS = /* glsl */`
uniform sampler2D uMap, uMapB; uniform float uOp, uMix; uniform vec3 uGain;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (uMix > 0.0) c = mix(c, texture2D(uMapB, vUv), uMix);   // time of day: the next sun's bake
  gl_FragColor = vec4(c.rgb * uGain, c.a * uOp);       // baked already tone-mapped: only the output encoding (uGain: daylight level for the room probes)
  #include <colorspace_fragment>
}`;

// live sky: colour by height above the horizon, fitted to apartment-21's sky (measured at nine
// heights through the game's glass and tone map); linear, before exposure
const SKY_H = [0.000, 0.017, 0.043, 0.079, 0.129, 0.198, 0.277, 0.351, 0.419, 0.471, 0.700, 1.000];
const SKY_C = [[0.440, 0.560, 0.670], [0.410, 0.530, 0.664], [0.400, 0.526, 0.650], [0.392, 0.522, 0.648], [0.3312, 0.5038, 0.6823], [0.2423, 0.4501, 0.6804], [0.1763, 0.3840, 0.6734], [0.1194, 0.3277, 0.6408], [0.0773, 0.2643, 0.6137], [0.0508, 0.2176, 0.5610], [0.0305, 0.1850, 0.5330], [0.0203, 0.1567, 0.4937]];
// uGain: one shared uniform, 1 on screen; the room probes capture the outside at daylight level
const GAIN = { value: new THREE.Vector3(1, 1, 1) };
function skyMaterial(look, sun) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uGain: GAIN, uSun: { value: sun }, uHaze: { value: new THREE.Color(look.haze) }, uTint: { value: new THREE.Color(look.sunTint) },
      uSH: { value: SKY_H }, uSC: { value: SKY_C.map((c) => new THREE.Vector3(...c)) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uHaze, uTint, uGain; uniform float uSH[12]; uniform vec3 uSC[12]; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = uSC[0];
        for (int i = 1; i < 12; i++) { if (h >= uSH[i - 1]) c = mix(uSC[i - 1], uSC[i], clamp((h - uSH[i - 1]) / (uSH[i] - uSH[i - 1]), 0.0, 1.0)); }
        c = mix(c, uHaze, smoothstep(0.02, -0.12, d.y));
        float s = max(dot(d, uSun), 0.0);
        c += uTint * (pow(s, 12.0) * 0.18 + pow(s, 900.0) * 40.0);
        gl_FragColor = vec4(c * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---- clusters (meshlet-style) for the baked view -----------------------------------------------
// A face's distance grid is cut into tiles of TILE x TILE quads. Tiles that are all sky are
// dropped (the sky dome is behind them); tiles where sky meets a building or the depth jumps keep
// every corner; the rest are drawn at a coarser step the further away they are (the parallax a
// few metres of walking gives a city 1 km away is under a pixel). The face is returned as four
// quadrants, each with its index list and the cone of directions it covers (for culling).
const TILE = 16;
function clusterFace(e, N, minStep, D, X, Y) {
  const S = N - 1, nt = S / TILE;
  const dec = (v) => (v > 0 ? 5 * Math.exp(v * LOGMAX) : 0);
  const out = [];
  for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
    const idx = [];
    const dirs = [];
    for (let ty = qy * nt / 2; ty < (qy + 1) * nt / 2; ty++) for (let tx = qx * nt / 2; tx < (qx + 1) * nt / 2; tx++) {
      const i0 = tx * TILE, j0 = ty * TILE;
      let sky = 0, land = 0, dmin = 1e9, dmax = 0;
      for (let j = j0; j <= j0 + TILE; j++) for (let i = i0; i <= i0 + TILE; i++) {
        const v = e[j * N + i];
        if (v <= 0) sky++; else { land++; const d = dec(v); if (d < dmin) dmin = d; if (d > dmax) dmax = d; }
      }
      if (!land) continue;
      let step;
      if (sky || dmax / dmin > 1.6) step = 1;
      else step = dmin < 200 ? 1 : dmin < 500 ? 2 : dmin < 1500 ? 4 : dmin < 4000 ? 8 : 16;
      step = Math.max(step, minStep);
      for (let j = j0; j < j0 + TILE; j += step) for (let i = i0; i < i0 + TILE; i += step) {
        const a = j * N + i, b = a + step, c = a + step * N, d = c + step;
        // skip quads that are entirely sky
        if (e[a] <= 0 && e[b] <= 0 && e[c] <= 0 && e[d] <= 0) continue;
        idx.push(a, b, d, a, d, c);
      }
      for (const [u, v] of [[i0, j0], [i0 + TILE, j0], [i0, j0 + TILE], [i0 + TILE, j0 + TILE]]) {
        dirs.push(new THREE.Vector3().copy(D).addScaledVector(X, u / S * 2 - 1).addScaledVector(Y, v / S * 2 - 1).normalize());
      }
    }
    if (!idx.length) continue;
    const dir = new THREE.Vector3(); for (const q of dirs) dir.add(q); dir.normalize();
    let half = 0; for (const q of dirs) half = Math.max(half, Math.acos(Math.min(1, dir.dot(q))));
    out.push({ index: new Uint32Array(idx), cone: { dir, half: half + 0.02 } });
  }
  return out;
}
// half of the camera's diagonal field of view (an XR camera: the widest of its eyes, plus room
// for the second eye)
function viewHalfAngle(cam) {
  const c = cam.isArrayCamera && cam.cameras.length ? cam.cameras[0] : cam;
  const e = c.projectionMatrix.elements;
  const tx = 1 / e[0], ty = 1 / e[5];
  const extra = cam.isArrayCamera ? 0.35 : 0.05;
  return Math.atan(Math.hypot(tx + Math.abs(e[8]) / e[0], ty + Math.abs(e[9]) / e[5])) + extra;
}

// texture loading: colour faces (WebP with coverage alpha), distance grids (uint16)
const texLoader = new THREE.TextureLoader();
function loadColor(url, Q) {
  return new Promise((res, rej) => texLoader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = Q.quest ? 2 : 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    res(t);
  }, undefined, rej));
}
async function loadDist(url, n) {
  const r = await fetch(url); if (!r.ok) throw new Error(url);
  const u16 = new Uint16Array(await r.arrayBuffer());
  const f = new Float32Array(u16.length);
  for (let i = 0; i < f.length; i++) f[i] = u16[i] / 65535;
  const t = new THREE.DataTexture(f, n, n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

export async function buildView(scene, renderer, Q) {
  const man = await (await fetch(BASE + 'manifest.json')).json();
  const suns = man.suns;                       // baked times of day, by hour
  let si = Math.max(0, suns.findIndex((s) => s.name === 'afternoon'));
  let sj = -1, mix = 0;                        // fading from sun si to sun sj
  const sunVec = (i) => new THREE.Vector3(...suns[i].sun).normalize();
  const sun = sunVec(si);
  const world = new THREE.Group(); world.name = 'city-view';
  scene.add(world);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMaterial(man.look, sun));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const res = Q.quest ? man.questRes : man.res;
  // the mesh follows the baked distance grid as clusters (see clusterFace): one shared vertex
  // grid, an index list per face quadrant holding only the tiles that are not sky, each at the
  // step its distance needs; the headset never goes finer than every other corner
  const N = man.dsize + 1;
  const gridUV = new Float32Array(N * N * 2), gridPos = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; gridUV[k * 2] = i / (N - 1); gridUV[k * 2 + 1] = j / (N - 1); gridPos[k * 3] = i / (N - 1) - 0.5; gridPos[k * 3 + 1] = j / (N - 1) - 0.5; }
  const gridAttrs = { position: new THREE.BufferAttribute(gridPos, 3), uv: new THREE.BufferAttribute(gridUV, 2) };
  const minStep = Q.quest ? 2 : 1;
  const probes = man.probes.map((p) => ({ ...p, world: new THREE.Vector3(...p.apt), group: null, state: 'idle', op: 0 }));

  const mapUrl = (p, fi, i) => `${BASE}${res}/p${p.id}_${fi}_${suns[i].name}.webp`;
  // make sure probe p has the colour maps of sun i on every face (loaded on demand)
  async function ensureSun(p, i) {
    if (!p.group) return;
    await Promise.all(p.group.children.map(async (m) => {
      const mm = m.userData.maps;
      if (!mm[i]) mm[i] = loadColor(mapUrl(p, m.userData.fi, i), Q);
      await mm[i];
    }));
  }
  async function bind(p) {
    if (!p.group) return;
    for (const m of p.group.children) {
      const u = m.material.uniforms, mm = m.userData.maps;
      u.uMap.value = await mm[si];
      if (sj >= 0 && mm[sj]) { u.uMapB.value = await mm[sj]; u.uMix.value = mix; } else u.uMix.value = 0;
    }
  }
  async function load(p) {
    if (p.group || p.state === 'loading') return;
    p.state = 'loading';
    const g = new THREE.Group();
    await Promise.all(p.faces.map(async (fi) => {
      const f = man.faces[fi];
      const maps = {}; maps[si] = loadColor(mapUrl(p, fi, si), Q);
      const [map, dist] = await Promise.all([maps[si], loadDist(`${BASE}p${p.id}_${fi}.d16`, man.dsize + 1)]);
      const d = new THREE.Vector3(...f.d), up = new THREE.Vector3(...f.up);
      const z = d.clone().negate(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uGain: GAIN, uMap: { value: map }, uMapB: { value: map }, uMix: { value: 0 }, uDist: { value: dist }, uO: { value: p.world }, uD: { value: d }, uX: { value: x }, uY: { value: y }, uOp: { value: 0 } },
        vertexShader: CITY_VS, fragmentShader: CITY_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      });
      // one mesh per face quadrant: its cluster indices and the cone of directions it covers
      const quads = clusterFace(dist.image.data, N, minStep, d, x, y);
      for (const qd of quads) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', gridAttrs.position); geo.setAttribute('uv', gridAttrs.uv);
        geo.setIndex(new THREE.BufferAttribute(qd.index, 1));
        const m = new THREE.Mesh(geo, mat);
        m.userData = { fi, maps, cone: qd.cone, tris: qd.index.length / 3 };
        m.frustumCulled = false; m.renderOrder = -5;
        g.add(m);
      }
    }));
    p.group = g; p.state = 'ready';
    if (sj >= 0) { await ensureSun(p, sj); }
    await bind(p);
    world.add(g);
  }
  function unload(p) {
    if (!p.group) return;
    world.remove(p.group);
    const seen = new Set();
    for (const m of p.group.children) {
      m.geometry.dispose();
      if (seen.has(m.material)) continue;
      seen.add(m.material);
      for (const k in m.userData.maps) m.userData.maps[k].then((t) => t.dispose());
      m.material.uniforms.uDist.value.dispose(); m.material.dispose();
    }
    p.group = null; p.state = 'idle'; p.op = 0;
  }
  const setOp = (p) => { if (p.group) for (const m of p.group.children) m.material.uniforms.uOp.value = p.op; };

  // nearest bake point to the eye (a metre of hysteresis), fade between them
  let cur = null;
  const eye = new THREE.Vector3();
  function pick(cam) {
    cam.getWorldPosition(eye);
    let best = null, bd = 1e9;
    for (const p of probes) { const d = p.world.distanceTo(eye) + (p === cur ? -1 : 0); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  const first = pick({ getWorldPosition: (v) => v.set(8.8, 1.6, 4) });
  await load(first);
  first.op = 1; setOp(first); cur = first;

  let fading = false;
  const fwd = new THREE.Vector3();
  const api = {
    sky, sun, manifest: man, suns, world,
    setGain(k) { if (typeof k === 'number') GAIN.value.setScalar(k); else GAIN.value.set(...k); },
    get sunName() { return suns[si].name; },
    // fade to the next baked time of day (2.5 s); the sun light and sky follow
    async nextSun() {
      if (fading || suns.length < 2) return;
      fading = true;
      sj = (si + 1) % suns.length; mix = 0;
      await Promise.all(probes.filter((p) => p.group).map((p) => ensureSun(p, sj)));
      await Promise.all(probes.filter((p) => p.group).map(bind));
      api.fadeT = 0;
    },
    fadeT: -1,
    update(cam, dt) {
      // clusters off screen are skipped: a quadrant's cone of directions against the view cone
      cam.getWorldDirection(fwd);
      const half = viewHalfAngle(cam);
      api.drawn = 0;
      for (const p of probes) if (p.group) for (const m of p.group.children) {
        const c = m.userData.cone;
        m.visible = Math.acos(Math.max(-1, Math.min(1, fwd.dot(c.dir)))) < half + c.half;
        if (m.visible) api.drawn += m.userData.tris;
      }
      const want = pick(cam);
      if (want !== cur) { load(want); if (want.state === 'ready') cur = want; }
      for (const p of probes) {
        const target = p === cur ? 1 : 0;
        if (p.op !== target) { p.op += Math.sign(target - p.op) * Math.min(Math.abs(target - p.op), dt / 0.45); setOp(p); }
        if (p !== cur && p.op <= 0 && p.group && p !== want) unload(p);
      }
      if (api.fadeT >= 0) {
        api.fadeT += dt; mix = Math.min(1, api.fadeT / 2.5);
        const a = sunVec(si), b = sunVec(sj);
        sun.copy(a.lerp(b, mix)).normalize();
        for (const p of probes) if (p.group) for (const m of p.group.children) m.material.uniforms.uMix.value = mix;
        if (mix >= 1) { si = sj; sj = -1; mix = 0; api.fadeT = -1; fading = false; probes.forEach((p) => bind(p)); }
      }
      sky.position.copy(eye);
    },
  };
  return api;
}
