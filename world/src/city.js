// What you see through the glass: sky, haze, and a generated city 360 m below (a long park to
// the north, rivers either side, dense towers to the south). A stand-in for the real world
// generator.
//
// Buildings are built from parts (one instanced draw for all of them): near the tower each lot
// gets its real silhouette (podium, setback tiers, stone cornices and belt courses, rooftop
// plant, antennas), further out fewer parts, at the horizon one box. A shared facade shader
// draws each style's windows in world metres (punched masonry, glass curtain wall, ribbon
// windows with balcony slabs, precast office grid, the supertall grid, our own terracotta and
// bronze), with a room behind every pane (interior mapping: walls, floor, ceiling, blinds, some
// offices lit), reveal shadows from the sun, sills, storefronts and sign bands, streaks and
// street grime; glass reflects the sky (the city's own darker tone below the horizon). Water
// tanks sit on the old roofs. The ground draws the street grid (avenues and streets, lanes,
// crosswalks, sidewalks, street trees) with cars moving on it; the park has crowns, lawns and
// paths; the rivers ripple.
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

// shared GLSL helpers
const NOISE = /* glsl */`
float cH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cN21(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cH21(i), cH21(i + vec2(1.0, 0.0)), u.x), mix(cH21(i + vec2(0.0, 1.0)), cH21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cRect(vec2 f, vec2 lo, vec2 hi, vec2 w) { vec2 a = smoothstep(lo, lo + w, f) * smoothstep(hi, hi - w, f); return a.x * a.y; }
`;

// City light shared by every city material: the sun's shadow from a static two-cascade depth
// map of all buildings (rendered once at load: buildings on buildings, streets, the park and
// the rivers), and aerial perspective (height haze integrated along the view ray, warmer toward
// the sun) applied before tone mapping. Calibrated on the view photos: deep shadow covers about
// a third of a sunny Manhattan view, and contrast halves by ~3 km.
const CITY_PARS = /* glsl */`
uniform sampler2D uShN; uniform sampler2D uShF; uniform mat4 uShMN; uniform mat4 uShMF; uniform vec4 uShK; uniform float uShOn;
uniform vec3 uHazeC; uniform vec3 uHazeSun; uniform float uHazeK; uniform float uStreetH; uniform vec3 uSunDirC;
varying vec3 vCw; varying vec3 vCn;
float cShT(sampler2D t, vec2 uv, float z) { return step(z, texture2D(t, uv).r); }
float cShadow(vec3 wp, vec3 n) {
  if (uShOn < 0.5) return 1.0;
  vec4 a = uShMN * vec4(wp + n * uShK.z * 1.5, 1.0);
  if (a.x > 0.002 && a.x < 0.998 && a.y > 0.002 && a.y < 0.998 && a.z < 1.0) {
    float z = a.z - 0.00004; float o = uShK.x * 0.5;
    return 0.25 * (cShT(uShN, a.xy + vec2(-o, -o), z) + cShT(uShN, a.xy + vec2(o, -o), z) + cShT(uShN, a.xy + vec2(-o, o), z) + cShT(uShN, a.xy + vec2(o, o), z));
  }
  a = uShMF * vec4(wp + n * uShK.w * 1.5, 1.0);
  if (a.x > 0.0 && a.x < 1.0 && a.y > 0.0 && a.y < 1.0 && a.z < 1.0) {
    float z = a.z - 0.00008; float o = uShK.y * 0.5;
    return 0.25 * (cShT(uShF, a.xy + vec2(-o, -o), z) + cShT(uShF, a.xy + vec2(o, -o), z) + cShT(uShF, a.xy + vec2(-o, o), z) + cShT(uShF, a.xy + vec2(o, o), z));
  }
  return 1.0;
}
vec3 cHaze(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition; float d = length(v);
  float H = 700.0;
  float y0 = max(cameraPosition.y - uStreetH, 0.0), y1 = max(wp.y - uStreetH, 0.0);
  float dy = y1 - y0;
  float od = abs(dy) < 1.0 ? exp(-y0 / H) * d : H * (exp(-y0 / H) - exp(-y1 / H)) / dy * d;
  float f = 1.0 - exp(-uHazeK * od);
  float s = pow(max(dot(v / max(d, 1.0), uSunDirC), 0.0), 6.0);
  return mix(col, mix(uHazeC, uHazeSun, s * 0.6), f);
}
`;
function cityInject(sh, CU) {
  Object.assign(sh.uniforms, CU);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCw; varying vec3 vCn;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 cw4 = vec4(transformed, 1.0); vec3 cn3 = objectNormal;
      #ifdef USE_INSTANCING
        cw4 = instanceMatrix * cw4; cn3 = mat3(instanceMatrix) * cn3;
      #endif
      vCw = (modelMatrix * cw4).xyz; vCn = normalize(mat3(modelMatrix) * cn3);`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + CITY_PARS)
    .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
      { float cs = cShadow(vCw, normalize(vCn)); reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs; }`)
    .replace('#include <opaque_fragment>', 'outgoingLight = cHaze(outgoingLight, vCw);\n#include <opaque_fragment>');
}

// reflections of the sky only would make glass glow where it should mirror the city below the
// horizon: darken the environment there
const ENV_CITY = THREE.ShaderChunk.envmap_physical_pars_fragment
  .replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
    'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\t\tfloat cCity = mix( 0.22, 1.0, smoothstep( -0.16, 0.04, reflectVec.y ) );')
  .replace('vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\n\t\t\tenvMapColor.rgb *= cCity;');

