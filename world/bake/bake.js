// Offline city baker: real Manhattan (NYC 3D building model + footprints, USGS aerial photos)
// rendered with expensive lighting into cube panoramas (colour + distance) at eye points in the
// apartment. Run headless by tools/nyc/bake_probes.js; the game shows the result (src/view.js).
//
// Lighting, all offline-quality:
//  - sun shadows: every shaded point marches toward the sun through a height map of the whole
//    city (buildings + tree crowns + terrain), with a soft sun-disc penumbra;
//  - sky light: horizon search in 12 directions through the same height map (real occlusion
//    in the street canyons, on facades and roofs), plus bounce from the lit city;
//  - the ground and the park are the aerial photo itself (real colour, real shadows); tree
//    crowns rise out of it as a height field (relief-marched shells);
//  - facades: windows by era and height on the real walls, glass reflecting the sky or the
//    city (one ray through the height map);
//  - air: height-integrated haze toward the sky's horizon colour, earth curvature in the data.
import * as THREE from 'three';

const logEl = document.getElementById('log');
const log = (t) => { logEl.textContent = t; console.log(t); };
const D = './data/';
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); };
const getJ = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };

// ---- the look: tuned against docs/references (apartment-21, -10, -06, -16) ----------------
export const LOOK = {
 sunAz: 245, sunEl: 27,                 // true azimuth / elevation (deg): the photos' afternoon sun from the south-west
  sunE: 1.0, skyE: 0.11, bounce: 0.02,    // sun irradiance, sky irradiance (open roof), bounce from the city
  aerialK: 1.0, aerialGamma: 1.0,        // aerial photo -> radiance
  exposure: 1.32,
  hazeB: 1 / 22000, hazeH: 1000,          // haze extinction at sea level (1/m), scale height (m)
  zen: '#0a6cb4', hor: '#99a9b5', haze: '#aeb0b3', sunTint: '#fff1dc',   // sampled from apartment-21 / -16
  pen: 0.02,
};

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(256, 256);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.cssText = 'position:fixed;right:0;bottom:0;width:256px;height:256px';

let CFG, MOS, TER, S = {};

function colLin(hex) { return new THREE.Color(hex); }   // three converts hex sRGB -> linear working space

