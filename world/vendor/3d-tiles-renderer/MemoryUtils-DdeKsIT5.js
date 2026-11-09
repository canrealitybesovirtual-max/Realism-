import { f as ot, e as St } from "./constants-CBDAm28G.js";
import { MathUtils as D, Spherical as yt, Vector3 as u, Matrix4 as R, Sphere as wt, Ray as gt, Euler as zt, Box3 as xt, Plane as Ft, TextureUtils as _t } from "three";
import { estimateBytesUsed as Ct } from "three/addons/utils/BufferGeometryUtils.js";
const b = /* @__PURE__ */ new yt(), st = /* @__PURE__ */ new u(), Rt = {};
function ft(c) {
  const { x: t, y: i, z: e } = c;
  c.x = e, c.y = t, c.z = i;
}
function bt(c) {
  const { x: t, y: i, z: e } = c;
  c.z = t, c.x = i, c.y = e;
}
function Mt(c) {
  return -(c - Math.PI / 2);
}
function K(c) {
  return -c + Math.PI / 2;
}
function At(c, t, i = {}) {
  return b.theta = t, b.phi = K(c), st.setFromSpherical(b), b.setFromVector3(st), i.lat = Mt(b.phi), i.lon = b.theta, i;
}
function nt(c, t = "E", i = "W") {
  const e = c < 0 ? i : t;
  c = Math.abs(c);
  const o = ~~c, s = (c - o) * 60, n = ~~s, l = ~~((s - n) * 60);
  return `${o}° ${n}' ${l}" ${e}`;
}
function vt(c, t, i = !1) {
  const e = At(c, t, Rt);
  let o, s;
  return i ? (o = `${(D.RAD2DEG * e.lat).toFixed(4)}°`, s = `${(D.RAD2DEG * e.lon).toFixed(4)}°`) : (o = nt(D.RAD2DEG * e.lat, "N", "S"), s = nt(D.RAD2DEG * e.lon, "E", "W")), `${o} ${s}`;
}
const jt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  latitudeToSphericalPhi: K,
  sphericalPhiToLatitude: Mt,
  swapToGeoFrame: ft,
  swapToThreeFrame: bt,
  toLatLonString: vt
}, Symbol.toStringTag, { value: "Module" })), rt = /* @__PURE__ */ new yt(), z = /* @__PURE__ */ new u(), d = /* @__PURE__ */ new u(), V = /* @__PURE__ */ new u(), P = /* @__PURE__ */ new R(), S = /* @__PURE__ */ new R(), at = /* @__PURE__ */ new R(), W = /* @__PURE__ */ new wt(), x = /* @__PURE__ */ new zt(), lt = /* @__PURE__ */ new u(), ct = /* @__PURE__ */ new u(), ht = /* @__PURE__ */ new u(), _ = /* @__PURE__ */ new u(), O = /* @__PURE__ */ new gt(), Nt = 1e-12, Bt = 0.1, q = 0, pt = 1, U = 2;
class Pt {
  constructor(t = 1, i = 1, e = 1) {
    this.name = "", this.radius = new u(t, i, e);
  }
  /**
   * Returns the point where the given ray intersects the ellipsoid surface, or null if no
   * intersection exists. Writes the result into `target`.
   * @param {Ray} ray
   * @param {Vector3} target
   * @returns {Vector3|null}
   */
  intersectRay(t, i) {
    return P.makeScale(...this.radius).invert(), W.center.set(0, 0, 0), W.radius = 1, O.copy(t).applyMatrix4(P), O.intersectSphere(W, i) ? (P.makeScale(...this.radius), i.applyMatrix4(P), i) : null;
  }
  /**
   * Returns a Matrix4 representing the East-North-Up (ENU) frame at the given geographic
   * position: X points east, Y points north, Z points up. Writes the result into `target`.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {number} height Height above the ellipsoid surface in meters.
   * @param {Matrix4} target
   * @returns {Matrix4}
   */
  getEastNorthUpFrame(t, i, e, o) {
    return e.isMatrix4 && (o = e, e = 0, console.warn('Ellipsoid: The signature for "getEastNorthUpFrame" has changed.')), this.getEastNorthUpAxes(t, i, lt, ct, ht), this.getCartographicToPosition(t, i, e, _), o.makeBasis(lt, ct, ht).setPosition(_);
  }
  /**
   * Returns a Matrix4 representing the ENU frame at the given position, rotated by the given
   * azimuth, elevation, and roll. Equivalent to `getObjectFrame` with `ENU_FRAME`.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {number} height Height above the ellipsoid surface in meters.
   * @param {number} az Azimuth in radians, measured from true north towards east.
   * @param {number} el Elevation in radians, measured from the horizon upward.
   * @param {number} roll Roll in radians around the north axis.
   * @param {Matrix4} target
   * @returns {Matrix4}
   */
  getOrientedEastNorthUpFrame(t, i, e, o, s, n, r) {
    return this.getObjectFrame(t, i, e, o, s, n, r, q);
  }
  /**
   * Returns a Matrix4 representing a frame at the given geographic position, rotated by the
   * given azimuth, elevation, and roll, and adjusted to match the three.js `frame` convention.
   * `OBJECT_FRAME` orients with "+Y" up and "+Z" forward; `CAMERA_FRAME` orients with "+Y" up
   * and "-Z" forward; `ENU_FRAME` returns the raw ENU-relative rotation.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {number} height Height above the ellipsoid surface in meters.
   * @param {number} az Azimuth in radians, measured from true north towards east.
   * @param {number} el Elevation in radians, measured from the horizon upward.
   * @param {number} roll Roll in radians around the north axis.
   * @param {Matrix4} target
   * @param {Frames} [frame=OBJECT_FRAME]
   * @returns {Matrix4}
   */
  getObjectFrame(t, i, e, o, s, n, r, l = U) {
    return this.getEastNorthUpFrame(t, i, e, P), x.set(s, n, -o, "ZXY"), r.makeRotationFromEuler(x).premultiply(P), l === pt ? (x.set(Math.PI / 2, 0, 0, "XYZ"), S.makeRotationFromEuler(x), r.multiply(S)) : l === U && (x.set(-Math.PI / 2, 0, Math.PI, "XYZ"), S.makeRotationFromEuler(x), r.multiply(S)), r;
  }
  /**
   * Extracts geographic position and orientation (lat, lon, height, azimuth, elevation, roll)
   * from the given object/camera frame matrix. The inverse of `getObjectFrame`. Writes the
   * result into `target` and returns it.
   * @param {Matrix4} matrix
   * @param {Object} target
   * @param {Frames} [frame=OBJECT_FRAME]
   * @returns {{ lat: number, lon: number, height: number, azimuth: number, elevation: number, roll: number }}
   */
  getCartographicFromObjectFrame(t, i, e = U) {
    return e === pt ? (x.set(-Math.PI / 2, 0, 0, "XYZ"), S.makeRotationFromEuler(x).premultiply(t)) : e === U ? (x.set(-Math.PI / 2, 0, Math.PI, "XYZ"), S.makeRotationFromEuler(x).premultiply(t)) : S.copy(t), _.setFromMatrixPosition(S), this.getPositionToCartographic(_, i), this.getEastNorthUpFrame(i.lat, i.lon, 0, P).invert(), S.premultiply(P), x.setFromRotationMatrix(S, "ZXY"), i.azimuth = -x.z, i.elevation = x.x, i.roll = x.y, i;
  }
  /**
   * Fills in the east, north, and up unit vectors for the ENU frame at the given latitude and
   * longitude. Optionally writes the surface position into `point`.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {Vector3} vecEast
   * @param {Vector3} vecNorth
   * @param {Vector3} vecUp
   * @param {Vector3} [point]
   */
  getEastNorthUpAxes(t, i, e, o, s, n = _) {
    this.getCartographicToPosition(t, i, 0, n), this.getCartographicToNormal(t, i, s), e.set(-n.y, n.x, 0).normalize(), o.crossVectors(s, e).normalize();
  }
  /**
   * @deprecated Use `getCartographicFromObjectFrame` instead.
   * @param {number} lat
   * @param {number} lon
   * @param {Matrix4} rotationMatrix
   * @param {Object} target
   * @param {Frames} frame
   * @returns {{ azimuth: number, elevation: number, roll: number }}
   */
  getAzElRollFromRotationMatrix(t, i, e, o, s = q) {
    return console.warn('Ellipsoid: "getAzElRollFromRotationMatrix" is deprecated. Use "getCartographicFromObjectFrame", instead.'), this.getCartographicToPosition(t, i, 0, _), at.copy(e).setPosition(_), this.getCartographicFromObjectFrame(at, o, s), delete o.height, delete o.lat, delete o.lon, o;
  }
  /**
   * @deprecated Use `getObjectFrame` instead.
   * @param {number} lat
   * @param {number} lon
   * @param {number} az
   * @param {number} el
   * @param {number} roll
   * @param {Matrix4} target
   * @param {Frames} frame
   * @returns {Matrix4}
   */
  getRotationMatrixFromAzElRoll(t, i, e, o, s, n, r = q) {
    return console.warn('Ellipsoid: "getRotationMatrixFromAzElRoll" function has been deprecated. Use "getObjectFrame", instead.'), this.getObjectFrame(t, i, 0, e, o, s, n, r), n.setPosition(0, 0, 0), n;
  }
  /**
   * @deprecated Use `getObjectFrame` instead.
   * @param {number} lat
   * @param {number} lon
   * @param {number} az
   * @param {number} el
   * @param {number} roll
   * @param {number} height
   * @param {Matrix4} target
   * @param {Frames} frame
   * @returns {Matrix4}
   */
  getFrame(t, i, e, o, s, n, r, l = q) {
    return console.warn('Ellipsoid: "getFrame" function has been deprecated. Use "getObjectFrame", instead.'), this.getObjectFrame(t, i, n, e, o, s, r, l);
  }
  /**
   * Converts geographic coordinates to a 3D Cartesian position on the ellipsoid surface
   * (plus the given height offset). Writes the result into `target` and returns it.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {number} height Height above the ellipsoid surface in meters.
   * @param {Vector3} target
   * @returns {Vector3}
   */
  getCartographicToPosition(t, i, e, o) {
    this.getCartographicToNormal(t, i, z);
    const s = this.radius;
    d.copy(z), d.x *= s.x ** 2, d.y *= s.y ** 2, d.z *= s.z ** 2;
    const n = Math.sqrt(z.dot(d));
    return d.divideScalar(n), o.copy(d).addScaledVector(z, e);
  }
  /**
   * Converts a 3D Cartesian position to geographic coordinates (lat, lon, height). Writes the
   * result into `target` and returns it.
   * @param {Vector3} pos
   * @param {Object} target
   * @returns {{ lat: number, lon: number, height: number }}
   */
  getPositionToCartographic(t, i) {
    this.getPositionToSurfacePoint(t, d), this.getPositionToNormal(d, z);
    const e = V.subVectors(t, d);
    return i.lon = Math.atan2(z.y, z.x), i.lat = Math.asin(z.z), i.height = Math.sign(e.dot(t)) * e.length(), i;
  }
  /**
   * Returns the surface normal of the ellipsoid at the given latitude and longitude. Writes the
   * result into `target` and returns it.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {Vector3} target
   * @returns {Vector3}
   */
  getCartographicToNormal(t, i, e) {
    return rt.set(1, K(t), i), e.setFromSpherical(rt).normalize(), ft(e), e;
  }
  /**
   * Returns the surface normal of the ellipsoid at the given 3D Cartesian position. Writes the
   * result into `target` and returns it.
   * @param {Vector3} pos
   * @param {Vector3} target
   * @returns {Vector3}
   */
  getPositionToNormal(t, i) {
    const e = this.radius;
    return i.copy(t), i.x /= e.x ** 2, i.y /= e.y ** 2, i.z /= e.z ** 2, i.normalize(), i;
  }
  /**
   * Projects the given 3D position onto the ellipsoid surface along the geodetic normal.
   * Returns null if the position is at or near the center. Writes the result into `target`.
   * @param {Vector3} pos
   * @param {Vector3} target
   * @returns {Vector3|null}
   */
  getPositionToSurfacePoint(t, i) {
    const e = this.radius, o = 1 / e.x ** 2, s = 1 / e.y ** 2, n = 1 / e.z ** 2, r = t.x * t.x * o, l = t.y * t.y * s, h = t.z * t.z * n, p = r + l + h, w = Math.sqrt(1 / p), M = d.copy(t).multiplyScalar(w);
    if (p < Bt)
      return isFinite(w) ? i.copy(M) : null;
    const E = V.set(
      M.x * o * 2,
      M.y * s * 2,
      M.z * n * 2
    );
    let m = (1 - w) * t.length() / (0.5 * E.length()), g = 0, $, Q, A, v, N, k, X, Y, tt, it, et;
    do {
      m -= g, A = 1 / (1 + m * o), v = 1 / (1 + m * s), N = 1 / (1 + m * n), k = A * A, X = v * v, Y = N * N, tt = k * A, it = X * v, et = Y * N, $ = r * k + l * X + h * Y - 1, Q = r * tt * o + l * it * s + h * et * n;
      const Et = -2 * Q;
      g = $ / Et;
    } while (Math.abs($) > Nt);
    return i.set(
      t.x * A,
      t.y * v,
      t.z * N
    );
  }
  /**
   * Returns the geometric distance to the horizon from the given latitude and elevation above
   * the ellipsoid surface.
   * @param {number} latitude Latitude in degrees.
   * @param {number} elevation Height above the ellipsoid surface in meters.
   * @returns {number}
   */
  calculateHorizonDistance(t, i) {
    const e = this.calculateEffectiveRadius(t);
    return Math.sqrt(2 * e * i + i ** 2);
  }
  /**
   * Returns the prime vertical radius of curvature (distance from the center of the ellipsoid
   * to the surface along the normal) at the given latitude.
   * @param {number} latitude Latitude in degrees.
   * @returns {number}
   */
  calculateEffectiveRadius(t) {
    const i = this.radius.x, o = 1 - this.radius.z ** 2 / i ** 2, s = t * D.DEG2RAD, n = Math.sin(s) ** 2;
    return i / Math.sqrt(1 - o * n);
  }
  /**
   * Returns the height of the given 3D position above (or below) the ellipsoid surface.
   * @param {Vector3} pos
   * @returns {number}
   */
  getPositionElevation(t) {
    this.getPositionToSurfacePoint(t, d);
    const i = V.subVectors(t, d);
    return Math.sign(i.dot(t)) * i.length();
  }
  /**
   * Returns an estimate of the closest point on the ellipsoid surface to the given ray.
   * Returns the exact surface intersection point if the ray intersects the ellipsoid.
   * @param {Ray} ray
   * @param {Vector3} target
   * @returns {Vector3}
   */
  closestPointToRayEstimate(t, i) {
    return this.intersectRay(t, i) ? i : (P.makeScale(...this.radius).invert(), O.copy(t).applyMatrix4(P), d.set(0, 0, 0), O.closestPointToPoint(d, i).normalize(), P.makeScale(...this.radius), i.applyMatrix4(P));
  }
  /**
   * Copies the radius from the given ellipsoid into this one.
   * @param {Ellipsoid} source
   * @returns {this}
   */
  copy(t) {
    return this.radius.copy(t.radius), this;
  }
  /**
   * Returns a new Ellipsoid with the same radius as this one.
   * @returns {Ellipsoid}
   */
  clone() {
    return new this.constructor().copy(this);
  }
}
const Dt = new Pt(ot, ot, St);
Dt.name = "WGS84 Earth";
const L = /* @__PURE__ */ new u(), j = /* @__PURE__ */ new u(), f = /* @__PURE__ */ new u(), G = /* @__PURE__ */ new gt();
class Gt {
  constructor(t = new xt(), i = new R()) {
    this.box = t.clone(), this.transform = i.clone(), this.inverseTransform = new R(), this.points = new Array(8).fill().map(() => new u()), this.planes = new Array(6).fill().map(() => new Ft());
  }
  copy(t) {
    return this.box.copy(t.box), this.transform.copy(t.transform), this.update(), this;
  }
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Clamps the given point within the bounds of this OBB
   * @param {Vector3} point
   * @param {Vector3} result
   * @returns {Vector3}
   */
  clampPoint(t, i) {
    return i.copy(t).applyMatrix4(this.inverseTransform).clamp(this.box.min, this.box.max).applyMatrix4(this.transform);
  }
  /**
   * Returns the distance from any edge of this OBB to the specified point.
   * If the point lies inside of this box, the distance will be 0.
   * @param {Vector3} point
   * @returns {number}
   */
  distanceToPoint(t) {
    return this.clampPoint(t, f).distanceTo(t);
  }
  containsPoint(t) {
    return f.copy(t).applyMatrix4(this.inverseTransform), this.box.containsPoint(f);
  }
  // returns boolean indicating whether the ray has intersected the obb
  intersectsRay(t) {
    return G.copy(t).applyMatrix4(this.inverseTransform), G.intersectsBox(this.box);
  }
  // Sets "target" equal to the intersection point.
  // Returns "null" if no intersection found.
  intersectRay(t, i) {
    return G.copy(t).applyMatrix4(this.inverseTransform), G.intersectBox(this.box, i) ? (i.applyMatrix4(this.transform), i) : null;
  }
  update() {
    const { points: t, inverseTransform: i, transform: e, box: o } = this;
    i.copy(e).invert();
    const { min: s, max: n } = o;
    let r = 0;
    for (let l = -1; l <= 1; l += 2)
      for (let h = -1; h <= 1; h += 2)
        for (let p = -1; p <= 1; p += 2)
          t[r].set(
            l < 0 ? s.x : n.x,
            h < 0 ? s.y : n.y,
            p < 0 ? s.z : n.z
          ).applyMatrix4(e), r++;
    this.updatePlanes();
  }
  updatePlanes() {
    L.copy(this.box.min).applyMatrix4(this.transform), j.copy(this.box.max).applyMatrix4(this.transform), f.set(0, 0, 1).transformDirection(this.transform), this.planes[0].setFromNormalAndCoplanarPoint(f, L), this.planes[1].setFromNormalAndCoplanarPoint(f, j).negate(), f.set(0, 1, 0).transformDirection(this.transform), this.planes[2].setFromNormalAndCoplanarPoint(f, L), this.planes[3].setFromNormalAndCoplanarPoint(f, j).negate(), f.set(1, 0, 0).transformDirection(this.transform), this.planes[4].setFromNormalAndCoplanarPoint(f, L), this.planes[5].setFromNormalAndCoplanarPoint(f, j).negate();
  }
  intersectsSphere(t) {
    return this.clampPoint(t.center, f), f.distanceToSquared(t.center) <= t.radius * t.radius;
  }
  intersectsFrustum(t) {
    return this._intersectsPlaneShape(t.planes, t.points);
  }
  intersectsOBB(t) {
    return this._intersectsPlaneShape(t.planes, t.points);
  }
  // takes a series of 6 planes that define and enclosed shape and the 8 points that lie at the corners
  // of that shape to determine whether the OBB is intersected with.
  _intersectsPlaneShape(t, i) {
    const e = this.points, o = this.planes;
    for (let s = 0; s < 6; s++) {
      const n = t[s];
      let r = -1 / 0;
      for (let l = 0; l < 8; l++) {
        const h = e[l], p = n.distanceToPoint(h);
        r = r < p ? p : r;
      }
      if (r < 0)
        return !1;
    }
    for (let s = 0; s < 6; s++) {
      const n = o[s];
      let r = -1 / 0;
      for (let l = 0; l < 8; l++) {
        const h = i[l], p = n.distanceToPoint(h);
        r = r < p ? p : r;
      }
      if (r < 0)
        return !1;
    }
    return !0;
  }
}
const Z = 1e-13, I = Math.PI, H = I / 2, B = /* @__PURE__ */ new u(), C = /* @__PURE__ */ new u(), T = /* @__PURE__ */ new u(), a = /* @__PURE__ */ new u(), y = /* @__PURE__ */ new R(), It = /* @__PURE__ */ new xt(), ut = /* @__PURE__ */ new R();
function F(c, t) {
  t.radius = Math.max(t.radius, c.distanceToSquared(t.center));
}
function mt(c) {
  return c.x !== c.y;
}
class $t extends Pt {
  constructor(t = 1, i = 1, e = 1, o = -H, s = H, n = 0, r = 2 * I, l = 0, h = 0) {
    super(t, i, e), this.latStart = o, this.latEnd = s, this.lonStart = n, this.lonEnd = r, this.heightStart = l, this.heightEnd = h;
  }
  /**
   * Computes an oriented bounding box for this region. Writes the box extents into `box` and
   * the orientation frame into `matrix`.
   * @param {Box3} box
   * @param {Matrix4} matrix
   */
  getBoundingBox(t, i) {
    mt(this.radius) && console.warn("EllipsoidRegion: Triaxial ellipsoids are not supported.");
    const {
      latStart: e,
      latEnd: o,
      lonStart: s,
      lonEnd: n,
      heightStart: r,
      heightEnd: l
    } = this, h = (e + o) * 0.5, p = (s + n) * 0.5, w = e > 0, M = o < 0;
    let E;
    w ? E = e : M ? E = o : E = 0;
    const { min: m, max: g } = t;
    m.setScalar(1 / 0), g.setScalar(-1 / 0), n - s <= I ? (this.getCartographicToNormal(h, p, T), C.set(0, 0, 1), B.crossVectors(C, T).normalize(), C.crossVectors(T, B).normalize(), i.makeBasis(B, C, T), y.copy(i).invert(), this.getCartographicToPosition(E, s, l, a).applyMatrix4(y), g.x = Math.abs(a.x), m.x = -g.x, this.getCartographicToPosition(o, s, l, a).applyMatrix4(y), g.y = a.y, this.getCartographicToPosition(o, p, l, a).applyMatrix4(y), g.y = Math.max(a.y, g.y), this.getCartographicToPosition(e, s, l, a).applyMatrix4(y), m.y = a.y, this.getCartographicToPosition(e, p, l, a).applyMatrix4(y), m.y = Math.min(a.y, m.y), this.getCartographicToPosition(h, p, l, a).applyMatrix4(y), g.z = a.z, this.getCartographicToPosition(e, s, r, a).applyMatrix4(y), m.z = a.z, this.getCartographicToPosition(o, s, r, a).applyMatrix4(y), m.z = Math.min(a.z, m.z)) : (this.getCartographicToPosition(E, p, l, T), T.z = 0, T.length() < 1e-10 ? T.set(1, 0, 0) : T.normalize(), C.set(0, 0, 1), B.crossVectors(T, C).normalize(), i.makeBasis(B, C, T), y.copy(i).invert(), this.getCartographicToPosition(E, p + H, l, a).applyMatrix4(y), g.x = Math.abs(a.x), m.x = -g.x, this.getCartographicToPosition(o, 0, M ? r : l, a).applyMatrix4(y), g.y = a.y, this.getCartographicToPosition(e, 0, w ? r : l, a).applyMatrix4(y), m.y = a.y, this.getCartographicToPosition(E, p, l, a).applyMatrix4(y), g.z = a.z, this.getCartographicToPosition(E, n, l, a).applyMatrix4(y), m.z = a.z), t.getCenter(a), t.min.sub(a).multiplyScalar(1 + Z), t.max.sub(a).multiplyScalar(1 + Z), a.applyMatrix4(i), i.setPosition(a);
  }
  /**
   * Computes a bounding sphere for this region. Writes the result into `sphere`.
   * @param {Sphere} sphere
   */
  getBoundingSphere(t) {
    mt(this.radius) && console.warn("EllipsoidRegion: Triaxial ellipsoids are not supported."), this.getBoundingBox(It, ut), t.center.setFromMatrixPosition(ut), t.radius = 0;
    const {
      latStart: i,
      latEnd: e,
      lonStart: o,
      lonEnd: s,
      heightStart: n,
      heightEnd: r
    } = this, l = (i + e) * 0.5, h = (o + s) * 0.5, p = i > 0, w = e < 0;
    let M;
    p ? M = i : w ? M = e : M = 0, this.getCartographicToPosition(M, o, r, a), F(a, t), this.getCartographicToPosition(e, o, r, a), F(a, t), this.getCartographicToPosition(e, h, r, a), F(a, t), this.getCartographicToPosition(i, o, r, a), F(a, t), this.getCartographicToPosition(i, h, r, a), F(a, t), this.getCartographicToPosition(l, h, r, a), F(a, t), this.getCartographicToPosition(i, o, n, a), F(a, t), s - o > I && (this.getCartographicToPosition(M, h + I, r, a), F(a, t)), t.radius = Math.sqrt(t.radius) * (1 + Z);
  }
}
const J = 0;
function dt(c, t, i, e) {
  try {
    return _t.getByteLength(c, t, i, e);
  } catch {
    return J;
  }
}
function Tt(c) {
  var n, r;
  if (!c)
    return 0;
  if (c.isExternalTexture)
    return ((n = c.userData) == null ? void 0 : n.byteLength) ?? J;
  const { format: t, type: i, image: e, mipmaps: o } = c;
  if (c.isCompressedTexture && Array.isArray(o) && o.length > 0) {
    let l = 0;
    for (const h of o)
      (r = h == null ? void 0 : h.data) != null && r.byteLength ? l += h.data.byteLength : l += dt(h.width, h.height, t, i);
    return l;
  }
  if (!e)
    return J;
  let s = dt(e.width, e.height, t, i);
  return s *= c.generateMipmaps ? 4 / 3 : 1, s;
}
function Ot(c) {
  const t = /* @__PURE__ */ new Set();
  let i = 0;
  return c.traverse((e) => {
    if (e.geometry && !t.has(e.geometry) && (i += Ct(e.geometry), t.add(e.geometry)), e.material) {
      const o = e.material;
      for (const s in o) {
        const n = o[s];
        n && n.isTexture && !t.has(n) && (i += Tt(n), t.add(n));
      }
    }
  }), i;
}
const kt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  estimateBytesUsed: Ot,
  getTextureByteLength: Tt
}, Symbol.toStringTag, { value: "Module" }));
export {
  pt as C,
  q as E,
  jt as G,
  kt as M,
  Gt as O,
  Dt as W,
  Pt as a,
  $t as b,
  U as c,
  Ot as e,
  Tt as g
};
