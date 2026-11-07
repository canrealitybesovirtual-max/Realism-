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
uniform sampler2D uMap, uMapB; uniform float uOp, uMix;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (uMix > 0.0) c = mix(c, texture2D(uMapB, vUv), uMix);   // time of day: the next sun's bake
  gl_FragColor = vec4(c.rgb, c.a * uOp);       // baked already tone-mapped: only the output encoding
  #include <colorspace_fragment>
}`;

function skyMaterial(look, sun) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sun }, uZen: { value: new THREE.Color(look.zen) }, uHor: { value: new THREE.Color(look.hor) }, uHaze: { value: new THREE.Color(look.haze) }, uTint: { value: new THREE.Color(look.sunTint) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uZen, uHor, uHaze, uTint; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.38));
        c = mix(c, uHaze, smoothstep(0.02, -0.12, h));
        float s = max(dot(d, uSun), 0.0);
        c += uTint * (pow(s, 12.0) * 0.18 + pow(s, 900.0) * 40.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
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
  // the mesh follows the baked distance grid; the headset takes every other corner (a quarter of the triangles)
  const seg = Q.quest ? man.dsize / 2 : man.dsize;
  const grid = new THREE.PlaneGeometry(1, 1, seg, seg);   // uv 0..1 over the face
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
        uniforms: { uMap: { value: map }, uMapB: { value: map }, uMix: { value: 0 }, uDist: { value: dist }, uO: { value: p.world }, uD: { value: d }, uX: { value: x }, uY: { value: y }, uOp: { value: 0 } },
        vertexShader: CITY_VS, fragmentShader: CITY_FS, transparent: true, depthWrite: false, toneMapped: false,
      });
      const m = new THREE.Mesh(grid, mat);
      m.userData = { fi, maps };
      m.frustumCulled = false; m.renderOrder = -5;
      g.add(m);
    }));
    p.group = g; p.state = 'ready';
    if (sj >= 0) { await ensureSun(p, sj); }
    await bind(p);
    world.add(g);
  }
  function unload(p) {
    if (!p.group) return;
    world.remove(p.group);
    for (const m of p.group.children) {
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
  const api = {
    sky, sun, manifest: man, suns, world,
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