function sunDir(cfg) {
  const az = THREE.MathUtils.degToRad(LOOK.sunAz - cfg.gridDeg), el = THREE.MathUtils.degToRad(LOOK.sunEl);
  // game frame: x = grid east, -z = grid north
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

// ---- data ---------------------------------------------------------------------------------
function meshFromBin(buf, idOffset) {
  const dv = new DataView(buf);
  const nT = dv.getUint32(4, true), nB = dv.getUint32(8, true);
  const pos = new Float32Array(buf, 12, nT * 9);
  const bid = new Uint32Array(buf, 12 + nT * 36, nT);
  const info = new Float32Array(buf.slice(12 + nT * 40 + nB * 4, 12 + nT * 40 + nB * 4 + nB * 16));
  const aB = new Float32Array(nT * 3);
  for (let i = 0; i < nT; i++) { const v = bid[i] + idOffset; aB[i * 3] = v; aB[i * 3 + 1] = v; aB[i * 3 + 2] = v; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aB', new THREE.BufferAttribute(aB, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return { g, nB, info };
}

function dataTex(arr, w, h, format, type, linear = true) {
  const t = new THREE.DataTexture(arr, w, h, format, type);
  t.minFilter = t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

async function load() {
  CFG = await getJ('../tools/nyc/config.json');
  MOS = await getJ(D + 'mosaics.json');
  TER = await getJ(D + 'terrain.json');
  log('buildings…');
  const a = meshFromBin(await get(D + 'lod2.bin'), 0);
  const b = meshFromBin(await get(D + 'prisms.bin'), a.nB);
  const n = a.nB + b.nB;
  const attrs = new Float32Array(await get(D + 'attrs.bin'));
  const W = 1024, H = Math.ceil(n / W);
  const at = new Float32Array(W * H * 4); at.set(attrs.subarray(0, n * 4));
  const inf = new Float32Array(W * H * 4); inf.set(a.info); inf.set(b.info, a.nB * 4);
  S.attr = dataTex(at, W, H, THREE.RGBAFormat, THREE.FloatType, false);
  S.info = dataTex(inf, W, H, THREE.RGBAFormat, THREE.FloatType, false);
  S.geos = [a.g, b.g];
  log('terrain…');
  S.ter = dataTex(new Float32Array(await get(D + 'terrain.bin')), TER.nx, TER.nz, THREE.RedFormat, THREE.FloatType);
  try {
    const tb = new Float32Array(await get(D + 'trees.bin'));
    const n = tb.length / 8, aT = new Float32Array(n * 4), aC = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { aT.set(tb.subarray(i * 8, i * 8 + 4), i * 4); aC.set(tb.subarray(i * 8 + 4, i * 8 + 8), i * 4); }
    const ico = new THREE.IcosahedronGeometry(1, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', ico.attributes.position);
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    S.trees = g; S.nTrees = n;
  } catch (e) { S.trees = null; console.warn('no trees.bin', e); }
  S.mos = [];
  for (const m of MOS) {
    log('aerial ' + m.name + '…');
    const t = dataTex(new Uint8Array(await get(D + m.name + '.rgba')), m.w, m.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearFilter;
    S.mos.push(t);
  }
}

// ---- shared GLSL --------------------------------------------------------------------------
const COMMON = /* glsl */`
precision highp float;
uniform sampler2D uTer; uniform vec4 uTerB;                 // x0, z0, 1/W, 1/H
uniform sampler2D uG0, uG1, uG2, uG3; uniform vec4 uGB0, uGB1, uGB2, uGB3;
uniform sampler2D uD0, uD1, uD2, uD3; uniform vec4 uDB0, uDB1, uDB2, uDB3;
uniform vec3 uSun, uCam, uZen, uHor, uHaze, uSunTint;
uniform float uSunE, uSkyE, uBounce, uAerK, uHazeB, uHazeH, uExpo, uPen, uPass, uDsmMax, uDebug;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
bool inB(vec2 t){ return t.x > 0.001 && t.y > 0.001 && t.x < 0.999 && t.y < 0.999; }
float terH(vec2 p){ vec2 t = (p - uTerB.xy) * uTerB.zw; if (!inB(t)) return -20.0 - dot(p,p) / 12742000.0; return texture(uTer, t).r; }
// aerial mosaic: rgb photo (sRGB), a: 0 water, 1 ground, 2 + 8 h canopy
vec4 aer(vec2 p, out float lev){
  vec2 t = (p - uGB0.xy) * uGB0.zw; if (inB(t)) { lev = 0.0; return texture(uG0, t); }
  t = (p - uGB1.xy) * uGB1.zw; if (inB(t)) { lev = 1.0; return texture(uG1, t); }
  t = (p - uGB2.xy) * uGB2.zw; if (inB(t)) { lev = 2.0; return texture(uG2, t); }
  t = (p - uGB3.xy) * uGB3.zw; if (inB(t)) { lev = 3.0; return texture(uG3, t); }
  lev = 4.0; return vec4(0.32, 0.33, 0.30, 1.0 / 255.0);
}
// a coarser look-up (no fine texture): for crown sides
vec3 aerSoft(vec2 p){
  vec2 t = (p - uGB1.xy) * uGB1.zw; if (inB(t)) return texture(uG1, t).rgb;
  t = (p - uGB2.xy) * uGB2.zw; if (inB(t)) return texture(uG2, t).rgb;
  return texture(uG3, (p - uGB3.xy) * uGB3.zw).rgb;
}
float canopyH(vec4 a){ float A = a.a * 255.0; return A > 1.5 ? (A - 2.0) / 8.0 : 0.0; }
uniform float uUnder;   // < 1 where 3D crowns stand (G0): the height field is the understory
float waterW(vec4 a){ return clamp(1.0 - a.a * 255.0, 0.0, 1.0); }
float dsmAt(vec2 p){
  vec2 t = (p - uDB0.xy) * uDB0.zw; if (inB(t)) return texture(uD0, t).r;
  t = (p - uDB1.xy) * uDB1.zw; if (inB(t)) return texture(uD1, t).r;
  t = (p - uDB2.xy) * uDB2.zw; if (inB(t)) return texture(uD2, t).r;
  t = (p - uDB3.xy) * uDB3.zw; if (inB(t)) return texture(uD3, t).r;
  return -100.0;
}
vec3 srgb2lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.38));
  c = mix(c, uHaze, smoothstep(0.02, -0.12, h));
  float s = max(dot(d, uSun), 0.0);
  c += uSunTint * (pow(s, 12.0) * 0.18);
  return c;
}
float sunVis(vec3 p, vec3 n){
  if (dot(n, uSun) <= 0.0) return 0.0;
  vec3 o = p + n * 1.6 + uSun * 0.3;
  float vis = 1.0, t = 0.8;
  float grow = mix(0.05, 0.12, clamp(length(p - uCam) / 6000.0, 0.0, 1.0));   // far away: coarser steps
  for (int i = 0; i < 160; i++) {
    vec3 q = o + uSun * t;
    if (q.y > uDsmMax) break;
    float d = q.y - dsmAt(q.xz);
    vis = min(vis, clamp(0.5 + d / (t * uPen + 0.4), 0.0, 1.0));
    if (vis <= 0.001) return 0.0;
    t += max(0.9, t * grow);
    if (t > 3500.0) break;
  }
  return vis;
}
// sky light reaching a surface (fraction of an open sky on a flat roof: 1)
float skyVis(vec3 p, vec3 n, out float horAvg){
  vec3 o = p + n * 1.6;
  float acc = 0.0; horAvg = 0.0;
  float dc = length(p - uCam);
  int ND = dc < 2500.0 ? 10 : dc < 7000.0 ? 6 : 4;                 // fewer directions where haze hides it
  int NS = dc < 2500.0 ? 16 : 11;
  float gr = dc < 2500.0 ? 1.45 : 1.7;
  for (int k = 0; k < ND; k++) {
    float a = (float(k) + 0.5) / float(ND) * 6.2831853;
    vec2 dir = vec2(cos(a), sin(a));
    float hm = -0.2, t = 2.5;
    for (int i = 0; i < NS; i++) {
      float h = dsmAt(o.xz + dir * t);
      hm = max(hm, (h - o.y) / t);
      t *= gr;
    }
    float el = atan(max(hm, 0.0));
    horAvg += el;
    float s = 0.0;
    for (int j = 0; j < 4; j++) {
      float ph = mix(el, 1.5707963, (float(j) + 0.5) / 4.0);
      vec3 d = vec3(dir.x * cos(ph), sin(ph), dir.y * cos(ph));
      s += max(dot(n, d), 0.0) * cos(ph);
    }
    acc += s * (1.5707963 - el) / 4.0;
  }
  horAvg /= float(ND);
  return acc * (6.2831853 / float(ND)) / 3.14159265;
}
bool rayHits(vec3 o, vec3 d, float maxT){
  float t = 3.0;
  for (int i = 0; i < 40; i++) {
    vec3 q = o + d * t;
    if (q.y > uDsmMax) return false;
    if (dsmAt(q.xz) > q.y) return true;
    t *= 1.18; if (t > maxT) return false;
  }
  return false;
}
vec3 hazeApply(vec3 c, vec3 p){
  vec3 v = p - uCam; float d = length(v);
  float y0 = max(uCam.y, 0.0), y1 = max(p.y, 0.0);
  float k = abs(y1 - y0) > 1.0 ? (exp(-min(y0,y1) / uHazeH) - exp(-max(y0,y1) / uHazeH)) * uHazeH / abs(y1 - y0) : exp(-y0 / uHazeH);
  float T = exp(-uHazeB * d * k);
  vec3 dir = v / d;
  vec3 hz = mix(uHaze, skyCol(normalize(vec3(dir.x, 0.02, dir.z))), 0.45);
  hz += uSunTint * pow(max(dot(dir, uSun), 0.0), 8.0) * 0.05;
  return c * T + hz * (1.0 - T);
}
vec3 neutralTM(vec3 color){
  const float startCompression = 0.8 - 0.04; const float desaturation = 0.15;
  color *= uExpo;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec4 finish(vec3 lin, vec3 p){
  if (uPass > 0.5) return vec4(length(p - uCam), 0.0, 0.0, 1.0);
  vec3 c = hazeApply(lin, p);
  return vec4(clamp(neutralTM(c), 0.0, 1.0), 1.0);
}
`;

// ---- buildings ----------------------------------------------------------------------------
const BLD_VS = /* glsl */`
precision highp float;
attribute float aB;
uniform sampler2D uAttr, uInfo;
varying vec3 vWP; flat varying vec4 vA; flat varying vec4 vI;
void main(){
  int id = int(aB + 0.5);
  ivec2 c = ivec2(id % 1024, id / 1024);
  vA = texelFetch(uAttr, c, 0); vI = texelFetch(uInfo, c, 0);
  vWP = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const BLD_FS = /* glsl */`
${COMMON}
varying vec3 vWP; flat varying vec4 vA; flat varying vec4 vI;
vec3 pick(float r, vec3 a, vec3 b, vec3 c, vec3 d){ return r < 0.25 ? a : r < 0.5 ? b : r < 0.75 ? c : d; }
void main(){
  vec3 p = vWP;
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, uCam - p) < 0.0) n = -n;
  float year = vA.x, H = vA.y, r = vA.w, base = vI.z;
  float r2 = fract(r * 7.31), r3 = fract(r * 13.7);
  // style
  int st = 2;
  if (year > 0.0 && year < 1925.0 && H < 30.0) st = 0;           // rowhouses, brownstones, tenements
  else if (year > 0.0 && year < 1946.0) st = 1;                  // prewar masonry
  // offices and glass mostly south of the park (midtown); uptown, tall postwar = brick apartments
  bool midtown = vI.y > -260.0;
  if (st == 2 && year >= 1998.0 && H > 45.0 && (midtown || r < 0.45)) st = 4;           // new glass
  else if (st == 2 && year >= 1955.0 && H > 70.0 && midtown && r < 0.55) st = 3;      // office curtain wall / precast
  if (vA.z < -1.5) st = 1; else if (vA.z < -0.5) st = 5;         // landmark overrides (pack_attrs.py)
  // wall albedo (linear), from the reference photos' palette
  // warm, as in apartment-21 / -10: cream and tan stone and brick first, red-brown brick second
  vec3 brick = pick(r2, vec3(0.34,0.18,0.12), vec3(0.42,0.25,0.17), vec3(0.30,0.17,0.12), vec3(0.47,0.31,0.21));
  vec3 brown = pick(r2, vec3(0.26,0.15,0.10), vec3(0.36,0.24,0.16), vec3(0.46,0.34,0.24), vec3(0.22,0.13,0.09));
  vec3 lime  = pick(r2, vec3(0.66,0.59,0.48), vec3(0.55,0.48,0.39), vec3(0.72,0.67,0.57), vec3(0.48,0.42,0.34));
  vec3 pale  = pick(r2, vec3(0.68,0.65,0.58), vec3(0.76,0.74,0.68), vec3(0.58,0.55,0.50), vec3(0.72,0.70,0.65));
  vec3 wall = st == 0 ? (r3 < 0.5 ? brick : brown) : st == 1 ? (vA.z < -1.5 ? vec3(0.64,0.58,0.48) : r3 < 0.55 ? lime : brick * 1.15) : st == 2 ? (r3 < 0.5 ? pale : (r3 < 0.8 ? brick * 1.2 : lime)) : st == 3 ? (r3 < 0.5 ? vec3(0.55,0.53,0.50) : vec3(0.20,0.20,0.21)) : st == 5 ? vec3(0.72,0.71,0.68) : vec3(0.35,0.38,0.40);
  float fh = st == 0 ? 3.3 : st == 1 ? 3.25 : st == 2 ? 2.85 : st == 3 ? 3.9 : st == 5 ? 4.7 : 3.8;
  float bay = st == 0 ? 2.1 : st == 1 ? 2.3 : st == 2 ? 2.6 : st == 3 ? 1.52 : st == 5 ? 4.7 : 1.5;
  vec3 alb = wall; float glassF = 0.0;
  bool roof = n.y > 0.55;
  vec3 col;
  float horAvg;
  float sky = skyVis(p, n, horAvg);
  float vis = sunVis(p, n);
  float ndl = max(dot(n, uSun), 0.0);
  if (uDebug > 0.5) { gl_FragColor = vec4(uDebug < 1.5 ? vec3(vis * ndl) : uDebug < 2.5 ? vec3(sky) : vec3(fract(dsmAt(p.xz) / 50.0)), 1.0); return; }
  if (roof) {
    // roofs: membranes, gravel, tar; equipment and patching as noise
    float k = fract(r * 3.77);
    alb = k < 0.38 ? vec3(0.62,0.62,0.60) : k < 0.62 ? vec3(0.34,0.32,0.29) : k < 0.80 ? vec3(0.11,0.11,0.11) : k < 0.92 ? vec3(0.46,0.40,0.33) : vec3(0.75,0.75,0.73);
    alb *= 0.82 + 0.3 * n21(p.xz * 0.35 + r * 50.0);
    alb *= 0.85 + 0.15 * step(0.12, n21(p.xz * 1.3));
    col = alb * (uSunE * ndl * vis + uSkyE * sky + uBounce * (1.0 - sky) * 0.5);
    gl_FragColor = finish(col, p);
    return;
  }
  // facade: windows in world metres along the wall
  vec2 t2 = normalize(vec2(-n.z, n.x) + 1e-5);
  float u = dot(p.xz, t2);
  float v = p.y - base;
  float fu = fract(u / bay), fv = fract(v / fh);
  float wu = st == 5 ? 0.66 : st >= 3 ? 0.92 : (st == 0 ? 0.48 : 0.5), wv = st == 5 ? 0.66 : st >= 3 ? 0.62 : 0.52;
  float aa = clamp(fwidth(u / bay) * 1.5, 0.0, 0.5), av = clamp(fwidth(v / fh) * 1.5, 0.0, 0.5);
  float inU = smoothstep(0.5 - wu * 0.5 - aa, 0.5 - wu * 0.5 + aa, fu) * (1.0 - smoothstep(0.5 + wu * 0.5 - aa, 0.5 + wu * 0.5 + aa, fu));
  float inV = smoothstep(0.30 - av, 0.30 + av, fv) * (1.0 - smoothstep(0.30 + wv - av, 0.30 + wv + av, fv));
  // each axis falls back to its own average once it is below ~2 px, so rows of windows stay
  // visible after the columns have merged (as in the photos at 1-3 km)
  inU = mix(inU, wu, clamp(aa * 1.5 - 0.45, 0.0, 1.0));
  inV = mix(inV, wv, clamp(av * 1.5 - 0.45, 0.0, 1.0));
  float win = inU * inV;
  if (v < 4.2 && st != 0) win = mix(win, 0.7, 0.8);            // storefronts
  float fi = floor(v / fh), bi = floor(u / bay);
  float cr = h21(vec2(bi, fi) + r * 91.0), fr0 = h21(vec2(fi, r * 17.0)), br0 = h21(vec2(floor(bi / 3.0), r * 23.0));
  // glass: sky or the city in the reflection, dark room behind
  vec3 vd = normalize(p - uCam);
  vec3 rd = reflect(vd, n);
  float fr = 0.04 + 0.96 * pow(1.0 - max(dot(-vd, n), 0.0), 5.0);
  fr = st >= 3 ? max(fr, 0.18) : fr;
  vec3 refl = (win > 0.04 && rayHits(p + n * 1.5, rd, 900.0)) ? vec3(0.32, 0.30, 0.28) * (uSkyE + uSunE * 0.25) : skyCol(rd) * 0.85;
  // rooms: dark, some blinds / curtains down (pale), varying by window, floor and bay group
  float blind = step(0.78, cr) * (0.5 + 0.5 * fr0);
  vec3 room = mix(vec3(0.02, 0.019, 0.018) * (0.5 + 1.5 * cr), vec3(0.42, 0.40, 0.36) * (uSkyE * 0.9 + 0.1), blind * (st >= 3 ? 0.4 : 1.0));
  room *= 0.8 + 0.4 * br0;
  vec3 glass = mix(room, refl, fr * (0.7 + 0.6 * fr0)) + (st >= 3 ? vec3(0.02, 0.03, 0.035) : vec3(0.0));
  // wall shading: grime at the base, bands at floors, weathering
  float band = smoothstep(0.02, 0.0, abs(fv - 0.12)) * (st == 1 ? 0.18 : 0.06);
  alb = wall * 0.86 * (0.80 + 0.40 * n21(vec2(u * 0.2, v * 0.05) + r * 31.0)) * (1.0 - band) * (0.9 + 0.2 * br0);
  alb *= 0.78 + 0.22 * smoothstep(0.0, 12.0, v);
  vec3 litWall = alb * (uSunE * ndl * vis + uSkyE * sky * 1.25 + uBounce * (0.5 + 0.5 * (1.0 - sky)));
  col = mix(litWall, glass + room * uSunE * ndl * vis * 0.4, win);
  gl_FragColor = finish(col, p);
}`;

// ---- ground (terrain mesh: aerial photo, water) ----------------------------------------------
const GND_VS = /* glsl */`
precision highp float;
uniform sampler2D uTer; uniform vec4 uTerB;
attribute vec2 aG;
varying vec3 vWP;
float terH(vec2 p){ vec2 t = (p - uTerB.xy) * uTerB.zw; if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return -20.0 - dot(p,p) / 12742000.0; return texture(uTer, t).r; }
void main(){
  vec2 a = abs(aG);
  vec2 w = sign(aG) * (a * 600.0 + pow(a, vec2(3.0)) * 90000.0);   // dense under us, 90 km at the rim
  vec3 p = vec3(w.x, terH(w), w.y);
  vWP = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const GND_FS = /* glsl */`
${COMMON}
varying vec3 vWP;
void main(){
  vec3 p = vWP; float lev;
  vec4 a = aer(p.xz, lev);
  vec3 c = srgb2lin(a.rgb) * uAerK;
  float ww = waterW(a);
  if (lev < 3.5 && length(p - uCam) < 14000.0) {
    vec3 n0 = vec3(0.0, 1.0, 0.0);
    float horAvg;
    float sky = skyVis(p, n0, horAvg);
    float vis = sunVis(p + vec3(0.0, 0.3, 0.0), n0);
    float flat0 = max(uSun.y, 0.05);
    float lit = (uSunE * flat0 * vis + uSkyE * sky + uBounce * (1.0 - sky)) / (uSunE * flat0 + uSkyE);
    if (uDebug > 0.5) { gl_FragColor = vec4(uDebug < 1.5 ? vec3(vis) : uDebug < 2.5 ? vec3(sky) : vec3(fract(dsmAt(p.xz) / 50.0)), 1.0); return; }
    c *= mix(lit, 1.0, ww);
  }
  if (ww > 0.0) {
    vec3 vd = normalize(p - uCam);
    vec3 nn = normalize(vec3((n21(p.xz * 0.15 + 3.0) - 0.5) * 0.04, 1.0, (n21(p.xz * 0.12 - 7.0) - 0.5) * 0.04));
    vec3 rd = reflect(vd, nn);
    rd.y = max(rd.y, 0.06);                                    // small waves tilt the reflection up into the bluer sky
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(-vd, nn), 0.0), 5.0);
    vec3 body = mix(vec3(0.018, 0.035, 0.045), c * 0.35, 0.25);   // deep water, a hint of the photo (no sun glint texture)
    vec3 wc = mix(body, skyCol(normalize(rd)) * 0.85, clamp(fr * 1.15, 0.0, 1.0));
    c = mix(c, wc, ww);
  }
  gl_FragColor = finish(c, p);
}`;

// ---- tree crowns: relief shells over the canopy -------------------------------------------
const CAN_VS = /* glsl */`
precision highp float;
attribute vec3 aMin; attribute vec3 aMax;
varying vec3 vWP; flat varying vec3 vMin; flat varying vec3 vMax;
void main(){
  vec3 p = aMin + (position + 0.5) * (aMax - aMin);
  vWP = p; vMin = aMin; vMax = aMax;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const CAN_FS = /* glsl */`
${COMMON}
uniform mat4 uVP; uniform sampler2D uPre; uniform vec2 uRes;
varying vec3 vWP; flat varying vec3 vMin; flat varying vec3 vMax;
float hf(vec2 xz){ float l; vec4 a = aer(xz, l); return terH(xz) + canopyH(a) * (l < 0.5 ? uUnder : 1.0); }
void main(){
  float dPre = texture(uPre, gl_FragCoord.xy / uRes).r;
  if (dPre > 0.0 && length(vWP - uCam) > dPre + 0.5) discard;   // a building or the ground is in front
  vec3 rd = normalize(vWP - uCam);
  // exit of the box
  vec3 t1 = (vMin - uCam) / rd, t2 = (vMax - uCam) / rd;
  float tExit = min(min(max(t1.x, t2.x), max(t1.y, t2.y)), max(t1.z, t2.z));
  if (dPre > 0.0) tExit = min(tExit, dPre + 0.5);
  float t = length(vWP - uCam);
  float step = max(0.25, t * 0.0012);
  vec3 p; bool hit = false; float tp = t;
  for (int i = 0; i < 400; i++) {
    p = uCam + rd * t;
    float h = hf(p.xz);
    if (p.y <= h) { hit = true; break; }
    tp = t; t += step;
    if (t > tExit) break;
  }
  if (!hit) discard;
  for (int i = 0; i < 6; i++) { float tm = 0.5 * (tp + t); vec3 q = uCam + rd * tm; if (q.y <= hf(q.xz)) t = tm; else tp = tm; }
  p = uCam + rd * t;
  float l; vec4 a = aer(p.xz, l);
  float ch = canopyH(a);
  if (ch < 0.8) discard;                       // ground: the terrain mesh draws it
  float e = max(0.5, l < 0.5 ? 0.75 : 2.0);
  vec3 n = normalize(vec3(hf(p.xz - vec2(e, 0.0)) - hf(p.xz + vec2(e, 0.0)), 2.0 * e, hf(p.xz - vec2(0.0, e)) - hf(p.xz + vec2(0.0, e))));
  // colour from the photo (its hue and leaf texture), light from the game's sun: each crown gets a
  // sunlit side and a shaded side, gaps between crowns get less sky
  vec3 soft = srgb2lin(aerSoft(p.xz)) * uAerK;
  vec3 fine = srgb2lin(a.rgb) * uAerK;
  float lf = dot(fine, vec3(0.2126, 0.7152, 0.0722)), ls = dot(soft, vec3(0.2126, 0.7152, 0.0722)) + 1e-4;
  vec3 alb = soft * clamp(pow(lf / ls, 0.6), 0.45, 1.8);
  float h0 = hf(p.xz), occ = 0.0;
  for (int k = 0; k < 6; k++) { float an = float(k) * 1.0472; occ += max(0.0, hf(p.xz + vec2(cos(an), sin(an)) * 3.5) - h0); }
  occ = clamp(1.0 - occ / 6.0 / 5.0, 0.25, 1.0);
  float ndl = max(dot(n, uSun), 0.0);
  float vis = sunVis(p, n);
  float sh = uSunE * ndl * vis + uSkyE * 1.6 * occ * (0.6 + 0.4 * n.y) + uBounce;
  float shFlat = uSunE * max(uSun.y, 0.1) + uSkyE * 1.6;
  vec3 c = alb * sh / shFlat;
  vec4 cp = uVP * vec4(p, 1.0);
  gl_FragDepth = 0.5 * (cp.z / cp.w) + 0.5;
  gl_FragColor = finish(c, p);
}`;

// ---- tree crowns near the tower: one rounded, lumpy crown per treetop found in the aerial --------
const TREE_VS = /* glsl */`
precision highp float;
uniform sampler2D uTer; uniform vec4 uTerB;
attribute vec4 aT; attribute vec4 aC;
varying vec3 vWP; varying vec3 vN; flat varying vec4 vC; flat varying vec3 vCen; flat varying vec2 vR;
float terH(vec2 p){ vec2 t = (p - uTerB.xy) * uTerB.zw; return texture(uTer, t).r; }
void main(){
  float R = aT.w, Rv = R * (0.78 + 0.25 * aC.w);
  float g = terH(aT.xy);
  vec3 cen = vec3(aT.x, g + max(aT.z, Rv * 1.2) - Rv, aT.y);
  vec3 d = normalize(position);
  // lumpy: a few big clumps per crown
  float l = 1.0 + 0.16 * sin(d.x * 5.1 + aC.w * 30.0) * sin(d.z * 4.3 + aC.w * 17.0) + 0.1 * sin(d.y * 6.0 + aC.w * 9.0);
  vec3 p = cen + d * vec3(R, Rv, R) * l;
  p.y = max(p.y, g + 1.5);
  vWP = p; vN = normalize(d / vec3(R, Rv, R)); vC = aC; vCen = cen; vR = vec2(R, Rv);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const TREE_FS = /* glsl */`
${COMMON}
varying vec3 vWP; varying vec3 vN; flat varying vec4 vC; flat varying vec3 vCen; flat varying vec2 vR;
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = mix(mix(h21(i.xy + i.z * 17.0), h21(i.xy + vec2(1,0) + i.z * 17.0), f.x), mix(h21(i.xy + vec2(0,1) + i.z * 17.0), h21(i.xy + vec2(1,1) + i.z * 17.0), f.x), f.y);
  float b = mix(mix(h21(i.xy + (i.z + 1.0) * 17.0), h21(i.xy + vec2(1,0) + (i.z + 1.0) * 17.0), f.x), mix(h21(i.xy + vec2(0,1) + (i.z + 1.0) * 17.0), h21(i.xy + vec2(1,1) + (i.z + 1.0) * 17.0), f.x), f.y);
  return mix(a, b, f.z); }
void main(){
  vec3 p = vWP;
  // leaf clumps: bumps on the crown (~1.2 m), finer leaf grain
  float e = 0.35;
  vec3 q = p / 1.25 + vC.w * 40.0;
  vec3 gN = vec3(n3(q + vec3(e,0,0)) - n3(q - vec3(e,0,0)), n3(q + vec3(0,e,0)) - n3(q - vec3(0,e,0)), n3(q + vec3(0,0,e)) - n3(q - vec3(0,0,e)));
  vec3 n = normalize(normalize(vN) - gN * 1.6);
  float clump = n3(q), grain = n3(p * 2.7 + vC.w * 9.0);
  vec3 alb = vC.rgb * (0.68 + 0.45 * clump) * (0.85 + 0.3 * grain);
  // light: sun through the height map, sky by how open this side of the crown is
  float ndl = max(dot(n, uSun), 0.0);
  float vis = ndl > 0.0 ? sunVis(p, n) : 0.0;
  float hgt = clamp((p.y - vCen.y) / vR.y * 0.5 + 0.5, 0.0, 1.0);          // lower crown: darker
  float occ = mix(0.25, 1.0, hgt) * (0.55 + 0.45 * clump);
  vec3 c = alb * (uSunE * ndl * vis * (0.8 + 0.4 * clump) + uSkyE * 1.5 * occ + uBounce * 0.5) / (uSunE * max(uSun.y, 0.1) + uSkyE * 1.7) * 0.95;
  gl_FragColor = finish(c, p);
}`;
const TREE_PRE_FS = /* glsl */`precision highp float; uniform vec3 uCam; varying vec3 vWP; varying vec3 vN; flat varying vec4 vC; flat varying vec3 vCen; flat varying vec2 vR; void main(){ gl_FragColor = vec4(length(vWP - uCam), 0.0, 0.0, 1.0); }`;
const TREE_DSM_FS = /* glsl */`precision highp float; varying vec3 vWP; varying vec3 vN; flat varying vec4 vC; flat varying vec3 vCen; flat varying vec2 vR; void main(){ gl_FragColor = vec4(vWP.y, 0.0, 0.0, 1.0); }`;

// ---- pre-pass: distance only (cheap), so the lighting runs once per visible pixel ----------
const PRE_FS = /* glsl */`precision highp float; uniform vec3 uCam; varying vec3 vWP; void main(){ gl_FragColor = vec4(length(vWP - uCam), 0.0, 0.0, 1.0); }`;

// ---- height map for shadows / sky occlusion -------------------------------------------------
const DSM_BLD_FS = /* glsl */`precision highp float; varying vec3 vWP; flat varying vec4 vA; flat varying vec4 vI; void main(){ gl_FragColor = vec4(vWP.y, 0.0, 0.0, 1.0); }`;
const DSM_GND_FS = /* glsl */`
${COMMON}
varying vec3 vWP;
void main(){ float l; vec4 a = aer(vWP.xz, l); gl_FragColor = vec4(vWP.y + canopyH(a) * (l < 0.5 ? uUnder : 1.0), 0.0, 0.0, 1.0); }`;

let mats = {}, U = {}, scenes = {};

function uniforms() {
  const sun = sunDir(CFG);
  const gb = MOS.map((m) => new THREE.Vector4(m.x0, m.z0, 1 / (m.x1 - m.x0), 1 / (m.z1 - m.z0)));
  U = {
    uTer: { value: S.ter }, uTerB: { value: new THREE.Vector4(TER.x0, TER.z0, 1 / (TER.nx * TER.cell), 1 / (TER.nz * TER.cell)) },
    uG0: { value: S.mos[0] }, uG1: { value: S.mos[1] }, uG2: { value: S.mos[2] }, uG3: { value: S.mos[3] },
    uGB0: { value: gb[0] }, uGB1: { value: gb[1] }, uGB2: { value: gb[2] }, uGB3: { value: gb[3] },
    uD0: { value: null }, uD1: { value: null }, uD2: { value: null }, uD3: { value: null },
    uDB0: { value: new THREE.Vector4() }, uDB1: { value: new THREE.Vector4() }, uDB2: { value: new THREE.Vector4() }, uDB3: { value: new THREE.Vector4() },
    uSun: { value: sun }, uCam: { value: new THREE.Vector3() },
    uZen: { value: colLin(LOOK.zen) }, uHor: { value: colLin(LOOK.hor) }, uHaze: { value: colLin(LOOK.haze) }, uSunTint: { value: colLin(LOOK.sunTint) },
    uSunE: { value: LOOK.sunE }, uSkyE: { value: LOOK.skyE }, uBounce: { value: LOOK.bounce }, uAerK: { value: LOOK.aerialK },
    uHazeB: { value: LOOK.hazeB }, uHazeH: { value: LOOK.hazeH }, uExpo: { value: LOOK.exposure }, uPen: { value: LOOK.pen },
    uPass: { value: 0 }, uDsmMax: { value: 520 }, uDebug: { value: 0 },
    uAttr: { value: S.attr }, uInfo: { value: S.info }, uVP: { value: new THREE.Matrix4() },
    uPre: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uUnder: { value: S.trees ? 0.45 : 1.0 },
  };
}

function build() {
  uniforms();
  const sm = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, glslVersion: null, ...extra });
  const late = { depthWrite: false, depthFunc: THREE.LessEqualDepth };
  mats.bld = sm(BLD_VS, BLD_FS, { side: THREE.DoubleSide, ...late });
  mats.gnd = sm(GND_VS, GND_FS, late);
  mats.preB = sm(BLD_VS, PRE_FS, { side: THREE.DoubleSide });
  mats.tree = sm(TREE_VS, TREE_FS, late);
  mats.preT = sm(TREE_VS, TREE_PRE_FS);
  mats.dsmT = sm(TREE_VS, TREE_DSM_FS);
  mats.preG = sm(GND_VS, PRE_FS);
  mats.can = sm(CAN_VS, CAN_FS, { side: THREE.FrontSide });
  mats.dsmBld = sm(BLD_VS, DSM_BLD_FS, { side: THREE.DoubleSide });
  mats.dsmGnd = sm(GND_VS, DSM_GND_FS);
  // terrain grid
  const N = 1400, aG = new Float32Array((N + 1) * (N + 1) * 2);
  for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++) { aG[k++] = i / N * 2 - 1; aG[k++] = j / N * 2 - 1; }
  const idx = new Uint32Array(N * N * 6);
  for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6; }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('aG', new THREE.BufferAttribute(aG, 2));
  gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * (N + 1) * 3), 3));
  gg.setIndex(new THREE.BufferAttribute(idx, 1));
  gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  S.gndGeo = gg;
  S.canGeo = canopyShells();
  // scenes
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };
  scenes.pre = new THREE.Scene();
  for (const g of S.geos) scenes.pre.add(mk(g, mats.preB));
  scenes.pre.add(mk(gg, mats.preG));
  if (S.trees) { scenes.pre.add(mk(S.trees, mats.preT)); }
  scenes.can = new THREE.Scene();
  if (S.canGeo) scenes.can.add(mk(S.canGeo, mats.can));
  scenes.col = new THREE.Scene();
  for (const g of S.geos) scenes.col.add(mk(g, mats.bld));
  scenes.col.add(mk(gg, mats.gnd));
  if (S.trees) scenes.col.add(mk(S.trees, mats.tree));
  scenes.dsm = new THREE.Scene();
  for (const g of S.geos) scenes.dsm.add(mk(g, mats.dsmBld));
  scenes.dsm.add(mk(gg, mats.dsmGnd));
  if (S.trees) scenes.dsm.add(mk(S.trees, mats.dsmT));
}

