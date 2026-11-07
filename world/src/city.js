// What you see through the glass: sky, haze, and a generated city 360 m below (a long park to
// the north, rivers either side, dense towers to the south). A stand-in for the real world
// generator; one instanced draw for every building.
import * as THREE from 'three';

export const STREET = -360;                              // street level relative to floor one

export const SUN = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();   // afternoon sun from the south-west
const ZENITH = new THREE.Color('#3f6eb5'), HORIZON = new THREE.Color('#cbd7e2'), HAZE = new THREE.Color('#b8c4cd');

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN }, uZen: { value: ZENITH }, uHor: { value: HORIZON }, uHaze: { value: HAZE } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uZen, uHor, uHaze; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
        c = mix(c, uHaze, smoothstep(0.02, -0.12, h));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 30.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Building facades: the instance colour is the wall material, aKind 0 masonry / 1 glass tower.
function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying vec3 vWp; varying vec3 vN0; varying float vKind;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wq = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wq = instanceMatrix * wq;
        #endif
        vWp = (modelMatrix * wq).xyz; vN0 = normal; vKind = aKind;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp; varying vec3 vN0; varying float vKind;
        float bh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float roof = step(0.5, vN0.y);
        float u = abs(vN0.x) > 0.5 ? vWp.z : vWp.x;
        float glassT = vKind;
        vec2 cs = mix(vec2(1.8, 3.6), vec2(1.5, 4.0), glassT);
        vec2 cell = vec2(u, vWp.y) / cs;
        vec2 f = fract(cell);
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        vec2 lo = mix(vec2(0.2, 0.28), vec2(0.04, 0.08), glassT), hi = mix(vec2(0.8, 0.9), vec2(0.96, 0.96), glassT);
        float win = smoothstep(lo.x, lo.x + fw, f.x) * smoothstep(hi.x, hi.x - fw, f.x) * smoothstep(lo.y, lo.y + fw, f.y) * smoothstep(hi.y, hi.y - fw, f.y);
        float avg = (hi.x - lo.x) * (hi.y - lo.y);
        win = mix(win, avg, clamp(fw * 1.6 - 0.25, 0.0, 1.0)) * (1.0 - roof);
        vec3 gl = mix(vec3(0.07, 0.08, 0.09), vec3(0.15, 0.17, 0.19), glassT) * (0.88 + 0.24 * bh(floor(cell)));
        diffuseColor.rgb = mix(diffuseColor.rgb, gl, win);
        diffuseColor.rgb *= mix(1.0, 0.7, roof);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.18, win);`);
  };
  m.customProgramCacheKey = () => 'cityBuildings1';
  return m;
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Island geometry (metres, x east, z south; the apartment sits at the origin)
const PARK = { x0: -380, x1: 420, z0: -4250, z1: -170 };
const westShore = (z) => (z > 6000 ? -1450 + (z - 6000) * 0.28 : -1450);
const eastShore = (z) => (z > 6000 ? 1750 - (z - 6000) * 0.42 : 1750);
const inPark = (x, z, m = 0) => x > PARK.x0 - m && x < PARK.x1 + m && z > PARK.z0 - m && z < PARK.z1 + m;

export function buildCity(scene, renderer, Q) {
  const world = new THREE.Group(); world.name = 'city';
  scene.add(world);

  // sky dome + image-based light from it
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), skyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  world.add(sky);
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: '#9c968c' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -20; envScene.add(ground);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }
  scene.fog = new THREE.FogExp2(HAZE.clone(), 0.000105);

  // ground, rivers, harbour: laid edge to edge (never stacked) so nothing z-fights far away
  const groundMat = new THREE.MeshStandardMaterial({ color: '#5b5d5f', roughness: 0.95 });
  const water = new THREE.MeshStandardMaterial({ color: '#3e5868', roughness: 0.12, metalness: 0.0, envMapIntensity: 1.2 });
  const strip = (x0, x1, z0, z1, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); world.add(m); return m; };
  const G = STREET - 0.05, Z0 = -16000, Z1 = 9400, FAR = 16000;
  strip(-1450, PARK.x0, Z0, Z1, groundMat, G); strip(PARK.x1, 1750, Z0, Z1, groundMat, G);
  strip(PARK.x0, PARK.x1, Z0, PARK.z0, groundMat, G); strip(PARK.x0, PARK.x1, PARK.z1, Z1, groundMat, G);
  strip(-FAR, -2700, Z0, Z1, groundMat, G); strip(2350, FAR, Z0, Z1, groundMat, G);
  strip(-2700, -1450, Z0, Z1, water, G); strip(1750, 2350, Z0, Z1, water, G);
  strip(-FAR, FAR, Z1, FAR, water, G);

  // park: canopy texture (generated) + two lakes
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d'); const r = rng(7);
  cx.fillStyle = '#3d5a2e'; cx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const g = 60 + r() * 60; cx.fillStyle = `rgb(${g * 0.55 | 0},${g | 0},${g * 0.42 | 0})`; cx.beginPath(); cx.arc(r() * 256, r() * 256, 1.5 + r() * 4, 0, 7); cx.fill(); }
  const parkTex = new THREE.CanvasTexture(cv); parkTex.wrapS = parkTex.wrapT = THREE.RepeatWrapping; parkTex.repeat.set(8, 40); parkTex.colorSpace = THREE.SRGBColorSpace;
  strip(PARK.x0, PARK.x1, PARK.z0, PARK.z1, new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }), G);
  const lakeMat = water.clone(); lakeMat.polygonOffset = true; lakeMat.polygonOffsetFactor = -4; lakeMat.polygonOffsetUnits = -8;
  for (const [lx, lz, rx, rz] of [[0, -2700, 330, 420], [-60, -1050, 230, 120], [300, -330, 60, 40]]) {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lakeMat);
    lake.scale.set(rx, rz, 1); lake.rotation.x = -Math.PI / 2; lake.position.set(lx, G + 0.3, lz); world.add(lake);
  }

  // buildings
  const R = rng(1957), lots = [];
  const add = (x, z, w, d, h, kind, col) => lots.push([x, z, w, d, h, kind, col]);
  const masonry = ['#a59a8c', '#8f8476', '#b5ab9c', '#7d7369', '#9a8f84', '#c2b9ab', '#6f6862', '#a08877'].map((c) => new THREE.Color(c));
  const glassC = ['#7c8287', '#6b7177', '#8a8f92', '#5f656a'].map((c) => new THREE.Color(c));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const heightAt = (x, z) => {
    const nearPark = (z < PARK.z1 + 40 && z > PARK.z0 - 40) && (Math.abs(x - PARK.x0) < 320 || Math.abs(x - PARK.x1) < 320);
    if (z > -170 && z < 2600) { let h = 50 + Math.pow(R(), 1.6) * 190; if (z < 700 && R() < 0.06) h = 250 + R() * 170; return h; }
    if (z >= 2600 && z < 5200) return 22 + Math.pow(R(), 2) * 80;
    if (z >= 5200) { let h = 50 + Math.pow(R(), 1.5) * 170; if (R() < 0.05) h = 240 + R() * 160; return h; }
    if (z < -4300) return 15 + R() * 35;
    return nearPark ? 45 + R() * 90 : 22 + Math.pow(R(), 1.5) * 55;
  };
  const AV = 270, ST = 80, avW = 30, stW = 18;
  const k = Q.cityK;
  for (let z = -11000; z < 9400; z += ST) {
    const xw = westShore(z) + 40, xe = eastShore(z) - 40;
    for (let x = Math.floor(xw / AV) * AV; x < xe; x += AV) {
      const bx0 = Math.max(x + avW / 2, xw), bx1 = Math.min(x + AV - avW / 2, xe);
      if (bx1 - bx0 < 30) continue;
      if (inPark((bx0 + bx1) / 2, z + ST / 2, 10)) continue;
      if (Math.abs(z) < 60 && bx0 < 30 && bx1 > -10) continue;   // our own block: the tower stands here
      const far = Math.hypot((bx0 + bx1) / 2, z) > 5500;
      if (far && R() > k) continue;
      let px = bx0;
      while (px < bx1 - 8) {
        const w = Math.min(bx1 - px, 18 + R() * (far ? 80 : 45));
        const h = heightAt(px, z);
        const tall = h > 140;
        const kind = tall ? (R() < 0.75 ? 1 : 0) : (R() < 0.15 ? 1 : 0);
        add(px + w / 2, z + ST / 2, w - 2, ST - stW - 2, h, kind, kind ? pick(glassC) : pick(masonry));
        px += w;
      }
    }
  }
  // across the rivers: lower and sparser
  for (const [x0, x1, hk] of [[-7000, -2750, 0.6], [2400, 7000, 0.45]]) {
    for (let z = -10000; z < 9000; z += 140) for (let x = x0; x < x1; x += 160) {
      if (R() > 0.55 * k) continue;
      const nearShore = Math.min(Math.abs(x - x0), Math.abs(x - x1)) < 500;
      const h = (12 + Math.pow(R(), 2) * 40) * (nearShore && R() < 0.25 ? 3 : 1) * hk * 1.4;
      add(x + 80, z + 70, 40 + R() * 70, 40 + R() * 60, h, R() < 0.2 ? 1 : 0, pick(masonry));
    }
  }
  // neighbours on the same street: slender towers (visible through the east and west slots)
  for (const [x, z, w, d, h] of [[520, 30, 28, 60, 430], [-330, 10, 24, 55, 330], [930, -20, 30, 30, 420], [-760, 40, 40, 60, 300], [1250, 60, 34, 34, 260]])
    add(x, z, w, d, h, 1, pick(glassC));

  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const kinds = new Float32Array(lots.length);
  const im = new THREE.InstancedMesh(geo, buildingMaterial(), lots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  lots.forEach(([x, z, w, d, h, kind, col], i) => {
    m4.compose(p.set(x, STREET, z), q, s.set(w, h, d)); im.setMatrixAt(i, m4); im.setColorAt(i, col); kinds[i] = kind;
  });
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  im.frustumCulled = false;
  world.add(im);

  // our own tower: the shaft below the apartment and the crown above it
  const tower = new THREE.Group();
  const tm = buildingMaterial(); tm.color.set('#8e7461');
  const tg = (x0, y0, z0, x1, y1, z1, col) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(0), 1));
    tower.add(new THREE.Mesh(g, tm));
  };
  tg(-0.2, STREET, -0.2, 17.8, -0.62, 19.4, '#8e7461');
  tg(0.4, 8.6, 0.4, 17.2, 20, 17.2, '#8e7461');
  tg(1.6, 20, 1.6, 16.0, 38, 16.0, '#8e7461');
  tg(3.4, 38, 3.4, 14.2, 60, 14.2, '#8e7461');
  world.add(tower);

  return { world, sky, count: lots.length };
}
