import { B as ke, T as Ne } from "./B3DMLoaderBase-p2hcBFT-.js";
import { g as Be, r as He } from "./LoaderBase-ATuDWTDB.js";
import { DefaultLoadingManager as kt, Matrix4 as z, Vector3 as y, Vector2 as W, MathUtils as T, PointsMaterial as je, BufferGeometry as Ge, BufferAttribute as nt, Color as Ze, Points as qe, InstancedMesh as Qe, Quaternion as st, Group as wt, Ray as Nt, Sphere as $e, Frustum as Ye, Matrix3 as Xe, LoadingManager as Ke, EventDispatcher as yt, Euler as Je, Mesh as ti, PlaneGeometry as ei, ShaderMaterial as ii, Plane as Ce, Raycaster as si, PerspectiveCamera as se, OrthographicCamera as Se, Clock as oi } from "three";
import { GLTFLoader as ee } from "three/addons/loaders/GLTFLoader.js";
import { PNTSLoaderBase as ni, I3DMLoaderBase as ri, CMPTLoaderBase as ai } from "./index.core.js";
import { W as Tt, O as oe, b as ci, e as li, a as hi } from "./MemoryUtils-DdeKsIT5.js";
class Ee extends ke {
  constructor(t = kt) {
    super(), this.manager = t, this.adjustmentTransform = new z();
  }
  /**
   * Parses a b3dm buffer and resolves to a GLTF result object extended with legacy
   * tile metadata. Both `model` and `model.scene` receive the extra fields.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ scene: Group, scenes: Array, batchTable: BatchTable, featureTable: FeatureTable }>}
   */
  parse(t) {
    const e = super.parse(t), i = e.glbBytes.slice().buffer;
    return new Promise((s, o) => {
      const n = this.manager, r = this.fetchOptions, a = n.getHandler("path.gltf") || new ee(n);
      r.credentials === "include" && r.mode === "cors" && a.setCrossOrigin("use-credentials"), "credentials" in r && a.setWithCredentials(r.credentials === "include"), r.headers && a.setRequestHeader(r.headers);
      let c = this.workingPath;
      !/[\\/]$/.test(c) && c.length && (c += "/");
      const p = this.adjustmentTransform;
      a.parse(i, c, (h) => {
        const { batchTable: m, featureTable: u } = e, { scene: l } = h, d = u.getData("RTC_CENTER", 1, "FLOAT", "VEC3");
        d && (l.position.x += d[0], l.position.y += d[1], l.position.z += d[2]), h.scene.updateMatrix(), h.scene.matrix.multiply(p), h.scene.matrix.decompose(h.scene.position, h.scene.quaternion, h.scene.scale), h.batchTable = m, h.featureTable = u, l.batchTable = m, l.featureTable = u, s(h);
      }, o);
    });
  }
}
function pi(f) {
  const t = f >> 11, e = f >> 5 & 63, i = f & 31, s = Math.round(t / 31 * 255), o = Math.round(e / 63 * 255), n = Math.round(i / 31 * 255);
  return [s, o, n];
}
const bt = /* @__PURE__ */ new W();
function di(f, t, e = new y()) {
  bt.set(f, t).divideScalar(256).multiplyScalar(2).subScalar(1), e.set(bt.x, bt.y, 1 - Math.abs(bt.x) - Math.abs(bt.y));
  const i = T.clamp(-e.z, 0, 1);
  return e.x >= 0 ? e.setX(e.x - i) : e.setX(e.x + i), e.y >= 0 ? e.setY(e.y - i) : e.setY(e.y + i), e.normalize(), e;
}
const ne = {
  RGB: "color",
  POSITION: "position"
};
class Re extends ni {
  constructor(t = kt) {
    super(), this.manager = t;
  }
  /**
   * Parses a pnts buffer and resolves to a result object containing a constructed
   * three.js `Points` scene with metadata attached.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ scene: Points, batchTable: BatchTable, featureTable: FeatureTable }>}
   */
  parse(t) {
    return super.parse(t).then(async (e) => {
      const { featureTable: i, batchTable: s } = e, o = new je(), n = i.header.extensions, r = new y();
      let a;
      if (n && n["3DTILES_draco_point_compression"]) {
        const { byteOffset: h, byteLength: m, properties: u } = n["3DTILES_draco_point_compression"], l = this.manager.getHandler("draco.drc");
        if (l == null)
          throw new Error("PNTSLoader: dracoLoader not available.");
        const d = {};
        for (const M in u)
          if (M in ne && M in u) {
            const P = ne[M];
            d[P] = u[M];
          }
        const x = {
          attributeIDs: d,
          attributeTypes: {
            position: "Float32Array",
            color: "Uint8Array"
          },
          useUniqueIDs: !0
        }, O = i.getBuffer(h, m);
        a = await l.decodeGeometry(O, x), a.attributes.color && (o.vertexColors = !0);
      } else {
        const h = i.getData("POINTS_LENGTH"), m = i.getData("POSITION", h, "FLOAT", "VEC3"), u = i.getData("NORMAL", h, "FLOAT", "VEC3"), l = i.getData("NORMAL", h, "UNSIGNED_BYTE", "VEC2"), d = i.getData("RGB", h, "UNSIGNED_BYTE", "VEC3"), x = i.getData("RGBA", h, "UNSIGNED_BYTE", "VEC4"), O = i.getData("RGB565", h, "UNSIGNED_SHORT", "SCALAR"), M = i.getData("CONSTANT_RGBA", h, "UNSIGNED_BYTE", "VEC4"), P = i.getData("POSITION_QUANTIZED", h, "UNSIGNED_SHORT", "VEC3"), g = i.getData("QUANTIZED_VOLUME_SCALE", h, "FLOAT", "VEC3"), R = i.getData("QUANTIZED_VOLUME_OFFSET", h, "FLOAT", "VEC3");
        if (a = new Ge(), P) {
          const D = new Float32Array(h * 3);
          for (let v = 0; v < h; v++)
            for (let C = 0; C < 3; C++) {
              const F = 3 * v + C;
              D[F] = P[F] / 65535 * g[C];
            }
          r.x = R[0], r.y = R[1], r.z = R[2], a.setAttribute("position", new nt(D, 3, !1));
        } else
          a.setAttribute("position", new nt(m, 3, !1));
        if (u !== null)
          a.setAttribute("normal", new nt(u, 3, !1));
        else if (l !== null) {
          const D = new Float32Array(h * 3), v = new y();
          for (let C = 0; C < h; C++) {
            const F = l[C * 2], ot = l[C * 2 + 1], A = di(F, ot, v);
            D[C * 3] = A.x, D[C * 3 + 1] = A.y, D[C * 3 + 2] = A.z;
          }
          a.setAttribute("normal", new nt(D, 3, !1));
        }
        if (x !== null)
          a.setAttribute("color", new nt(x, 4, !0)), o.vertexColors = !0, o.transparent = !0, o.depthWrite = !1;
        else if (d !== null)
          a.setAttribute("color", new nt(d, 3, !0)), o.vertexColors = !0;
        else if (O !== null) {
          const D = new Uint8Array(h * 3);
          for (let v = 0; v < h; v++) {
            const C = pi(O[v]);
            for (let F = 0; F < 3; F++) {
              const ot = 3 * v + F;
              D[ot] = C[F];
            }
          }
          a.setAttribute("color", new nt(D, 3, !0)), o.vertexColors = !0;
        } else if (M !== null) {
          const D = new Ze(M[0], M[1], M[2]);
          o.color = D;
          const v = M[3] / 255;
          v < 1 && (o.opacity = v, o.transparent = !0, o.depthWrite = !1);
        }
      }
      const c = new qe(a, o);
      c.position.copy(r), e.scene = c, e.scene.featureTable = i, e.scene.batchTable = s;
      const p = i.getData("RTC_CENTER", 1, "FLOAT", "VEC3");
      return p && (e.scene.position.x += p[0], e.scene.position.y += p[1], e.scene.position.z += p[2]), e;
    });
  }
}
const Dt = /* @__PURE__ */ new y(), ht = /* @__PURE__ */ new y(), pt = /* @__PURE__ */ new y(), Ht = /* @__PURE__ */ new y(), Ct = /* @__PURE__ */ new st(), St = /* @__PURE__ */ new y(), dt = /* @__PURE__ */ new z(), re = /* @__PURE__ */ new z(), ae = /* @__PURE__ */ new y(), ce = /* @__PURE__ */ new z(), jt = /* @__PURE__ */ new st(), Gt = {};
function le(f, t, e, i) {
  if (f = f / e * 2 - 1, t = t / e * 2 - 1, i.x = f, i.y = t, i.z = 1 - Math.abs(f) - Math.abs(t), i.z < 0) {
    const s = i.x;
    i.x = (1 - Math.abs(i.y)) * (s >= 0 ? 1 : -1), i.y = (1 - Math.abs(s)) * (i.y >= 0 ? 1 : -1);
  }
  return i.normalize(), i;
}
class Oe extends ri {
  constructor(t = kt) {
    super(), this.manager = t, this.adjustmentTransform = new z(), this.ellipsoid = Tt.clone();
  }
  resolveExternalURL(t) {
    return this.manager.resolveURL(super.resolveExternalURL(t));
  }
  /**
   * Parses an i3dm buffer and resolves to a GLTF result object where the scene's
   * meshes have been replaced with `InstancedMesh` objects (one per GLTF mesh), with
   * metadata attached to both `model` and `model.scene`.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ scene: Group, batchTable: BatchTable, featureTable: FeatureTable }>}
   */
  parse(t) {
    return super.parse(t).then((e) => {
      const { featureTable: i, batchTable: s } = e, o = e.glbBytes.slice().buffer;
      return new Promise((n, r) => {
        const a = this.fetchOptions, c = this.manager, p = c.getHandler("path.gltf") || new ee(c);
        a.credentials === "include" && a.mode === "cors" && p.setCrossOrigin("use-credentials"), "credentials" in a && p.setWithCredentials(a.credentials === "include"), a.headers && p.setRequestHeader(a.headers);
        let h = e.gltfWorkingPath ?? this.workingPath;
        /[\\/]$/.test(h) || (h += "/");
        const m = this.adjustmentTransform;
        p.parse(o, h, (u) => {
          const l = i.getData("INSTANCES_LENGTH");
          let d = i.getData("POSITION", l, "FLOAT", "VEC3");
          const x = i.getData("POSITION_QUANTIZED", l, "UNSIGNED_SHORT", "VEC3"), O = i.getData("QUANTIZED_VOLUME_OFFSET", 1, "FLOAT", "VEC3"), M = i.getData("QUANTIZED_VOLUME_SCALE", 1, "FLOAT", "VEC3"), P = i.getData("NORMAL_UP", l, "FLOAT", "VEC3"), g = i.getData("NORMAL_RIGHT", l, "FLOAT", "VEC3"), R = i.getData("NORMAL_UP_OCT32P", l, "UNSIGNED_SHORT", "VEC2"), D = i.getData("NORMAL_RIGHT_OCT32P", l, "UNSIGNED_SHORT", "VEC2"), v = i.getData("SCALE_NON_UNIFORM", l, "FLOAT", "VEC3"), C = i.getData("SCALE", l, "FLOAT", "SCALAR"), F = i.getData("RTC_CENTER", 1, "FLOAT", "VEC3"), ot = i.getData("EAST_NORTH_UP");
          if (!d && x) {
            d = new Float32Array(l * 3);
            for (let b = 0; b < l; b++)
              d[b * 3 + 0] = O[0] + x[b * 3 + 0] / 65535 * M[0], d[b * 3 + 1] = O[1] + x[b * 3 + 1] / 65535 * M[1], d[b * 3 + 2] = O[2] + x[b * 3 + 2] / 65535 * M[2];
          }
          const A = new y();
          for (let b = 0; b < l; b++)
            A.x += d[b * 3 + 0] / l, A.y += d[b * 3 + 1] / l, A.z += d[b * 3 + 2] / l;
          const vt = [], ie = [];
          u.scene.updateMatrixWorld(), u.scene.traverse((b) => {
            if (b.isMesh) {
              ie.push(b);
              const { geometry: lt, material: Bt } = b, Q = new Qe(lt, Bt, l);
              Q.position.copy(A), F && (Q.position.x += F[0], Q.position.y += F[1], Q.position.z += F[2]), vt.push(Q);
            }
          });
          for (let b = 0; b < l; b++) {
            Ht.set(
              d[b * 3 + 0] - A.x,
              d[b * 3 + 1] - A.y,
              d[b * 3 + 2] - A.z
            ), Ct.identity(), P && g ? (ht.set(
              P[b * 3 + 0],
              P[b * 3 + 1],
              P[b * 3 + 2]
            ), pt.set(
              g[b * 3 + 0],
              g[b * 3 + 1],
              g[b * 3 + 2]
            ), Dt.crossVectors(pt, ht).normalize(), dt.makeBasis(
              pt,
              ht,
              Dt
            ), Ct.setFromRotationMatrix(dt)) : R && D && (le(
              R[b * 2 + 0],
              R[b * 2 + 1],
              65535,
              ht
            ), le(
              D[b * 2 + 0],
              D[b * 2 + 1],
              65535,
              pt
            ), Dt.crossVectors(pt, ht).normalize(), dt.makeBasis(
              pt,
              ht,
              Dt
            ), Ct.setFromRotationMatrix(dt)), St.set(1, 1, 1), v && St.set(
              v[b * 3 + 0],
              v[b * 3 + 1],
              v[b * 3 + 2]
            ), C && St.multiplyScalar(C[b]);
            for (let lt = 0, Bt = vt.length; lt < Bt; lt++) {
              const Q = vt[lt];
              jt.copy(Ct), ot && (Q.updateMatrixWorld(), ae.copy(Ht).applyMatrix4(Q.matrixWorld), this.ellipsoid.getPositionToCartographic(ae, Gt), this.ellipsoid.getEastNorthUpFrame(Gt.lat, Gt.lon, ce), jt.setFromRotationMatrix(ce)), dt.compose(Ht, jt, St).multiply(m);
              const Ve = ie[lt];
              re.multiplyMatrices(dt, Ve.matrixWorld), Q.setMatrixAt(b, re);
            }
          }
          u.scene.clear(), u.scene.add(...vt), u.batchTable = s, u.featureTable = i, u.scene.batchTable = s, u.scene.featureTable = i, n(u);
        }, r);
      });
    });
  }
}
class ui extends ai {
  constructor(t = kt) {
    super(), this.manager = t, this.adjustmentTransform = new z(), this.ellipsoid = Tt.clone();
  }
  /**
   * Parses a cmpt buffer and resolves to an object containing a `Group` with all
   * sub-tile scenes added as children, and the individual sub-tile results.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ scene: Group, tiles: Array }>}
   */
  parse(t) {
    const e = super.parse(t), { manager: i, ellipsoid: s, adjustmentTransform: o } = this, n = [];
    for (const r in e.tiles) {
      const { type: a, buffer: c } = e.tiles[r];
      switch (a) {
        case "b3dm": {
          const p = c.slice(), h = new Ee(i);
          h.workingPath = this.workingPath, h.fetchOptions = this.fetchOptions, h.adjustmentTransform.copy(o);
          const m = h.parse(p.buffer);
          n.push(m);
          break;
        }
        case "pnts": {
          const p = c.slice(), h = new Re(i);
          h.workingPath = this.workingPath, h.fetchOptions = this.fetchOptions;
          const m = h.parse(p.buffer);
          n.push(m);
          break;
        }
        case "i3dm": {
          const p = c.slice(), h = new Oe(i);
          h.workingPath = this.workingPath, h.fetchOptions = this.fetchOptions, h.ellipsoid.copy(s), h.adjustmentTransform.copy(o);
          const m = h.parse(p.buffer);
          n.push(m);
          break;
        }
      }
    }
    return Promise.all(n).then((r) => {
      const a = new wt();
      return r.forEach((c) => {
        a.add(c.scene);
      }), {
        tiles: r,
        scene: a
      };
    });
  }
}
const _t = /* @__PURE__ */ new z();
class mi extends wt {
  constructor(t) {
    super(), this.isTilesGroup = !0, this.name = "TilesRenderer.TilesGroup", this.tilesRenderer = t, this.matrixWorldInverse = new z();
  }
  raycast(t, e) {
    return this.tilesRenderer.optimizeRaycast ? (this.tilesRenderer.raycast(t, e), !1) : !0;
  }
  updateMatrixWorld(t) {
    if (this.matrixAutoUpdate && this.updateMatrix(), this.matrixWorldNeedsUpdate || t) {
      this.parent === null ? _t.copy(this.matrix) : _t.multiplyMatrices(this.parent.matrixWorld, this.matrix), this.matrixWorldNeedsUpdate = !1;
      const e = _t.elements, i = this.matrixWorld.elements;
      let s = !1;
      for (let o = 0; o < 16; o++) {
        const n = e[o], r = i[o];
        if (Math.abs(n - r) > Number.EPSILON) {
          s = !0;
          break;
        }
      }
      if (s) {
        this.matrixWorld.copy(_t), this.matrixWorldInverse.copy(_t).invert();
        const o = this.children;
        for (let n = 0, r = o.length; n < r; n++)
          o[n].updateMatrixWorld();
      }
    }
  }
  updateWorldMatrix(t, e) {
    this.parent && t && this.parent.updateWorldMatrix(t, !1), this.updateMatrixWorld(!0);
  }
}
const Ie = /* @__PURE__ */ new Nt(), Zt = /* @__PURE__ */ new y(), Et = [];
function ze(f, t) {
  return f.distance - t.distance;
}
function Fe(f, t, e, i) {
  const { scene: s } = f.engineData;
  e.invokeOnePlugin((n) => n.raycastTile && n.raycastTile(f, s, t, i)) || t.intersectObject(s, !0, i);
}
function fi(f, t, e) {
  Fe(f, t, e, Et), Et.sort(ze);
  const i = Et[0] || null;
  return Et.length = 0, i;
}
function Ae(f) {
  return "traversal" in f;
}
function Le(f, t, e, i = null) {
  const { group: s, activeTiles: o } = f;
  i === null && (i = Ie, i.copy(e.ray).applyMatrix4(s.matrixWorldInverse));
  const n = [], r = t.children;
  for (let p = 0, h = r.length; p < h; p++) {
    const m = r[p];
    if (!Ae(m) || !m.traversal.used)
      continue;
    m.engineData.boundingVolume.intersectRay(i, Zt) !== null && (Zt.applyMatrix4(s.matrixWorld), n.push({
      distance: Zt.distanceToSquared(e.ray.origin),
      tile: m
    }));
  }
  n.sort(ze);
  let a = null, c = 1 / 0;
  if (o.has(t)) {
    const p = fi(t, e, f);
    p && (a = p, c = p.distance * p.distance);
  }
  for (let p = 0, h = n.length; p < h; p++) {
    const m = n[p], u = m.distance, l = m.tile;
    if (u > c)
      break;
    const d = Le(f, l, e, i);
    if (d) {
      const x = d.distance * d.distance;
      x < c && (a = d, c = x);
    }
  }
  return a;
}
function We(f, t, e, i, s = null) {
  if (!Ae(t))
    return;
  const { group: o, activeTiles: n } = f, { boundingVolume: r } = t.engineData;
  if (s === null && (s = Ie, s.copy(e.ray).applyMatrix4(o.matrixWorldInverse)), !t.traversal.used || !r.intersectsRay(s))
    return;
  n.has(t) && Fe(t, e, f, i);
  const a = t.children;
  for (let c = 0, p = a.length; c < p; c++)
    We(f, a[c], e, i, s);
}
const $ = /* @__PURE__ */ new y(), Y = /* @__PURE__ */ new y(), X = /* @__PURE__ */ new y(), he = /* @__PURE__ */ new y(), pe = /* @__PURE__ */ new y();
class gi {
  constructor() {
    this.sphere = null, this.obb = null, this.region = null, this.regionObb = null;
  }
  intersectsRay(t) {
    const e = this.sphere, i = this.obb || this.regionObb;
    return !(e && !t.intersectsSphere(e) || i && !i.intersectsRay(t));
  }
  intersectRay(t, e = null) {
    const i = this.sphere, s = this.obb || this.regionObb;
    let o = -1 / 0, n = -1 / 0;
    i && t.intersectSphere(i, he) && (o = i.containsPoint(t.origin) ? 0 : t.origin.distanceToSquared(he)), s && s.intersectRay(t, pe) && (n = s.containsPoint(t.origin) ? 0 : t.origin.distanceToSquared(pe));
    const r = Math.max(o, n);
    return r === -1 / 0 ? null : (t.at(Math.sqrt(r), e), e);
  }
  distanceToPoint(t) {
    const e = this.sphere, i = this.obb || this.regionObb;
    let s = -1 / 0, o = -1 / 0;
    return e && (s = Math.max(e.distanceToPoint(t), 0)), i && (o = i.distanceToPoint(t)), s > o ? s : o;
  }
  intersectsFrustum(t) {
    const e = this.obb || this.regionObb, i = this.sphere;
    return i && !t.intersectsSphere(i) || e && !e.intersectsFrustum(t) ? !1 : !!(i || e);
  }
  intersectsSphere(t) {
    const e = this.obb || this.regionObb, i = this.sphere;
    return i && !i.intersectsSphere(t) || e && !e.intersectsSphere(t) ? !1 : !!(i || e);
  }
  intersectsOBB(t) {
    const e = this.obb || this.regionObb, i = this.sphere;
    return i && !t.intersectsSphere(i) || e && !e.intersectsOBB(t) ? !1 : !!(i || e);
  }
  getOBB(t, e) {
    const i = this.obb || this.regionObb;
    i ? (t.copy(i.box), e.copy(i.transform)) : (this.getAABB(t), e.identity());
  }
  getAABB(t) {
    if (this.sphere)
      this.sphere.getBoundingBox(t);
    else {
      const e = this.obb || this.regionObb;
      t.copy(e.box).applyMatrix4(e.transform);
    }
  }
  getSphere(t) {
    if (this.sphere)
      t.copy(this.sphere);
    else if (this.region)
      this.region.getBoundingSphere(t);
    else {
      const e = this.obb || this.regionObb;
      e.box.getBoundingSphere(t), t.applyMatrix4(e.transform);
    }
  }
  setObbData(t, e) {
    const i = new oe();
    $.set(t[3], t[4], t[5]), Y.set(t[6], t[7], t[8]), X.set(t[9], t[10], t[11]);
    const s = $.length(), o = Y.length(), n = X.length();
    $.normalize(), Y.normalize(), X.normalize(), s === 0 && $.crossVectors(Y, X), o === 0 && Y.crossVectors($, X), n === 0 && X.crossVectors($, Y), i.transform.set(
      $.x,
      Y.x,
      X.x,
      t[0],
      $.y,
      Y.y,
      X.y,
      t[1],
      $.z,
      Y.z,
      X.z,
      t[2],
      0,
      0,
      0,
      1
    ).premultiply(e), i.box.min.set(-s, -o, -n), i.box.max.set(s, o, n), i.update(), this.obb = i;
  }
  setSphereData(t, e, i, s, o) {
    const n = new $e();
    n.center.set(t, e, i), n.radius = s, n.applyMatrix4(o), this.sphere = n;
  }
  setRegionData(t, e, i, s, o, n, r) {
    const a = new ci(
      ...t.radius,
      i,
      o,
      e,
      s,
      n,
      r
    ), c = new oe();
    a.getBoundingBox(c.box, c.transform), c.update(), this.region = a, this.regionObb = c;
  }
}
const yi = /* @__PURE__ */ new Xe();
function xi(f, t, e, i) {
  const s = yi.set(
    f.normal.x,
    f.normal.y,
    f.normal.z,
    t.normal.x,
    t.normal.y,
    t.normal.z,
    e.normal.x,
    e.normal.y,
    e.normal.z
  );
  return i.set(-f.constant, -t.constant, -e.constant), i.applyMatrix3(s.invert()), i;
}
class bi extends Ye {
  constructor() {
    super(), this.points = Array(8).fill().map(() => new y());
  }
  setFromProjectionMatrix(...t) {
    return super.setFromProjectionMatrix(...t), this.calculateFrustumPoints(), this;
  }
  calculateFrustumPoints() {
    const { planes: t, points: e } = this;
    [
      [t[0], t[3], t[4]],
      // Near top left
      [t[1], t[3], t[4]],
      // Near top right
      [t[0], t[2], t[4]],
      // Near bottom left
      [t[1], t[2], t[4]],
      // Near bottom right
      [t[0], t[3], t[5]],
      // Far top left
      [t[1], t[3], t[5]],
      // Far top right
      [t[0], t[2], t[5]],
      // Far bottom left
      [t[1], t[2], t[5]]
      // Far bottom right
    ].forEach((s, o) => {
      xi(s[0], s[1], s[2], e[o]);
    });
  }
}
const de = /* @__PURE__ */ new z(), ue = /* @__PURE__ */ new Je(), Ue = Symbol("INITIAL_FRUSTUM_CULLED"), Rt = /* @__PURE__ */ new z(), Mt = /* @__PURE__ */ new y(), qt = /* @__PURE__ */ new W(), _i = /* @__PURE__ */ new y(1, 0, 0), Mi = /* @__PURE__ */ new y(0, 1, 0);
function me(f, t) {
  f.traverse((e) => {
    e.frustumCulled = e[Ue] && t;
  });
}
class Vi extends Ne {
  /**
   * If `true`, all tile meshes automatically have `frustumCulled` set to `false` since the
   * tiles renderer performs its own frustum culling. If `displayActiveTiles` is `true` or
   * multiple cameras are being used, consider setting this to `false`.
   * @type {boolean}
   * @default true
   */
  get autoDisableRendererCulling() {
    return this._autoDisableRendererCulling;
  }
  set autoDisableRendererCulling(t) {
    this._autoDisableRendererCulling !== t && (super._autoDisableRendererCulling = t, this.forEachLoadedModel((e) => {
      me(e, !t);
    }));
  }
  get optimizeRaycast() {
    return this._optimizeRaycast;
  }
  set optimizeRaycast(t) {
    console.warn('TilesRenderer: The "optimizeRaycast" option has been deprecated.'), this._optimizeRaycast = t;
  }
  constructor(...t) {
    super(...t), this.group = new mi(this), this.ellipsoid = Tt.clone(), this.cameras = [], this.cameraMap = /* @__PURE__ */ new Map(), this.cameraInfo = [], this._optimizeRaycast = !0, this._upRotationMatrix = new z(), this._bytesUsed = /* @__PURE__ */ new WeakMap(), this._autoDisableRendererCulling = !0, this.manager = new Ke(), this._listeners = {};
  }
  addEventListener(t, e) {
    t === "load-tile-set" ? (console.warn('TilesRenderer: "load-tile-set" event has been deprecated. Use "load-tileset" instead.'), t = "load-tileset") : t === "load-content" && console.warn('TilesRenderer: "load-content" event has been deprecated. Use "load-model" or "load-tileset" instead.'), yt.prototype.addEventListener.call(this, t, e);
  }
  hasEventListener(t, e) {
    return t === "load-tile-set" ? (console.warn('TilesRenderer: "load-tile-set" event has been deprecated. Use "load-tileset" instead.'), t = "load-tileset") : t === "load-content" && console.warn('TilesRenderer: "load-content" event has been deprecated. Use "load-model" or "load-tileset" instead.'), yt.prototype.hasEventListener.call(this, t, e);
  }
  removeEventListener(t, e) {
    t === "load-tile-set" ? (console.warn('TilesRenderer: "load-tile-set" event has been deprecated. Use "load-tileset" instead.'), t = "load-tileset") : t === "load-content" && console.warn('TilesRenderer: "load-content" event has been deprecated. Use "load-model" or "load-tileset" instead.'), yt.prototype.removeEventListener.call(this, t, e);
  }
  dispatchEvent(t) {
    "tileset" in t && Object.defineProperty(t, "tileSet", {
      get() {
        return console.warn('TilesRenderer: "event.tileSet" has been deprecated. Use "event.tileset" instead.'), t.tileset;
      },
      enumerable: !1,
      configurable: !0
    }), yt.prototype.dispatchEvent.call(this, t);
  }
  /* Public API */
  /**
   * Returns the axis-aligned bounding box of the root tile in the group's local space.
   * @param {Box3} target - Target box to write into.
   * @returns {boolean} Whether the tileset is loaded and a bounding box is available.
   */
  getBoundingBox(t) {
    if (!this.root)
      return !1;
    const e = this.root.engineData.boundingVolume;
    return e ? (e.getAABB(t), !0) : !1;
  }
  /**
   * Returns the oriented bounding box and transform of the root tile.
   * @param {Box3} targetBox - Target box to write into (in local OBB space).
   * @param {Matrix4} targetMatrix - Transform from OBB local space to group local space.
   * @returns {boolean} Whether the tileset is loaded and an OBB is available.
   */
  getOrientedBoundingBox(t, e) {
    if (!this.root)
      return !1;
    const i = this.root.engineData.boundingVolume;
    return i ? (i.getOBB(t, e), !0) : !1;
  }
  /**
   * Returns the bounding sphere of the root tile in the group's local space.
   * @param {Sphere} target - Target sphere to write into.
   * @returns {boolean} Whether the tileset is loaded and a bounding sphere is available.
   */
  getBoundingSphere(t) {
    if (!this.root)
      return !1;
    const e = this.root.engineData.boundingVolume;
    return e ? (e.getSphere(t), !0) : !1;
  }
  /**
   * Iterates over all currently loaded tile scenes.
   * @param {Function} callback - Called with `( scene: Object3D, tile: object )` for each loaded tile.
   */
  forEachLoadedModel(t) {
    this.traverse((e) => {
      const i = e.engineData && e.engineData.scene;
      i && t(i, e);
    }, null, !1);
  }
  /**
   * Performs a raycast against all loaded tile scenes. Compatible with Three.js raycasting.
   * Supports `raycaster.firstHitOnly` for early termination.
   * @param {Raycaster} raycaster
   * @param {Array} intersects - Array to push intersection results into.
   */
  raycast(t, e) {
    if (this.root)
      if (t.firstHitOnly) {
        const i = Le(this, this.root, t);
        i && e.push(i);
      } else
        We(this, this.root, t, e);
  }
  /**
   * Returns whether the given camera is registered with this renderer.
   * @param {Camera} camera
   * @returns {boolean}
   */
  hasCamera(t) {
    return this.cameraMap.has(t);
  }
  /**
   * Registers a camera with the renderer so it is used for tile selection and screen-space error
   * calculation. Use `setResolution` or `setResolutionFromRenderer` to provide the camera's resolution.
   * @param {Camera} camera
   * @returns {boolean} Whether the camera was newly added.
   */
  setCamera(t) {
    const e = this.cameras, i = this.cameraMap;
    return i.has(t) ? !1 : (i.set(t, new W()), e.push(t), this.dispatchEvent({ type: "add-camera", camera: t }), !0);
  }
  /**
   * Sets the render resolution for a registered camera, used for screen-space error calculation.
   * @param {Camera} camera - A previously registered camera.
   * @param {number|Vector2} xOrVec - Render width in pixels, or a Vector2 containing width and height.
   * @param {number} [y] - Render height in pixels when `xOrVec` is a number.
   * @returns {boolean} Whether the camera is registered and the resolution was updated.
   */
  setResolution(t, e, i) {
    const s = this.cameraMap;
    if (!s.has(t))
      return !1;
    const o = e.isVector2 ? e.x : e, n = e.isVector2 ? e.y : i, r = s.get(t);
    return (r.width !== o || r.height !== n) && (r.set(o, n), this.dispatchEvent({ type: "camera-resolution-change" })), !0;
  }
  /**
   * Sets the render resolution for a camera by reading the current size from a WebGLRenderer.
   * @param {Camera} camera - A previously registered camera.
   * @param {WebGLRenderer} renderer
   * @returns {boolean} Whether the camera is registered and the resolution was updated.
   */
  setResolutionFromRenderer(t, e) {
    return e.getSize(qt), this.setResolution(t, qt.x, qt.y);
  }
  /**
   * Unregisters a camera from the renderer.
   * @param {Camera} camera
   * @returns {boolean} Whether the camera was found and removed.
   */
  deleteCamera(t) {
    const e = this.cameras, i = this.cameraMap;
    if (i.has(t)) {
      const s = e.indexOf(t);
      return e.splice(s, 1), i.delete(t), this.dispatchEvent({ type: "delete-camera", camera: t }), !0;
    }
    return !1;
  }
  /* Overriden */
  loadRootTileset(...t) {
    return super.loadRootTileset(...t).then((e) => {
      const { asset: i, extensions: s = {} } = e;
      switch ((i && i.gltfUpAxis || "y").toLowerCase()) {
        case "x":
          this._upRotationMatrix.makeRotationAxis(Mi, -Math.PI / 2);
          break;
        case "y":
          this._upRotationMatrix.makeRotationAxis(_i, Math.PI / 2);
          break;
      }
      if ("3DTILES_ellipsoid" in s) {
        const n = s["3DTILES_ellipsoid"], { ellipsoid: r } = this;
        r.name = n.body, n.radii ? r.radius.set(...n.radii) : r.radius.set(1, 1, 1);
      }
      return e;
    });
  }
  prepareForTraversal() {
    const t = this.group, e = this.cameras, i = this.cameraMap, s = this.cameraInfo;
    for (; s.length > e.length; )
      s.pop();
    for (; s.length < e.length; )
      s.push({
        frustum: new bi(),
        isOrthographic: !1,
        sseDenominator: -1,
        // used if isOrthographic:false
        position: new y(),
        invScale: -1,
        pixelSize: 0
        // used if isOrthographic:true
      });
    Mt.setFromMatrixScale(t.matrixWorldInverse), Math.abs(Math.max(Mt.x - Mt.y, Mt.x - Mt.z)) > 1e-6 && console.warn("ThreeTilesRenderer : Non uniform scale used for tile which may cause issues when calculating screen space error.");
    for (let o = 0, n = s.length; o < n; o++) {
      const r = e[o], a = s[o], c = a.frustum, p = a.position, h = i.get(r);
      (h.width === 0 || h.height === 0) && console.warn("TilesRenderer: resolution for camera error calculation is not set.");
      const m = r.projectionMatrix.elements;
      if (a.isOrthographic = m[15] === 1, a.isOrthographic) {
        const u = 2 / m[0], l = 2 / m[5];
        a.pixelSize = Math.max(l / h.height, u / h.width);
      } else
        a.sseDenominator = 2 / m[5] / h.height;
      Rt.copy(t.matrixWorld), Rt.premultiply(r.matrixWorldInverse), Rt.premultiply(r.projectionMatrix), c.setFromProjectionMatrix(Rt, r.coordinateSystem, r.reversedDepth), p.set(0, 0, 0), p.applyMatrix4(r.matrixWorld), p.applyMatrix4(t.matrixWorldInverse);
    }
  }
  update() {
    if (super.update(), this.cameras.length === 0 && this.root) {
      let t = !1;
      this.invokeAllPlugins((e) => t = t || !!(e !== this && e.calculateTileViewError)), t === !1 && console.warn("TilesRenderer: no cameras defined. Cannot update 3d tiles.");
    }
  }
  preprocessNode(t, e, i = null) {
    super.preprocessNode(t, e, i);
    const s = new z();
    if (t.transform) {
      const r = t.transform;
      for (let a = 0; a < 16; a++)
        s.elements[a] = r[a];
    }
    i && s.premultiply(i.engineData.transform);
    const o = new z().copy(s).invert(), n = new gi();
    "sphere" in t.boundingVolume && n.setSphereData(...t.boundingVolume.sphere, s), "box" in t.boundingVolume && n.setObbData(t.boundingVolume.box, s), "region" in t.boundingVolume && n.setRegionData(this.ellipsoid, ...t.boundingVolume.region), t.engineData.transform = s, t.engineData.transformInverse = o, t.engineData.boundingVolume = n, t.engineData.geometry = null, t.engineData.materials = null, t.engineData.textures = null;
  }
  async parseTile(t, e, i, s, o) {
    const n = e.engineData, r = Be(s), a = this.fetchOptions, c = this.manager;
    let p = null;
    const h = n.transform, m = this._upRotationMatrix, u = (He(t) || i).toLowerCase();
    switch (u) {
      case "b3dm": {
        const g = new Ee(c);
        g.workingPath = r, g.fetchOptions = a, g.adjustmentTransform.copy(m), p = g.parse(t);
        break;
      }
      case "pnts": {
        const g = new Re(c);
        g.workingPath = r, g.fetchOptions = a, p = g.parse(t);
        break;
      }
      case "i3dm": {
        const g = new Oe(c);
        g.workingPath = r, g.fetchOptions = a, g.adjustmentTransform.copy(m), g.ellipsoid.copy(this.ellipsoid), p = g.parse(t);
        break;
      }
      case "cmpt": {
        const g = new ui(c);
        g.workingPath = r, g.fetchOptions = a, g.adjustmentTransform.copy(m), g.ellipsoid.copy(this.ellipsoid), p = g.parse(t).then((R) => R.scene);
        break;
      }
      // 3DTILES_content_gltf
      case "gltf":
      case "glb": {
        const g = c.getHandler("path.gltf") || c.getHandler("path.glb") || new ee(c);
        g.setWithCredentials(a.credentials === "include"), g.setRequestHeader(a.headers || {}), a.credentials === "include" && a.mode === "cors" && g.setCrossOrigin("use-credentials");
        let R = g.resourcePath || g.path || r;
        !/[\\/]$/.test(R) && R.length && (R += "/"), p = g.parseAsync(t, R).then((D) => {
          D.scene = D.scene || new wt();
          const { scene: v } = D;
          return v.updateMatrix(), v.matrix.multiply(m).decompose(v.position, v.quaternion, v.scale), D;
        });
        break;
      }
      default: {
        p = this.invokeOnePlugin((g) => g.parseToMesh && g.parseToMesh(t, e, i, s, o));
        break;
      }
    }
    const l = await p;
    if (l === null)
      throw new Error(`TilesRenderer: Content type "${u}" not supported.`);
    let d, x;
    l.isObject3D ? (d = l, x = null) : (d = l.scene, x = l), d.updateMatrix(), d.matrix.premultiply(h), d.matrix.decompose(d.position, d.quaternion, d.scale), await this.invokeAllPlugins((g) => g.processTileModel && g.processTileModel(d, e)), d.traverse((g) => {
      g[Ue] = g.frustumCulled;
    }), me(d, !this.autoDisableRendererCulling);
    const O = [], M = [], P = [];
    if (d.traverse((g) => {
      if (g.geometry && M.push(g.geometry), g.material) {
        const R = g.material;
        O.push(g.material);
        for (const D in R) {
          const v = R[D];
          v && v.isTexture && P.push(v);
        }
      }
    }), o.aborted) {
      for (let g = 0, R = P.length; g < R; g++) {
        const D = P[g];
        D.image instanceof ImageBitmap && D.image.close(), D.dispose();
      }
      return;
    }
    n.materials = O, n.geometry = M, n.textures = P, n.scene = d, n.metadata = x;
  }
  disposeTile(t) {
    super.disposeTile(t);
    const e = t.engineData;
    if (e.scene) {
      const i = e.materials, s = e.geometry, o = e.textures, n = e.scene.parent;
      e.scene.traverse((r) => {
        r.userData.meshFeatures && r.userData.meshFeatures.dispose(), r.userData.structuralMetadata && r.userData.structuralMetadata.dispose();
      });
      for (let r = 0, a = s.length; r < a; r++)
        s[r].dispose();
      for (let r = 0, a = i.length; r < a; r++)
        i[r].dispose();
      for (let r = 0, a = o.length; r < a; r++) {
        const c = o[r];
        c.image instanceof ImageBitmap && c.image.close(), c.dispose();
      }
      n && n.remove(e.scene), e.scene = null, e.materials = null, e.textures = null, e.geometry = null, e.metadata = null;
    }
  }
  setTileVisible(t, e) {
    const i = t.engineData.scene, s = this.group;
    e ? i && (s.add(i), i.updateMatrixWorld(!0)) : i && s.remove(i), super.setTileVisible(t, e);
  }
  calculateBytesUsed(t, e) {
    const i = this._bytesUsed;
    return !i.has(t) && e && i.set(t, li(e)), i.get(t) ?? null;
  }
  calculateTileViewError(t, e) {
    const i = t.engineData, s = this.cameras, o = this.cameraInfo, n = i.boundingVolume;
    let r = !1, a = 0, c = 1 / 0, p = 0, h = 1 / 0;
    for (let m = 0, u = s.length; m < u; m++) {
      const l = o[m];
      let d, x;
      if (l.isOrthographic) {
        const M = l.pixelSize;
        d = t.geometricError / M, x = 1 / 0;
      } else {
        const M = l.sseDenominator;
        x = n.distanceToPoint(l.position), d = x === 0 ? 1 / 0 : t.geometricError / (x * M);
      }
      const O = o[m].frustum;
      n.intersectsFrustum(O) && (r = !0, a = Math.max(a, d), c = Math.min(c, x)), p = Math.max(p, d), h = Math.min(h, x);
    }
    r ? (e.inView = !0, e.error = a, e.distanceFromCamera = c) : (e.inView = !1, e.error = p, e.distanceFromCamera = h);
  }
  // adjust the rotation of the group such that Y is altitude, X is North, and Z is East
  setLatLonToYUp(t, e) {
    console.warn("TilesRenderer: setLatLonToYUp is deprecated. Use the ReorientationPlugin, instead.");
    const { ellipsoid: i, group: s } = this;
    ue.set(Math.PI / 2, Math.PI / 2, 0), de.makeRotationFromEuler(ue), i.getEastNorthUpFrame(t, e, 0, s.matrix).multiply(de).invert().decompose(
      s.position,
      s.quaternion,
      s.scale
    ), s.updateMatrixWorld(!0);
  }
  dispose() {
    super.dispose(), this.group.removeFromParent();
  }
}
class Pi extends ti {
  constructor() {
    super(new ei(0, 0), new wi()), this.renderOrder = 1 / 0;
  }
  onBeforeRender(t) {
    const e = this.material.uniforms;
    t.getSize(e.resolution.value);
  }
  updateMatrixWorld() {
    this.matrixWorld.makeTranslation(this.position);
  }
  dispose() {
    this.geometry.dispose(), this.material.dispose();
  }
}
class wi extends ii {
  constructor() {
    super({
      depthWrite: !1,
      depthTest: !1,
      transparent: !0,
      uniforms: {
        resolution: { value: new W() },
        size: { value: 15 },
        thickness: { value: 2 },
        opacity: { value: 1 }
      },
      vertexShader: (
        /* glsl */
        `

				uniform float size;
				uniform float thickness;
				uniform vec2 resolution;
				varying vec2 vUv;

				void main() {

					vUv = uv;

					float aspect = resolution.x / resolution.y;
					vec2 offset = uv * 2.0 - vec2( 1.0 );
					offset.y *= aspect;

					vec4 screenPoint = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
					screenPoint.xy += offset * ( size + thickness ) * screenPoint.w / resolution.x;

					gl_Position = screenPoint;

				}
			`
      ),
      fragmentShader: (
        /* glsl */
        `

				uniform float size;
				uniform float thickness;
				uniform float opacity;

				varying vec2 vUv;
				void main() {

					float ht = 0.5 * thickness;
					float planeDim = size + thickness;
					float offset = ( planeDim - ht - 2.0 ) / planeDim;
					float texelThickness = ht / planeDim;

					vec2 vec = vUv * 2.0 - vec2( 1.0 );
					float dist = abs( length( vec ) - offset );
					float fw = fwidth( dist ) * 0.5;
					float a = smoothstep( texelThickness - fw, texelThickness + fw, dist );

					gl_FragColor = vec4( 1, 1, 1, opacity * ( 1.0 - a ) );

				}
			`
      )
    });
  }
}
const fe = /* @__PURE__ */ new W(), ge = /* @__PURE__ */ new W();
class Ti {
  constructor() {
    this.domElement = null, this.buttons = 0, this.pointerType = null, this.pointerOrder = [], this.previousPositions = {}, this.pointerPositions = {}, this.startPositions = {}, this.pointerSetThisFrame = {}, this.hoverPosition = new W(), this.hoverSet = !1;
  }
  reset() {
    this.buttons = 0, this.pointerType = null, this.pointerOrder = [], this.previousPositions = {}, this.pointerPositions = {}, this.startPositions = {}, this.pointerSetThisFrame = {}, this.hoverPosition = new W(), this.hoverSet = !1;
  }
  // The pointers can be set multiple times per frame so track whether the pointer has
  // been set this frame or not so we don't overwrite the previous position and lose information
  // about pointer movement
  updateFrame() {
    const { previousPositions: t, pointerPositions: e } = this;
    for (const i in e)
      t[i].copy(e[i]);
  }
  setHoverEvent(t) {
    (t.pointerType === "mouse" || t.type === "wheel") && (this.getAdjustedPointer(t, this.hoverPosition), this.hoverSet = !0);
  }
  getLatestPoint(t) {
    return this.pointerType !== null ? (this.getCenterPoint(t), t) : this.hoverSet ? (t.copy(this.hoverPosition), t) : null;
  }
  // get the pointer position in the coordinate system of the target element
  getAdjustedPointer(t, e) {
    const s = (this.domElement ? this.domElement : t.target).getBoundingClientRect(), o = t.clientX - s.left, n = t.clientY - s.top;
    e.set(o, n);
  }
  addPointer(t) {
    const e = t.pointerId, i = new W();
    this.getAdjustedPointer(t, i), this.pointerOrder.push(e), this.pointerPositions[e] = i, this.previousPositions[e] = i.clone(), this.startPositions[e] = i.clone(), this.getPointerCount() === 1 && (this.pointerType = t.pointerType, this.buttons = t.buttons);
  }
  updatePointer(t) {
    const e = t.pointerId;
    return e in this.pointerPositions ? (this.getAdjustedPointer(t, this.pointerPositions[e]), !0) : !1;
  }
  deletePointer(t) {
    const e = t.pointerId, i = this.pointerOrder;
    i.splice(i.indexOf(e), 1), delete this.pointerPositions[e], delete this.previousPositions[e], delete this.startPositions[e], this.getPointerCount() === 0 && (this.buttons = 0, this.pointerType = null);
  }
  getPointerCount() {
    return this.pointerOrder.length;
  }
  getCenterPoint(t, e = this.pointerPositions) {
    const i = this.pointerOrder;
    if (this.getPointerCount() === 1 || this.getPointerType() === "mouse") {
      const s = i[0];
      return t.copy(e[s]), t;
    } else if (this.getPointerCount() === 2) {
      const s = this.pointerOrder[0], o = this.pointerOrder[1], n = e[s], r = e[o];
      return t.addVectors(n, r).multiplyScalar(0.5), t;
    }
    return null;
  }
  getPreviousCenterPoint(t) {
    return this.getCenterPoint(t, this.previousPositions);
  }
  getStartCenterPoint(t) {
    return this.getCenterPoint(t, this.startPositions);
  }
  getMoveDistance() {
    return this.getCenterPoint(fe), this.getPreviousCenterPoint(ge), fe.sub(ge).length();
  }
  getTouchPointerDistance(t = this.pointerPositions) {
    if (this.getPointerCount() <= 1 || this.getPointerType() === "mouse")
      return 0;
    const { pointerOrder: e } = this, i = e[0], s = e[1], o = t[i], n = t[s];
    return o.distanceTo(n);
  }
  getPreviousTouchPointerDistance() {
    return this.getTouchPointerDistance(this.previousPositions);
  }
  getStartTouchPointerDistance() {
    return this.getTouchPointerDistance(this.startPositions);
  }
  getPointerType() {
    return this.pointerType;
  }
  isPointerTouch() {
    return this.getPointerType() === "touch";
  }
  getPointerButtons() {
    return this.buttons;
  }
  isLeftClicked() {
    return !!(this.buttons & 1);
  }
  isRightClicked() {
    return !!(this.buttons & 2);
  }
}
const Ot = /* @__PURE__ */ new z();
function xt(f, t, e) {
  return e.makeTranslation(-f.x, -f.y, -f.z), Ot.makeRotationFromQuaternion(t), e.premultiply(Ot), Ot.makeTranslation(f.x, f.y, f.z), e.premultiply(Ot), e;
}
function ft(f, t, e) {
  e.x = f.x / t.clientWidth * 2 - 1, e.y = -(f.y / t.clientHeight) * 2 + 1, e.isVector3 && (e.z = 0);
}
function j(f, t, e) {
  const i = f instanceof Nt ? f : f.ray, { origin: s, direction: o } = i;
  s.set(t.x, t.y, -1).unproject(e), o.set(t.x, t.y, 1).unproject(e).sub(s), f.isRay || (f.near = 0, f.far = o.length(), f.camera = e), o.normalize();
}
const Z = 0, it = 1, K = 2, gt = 3, Qt = 4, q = 5, $t = 0.05, Yt = 0.025, et = /* @__PURE__ */ new z(), It = /* @__PURE__ */ new z(), k = /* @__PURE__ */ new y(), _ = /* @__PURE__ */ new y(), zt = /* @__PURE__ */ new y(), Ft = /* @__PURE__ */ new y(), L = /* @__PURE__ */ new y(), H = /* @__PURE__ */ new y(), Xt = /* @__PURE__ */ new y(), At = /* @__PURE__ */ new y(), G = /* @__PURE__ */ new st(), ye = /* @__PURE__ */ new Ce(), I = /* @__PURE__ */ new y(), Lt = /* @__PURE__ */ new y(), Kt = /* @__PURE__ */ new y(), vi = /* @__PURE__ */ new st(), S = /* @__PURE__ */ new Nt(), Wt = /* @__PURE__ */ new y(), Ut = /* @__PURE__ */ new W(), V = /* @__PURE__ */ new W(), xe = /* @__PURE__ */ new W(), Pt = /* @__PURE__ */ new W(), Jt = /* @__PURE__ */ new W(), be = /* @__PURE__ */ new W(), te = { type: "change" }, _e = { type: "start" }, Me = { type: "end" };
class Di extends yt {
  /**
   * Whether the controls are active. When set to false, all input is ignored
   * and inertia is cleared.
   * @type {boolean}
   * @default true
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(t) {
    t !== this.enabled && (this._enabled = t, this.resetState(), this.pointerTracker.reset(), this.enabled || (this.dragInertia.set(0, 0, 0), this.rotationInertia.set(0, 0)));
  }
  constructor(t = null, e = null, i = null, s = null) {
    super(), this.isEnvironmentControls = !0, this.domElement = null, this.camera = null, this.scene = null, this.tilesRenderer = null, this._enabled = !0, this.cameraRadius = 5, this.rotationSpeed = 1, this.minAltitude = 0, this.maxAltitude = 0.45 * Math.PI, this.minDistance = 10, this.maxDistance = 1 / 0, this.minZoom = 0, this.maxZoom = 1 / 0, this.zoomSpeed = 1, this.adjustHeight = !0, this.enableDamping = !1, this.dampingFactor = 0.15, this.fallbackPlane = new Ce(new y(0, 1, 0), 0), this.useFallbackPlane = !0, this.enableFlight = !1, this.flightSpeed = 10, this.flightSpeedMultiplier = 4, this.scaleZoomOrientationAtEdges = !1, this.autoAdjustCameraRotation = !0, this.state = Z, this.pointerTracker = new Ti(), this.needsUpdate = !1, this.actionHeightOffset = 0, this.pivotPoint = new y(), this.zoomDirectionSet = !1, this.zoomPointSet = !1, this.zoomDirection = new y(), this.zoomPoint = new y(), this.zoomDelta = 0, this.rotationInertiaPivot = new y(), this.rotationInertia = new W(), this.dragInertia = new y(), this.inertiaTargetDistance = 1 / 0, this.inertiaStableFrames = 0, this.pivotMesh = new Pi(), this.pivotMesh.raycast = () => {
    }, this.pivotMesh.scale.setScalar(0.25), this.raycaster = new si(), this.raycaster.firstHitOnly = !0, this.up = new y(0, 1, 0), this._lastTime = performance.now(), this._keysDown = /* @__PURE__ */ new Set(), this._detachCallback = null, this._upInitialized = !1, this._lastUsedState = Z, this._zoomPointWasSet = !1, this._tilesOnChangeCallback = () => this.zoomPointSet = !1, i && this.attach(i), e && this.setCamera(e), t && this.setScene(t), s && this.setTilesRenderer(s);
  }
  _getDeltaTime() {
    const t = performance.now(), e = t - this._lastTime;
    return this._lastTime = t, e * 1e-3;
  }
  /**
   * Sets the scene to raycast against for surface-based interaction.
   * @param {Object3D} scene
   */
  setScene(t) {
    this.scene = t;
  }
  /**
   * Sets the camera to control.
   * @param {Camera} camera
   */
  setCamera(t) {
    this.camera = t, this._upInitialized = !1, this.zoomDirectionSet = !1, this.zoomPointSet = !1, this.needsUpdate = !0, this.raycaster.camera = t, this.resetState();
  }
  setTilesRenderer(t) {
    console.warn('EnvironmentControls: "setTilesRenderer" has been deprecated. Use "setScene" and "setEllipsoid", instead.'), this.tilesRenderer = t, this.tilesRenderer !== null && this.setScene(this.tilesRenderer.group);
  }
  /**
   * Attaches the controls to a DOM element, registering all pointer and keyboard event listeners.
   * @param {HTMLElement} domElement
   */
  attach(t) {
    if (this.domElement)
      throw new Error("EnvironmentControls: Controls already attached to element");
    this.domElement = t, this.pointerTracker.domElement = t, t.style.touchAction = "none", t.hasAttribute("tabindex") || (t.tabIndex = -1);
    const e = (u) => {
      this.enabled && u.preventDefault();
    }, i = (u) => {
      const {
        camera: l,
        raycaster: d,
        domElement: x,
        up: O,
        pivotMesh: M,
        pointerTracker: P,
        scene: g,
        pivotPoint: R,
        enabled: D,
        enableFlight: v,
        _keysDown: C
      } = this;
      if (!this.enabled)
        return;
      if (u.preventDefault(), x.focus(), P.addPointer(u), this.needsUpdate = !0, P.isPointerTouch()) {
        if (M.visible = !1, P.getPointerCount() === 0)
          x.setPointerCapture(u.pointerId);
        else if (P.getPointerCount() > 2) {
          this.resetState();
          return;
        }
      }
      P.getCenterPoint(V), ft(V, x, V), j(d, V, l);
      const F = Math.abs(d.ray.direction.dot(O));
      if (F < $t || F < Yt)
        return;
      const ot = C.has("w") || C.has("s") || C.has("a") || C.has("d") || C.has("q") || C.has("e") || C.has("arrowup") || C.has("arrowdown") || C.has("arrowleft") || C.has("arrowright") || C.has("shift");
      if (v && ot && !P.isPointerTouch() && (P.isRightClicked() || P.isLeftClicked())) {
        R.copy(l.position), this.setState(q);
        return;
      }
      const A = this._raycast(d);
      A && (P.getPointerCount() === 2 || P.isRightClicked() || P.isLeftClicked() && u.shiftKey ? (R.copy(A.point), M.position.copy(A.point), M.visible = P.isPointerTouch() ? !1 : D, M.updateMatrixWorld(), g.add(M), this.setState(P.isPointerTouch() ? Qt : K)) : P.isLeftClicked() && (R.copy(A.point), M.position.copy(A.point), M.updateMatrixWorld(), g.add(M), this.setState(it)));
    };
    let s = !1;
    const o = (u) => {
      const { pointerTracker: l } = this;
      if (!this.enabled)
        return;
      u.preventDefault();
      const {
        pivotMesh: d,
        enabled: x
      } = this;
      this.zoomDirectionSet = !1, this.zoomPointSet = !1, this.state !== Z && (this.needsUpdate = !0), l.setHoverEvent(u), l.updatePointer(u) && (l.isPointerTouch() && l.getPointerCount() === 2 && (s || (s = !0, queueMicrotask(() => {
        s = !1, l.getCenterPoint(Jt);
        const O = l.getStartTouchPointerDistance(), M = l.getTouchPointerDistance(), P = M - O;
        if (this.state === Z || this.state === Qt) {
          l.getCenterPoint(Jt), l.getStartCenterPoint(be);
          const g = 2 * window.devicePixelRatio, R = Jt.distanceTo(be);
          (Math.abs(P) > g || R > g) && (Math.abs(P) > R ? (this.setState(gt), this.zoomDirectionSet = !1) : this.setState(K));
        }
        if (this.state === gt) {
          const g = l.getPreviousTouchPointerDistance();
          this.zoomDelta += M - g, d.visible = !1;
        } else this.state === K && (d.visible = x);
      }))), this.dispatchEvent(te));
    }, n = (u) => {
      const { pointerTracker: l } = this;
      !this.enabled || l.getPointerCount() === 0 || (l.deletePointer(u), l.getPointerType() === "touch" && l.getPointerCount() === 0 && t.releasePointerCapture(u.pointerId), this.resetState(), this.needsUpdate = !0);
    }, r = (u) => {
      if (!this.enabled)
        return;
      u.preventDefault();
      const { pointerTracker: l } = this;
      l.setHoverEvent(u), l.updatePointer(u), this.dispatchEvent(_e);
      let d;
      switch (u.deltaMode) {
        case 2:
          d = u.deltaY * 800;
          break;
        case 1:
          d = u.deltaY * 40;
          break;
        case 0:
          d = u.deltaY;
          break;
      }
      const x = Math.sign(d), O = Math.abs(d);
      this.zoomDelta -= 0.25 * x * O, this.needsUpdate = !0, this._lastUsedState = gt, this.dispatchEvent(Me);
    }, a = (u) => {
      this.enabled && this.resetState();
    };
    t.addEventListener("contextmenu", e), t.addEventListener("pointerdown", i), t.addEventListener("wheel", r, { passive: !1 });
    const c = t.getRootNode();
    c.addEventListener("pointermove", o), c.addEventListener("pointerup", n), c.addEventListener("pointerleave", a);
    const p = (u) => {
      const { _keysDown: l, state: d } = this;
      l.add(u.key.toLowerCase()), (l.has("w") || l.has("s") || l.has("a") || l.has("d") || l.has("q") || l.has("e") || l.has("arrowup") || l.has("arrowdown") || l.has("arrowleft") || l.has("arrowright")) && d !== q && this.resetState();
    }, h = (u) => {
      this._keysDown.delete(u.key.toLowerCase());
    }, m = () => {
      this._keysDown.clear();
    };
    t.addEventListener("keydown", p), window.addEventListener("keyup", h), window.addEventListener("blur", m), this._detachCallback = () => {
      t.removeEventListener("contextmenu", e), t.removeEventListener("pointerdown", i), t.removeEventListener("wheel", r), c.removeEventListener("pointermove", o), c.removeEventListener("pointerup", n), c.removeEventListener("pointerleave", a), t.removeEventListener("keydown", p), window.removeEventListener("keyup", h), window.removeEventListener("blur", m);
    };
  }
  /**
   * Detaches the controls from the DOM element, removing all event listeners.
   */
  detach() {
    this.domElement = null, this._detachCallback && (this._detachCallback(), this._detachCallback = null, this.pointerTracker.reset());
  }
  /**
   * Returns the local up direction at a world-space point. Override to provide terrain-aware
   * up vectors (e.g. ellipsoid normals). Default returns the controls' `up` vector.
   * @param {Vector3} point - World-space point to query.
   * @param {Vector3} target - Target vector to write the result into.
   */
  getUpDirection(t, e) {
    e.copy(this.up);
  }
  /**
   * Returns the local up direction at the camera's current position.
   * @param {Vector3} target - Target vector to write the result into.
   */
  getCameraUpDirection(t) {
    this.getUpDirection(this.camera.position, t);
  }
  /**
   * Returns the current drag or rotation pivot point in world space.
   * @param {Vector3} target - Target vector to write the result into.
   * @returns {Vector3|null} The target vector, or null if no pivot is active.
   */
  getPivotPoint(t) {
    let e = null;
    this._lastUsedState === gt ? this._zoomPointWasSet && (e = t.copy(this.zoomPoint)) : (this._lastUsedState === K || this._lastUsedState === it) && (e = t.copy(this.pivotPoint));
    const { camera: i, raycaster: s } = this;
    e !== null && (_.copy(e).project(i), (_.x < -1 || _.x > 1 || _.y < -1 || _.y > 1) && (e = null)), j(s, { x: 0, y: 0 }, i);
    const o = this._raycast(s);
    return o && (e === null || o.distance < e.distanceTo(s.ray.origin)) && (e = t.copy(o.point)), e;
  }
  /**
   * Clears the current interaction state, cancelling any active drag, rotate, or zoom.
   */
  resetState() {
    this.state !== Z && this.dispatchEvent(Me), this.state = Z, this.pivotMesh.removeFromParent(), this.pivotMesh.visible = this.enabled, this.actionHeightOffset = 0, this.pointerTracker.reset();
  }
  /**
   * Sets the current control state (e.g. `NONE`, `DRAG`, `ROTATE`, `ZOOM`).
   * @param {number} [state] - One of the exported state constants. Defaults to current state.
   * @param {boolean} [fireEvent=true] - Whether to dispatch `'start'` and `'end'` events.
   */
  setState(t = this.state, e = !0) {
    this.state !== t && (this.state === Z && e && this.dispatchEvent(_e), this.pivotMesh.visible = this.enabled, this.dragInertia.set(0, 0, 0), this.rotationInertia.set(0, 0), this.inertiaStableFrames = 0, this.state = t, t !== Z && t !== Qt && (this._lastUsedState = t));
  }
  /**
   * Applies pending input and inertia to the camera. Must be called each frame.
   * @param {number} [deltaTime] - Time in seconds since the last frame. Defaults to the clock delta, capped at 64ms.
   */
  update(t = Math.min(this._getDeltaTime(), 64 / 1e3)) {
    if (!this.enabled || !this.camera || t === 0)
      return;
    const {
      camera: e,
      cameraRadius: i,
      pivotPoint: s,
      up: o,
      state: n,
      adjustHeight: r,
      autoAdjustCameraRotation: a
    } = this;
    e.updateMatrixWorld(), this.getCameraUpDirection(I), this._upInitialized || (this._upInitialized = !0, this.up.copy(I)), this.zoomPointSet = !1;
    const c = this._inertiaNeedsUpdate(), p = this.needsUpdate || c;
    if (this.needsUpdate || c) {
      const u = this.zoomDelta;
      this._updateZoom(), this._updatePosition(t), this._updateRotation(t), n === it || n === K || n === q ? (L.set(0, 0, -1).transformDirection(e.matrixWorld), this.inertiaTargetDistance = _.copy(s).sub(e.position).dot(L)) : n === Z && this._updateInertia(t), (n !== Z || u !== 0 || c) && this.dispatchEvent(te), this.needsUpdate = !1;
    }
    const h = this._updateFlight(t);
    h && (this.dragInertia.set(0, 0, 0), this.rotationInertia.set(0, 0, 0), this.dispatchEvent(te));
    const m = e.isOrthographicCamera ? null : r && !h && this._getPointBelowCamera() || null;
    if (this.getCameraUpDirection(I), this._setFrame(I), (this.state === it || this.state === K || this.state === q) && this.actionHeightOffset !== 0) {
      const { actionHeightOffset: u } = this;
      e.position.addScaledVector(o, -u), s.addScaledVector(o, -u), m && (m.distance -= u);
    }
    if (this.actionHeightOffset = 0, m) {
      const u = m.distance;
      if (u < i) {
        const l = i - u;
        e.position.addScaledVector(o, l), s.addScaledVector(o, l), this.actionHeightOffset = l;
      }
    }
    this.pointerTracker.updateFrame(), (p && a || h) && (this.getCameraUpDirection(I), this._alignCameraUp(I, 1), this.getCameraUpDirection(I), this._clampRotation(I));
  }
  /**
   * Adjusts the camera to satisfy altitude and distance constraints. Called automatically by `update`.
   * Override in subclasses to add custom camera adjustment behaviour (e.g. near/far plane updates).
   * @param {Camera} camera
   */
  adjustCamera(t) {
    const { adjustHeight: e, cameraRadius: i } = this;
    if (t.isPerspectiveCamera) {
      this.getUpDirection(t.position, I);
      const s = e && this._getPointBelowCamera(t.position, I) || null;
      if (s) {
        const o = s.distance;
        o < i && t.position.addScaledVector(I, i - o);
      }
    }
  }
  /**
   * Disposes of event listeners and internal resources. Calls `detach` if currently attached.
   */
  dispose() {
    this.detach();
  }
  // private
  _updateInertia(t) {
    const {
      rotationInertia: e,
      pivotPoint: i,
      dragInertia: s,
      enableDamping: o,
      dampingFactor: n,
      camera: r,
      cameraRadius: a,
      minDistance: c,
      inertiaTargetDistance: p
    } = this;
    if (!this.enableDamping || this.inertiaStableFrames > 1) {
      s.set(0, 0, 0), e.set(0, 0, 0);
      return;
    }
    const h = Math.pow(2, -t / n), m = Math.max(r.near, a, c, p), d = 0.25 * (2 / (2 * 1e3));
    if (e.lengthSq() > 0) {
      j(S, _.set(0, 0, -1), r), S.applyMatrix4(r.matrixWorldInverse), S.direction.normalize(), S.recast(-S.direction.dot(S.origin)).at(m / S.direction.z, _), _.applyMatrix4(r.matrixWorld), j(S, k.set(d, d, -1), r), S.applyMatrix4(r.matrixWorldInverse), S.direction.normalize(), S.recast(-S.direction.dot(S.origin)).at(m / S.direction.z, k), k.applyMatrix4(r.matrixWorld), _.sub(i).normalize(), k.sub(i).normalize();
      const x = _.angleTo(k) / t;
      e.multiplyScalar(h), (e.lengthSq() < x ** 2 || !o) && e.set(0, 0);
    }
    if (s.lengthSq() > 0) {
      j(S, _.set(0, 0, -1), r), S.applyMatrix4(r.matrixWorldInverse), S.direction.normalize(), S.recast(-S.direction.dot(S.origin)).at(m / S.direction.z, _), _.applyMatrix4(r.matrixWorld), j(S, k.set(d, d, -1), r), S.applyMatrix4(r.matrixWorldInverse), S.direction.normalize(), S.recast(-S.direction.dot(S.origin)).at(m / S.direction.z, k), k.applyMatrix4(r.matrixWorld);
      const x = _.distanceTo(k) / t;
      s.multiplyScalar(h), (s.lengthSq() < x ** 2 || !o) && s.set(0, 0, 0);
    }
    e.lengthSq() > 0 && this._applyRotation(e.x * t, e.y * t, i), s.lengthSq() > 0 && (r.position.addScaledVector(s, t), r.updateMatrixWorld());
  }
  _inertiaNeedsUpdate() {
    const { rotationInertia: t, dragInertia: e } = this;
    return t.lengthSq() !== 0 || e.lengthSq() !== 0;
  }
  _getFlightSpeedScale() {
    return 1;
  }
  _updateFlight(t) {
    const {
      camera: e,
      enableFlight: i,
      flightSpeed: s,
      flightSpeedMultiplier: o,
      _keysDown: n
    } = this;
    if (!i || e.isOrthographicCamera)
      return !1;
    const r = n.has("w") || n.has("arrowup"), a = n.has("s") || n.has("arrowdown"), c = n.has("a") || n.has("arrowleft"), p = n.has("d") || n.has("arrowright"), h = n.has("q"), m = n.has("e"), l = (n.has("shift") ? o : 1) * s * this._getFlightSpeedScale() * t;
    return Wt.set(
      (p ? 1 : 0) - (c ? 1 : 0),
      (h ? 1 : 0) - (m ? 1 : 0),
      (a ? 1 : 0) - (r ? 1 : 0)
    ), Wt.lengthSq() === 0 ? !1 : (Wt.normalize().transformDirection(e.matrixWorld), e.position.addScaledVector(Wt, l), e.updateMatrixWorld(), !0);
  }
  _updateZoom() {
    const {
      zoomPoint: t,
      zoomDirection: e,
      camera: i,
      minDistance: s,
      maxDistance: o,
      pointerTracker: n,
      domElement: r,
      minZoom: a,
      maxZoom: c,
      zoomSpeed: p,
      state: h
    } = this;
    let m = this.zoomDelta;
    if (this.zoomDelta = 0, !(!n.getLatestPoint(V) || m === 0 && h !== gt))
      if (this.rotationInertia.set(0, 0), this.dragInertia.set(0, 0, 0), i.isOrthographicCamera) {
        this._updateZoomDirection();
        const u = this.zoomPointSet || this._updateZoomPoint();
        Lt.unproject(i);
        const l = Math.pow(0.95, Math.abs(m * 0.05));
        let d = m > 0 ? 1 / Math.abs(l) : l;
        d *= p, d > 1 ? c < i.zoom * d && (d = 1) : a > i.zoom * d && (d = 1), i.zoom *= d, i.updateProjectionMatrix(), u && (ft(V, r, Kt), Kt.unproject(i), i.position.sub(Kt).add(Lt), i.updateMatrixWorld());
      } else {
        this._updateZoomDirection();
        const u = _.copy(e);
        if (this.zoomPointSet || this._updateZoomPoint()) {
          const l = t.distanceTo(i.position);
          if (m < 0) {
            const d = Math.min(0, l - o);
            m = m * l * p * 25e-4, m = Math.max(m, d);
          } else {
            const d = Math.max(0, l - s);
            m = m * Math.max(l - s, 0) * p * 25e-4, m = Math.min(m, d);
          }
          i.position.addScaledVector(e, m), i.updateMatrixWorld();
        } else {
          const l = this._getPointBelowCamera();
          if (l) {
            const d = l.distance;
            u.set(0, 0, -1).transformDirection(i.matrixWorld), i.position.addScaledVector(u, m * d * 0.01), i.updateMatrixWorld();
          } else
            i.position.addScaledVector(e, m), i.updateMatrixWorld();
        }
      }
  }
  _updateZoomDirection() {
    if (this.zoomDirectionSet)
      return;
    const { domElement: t, raycaster: e, camera: i, zoomDirection: s, pointerTracker: o } = this;
    o.getLatestPoint(V), ft(V, t, Lt), j(e, Lt, i), s.copy(e.ray.direction).normalize(), this.zoomDirectionSet = !0;
  }
  // update the point being zoomed in to based on the zoom direction
  _updateZoomPoint() {
    const {
      camera: t,
      zoomDirectionSet: e,
      zoomDirection: i,
      raycaster: s,
      zoomPoint: o,
      pointerTracker: n,
      domElement: r
    } = this;
    if (this._zoomPointWasSet = !1, !e)
      return !1;
    t.isOrthographicCamera && n.getLatestPoint(Ut) ? (ft(Ut, r, Ut), j(s, Ut, t)) : (s.ray.origin.copy(t.position), s.ray.direction.copy(i), s.near = 0, s.far = 1 / 0);
    const a = this._raycast(s);
    return a ? (o.copy(a.point), this.zoomPointSet = !0, this._zoomPointWasSet = !0, !0) : !1;
  }
  // returns the point below the camera
  _getPointBelowCamera(t = this.camera.position, e = this.up) {
    const { raycaster: i } = this;
    i.ray.direction.copy(e).multiplyScalar(-1), i.ray.origin.copy(t).addScaledVector(e, 1e5), i.near = 0, i.far = 1 / 0;
    const s = this._raycast(i);
    return s && (s.distance -= 1e5), s;
  }
  // update the drag action
  _updatePosition(t) {
    const {
      raycaster: e,
      camera: i,
      pivotPoint: s,
      up: o,
      pointerTracker: n,
      domElement: r,
      state: a,
      dragInertia: c
    } = this;
    if (a === it) {
      if (n.getCenterPoint(V), ft(V, r, V), ye.setFromNormalAndCoplanarPoint(o, s), j(e, V, i), Math.abs(e.ray.direction.dot(o)) < $t) {
        const p = Math.acos($t);
        At.crossVectors(e.ray.direction, o).normalize(), e.ray.direction.copy(o).applyAxisAngle(At, p).multiplyScalar(-1);
      }
      if (this.getUpDirection(s, I), Math.abs(e.ray.direction.dot(I)) < Yt) {
        const p = Math.acos(Yt);
        At.crossVectors(e.ray.direction, I).normalize(), e.ray.direction.copy(I).applyAxisAngle(At, p).multiplyScalar(-1);
      }
      e.ray.intersectPlane(ye, _) && (k.subVectors(s, _), i.position.add(k), i.updateMatrixWorld(), k.multiplyScalar(1 / t), n.getMoveDistance() / t < 2 * window.devicePixelRatio ? this.inertiaStableFrames++ : (c.copy(k), this.inertiaStableFrames = 0));
    }
  }
  _updateRotation(t) {
    const {
      pivotPoint: e,
      pointerTracker: i,
      domElement: s,
      state: o,
      rotationInertia: n
    } = this;
    (o === K || o === q) && (o === q && e.copy(this.camera.position), i.getCenterPoint(V), i.getPreviousCenterPoint(xe), Pt.subVectors(V, xe).multiplyScalar(2 * Math.PI / s.clientHeight), this._applyRotation(Pt.x, Pt.y, e), Pt.multiplyScalar(1 / t), i.getMoveDistance() / t < 2 * window.devicePixelRatio ? this.inertiaStableFrames++ : (n.copy(Pt), this.inertiaStableFrames = 0));
  }
  _applyRotation(t, e, i) {
    if (t === 0 && e === 0)
      return;
    const {
      camera: s,
      minAltitude: o,
      maxAltitude: n,
      rotationSpeed: r
    } = this, a = -t * r;
    let c = e * r;
    L.set(0, 0, 1).transformDirection(s.matrixWorld), H.set(1, 0, 0).transformDirection(s.matrixWorld), this.getUpDirection(i, I);
    let p;
    I.dot(L) > 1 - 1e-10 ? p = 0 : (_.crossVectors(I, L).normalize(), p = Math.sign(_.dot(H)) * I.angleTo(L)), c > 0 ? (c = Math.min(p - o, c), c = Math.max(0, c)) : (c = Math.max(p - n, c), c = Math.min(0, c)), G.setFromAxisAngle(I, a), xt(i, G, et), s.matrixWorld.premultiply(et), H.set(1, 0, 0).transformDirection(s.matrixWorld), G.setFromAxisAngle(H, -c), xt(i, G, et), s.matrixWorld.premultiply(et), s.matrixWorld.decompose(s.position, s.quaternion, _);
  }
  // sets the "up" axis for the current surface of the tileset
  _setFrame(t) {
    const {
      up: e,
      camera: i,
      zoomPoint: s,
      zoomDirectionSet: o,
      zoomPointSet: n,
      scaleZoomOrientationAtEdges: r
    } = this;
    if (o && (n || this._updateZoomPoint())) {
      if (G.setFromUnitVectors(e, t), r) {
        this.getUpDirection(s, _);
        let a = Math.max(_.dot(e) - 0.6, 0) / 0.4;
        a = T.mapLinear(a, 0, 0.5, 0, 1), a = Math.min(a, 1), i.isOrthographicCamera && (a *= 0.1), G.slerp(vi, 1 - a);
      }
      xt(s, G, et), i.updateMatrixWorld(), i.matrixWorld.premultiply(et), i.matrixWorld.decompose(i.position, i.quaternion, _), this.zoomDirectionSet = !1, this._updateZoomDirection();
    }
    e.copy(t), i.updateMatrixWorld();
  }
  _raycast(t) {
    const { scene: e, useFallbackPlane: i, fallbackPlane: s } = this, o = t.intersectObject(e)[0] || null;
    if (o)
      return o;
    if (i) {
      const n = s;
      if (t.ray.intersectPlane(n, _))
        return {
          point: _.clone(),
          distance: t.ray.origin.distanceTo(_)
        };
    }
    return null;
  }
  // tilt the camera to align with the provided "up" value
  _alignCameraUp(t, e = 1) {
    const { camera: i, state: s, pivotPoint: o, zoomPoint: n, zoomPointSet: r } = this;
    i.updateMatrixWorld(), L.set(0, 0, -1).transformDirection(i.matrixWorld), H.set(-1, 0, 0).transformDirection(i.matrixWorld);
    let a = T.mapLinear(1 - Math.abs(L.dot(t)), 0, 0.2, 0, 1);
    a = T.clamp(a, 0, 1), e *= a, Xt.crossVectors(t, L), Xt.lerp(H, 1 - e).normalize(), G.setFromUnitVectors(H, Xt), i.quaternion.premultiply(G);
    let c = null;
    s === it || s === K || s === q ? c = zt.copy(o) : r && (c = zt.copy(n)), c && (It.copy(i.matrixWorld).invert(), _.copy(c).applyMatrix4(It), i.updateMatrixWorld(), _.applyMatrix4(i.matrixWorld), Ft.subVectors(c, _), i.position.add(Ft)), i.updateMatrixWorld();
  }
  // clamp rotation to the given "up" vector
  _clampRotation(t) {
    const { camera: e, minAltitude: i, maxAltitude: s, state: o, pivotPoint: n, zoomPoint: r, zoomPointSet: a } = this;
    e.updateMatrixWorld(), L.set(0, 0, 1).transformDirection(e.matrixWorld), H.set(1, 0, 0).transformDirection(e.matrixWorld);
    let c;
    t.dot(L) > 1 - 1e-10 ? c = 0 : (_.crossVectors(t, L), c = Math.sign(_.dot(H)) * t.angleTo(L));
    let p;
    if (c > s)
      p = s;
    else if (c < i)
      p = i;
    else
      return;
    L.copy(t), G.setFromAxisAngle(H, p), L.applyQuaternion(G).normalize(), _.crossVectors(L, H).normalize(), et.makeBasis(H, _, L), e.quaternion.setFromRotationMatrix(et);
    let h = null;
    o === it || o === K || o === q ? h = zt.copy(n) : a && (h = zt.copy(r)), h && (It.copy(e.matrixWorld).invert(), _.copy(h).applyMatrix4(It), e.updateMatrixWorld(), _.applyMatrix4(e.matrixWorld), Ft.subVectors(h, _), e.position.add(Ft)), e.updateMatrixWorld();
  }
}
const Pe = /* @__PURE__ */ new z(), ut = /* @__PURE__ */ new z(), N = /* @__PURE__ */ new y(), w = /* @__PURE__ */ new y(), J = /* @__PURE__ */ new y(), B = /* @__PURE__ */ new y(), Ci = /* @__PURE__ */ new y(), mt = /* @__PURE__ */ new y(), tt = /* @__PURE__ */ new st(), we = /* @__PURE__ */ new y(), rt = /* @__PURE__ */ new y(), E = /* @__PURE__ */ new Nt(), Te = /* @__PURE__ */ new hi(), Vt = /* @__PURE__ */ new W(), ve = {}, Si = 2550;
class ki extends Di {
  get tilesGroup() {
    return console.warn('GlobeControls: "tilesGroup" has been deprecated. Use "ellipsoidGroup", instead.'), this.ellipsoidFrame;
  }
  /**
   * The world matrix of `ellipsoidGroup`, representing the ellipsoid's coordinate frame.
   * @type {Matrix4}
   * @readonly
   */
  get ellipsoidFrame() {
    return this.ellipsoidGroup.matrixWorld;
  }
  /**
   * The inverse of `ellipsoidFrame`.
   * @type {Matrix4}
   * @readonly
   */
  get ellipsoidFrameInverse() {
    const { ellipsoidGroup: t, ellipsoidFrame: e, _ellipsoidFrameInverse: i } = this;
    return t.matrixWorldInverse ? t.matrixWorldInverse : i.copy(e).invert();
  }
  constructor(t = null, e = null, i = null, s = null) {
    super(t, e, i), this.isGlobeControls = !0, this._dragMode = 0, this._rotationMode = 0, this.maxZoom = 0.01, this.nearMargin = 0.25, this.farMargin = 0, this.useFallbackPlane = !1, this.autoAdjustCameraRotation = !1, this.globeInertia = new st(), this.globeInertiaFactor = 0, this.ellipsoid = Tt.clone(), this.ellipsoidGroup = new wt(), this._ellipsoidFrameInverse = new z(), s !== null && this.setTilesRenderer(s);
  }
  setTilesRenderer(t) {
    super.setTilesRenderer(t), t !== null && this.setEllipsoid(t.ellipsoid, t.group);
  }
  /**
   * Sets the ellipsoid model and its scene group for globe-aware interaction.
   * @param {Ellipsoid} [ellipsoid] - Ellipsoid to use. Defaults to a WGS84 clone.
   * @param {Group} [ellipsoidGroup] - Group whose world matrix defines the ellipsoid frame.
   */
  setEllipsoid(t, e) {
    this.ellipsoid = t || Tt.clone(), this.ellipsoidGroup = e || new wt();
  }
  getPivotPoint(t) {
    const { camera: e, ellipsoidFrame: i, ellipsoidFrameInverse: s, ellipsoid: o } = this;
    return B.set(0, 0, -1).transformDirection(e.matrixWorld), E.origin.copy(e.position), E.direction.copy(B), E.applyMatrix4(s), o.closestPointToRayEstimate(E, w).applyMatrix4(i), (super.getPivotPoint(t) === null || N.subVectors(t, E.origin).dot(E.direction) > N.subVectors(w, E.origin).dot(E.direction)) && t.copy(w), t;
  }
  /**
   * Returns the vector from the camera to the center of the ellipsoid in world space.
   * @param {Vector3} target
   * @returns {Vector3}
   */
  getVectorToCenter(t) {
    const { ellipsoidFrame: e, camera: i } = this;
    return t.setFromMatrixPosition(e).sub(i.position);
  }
  /**
   * Returns the distance from the camera to the center of the ellipsoid.
   * @returns {number}
   */
  getDistanceToCenter() {
    return this.getVectorToCenter(w).length();
  }
  getUpDirection(t, e) {
    const { ellipsoidFrame: i, ellipsoidFrameInverse: s, ellipsoid: o } = this;
    w.copy(t).applyMatrix4(s), o.getPositionToNormal(w, e), e.transformDirection(i);
  }
  getCameraUpDirection(t) {
    const { ellipsoidFrame: e, ellipsoidFrameInverse: i, ellipsoid: s, camera: o } = this;
    o.isOrthographicCamera ? (this._getVirtualOrthoCameraPosition(w), w.applyMatrix4(i), s.getPositionToNormal(w, t), t.transformDirection(e)) : this.getUpDirection(o.position, t);
  }
  update(t = Math.min(this._getDeltaTime(), 64 / 1e3)) {
    if (!this.enabled || !this.camera || t === 0)
      return;
    const { camera: e, pivotMesh: i } = this;
    this._isNearControls() ? this.scaleZoomOrientationAtEdges = this.zoomDelta < 0 : (this.state !== Z && this._dragMode !== 1 && this._rotationMode !== 1 && (i.visible = !1), this.scaleZoomOrientationAtEdges = !1);
    const s = this.needsUpdate || this._inertiaNeedsUpdate();
    super.update(t), this.adjustCamera(e), s && (this._isNearControls() || this.state === q) && (this.getCameraUpDirection(mt), this._alignCameraUp(mt, 1), this.getCameraUpDirection(mt), this._clampRotation(mt));
  }
  // Updates the passed camera near and far clip planes to encapsulate the ellipsoid from the
  // current position in addition to adjusting the height.
  adjustCamera(t) {
    super.adjustCamera(t);
    const { ellipsoidFrame: e, ellipsoidFrameInverse: i, ellipsoid: s, nearMargin: o, farMargin: n } = this, r = this._getMaxWorldRadius();
    if (t.isPerspectiveCamera) {
      const a = w.setFromMatrixPosition(e).sub(t.position).length(), c = o * r, p = T.clamp((a - r) / c, 0, 1), h = T.lerp(1, 1e3, p);
      t.near = Math.max(h, a - r - c), N.copy(t.position).applyMatrix4(i), s.getPositionToCartographic(N, ve);
      const m = Math.max(s.getPositionElevation(N), Si), u = s.calculateHorizonDistance(ve.lat, m);
      t.far = u + 0.1 + r * n, t.updateProjectionMatrix();
    } else {
      this._getVirtualOrthoCameraPosition(t.position, t), t.updateMatrixWorld(), Pe.copy(t.matrixWorld).invert(), w.setFromMatrixPosition(e).applyMatrix4(Pe);
      const a = -w.z;
      t.near = a - r * (1 + o), t.far = a + 0.1 + r * n, t.position.addScaledVector(B, t.near), t.far -= t.near, t.near = 0, t.updateProjectionMatrix(), t.updateMatrixWorld();
    }
  }
  // resets the "stuck" drag modes
  setState(...t) {
    super.setState(...t), this._dragMode = 0, this._rotationMode = 0;
  }
  _updateInertia(t) {
    super._updateInertia(t);
    const {
      globeInertia: e,
      enableDamping: i,
      dampingFactor: s,
      camera: o,
      cameraRadius: n,
      minDistance: r,
      inertiaTargetDistance: a,
      ellipsoidFrame: c
    } = this;
    if (!this.enableDamping || this.inertiaStableFrames > 1) {
      this.globeInertiaFactor = 0, this.globeInertia.identity();
      return;
    }
    const p = Math.pow(2, -t / s), h = Math.max(o.near, n, r, a), l = 0.25 * (2 / (2 * 1e3));
    if (J.setFromMatrixPosition(c), this.globeInertiaFactor !== 0) {
      j(E, w.set(0, 0, -1), o), E.applyMatrix4(o.matrixWorldInverse), E.direction.normalize(), E.recast(-E.direction.dot(E.origin)).at(h / E.direction.z, w), w.applyMatrix4(o.matrixWorld), j(E, N.set(l, l, -1), o), E.applyMatrix4(o.matrixWorldInverse), E.direction.normalize(), E.recast(-E.direction.dot(E.origin)).at(h / E.direction.z, N), N.applyMatrix4(o.matrixWorld), w.sub(J).normalize(), N.sub(J).normalize(), this.globeInertiaFactor *= p;
      const d = w.angleTo(N) / t;
      (2 * Math.acos(e.w) * this.globeInertiaFactor < d || !i) && (this.globeInertiaFactor = 0, e.identity());
    }
    this.globeInertiaFactor !== 0 && (e.w === 1 && (e.x !== 0 || e.y !== 0 || e.z !== 0) && (e.w = Math.min(e.w, 1 - 1e-9)), J.setFromMatrixPosition(c), tt.identity().slerp(e, this.globeInertiaFactor * t), xt(J, tt, ut), o.matrixWorld.premultiply(ut), o.matrixWorld.decompose(o.position, o.quaternion, w));
  }
  _inertiaNeedsUpdate() {
    return super._inertiaNeedsUpdate() || this.globeInertiaFactor !== 0;
  }
  _getFlightSpeedScale() {
    const t = this.getDistanceToCenter() - this._getMaxWorldRadius();
    return 2 * Math.max(t, 1e3);
  }
  _updateFlight(t) {
    const { camera: e } = this, i = super._updateFlight(t);
    if (i) {
      const s = this._getMaxPerspectiveDistance(), o = this.getDistanceToCenter();
      if (o > s && (this.getVectorToCenter(w).normalize(), e.position.addScaledVector(w, o - s), e.updateMatrixWorld()), !this._isNearControls()) {
        const n = T.clamp(
          T.mapLinear(this.getDistanceToCenter(), this._getPerspectiveTransitionDistance(), s, 0, 1),
          0,
          1
        );
        this._tiltTowardsCenter(0.02 * n), this._alignCameraUpToNorth(0.01 * n);
      }
    }
    return i;
  }
  _updatePosition(t) {
    if (this.state === it) {
      this._dragMode === 0 && (this._dragMode = this._isNearControls() ? 1 : -1);
      const {
        raycaster: e,
        camera: i,
        pivotPoint: s,
        pointerTracker: o,
        domElement: n,
        ellipsoidFrame: r,
        ellipsoidFrameInverse: a
      } = this, c = N, p = Ci;
      o.getCenterPoint(Vt), ft(Vt, n, Vt), j(e, Vt, i), e.ray.applyMatrix4(a);
      const h = w.copy(s).applyMatrix4(a).length();
      if (Te.radius.setScalar(h), !Te.intersectRay(e.ray, w)) {
        this.resetState(), this._updateInertia(t);
        return;
      }
      w.applyMatrix4(r), J.setFromMatrixPosition(r), c.subVectors(s, J).normalize(), p.subVectors(w, J).normalize(), tt.setFromUnitVectors(p, c), xt(J, tt, ut), i.matrixWorld.premultiply(ut), i.matrixWorld.decompose(i.position, i.quaternion, w), o.getMoveDistance() / t < 2 * window.devicePixelRatio ? this.inertiaStableFrames++ : (this.globeInertia.copy(tt), this.globeInertiaFactor = 1 / t, this.inertiaStableFrames = 0);
    }
  }
  // disable rotation once we're outside the control transition
  _updateRotation(...t) {
    if (this.state === q) {
      super._updateRotation(...t);
      return;
    }
    this._rotationMode === 1 || this._isNearControls() ? (this._rotationMode = 1, super._updateRotation(...t)) : (this.pivotMesh.visible = !1, this._rotationMode = -1);
  }
  _updateZoom() {
    const { zoomDelta: t, zoomSpeed: e, zoomPoint: i, camera: s, maxZoom: o, state: n } = this;
    if (n !== gt && t === 0)
      return;
    this.rotationInertia.set(0, 0), this.dragInertia.set(0, 0, 0), this.globeInertia.identity(), this.globeInertiaFactor = 0;
    const r = T.clamp(T.mapLinear(Math.abs(t), 0, 20, 0, 1), 0, 1);
    if (this._isNearControls() || t > 0) {
      if (this._updateZoomDirection(), t < 0 && (this.zoomPointSet || this._updateZoomPoint())) {
        B.set(0, 0, -1).transformDirection(s.matrixWorld).normalize(), rt.copy(this.up).multiplyScalar(-1), this.getUpDirection(i, we);
        const a = T.clamp(T.mapLinear(-we.dot(rt), 1, 0.95, 0, 1), 0, 1), c = 1 - B.dot(rt), p = s.isOrthographicCamera ? 0.05 : 1, h = T.clamp(r * 3, 0, 1), m = Math.min(a * c * p * h, 0.1);
        rt.lerpVectors(B, rt, m).normalize(), tt.setFromUnitVectors(B, rt), xt(i, tt, ut), s.matrixWorld.premultiply(ut), s.matrixWorld.decompose(s.position, s.quaternion, rt), this.zoomDirection.subVectors(i, s.position).normalize();
      }
      super._updateZoom();
    } else if (s.isPerspectiveCamera) {
      const a = this._getPerspectiveTransitionDistance(), c = this._getMaxPerspectiveDistance(), p = T.mapLinear(this.getDistanceToCenter(), a, c, 0, 1);
      this._tiltTowardsCenter(T.lerp(0, 0.4, p * r)), this._alignCameraUpToNorth(T.lerp(0, 0.2, p * r));
      const h = this.getDistanceToCenter() - this._getMaxWorldRadius(), m = t * h * e * 25e-4, u = Math.max(m, Math.min(this.getDistanceToCenter() - c, 0));
      this.getVectorToCenter(w).normalize(), this.camera.position.addScaledVector(w, u), this.camera.updateMatrixWorld(), this.zoomDelta = 0;
    } else {
      const a = this._getOrthographicTransitionZoom(), c = this._getMinOrthographicZoom(), p = T.mapLinear(s.zoom, a, c, 0, 1);
      this._tiltTowardsCenter(T.lerp(0, 0.4, p * r)), this._alignCameraUpToNorth(T.lerp(0, 0.2, p * r));
      const h = this.zoomDelta, m = Math.pow(0.95, Math.abs(h * 0.05)), u = h > 0 ? 1 / Math.abs(m) : m, l = c / s.zoom, d = Math.max(u * e, Math.min(l, 1));
      s.zoom = Math.min(o, s.zoom * d), s.updateProjectionMatrix(), this.zoomDelta = 0, this.zoomDirectionSet = !1;
    }
  }
  // tilt the camera to align with north
  _alignCameraUpToNorth(t) {
    const { ellipsoidFrame: e } = this;
    mt.set(0, 0, 1).transformDirection(e), this._alignCameraUp(mt, t);
  }
  // tilt the camera to look at the center of the globe
  _tiltTowardsCenter(t) {
    const {
      camera: e,
      ellipsoidFrame: i
    } = this;
    B.set(0, 0, -1).transformDirection(e.matrixWorld).normalize(), w.setFromMatrixPosition(i).sub(e.position).normalize(), w.lerp(B, 1 - t).normalize(), tt.setFromUnitVectors(B, w), e.quaternion.premultiply(tt), e.updateMatrixWorld();
  }
  // returns the perspective camera transition distance can move to based on globe size and fov
  _getPerspectiveTransitionDistance() {
    const { camera: t } = this;
    if (!t.isPerspectiveCamera)
      throw new Error();
    const e = this._getMaxWorldRadius(), i = 2 * Math.atan(Math.tan(T.DEG2RAD * t.fov * 0.5) * t.aspect), s = e / Math.tan(T.DEG2RAD * t.fov * 0.5), o = e / Math.tan(i * 0.5);
    return Math.max(s, o);
  }
  // returns the max distance the perspective camera can move to based on globe size and fov
  _getMaxPerspectiveDistance() {
    const { camera: t } = this;
    if (!t.isPerspectiveCamera)
      throw new Error();
    const e = this._getMaxWorldRadius(), i = 2 * Math.atan(Math.tan(T.DEG2RAD * t.fov * 0.5) * t.aspect), s = e / Math.tan(T.DEG2RAD * t.fov * 0.5), o = e / Math.tan(i * 0.5);
    return 2 * Math.max(s, o);
  }
  // returns the transition threshold for orthographic zoom based on the globe size and camera settings
  _getOrthographicTransitionZoom() {
    const { camera: t } = this;
    if (!t.isOrthographicCamera)
      throw new Error();
    const e = t.top - t.bottom, i = t.right - t.left, s = Math.max(e, i), n = 2 * this._getMaxWorldRadius();
    return 2 * s / n;
  }
  // returns the minimum allowed orthographic zoom based on the globe size and camera settings
  _getMinOrthographicZoom() {
    const { camera: t } = this;
    if (!t.isOrthographicCamera)
      throw new Error();
    const e = t.top - t.bottom, i = t.right - t.left, s = Math.min(e, i), n = 2 * this._getMaxWorldRadius();
    return 0.7 * s / n;
  }
  // returns the "virtual position" of the orthographic based on where it is and
  // where it's looking primarily so we can reasonably position the camera object
  // in space and derive a reasonable "up" value.
  _getVirtualOrthoCameraPosition(t, e = this.camera) {
    const { ellipsoidFrame: i, ellipsoidFrameInverse: s, ellipsoid: o } = this;
    if (!e.isOrthographicCamera)
      throw new Error();
    E.origin.copy(e.position), E.direction.set(0, 0, -1).transformDirection(e.matrixWorld), E.applyMatrix4(s), o.closestPointToRayEstimate(E, N).applyMatrix4(i);
    const n = e.top - e.bottom, r = e.right - e.left, a = Math.max(n, r) / e.zoom;
    B.set(0, 0, -1).transformDirection(e.matrixWorld);
    const c = N.sub(e.position).dot(B);
    t.copy(e.position).addScaledVector(B, c - a * 4);
  }
  _isNearControls() {
    const { camera: t } = this;
    return t.isPerspectiveCamera ? this.getDistanceToCenter() < this._getPerspectiveTransitionDistance() : t.zoom > this._getOrthographicTransitionZoom();
  }
  _raycast(t) {
    const e = super._raycast(t);
    if (e === null) {
      const { ellipsoid: i, ellipsoidFrame: s, ellipsoidFrameInverse: o } = this;
      E.copy(t.ray).applyMatrix4(o);
      const n = i.intersectRay(E, w);
      return n !== null ? (n.applyMatrix4(s), {
        point: n.clone(),
        distance: n.distanceTo(t.ray.origin)
      }) : null;
    } else
      return e;
  }
  _getMaxWorldRadius() {
    const { ellipsoid: t, ellipsoidFrame: e } = this;
    return Math.max(...t.radius) * e.getMaxScaleOnAxis();
  }
}
const U = /* @__PURE__ */ new y(), at = /* @__PURE__ */ new y(), ct = /* @__PURE__ */ new Se(), Ei = /* @__PURE__ */ new y(), Ri = /* @__PURE__ */ new y(), Oi = /* @__PURE__ */ new y(), De = /* @__PURE__ */ new st(), Ii = /* @__PURE__ */ new st();
class Ni extends yt {
  /**
   * Whether a transition animation is currently in progress.
   * @type {boolean}
   * @readonly
   */
  get animating() {
    return this._alpha !== 0 && this._alpha !== 1;
  }
  /**
   * Transition progress from 0 (at perspective) to 1 (at orthographic).
   * @type {number}
   * @readonly
   */
  get alpha() {
    return this._target === 0 ? 1 - this._alpha : this._alpha;
  }
  /**
   * The currently active camera. Returns `perspectiveCamera`, `orthographicCamera`, or the
   * blended `transitionCamera` depending on the current transition state.
   * @type {Camera}
   * @readonly
   */
  get camera() {
    return this._alpha === 0 ? this.perspectiveCamera : this._alpha === 1 ? this.orthographicCamera : this.transitionCamera;
  }
  /**
   * The target camera mode. Set to `'perspective'` or `'orthographic'` to jump instantly without
   * animation. Use `toggle()` to animate the transition.
   * @type {string}
   */
  get mode() {
    return this._target === 0 ? "perspective" : "orthographic";
  }
  set mode(t) {
    if (t === this.mode)
      return;
    const e = this.camera;
    t === "perspective" ? (this._target = 0, this._alpha = 0) : (this._target = 1, this._alpha = 1), this.dispatchEvent({ type: "camera-change", camera: this.camera, prevCamera: e });
  }
  constructor(t = new se(), e = new Se()) {
    super(), this.perspectiveCamera = t, this.orthographicCamera = e, this.transitionCamera = new se(), this.orthographicPositionalZoom = !0, this.orthographicOffset = 50, this.fixedPoint = new y(), this.duration = 200, this.autoSync = !0, this.easeFunction = (i) => i, this._target = 0, this._alpha = 0, this._clock = new oi();
  }
  /**
   * Begins an animated transition to the opposite camera mode. Dispatches a `'toggle'` event.
   */
  toggle() {
    this._target = this._target === 1 ? 0 : 1, this._clock.getDelta(), this.dispatchEvent({ type: "toggle" });
  }
  /**
   * Advances the transition animation and updates the active camera. Must be called each frame.
   * @param {number} [deltaTime] - Time in seconds since the last frame. Defaults to the clock delta, capped at 64ms.
   */
  update(t = Math.min(this._clock.getDelta(), 64 / 1e3)) {
    this.autoSync && this.syncCameras();
    const { perspectiveCamera: e, orthographicCamera: i, transitionCamera: s, camera: o } = this, n = t * 1e3;
    if (this._alpha !== this._target) {
      const p = Math.sign(this._target - this._alpha) * n / this.duration;
      this._alpha = T.clamp(this._alpha + p, 0, 1), this.dispatchEvent({ type: "change", alpha: this.alpha });
    }
    const r = o;
    let a = null;
    this._alpha === 0 ? a = e : this._alpha === 1 ? a = i : (a = s, this._updateTransitionCamera()), r !== a && (a === s && this.dispatchEvent({ type: "transition-start" }), this.dispatchEvent({ type: "camera-change", camera: a, prevCamera: r }), r === s && this.dispatchEvent({ type: "transition-end" }));
  }
  /**
   * Synchronises the non-active camera so that both cameras represent the same viewpoint.
   * Called automatically by `update` when `autoSync` is true.
   */
  syncCameras() {
    const t = this._getFromCamera(), { perspectiveCamera: e, orthographicCamera: i, transitionCamera: s, fixedPoint: o } = this;
    if (U.set(0, 0, -1).transformDirection(t.matrixWorld).normalize(), t.isPerspectiveCamera) {
      if (this.orthographicPositionalZoom)
        i.position.copy(e.position).addScaledVector(U, -this.orthographicOffset), i.rotation.copy(e.rotation), i.updateMatrixWorld();
      else {
        const c = at.subVectors(o, i.position).dot(U), p = at.subVectors(o, e.position).dot(U);
        at.copy(e.position).addScaledVector(U, p), i.rotation.copy(e.rotation), i.position.copy(at).addScaledVector(U, -c), i.updateMatrixWorld();
      }
      const n = Math.abs(at.subVectors(e.position, o).dot(U)), r = 2 * Math.tan(T.DEG2RAD * e.fov * 0.5) * n, a = i.top - i.bottom;
      i.zoom = a / r, i.updateProjectionMatrix();
    } else {
      const n = Math.abs(at.subVectors(i.position, o).dot(U)), a = (i.top - i.bottom) / i.zoom * 0.5 / Math.tan(T.DEG2RAD * e.fov * 0.5);
      e.rotation.copy(i.rotation), e.position.copy(i.position).addScaledVector(U, n).addScaledVector(U, -a), e.updateMatrixWorld(), this.orthographicPositionalZoom && (i.position.copy(e.position).addScaledVector(U, -this.orthographicOffset), i.updateMatrixWorld());
    }
    s.position.copy(e.position), s.rotation.copy(e.rotation);
  }
  _getTransitionDirection() {
    return Math.sign(this._target - this._alpha);
  }
  _getToCamera() {
    const t = this._getTransitionDirection();
    return t === 0 ? this._target === 0 ? this.perspectiveCamera : this.orthographicCamera : t > 0 ? this.orthographicCamera : this.perspectiveCamera;
  }
  _getFromCamera() {
    const t = this._getTransitionDirection();
    return t === 0 ? this._target === 0 ? this.perspectiveCamera : this.orthographicCamera : t > 0 ? this.perspectiveCamera : this.orthographicCamera;
  }
  _updateTransitionCamera() {
    const { perspectiveCamera: t, orthographicCamera: e, transitionCamera: i, fixedPoint: s } = this, o = this.easeFunction(this._alpha);
    U.set(0, 0, -1).transformDirection(e.matrixWorld).normalize(), ct.copy(e), ct.position.addScaledVector(U, e.near), e.far -= e.near, e.near = 0, U.set(0, 0, -1).transformDirection(t.matrixWorld).normalize();
    const n = Math.abs(at.subVectors(t.position, s).dot(U)), r = 2 * Math.tan(T.DEG2RAD * t.fov * 0.5) * n, a = Ii.slerpQuaternions(t.quaternion, ct.quaternion, o), c = T.lerp(t.fov, 1, o), p = r * 0.5 / Math.tan(T.DEG2RAD * c * 0.5), h = Oi.copy(ct.position).sub(s).applyQuaternion(De.copy(ct.quaternion).invert()), m = Ri.copy(t.position).sub(s).applyQuaternion(De.copy(t.quaternion).invert()), u = Ei.lerpVectors(m, h, o);
    u.z -= Math.abs(u.z) - p;
    const l = -(m.z - u.z), d = -(h.z - u.z), x = T.lerp(l + t.near, d + ct.near, o), O = T.lerp(l + t.far, d + ct.far, o), M = Math.max(O, 0) - Math.max(x, 0);
    i.aspect = t.aspect, i.fov = c, i.near = Math.max(x, M * 1e-5), i.far = O, i.position.copy(u).applyQuaternion(a).add(s), i.quaternion.copy(a), i.updateProjectionMatrix(), i.updateMatrixWorld();
  }
}
export {
  Ee as B,
  ui as C,
  Di as E,
  ki as G,
  Oe as I,
  Re as P,
  Vi as T,
  Ni as a
};