// boxes over every tile with tree crowns (from the mosaics' alpha), terrain-tight
function canopyShells() {
  const boxes = [];
  const terAt = (x, z) => { const i = Math.floor((x - TER.x0) / TER.cell), j = Math.floor((z - TER.z0) / TER.cell); if (i < 0 || j < 0 || i >= TER.nx || j >= TER.nz) return -20; return S.ter.image.data[j * TER.nx + i]; };
  const covered = (x, z, upto) => { for (let k = 0; k < upto; k++) { const m = MOS[k]; if (x >= m.x0 && x < m.x1 && z >= m.z0 && z < m.z1) return true; } return false; };
  for (let k = 0; k < 3; k++) {
    const m = MOS[k], d = S.mos[k].image.data, tile = [32, 64, 128][k];
    const px = Math.round(tile / m.res);
    for (let tz = 0; tz < m.h; tz += px) for (let tx = 0; tx < m.w; tx += px) {
      const x0 = m.x0 + tx * m.res, z0 = m.z0 + tz * m.res;
      if (covered(x0 + tile / 2, z0 + tile / 2, k)) continue;
      let hm = 0;
      for (let j = tz; j < Math.min(tz + px, m.h); j += 2) for (let i = tx; i < Math.min(tx + px, m.w); i += 2) { const A = d[(j * m.w + i) * 4 + 3]; if (A > 2) hm = Math.max(hm, (A - 2) / 8); }
      if (hm < 1) continue;
      let t0 = 1e9, t1 = -1e9;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) { const h = terAt(x0 + tile * i / 4, z0 + tile * j / 4); t0 = Math.min(t0, h); t1 = Math.max(t1, h); }
      boxes.push(x0, t0 - 1, z0, x0 + tile, t1 + hm + 1.5, z0 + tile);
    }
  }
  if (!boxes.length) return null;
  const n = boxes.length / 6;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = box.index; g.setAttribute('position', box.attributes.position);
  const mn = new Float32Array(n * 3), mx = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { mn.set(boxes.slice(i * 6, i * 6 + 3), i * 3); mx.set(boxes.slice(i * 6 + 3, i * 6 + 6), i * 3); }
  g.setAttribute('aMin', new THREE.InstancedBufferAttribute(mn, 3));
  g.setAttribute('aMax', new THREE.InstancedBufferAttribute(mx, 3));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  log('canopy shells ' + n);
  return g;
}