// ---- building parts -------------------------------------------------------------------------
// instance attributes: aInfo = (style, seed, part, floor height), aInfo2 = (bay width, shop
// floor, glass tint, mechanical floor every n). Styles: 0 masonry, 1 glass curtain wall,
// 2 ribbon-window residential, 3 precast office grid, 4 supertall grid, 5 our terracotta and
// bronze. Parts: 0 facade, 1 stone trim (cornice / belt course), 2 rooftop plant / louvres.
function buildingMaterial(CU) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0, fog: false });
  m.userData.u = { uStreet: { value: STREET }, uSunDir: { value: SUN }, uIntK: { value: 0.34 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aInfo; attribute vec4 aInfo2;
        varying vec3 vWp; varying vec3 vObjN; varying vec3 vLoc; varying vec3 vSize; varying vec4 vInfo; varying vec4 vInfo2;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 cq = vec4(transformed, 1.0);
        vSize = vec3(1.0);
        #ifdef USE_INSTANCING
          cq = instanceMatrix * cq;
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vWp = (modelMatrix * cq).xyz; vObjN = normal; vLoc = position; vInfo = aInfo; vInfo2 = aInfo2;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uStreet; uniform vec3 uSunDir; uniform float uIntK;
        varying vec3 vWp; varying vec3 vObjN; varying vec3 vLoc; varying vec3 vSize; varying vec4 vInfo; varying vec4 vInfo2;
        ${NOISE}`)
      .replace('#include <envmap_physical_pars_fragment>', ENV_CITY)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bN = vObjN;
        int bSt = int(vInfo.x + 0.5);
        float bSeed = vInfo.y, bPart = vInfo.z, bFh = vInfo.w;
        bool bX = abs(bN.x) > 0.5;
        float bFaceW = bX ? vSize.z : vSize.x;
        float bAlong = bX ? (vLoc.z + 0.5) * vSize.z : (vLoc.x + 0.5) * vSize.x;
        float bY = vWp.y - uStreet;
        float bTop = (1.0 - vLoc.y) * vSize.y;
        float bDist = length(vWp - cameraPosition);
        vec3 bCol = diffuseColor.rgb;
        float bWin = 0.0, bMet = 0.0, bRough = 0.86;
        vec3 bInt = vec3(0.0);
        bCol *= (0.9 + 0.2 * bSeed) * (0.9 + 0.2 * cN21(vWp.xz * 0.045 + vec2(vWp.y * 0.03, 0.0)));
        if (bN.y > 0.5) {
          // roof: tar and gravel, membrane patches, drains, coping round the edge
          float e = min((0.5 - abs(vLoc.x)) * vSize.x, (0.5 - abs(vLoc.z)) * vSize.z);
          float g = cN21(vWp.xz * 0.8) * 0.5 + cN21(vWp.xz * 0.19) * 0.5;
          float rt = cH21(vec2(bSeed * 91.0, floor(vWp.y * 0.5)));
          vec3 rc = rt < 0.38 ? vec3(0.07, 0.07, 0.072) : rt < 0.72 ? vec3(0.22, 0.21, 0.195) : rt < 0.93 ? vec3(0.5, 0.5, 0.48) : vec3(0.1, 0.15, 0.07);
          rc *= (0.8 + 0.4 * g) * (0.85 + 0.15 * step(0.45, cH21(floor(vWp.xz / 4.0))));
          float rfw = max(fwidth(vWp.x), fwidth(vWp.z));
          if (rfw < 0.8) {                                // rooftop units and vents (and their shadows)
            vec2 rcl = floor(vWp.xz / 3.2), rf = fract(vWp.xz / 3.2);
            float has = step(cH21(rcl + bSeed * 13.0), 0.16) * step(1.6, e);
            float unit = cRect(rf, vec2(0.18, 0.22), vec2(0.72, 0.68), vec2(0.04));
            float ush = cRect(rf, vec2(0.28, 0.28), vec2(0.86, 0.8), vec2(0.06)) * (1.0 - unit);
            rc = mix(rc, rc * 0.45, ush * has);
            rc = mix(rc, vec3(0.42, 0.43, 0.43) * (0.85 + 0.3 * cH21(rcl)), unit * has);
          }
          if (bPart > 1.5) rc = vec3(0.33, 0.34, 0.34) * (0.9 + 0.1 * g);
          bCol = mix(rc, bCol * 1.08, smoothstep(0.6, 0.4, e));
        } else if (bPart > 0.5 && bPart < 1.5) {
          // stone trim: lighter, moulded (grooves along it), shadowed underside line
          float gy = fract(bTop / 0.28);
          bCol *= 1.18 * (0.82 + 0.18 * smoothstep(0.0, 0.25, gy)) * mix(0.7, 1.0, smoothstep(0.0, 0.12, vLoc.y * vSize.y));
        } else if (bPart > 1.5) {
          // rooftop plant: louvred metal screen
          float l = fract(bY / 0.22);
          bCol = vec3(0.37, 0.38, 0.38) * (0.7 + 0.3 * smoothstep(0.08, 0.5, l)) * (0.9 + 0.1 * cN21(vec2(bAlong * 0.3, bY)));
          bRough = 0.55;
        } else {
          // ---- facade ----
          float nb = max(1.0, floor(bFaceW / vInfo2.x + 0.5));
          float cw = bFaceW / nb;
          vec2 cell = vec2(bAlong / cw, bY / bFh);
          vec2 f = fract(cell), ic = floor(cell);
          vec2 fw2 = fwidth(cell);
          float fw = max(fw2.x, fw2.y);
          vec2 lo = vec2(0.22, 0.24), hi = vec2(0.78, 0.82);
          float rev = 0.25;
          vec3 gT = vec3(0.045, 0.05, 0.055);
          if (bSt == 1) { lo = vec2(0.025, 0.15); hi = vec2(0.975, 0.985); rev = 0.04; gT = mix(vec3(0.2, 0.25, 0.29), vec3(0.3, 0.3, 0.27), vInfo2.z); }
          else if (bSt == 2) { lo = vec2(0.0, 0.27); hi = vec2(1.0, 0.94); rev = 0.9; }
          else if (bSt == 3) { lo = vec2(0.17, 0.2); hi = vec2(0.83, 0.84); rev = 0.35; gT = vec3(0.06, 0.07, 0.075); }
          else if (bSt == 4) { lo = vec2(0.09, 0.08); hi = vec2(0.91, 0.92); rev = 0.6; gT = vec3(0.06, 0.07, 0.08); }
          else if (bSt == 5) { lo = vec2(0.34, 0.05); hi = vec2(0.95, 0.97); rev = 0.35; gT = vec3(0.07, 0.07, 0.065); }
          if (bSt == 0) {                                  // masonry bays grouped in threes: wider piers between groups
            float gr = mod(ic.x + floor(bSeed * 3.0), 3.0);
            if (gr < 0.5) lo.x += 0.08; else if (gr > 1.5) hi.x -= 0.08;
          }
          // ground floor shops: tall glass, sign band over it
          bool shop = ic.y < 0.5 && vInfo2.y < 0.5 && bSt != 1 && bSt != 4 && bSt != 5;
          if (shop) { lo = vec2(0.05, 0.05); hi = vec2(0.95, 0.68); rev = 0.3; }
          // supertall: open mechanical floors (dark, no glass) every n floors
          float mechF = (vInfo2.w > 0.5 && mod(ic.y, vInfo2.w) < 0.5) ? 1.0 : 0.0;
          float win = cRect(f, lo, hi, fw2 * 1.5) * step(1.1, bTop) * (1.0 - mechF);
          float avg = (hi.x - lo.x) * (hi.y - lo.y);
          float lod = clamp(fw * 2.2 - 0.45, 0.0, 1.0);
          win = mix(win, avg * step(1.1, bTop) * (1.0 - mechF), lod);
          // wall detail per style
          vec3 wall = bCol;
          if (bSt == 1) {
            // curtain wall: dark metal mullions, spandrel glass band at each slab
            float spd = cRect(f, vec2(lo.x, 0.0), vec2(hi.x, lo.y), fw2 * 1.5);
            wall = mix(vec3(0.09, 0.095, 0.1) * (0.8 + 0.4 * bSeed), gT * 0.8, spd);
            bMet = mix(0.6, 1.0, spd); bRough = mix(0.4, 0.08, spd);
          } else if (bSt == 2) {
            // balcony slab edge (light concrete) and the dark shadow it throws on the window head
            float slab = 1.0 - smoothstep(0.1, 0.1 + fw2.y * 1.5, f.y);
            wall = mix(wall, vec3(0.78, 0.77, 0.74), slab);
            float rail = cRect(f, vec2(0.0, 0.1), vec2(1.0, 0.27), fw2) * 0.35;   // glass railing over the slab
            wall = mix(wall, vec3(0.2, 0.24, 0.26), rail);
            wall *= 1.0 - 0.55 * cRect(f, vec2(0.0, 0.94), vec2(1.0, 1.0), fw2);
          } else if (bSt == 4) {
            wall = vec3(0.78, 0.77, 0.74) * (0.95 + 0.1 * cN21(vWp.xz * 0.2 + bY * 0.1));
            wall = mix(wall, vec3(0.05), mechF * cRect(f, vec2(0.08), vec2(0.92), fw2) * 0.85);
          } else if (bSt == 5) {
            // bronze ribbon down every pier of the terracotta
            float br = cRect(f, vec2(0.04, 0.0), vec2(0.13, 1.0), fw2 * 1.5);
            wall = mix(wall, vec3(0.32, 0.24, 0.16), br); bMet = br * 0.8; bRough = mix(0.8, 0.35, br);
          }
          if (shop) {
            float sgn = cRect(f, vec2(0.04, 0.72), vec2(0.96, 0.88), fw2 * 1.5);
            vec3 sc = mix(vec3(0.6, 0.1, 0.08), vec3(0.1, 0.18, 0.35), step(0.5, cH21(ic + 4.2)));
            sc = mix(sc, vec3(0.08), step(0.7, cH21(ic + 9.1)));
            wall = mix(wall, sc, sgn * step(0.25, cH21(ic + 1.3)));
          }
          // sills (punched windows), streaks below them, street grime
          if (bSt == 0 || bSt == 3 || bSt == 5) {
            float sill = cRect(f, vec2(lo.x - 0.03, lo.y - 0.05), vec2(hi.x + 0.03, lo.y), fw2 * 1.5);
            wall = mix(wall, wall * 1.28, sill * (1.0 - lod));
            float strk = smoothstep(0.5, 0.95, cN21(vec2(bAlong * 1.7, bY * 0.05 + bSeed * 13.0)));
            wall *= 1.0 - 0.14 * strk * step(lo.x, f.x) * step(f.x, hi.x);
          }
          wall *= mix(0.72, 1.0, smoothstep(0.0, 16.0, bY));
          if (bSt == 0 || bSt == 5) {                      // stone belt course every few floors
            float every = 4.0 + floor(bSeed * 3.0);
            float belt = step(mod(ic.y, every), 0.5) * (1.0 - smoothstep(0.08, 0.08 + fw2.y * 1.5, f.y));
            wall = mix(wall, wall * 1.22, belt * (1.0 - lod));
          }
          // soot and rain: broad vertical stains from the top, patchy stone
          float stain = cN21(vec2(bAlong * 0.18 + bSeed * 40.0, bY * 0.012)) * cN21(vec2(bAlong * 0.6, bSeed * 7.0));
          wall *= 1.0 - 0.22 * smoothstep(0.25, 0.7, stain);
          wall *= 0.9 + 0.2 * cN21(vec2(bAlong, bY) * 0.09 + bSeed * 5.0);
          // the roof of a lower tier shades the foot of the tier above it
          float bBot = vLoc.y * vSize.y;
          if (vWp.y - bBot > uStreet + 2.0) wall *= mix(0.7, 1.0, smoothstep(0.0, 2.5, bBot));
          // reveal shadow: the head and one jamb shade the recessed glass on the sunny side
          vec3 Nw = bX ? vec3(sign(bN.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(bN.z));
          vec3 Tw = bX ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          float sn = dot(uSunDir, Nw);
          float shd = 1.0;
          if (sn > 0.03) {
            float sy = rev * uSunDir.y / sn, sx = rev * dot(uSunDir, Tw) / sn;
            float dTop = (hi.y - f.y) * bFh;
            float dSide = sx > 0.0 ? (hi.x - f.x) * cw : (f.x - lo.x) * cw;
            shd = max(step(dTop, sy), step(dSide, abs(sx)));
          }
          // a room behind every pane (interior mapping), near enough to read
          if (win > 0.003) {
            float rh = cH21(ic + bSeed * 91.0);
            vec3 c;
            if (bDist < 1700.0) {
              vec3 rd = normalize(vWp - cameraPosition);
              float ru = dot(rd, Tw), ry = rd.y, rw = max(-dot(rd, Nw), 0.02);
              float pu = f.x * cw, py = f.y * bFh;
              float D = mix(4.0, 9.0, cH21(ic + bSeed * 17.0));
              float tu = ru > 0.0 ? (cw - pu) / max(ru, 1e-4) : pu / max(-ru, 1e-4);
              float ty = ry > 0.0 ? (bFh - py) / max(ry, 1e-4) : py / max(-ry, 1e-4);
              float tw = D / rw;
              float t = min(min(tu, ty), tw);
              float hw = clamp(rw * t / D, 0.0, 1.0);
              vec3 wc = mix(vec3(0.5, 0.48, 0.44), vec3(0.78, 0.77, 0.73), cH21(ic + 3.1));
              if (t == tw) {
                vec2 bp = vec2((pu + ru * t) / cw, (py + ry * t) / bFh);
                c = wc * (1.0 - 0.4 * cRect(bp, vec2(0.55, 0.0), vec2(0.8, 0.7), vec2(0.03)) * step(0.5, rh));
              } else if (t == tu) c = wc * 0.78;
              else if (ry > 0.0) c = vec3(0.82, 0.82, 0.8);
              else c = mix(vec3(0.3, 0.22, 0.15), vec3(0.42, 0.42, 0.44), step(0.5, cH21(ic + 7.0)));
              float lit = step(0.9, rh);
              float lamp = lit * ((ry > 0.0 && t == ty) ? 1.7 : 0.8);
              c *= mix(1.0, 0.3, hw) * 0.6 + lamp * 0.45;
            } else {
              c = vec3(0.3) * (0.6 + step(0.9, rh) * 0.6);
            }
            // blinds / curtains drawn part way down
            float bl = (cH21(ic + 11.3) < (bSt == 1 ? 0.15 : 0.38) ? cH21(ic + 5.7) * 0.85 : 0.0) * (1.0 - lod);
            float wy = (f.y - lo.y) / max(hi.y - lo.y, 0.01);
            c = mix(c, vec3(0.8, 0.78, 0.73) * (0.6 + 0.4 * clamp(sn, 0.0, 1.0)), step(1.0 - bl, wy));
            c = mix(c, vec3(0.22), lod);                                   // far: no per-room speckle
            bInt = c * uIntK * mix(1.0, 0.55, shd * step(0.03, sn)) * win * (bSt == 1 ? 0.4 : 1.0);
          }
          bCol = mix(wall, gT * mix(1.0, 0.75, shd * step(0.03, sn)), win);
          bWin = win;
          bMet = mix(bMet, 1.0, win);
          bRough = mix(bRough, 0.04 + 0.07 * cH21(ic + 2.0) * (1.0 - lod), win);
        }
        diffuseColor.rgb = bCol;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = bRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = bMet;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bInt;');
    cityInject(sh, CU);
  };
  m.customProgramCacheKey = () => 'cityBuildings3';
  return m;
}

// open-bottomed unit box standing on y = 0 (the bottom is never seen)
function partGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const idx = Array.from(g.index.array);
  g.setIndex(idx.slice(0, 18).concat(idx.slice(24)));
  return g;
}

// rooftop water tank on its steel frame: staves, hoops, conical roof (r 1, h 1 body)
function tankGeometry() {
  const parts = [];
  const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };
  const body = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); body.translate(0, 0.9, 0); parts.push(col(body, '#6b5745'));
  const roof = new THREE.ConeGeometry(1.06, 0.5, 8, 1, true); roof.translate(0, 1.65, 0); parts.push(col(roof, '#33302d'));
  const base = new THREE.CylinderGeometry(1.0, 0.75, 0.4, 8, 1, true); base.translate(0, 0.2, 0); parts.push(col(base, '#252423'));
  const g = mergeAll(parts); g.computeVertexNormals(); return g;
}
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g;
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Island geometry (metres, x east, z south; the apartment sits at the origin)
const PARK = { x0: -380, x1: 420, z0: -4250, z1: -170 };
const westShore = (z) => (z > 6000 ? -1450 + (z - 6000) * 0.28 : -1450);
const eastShore = (z) => (z > 6000 ? 1750 - (z - 6000) * 0.42 : 1750);
const inPark = (x, z, m = 0) => x > PARK.x0 - m && x < PARK.x1 + m && z > PARK.z0 - m && z < PARK.z1 + m;
const AV = 270, ST = 80;                                  // avenue pitch (x), street pitch (z)

// ---- ground: streets, sidewalks, crosswalks, street trees and moving cars --------------------
const GROUND_FS = /* glsl */`
  vec2 gp = vGp.xz;
  bool g2 = gp.x < -2700.0 || gp.x > 2350.0;               // across the rivers: a coarser grid
  float gAV = g2 ? 160.0 : ${AV.toFixed(1)}, gST = g2 ? 140.0 : ${ST.toFixed(1)}, gOz = g2 ? 0.0 : 40.0;
  float aRd = g2 ? 7.0 : 11.5, aSw = g2 ? 10.0 : 15.0, sRd = g2 ? 7.0 : 6.5, sSw = 10.0;
  float ax = mod(gp.x + gAV * 0.5, gAV) - gAV * 0.5;         // across the avenue (centre 0)
  float sz = mod(gp.y - gOz + gST * 0.5, gST) - gST * 0.5;   // across the street
  float dax = abs(ax), dsz = abs(sz);
  vec2 gw = fwidth(gp);
  float gf = max(gw.x, gw.y);
  float onA = 1.0 - smoothstep(aRd - gf, aRd + gf, dax), onS = 1.0 - smoothstep(sRd - gf, sRd + gf, dsz);
  float swA = 1.0 - smoothstep(aSw - gf, aSw + gf, dax), swS = 1.0 - smoothstep(sSw - gf, sSw + gf, dsz);
  float road = max(onA, onS), walk = max(swA, swS) * (1.0 - road);
  float gn = cN21(gp * 0.35) * 0.6 + cN21(gp * 2.1) * 0.4;
  vec3 gc = vec3(0.24, 0.23, 0.215) * (0.85 + 0.3 * gn);                      // lots, yards, plazas
  gc = mix(gc, vec3(0.44, 0.43, 0.41) * (0.9 + 0.15 * gn), walk);               // sidewalks
  vec3 asph = vec3(0.085, 0.087, 0.09) * (0.8 + 0.4 * gn) * (1.0 + 0.25 * step(0.82, cN21(gp * 0.08)));
  gc = mix(gc, asph, road);
  float inter = onA * onS;
  // lane lines on the avenues (dashed), crosswalks at the corners, stop lines
  float lw = 0.075 + gf * 0.5;
  float lane = 0.0;
  for (int i = -2; i <= 2; i++) { float lx = float(i) * 3.4; if (i != 0) lane = max(lane, 1.0 - smoothstep(lw, lw + gf, abs(ax - lx))); }
  lane *= step(fract(gp.y / 9.0), 0.4) * onA * (1.0 - onS);
  float zebraA = onA * step(sSw + 0.5, dsz) * step(dsz, sSw + 4.0) * step(0.5, fract(gp.x / 1.1));
  float zebraS = onS * step(aSw + 0.5, dax) * step(dax, aSw + 4.0) * step(0.5, fract(gp.y / 1.1)) * (1.0 - onA);
  float mark = max(lane, max(zebraA, zebraS)) * (1.0 - clamp(gf * 1.8 - 0.4, 0.0, 1.0));
  gc = mix(gc, vec3(0.72, 0.71, 0.66), mark * (1.0 - inter) * 0.9);
  // street trees in the sidewalks: crowns with a shadow thrown toward the north-east
  if (walk > 0.1) {
    float alongT = swA > swS ? gp.y : gp.x;
    float acr = swA > swS ? dax : dsz;
    float rdW = swA > swS ? aRd : sRd, swW = swA > swS ? aSw : sSw;
    float slot = floor(alongT / 8.0);
    vec2 tc = vec2(fract(alongT / 8.0) * 8.0 - 4.0, acr - (rdW + 1.6));
    float hasT = step(0.3, cH21(vec2(slot, floor(gp.x / gAV) + floor(gp.y / gST) * 13.0)));
    float r = 2.3 + 0.6 * cH21(vec2(slot, 3.0));
    vec2 sh = tc - vec2(1.2, 1.0);
    float shadowT = 1.0 - smoothstep(r - 0.4, r + 0.4, length(sh));
    float crown = 1.0 - smoothstep(r - 0.3 - gf, r + gf, length(tc));
    gc *= 1.0 - 0.5 * shadowT * hasT;
    vec3 tg = mix(vec3(0.06, 0.11, 0.04), vec3(0.13, 0.18, 0.06), cH21(vec2(slot, 7.0))) * (0.75 + 0.5 * cN21(gp * 1.3));
    tg *= 0.8 + 0.4 * smoothstep(r, 0.0, length(tc + vec2(0.6, 0.6)));
    gc = mix(gc, tg, crown * hasT);
  }
  // cars: rectangles moving along the lanes (yellow cabs, dark, light, colours), with a shadow
  if (road > 0.5 && !g2) {
    float carM = 0.0; vec3 carC = vec3(0.0); float carSh = 0.0;
    if (onA > 0.5 && onS < 0.5) {
      float li = clamp(floor((ax + aRd) / 3.4), 0.0, 5.0);
      float lc = -aRd + (li + 0.5) * 3.4;
      float dirA = mod(floor((gp.x + gAV * 0.5) / gAV), 2.0) < 0.5 ? 1.0 : -1.0;
      float sp = 9.0 + 4.0 * cH21(vec2(li, 2.0));
      float s = gp.y - dirA * uTime * sp;
      float slot = floor(s / 14.0);
      float occ = step(0.74, cH21(vec2(slot, li * 7.0 + floor(gp.x / gAV))));
      float cl = cH21(vec2(slot, li + 31.0));
      vec2 q = vec2(ax - lc, fract(s / 14.0) * 14.0 - 7.0);
      float L = cl < 0.04 ? 6.2 : 2.3, W = cl < 0.04 ? 1.28 : 0.92;
      carM = occ * (1.0 - smoothstep(W - gf, W + gf, abs(q.x))) * (1.0 - smoothstep(L - gf, L + gf, abs(q.y)));
      carSh = occ * (1.0 - smoothstep(W + 0.3, W + 0.6, abs(q.x - 0.5))) * (1.0 - smoothstep(L + 0.2, L + 0.5, abs(q.y + 0.5)));
      carC = cl < 0.04 ? vec3(0.72, 0.74, 0.78) : cl < 0.18 ? vec3(0.78, 0.6, 0.08) : cl < 0.45 ? vec3(0.04) : cl < 0.65 ? vec3(0.75) : cl < 0.85 ? vec3(0.32, 0.33, 0.35) : cl < 0.93 ? vec3(0.1, 0.13, 0.25) : vec3(0.35, 0.06, 0.05);
      float roofP = (1.0 - smoothstep(0.55, 0.6, abs(q.x))) * (1.0 - smoothstep(0.9, 1.0, abs(q.y + dirA * 0.2)));
      carC = mix(carC, carC * 0.6 + 0.04, roofP * 0.4);
    } else if (onS > 0.5 && onA < 0.5) {
      float li = sz < 0.0 ? 0.0 : 1.0;
      float dirS = mod(floor((gp.y - gOz + gST * 0.5) / gST), 2.0) < 0.5 ? 1.0 : -1.0;
      float s = gp.x - dirS * uTime * 7.0;
      float slot = floor(s / 16.0);
      float occ = step(0.78, cH21(vec2(slot, li * 5.0 + floor((gp.y - gOz) / gST))));
      float cl = cH21(vec2(slot, li + 17.0));
      vec2 q = vec2(fract(s / 16.0) * 16.0 - 8.0, abs(sz) - 3.2);
      carM = occ * (1.0 - smoothstep(2.3 - gf, 2.3 + gf, abs(q.x))) * (1.0 - smoothstep(0.92 - gf, 0.92 + gf, abs(q.y)));
      carSh = occ * (1.0 - smoothstep(2.5, 2.9, abs(q.x + 0.5))) * (1.0 - smoothstep(1.2, 1.5, abs(q.y - 0.5)));
      carC = cl < 0.15 ? vec3(0.78, 0.6, 0.08) : cl < 0.5 ? vec3(0.05) : cl < 0.75 ? vec3(0.72) : vec3(0.18, 0.22, 0.32);
    }
    gc *= 1.0 - 0.45 * carSh;
    gc = mix(gc, carC, carM);
  }
  diffuseColor.rgb = gc;
`;

function groundMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, fog: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    cityInject(sh, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGp; uniform float uTime;\n${NOISE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_FS);
  };
  m.customProgramCacheKey = () => 'cityGround3';
  return m;
}

// park: tree crowns (lumpy, sunlit on the south-west side, autumn patches), lawns with mowing
// stripes, winding paths, the loop drive
function parkMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, fog: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    cityInject(sh, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGp; uniform vec3 uSunDir;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 pp = vGp.xz;
        float gf = max(fwidth(pp.x), fwidth(pp.y));
        // open ground: lawns (distorted ovals) and meadows
        vec2 dn = vec2(cN21(pp / 40.0), cN21(pp / 40.0 + 9.0)) * 50.0 - 25.0;
        vec2 l1 = (pp + dn - vec2(10.0, -1650.0)) / vec2(150.0, 115.0), l2 = (pp + dn - vec2(-80.0, -560.0)) / vec2(170.0, 95.0), l3 = (pp + dn - vec2(220.0, -3600.0)) / vec2(120.0, 160.0);
        float lawn = max(max(1.0 - smoothstep(0.92, 1.0, length(l1)), 1.0 - smoothstep(0.92, 1.0, length(l2))), 1.0 - smoothstep(0.92, 1.0, length(l3)));
        float meadow = smoothstep(0.66, 0.74, cN21(pp / 85.0 + 4.0));
        float dens = mix(0.93, 0.08, max(lawn, meadow * 0.7));
        // crowns on a jittered 9 m grid: the tallest crown over this point wins
        float best = -1.0; vec3 pN = vec3(0.0, 1.0, 0.0); float pid = 0.0, pq = 0.0;
        vec2 c0 = floor(pp / 9.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = c0 + vec2(float(i), float(j));
          if (cH21(c * 1.7 + 0.3) > dens) continue;
          vec2 cp = (c + 0.15 + 0.7 * vec2(cH21(c), cH21(c + 5.3))) * 9.0;
          float r = 4.2 + 3.6 * cH21(c + 9.1);
          vec2 d = pp - cp;
          float q = 1.0 - dot(d, d) / (r * r);
          if (q <= 0.0) continue;
          float h = sqrt(q) * r * (0.75 + 0.5 * cH21(c + 2.2));
          if (h > best) { best = h; pN = normalize(vec3(d.x, sqrt(q) * r * 1.1, d.y)); pid = cH21(c + 7.7); pq = q; }
        }
        float leafN = cN21(pp * 1.3) * 0.6 + cN21(pp * 3.7) * 0.4;
        vec3 pc;
        if (best > 0.0) {
          vec3 g1 = vec3(0.055, 0.1, 0.035), g2 = vec3(0.11, 0.15, 0.04), g3 = vec3(0.07, 0.1, 0.06);
          vec3 leaf = pid < 0.45 ? g1 : pid < 0.8 ? g2 : g3;
          float aut = smoothstep(0.62, 0.8, cN21(pp / 120.0 + 3.0));
          if (pid > 0.86) leaf = mix(leaf, mix(vec3(0.3, 0.24, 0.06), vec3(0.3, 0.12, 0.04), cH21(vec2(pid, 1.0))), 0.5 + 0.5 * aut);
          pc = leaf * (0.7 + 0.6 * leafN) * mix(0.55, 1.0, sqrt(pq));
          pN = normalize(pN + vec3(leafN - 0.5, 0.0, cN21(pp * 1.3 + 4.0) - 0.5) * 0.9);
        } else {
          vec3 grass = mix(vec3(0.13, 0.2, 0.06), vec3(0.16, 0.24, 0.07), step(0.5, fract(pp.x / 6.0))) * (0.9 + 0.2 * cN21(pp * 0.3));
          vec3 under = vec3(0.05, 0.06, 0.03) * (0.8 + 0.4 * leafN);
          pc = mix(under, grass, max(lawn, meadow));
          // paths where the ground is open: the 0.5 contour of a noise field, constant width
          float n0 = cN21(pp / 70.0), nx = cN21((pp + vec2(1.0, 0.0)) / 70.0), nz = cN21((pp + vec2(0.0, 1.0)) / 70.0);
          float pd = abs(n0 - 0.5) / max(length(vec2(nx - n0, nz - n0)), 1e-4);
          pc = mix(pc, vec3(0.42, 0.41, 0.38), (1.0 - smoothstep(1.3, 1.3 + gf, pd)) * 0.9);
        }
        float ex = min(min(pp.x - ${PARK.x0.toFixed(1)}, ${PARK.x1.toFixed(1)} - pp.x), min(pp.y - (${PARK.z0.toFixed(1)}), (${PARK.z1.toFixed(1)}) - pp.y));
        float drive = 1.0 - smoothstep(4.0, 4.0 + gf, abs(ex - 28.0));
        pc = mix(pc, vec3(0.12), drive * step(best, 3.0));
        pc = mix(pc, vec3(0.4, 0.39, 0.37), 1.0 - smoothstep(5.0, 5.0 + gf, ex));
        if (best <= 0.0 && drive < 0.5) pN = vec3(0.0, 1.0, 0.0);
        diffuseColor.rgb = pc;`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize((viewMatrix * vec4(pN, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'cityPark3';
  return m;
}

// rivers and lakes: rippled, the sun glinting off them
function waterMaterial(U, lake) {
  const m = new THREE.MeshStandardMaterial({ color: '#2f4654', roughness: 0.06, metalness: 0.0, envMapIntensity: 1.1, fog: false });
  if (lake) { m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -8; }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    cityInject(sh, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGp; uniform float uTime;\n${NOISE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vGp.xz;
          float e = 0.6;
          float w0 = cN21(wp / 7.0 + vec2(uTime * 0.05, uTime * 0.03)) + 0.5 * cN21(wp / 2.3 - vec2(uTime * 0.11, 0.0));
          float wx = cN21((wp + vec2(e, 0.0)) / 7.0 + vec2(uTime * 0.05, uTime * 0.03)) + 0.5 * cN21((wp + vec2(e, 0.0)) / 2.3 - vec2(uTime * 0.11, 0.0));
          float wz = cN21((wp + vec2(0.0, e)) / 7.0 + vec2(uTime * 0.05, uTime * 0.03)) + 0.5 * cN21((wp + vec2(0.0, e)) / 2.3 - vec2(uTime * 0.11, 0.0));
          float k = 0.35 * (1.0 - clamp(length(fwidth(wp)) * 0.15, 0.0, 0.9));
          vec3 wn = normalize(vec3(-(wx - w0) / e * k, 1.0, -(wz - w0) / e * k));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => (lake ? 'cityLake3' : 'cityWater3');
  return m;
}

export function buildCity(scene, renderer, Q) {
  const world = new THREE.Group(); world.name = 'city';
  scene.add(world);
  const U = {
    uTime: { value: 0 }, uSunDir: { value: SUN },
    uShN: { value: null }, uShF: { value: null }, uShMN: { value: new THREE.Matrix4() }, uShMF: { value: new THREE.Matrix4() },
    uShK: { value: new THREE.Vector4() }, uShOn: { value: 0 },
    uHazeC: { value: HORIZON.clone().lerp(HAZE, 0.5) }, uHazeSun: { value: new THREE.Color(1.0, 0.92, 0.8) }, uHazeK: { value: 2.4e-4 },
    uStreetH: { value: STREET }, uSunDirC: { value: SUN },
  };

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
  const groundMat = groundMaterial(U);
  const farGround = new THREE.MeshStandardMaterial({ color: '#4a4b4c', roughness: 0.95, fog: false });
  farGround.onBeforeCompile = (sh) => cityInject(sh, U); farGround.customProgramCacheKey = () => 'cityFar3';
  const water = waterMaterial(U, false);
  water.envMap = scene.environment;
  const strip = (x0, x1, z0, z1, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.matrixAutoUpdate = false; m.updateMatrix(); world.add(m); return m; };
  const G = STREET - 0.05, Z0 = -16000, Z1 = 9400, FAR = 16000;
  strip(-1450, PARK.x0, Z0, Z1, groundMat, G); strip(PARK.x1, 1750, Z0, Z1, groundMat, G);
  strip(PARK.x0, PARK.x1, Z0, PARK.z0, groundMat, G); strip(PARK.x0, PARK.x1, PARK.z1, Z1, groundMat, G);
  strip(-7500, -2700, Z0, Z1, groundMat, G); strip(2350, 7500, Z0, Z1, groundMat, G);
  strip(-FAR, -7500, Z0, Z1, farGround, G); strip(7500, FAR, Z0, Z1, farGround, G);
  strip(-2700, -1450, Z0, Z1, water, G); strip(1750, 2350, Z0, Z1, water, G);
  strip(-FAR, FAR, Z1, FAR, water, G);
  strip(PARK.x0, PARK.x1, PARK.z0, PARK.z1, parkMaterial(U), G);
  const lakeMat = waterMaterial(U, true); lakeMat.envMap = scene.environment;
  for (const [lx, lz, rx, rz] of [[0, -2700, 330, 420], [-60, -1050, 230, 120], [300, -330, 60, 40]]) {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lakeMat);
    lake.scale.set(rx, rz, 1); lake.rotation.x = -Math.PI / 2; lake.position.set(lx, G + 0.3, lz); world.add(lake);
  }

  // ---- lots -----------------------------------------------------------------------------------
  const R = rng(1957), lots = [];
  // palette from the view photos (k-means of the lit facades in apartment-16 / -21): cream, tan,
  // taupe, limestone and cool greys, muted brick; nothing saturated
  const masonry = ['#cdbfa9', '#bcae98', '#a89a86', '#988b7a', '#b5ab9d', '#a59e94', '#c6bcae', '#8f8476', '#b8a894', '#9d9284'].map((c) => new THREE.Color(c));
  const brick = ['#7e6252', '#8b6e5c', '#735a4c', '#90786a', '#6e5649'].map((c) => new THREE.Color(c));
  const glassC = ['#7c8287', '#6b7177', '#8a8f92', '#5f656a'].map((c) => new THREE.Color(c));
  const pale = ['#b9b4aa', '#c3beb3', '#a9a59c', '#cbc6bb'].map((c) => new THREE.Color(c));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const heightAt = (x, z) => {
    const nearPark = (z < PARK.z1 + 40 && z > PARK.z0 - 40) && (Math.abs(x - PARK.x0) < 320 || Math.abs(x - PARK.x1) < 320);
    if (z > -170 && z < 2600) { let h = 50 + Math.pow(R(), 1.6) * 190; if (z < 700 && z > 60 && R() < 0.06) h = 250 + R() * 170; return h; }
    if (z >= 2600 && z < 5200) return 22 + Math.pow(R(), 2) * 80;
    if (z >= 5200) { let h = 50 + Math.pow(R(), 1.5) * 170; if (R() < 0.05) h = 240 + R() * 160; return h; }
    if (z < -4300) return 15 + R() * 35;
    return nearPark ? 45 + R() * 90 : 22 + Math.pow(R(), 1.5) * 55;
  };
  const styleFor = (h) => {
    const r = R();
    if (h > 140) return r < 0.6 ? 1 : r < 0.75 ? 3 : r < 0.9 ? 2 : 0;
    if (h > 40) return r < 0.38 ? 0 : r < 0.66 ? 2 : r < 0.85 ? 3 : 1;
    return r < 0.7 ? 0 : r < 0.85 ? 3 : 2;
  };
  const colourFor = (st) => (st === 1 ? pick(glassC) : st === 0 ? (R() < 0.35 ? pick(brick) : pick(masonry)) : st === 3 ? pick(pale) : R() < 0.5 ? pick(pale) : pick(masonry));
  const addLot = (x, z, w, d, h, st) => { const s = st ?? styleFor(h); lots.push({ x, z, w, d, h, st: s, col: colourFor(s), seed: R() }); };
  const avW = 30, stW = 18;
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
      const near = Math.hypot((bx0 + bx1) / 2, z) < 2600;
      let px = bx0;
      while (px < bx1 - 8) {
        const w = Math.min(bx1 - px, (near ? 9 : 18) + R() * (far ? 80 : near ? 30 : 45));
        const cx = px + w / 2, cz = z + ST / 2, D = ST - stW - 2;
        if (near && R() < 0.55) {                         // two buildings back to back
          addLot(cx, cz - D / 4 - 0.5, w - 2, D / 2 - 1, heightAt(px, z));
          addLot(cx, cz + D / 4 + 0.5, w - 2, D / 2 - 1, heightAt(px, z));
        } else addLot(cx, cz, w - 2, D, heightAt(px, z));
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
      addLot(x + 80, z + 70, 40 + R() * 70, 40 + R() * 60, h, R() < 0.2 ? 1 : R() < 0.5 ? 0 : 2);
    }
  }

  // ---- parts ----------------------------------------------------------------------------------
  const FH = [3.4, 4.0, 3.05, 3.8, 4.7, 4.6], BAY = [1.9, 1.5, 2.6, 1.7, 4.7, 2.3];
  // detail radii: full silhouettes near, tiers further out, one box at the horizon (Quest nearer)
  const NEAR_R = Q.quest ? 1600 : 2600, MID_R = Q.quest ? 3600 : 6000, TANK_R = Q.quest ? 1000 : 1700;
  const parts = [], tanks = [];
  const part = (x, y0, z, w, h, d, col, st, seed, kind, extra = {}) => {
    if (w < 0.5 || d < 0.5 || h < 0.3) return;
    parts.push({ x, y0, z, w, h, d, col, st, seed, kind, fh: extra.fh ?? FH[st], bay: (extra.bay ?? BAY[st]) * (0.9 + 0.25 * seed), shop: extra.shop ?? 0, tint: extra.tint ?? seed, mech: extra.mech ?? 0 });
  };
  const trim = (b, x, z, w, d, y, hh, out) => part(x, y, z, w + out * 2, hh, d + out * 2, b.col, b.st, b.seed, 1);
  const roofKit = (b, x, z, w, d, top, near) => {
    if (!near) return;
    const r = R();
    // stair / elevator bulkhead and plant screen
    if (w > 10 && d > 10) {
      const bw = Math.min(w * (0.25 + 0.2 * r), 14), bd = Math.min(d * (0.25 + 0.2 * R()), 12);
      part(x + (R() - 0.5) * (w - bw) * 0.6, top, z + (R() - 0.5) * (d - bd) * 0.6, bw, 3.2 + R() * 3, bd, b.col, b.st, b.seed, 2);
      if (R() < 0.6) { const aw = 1.4 + R() * 2.2; part(x + (R() - 0.5) * (w - aw) * 0.8, top, z + (R() - 0.5) * (d - aw) * 0.8, aw, 1.2 + R() * 0.8, aw * (0.6 + R() * 0.8), b.col, b.st, b.seed, 2); }
    }
    // water tank on the older, lower roofs
    if ((b.st === 0 || b.st === 2) && b.h > 14 && b.h < 140 && Math.hypot(x, z) < TANK_R && R() < 0.62 && w > 8 && d > 8) {
      const tr = 1.9 + R() * 1.3, th = 3.4 + R() * 1.6;
      tanks.push([x + (R() - 0.5) * (w - 2 * tr - 2) * 0.8, top, z + (R() - 0.5) * (d - 2 * tr - 2) * 0.8, tr, th]);
    }
  };
  const emit = (b) => {
    const dist = Math.hypot(b.x, b.z);
    const near = dist < NEAR_R, mid = dist < MID_R;
    const y0 = STREET;
    if (!mid) { part(b.x, y0, b.z, b.w, b.h, b.d, b.col, b.st, b.seed, 0); return; }
    const insetOk = (i) => b.w - 2 * i > 9 && b.d - 2 * i > 9;
    if (b.st === 0 && b.h > 55) {                       // masonry setbacks, cornice on each tier
      const t1 = b.h * (0.55 + 0.2 * R()), t2 = b.h * (0.82 + 0.1 * R());
      let i1 = 2 + R() * 3; let i2 = i1 + 2 + R() * 2.5;
      if (!insetOk(i1)) i1 = 0; if (!insetOk(i2)) i2 = i1;
      part(b.x, y0, b.z, b.w, t1, b.d, b.col, 0, b.seed, 0, { shop: 0 });
      part(b.x, y0 + t1, b.z, b.w - 2 * i1, t2 - t1, b.d - 2 * i1, b.col, 0, b.seed, 0, { shop: 1 });
      part(b.x, y0 + t2, b.z, b.w - 2 * i2, b.h - t2, b.d - 2 * i2, b.col, 0, b.seed, 0, { shop: 1 });
      if (near) {
        trim(b, b.x, b.z, b.w, b.d, y0 + t1 - 0.9, 0.9, 0.35);
        trim(b, b.x, b.z, b.w - 2 * i1, b.d - 2 * i1, y0 + t2 - 0.9, 0.9, 0.3);
        trim(b, b.x, b.z, b.w - 2 * i2, b.d - 2 * i2, y0 + b.h - 0.9, 0.9, 0.3);
        trim(b, b.x, b.z, b.w, b.d, y0 + 4.4, 0.45, 0.15);
      }
      roofKit(b, b.x, b.z, b.w - 2 * i2, b.d - 2 * i2, y0 + b.h, near);
      if (b.h > 200 && near) part(b.x, y0 + b.h, b.z, 1.2, 18 + R() * 30, 1.2, b.col, 0, b.seed, 2);
      return;
    }
    if ((b.st === 1 || b.st === 3) && b.h > 90 && insetOk(4)) {   // podium + tower (+ crown)
      const ph = 14 + R() * 12, i = 3 + R() * 3;
      part(b.x, y0, b.z, b.w, ph, b.d, b.col, b.st, b.seed, 0, { tint: b.seed });
      if (near) trim(b, b.x, b.z, b.w, b.d, y0 + ph - 0.6, 0.6, 0.2);
      const crown = R() < 0.3 && b.h > 160 && insetOk(i + 2);
      const top = crown ? b.h * (0.9 + 0.05 * R()) : b.h;
      part(b.x, y0 + ph, b.z, b.w - 2 * i, top - ph, b.d - 2 * i, b.col, b.st, b.seed, 0, { shop: 1 });
      if (crown) part(b.x, y0 + top, b.z, b.w - 2 * (i + 2), b.h - top, b.d - 2 * (i + 2), b.col, b.st, b.seed, 0, { shop: 1 });
      const cw = crown ? b.w - 2 * (i + 2) : b.w - 2 * i, cd = crown ? b.d - 2 * (i + 2) : b.d - 2 * i;
      if (near) part(b.x, y0 + b.h, b.z, cw * 0.7, 4.5 + R() * 2, cd * 0.7, b.col, b.st, b.seed, 2);
      if (b.h > 260 && R() < 0.3) part(b.x, y0 + b.h + 6, b.z, 1.0, 25 + R() * 45, 1.0, b.col, b.st, b.seed, 2);
      return;
    }
    if (b.st === 2 && b.h > 45 && R() < 0.4 && insetOk(3)) {
      const t1 = b.h * (0.6 + 0.2 * R());
      part(b.x, y0, b.z, b.w, t1, b.d, b.col, 2, b.seed, 0);
      part(b.x, y0 + t1, b.z, b.w - 6, b.h - t1, b.d - 6, b.col, 2, b.seed, 0, { shop: 1 });
      roofKit(b, b.x, b.z, b.w - 6, b.d - 6, y0 + b.h, near);
      return;
    }
    part(b.x, y0, b.z, b.w, b.h, b.d, b.col, b.st, b.seed, 0);
    if (near && b.st === 0) { trim(b, b.x, b.z, b.w, b.d, y0 + b.h - 0.8, 0.8, 0.3); if (b.h > 14) trim(b, b.x, b.z, b.w, b.d, y0 + 4.4, 0.4, 0.12); }
    roofKit(b, b.x, b.z, b.w, b.d, y0 + b.h, near);
  };
  for (const b of lots) emit(b);

  // neighbours on our street (seen through the east and west slots and the corner glass)
  const N = (x, z, w, d, h, st, col) => ({ x, z, w, d, h, st, col: new THREE.Color(col), seed: R() });
  {
    const a = N(520, 30, 30, 30, 430, 4, '#d8d5cd');                     // grid supertall
    part(a.x, STREET, a.z, a.w, a.h, a.d, a.col, 4, a.seed, 0, { mech: 12 });
    const b = N(-330, 10, 26, 52, 330, 1, '#6b7177');                     // stepped glass tower
    part(b.x, STREET, b.z, b.w, 30, b.d, b.col, 1, 0.2, 0, { shop: 1 });
    part(b.x, STREET + 30, b.z, b.w - 4, 210, b.d - 4, b.col, 1, 0.2, 0, { shop: 1 });
    part(b.x + 2, STREET + 240, b.z, b.w - 8, 60, b.d - 14, b.col, 1, 0.2, 0, { shop: 1 });
    part(b.x + 4, STREET + 300, b.z + 4, b.w - 14, 30, b.d - 26, b.col, 1, 0.2, 0, { shop: 1 });
    const c = N(930, -20, 30, 30, 420, 1, '#7c8287');                     // glass tower with a crown
    part(c.x, STREET, c.z, 40, 22, 40, c.col, 3, c.seed, 0);
    part(c.x, STREET + 22, c.z, c.w, 360, c.d, c.col, 1, 0.75, 0, { shop: 1 });
    part(c.x, STREET + 382, c.z, c.w - 6, 38, c.d - 6, c.col, 1, 0.75, 0, { shop: 1 });
    part(c.x, STREET + 420, c.z, 1.6, 60, 1.6, c.col, 1, 0.75, 2);
    const d = N(-760, 40, 40, 60, 300, 0, '#b3a895');                    // prewar setback with a spire
    const dd = { ...d };
    for (const [y0, y1, i] of [[0, 140, 0], [140, 220, 4], [220, 270, 8], [270, 300, 12]]) {
      part(dd.x, STREET + y0, dd.z, dd.w - 2 * i, y1 - y0, dd.d - 2 * i, dd.col, 0, dd.seed, 0, { shop: y0 > 0 ? 1 : 0 });
      trim(dd, dd.x, dd.z, dd.w - 2 * i, dd.d - 2 * i, STREET + y1 - 1.2, 1.2, 0.4);
    }
    part(dd.x, STREET + 300, dd.z, 4, 22, 4, dd.col, 0, dd.seed, 1);
    part(dd.x, STREET + 322, dd.z, 1.2, 45, 1.2, dd.col, 0, dd.seed, 2);
    const e = N(1250, 60, 34, 34, 260, 2, '#d3cec4');                     // residential slab
    part(e.x, STREET, e.z, e.w, e.h, e.d, e.col, 2, e.seed, 0);
    part(e.x, STREET + e.h, e.z, 18, 5, 18, e.col, 2, e.seed, 2);
  }

  // our own tower: the shaft below the apartment and the setback crown above it
  {
    const col = new THREE.Color('#8e7461'), sd = 0.5;
    part(8.8, STREET, 9.6, 18.0, -0.62 - STREET, 19.6, col, 5, sd, 0, { shop: 1 });
    for (const [x0, y0, x1, y1] of [[0.4, 8.6, 17.2, 20], [1.6, 20, 16.0, 38], [3.4, 38, 14.2, 60]]) {
      part((x0 + x1) / 2, y0, (x0 + x1) / 2, x1 - x0, y1 - y0, x1 - x0, col, 5, sd, 0, { shop: 1 });
      part((x0 + x1) / 2, y1 - 0.5, (x0 + x1) / 2, x1 - x0 + 0.5, 0.5, x1 - x0 + 0.5, new THREE.Color('#4a3a2c'), 5, sd, 1);
    }
  }

  // tiles of 2 km, each its own instanced mesh with a bounding sphere, so whatever is behind you
  // or out of the window is not drawn; all of them cast into the city shadow map (layer 2)
  const TILE = 2000;
  const tileOf = (x, z) => Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
  const bm = buildingMaterial(U);
  bm.envMap = scene.environment; bm.envMapIntensity = 1.35;   // own strength: glass mirrors the full sky (the room's 0.55 is for interiors)
  const base = partGeometry();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const groups = new Map();
  for (const t of parts) { const k2 = tileOf(t.x, t.z); if (!groups.has(k2)) groups.set(k2, []); groups.get(k2).push(t); }
  const meshes = [];
  for (const list of groups.values()) {
    const g = base.clone(), n = list.length;
    const info = new Float32Array(n * 4), info2 = new Float32Array(n * 4);
    const im = new THREE.InstancedMesh(g, bm, n);
    list.forEach((t, i) => {
      m4.compose(p.set(t.x, t.y0, t.z), q, s.set(t.w, t.h, t.d)); im.setMatrixAt(i, m4); im.setColorAt(i, t.col);
      info.set([t.st, t.seed, t.kind, t.fh], i * 4);
      info2.set([t.bay, t.shop, t.tint, t.mech], i * 4);
    });
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    g.setAttribute('aInfo2', new THREE.InstancedBufferAttribute(info2, 4));
    im.computeBoundingSphere();
    im.layers.enable(2); im.matrixAutoUpdate = false;
    world.add(im); meshes.push(im);
  }
  const n = parts.length;

  // water tanks (same tiles)
  const tg = tankGeometry();
  const tankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, fog: false });
  tankMat.onBeforeCompile = (sh) => cityInject(sh, U);
  tankMat.customProgramCacheKey = () => 'cityTank3';
  const tgroups = new Map();
  for (const t of tanks) { const k2 = tileOf(t[0], t[2]); if (!tgroups.has(k2)) tgroups.set(k2, []); tgroups.get(k2).push(t); }
  for (const list of tgroups.values()) {
    const tim = new THREE.InstancedMesh(tg, tankMat, list.length);
    list.forEach(([x, y, z, r, h], i) => { m4.compose(p.set(x, y, z), q, s.set(r, h, r)); tim.setMatrixAt(i, m4); });
    tim.computeBoundingSphere(); tim.layers.enable(2); tim.matrixAutoUpdate = false;
    world.add(tim); meshes.push(tim);
  }

  // the sun's shadow over the city: two static orthographic depth maps, drawn once now
  {
    const cas = Q.quest ? [[1500, 2048], [7000, 1024]] : [[1800, 3072], [9000, 2048]];
    const depthMat = new THREE.MeshDepthMaterial();
    const prevRT = renderer.getRenderTarget(), xr = renderer.xr.enabled, ov = scene.overrideMaterial;
    renderer.xr.enabled = false;
    const centre = new THREE.Vector3(0, STREET + 60, -300);
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    world.updateMatrixWorld(true);
    cas.forEach(([half, size], i) => {
      const dt = new THREE.DepthTexture(size, size);
      const rt = new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthTexture: dt, depthBuffer: true, generateMipmaps: false });
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 100, 16000);
      cam.position.copy(centre).addScaledVector(SUN, 8000); cam.lookAt(centre);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      cam.layers.set(2);
      scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(rt); renderer.clear(true, true, true);
      renderer.render(scene, cam);
      const M = bias.clone().multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      U[i ? 'uShF' : 'uShN'].value = dt; U[i ? 'uShMF' : 'uShMN'].value.copy(M);
      U.uShK.value.setComponent(i, 1 / size); U.uShK.value.setComponent(2 + i, (2 * half) / size);
    });
    scene.overrideMaterial = ov; renderer.setRenderTarget(prevRT); renderer.xr.enabled = xr;
    U.uShOn.value = 1;
  }

  let tri = 0; tri += n * 10 + tanks.length * (tg.attributes.position.count / 3);
  return {
    world, sky, count: n, lots: lots.length, tanks: tanks.length, triangles: tri, tiles: meshes.length,
    update(t) { U.uTime.value = t; },
  };
}