// height map levels: rendered from above
const DSM_LV = [
  { x0: -1536, x1: 1536, z0: -4608, z1: 1536, res: 1 },
  { x0: -4096, x1: 4096, z0: -8192, z1: 4096, res: 4 },
  { x0: -8192, x1: 8192, z0: -16384, z1: 8192, res: 8 },
  { x0: -32768, x1: 32768, z0: -40960, z1: 24576, res: 32 },
];
function renderDSM() {
  S.dsm = [];
  DSM_LV.forEach((L, k) => {
    const W = Math.round((L.x1 - L.x0) / L.res), H = Math.round((L.z1 - L.z0) / L.res);
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cam = new THREE.OrthographicCamera(-(L.x1 - L.x0) / 2, (L.x1 - L.x0) / 2, (L.z1 - L.z0) / 2, -(L.z1 - L.z0) / 2, 0, 6000);
    cam.position.set((L.x0 + L.x1) / 2, 3000, (L.z0 + L.z1) / 2);
    cam.up.set(0, 0, -1); cam.lookAt(cam.position.x, 0, cam.position.z);
    cam.updateMatrixWorld();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    U.uCam.value.copy(cam.position);
    renderer.render(scenes.dsm, cam);
    renderer.setRenderTarget(null);
    S.dsm.push(rt);
    // screen up = -z: texture v runs from z1 (bottom) to z0 (top)
    U['uD' + k].value = rt.texture;
    U['uDB' + k].value.set(L.x0, L.z1, 1 / (L.x1 - L.x0), -1 / (L.z1 - L.z0));
  });
}

// ---- probes ---------------------------------------------------------------------------------
export const FACES = [
  { d: [1, 0, 0], up: [0, 1, 0] }, { d: [-1, 0, 0], up: [0, 1, 0] },
  { d: [0, 1, 0], up: [0, 0, -1] }, { d: [0, -1, 0], up: [0, 0, 1] },
  { d: [0, 0, 1], up: [0, 1, 0] }, { d: [0, 0, -1], up: [0, 1, 0] },
];
const dsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { uT: { value: null }, uPx: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `precision highp float; uniform sampler2D uT; uniform vec2 uPx; varying vec2 vUv;
    vec3 enc(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){ vec4 s = vec4(0.0);
      for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) { vec2 o = (vec2(float(i), float(j)) - 1.0) * uPx; s += texture2D(uT, vUv + o); }
      s /= 9.0; vec3 c = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);
      gl_FragColor = vec4(enc(c), s.a); }`,
  depthTest: false, depthWrite: false,
}));
const dsScene = new THREE.Scene(); dsScene.add(dsQuad);
const dsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// pre-pass distance -> rtPre; colour into rt (premultiplied coverage)
function passes(cam, w, h) {
  const rtPre = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: true });
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  renderer.autoClear = false;
  renderer.setRenderTarget(rtPre); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scenes.pre, cam);
  U.uPre.value = rtPre.texture; U.uRes.value.set(w, h);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  for (const m of scenes.pre.children) m.material.colorWrite = false;
  renderer.render(scenes.pre, cam);
  for (const m of scenes.pre.children) m.material.colorWrite = true;
  renderer.render(scenes.can, cam);
  renderer.render(scenes.col, cam);
  renderer.autoClear = true;
  renderer.setRenderTarget(null);
  return { rt, rtPre };
}

function faceCam(pos, f) {
  const cam = new THREE.PerspectiveCamera(90, 1, 3, 200000);
  cam.position.set(...pos);
  cam.up.set(...f.up);
  cam.lookAt(pos[0] + f.d[0], pos[1] + f.d[1], pos[2] + f.d[2]);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}

// colour (supersampled ss x) as RGBA8 sRGB with coverage alpha; distance at dsize
async function renderFace(pos, fi, size, ss, dsize) {
  const f = FACES[fi];
  const cam = faceCam(pos, f);
  U.uCam.value.set(...pos);
  U.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  // colour, premultiplied by coverage
  U.uPass.value = 0;
  const { rt: big, rtPre } = passes(cam, size * ss, size * ss);
  rtPre.dispose();
  const out = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
  dsQuad.material.uniforms.uT.value = big.texture;
  dsQuad.material.uniforms.uPx.value.set(ss > 1 ? 0.66 / (size * ss) : 0, ss > 1 ? 0.66 / (size * ss) : 0);
  renderer.setRenderTarget(out); renderer.clear(); renderer.render(dsScene, dsCam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(out, 0, 0, size, size, px);
  big.dispose(); out.dispose();
  // distance (pre-pass at the mesh resolution; 0 = sky)
  const drt = new THREE.WebGLRenderTarget(dsize, dsize, { type: THREE.FloatType, depthBuffer: true });
  renderer.setRenderTarget(drt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scenes.pre, cam);
  const dp = new Float32Array(dsize * dsize * 4);
  renderer.readRenderTargetPixels(drt, 0, 0, dsize, dsize, dp);
  drt.dispose();
  renderer.setRenderTarget(null);
  const dist = new Float32Array(dsize * dsize);
  for (let i = 0; i < dist.length; i++) dist[i] = dp[i * 4];
  return { px, dist };
}

const b64 = (u8) => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };

window.__bake = {
  LOOK, FACES, S, scenes, mats,
  get U() { return U; },
  async init() {
    await load();
    build();
    log('height map…');
    renderDSM();
    log('ready');
    return { canopy: S.canGeo ? S.canGeo.instanceCount : 0, trees: S.nTrees || 0, dsm: DSM_LV.length };
  },
  // change the look in place (sun, sky, haze...): the height map does not depend on it
  set(o) {
    Object.assign(LOOK, o);
    U.uSun.value.copy(sunDir(CFG));
    U.uZen.value.set(LOOK.zen); U.uHor.value.set(LOOK.hor); U.uHaze.value.set(LOOK.haze); U.uSunTint.value.set(LOOK.sunTint);
    U.uSunE.value = LOOK.sunE; U.uSkyE.value = LOOK.skyE; U.uBounce.value = LOOK.bounce; U.uAerK.value = LOOK.aerialK;
    U.uHazeB.value = LOOK.hazeB; U.uHazeH.value = LOOK.hazeH; U.uExpo.value = LOOK.exposure; U.uPen.value = LOOK.pen;
    return U.uSun.value.toArray();
  },
  // one face -> base64 RGBA8 (rows bottom-up) + base64 Float32 distance
  async face(pos, fi, size = 512, ss = 2, dsize = 128) {
    const t0 = performance.now();
    const r = await renderFace(pos, fi, size, ss, dsize);
    return { rgba: b64(r.px), dist: b64(new Uint8Array(r.dist.buffer)), ms: Math.round(performance.now() - t0) };
  },
  // a quick preview view: any camera, returned as a PNG data URL
  async view(pos, look, fov = 60, w = 640, h = 400, ss = 1) {
    const cam = new THREE.PerspectiveCamera(fov, w / h, 3, 200000);
    cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld();
    U.uCam.value.set(...pos);
    U.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const t0 = performance.now();
    const { rt: big, rtPre } = passes(cam, w * ss, h * ss);
    rtPre.dispose();
    const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
    dsQuad.material.uniforms.uT.value = big.texture;
    dsQuad.material.uniforms.uPx.value.set(ss > 1 ? 0.66 / (w * ss) : 0, ss > 1 ? 0.66 / (h * ss) : 0);
    renderer.setRenderTarget(out); renderer.clear(); renderer.render(dsScene, dsCam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(out, 0, 0, w, h, px);
    big.dispose(); out.dispose(); renderer.setRenderTarget(null);
    // sky behind (the game's sky does this live), flip rows for the canvas
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); const im = cx.createImageData(w, h);
    const zen = new THREE.Color(LOOK.zen), hor = new THREE.Color(LOOK.hor);
    const ip = cam.projectionMatrixInverse, mw = cam.matrixWorld, v = new THREE.Vector3();
    for (let y = 0; y < h; y++) {
      v.set(0, 1 - 2 * (y + 0.5) / h, 0.5).applyMatrix4(ip).applyMatrix4(mw).sub(cam.position).normalize();
      const e = Math.pow(Math.min(Math.max(v.y, 0), 1), 0.38);
      const sk = hor.clone().lerp(zen, e);
      const sc = [sk.r, sk.g, sk.b].map((c) => Math.round(255 * Math.min(1, Math.pow(Math.min(1, c * LOOK.exposure), 1 / 2.2))));
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, a = px[s + 3] / 255;
        for (let c = 0; c < 3; c++) im.data[d + c] = px[s + c] * a + sc[c] * (1 - a);
        im.data[d + 3] = 255;
      }
    }
    cx.putImageData(im, 0, 0);
    return { url: cv.toDataURL('image/jpeg', 0.92), ms: Math.round(performance.now() - t0) };
  },
};
log('bake page loaded');
