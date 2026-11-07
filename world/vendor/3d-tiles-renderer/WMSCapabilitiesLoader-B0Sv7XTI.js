import { Q as oi, b as ai, C as li, G as ci } from "./QuantizedMeshLoaderBase-sP2thXTE.js";
import { PlaneGeometry as mt, Mesh as ue, MeshBasicMaterial as ce, Vector2 as Q, MathUtils as _, Vector3 as A, Sphere as he, Texture as ui, SRGBColorSpace as St, TextureUtils as hi, DefaultLoadingManager as di, BufferGeometry as He, MeshStandardMaterial as _n, BufferAttribute as K, DataTexture as os, RGFormat as bn, UnsignedByteType as Sn, LinearMipMapLinearFilter as fi, LinearFilter as Mn, Triangle as as, Vector4 as je, Matrix4 as se, Matrix3 as pi, Matrix2 as mi, WebGLRenderer as gi, WebGLRenderTarget as xs, ShaderMaterial as yi, OneFactor as xi, ZeroFactor as Ti, CustomBlending as _i, Box2 as bi, FileLoader as Si, Quaternion as Cn, BatchedMesh as Mi, Source as Ci, Box3 as Mt, REVISION as vi, WebGLArrayRenderTarget as Ts, Raycaster as Li, DoubleSide as dt, CanvasTexture as Ct, Color as vn, Ray as Ei, LineSegments as Ln, LineBasicMaterial as Ai, EdgesGeometry as Ii, BoxGeometry as En, Group as $e, Box3Helper as wi, SphereGeometry as Pi, PointsMaterial as Ri } from "three";
import { a as An, c as Bi, W as Di, g as Oi, O as Ui, b as In } from "./MemoryUtils-DdeKsIT5.js";
import { GLTFLoader as Vi } from "three/addons/loaders/GLTFLoader.js";
import { FullScreenQuad as wn } from "three/addons/postprocessing/Pass.js";
import { b as Ni, c as ls, d as Fi, f as Pn } from "./constants-CBDAm28G.js";
import { c as ki, L as Rn } from "./LoaderBase-ATuDWTDB.js";
const _e = /* @__PURE__ */ new Q(), ee = Symbol("TILE_X"), te = Symbol("TILE_Y"), J = Symbol("TILE_LEVEL");
class Bn {
  get tiling() {
    return this.imageSource.tiling;
  }
  constructor(e = {}) {
    console.warn(`${this.constructor.name} has been deprecated. Use "GeneratedSurfacePlugin" & "ImageOverlayPlugin", instead.`);
    const {
      pixelSize: t = null,
      center: s = !1,
      useRecommendedSettings: n = !0,
      imageSource: i = null
    } = e;
    this.priority = -10, this.tiles = null, this.imageSource = i, this.pixelSize = t, this.center = s, this.useRecommendedSettings = n, t !== null && console.warn('ImageFormatPlugin: "pixelSize" has been deprecated in favor of scaling the tiles root.');
  }
  // Plugin functions
  init(e) {
    this.useRecommendedSettings && (e.errorTarget = 1), this.tiles = e, this.imageSource.fetchOptions = e.fetchOptions, this.imageSource.fetchData = (t, s) => (e.invokeAllPlugins((n) => t = n.preprocessURL ? n.preprocessURL(t, null) : t), e.invokeOnePlugin((n) => n !== this && n.fetchData && n.fetchData(t, s)));
  }
  async loadRootTileset() {
    const { tiles: e, imageSource: t } = this;
    return t.url = t.url || e.rootURL, e.invokeAllPlugins((s) => t.url = s.preprocessURL ? s.preprocessURL(t.url, null) : t.url), await t.init(), e.rootURL = t.url, this.getTileset(t.url);
  }
  async parseToMesh(e, t, s, n, i) {
    if (i.aborted)
      return null;
    const { imageSource: r } = this, o = t[ee], a = t[te], c = t[J], u = await r.processBufferToTexture(e);
    if (i.aborted)
      return u.dispose(), u.image.close(), null;
    r.setData(o, a, c, u);
    let h = 1, d = 1, m = 0, p = 0, f = 0;
    const g = t.boundingVolume.box;
    g && ([m, p, f] = g, h = g[3], d = g[7]);
    const y = new mt(2 * h, 2 * d), x = new ue(y, new ce({ map: u, transparent: !0 }));
    x.position.set(m, p, f);
    const T = r.tiling, b = T.getTileContentUVBounds(o, a, c), { uv: S } = y.attributes;
    for (let M = 0; M < S.count; M++)
      _e.fromBufferAttribute(S, M), _e.x = _.mapLinear(_e.x, 0, 1, b[0], b[2]), _e.y = _.mapLinear(_e.y, 0, 1, b[1], b[3]), S.setXY(M, _e.x, _e.y);
    return c < T.maxLevel && t.children.length === 0 && this.expandChildren(t), x;
  }
  disposeTile(e) {
    const t = e[ee], s = e[te], n = e[J], { imageSource: i } = this;
    i.has(t, s, n) && i.release(t, s, n), e.children.forEach((r) => {
      this.tiles.processNodeQueue.remove(r);
    }), e.children.length = 0;
  }
  // Local functions
  getTileset(e) {
    const { tiling: t, tiles: s } = this, n = t.minLevel, { tileCountX: i, tileCountY: r } = t.getLevel(n), o = [];
    for (let c = 0; c < i; c++)
      for (let u = 0; u < r; u++) {
        const h = this.createChild(c, u, n);
        h !== null && o.push(h);
      }
    const a = {
      asset: {
        version: "1.1"
      },
      geometricError: 1 / 0,
      root: {
        refine: "REPLACE",
        geometricError: 1 / 0,
        boundingVolume: this.createBoundingVolume(0, 0, -1),
        children: o,
        [J]: -1,
        [ee]: 0,
        [te]: 0
      }
    };
    return s.preprocessTileset(a, e), a;
  }
  getUrl(e, t, s) {
    return this.imageSource.getUrl(e, t, s);
  }
  createBoundingVolume(e, t, s) {
    const { center: n, pixelSize: i, tiling: r } = this, { pixelWidth: o, pixelHeight: a } = r.getLevel(r.maxLevel), [c, u, h, d] = s === -1 ? r.getContentBounds(!0) : r.getTileBounds(e, t, s, !0);
    let m = (h - c) / 2, p = (d - u) / 2, f = c + m, g = u + p;
    return n && (f -= 0.5, g -= 0.5), i ? (f *= o * i, m *= o * i, g *= a * i, p *= a * i) : (f *= r.aspectRatio, m *= r.aspectRatio), {
      box: [
        // center
        f,
        g,
        0,
        // x, y, z half vectors
        m,
        0,
        0,
        0,
        p,
        0,
        0,
        0,
        0
      ]
    };
  }
  createChild(e, t, s) {
    const { pixelSize: n, tiling: i } = this;
    if (!i.getTileExists(e, t, s))
      return null;
    const { pixelWidth: r, pixelHeight: o } = i.getLevel(s);
    let a = Math.max(i.aspectRatio / r, 1 / o);
    if (n) {
      const c = i.getLevel(i.maxLevel);
      a *= n * Math.max(c.pixelWidth, c.pixelHeight);
    }
    return {
      refine: "REPLACE",
      geometricError: a,
      boundingVolume: this.createBoundingVolume(e, t, s),
      content: {
        uri: this.getUrl(e, t, s)
      },
      children: [],
      // save the tile params so we can expand later
      [ee]: e,
      [te]: t,
      [J]: s
    };
  }
  expandChildren(e) {
    const t = e[J], s = e[ee], n = e[te], { tileSplitX: i, tileSplitY: r } = this.tiling.getLevel(t);
    for (let o = 0; o < i; o++)
      for (let a = 0; a < r; a++) {
        const c = this.createChild(i * s + o, r * n + a, t + 1);
        c && e.children.push(c);
      }
  }
}
const Pt = /* @__PURE__ */ new A(), Qe = /* @__PURE__ */ new A();
function Dn(l, e, t) {
  const n = t + 1e-5;
  let i = e + 1e-5;
  Math.abs(i) > Math.PI / 2 && (i = i - 1e-5), l.getCartographicToPosition(e, t, 0, Pt), l.getCartographicToPosition(i, t, 0, Qe);
  const r = Pt.distanceTo(Qe) / 1e-5;
  return l.getCartographicToPosition(e, n, 0, Qe), [Pt.distanceTo(Qe) / 1e-5, r];
}
const Gi = 30, zi = 15, Rt = /* @__PURE__ */ new A(), _s = /* @__PURE__ */ new A(), le = /* @__PURE__ */ new Q(), Bt = /* @__PURE__ */ new he();
class vt extends Bn {
  get projection() {
    return this.tiling.projection;
  }
  constructor(e = {}) {
    const {
      shape: t = "planar",
      endCaps: s = !0,
      ...n
    } = e;
    super(n), this.shape = t, this.endCaps = s;
  }
  // override the parse to mesh logic to support a region mesh
  async parseToMesh(e, t, ...s) {
    const n = await super.parseToMesh(e, t, ...s), { shape: i, projection: r, tiles: o, tiling: a } = this;
    if (i === "ellipsoid") {
      const c = o.ellipsoid, u = t[J], h = t[ee], d = t[te], [m, p, f, g] = t.boundingVolume.region, y = Math.ceil((g - p) * _.RAD2DEG * 0.25), x = Math.ceil((f - m) * _.RAD2DEG * 0.25), T = Math.max(zi, y), b = Math.max(Gi, x), S = new mt(1, 1, b, T), [M, C, I, V] = a.getTileBounds(h, d, u, !0, !0), U = a.getTileContentUVBounds(h, d, u), { position: B, normal: N, uv: z } = S.attributes, W = B.count;
      t.engineData.boundingVolume.getSphere(Bt);
      for (let H = 0; H < W; H++) {
        Rt.fromBufferAttribute(B, H), le.fromBufferAttribute(z, H);
        const L = r.convertNormalizedToLongitude(_.mapLinear(le.x, 0, 1, M, I));
        let v = r.convertNormalizedToLatitude(_.mapLinear(le.y, 0, 1, C, V));
        if (r.isMercator && this.endCaps && (V === 1 && le.y === 1 && (v = Math.PI / 2), C === 0 && le.y === 0 && (v = -Math.PI / 2)), r.isMercator && le.y !== 0 && le.y !== 1) {
          const E = r.convertNormalizedToLatitude(1), F = 1 / T, q = _.mapLinear(le.y - F, 0, 1, p, g), D = _.mapLinear(le.y + F, 0, 1, p, g);
          v > E && q < E && (v = E), v < -E && D > -E && (v = -E);
        }
        c.getCartographicToPosition(v, L, 0, Rt).sub(Bt.center), c.getCartographicToNormal(v, L, _s);
        const w = _.mapLinear(r.convertLongitudeToNormalized(L), M, I, U[0], U[2]), R = _.mapLinear(r.convertLatitudeToNormalized(v), C, V, U[1], U[3]);
        z.setXY(H, w, R), B.setXYZ(H, ...Rt), N.setXYZ(H, ..._s);
      }
      n.geometry = S, n.position.copy(Bt.center);
    }
    return n;
  }
  createBoundingVolume(e, t, s) {
    if (this.shape === "ellipsoid") {
      const { tiling: n, endCaps: i } = this, r = s === -1, o = r ? n.getContentBounds(!0) : n.getTileBounds(e, t, s, !0, !0), a = r ? n.getContentBounds() : n.getTileBounds(e, t, s, !1, !0);
      return i && (o[3] === 1 && (a[3] = Math.PI / 2), o[1] === 0 && (a[1] = -Math.PI / 2)), {
        region: [...a, -1, 1]
      };
    } else
      return super.createBoundingVolume(e, t, s);
  }
  createChild(...e) {
    const t = super.createChild(...e), { shape: s, projection: n, tiling: i } = this;
    if (t && s === "ellipsoid") {
      const r = t[J], o = t[ee], a = t[te];
      if (r === -1)
        return t.geometricError = 1e50, parent;
      const [c, u, h, d] = i.getTileBounds(o, a, r, !0), { tilePixelWidth: m, tilePixelHeight: p } = i.getLevel(r), f = (h - c) / m, g = (d - u) / p, [
        /* west */
        ,
        y,
        x,
        T
      ] = i.getTileBounds(o, a, r), b = y > 0 != T > 0 ? 0 : Math.min(Math.abs(y), Math.abs(T)), S = n.convertLatitudeToNormalized(b), M = n.getLongitudeDerivativeAtNormalized(c), C = n.getLatitudeDerivativeAtNormalized(S), [I, V] = Dn(this.tiles.ellipsoid, b, x), U = Math.max(f * M * I, g * C * V);
      t.geometricError = U;
    }
    return t;
  }
}
class ne {
  get isMercator() {
    return this.scheme === "EPSG:3857";
  }
  get isCartographic() {
    return this.scheme !== "none";
  }
  constructor(e = "EPSG:4326") {
    this.scheme = e, this.tileCountX = 1, this.tileCountY = 1, this.setScheme(e);
  }
  setScheme(e) {
    switch (this.scheme = e, e) {
      // equirect
      case "CRS:84":
      case "EPSG:4326":
        this.tileCountX = 2, this.tileCountY = 1;
        break;
      // mercator
      case "EPSG:3857":
        this.tileCountX = 1, this.tileCountY = 1;
        break;
      case "none":
        this.tileCountX = 1, this.tileCountY = 1;
        break;
      default:
        throw new Error(`ProjectionScheme: Unknown projection scheme "${e}"`);
    }
  }
  convertNormalizedToLatitude(e) {
    if (this.scheme === "none")
      return e;
    if (this.isMercator) {
      const t = _.mapLinear(e, 0, 1, -1, 1);
      return 2 * Math.atan(Math.exp(t * Math.PI)) - Math.PI / 2;
    } else
      return _.mapLinear(e, 0, 1, -Math.PI / 2, Math.PI / 2);
  }
  convertNormalizedToLongitude(e) {
    return this.scheme === "none" ? e : _.mapLinear(e, 0, 1, -Math.PI, Math.PI);
  }
  convertLatitudeToNormalized(e) {
    if (this.scheme === "none")
      return e;
    if (this.isMercator) {
      const t = Math.log(Math.tan(Math.PI / 4 + e / 2));
      return 1 / 2 + 1 * t / (2 * Math.PI);
    } else
      return _.mapLinear(e, -Math.PI / 2, Math.PI / 2, 0, 1);
  }
  convertLongitudeToNormalized(e) {
    return this.scheme === "none" ? e : (e + Math.PI) / (2 * Math.PI);
  }
  getLongitudeDerivativeAtNormalized(e) {
    return this.scheme === "none" ? 1 : 2 * Math.PI;
  }
  getLatitudeDerivativeAtNormalized(e) {
    if (this.scheme === "none")
      return 1;
    {
      let s = e - 1e-5;
      return s < 0 && (s = e + 1e-5), this.isMercator ? Math.abs(this.convertNormalizedToLatitude(e) - this.convertNormalizedToLatitude(s)) / 1e-5 : Math.PI;
    }
  }
  getBounds() {
    return this.scheme === "none" ? [0, 0, 1, 1] : [
      this.convertNormalizedToLongitude(0),
      this.convertNormalizedToLatitude(0),
      this.convertNormalizedToLongitude(1),
      this.convertNormalizedToLatitude(1)
    ];
  }
  toNormalizedPoint(e, t) {
    const s = [e, t];
    return s[0] = this.convertLongitudeToNormalized(s[0]), s[1] = this.convertLatitudeToNormalized(s[1]), s;
  }
  toNormalizedRange(e) {
    return [
      ...this.toNormalizedPoint(e[0], e[1]),
      ...this.toNormalizedPoint(e[2], e[3])
    ];
  }
  toCartographicPoint(e, t) {
    const s = [e, t];
    return s[0] = this.convertNormalizedToLongitude(s[0]), s[1] = this.convertNormalizedToLatitude(s[1]), s;
  }
  toCartographicRange(e) {
    return [
      ...this.toCartographicPoint(e[0], e[1]),
      ...this.toCartographicPoint(e[2], e[3])
    ];
  }
  clampToBounds(e, t = !1) {
    const s = [...e];
    let n;
    t ? n = [0, 0, 1, 1] : n = this.getBounds();
    const [i, r, o, a] = n;
    return s[0] = _.clamp(s[0], i, o), s[2] = _.clamp(s[2], i, o), s[1] = _.clamp(s[1], r, a), s[3] = _.clamp(s[3], r, a), s;
  }
}
function Re(...l) {
  return l.join("_");
}
class cs {
  constructor() {
    this.cache = {}, this.count = 0, this.cachedBytes = 0, this.active = 0;
  }
  // overridable
  fetchItem(e, t) {
  }
  // called with null if the fetch failed
  disposeItem(e, t) {
  }
  getMemoryUsage(e) {
    return 0;
  }
  // sets the data in the cache explicitly without need to load
  setData(...e) {
    const { cache: t } = this, s = e.pop(), n = Re(...e);
    if (n in t)
      throw new Error(`DataCache: "${n}" is already present.`);
    return this.cache[n] = {
      abortController: new AbortController(),
      result: s,
      count: 1,
      bytes: this.getMemoryUsage(s)
    }, this.count++, this.cachedBytes += this.cache[n].bytes, s;
  }
  // fetches the associated data if it doesn't exist and increments the lock counter
  lock(...e) {
    const { cache: t } = this, s = Re(...e);
    if (s in t)
      t[s].count++;
    else {
      const n = new AbortController(), i = {
        abortController: n,
        result: null,
        count: 1,
        bytes: 0,
        args: e
      };
      this.active++, i.result = this.fetchItem(e, n.signal), i.result instanceof Promise ? i.result.then((r) => (i.result = r, i.bytes = this.getMemoryUsage(r), this.cachedBytes += i.bytes, r)).finally(() => {
        this.active--;
      }).catch((r) => {
      }) : (this.active--, i.bytes = this.getMemoryUsage(i.result), this.cachedBytes += i.bytes), this.cache[s] = i, this.count++;
    }
    return t[s].result;
  }
  // decrements the lock counter for the item and deletes the item if it has reached zero
  release(...e) {
    const t = Re(...e);
    this.releaseViaFullKey(t);
  }
  // get the loaded item
  get(...e) {
    const { cache: t } = this, s = Re(...e);
    return s in t && t[s].count > 0 ? t[s].result : null;
  }
  has(...e) {
    const { cache: t } = this;
    return Re(...e) in t;
  }
  forEachItem(e) {
    const { cache: t } = this;
    for (const s in t) {
      const n = t[s];
      n.result instanceof Promise || e(n.result, n.args);
    }
  }
  // dispose all items
  dispose() {
    const { cache: e } = this;
    for (const t in e) {
      const { abortController: s } = e[t];
      s.abort(), this.releaseViaFullKey(t, !0);
    }
    this.cache = {};
  }
  // releases an item with an optional force flag
  releaseViaFullKey(e, t = !1) {
    const { cache: s } = this;
    if (e in s && s[e].count > 0) {
      const n = s[e];
      if (n.count--, n.count === 0 || t) {
        const i = () => {
          if (s[e] !== n)
            return;
          const { result: r, abortController: o } = n;
          o.abort(), r instanceof Promise ? r.then((a) => {
            this.disposeItem(a, n.args);
          }).catch(() => {
            this.disposeItem(null, n.args);
          }).finally(() => {
            this.count--, this.cachedBytes -= n.bytes;
          }) : (this.disposeItem(r, n.args), this.count--, this.cachedBytes -= n.bytes), delete s[e];
        };
        t ? i() : queueMicrotask(() => {
          n.count === 0 && i();
        });
      }
      return !0;
    }
    throw new Error("DataCache: Attempting to release key that does not exist");
  }
}
function bs(l, e) {
  const [t, s, n, i] = l, [r, o, a, c] = e;
  return !(t >= a || n <= r || s >= c || i <= o);
}
class Lt {
  get levelCount() {
    return this._levels.length;
  }
  get maxLevel() {
    return this.levelCount - 1;
  }
  get minLevel() {
    const e = this._levels;
    for (let t = 0; t < e.length; t++)
      if (e[t] !== null)
        return t;
    return -1;
  }
  // prioritize user-set bounds over projection bounds if present
  get contentBounds() {
    return this._contentBounds ?? this.projection.getBounds();
  }
  get aspectRatio() {
    const { pixelWidth: e, pixelHeight: t } = this.getLevel(this.maxLevel);
    return e / t;
  }
  constructor() {
    this.flipY = !1, this.pixelOverlap = 0, this._contentBounds = null, this.projection = new ne("none"), this._levels = [];
  }
  // build the zoom levels
  setLevel(e, t = {}) {
    const s = this._levels;
    for (; s.length < e; )
      s.push(null);
    const {
      tileSplitX: n = 2,
      tileSplitY: i = 2
    } = t, {
      tilePixelWidth: r = 256,
      tilePixelHeight: o = 256,
      tileCountX: a = n ** e,
      tileCountY: c = i ** e,
      tileBounds: u = null
    } = t, {
      pixelWidth: h = r * a,
      pixelHeight: d = o * c
    } = t;
    s[e] = {
      // The pixel resolution of each tile.
      tilePixelWidth: r,
      tilePixelHeight: o,
      // The total pixel resolution of the final image at this level. These numbers
      // may not be a round multiple of the tile width.
      pixelWidth: h,
      pixelHeight: d,
      // Or the total number of tiles that can be loaded at this level.
      tileCountX: a,
      tileCountY: c,
      // The number of tiles that the tiles at this layer split in to
      tileSplitX: n,
      tileSplitY: i,
      // The bounds covered by the extent of the tiles at this loaded. The actual content covered by the overall tileset
      // may be a subset of this range (eg there may be unused space).
      tileBounds: u
    };
  }
  generateLevels(e, t, s, n = {}) {
    const {
      minLevel: i = 0,
      tilePixelWidth: r = 256,
      tilePixelHeight: o = 256
    } = n, a = e - 1, {
      pixelWidth: c = r * t * 2 ** a,
      pixelHeight: u = o * s * 2 ** a
    } = n;
    for (let h = i; h < e; h++) {
      const d = e - h - 1, m = Math.ceil(c * 2 ** -d), p = Math.ceil(u * 2 ** -d), f = Math.ceil(m / r), g = Math.ceil(p / o);
      this.setLevel(h, {
        tilePixelWidth: r,
        tilePixelHeight: o,
        pixelWidth: m,
        pixelHeight: p,
        tileCountX: f,
        tileCountY: g
      });
    }
  }
  getLevel(e) {
    return this._levels[e];
  }
  // bounds representing the contentful region of the image
  setContentBounds(e, t, s, n) {
    this._contentBounds = [e, t, s, n];
  }
  setProjection(e) {
    this.projection = e;
  }
  // query functions
  getTileAtPoint(e, t, s, n = !1) {
    const { flipY: i } = this, { tileCountY: r, tileBounds: o, pixelHeight: a, pixelWidth: c, tilePixelHeight: u, tilePixelWidth: h } = this.getLevel(s), d = h / c, m = u / a;
    if (n || ([e, t] = this.toNormalizedPoint(e, t)), o) {
      const g = this.toNormalizedRange(o);
      e = _.mapLinear(e, g[0], g[2], 0, 1), t = _.mapLinear(t, g[1], g[3], 0, 1);
    }
    const p = Math.floor(e / d);
    let f = Math.floor(t / m);
    return i && (f = r - 1 - f), [p, f];
  }
  getTilesInRange(e, t, s, n, i, r = !1) {
    const o = [e, t, s, n], a = this.getContentBounds(r);
    let c = this.getLevel(i).tileBounds;
    if (!bs(o, a))
      return [0, 0, -1, -1];
    if (c && (r && (c = this.toNormalizedRange(c)), !bs(o, a)))
      return [0, 0, -1, -1];
    const [u, h, d, m] = this.clampToContentBounds(o, r), p = this.getTileAtPoint(u, h, i, r), f = this.getTileAtPoint(d, m, i, r);
    this.flipY && ([p[1], f[1]] = [f[1], p[1]]);
    const { tileCountX: g, tileCountY: y } = this.getLevel(i), [x, T] = p, [b, S] = f;
    return b < 0 || S < 0 || x >= g || T >= y ? [0, 0, -1, -1] : [
      _.clamp(x, 0, g - 1),
      _.clamp(T, 0, y - 1),
      _.clamp(b, 0, g - 1),
      _.clamp(S, 0, y - 1)
    ];
  }
  getTileExists(e, t, s) {
    const [n, i, r, o] = this.contentBounds, [a, c, u, h] = this.getTileBounds(e, t, s);
    return !(a >= u || c >= h) && a <= r && c <= o && u >= n && h >= i;
  }
  getContentBounds(e = !1) {
    const { projection: t } = this, s = [...this.contentBounds];
    return e && (s[0] = t.convertLongitudeToNormalized(s[0]), s[1] = t.convertLatitudeToNormalized(s[1]), s[2] = t.convertLongitudeToNormalized(s[2]), s[3] = t.convertLatitudeToNormalized(s[3])), s;
  }
  // returns the UV range associated with the content in the given tile
  getTileContentUVBounds(e, t, s) {
    const [n, i, r, o] = this.getTileBounds(e, t, s, !0, !0), [a, c, u, h] = this.getTileBounds(e, t, s, !0, !1);
    return [
      _.mapLinear(n, a, u, 0, 1),
      _.mapLinear(i, c, h, 0, 1),
      _.mapLinear(r, a, u, 0, 1),
      _.mapLinear(o, c, h, 0, 1)
    ];
  }
  getTileBounds(e, t, s, n = !1, i = !0) {
    const { flipY: r, pixelOverlap: o, projection: a } = this, { tilePixelWidth: c, tilePixelHeight: u, pixelWidth: h, pixelHeight: d, tileBounds: m } = this.getLevel(s);
    let p = c * e - o, f = u * t - o, g = p + c + o * 2, y = f + u + o * 2;
    if (p = Math.max(p, 0), f = Math.max(f, 0), g = Math.min(g, h), y = Math.min(y, d), p = p / h, g = g / h, f = f / d, y = y / d, r) {
      const T = (y - f) / 2, S = 1 - (f + y) / 2;
      f = S - T, y = S + T;
    }
    let x = [p, f, g, y];
    if (m) {
      const T = this.toNormalizedRange(m);
      x[0] = _.mapLinear(x[0], 0, 1, T[0], T[2]), x[2] = _.mapLinear(x[2], 0, 1, T[0], T[2]), x[1] = _.mapLinear(x[1], 0, 1, T[1], T[3]), x[3] = _.mapLinear(x[3], 0, 1, T[1], T[3]);
    }
    return i && (x = this.clampToBounds(x, !0)), n || (x[0] = a.convertNormalizedToLongitude(x[0]), x[1] = a.convertNormalizedToLatitude(x[1]), x[2] = a.convertNormalizedToLongitude(x[2]), x[3] = a.convertNormalizedToLatitude(x[3])), x;
  }
  toNormalizedPoint(e, t) {
    return this.projection.toNormalizedPoint(e, t);
  }
  toNormalizedRange(e) {
    return this.projection.toNormalizedRange(e);
  }
  toCartographicPoint(e, t) {
    return this.projection.toCartographicPoint(e, t);
  }
  toCartographicRange(e) {
    return this.projection.toCartographicRange(e);
  }
  clampToContentBounds(e, t = !1) {
    const s = [...e], [n, i, r, o] = this.getContentBounds(t);
    return s[0] = _.clamp(s[0], n, r), s[1] = _.clamp(s[1], i, o), s[2] = _.clamp(s[2], n, r), s[3] = _.clamp(s[3], i, o), s;
  }
  clampToBounds(e, t = !1) {
    return this.projection.clampToBounds(e, t);
  }
}
class Pe extends cs {
  constructor(e = {}) {
    super();
    const {
      fetchOptions: t = {}
    } = e;
    this.tiling = new Lt(), this.fetchOptions = t, this.fetchData = (...s) => fetch(...s);
  }
  // async function for initializing the tiled image set
  init() {
  }
  // helper for processing the buffer into a texture
  async processBufferToTexture(e) {
    const t = new Blob([e]), s = await createImageBitmap(t, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
      imageOrientation: "flipY"
    }), n = new ui(s);
    return n.generateMipmaps = !1, n.colorSpace = St, n.needsUpdate = !0, n;
  }
  getMemoryUsage(e) {
    const { format: t, type: s, image: n, generateMipmaps: i } = e, { width: r, height: o } = n, a = hi.getByteLength(r, o, t, s);
    return i ? a * 4 / 3 : a;
  }
  // fetch the item with the given key fields
  fetchItem(e, t) {
    const s = {
      ...this.fetchOptions,
      signal: t
    }, n = this.getUrl(...e);
    return this.fetchData(n, s).then((i) => i.arrayBuffer()).then((i) => this.processBufferToTexture(i));
  }
  // dispose of the item that was fetched
  disposeItem(e) {
    e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
  }
  getUrl(...e) {
  }
}
class We extends Pe {
  constructor(e = {}) {
    const {
      levels: t = 20,
      tileDimension: s = 256,
      projection: n = "EPSG:3857",
      url: i = null,
      ...r
    } = e;
    super(r), this.tileDimension = s, this.levels = t, this.projection = n, this.url = i;
  }
  getUrl(e, t, s) {
    return this.url.replace(/{\s*z\s*}/gi, s).replace(/{\s*x\s*}/gi, e).replace(/{\s*(y|reverseY|-\s*y)\s*}/gi, t);
  }
  init() {
    const { tiling: e, tileDimension: t, levels: s, url: n, projection: i } = this;
    return e.flipY = !/{\s*reverseY|-\s*y\s*}/g.test(n), e.setProjection(new ne(i)), e.setContentBounds(...e.projection.getBounds()), Array.isArray(s) ? s.forEach((r, o) => {
      r !== null && e.setLevel(o, {
        tilePixelWidth: t,
        tilePixelHeight: t,
        ...r
      });
    }) : e.generateLevels(s, e.projection.tileCountX, e.projection.tileCountY, {
      tilePixelWidth: t,
      tilePixelHeight: t
    }), this.url = n, Promise.resolve();
  }
}
class us extends Pe {
  constructor(e = {}) {
    const {
      url: t = null,
      ...s
    } = e;
    super(s), this.tileSets = null, this.extension = null, this.url = t;
  }
  getUrl(e, t, s) {
    const { url: n, extension: i, tileSets: r, tiling: o } = this;
    return new URL(`${parseInt(r[s - o.minLevel].href)}/${e}/${t}.${i}`, n).toString();
  }
  init() {
    const { url: e } = this;
    return this.fetchData(new URL("tilemapresource.xml", e), this.fetchOptions).then((t) => t.text()).then((t) => {
      const { tiling: s } = this, n = new DOMParser().parseFromString(t, "text/xml"), i = n.querySelector("BoundingBox"), r = n.querySelector("TileFormat"), a = [...n.querySelector("TileSets").querySelectorAll("TileSet")].map((y) => ({
        href: parseInt(y.getAttribute("href")),
        unitsPerPixel: parseFloat(y.getAttribute("units-per-pixel")),
        order: parseInt(y.getAttribute("order"))
      })).sort((y, x) => y.order - x.order), c = parseFloat(i.getAttribute("minx")) * _.DEG2RAD, u = parseFloat(i.getAttribute("maxx")) * _.DEG2RAD, h = parseFloat(i.getAttribute("miny")) * _.DEG2RAD, d = parseFloat(i.getAttribute("maxy")) * _.DEG2RAD, m = parseInt(r.getAttribute("width")), p = parseInt(r.getAttribute("height")), f = r.getAttribute("extension"), g = n.querySelector("SRS").textContent;
      this.extension = f, this.url = e, this.tileSets = a, s.setProjection(new ne(g)), s.setContentBounds(c, h, u, d), a.forEach(({ order: y }) => {
        s.setLevel(y, {
          tileCountX: s.projection.tileCountX * 2 ** y,
          tilePixelWidth: m,
          tilePixelHeight: p
        });
      });
    });
  }
}
function Hi(l) {
  return /(:84|:crs84)$/i.test(l);
}
class On extends Pe {
  /**
   * @param {WMTSImageSourceOptions} options - Configuration options.
   */
  constructor(e = {}) {
    const {
      capabilities: t = null,
      layer: s = null,
      tileMatrixSet: n = "default",
      style: i = "default",
      url: r = null,
      format: o = "image/jpeg",
      dimensions: a = null,
      tileMatrixLabels: c = null,
      tileMatrices: u = null,
      projection: h = null,
      levels: d = 20,
      tileDimension: m = 256,
      contentBoundingBox: p = null,
      ...f
    } = e;
    super(f), this.capabilities = t, this.layer = s, this.tileMatrixSet = n, this.style = i, this.url = r, this.format = o, this.dimensions = a, this.tileMatrixLabels = c, this.tileMatrices = u, this.projection = h, this.levels = d, this.tileDimension = m, this.contentBoundingBox = p, this._useKvp = !1;
  }
  /**
   * Detects whether the URL uses KVP or RESTful mode.
   * If the URL contains no template variables, it is considered a KVP endpoint.
   */
  _detectRequestMode(e) {
    return !/\{/.test(e);
  }
  /**
   * @deprecated Resolves legacy capabilities-based options into literal fields.
   */
  _resolveCapabilities() {
    const e = this.capabilities;
    if (!e)
      return;
    console.warn('WMTSImageSource: The "capabilities" option has been deprecated. Use literal options instead.');
    let t = this.layer;
    t ? typeof t == "string" && (t = e.layers.find((r) => r.identifier === t)) : t = e.layers[0];
    let s = this.tileMatrixSet;
    if (!s || s === "default" ? s = t.tileMatrixSets[0] : typeof s == "string" && (s = t.tileMatrixSets.find((r) => r.identifier === s)), !this.style || this.style === "default") {
      const r = t.styles.find((o) => o.isDefault);
      r && (this.style = r.identifier);
    }
    this.url || (this.url = t.resourceUrls[0].template);
    const n = s.supportedCRS;
    this.projection || (this.projection = n.includes("4326") || Hi(n) ? "EPSG:4326" : "EPSG:3857"), !this.contentBoundingBox && t.boundingBox && (this.contentBoundingBox = t.boundingBox.bounds), this.tileMatrices || (this.tileMatrices = s.tileMatrices);
    const i = {};
    t.dimensions.forEach((r) => {
      i[r.identifier] = r.defaultValue;
    }), this.dimensions && Object.assign(i, this.dimensions), this.dimensions = i, this.tileMatrixSet = s.identifier, this.layer = t.identifier, this.capabilities = null;
  }
  init() {
    this._resolveCapabilities();
    const {
      tiling: e,
      tileDimension: t,
      levels: s,
      dimensions: n,
      contentBoundingBox: i,
      tileMatrices: r,
      style: o,
      tileMatrixSet: a
    } = this;
    let { url: c } = this;
    const u = this.projection || "EPSG:3857";
    if (e.flipY = !0, e.setProjection(new ne(u)), i !== null ? e.setContentBounds(
      i[0],
      i[1],
      i[2],
      i[3]
    ) : e.setContentBounds(...e.projection.getBounds()), Array.isArray(r) ? r.forEach((h, d) => {
      const m = h.tileWidth || t, p = h.tileHeight || t;
      e.setLevel(d, {
        tilePixelWidth: m,
        tilePixelHeight: p,
        tileCountX: h.matrixWidth,
        tileCountY: h.matrixHeight,
        tileBounds: h.tileBounds || h.bounds
      });
    }) : e.generateLevels(
      s,
      e.projection.tileCountX,
      e.projection.tileCountY,
      {
        tilePixelWidth: t,
        tilePixelHeight: t
      }
    ), this._useKvp = this._detectRequestMode(c), !this._useKvp && (c = c.replace(/{\s*TileMatrixSet\s*}/gi, a).replace(/{\s*Style\s*}/gi, o), n))
      for (const h in n)
        c = c.replace(new RegExp(`{\\s*${h}\\s*}`, "gi"), n[h]);
    return this.url = c, Promise.resolve();
  }
  getUrl(e, t, s) {
    const { tileMatrices: n, tileMatrixLabels: i } = this;
    let r;
    return n !== null && n.length > 0 ? r = n[s].identifier : i ? r = i[s] : r = s.toString(), this._useKvp ? this._buildKvpUrl(e, t, r) : this._buildRestfulUrl(e, t, r);
  }
  _buildRestfulUrl(e, t, s) {
    return this.url.replace(/{\s*TileMatrix\s*}/gi, s).replace(/{\s*TileCol\s*}/gi, e).replace(/{\s*TileRow\s*}/gi, t);
  }
  _buildKvpUrl(e, t, s) {
    const { dimensions: n, format: i } = this, r = this.url, o = new URLSearchParams({
      SERVICE: "WMTS",
      VERSION: "1.0.0",
      REQUEST: "GetTile",
      LAYER: this.layer,
      STYLE: this.style,
      TILEMATRIXSET: this.tileMatrixSet,
      TILEMATRIX: s,
      TILEROW: t,
      TILECOL: e,
      FORMAT: i
    });
    if (n)
      for (const c in n)
        o.set(c, n[c]);
    const a = r.includes("?") ? "&" : "?";
    return r + a + o.toString();
  }
}
class Un extends Pe {
  // TODO: layer and styles can be arrays, comma separated lists
  constructor(e = {}) {
    const {
      url: t = null,
      layer: s = null,
      styles: n = null,
      contentBoundingBox: i = null,
      version: r = "1.3.0",
      crs: o = "EPSG:4326",
      format: a = "image/png",
      transparent: c = !1,
      levels: u = 18,
      tileDimension: h = 256,
      ...d
    } = e;
    super(d), this.url = t, this.layer = s, this.crs = o, this.format = a, this.tileDimension = h, this.styles = n, this.version = r, this.levels = u, this.transparent = c, this.contentBoundingBox = i;
  }
  init() {
    const { tiling: e, levels: t, tileDimension: s, contentBoundingBox: n } = this;
    return e.setProjection(new ne(this.crs)), e.flipY = !0, e.generateLevels(t, e.projection.tileCountX, e.projection.tileCountY, {
      tilePixelWidth: s,
      tilePixelHeight: s
    }), n !== null ? e.setContentBounds(...n) : e.setContentBounds(...e.projection.getBounds()), Promise.resolve();
  }
  // TODO: handle this in ProjectionScheme or TilingScheme? Or Loader?
  normalizedToMercatorX(e) {
    return _.mapLinear(e, 0, 1, -20037508342789244e-9, 20037508342789244e-9);
  }
  normalizedToMercatorY(e) {
    return _.mapLinear(e, 0, 1, -20037508342789244e-9, 20037508342789244e-9);
  }
  getUrl(e, t, s) {
    const {
      tiling: n,
      layer: i,
      crs: r,
      format: o,
      tileDimension: a,
      styles: c,
      version: u,
      transparent: h
    } = this, d = u === "1.1.1" ? "SRS" : "CRS";
    let m;
    if (r === "EPSG:3857") {
      const f = n.getTileBounds(e, t, s, !0, !1), g = this.normalizedToMercatorX(f[0]), y = this.normalizedToMercatorY(f[1]), x = this.normalizedToMercatorX(f[2]), T = this.normalizedToMercatorY(f[3]);
      m = [g, y, x, T];
    } else {
      const [f, g, y, x] = n.getTileBounds(e, t, s, !1, !1).map((T) => T * _.RAD2DEG);
      r === "EPSG:4326" ? u === "1.1.1" ? m = [f, g, y, x] : m = [g, f, x, y] : m = [f, g, y, x];
    }
    const p = new URLSearchParams({
      SERVICE: "WMS",
      REQUEST: "GetMap",
      VERSION: u,
      LAYERS: i,
      [d]: r,
      BBOX: m.join(","),
      WIDTH: a,
      HEIGHT: a,
      FORMAT: o,
      TRANSPARENT: h ? "TRUE" : "FALSE"
    });
    return c != null && p.set("STYLES", c), new URL("?" + p.toString(), this.url).toString();
  }
}
class Bo extends vt {
  constructor(e = {}) {
    const {
      levels: t,
      tileDimension: s,
      projection: n,
      url: i,
      ...r
    } = e;
    super(r), this.name = "XYZ_TILES_PLUGIN", this.imageSource = new We({ url: i, levels: t, tileDimension: s, projection: n });
  }
}
class Yi extends vt {
  constructor(e = {}) {
    const { url: t, ...s } = e;
    super(s), this.name = "TMS_TILES_PLUGIN", this.imageSource = new us({ url: t });
  }
}
class Do extends vt {
  constructor(e = {}) {
    const {
      capabilities: t,
      url: s,
      layer: n,
      tileMatrixSet: i,
      style: r,
      format: o,
      dimensions: a,
      tileMatrixLabels: c,
      tileMatrices: u,
      projection: h,
      levels: d,
      tileDimension: m,
      contentBoundingBox: p,
      ...f
    } = e;
    super(f), this.name = "WTMS_TILES_PLUGIN", this.imageSource = new On({
      capabilities: t,
      url: s,
      layer: n,
      tileMatrixSet: i,
      style: r,
      format: o,
      dimensions: a,
      tileMatrixLabels: c,
      tileMatrices: u,
      projection: h,
      levels: d,
      tileDimension: m,
      contentBoundingBox: p
    });
  }
}
class Oo extends vt {
  constructor(e = {}) {
    const {
      url: t,
      layer: s,
      crs: n,
      format: i,
      tileDimension: r,
      styles: o,
      version: a,
      transparent: c,
      levels: u,
      contentBoundingBox: h,
      ...d
    } = e;
    super(d), this.name = "WMS_TILES_PLUGIN", this.imageSource = new Un({
      url: t,
      layer: s,
      crs: n,
      format: i,
      tileDimension: r,
      styles: o,
      version: a,
      transparent: c,
      levels: u,
      contentBoundingBox: h
    });
  }
}
const Ss = /* @__PURE__ */ new A(), Ze = /* @__PURE__ */ new as(), G = /* @__PURE__ */ new A(), de = /* @__PURE__ */ new A();
class ji extends oi {
  constructor(e = di) {
    super(), this.manager = e, this.ellipsoid = new An(), this.skirtLength = 1e3, this.smoothSkirtNormals = !0, this.generateNormals = !0, this.solid = !1, this.minLat = -Math.PI / 2, this.maxLat = Math.PI / 2, this.minLon = -Math.PI, this.maxLon = Math.PI;
  }
  parse(e) {
    const {
      ellipsoid: t,
      solid: s,
      skirtLength: n,
      smoothSkirtNormals: i,
      generateNormals: r,
      minLat: o,
      maxLat: a,
      minLon: c,
      maxLon: u
    } = this, {
      header: h,
      indices: d,
      vertexData: m,
      edgeIndices: p,
      extensions: f
    } = super.parse(e), g = new He(), y = new _n(), x = new ue(g, y);
    x.position.set(...h.center);
    const T = "octvertexnormals" in f, b = T || r, S = m.u.length, M = [], C = [], I = [], V = [];
    let U = 0, B = 0;
    for (let L = 0; L < S; L++)
      z(L, G), W(G.x, G.y, G.z, de), C.push(G.x, G.y), M.push(...de);
    for (let L = 0, v = d.length; L < v; L++)
      I.push(d[L]);
    if (b)
      if (T) {
        const L = f.octvertexnormals.normals;
        for (let v = 0, w = L.length; v < w; v++)
          V.push(L[v]);
      } else {
        const L = new He(), v = d.length > 21845 ? new Uint32Array(d) : new Uint16Array(d);
        L.setIndex(new K(v, 1, !1)), L.setAttribute("position", new K(new Float32Array(M), 3, !1)), L.computeVertexNormals();
        const R = L.getAttribute("normal").array;
        f.octvertexnormals = { normals: R };
        for (let E = 0, F = R.length; E < F; E++)
          V.push(R[E]);
      }
    if (g.addGroup(U, d.length, B), U += d.length, B++, s) {
      const L = M.length / 3;
      for (let v = 0; v < S; v++)
        z(v, G), W(G.x, G.y, G.z, de, -n), C.push(G.x, G.y), M.push(...de);
      for (let v = d.length - 1; v >= 0; v--)
        I.push(d[v] + L);
      if (b) {
        const v = f.octvertexnormals.normals;
        for (let w = 0, R = v.length; w < R; w++)
          V.push(-v[w]);
      }
      g.addGroup(U, d.length, B), U += d.length, B++;
    }
    if (n > 0) {
      const {
        westIndices: L,
        eastIndices: v,
        southIndices: w,
        northIndices: R
      } = p;
      let E;
      const F = H(L);
      E = M.length / 3, C.push(...F.uv), M.push(...F.positions);
      for (let O = 0, X = F.indices.length; O < X; O++)
        I.push(F.indices[O] + E);
      const q = H(v);
      E = M.length / 3, C.push(...q.uv), M.push(...q.positions);
      for (let O = 0, X = q.indices.length; O < X; O++)
        I.push(q.indices[O] + E);
      const D = H(w);
      E = M.length / 3, C.push(...D.uv), M.push(...D.positions);
      for (let O = 0, X = D.indices.length; O < X; O++)
        I.push(D.indices[O] + E);
      const k = H(R);
      E = M.length / 3, C.push(...k.uv), M.push(...k.positions);
      for (let O = 0, X = k.indices.length; O < X; O++)
        I.push(k.indices[O] + E);
      b && (V.push(...F.normals), V.push(...q.normals), V.push(...D.normals), V.push(...k.normals)), g.addGroup(U, d.length, B), U += d.length, B++;
    }
    for (let L = 0, v = M.length; L < v; L += 3)
      M[L + 0] -= h.center[0], M[L + 1] -= h.center[1], M[L + 2] -= h.center[2];
    const N = M.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I);
    if (g.setIndex(new K(N, 1, !1)), g.setAttribute("position", new K(new Float32Array(M), 3, !1)), g.setAttribute("uv", new K(new Float32Array(C), 2, !1)), b && g.setAttribute("normal", new K(new Float32Array(V), 3, !1)), "watermask" in f) {
      const { mask: L, size: v } = f.watermask, w = new Uint8Array(2 * v * v);
      for (let E = 0, F = L.length; E < F; E++) {
        const q = L[E] === 255 ? 0 : 255;
        w[2 * E + 0] = q, w[2 * E + 1] = q;
      }
      const R = new os(w, v, v, bn, Sn);
      R.flipY = !0, R.minFilter = fi, R.magFilter = Mn, R.needsUpdate = !0, y.roughnessMap = R;
    }
    return x.userData.minHeight = h.minHeight, x.userData.maxHeight = h.maxHeight, "metadata" in f && (x.userData.metadata = f.metadata.json), x;
    function z(L, v) {
      return v.x = m.u[L], v.y = m.v[L], v.z = m.height[L], v;
    }
    function W(L, v, w, R, E = 0) {
      const F = _.lerp(h.minHeight, h.maxHeight, w), q = _.lerp(c, u, L), D = _.lerp(o, a, v);
      return t.getCartographicToPosition(D, q, F + E, R), R;
    }
    function H(L) {
      const v = [], w = [], R = [], E = [], F = [];
      for (let k = 0, O = L.length; k < O; k++)
        z(L[k], G), v.push(G.x, G.y), R.push(G.x, G.y), W(G.x, G.y, G.z, de), w.push(...de), W(G.x, G.y, G.z, de, -n), E.push(...de);
      const q = L.length - 1;
      for (let k = 0; k < q; k++) {
        const O = k, X = k + 1, Te = k + L.length, It = k + L.length + 1;
        F.push(O, Te, X), F.push(X, Te, It);
      }
      let D = null;
      if (b) {
        const k = (w.length + E.length) / 3;
        if (i) {
          D = new Array(k * 3);
          const O = f.octvertexnormals.normals, X = D.length / 2;
          for (let Te = 0, It = k / 2; Te < It; Te++) {
            const wt = L[Te], Le = 3 * Te, ms = O[3 * wt + 0], gs = O[3 * wt + 1], ys = O[3 * wt + 2];
            D[Le + 0] = ms, D[Le + 1] = gs, D[Le + 2] = ys, D[X + Le + 0] = ms, D[X + Le + 1] = gs, D[X + Le + 2] = ys;
          }
        } else {
          D = [], Ze.a.fromArray(w, 0), Ze.b.fromArray(E, 0), Ze.c.fromArray(w, 3), Ze.getNormal(Ss);
          for (let O = 0; O < k; O++)
            D.push(...Ss);
        }
      }
      return {
        uv: [...v, ...R],
        positions: [...w, ...E],
        indices: F,
        normals: D
      };
    }
  }
}
const Y = 0, me = ["a", "b", "c"], P = /* @__PURE__ */ new je(), Ms = /* @__PURE__ */ new je(), Cs = /* @__PURE__ */ new je(), vs = /* @__PURE__ */ new je();
class Vn {
  constructor() {
    this.attributeList = null, this.splitOperations = [], this.trianglePool = new Wi();
  }
  forEachSplitPermutation(e) {
    const { splitOperations: t } = this, s = (n = 0) => {
      if (n >= t.length) {
        e();
        return;
      }
      t[n].keepPositive = !0, s(n + 1), t[n].keepPositive = !1, s(n + 1);
    };
    s();
  }
  // Takes an operation that returns a value for the given vertex passed to the callback. Triangles
  // are clipped along edges where the interpolated value is equal to 0. The polygons on the positive
  // side of the operation are kept if "keepPositive" is true.
  // callback( geometry, i0, i1, i2, barycoord );
  addSplitOperation(e, t = !0) {
    this.splitOperations.push({
      callback: e,
      keepPositive: t
    });
  }
  // Removes all split operations
  clearSplitOperations() {
    this.splitOperations.length = 0;
  }
  // clips an object hierarchy
  clipObject(e) {
    const t = e.clone(), s = [];
    return t.traverse((n) => {
      n.isMesh && (n.geometry = this.clip(n).geometry, (n.geometry.index ? n.geometry.index.count / 3 : n.attributes.position.count / 3) === 0 && s.push(n));
    }), s.forEach((n) => {
      n.removeFromParent();
    }), t;
  }
  // Returns a new mesh that has been clipped by the split operations. Range indicates the range of
  // elements to include when clipping.
  clip(e, t = null) {
    const s = this.getClippedData(e, t);
    return this.constructMesh(s.attributes, s.index, e);
  }
  // Appends the clip operation data to the given "target" object so multiple ranges can be appended.
  // The "target" object is returned with an "index" field, "vertexIsClipped" field, and series of arrays
  // in "attributes".
  // attributes - set of attribute arrays
  // index - triangle indices referencing vertices in attributes
  // vertexIsClipped - array indicating whether a vertex is on a clipped edge
  getClippedData(e, t = null, s = {}) {
    const { trianglePool: n, splitOperations: i, attributeList: r } = this, o = e.geometry, a = o.attributes.position, c = o.index;
    let u = 0;
    const h = {};
    s.index = s.index || [], s.vertexIsClipped = s.vertexIsClipped || [], s.attributes = s.attributes || {};
    for (const f in o.attributes) {
      if (r !== null) {
        if (r instanceof Function && !r(f))
          continue;
        if (Array.isArray(r) && !r.includes(f))
          continue;
      }
      s.attributes[f] = [];
    }
    let d = 0, m = c ? c.count : a.count;
    t !== null && (d = t.start, m = t.count);
    for (let f = d, g = d + m; f < g; f += 3) {
      let y = f + 0, x = f + 1, T = f + 2;
      c && (y = c.getX(y), x = c.getX(x), T = c.getX(T));
      const b = n.get();
      b.initFromIndices(y, x, T);
      let S = [b];
      for (let M = 0; M < i.length; M++) {
        const { keepPositive: C, callback: I } = i[M], V = [];
        for (let U = 0; U < S.length; U++) {
          const B = S[U], { indices: N, barycoord: z } = B;
          B.clipValues.a = I(o, N.a, N.b, N.c, z.a, e.matrixWorld), B.clipValues.b = I(o, N.a, N.b, N.c, z.b, e.matrixWorld), B.clipValues.c = I(o, N.a, N.b, N.c, z.c, e.matrixWorld), this.splitTriangle(B, !C, V);
        }
        S = V;
      }
      for (let M = 0, C = S.length; M < C; M++) {
        const I = S[M];
        p(I, o);
      }
      n.reset();
    }
    return s;
    function p(f, g) {
      for (let y = 0; y < 3; y++) {
        const x = f.getVertexHash(y, g);
        x in h || (h[x] = u, u++, f.getVertexData(y, g, s.attributes), s.vertexIsClipped.push(f.clipValues[me[y]] === Y));
        const T = h[x];
        s.index.push(T);
      }
    }
  }
  // Takes the set of resultant data and constructs a mesh
  constructMesh(e, t, s) {
    const n = s.geometry, i = new He(), r = e.position.length / 3 > 65535 ? new Uint32Array(t) : new Uint16Array(t);
    i.setIndex(new K(r, 1, !1));
    for (const a in e) {
      const c = n.getAttribute(a), u = new c.array.constructor(e[a]), h = new K(u, c.itemSize, c.normalized);
      h.gpuType = c.gpuType, i.setAttribute(a, h);
    }
    const o = new ue(i, s.material.clone());
    return o.position.copy(s.position), o.quaternion.copy(s.quaternion), o.scale.copy(s.scale), o;
  }
  // Splits the given triangle
  splitTriangle(e, t, s) {
    const { trianglePool: n } = this, i = [], r = [], o = [];
    for (let a = 0; a < 3; a++) {
      const c = me[a], u = me[(a + 1) % 3], h = e.clipValues[c], d = e.clipValues[u];
      (h < Y != d < Y || h === Y) && (i.push(a), r.push([c, u]), h === d ? o.push(0) : o.push(_.mapLinear(Y, h, d, 0, 1)));
    }
    if (i.length !== 2)
      Math.min(
        e.clipValues.a,
        e.clipValues.b,
        e.clipValues.c
      ) < Y === t && s.push(e);
    else if (i.length === 2) {
      const a = n.get().initFromTriangle(e), c = n.get().initFromTriangle(e), u = n.get().initFromTriangle(e);
      (i[0] + 1) % 3 === i[1] ? (a.lerpVertexFromEdge(e, r[0][0], r[0][1], o[0], "a"), a.copyVertex(e, r[0][1], "b"), a.lerpVertexFromEdge(e, r[1][0], r[1][1], o[1], "c"), a.clipValues.a = Y, a.clipValues.c = Y, c.lerpVertexFromEdge(e, r[0][0], r[0][1], o[0], "a"), c.copyVertex(e, r[1][1], "b"), c.copyVertex(e, r[0][0], "c"), c.clipValues.a = Y, u.lerpVertexFromEdge(e, r[0][0], r[0][1], o[0], "a"), u.lerpVertexFromEdge(e, r[1][0], r[1][1], o[1], "b"), u.copyVertex(e, r[1][1], "c"), u.clipValues.a = Y, u.clipValues.b = Y) : (a.lerpVertexFromEdge(e, r[0][0], r[0][1], o[0], "a"), a.lerpVertexFromEdge(e, r[1][0], r[1][1], o[1], "b"), a.copyVertex(e, r[0][0], "c"), a.clipValues.a = Y, a.clipValues.b = Y, c.lerpVertexFromEdge(e, r[0][0], r[0][1], o[0], "a"), c.copyVertex(e, r[0][1], "b"), c.lerpVertexFromEdge(e, r[1][0], r[1][1], o[1], "c"), c.clipValues.a = Y, c.clipValues.c = Y, u.copyVertex(e, r[0][1], "a"), u.copyVertex(e, r[1][0], "b"), u.lerpVertexFromEdge(e, r[1][0], r[1][1], o[1], "c"), u.clipValues.c = Y);
      let d, m;
      d = Math.min(a.clipValues.a, a.clipValues.b, a.clipValues.c), m = d < Y, m === t && s.push(a), d = Math.min(c.clipValues.a, c.clipValues.b, c.clipValues.c), m = d < Y, m === t && s.push(c), d = Math.min(u.clipValues.a, u.clipValues.b, u.clipValues.c), m = d < Y, m === t && s.push(u);
    }
  }
}
class Wi {
  constructor() {
    this.pool = [], this.index = 0;
  }
  get() {
    if (this.index >= this.pool.length) {
      const t = new qi();
      this.pool.push(t);
    }
    const e = this.pool[this.index];
    return this.index++, e;
  }
  reset() {
    this.index = 0;
  }
}
class qi {
  constructor() {
    this.indices = {
      a: -1,
      b: -1,
      c: -1
    }, this.clipValues = {
      a: -1,
      b: -1,
      c: -1
    }, this.barycoord = new as();
  }
  // returns a hash for the given [0, 2] index based on attributes of the referenced geometry
  getVertexHash(e, t) {
    const { barycoord: s, indices: n } = this, i = me[e], r = s[i];
    if (r.x === 1)
      return n[me[0]];
    if (r.y === 1)
      return n[me[1]];
    if (r.z === 1)
      return n[me[2]];
    {
      const { attributes: o } = t;
      let a = "";
      for (const c in o) {
        const u = o[c];
        switch (Ls(u, n.a, n.b, n.c, r, P), (c === "normal" || c === "tangent" || c === "bitangent") && P.normalize(), u.itemSize) {
          case 4:
            a += Fe(P.x, P.y, P.z, P.w);
            break;
          case 3:
            a += Fe(P.x, P.y, P.z);
            break;
          case 2:
            a += Fe(P.x, P.y);
            break;
          case 1:
            a += Fe(P.x);
            break;
        }
        a += "|";
      }
      return a;
    }
  }
  // Accumulate the vertex data in the given attribute arrays
  getVertexData(e, t, s) {
    const { barycoord: n, indices: i } = this, r = me[e], o = n[r], { attributes: a } = t;
    for (const c in a) {
      if (!s[c])
        continue;
      const u = a[c], h = s[c];
      switch (Ls(u, i.a, i.b, i.c, o, P), (c === "normal" || c === "tangent" || c === "bitangent") && P.normalize(), u.itemSize) {
        case 4:
          h.push(P.x, P.y, P.z, P.w);
          break;
        case 3:
          h.push(P.x, P.y, P.z);
          break;
        case 2:
          h.push(P.x, P.y);
          break;
        case 1:
          h.push(P.x);
          break;
      }
    }
  }
  // Copy the indices from a target triangle
  initFromTriangle(e) {
    return this.initFromIndices(
      e.indices.a,
      e.indices.b,
      e.indices.c
    );
  }
  // Set the indices for the given
  initFromIndices(e, t, s) {
    return this.indices.a = e, this.indices.b = t, this.indices.c = s, this.clipValues.a = -1, this.clipValues.b = -1, this.clipValues.c = -1, this.barycoord.a.set(1, 0, 0), this.barycoord.b.set(0, 1, 0), this.barycoord.c.set(0, 0, 1), this;
  }
  // Lerp the given vertex along to the provided edge of the provided triangle
  lerpVertexFromEdge(e, t, s, n, i) {
    this.clipValues[i] = _.lerp(e.clipValues[t], e.clipValues[s], n), this.barycoord[i].lerpVectors(e.barycoord[t], e.barycoord[s], n);
  }
  // Copy a vertex from the provided triangle
  copyVertex(e, t, s) {
    this.clipValues[s] = e.clipValues[t], this.barycoord[s].copy(e.barycoord[t]);
  }
}
function Ls(l, e, t, s, n, i) {
  switch (Ms.fromBufferAttribute(l, e), Cs.fromBufferAttribute(l, t), vs.fromBufferAttribute(l, s), i.set(0, 0, 0, 0).addScaledVector(Ms, n.x).addScaledVector(Cs, n.y).addScaledVector(vs, n.z), l.itemSize) {
    case 3:
      P.w = 0;
      break;
    case 2:
      P.w = 0, P.z = 0;
      break;
    case 1:
      P.w = 0, P.z = 0, P.y = 0;
      break;
  }
  return i;
}
function Fe(...l) {
  let s = "";
  for (let n = 0, i = l.length; n < i; n++)
    s += ~~(l[n] * 1e5 + 0.5), n !== i - 1 && (s += "_");
  return s;
}
const Es = {}, Xi = /* @__PURE__ */ new A(), Dt = /* @__PURE__ */ new A(), Ot = /* @__PURE__ */ new A(), $i = /* @__PURE__ */ new A(), Qi = /* @__PURE__ */ new A(), Z = /* @__PURE__ */ new A(), Ee = /* @__PURE__ */ new A(), $ = /* @__PURE__ */ new Q(), pe = /* @__PURE__ */ new Q(), As = /* @__PURE__ */ new Q();
class Zi extends Vn {
  constructor() {
    super(), this.ellipsoid = new An(), this.skirtLength = 1e3, this.smoothSkirtNormals = !0, this.solid = !1, this.minLat = -Math.PI / 2, this.maxLat = Math.PI / 2, this.minLon = -Math.PI, this.maxLon = Math.PI, this.attributeList = ["position", "normal", "uv"];
  }
  clipToQuadrant(e, t, s) {
    const { solid: n, skirtLength: i, ellipsoid: r, smoothSkirtNormals: o } = this;
    this.clearSplitOperations(), this.addSplitOperation(Is("x"), !t), this.addSplitOperation(Is("y"), !s);
    let a, c;
    const u = e.geometry.groups[0], h = this.getClippedData(e, u);
    if (this.adjustVertices(h, e.position, 0), n) {
      a = {
        index: h.index.slice().reverse(),
        attributes: {}
      };
      for (const S in h.attributes)
        a.attributes[S] = h.attributes[S].slice();
      const b = a.attributes.normal;
      if (b)
        for (let S = 0; S < b.length; S += 3)
          b[S + 0] *= -1, b[S + 1] *= -1, b[S + 2] *= -1;
      this.adjustVertices(a, e.position, -i);
    }
    if (i > 0) {
      c = {
        index: [],
        attributes: {
          position: [],
          normal: [],
          uv: []
        }
      };
      let b = 0;
      const S = {}, M = (N, z, W) => {
        const H = Fe(...N, ...W, ...z);
        H in S || (S[H] = b, b++, c.attributes.position.push(...N), c.attributes.normal.push(...W), c.attributes.uv.push(...z)), c.index.push(S[H]);
      }, C = h.index, I = h.attributes.uv, V = h.attributes.position, U = h.attributes.normal, B = h.index.length / 3;
      for (let N = 0; N < B; N++) {
        const z = 3 * N;
        for (let W = 0; W < 3; W++) {
          const H = (W + 1) % 3, L = C[z + W], v = C[z + H];
          if ($.fromArray(I, L * 2), pe.fromArray(I, v * 2), $.x === pe.x && ($.x === 0 || $.x === 0.5 || $.x === 1) || $.y === pe.y && ($.y === 0 || $.y === 0.5 || $.y === 1)) {
            Dt.fromArray(V, L * 3), Ot.fromArray(V, v * 3);
            const w = Dt, R = Ot, E = $i.copy(Dt), F = Qi.copy(Ot);
            Z.copy(E).add(e.position), r.getPositionToNormal(Z, Z), E.addScaledVector(Z, -i), Z.copy(F).add(e.position), r.getPositionToNormal(Z, Z), F.addScaledVector(Z, -i), o && U ? (Z.fromArray(U, L * 3), Ee.fromArray(U, v * 3)) : (Z.subVectors(w, R), Ee.subVectors(w, E).cross(Z).normalize(), Z.copy(Ee)), M(R, pe, Ee), M(w, $, Z), M(E, $, Z), M(R, pe, Ee), M(E, $, Z), M(F, pe, Ee);
          }
        }
      }
    }
    const d = h.index.length, m = h;
    if (a) {
      const { index: b, attributes: S } = a, M = m.attributes.position.length / 3;
      for (let C = 0, I = b.length; C < I; C++)
        m.index.push(b[C] + M);
      for (const C in h.attributes)
        m.attributes[C].push(...S[C]);
    }
    if (c) {
      const { index: b, attributes: S } = c, M = m.attributes.position.length / 3;
      for (let C = 0, I = b.length; C < I; C++)
        m.index.push(b[C] + M);
      for (const C in h.attributes)
        m.attributes[C].push(...S[C]);
    }
    const p = t ? 0 : -0.5, f = s ? 0 : -0.5, g = m.attributes.uv;
    for (let b = 0, S = g.length; b < S; b += 2)
      g[b] = (g[b] + p) * 2, g[b + 1] = (g[b + 1] + f) * 2;
    const y = this.constructMesh(m.attributes, m.index, e);
    y.userData.minHeight = e.userData.minHeight, y.userData.maxHeight = e.userData.maxHeight;
    let x = 0, T = 0;
    return y.geometry.addGroup(T, d, x), T += d, x++, a && (y.geometry.addGroup(T, a.index.length, x), T += a.index.length, x++), c && (y.geometry.addGroup(T, c.index.length, x), T += c.index.length, x++), y;
  }
  adjustVertices(e, t, s) {
    const { ellipsoid: n, minLat: i, maxLat: r, minLon: o, maxLon: a } = this, { attributes: c, vertexIsClipped: u } = e, h = c.position, d = c.uv, m = h.length / 3;
    for (let p = 0; p < m; p++) {
      const f = $.fromArray(d, p * 2);
      u && u[p] && (Math.abs(f.x - 0.5) < 1e-10 && (f.x = 0.5), Math.abs(f.y - 0.5) < 1e-10 && (f.y = 0.5), $.toArray(d, p * 2));
      const g = _.lerp(i, r, f.y), y = _.lerp(o, a, f.x), x = Xi.fromArray(h, p * 3).add(t);
      n.getPositionToCartographic(x, Es), n.getCartographicToPosition(g, y, Es.height + s, x), x.sub(t), x.toArray(h, p * 3);
    }
  }
}
function Is(l) {
  return (e, t, s, n, i) => {
    const r = e.attributes.uv;
    return $.fromBufferAttribute(r, t), pe.fromBufferAttribute(r, s), As.fromBufferAttribute(r, n), $[l] * i.x + pe[l] * i.y + As[l] * i.z - 0.5;
  };
}
const ws = Symbol("TILE_X"), Ps = Symbol("TILE_Y"), ke = Symbol("TILE_LEVEL"), be = Symbol("TILE_AVAILABLE"), Ut = Symbol("TILE_SPLIT_SOURCE_SCENE"), Ke = 1e4, Rs = /* @__PURE__ */ new A();
function Ki(l, e, t, s) {
  if (l && e < l.length) {
    const n = l[e];
    for (let i = 0, r = n.length; i < r; i++) {
      const { startX: o, startY: a, endX: c, endY: u } = n[i];
      if (t >= o && t <= c && s >= a && s <= u)
        return !0;
    }
  }
  return !1;
}
function Nn(l) {
  const { available: e = null, maxzoom: t = null } = l;
  return t === null ? e.length - 1 : t;
}
function Ji(l) {
  const { metadataAvailability: e = -1 } = l;
  return e;
}
function Vt(l, e) {
  const t = l[ke], s = Ji(e), n = Nn(e);
  return t < n && s !== -1 && t % s === 0;
}
function er(l, e, t, s, n) {
  return n.tiles[0].replace(/{\s*z\s*}/g, t).replace(/{\s*x\s*}/g, l).replace(/{\s*y\s*}/g, e).replace(/{\s*version\s*}/g, s);
}
class tr {
  constructor(e = {}) {
    const {
      useRecommendedSettings: t = !0,
      skirtLength: s = null,
      smoothSkirtNormals: n = !0,
      generateNormals: i = !0,
      solid: r = !1
    } = e;
    this.name = "QUANTIZED_MESH_PLUGIN", this.priority = -1e3, this.tiles = null, this.layer = null, this.useRecommendedSettings = t, this.skirtLength = s, this.smoothSkirtNormals = n, this.solid = r, this.generateNormals = i, this.attribution = null, this.tiling = new Lt(), this.projection = new ne();
  }
  // Plugin function
  init(e) {
    e.fetchOptions.headers = e.fetchOptions.headers || {}, e.fetchOptions.headers.Accept = "application/vnd.quantized-mesh,application/octet-stream;q=0.9", this.useRecommendedSettings && (e.errorTarget = 2), this.tiles = e;
  }
  loadRootTileset() {
    const { tiles: e } = this;
    let t = new URL("layer.json", new URL(e.rootURL, location.href));
    return e.invokeAllPlugins((s) => t = s.preprocessURL ? s.preprocessURL(t, null) : t), e.invokeOnePlugin((s) => s.fetchData && s.fetchData(t, this.tiles.fetchOptions)).then((s) => s.json()).then((s) => {
      this.layer = s;
      const {
        projection: n = "EPSG:4326",
        extensions: i = [],
        attribution: r = "",
        available: o = null
      } = s, {
        tiling: a,
        tiles: c,
        projection: u
      } = this;
      r && (this.attribution = {
        value: r,
        type: "string",
        collapsible: !0
      }), i.length > 0 && (c.fetchOptions.headers.Accept += `;extensions=${i.join("-")}`), u.setScheme(n);
      const { tileCountX: h, tileCountY: d } = u;
      a.setProjection(u), a.generateLevels(Nn(s) + 1, h, d);
      const m = [];
      for (let g = 0; g < h; g++) {
        const y = this.createChild(0, g, 0, o);
        y && m.push(y);
      }
      const p = {
        asset: {
          version: "1.1"
        },
        geometricError: 1 / 0,
        root: {
          refine: "REPLACE",
          geometricError: 1 / 0,
          boundingVolume: {
            region: [...this.tiling.getContentBounds(), -Ke, Ke]
          },
          children: m,
          [be]: o,
          [ke]: -1
        }
      };
      let f = c.rootURL;
      return c.invokeAllPlugins((g) => f = g.preprocessURL ? g.preprocessURL(f, null) : f), c.preprocessTileset(p, f), p;
    });
  }
  parseToMesh(e, t, s, n) {
    const {
      skirtLength: i,
      solid: r,
      smoothSkirtNormals: o,
      generateNormals: a,
      tiles: c
    } = this, u = c.ellipsoid;
    let h;
    if (s === "quantized_tile_split") {
      const f = new URL(n).searchParams, g = f.get("left") === "true", y = f.get("bottom") === "true", x = new Zi();
      x.ellipsoid.copy(u), x.solid = r, x.smoothSkirtNormals = o, x.skirtLength = i === null ? t.geometricError : i;
      const [T, b, S, M] = t.parent.boundingVolume.region;
      x.minLat = b, x.maxLat = M, x.minLon = T, x.maxLon = S;
      const C = t.parent.engineData.scene || t.parent[Ut];
      h = x.clipToQuadrant(C, g, y);
    } else if (s === "terrain") {
      const f = new ji(c.manager);
      f.ellipsoid.copy(u), f.solid = r, f.smoothSkirtNormals = o, f.generateNormals = a, f.skirtLength = i === null ? t.geometricError : i;
      const [g, y, x, T] = t.boundingVolume.region;
      f.minLat = y, f.maxLat = T, f.minLon = g, f.maxLon = x, h = f.parse(e);
    } else
      return;
    const { minHeight: d, maxHeight: m, metadata: p } = h.userData;
    return t.boundingVolume.region[4] = d, t.boundingVolume.region[5] = m, t.engineData.boundingVolume.setRegionData(u, ...t.boundingVolume.region), p && ("geometricerror" in p && (t.geometricError = p.geometricerror), Vt(t, this.layer) && "available" in p && t.children.length === 0 && (t[be] = [
      ...new Array(t[ke] + 1).fill(null),
      ...p.available
    ])), t[Ut] = h, this.expandChildren(t), h;
  }
  getAttributions(e) {
    this.attribution && e.push(this.attribution);
  }
  // Local functions
  createChild(e, t, s, n) {
    const { tiles: i, layer: r, tiling: o, projection: a } = this, c = i.ellipsoid, u = n === null && e === 0 || Ki(n, e, t, s), h = er(t, s, e, 1, r), d = [...o.getTileBounds(t, s, e), -Ke, Ke], [
      /* west */
      ,
      m,
      /* east */
      ,
      p,
      /* minHeight */
      ,
      f
    ] = d, g = m > 0 != p > 0 ? 0 : Math.min(Math.abs(m), Math.abs(p));
    c.getCartographicToPosition(g, 0, f, Rs), Rs.z = 0;
    const y = a.tileCountX, b = Math.max(...c.radius) * 2 * Math.PI * 0.25 / (65 * y) / 2 ** e, S = {
      [be]: null,
      [ke]: e,
      [ws]: t,
      [Ps]: s,
      refine: "REPLACE",
      geometricError: b,
      boundingVolume: { region: d },
      content: u ? { uri: h } : null,
      children: []
    };
    return Vt(S, r) || (S[be] = n), S;
  }
  expandChildren(e) {
    const t = e[ke], s = e[ws], n = e[Ps], i = e[be];
    if (t >= this.tiling.maxLevel)
      return;
    let r = !1;
    for (let o = 0; o < 2; o++)
      for (let a = 0; a < 2; a++) {
        const c = this.createChild(t + 1, 2 * s + o, 2 * n + a, i);
        c.content !== null ? (e.children.push(c), r = !0) : (c.content = { uri: `tile.quantized_tile_split?bottom=${a === 0}&left=${o === 0}` }, c.internal = { isVirtual: !0 }, e.internal.virtualChildCount++, e.children.push(c));
      }
    r || (e.children.length -= e.internal.virtualChildCount, e.internal.virtualChildCount = 0);
  }
  fetchData(e, t) {
    if (/quantized_tile_split/.test(e))
      return new ArrayBuffer();
  }
  disposeTile(e) {
    const { tiles: t, layer: s } = this;
    if (delete e[Ut], Vt(e, s) && (e[be] = null), be in e) {
      const { virtualChildCount: n } = e.internal, i = e.children.length, r = i - n;
      for (let o = r; o < i; o++)
        t.processNodeQueue.remove(e.children[o]);
      e.children.length = 0, e.internal.virtualChildCount = 0;
    }
  }
}
let Uo = class extends ai {
  constructor(e = {}) {
    super({
      assetTypeHandler: (t, s, n) => {
        t === "TERRAIN" && s.getPluginByName("QUANTIZED_MESH_PLUGIN") === null ? (console.warn(
          'CesiumIonAuthPlugin: CesiumIonAuthPlugin plugin auto-registration has been deprecated. Please implement a custom "assetTypeHandler" for "TERRAIN" using "QuantizedMeshPlugin", instead.'
        ), s.registerPlugin(new tr({
          useRecommendedSettings: this.useRecommendedSettings
        }))) : t === "IMAGERY" && s.getPluginByName("TMS_TILES_PLUGIN") === null ? (console.warn(
          'CesiumIonAuthPlugin: CesiumIonAuthPlugin plugin auto-registration has been deprecated. Please implement a custom "assetTypeHandler" for "IMAGERY" using "TMSTilesPlugin", instead.'
        ), s.registerPlugin(new Yi({
          useRecommendedSettings: this.useRecommendedSettings,
          shape: "ellipsoid"
        }))) : console.warn(`CesiumIonAuthPlugin: Cesium Ion asset type "${t}" unhandled.`);
      },
      ...e
    }), e.__suppress_warning__ && console.warn(
      'CesiumIonAuthPlugin: Plugin has been moved to "3d-tiles-renderer/core/plugins".'
    );
  }
};
const Nt = /* @__PURE__ */ new se();
class No {
  constructor() {
    this.name = "UPDATE_ON_CHANGE_PLUGIN", this.tiles = null, this.needsUpdate = !1, this.cameraMatrices = /* @__PURE__ */ new Map();
  }
  init(e) {
    this.tiles = e, this._needsUpdateCallback = () => {
      this.needsUpdate = !0;
    }, this._onCameraAdd = ({ camera: t }) => {
      this.needsUpdate = !0, this.cameraMatrices.set(t, new se());
    }, this._onCameraDelete = ({ camera: t }) => {
      this.needsUpdate = !0, this.cameraMatrices.delete(t);
    }, e.addEventListener("needs-update", this._needsUpdateCallback), e.addEventListener("add-camera", this._onCameraAdd), e.addEventListener("delete-camera", this._onCameraDelete), e.addEventListener("camera-resolution-change", this._needsUpdateCallback), e.cameras.forEach((t) => {
      this._onCameraAdd({ camera: t });
    });
  }
  doTilesNeedUpdate() {
    const e = this.tiles;
    let t = !1;
    this.cameraMatrices.forEach((n, i) => {
      Nt.copy(e.group.matrixWorld).premultiply(i.matrixWorldInverse).premultiply(i.projectionMatrixInverse), t = t || !Nt.equals(n), n.copy(Nt);
    });
    const s = this.needsUpdate;
    return this.needsUpdate = !1, s || t;
  }
  preprocessNode() {
    this.needsUpdate = !0;
  }
  dispose() {
    const e = this.tiles;
    e.removeEventListener("camera-resolution-change", this._needsUpdateCallback), e.removeEventListener("needs-update", this._needsUpdateCallback), e.removeEventListener("add-camera", this._onCameraAdd), e.removeEventListener("delete-camera", this._onCameraDelete);
  }
}
const Bs = /* @__PURE__ */ new A();
function Be(l, e) {
  if (l.isInterleavedBufferAttribute || l.array instanceof e)
    return l;
  const s = e === Int8Array || e === Int16Array || e === Int32Array ? -1 : 0, n = new e(l.count * l.itemSize), i = new K(n, l.itemSize, !0), r = l.itemSize, o = l.count;
  for (let a = 0; a < o; a++)
    for (let c = 0; c < r; c++) {
      const u = _.clamp(l.getComponent(a, c), s, 1);
      i.setComponent(a, c, u);
    }
  return i;
}
function sr(l, e = Int16Array) {
  const t = l.geometry, s = t.attributes, n = s.position;
  if (n.isInterleavedBufferAttribute || n.array instanceof e)
    return n;
  const i = new e(n.count * n.itemSize), r = new K(i, n.itemSize, !1), o = n.itemSize, a = n.count;
  t.computeBoundingBox();
  const c = t.boundingBox, { min: u, max: h } = c, d = 2 ** (8 * e.BYTES_PER_ELEMENT - 1) - 1, m = -d;
  for (let p = 0; p < a; p++)
    for (let f = 0; f < o; f++) {
      const g = f === 0 ? "x" : f === 1 ? "y" : "z", y = u[g], x = h[g], T = _.mapLinear(
        n.getComponent(p, f),
        y,
        x,
        m,
        d
      );
      r.setComponent(p, f, T);
    }
  c.getCenter(Bs).multiply(l.scale).applyQuaternion(l.quaternion), l.position.add(Bs), l.scale.x *= 0.5 * (h.x - u.x) / d, l.scale.y *= 0.5 * (h.y - u.y) / d, l.scale.z *= 0.5 * (h.z - u.z) / d, s.position = r, l.geometry.boundingBox = null, l.geometry.boundingSphere = null, l.updateMatrixWorld();
}
class Fo {
  constructor(e) {
    this._options = {
      // whether to generate normals if they don't already exist.
      generateNormals: !1,
      // whether to disable use of mipmaps since they are typically not necessary
      // with something like 3d tiles.
      disableMipmaps: !0,
      // whether to compress certain attributes
      compressIndex: !0,
      compressNormals: !1,
      compressUvs: !1,
      compressPosition: !1,
      // the TypedArray type to use when compressing the attributes
      uvType: Int8Array,
      normalType: Int8Array,
      positionType: Int16Array,
      ...e
    }, this.name = "TILES_COMPRESSION_PLUGIN", this.priority = -100;
  }
  processTileModel(e, t) {
    const {
      generateNormals: s,
      disableMipmaps: n,
      compressIndex: i,
      compressUvs: r,
      compressNormals: o,
      compressPosition: a,
      uvType: c,
      normalType: u,
      positionType: h
    } = this._options;
    e.traverse((d) => {
      if (d.material && n) {
        const m = d.material;
        for (const p in m) {
          const f = m[p];
          f && f.isTexture && f.generateMipmaps && (f.generateMipmaps = !1, f.minFilter = Mn);
        }
      }
      if (d.geometry) {
        const m = d.geometry, p = m.attributes;
        if (r) {
          const { uv: f, uv1: g, uv2: y, uv3: x } = p;
          f && (p.uv = Be(f, c)), g && (p.uv1 = Be(g, c)), y && (p.uv2 = Be(y, c)), x && (p.uv3 = Be(x, c));
        }
        if (s && !p.normals && m.computeVertexNormals(), o && p.normals && (p.normals = Be(p.normals, u)), a && sr(d, h), i && m.index) {
          const f = p.position.count, g = m.index, y = f > 65535 ? Uint32Array : f > 255 ? Uint16Array : Uint8Array;
          if (!(g.array instanceof y)) {
            const x = new y(m.index.count);
            x.set(g.array);
            const T = new K(x, 1);
            m.setIndex(T);
          }
        }
      }
    });
  }
}
function j(l, e, t) {
  return l && e in l ? l[e] : t;
}
function Fn(l) {
  return l !== "BOOLEAN" && l !== "STRING" && l !== "ENUM";
}
function nr(l) {
  return /^FLOAT/.test(l);
}
function qe(l) {
  return /^VEC/.test(l);
}
function Xe(l) {
  return /^MAT/.test(l);
}
function kn(l, e, t, s = null) {
  return Xe(t) || qe(t) ? s.fromArray(l, e) : l[e];
}
function es(l) {
  const { type: e, componentType: t } = l;
  switch (e) {
    case "SCALAR":
      return t === "INT64" ? 0n : 0;
    case "VEC2":
      return new Q();
    case "VEC3":
      return new A();
    case "VEC4":
      return new je();
    case "MAT2":
      return new mi();
    case "MAT3":
      return new pi();
    case "MAT4":
      return new se();
    case "BOOLEAN":
      return !1;
    case "STRING":
      return "";
    // the final value for enums is a string but are represented as integers
    // during intermediate steps
    case "ENUM":
      return 0;
  }
}
function Ds(l, e) {
  if (e == null)
    return !1;
  switch (l) {
    case "SCALAR":
      return typeof e == "number" || typeof e == "bigint";
    case "VEC2":
      return e.isVector2;
    case "VEC3":
      return e.isVector3;
    case "VEC4":
      return e.isVector4;
    case "MAT2":
      return e.isMatrix2;
    case "MAT3":
      return e.isMatrix3;
    case "MAT4":
      return e.isMatrix4;
    case "BOOLEAN":
      return typeof e == "boolean";
    case "STRING":
      return typeof e == "string";
    case "ENUM":
      return typeof e == "number" || typeof e == "bigint";
  }
  throw new Error("ClassProperty: invalid type.");
}
function Ye(l, e = null) {
  switch (l) {
    case "INT8":
      return Int8Array;
    case "INT16":
      return Int16Array;
    case "INT32":
      return Int32Array;
    case "INT64":
      return BigInt64Array;
    case "UINT8":
      return Uint8Array;
    case "UINT16":
      return Uint16Array;
    case "UINT32":
      return Uint32Array;
    case "UINT64":
      return BigUint64Array;
    case "FLOAT32":
      return Float32Array;
    case "FLOAT64":
      return Float64Array;
  }
  switch (e) {
    case "BOOLEAN":
      return Uint8Array;
    case "STRING":
      return Uint8Array;
  }
  throw new Error("ClassProperty: invalid type.");
}
function ir(l, e = null) {
  if (l.array) {
    e = e && Array.isArray(e) ? e : [], e.length = l.count;
    for (let s = 0, n = e.length; s < n; s++)
      e[s] = gt(l, e[s]);
  } else
    e = gt(l, e);
  return e;
}
function gt(l, e = null) {
  const t = l.default, s = l.type;
  if (e = e || es(l), t === null) {
    switch (s) {
      case "SCALAR":
        return 0;
      case "VEC2":
        return e.set(0, 0);
      case "VEC3":
        return e.set(0, 0, 0);
      case "VEC4":
        return e.set(0, 0, 0, 0);
      case "MAT2":
        return e.identity();
      case "MAT3":
        return e.identity();
      case "MAT4":
        return e.identity();
      case "BOOLEAN":
        return !1;
      case "STRING":
        return "";
      case "ENUM":
        return "";
    }
    throw new Error("ClassProperty: invalid type.");
  } else if (Xe(s))
    e.fromArray(t);
  else if (qe(s))
    e.fromArray(t);
  else
    return t;
}
function rr(l, e) {
  if (l.noData === null)
    return e;
  const t = l.noData, s = l.type;
  if (Array.isArray(e))
    for (let r = 0, o = e.length; r < o; r++)
      e[r] = n(e[r]);
  else
    e = n(e);
  return e;
  function n(r) {
    return i(r) && (r = gt(l, r)), r;
  }
  function i(r) {
    if (Xe(s)) {
      const o = r.elements;
      for (let a = 0, c = t.length; a < c; a++)
        if (t[a] !== o[a])
          return !1;
      return !0;
    } else if (qe(s)) {
      for (let o = 0, a = t.length; o < a; o++)
        if (t[o] !== r.getComponent(o))
          return !1;
      return !0;
    } else
      return t === r;
  }
}
function or(l, e) {
  switch (l) {
    case "INT8":
      return Math.max(e / 127, -1);
    case "INT16":
      return Math.max(e, 32767, -1);
    case "INT32":
      return Math.max(e / 2147483647, -1);
    case "INT64":
      return Math.max(Number(e) / 9223372036854776e3, -1);
    // eslint-disable-line no-loss-of-precision
    case "UINT8":
      return e / 255;
    case "UINT16":
      return e / 65535;
    case "UINT32":
      return e / 4294967295;
    case "UINT64":
      return Number(e) / 18446744073709552e3;
  }
}
function ar(l, e) {
  const {
    type: t,
    componentType: s,
    scale: n,
    offset: i,
    normalized: r
  } = l;
  if (Array.isArray(e))
    for (let h = 0, d = e.length; h < d; h++)
      e[h] = o(e[h]);
  else
    e = o(e);
  return e;
  function o(h) {
    return Xe(t) ? h = c(h) : qe(t) ? h = a(h) : h = u(h), h;
  }
  function a(h) {
    return h.x = u(h.x), h.y = u(h.y), "z" in h && (h.z = u(h.z)), "w" in h && (h.w = u(h.w)), h;
  }
  function c(h) {
    const d = h.elements;
    for (let m = 0, p = d.length; m < p; m++)
      d[m] = u(d[m]);
    return h;
  }
  function u(h) {
    return r && (h = or(s, h)), (r || nr(s)) && (h = h * n + i), h;
  }
}
function hs(l, e, t = null) {
  if (l.array) {
    Array.isArray(e) || (e = new Array(l.count || 0)), e.length = t !== null ? t : l.count;
    for (let s = 0, n = e.length; s < n; s++)
      Ds(l.type, e[s]) || (e[s] = es(l));
  } else
    Ds(l.type, e) || (e = es(l));
  return e;
}
function yt(l, e) {
  for (const t in e)
    t in l || delete e[t];
  for (const t in l) {
    const s = l[t];
    e[t] = hs(s, e[t]);
  }
}
function lr(l) {
  switch (l) {
    case "ENUM":
      return 1;
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    case "MAT2":
      return 4;
    case "MAT3":
      return 9;
    case "MAT4":
      return 16;
    // unused
    case "BOOLEAN":
      return -1;
    case "STRING":
      return -1;
    default:
      return -1;
  }
}
class Et {
  constructor(e, t, s = null) {
    this.name = t.name || null, this.description = t.description || null, this.type = t.type, this.componentType = t.componentType || null, this.enumType = t.enumType || null, this.array = t.array || !1, this.count = t.count || 0, this.normalized = t.normalized || !1, this.offset = t.offset || 0, this.scale = j(t, "scale", 1), this.max = j(t, "max", 1 / 0), this.min = j(t, "min", -1 / 0), this.required = t.required || !1, this.noData = j(t, "noData", null), this.default = j(t, "default", null), this.semantic = j(t, "semantic", null), this.enumSet = null, this.accessorProperty = s, s && (this.offset = j(s, "offset", this.offset), this.scale = j(s, "scale", this.scale), this.max = j(s, "max", this.max), this.min = j(s, "min", this.min)), t.type === "ENUM" && (this.enumSet = e[this.enumType], this.componentType === null && (this.componentType = j(this.enumSet, "valueType", "UINT16")));
  }
  // shape the given target to match the data type of the property
  // enums are set to their integer value
  shapeToProperty(e, t = null) {
    return hs(this, e, t);
  }
  // resolve the given object to the default value for the property for a single element
  // enums are set to a default string
  resolveDefaultElement(e) {
    return gt(this, e);
  }
  // resolve the target to the default value for the property for every element if it's an array
  // enums are set to a default string
  resolveDefault(e) {
    return ir(this, e);
  }
  // converts any instances of no data to the default value
  resolveNoData(e) {
    return rr(this, e);
  }
  // converts enums integers in the given target to strings
  resolveEnumsToStrings(e) {
    const t = this.enumSet;
    if (this.type === "ENUM")
      if (Array.isArray(e))
        for (let n = 0, i = e.length; n < i; n++)
          e[n] = s(e[n]);
      else
        e = s(e);
    return e;
    function s(n) {
      const i = t.values.find((r) => r.value === n);
      return i === null ? "" : i.name;
    }
  }
  // apply scales
  adjustValueScaleOffset(e) {
    return Fn(this.type) ? ar(this, e) : e;
  }
}
class ds {
  constructor(e, t = {}, s = {}, n = null) {
    this.definition = e, this.class = t[e.class], this.className = e.class, this.enums = s, this.data = n, this.name = "name" in e ? e.name : null, this.properties = null;
  }
  getPropertyNames() {
    return Object.keys(this.class.properties);
  }
  includesData(e) {
    return !!this.definition.properties[e];
  }
  dispose() {
  }
  _initProperties(e = Et) {
    const t = {};
    for (const s in this.class.properties)
      t[s] = new e(this.enums, this.class.properties[s], this.definition.properties[s]);
    this.properties = t;
  }
}
class cr extends Et {
  constructor(e, t, s = null) {
    super(e, t, s), this.attribute = (s == null ? void 0 : s.attribute) ?? null;
  }
}
class ur extends ds {
  constructor(...e) {
    super(...e), this.isPropertyAttributeAccessor = !0, this._initProperties(cr);
  }
  getData(e, t, s = {}) {
    const n = this.properties;
    yt(n, s);
    for (const i in n)
      s[i] = this.getPropertyValue(i, e, t, s[i]);
    return s;
  }
  getPropertyValue(e, t, s, n = null) {
    if (t >= this.count)
      throw new Error("PropertyAttributeAccessor: Requested index is outside the range of the buffer.");
    const i = this.properties[e], r = i.type;
    if (i) {
      if (!this.definition.properties[e])
        return i.resolveDefault(n);
    } else throw new Error("PropertyAttributeAccessor: Requested class property does not exist.");
    n = i.shapeToProperty(n);
    const o = s.getAttribute(i.attribute.toLowerCase());
    if (Xe(r)) {
      const a = n.elements;
      for (let c = 0, u = a.length; c < u; c < u)
        a[c] = o.getComponent(t, c);
    } else if (qe(r))
      n.fromBufferAttribute(o, t);
    else if (r === "SCALAR" || r === "ENUM")
      n = o.getX(t);
    else
      throw new Error("StructuredMetadata.PropertyAttributeAccessor: BOOLEAN and STRING types are not supported by property attributes.");
    return n = i.adjustValueScaleOffset(n), n = i.resolveEnumsToStrings(n), n = i.resolveNoData(n), n;
  }
}
class hr extends Et {
  constructor(e, t, s = null) {
    super(e, t, s), this.values = (s == null ? void 0 : s.values) ?? null, this.valueLength = lr(this.type), this.arrayOffsets = j(s, "arrayOffsets", null), this.stringOffsets = j(s, "stringOffsets", null), this.arrayOffsetType = j(s, "arrayOffsetType", "UINT32"), this.stringOffsetType = j(s, "stringOffsetType", "UINT32");
  }
  // returns the necessary array length based on the array offsets if present
  getArrayLengthFromId(e, t) {
    let s = this.count;
    if (this.arrayOffsets !== null) {
      const { arrayOffsets: n, arrayOffsetType: i } = this, r = Ye(i), o = new r(e[n]);
      s = o[t + 1] - o[t];
    }
    return s;
  }
  // returns the index offset into the data buffer for the given id based on the
  // the array offsets if present
  getIndexOffsetFromId(e, t) {
    let s = t;
    if (this.arrayOffsets) {
      const { arrayOffsets: n, arrayOffsetType: i } = this, r = Ye(i);
      s = new r(e[n])[s];
    } else this.array && (s *= this.count);
    return s;
  }
}
class dr extends ds {
  constructor(...e) {
    super(...e), this.isPropertyTableAccessor = !0, this.count = this.definition.count, this._initProperties(hr);
  }
  getData(e, t = {}) {
    const s = this.properties;
    yt(s, t);
    for (const n in s)
      t[n] = this.getPropertyValue(n, e, t[n]);
    return t;
  }
  // reads an individual element
  _readValueAtIndex(e, t, s, n = null) {
    const i = this.properties[e], { componentType: r, type: o } = i, a = this.data, c = a[i.values], u = Ye(r, o), h = new u(c), d = i.getIndexOffsetFromId(a, t);
    if (Fn(o) || o === "ENUM")
      return kn(h, (d + s) * i.valueLength, o, n);
    if (o === "STRING") {
      let m = d + s, p = 0;
      if (i.stringOffsets !== null) {
        const { stringOffsets: g, stringOffsetType: y } = i, x = Ye(y), T = new x(a[g]);
        p = T[m + 1] - T[m], m = T[m];
      }
      const f = new Uint8Array(h.buffer, m, p);
      n = new TextDecoder().decode(f);
    } else if (o === "BOOLEAN") {
      const m = d + s, p = Math.floor(m / 8), f = m % 8;
      n = (h[p] >> f & 1) === 1;
    }
    return n;
  }
  // Reads the data for the given table index
  getPropertyValue(e, t, s = null) {
    if (t >= this.count)
      throw new Error("PropertyTableAccessor: Requested index is outside the range of the table.");
    const n = this.properties[e];
    if (n) {
      if (!this.definition.properties[e])
        return n.resolveDefault(s);
    } else throw new Error("PropertyTableAccessor: Requested property does not exist.");
    const i = n.array, r = this.data, o = n.getArrayLengthFromId(r, t);
    if (s = n.shapeToProperty(s, o), i)
      for (let a = 0, c = s.length; a < c; a++)
        s[a] = this._readValueAtIndex(e, t, a, s[a]);
    else
      s = this._readValueAtIndex(e, t, 0, s);
    return s = n.adjustValueScaleOffset(s), s = n.resolveEnumsToStrings(s), s = n.resolveNoData(s), s;
  }
}
const De = /* @__PURE__ */ new bi();
class Os {
  constructor() {
    this._renderer = new gi(), this._target = new xs(1, 1), this._texTarget = new xs(), this._quad = new wn(new yi({
      blending: _i,
      blendDst: Ti,
      blendSrc: xi,
      uniforms: {
        map: { value: null },
        pixel: { value: new Q() }
      },
      vertexShader: (
        /* glsl */
        `
				void main() {

					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}
			`
      ),
      fragmentShader: (
        /* glsl */
        `
				uniform sampler2D map;
				uniform ivec2 pixel;

				void main() {

					gl_FragColor = texelFetch( map, pixel, 0 );

				}
			`
      )
    }));
  }
  // increases the width of the target render target to support more data
  increaseSizeTo(e) {
    this._target.setSize(Math.max(this._target.width, e), 1);
  }
  // read data from the rendered texture asynchronously
  readDataAsync(e) {
    const { _renderer: t, _target: s } = this;
    return t.readRenderTargetPixelsAsync(s, 0, 0, e.length / 4, 1, e);
  }
  // read data from the rendered texture
  readData(e) {
    const { _renderer: t, _target: s } = this;
    t.readRenderTargetPixels(s, 0, 0, e.length / 4, 1, e);
  }
  // render a single pixel from the source at the destination point on the render target
  // takes the texture, pixel to read from, and pixel to render in to
  renderPixelToTarget(e, t, s) {
    const { _renderer: n, _target: i } = this;
    De.min.copy(t), De.max.copy(t), De.max.x += 1, De.max.y += 1, n.initRenderTarget(i), n.copyTextureToTexture(e, i.texture, De, s, 0);
  }
}
const ye = /* @__PURE__ */ new class {
  constructor() {
    let l = null;
    Object.getOwnPropertyNames(Os.prototype).forEach((e) => {
      e !== "constructor" && (this[e] = (...t) => (l = l || new Os(), l[e](...t)));
    });
  }
}(), Us = /* @__PURE__ */ new Q(), Vs = /* @__PURE__ */ new Q(), Ns = /* @__PURE__ */ new Q();
function fr(l, e) {
  return e === 0 ? l.getAttribute("uv") : l.getAttribute(`uv${e}`);
}
function Gn(l, e, t = new Array(3)) {
  let s = 3 * e, n = 3 * e + 1, i = 3 * e + 2;
  return l.index && (s = l.index.getX(s), n = l.index.getX(n), i = l.index.getX(i)), t[0] = s, t[1] = n, t[2] = i, t;
}
function zn(l, e, t, s, n) {
  const [i, r, o] = s, a = fr(l, e);
  Us.fromBufferAttribute(a, i), Vs.fromBufferAttribute(a, r), Ns.fromBufferAttribute(a, o), n.set(0, 0, 0).addScaledVector(Us, t.x).addScaledVector(Vs, t.y).addScaledVector(Ns, t.z);
}
function Hn(l, e, t, s) {
  const n = l.x - Math.floor(l.x), i = l.y - Math.floor(l.y), r = Math.floor(n * e % e), o = Math.floor(i * t % t);
  return s.set(r, o), s;
}
const Fs = /* @__PURE__ */ new Q(), ks = /* @__PURE__ */ new Q(), Gs = /* @__PURE__ */ new Q();
class pr extends Et {
  constructor(e, t, s = null) {
    super(e, t, s), this.channels = j(s, "channels", [0]), this.index = j(s, "index", null), this.texCoord = j(s, "texCoord", null), this.valueLength = parseInt(this.type.replace(/[^0-9]/g, "")) || 1;
  }
  // takes the buffer to read from and the value index to read
  readDataFromBuffer(e, t, s = null) {
    const n = this.type;
    if (n === "BOOLEAN" || n === "STRING")
      throw new Error("PropertyTextureAccessor: BOOLEAN and STRING types not supported.");
    return kn(e, t * this.valueLength, n, s);
  }
}
class mr extends ds {
  constructor(...e) {
    super(...e), this.isPropertyTextureAccessor = !0, this._asyncRead = !1, this._initProperties(pr);
  }
  // Reads the full set of property data
  getData(e, t, s, n = {}) {
    const i = this.properties;
    yt(i, n);
    const r = Object.keys(i), o = r.map((a) => n[a]);
    return this.getPropertyValuesAtTexel(r, e, t, s, o), r.forEach((a, c) => n[a] = o[c]), n;
  }
  // Reads the full set of property data asynchronously
  async getDataAsync(e, t, s, n = {}) {
    const i = this.properties;
    yt(i, n);
    const r = Object.keys(i), o = r.map((a) => n[a]);
    return await this.getPropertyValuesAtTexelAsync(r, e, t, s, o), r.forEach((a, c) => n[a] = o[c]), n;
  }
  // Reads values asynchronously
  getPropertyValuesAtTexelAsync(...e) {
    this._asyncRead = !0;
    const t = this.getPropertyValuesAtTexel(...e);
    return this._asyncRead = !1, t;
  }
  // Reads values from the textures synchronously
  getPropertyValuesAtTexel(e, t, s, n, i = []) {
    for (; i.length < e.length; ) i.push(null);
    i.length = e.length, ye.increaseSizeTo(i.length);
    const r = this.data, o = this.definition.properties, a = this.properties, c = Gn(n, t);
    for (let d = 0, m = e.length; d < m; d++) {
      const p = e[d];
      if (!o[p])
        continue;
      const f = a[p], g = r[f.index];
      zn(n, f.texCoord, s, c, Fs), Hn(Fs, g.image.width, g.image.height, ks), Gs.set(d, 0), ye.renderPixelToTarget(g, ks, Gs);
    }
    const u = new Uint8Array(e.length * 4);
    if (this._asyncRead)
      return ye.readDataAsync(u).then(() => (h.call(this), i));
    return ye.readData(u), h.call(this), i;
    function h() {
      for (let d = 0, m = e.length; d < m; d++) {
        const p = e[d], f = a[p], g = f.type;
        if (i[d] = hs(f, i[d]), f) {
          if (!o[p]) {
            i[d] = f.resolveDefault(i);
            continue;
          }
        } else throw new Error("PropertyTextureAccessor: Requested property does not exist.");
        const y = f.valueLength * (f.count || 1), x = f.channels.map((M) => u[4 * d + M]), T = f.componentType, b = Ye(T, g), S = new b(y);
        if (new Uint8Array(S.buffer).set(x), f.array) {
          const M = i[d];
          for (let C = 0, I = M.length; C < I; C++)
            M[C] = f.readDataFromBuffer(S, C, M[C]);
        } else
          i[d] = f.readDataFromBuffer(S, 0, i[d]);
        i[d] = f.adjustValueScaleOffset(i[d]), i[d] = f.resolveEnumsToStrings(i[d]), i[d] = f.resolveNoData(i[d]);
      }
    }
  }
  // dispose all of the texture data used
  dispose() {
    this.data.forEach((e) => {
      e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
    });
  }
}
class zs {
  constructor(e, t, s, n = null, i = null) {
    const {
      schema: r,
      propertyTables: o = [],
      propertyTextures: a = [],
      propertyAttributes: c = []
    } = e, { enums: u, classes: h } = r, d = o.map((f) => new dr(f, h, u, s));
    let m = [], p = [];
    n && (n.propertyTextures && (m = n.propertyTextures.map((f) => new mr(a[f], h, u, t))), n.propertyAttributes && (p = n.propertyAttributes.map((f) => new ur(c[f], h, u)))), this.schema = r, this.tableAccessors = d, this.textureAccessors = m, this.attributeAccessors = p, this.object = i, this.textures = t, this.nodeMetadata = n;
  }
  // Property Tables
  /**
   * Returns data from one or more property tables. Pass a single table index and row ID to
   * get one object, or parallel arrays of table indices and row IDs to get an array of
   * results. Each returned object conforms to the structure class referenced in the schema.
   * @param {number|Array<number>} tableIndices Table index or array of table indices.
   * @param {number|Array<number>} ids Row ID or array of row IDs.
   * @param {Object|Array|null} [target=null] Optional target object or array to write into.
   * @returns {Object|Array}
   */
  getPropertyTableData(e, t, s = null) {
    if (!Array.isArray(e))
      s = s || {}, s = this.tableAccessors[e].getData(t, s);
    else {
      s = s || [];
      const n = Math.min(e.length, t.length);
      s.length = n;
      for (let i = 0; i < n; i++) {
        const r = this.tableAccessors[e[i]];
        s[i] = r.getData(t[i], s[i]);
      }
    }
    if (Array.isArray(e) !== Array.isArray(s) || Array.isArray(e) !== Array.isArray(t))
      throw new Error("StructuralMetadata: Scalar and array inputs cannot be mixed.");
    return s;
  }
  /**
   * Returns name and class information for one or more property tables. Defaults to all
   * tables when `tableIndices` is `null`.
   * @param {Array<number>|null} [tableIndices=null]
   * @returns {Array<{name: string, className: string}>|{name: string, className: string}}
   */
  getPropertyTableInfo(e = null) {
    if (e === null && (e = this.tableAccessors.map((t, s) => s)), Array.isArray(e))
      return e.map((t) => {
        const s = this.tableAccessors[t];
        return {
          name: s.name,
          className: s.definition.class
        };
      });
    {
      const t = this.tableAccessors[e];
      return {
        name: t.name,
        className: t.definition.class
      };
    }
  }
  // Property Textures
  /**
   * Returns data from property textures at the given point on the mesh. Takes the triangle
   * index and barycentric coordinate from a raycast result. See `MeshFeatures.getFeatures`
   * for how to obtain these values.
   * @param {number} triangle Triangle index from a raycast hit.
   * @param {Vector3} barycoord Barycentric coordinate of the hit point.
   * @param {Array} [target=[]] Optional target array to write into.
   * @returns {Array}
   */
  getPropertyTextureData(e, t, s = []) {
    const n = this.textureAccessors;
    s.length = n.length;
    for (let i = 0; i < n.length; i++) {
      const r = n[i];
      s[i] = r.getData(e, t, this.object.geometry, s[i]);
    }
    return s;
  }
  /**
   * Returns the same data as `getPropertyTextureData` but performs texture reads
   * asynchronously.
   * @param {number} triangle Triangle index from a raycast hit.
   * @param {Vector3} barycoord Barycentric coordinate of the hit point.
   * @param {Array} [target=[]] Optional target array to write into.
   * @returns {Array}
   */
  async getPropertyTextureDataAsync(e, t, s = []) {
    const n = this.textureAccessors;
    s.length = n.length;
    const i = [];
    for (let r = 0; r < n.length; r++) {
      const a = n[r].getDataAsync(e, t, this.object.geometry, s[r]).then((c) => {
        s[r] = c;
      });
      i.push(a);
    }
    return await Promise.all(i), s;
  }
  /**
   * Returns information about the property texture accessors, including their class names
   * and per-property channel/texcoord mappings.
   * @returns {Array<{name: string, className: string, properties: Object}>}
   */
  getPropertyTextureInfo() {
    return this.textureAccessors;
  }
  // Property Attributes
  /**
   * Returns data stored as property attributes for the given vertex index.
   * @param {number} attributeIndex Vertex index.
   * @param {Array} [target=[]] Optional target array to write into.
   * @returns {Array}
   */
  getPropertyAttributeData(e, t = []) {
    const s = this.attributeAccessors;
    t.length = s.length;
    for (let n = 0; n < s.length; n++) {
      const i = s[n];
      t[n] = i.getData(e, this.object.geometry, t[n]);
    }
    return t;
  }
  /**
   * Returns name and class information for all property attribute accessors.
   * @returns {Array<{name: string, className: string}>}
   */
  getPropertyAttributeInfo() {
    return this.attributeAccessors.map((e) => ({
      name: e.name,
      className: e.definition.class
    }));
  }
  /**
   * Disposes all texture, table, and attribute accessors.
   */
  dispose() {
    this.textureAccessors.forEach((e) => e.dispose()), this.tableAccessors.forEach((e) => e.dispose()), this.attributeAccessors.forEach((e) => e.dispose());
  }
}
const Oe = "EXT_structural_metadata";
function gr(l, e = []) {
  var n;
  const t = ((n = l.json.textures) == null ? void 0 : n.length) || 0, s = new Array(t).fill(null);
  return e.forEach(({ properties: i }) => {
    for (const r in i) {
      const { index: o } = i[r];
      s[o] === null && (s[o] = l.loadTexture(o));
    }
  }), Promise.all(s);
}
function yr(l, e = []) {
  var n;
  const t = ((n = l.json.bufferViews) == null ? void 0 : n.length) || 0, s = new Array(t).fill(null);
  return e.forEach(({ properties: i }) => {
    for (const r in i) {
      const { values: o, arrayOffsets: a, stringOffsets: c } = i[r];
      s[o] === null && (s[o] = l.loadBufferView(o)), s[a] === null && (s[a] = l.loadBufferView(a)), s[c] === null && (s[c] = l.loadBufferView(c));
    }
  }), Promise.all(s);
}
class xr {
  constructor(e) {
    this.parser = e, this.name = Oe;
  }
  async afterRoot({ scene: e, parser: t }) {
    const s = t.json.extensionsUsed;
    if (!s || !s.includes(Oe))
      return;
    let n = null, i = t.json.extensions[Oe];
    if (i.schemaUri) {
      const { manager: c, path: u, requestHeader: h, crossOrigin: d } = t.options, m = new URL(i.schemaUri, u).toString(), p = new Si(c);
      p.setCrossOrigin(d), p.setResponseType("json"), p.setRequestHeader(h), n = p.loadAsync(m).then((f) => {
        i = { ...i, schema: f };
      });
    }
    const [r, o] = await Promise.all([
      gr(t, i.propertyTextures),
      yr(t, i.propertyTables),
      n
    ]), a = new zs(i, r, o);
    e.userData.structuralMetadata = a, e.traverse((c) => {
      var u;
      if (t.associations.has(c)) {
        const { meshes: h, primitives: d } = t.associations.get(c), m = (u = t.json.meshes[h]) == null ? void 0 : u.primitives[d];
        if (m && m.extensions && m.extensions[Oe]) {
          const p = m.extensions[Oe];
          c.userData.structuralMetadata = new zs(i, r, o, p, c);
        } else
          c.userData.structuralMetadata = a;
      }
    });
  }
}
const Hs = /* @__PURE__ */ new Q(), Ys = /* @__PURE__ */ new Q(), js = /* @__PURE__ */ new Q();
function Tr(l) {
  return l.x > l.y && l.x > l.z ? 0 : l.y > l.z ? 1 : 2;
}
class _r {
  constructor(e, t, s) {
    this.geometry = e, this.textures = t, this.data = s, this._asyncRead = !1, this.featureIds = s.featureIds.map((n) => {
      const { texture: i, ...r } = n, o = {
        label: null,
        propertyTable: null,
        nullFeatureId: null,
        ...r
      };
      return i && (o.texture = {
        texCoord: 0,
        channels: [0],
        ...i
      }), o;
    });
  }
  /**
   * Returns an indexed list of all textures used by features in the extension.
   * @returns {Array<Texture>}
   */
  getTextures() {
    return this.textures;
  }
  /**
   * Returns the feature ID info for each feature set defined on this primitive.
   * @returns {Array<FeatureInfo>}
   */
  getFeatureInfo() {
    return this.featureIds;
  }
  /**
   * Performs the same function as `getFeatures` but reads texture data asynchronously.
   * @param {number} triangle Triangle index from a raycast hit.
   * @param {Vector3} barycoord Barycentric coordinate of the hit point.
   * @returns {Promise<Array<number|null>>}
   */
  getFeaturesAsync(...e) {
    this._asyncRead = !0;
    const t = this.getFeatures(...e);
    return this._asyncRead = !1, t;
  }
  /**
   * Returns the list of feature IDs at the given point on the mesh. Takes the triangle
   * index from a raycast result and a barycentric coordinate. Results are indexed in the
   * same order as the feature info returned by `getFeatureInfo()`.
   * @param {number} triangle Triangle index from a raycast hit.
   * @param {Vector3} barycoord Barycentric coordinate of the hit point.
   * @returns {Array<number|null>}
   */
  getFeatures(e, t) {
    const { geometry: s, textures: n, featureIds: i } = this, r = new Array(i.length).fill(null), o = i.length;
    ye.increaseSizeTo(o);
    const a = Gn(s, e), c = a[Tr(t)];
    for (let d = 0, m = i.length; d < m; d++) {
      const p = i[d], f = "nullFeatureId" in p ? p.nullFeatureId : null;
      if ("texture" in p) {
        const g = n[p.texture.index];
        zn(s, p.texture.texCoord, t, a, Hs), Hn(Hs, g.image.width, g.image.height, Ys), js.set(d, 0), ye.renderPixelToTarget(n[p.texture.index], Ys, js);
      } else if ("attribute" in p) {
        const y = s.getAttribute(`_feature_id_${p.attribute}`).getX(c);
        y !== f && (r[d] = y);
      } else {
        const g = c;
        g !== f && (r[d] = g);
      }
    }
    const u = new Uint8Array(o * 4);
    if (this._asyncRead)
      return ye.readDataAsync(u).then(() => (h(), r));
    return ye.readData(u), h(), r;
    function h() {
      const d = new Uint32Array(1);
      for (let m = 0, p = i.length; m < p; m++) {
        const f = i[m], g = "nullFeatureId" in f ? f.nullFeatureId : null;
        if ("texture" in f) {
          const { channels: y } = f.texture, x = y.map((b) => u[4 * m + b]);
          new Uint8Array(d.buffer).set(x);
          const T = d[0];
          T !== g && (r[m] = T);
        }
      }
    }
  }
  /**
   * Disposes all textures used by this instance.
   */
  dispose() {
    this.textures.forEach((e) => {
      e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
    });
  }
}
const xt = "EXT_mesh_features";
function Ws(l, e, t) {
  l.traverse((s) => {
    var n;
    if (e.associations.has(s)) {
      const { meshes: i, primitives: r } = e.associations.get(s), o = (n = e.json.meshes[i]) == null ? void 0 : n.primitives[r];
      o && o.extensions && o.extensions[xt] && t(s, o.extensions[xt]);
    }
  });
}
class br {
  constructor(e) {
    this.parser = e, this.name = xt;
  }
  async afterRoot({ scene: e, parser: t }) {
    var o;
    const s = t.json.extensionsUsed;
    if (!s || !s.includes(xt))
      return;
    const n = ((o = t.json.textures) == null ? void 0 : o.length) || 0, i = new Array(n).fill(null);
    Ws(e, t, (a, { featureIds: c }) => {
      c.forEach((u) => {
        if (u.texture && i[u.texture.index] === null) {
          const h = u.texture.index;
          i[h] = t.loadTexture(h);
        }
      });
    });
    const r = await Promise.all(i);
    Ws(e, t, (a, c) => {
      a.userData.meshFeatures = new _r(a.geometry, r, c);
    });
  }
}
class Sr {
  constructor() {
    this.name = "CESIUM_RTC";
  }
  afterRoot(e) {
    if (e.parser.json.extensions && e.parser.json.extensions.CESIUM_RTC) {
      const { center: t } = e.parser.json.extensions.CESIUM_RTC;
      t && (e.scene.position.x += t[0], e.scene.position.y += t[1], e.scene.position.z += t[2]);
    }
  }
}
class ko {
  constructor(e) {
    e = {
      metadata: !0,
      rtc: !0,
      plugins: [],
      dracoLoader: null,
      ktxLoader: null,
      meshoptDecoder: null,
      autoDispose: !0,
      ...e
    }, this.tiles = null, this.metadata = e.metadata, this.rtc = e.rtc, this.plugins = e.plugins, this.dracoLoader = e.dracoLoader, this.ktxLoader = e.ktxLoader, this.meshoptDecoder = e.meshoptDecoder, this._gltfRegex = /\.(gltf|glb)$/g, this._dracoRegex = /\.drc$/g, this._loader = null;
  }
  init(e) {
    const t = new Vi(e.manager);
    this.dracoLoader && (t.setDRACOLoader(this.dracoLoader), e.manager.addHandler(this._dracoRegex, this.dracoLoader)), this.ktxLoader && t.setKTX2Loader(this.ktxLoader), this.meshoptDecoder && t.setMeshoptDecoder(this.meshoptDecoder), this.rtc && t.register(() => new Sr()), this.metadata && (t.register(() => new xr()), t.register(() => new br())), this.plugins.forEach((s) => t.register(s)), e.manager.addHandler(this._gltfRegex, t), this.tiles = e, this._loader = t;
  }
  dispose() {
    this.tiles.manager.removeHandler(this._gltfRegex), this.tiles.manager.removeHandler(this._dracoRegex), this.autoDispose && (this.ktxLoader.dispose(), this.dracoLoader.dispose());
  }
}
const Je = /* @__PURE__ */ new he();
class Go {
  constructor(e) {
    e = {
      up: "+z",
      recenter: !0,
      lat: null,
      lon: null,
      height: 0,
      azimuth: 0,
      elevation: 0,
      roll: 0,
      ...e
    }, this.tiles = null, this.up = e.up.toLowerCase().replace(/\s+/, ""), this.lat = e.lat, this.lon = e.lon, this.height = e.height, this.azimuth = e.azimuth, this.elevation = e.elevation, this.roll = e.roll, this.recenter = e.recenter, this._callback = null;
  }
  init(e) {
    this.tiles = e, this._callback = () => {
      const { up: t, lat: s, lon: n, height: i, azimuth: r, elevation: o, roll: a, recenter: c } = this;
      if (s !== null && n !== null)
        this.transformLatLonHeightToOrigin(s, n, i, r, o, a);
      else {
        const { ellipsoid: u } = e, h = Math.min(...u.radius);
        if (e.getBoundingSphere(Je), Je.center.length() > h * 0.5) {
          const d = {};
          u.getPositionToCartographic(Je.center, d), this.transformLatLonHeightToOrigin(d.lat, d.lon, d.height);
        } else {
          const d = e.group;
          switch (d.rotation.set(0, 0, 0), t) {
            case "x":
            case "+x":
              d.rotation.z = Math.PI / 2;
              break;
            case "-x":
              d.rotation.z = -Math.PI / 2;
              break;
            case "y":
            case "+y":
              break;
            case "-y":
              d.rotation.z = Math.PI;
              break;
            case "z":
            case "+z":
              d.rotation.x = -Math.PI / 2;
              break;
            case "-z":
              d.rotation.x = Math.PI / 2;
              break;
          }
          e.group.position.copy(Je.center).applyEuler(d.rotation).multiplyScalar(-1);
        }
      }
      c || e.group.position.setScalar(0), e.removeEventListener("load-root-tileset", this._callback);
    }, e.addEventListener("load-root-tileset", this._callback), e.root && this._callback();
  }
  /**
   * Centers the tileset such that the given coordinates are positioned at the origin
   * with X facing west and Z facing north.
   * @param {number} lat Latitude in radians.
   * @param {number} lon Longitude in radians.
   * @param {number} [height=0] Height in metres above the ellipsoid surface.
   * @param {number} [azimuth=0] Azimuth rotation in radians.
   * @param {number} [elevation=0] Elevation rotation in radians.
   * @param {number} [roll=0] Roll rotation in radians.
   */
  transformLatLonHeightToOrigin(e, t, s = 0, n = 0, i = 0, r = 0) {
    const { group: o, ellipsoid: a } = this.tiles;
    a.getObjectFrame(e, t, s, n, i, r, o.matrix, Bi), o.matrix.invert().decompose(o.position, o.quaternion, o.scale), o.updateMatrixWorld();
  }
  dispose() {
    const { group: e } = this.tiles;
    e.position.setScalar(0), e.quaternion.identity(), e.scale.set(1, 1, 1), this.tiles.removeEventListener("load-root-tileset", this._callback);
  }
}
class zo {
  set delay(e) {
    this.deferCallbacks.delay = e;
  }
  get delay() {
    return this.deferCallbacks.delay;
  }
  set bytesTarget(e) {
    this.lruCache.minBytesSize = e;
  }
  get bytesTarget() {
    return this.lruCache.minBytesSize;
  }
  /**
   * The number of bytes currently uploaded to the GPU for rendering. Compare to
   * `lruCache.cachedBytes` which reports all downloaded bytes including those not
   * yet on the GPU.
   * @type {number}
   */
  get estimatedGpuBytes() {
    return this.lruCache.cachedBytes;
  }
  constructor(e = {}) {
    const {
      delay: t = 0,
      bytesTarget: s = 0
    } = e;
    this.name = "UNLOAD_TILES_PLUGIN", this.tiles = null, this.lruCache = new Ni(), this.deferCallbacks = new Mr(), this.delay = t, this.bytesTarget = s;
  }
  init(e) {
    this.tiles = e;
    const { lruCache: t, deferCallbacks: s } = this, n = (i) => {
      const r = i.engineData.scene;
      e.visibleTiles.has(i) || e.invokeOnePlugin((a) => a.unloadTileFromGPU && a.unloadTileFromGPU(r, i));
    };
    this._onUpdateBefore = () => {
      t.unloadPriorityCallback = e.lruCache.unloadPriorityCallback, t.minSize = 1 / 0, t.maxSize = 1 / 0, t.maxBytesSize = 1 / 0, t.unloadPercent = 1, t.autoMarkUnused = !1;
    }, this._onVisibilityChangeCallback = ({ tile: i, scene: r, visible: o }) => {
      o ? (t.add(i, n), t.setMemoryUsage(i, e.calculateBytesUsed(i, r) || 1), e.markTileUsed(i), s.cancel(i)) : s.run(i);
    }, this._onDisposeModel = ({ tile: i }) => {
      t.remove(i), s.cancel(i);
    }, s.callback = (i) => {
      t.markUnused(i), t.scheduleUnload();
    }, e.forEachLoadedModel((i, r) => {
      const o = e.visibleTiles.has(r);
      this._onVisibilityChangeCallback({ tile: r, visible: o });
    }), e.addEventListener("tile-visibility-change", this._onVisibilityChangeCallback), e.addEventListener("update-before", this._onUpdateBefore), e.addEventListener("dispose-model", this._onDisposeModel);
  }
  unloadTileFromGPU(e, t) {
    e && e.traverse((s) => {
      if (s.material) {
        const n = s.material;
        n.dispose();
        for (const i in n) {
          const r = n[i];
          r && r.isTexture && r.dispose();
        }
      }
      s.geometry && s.geometry.dispose();
    });
  }
  dispose() {
    const { lruCache: e, tiles: t, deferCallbacks: s } = this;
    t.removeEventListener("tile-visibility-change", this._onVisibilityChangeCallback), t.removeEventListener("update-before", this._onUpdateBefore), t.removeEventListener("dispose-model", this._onDisposeModel), s.cancelAll(), e.minBytesSize = 0, e.minSize = 0, e.maxSize = 0, e.markAllUnused(), e.scheduleUnload();
  }
}
class Mr {
  constructor(e = () => {
  }) {
    this.map = /* @__PURE__ */ new Map(), this.callback = e, this.delay = 0;
  }
  run(e) {
    const { map: t, delay: s } = this;
    if (t.has(e))
      throw new Error("DeferCallbackManager: Callback already initialized.");
    s === 0 ? this.callback(e) : t.set(e, setTimeout(() => {
      this.callback(e), t.delete(e);
    }, s));
  }
  cancel(e) {
    const { map: t } = this;
    t.has(e) && (clearTimeout(t.get(e)), t.delete(e));
  }
  cancelAll() {
    this.map.forEach((e, t) => {
      this.cancel(t);
    });
  }
}
const { clamp: Ft } = _;
class Cr {
  constructor() {
    this.duration = 250, this.fadeCount = 0, this._lastTick = -1, this._fadeState = /* @__PURE__ */ new Map(), this.onFadeComplete = null, this.onFadeStart = null, this.onFadeSetComplete = null, this.onFadeSetStart = null;
  }
  // delete the object from the fade, reset the material data
  deleteObject(e) {
    e && this.completeFade(e);
  }
  // Ensure we're storing a fade timer for the provided object
  // Returns whether a new state had to be added
  guaranteeState(e) {
    const t = this._fadeState;
    if (t.has(e))
      return !1;
    const s = {
      fadeInTarget: 0,
      fadeOutTarget: 0,
      fadeIn: 0,
      fadeOut: 0
    };
    return t.set(e, s), !0;
  }
  // Force the fade to complete in the direction it is already trending
  completeFade(e) {
    const t = this._fadeState;
    if (!t.has(e))
      return;
    const s = t.get(e).fadeOutTarget === 0;
    t.delete(e), this.fadeCount--, this.onFadeComplete && this.onFadeComplete(e, s), this.fadeCount === 0 && this.onFadeSetComplete && this.onFadeSetComplete();
  }
  completeAllFades() {
    this._fadeState.forEach((e, t) => {
      this.completeFade(t);
    });
  }
  forEachObject(e) {
    this._fadeState.forEach((t, s) => {
      e(s, t);
    });
  }
  // Fade the object in
  fadeIn(e) {
    const t = this.guaranteeState(e), s = this._fadeState.get(e);
    s.fadeInTarget = 1, s.fadeOutTarget = 0, s.fadeOut = 0, t && (this.fadeCount++, this.fadeCount === 1 && this.onFadeSetStart && this.onFadeSetStart(), this.onFadeStart && this.onFadeStart(e));
  }
  // Fade the object out
  fadeOut(e) {
    const t = this.guaranteeState(e), s = this._fadeState.get(e);
    s.fadeOutTarget = 1, t && (s.fadeInTarget = 1, s.fadeIn = 1, this.fadeCount++, this.fadeCount === 1 && this.onFadeSetStart && this.onFadeSetStart(), this.onFadeStart && this.onFadeStart(e));
  }
  isFading(e) {
    return this._fadeState.has(e);
  }
  isFadingOut(e) {
    const t = this._fadeState.get(e);
    return t && t.fadeOutTarget === 1;
  }
  // Tick the fade timer for each actively fading object
  update() {
    const e = window.performance.now();
    this._lastTick === -1 && (this._lastTick = e);
    const t = Ft((e - this._lastTick) / this.duration, 0, 1);
    this._lastTick = e, this._fadeState.forEach((n, i) => {
      const {
        fadeOutTarget: r,
        fadeInTarget: o
      } = n;
      let {
        fadeOut: a,
        fadeIn: c
      } = n;
      const u = Math.sign(o - c);
      c = Ft(c + u * t, 0, 1);
      const h = Math.sign(r - a);
      a = Ft(a + h * t, 0, 1), n.fadeIn = c, n.fadeOut = a, ((a === 1 || a === 0) && (c === 1 || c === 0) || a >= c) && this.completeFade(i);
    });
  }
}
const kt = Symbol("FADE_PARAMS");
function Yn(l, e) {
  if (l[kt])
    return l[kt];
  const t = {
    fadeIn: { value: 0 },
    fadeOut: { value: 0 },
    fadeTexture: { value: null }
  };
  return l[kt] = t, l.defines = {
    ...l.defines || {},
    FEATURE_FADE: 0
  }, l.onBeforeCompile = (s) => {
    e && e(s), s.uniforms = {
      ...s.uniforms,
      ...t
    }, s.vertexShader = s.vertexShader.replace(
      /void\s+main\(\)\s+{/,
      (n) => (
        /* glsl */
        `
					#ifdef USE_BATCHING_FRAG

					varying float vBatchId;

					#endif

					${n}

						#ifdef USE_BATCHING_FRAG

						// add 0.5 to the value to avoid floating error that may cause flickering
						vBatchId = getIndirectIndex( gl_DrawID ) + 0.5;

						#endif
				`
      )
    ), s.fragmentShader = s.fragmentShader.replace(/void main\(/, (n) => (
      /* glsl */
      `
				#if FEATURE_FADE

				// adapted from https://www.shadertoy.com/view/Mlt3z8
				float bayerDither2x2( vec2 v ) {

					return mod( 3.0 * v.y + 2.0 * v.x, 4.0 );

				}

				float bayerDither4x4( vec2 v ) {

					vec2 P1 = mod( v, 2.0 );
					vec2 P2 = floor( 0.5 * mod( v, 4.0 ) );
					return 4.0 * bayerDither2x2( P1 ) + bayerDither2x2( P2 );

				}

				// the USE_BATCHING define is not available in fragment shaders
				#ifdef USE_BATCHING_FRAG

				// functions for reading the fade state of a given batch id
				uniform sampler2D fadeTexture;
				varying float vBatchId;
				vec2 getFadeValues( const in float i ) {

					int size = textureSize( fadeTexture, 0 ).x;
					int j = int( i );
					int x = j % size;
					int y = j / size;
					return texelFetch( fadeTexture, ivec2( x, y ), 0 ).rg;

				}

				#else

				uniform float fadeIn;
				uniform float fadeOut;

				#endif

				#endif

				${n}
			`
    )).replace(/#include <dithering_fragment>/, (n) => (
      /* glsl */
      `

				${n}

				#if FEATURE_FADE

				#ifdef USE_BATCHING_FRAG

				vec2 fadeValues = getFadeValues( vBatchId );
				float fadeIn = fadeValues.r;
				float fadeOut = fadeValues.g;

				#endif

				float bayerValue = bayerDither4x4( floor( mod( gl_FragCoord.xy, 4.0 ) ) );
				float bayerBins = 16.0;
				float dither = ( 0.5 + bayerValue ) / bayerBins;
				if ( dither >= fadeIn ) {

					discard;

				}

				if ( dither < fadeOut ) {

					discard;

				}

				#endif

			`
    ));
  }, t;
}
class vr {
  constructor() {
    this._fadeParams = /* @__PURE__ */ new WeakMap(), this.fading = 0;
  }
  // Set the fade parameters for the given scene
  setFade(e, t, s) {
    if (!e)
      return;
    const n = this._fadeParams;
    e.traverse((i) => {
      const r = i.material;
      if (r && n.has(r)) {
        const o = n.get(r);
        o.fadeIn.value = t, o.fadeOut.value = s;
        const u = +(!(t === 0 || t === 1) || !(s === 0 || s === 1));
        r.defines.FEATURE_FADE !== u && (this.fading += u === 1 ? 1 : -1, r.defines.FEATURE_FADE = u, r.needsUpdate = !0);
      }
    });
  }
  // initialize materials in the object
  prepareScene(e) {
    e.traverse((t) => {
      t.material && this.prepareMaterial(t.material);
    });
  }
  // delete the object from the fade, reset the material data
  deleteScene(e) {
    if (!e)
      return;
    this.setFade(e, 1, 0);
    const t = this._fadeParams;
    e.traverse((s) => {
      const n = s.material;
      n && t.delete(n);
    });
  }
  // initialize the material
  prepareMaterial(e) {
    const t = this._fadeParams;
    t.has(e) || t.set(e, Yn(e, e.onBeforeCompile));
  }
}
class Lr {
  constructor(e, t = new ce()) {
    this.other = e, this.material = t, this.visible = !0, this.parent = null, this._instanceInfo = [], this._visibilityChanged = !0;
    const s = new Proxy(this, {
      get(n, i) {
        if (i in n)
          return n[i];
        {
          const r = e[i];
          return r instanceof Function ? (...o) => (n.syncInstances(), r.call(s, ...o)) : e[i];
        }
      },
      set(n, i, r) {
        return i in n ? n[i] = r : e[i] = r, !0;
      },
      deleteProperty(n, i) {
        return i in n ? delete n[i] : delete e[i];
      }
      // ownKeys() {},
      // has(target, key) {},
      // defineProperty(target, key, descriptor) {},
      // getOwnPropertyDescriptor(target, key) {},
    });
    return s;
  }
  syncInstances() {
    const e = this._instanceInfo, t = this.other._instanceInfo;
    for (; t.length > e.length; ) {
      const s = e.length;
      e.push(new Proxy({ visible: !1 }, {
        get(n, i) {
          return i in n ? n[i] : t[s][i];
        },
        set(n, i, r) {
          return i in n ? n[i] = r : t[s][i] = r, !0;
        }
      }));
    }
  }
}
class Er extends Lr {
  constructor(...e) {
    super(...e);
    const t = this.material, s = Yn(t, t.onBeforeCompile);
    t.defines.FEATURE_FADE = 1, t.defines.USE_BATCHING_FRAG = 1, t.needsUpdate = !0, this.fadeTexture = null, this._fadeParams = s;
  }
  // Set the fade state
  setFadeAt(e, t, s) {
    this._initFadeTexture(), this.fadeTexture.setValueAt(e, t * 255, s * 255);
  }
  // initialize the texture and resize it if needed
  _initFadeTexture() {
    let e = Math.sqrt(this._maxInstanceCount);
    e = Math.ceil(e);
    const t = e * e * 2, s = this.fadeTexture;
    if (!s || s.image.data.length !== t) {
      const n = new Uint8Array(t), i = new Ar(n, e, e, bn, Sn);
      if (s) {
        s.dispose();
        const r = s.image.data, o = this.fadeTexture.image.data, a = Math.min(r.length, o.length);
        o.set(new r.constructor(r.buffer, 0, a));
      }
      this.fadeTexture = i, this._fadeParams.fadeTexture.value = i, i.needsUpdate = !0;
    }
  }
  // dispose the fade texture. Super cannot be used here due to proxy
  dispose() {
    this.fadeTexture && this.fadeTexture.dispose();
  }
}
class Ar extends os {
  setValueAt(e, ...t) {
    const { data: s, width: n, height: i } = this.image, r = Math.floor(s.length / (n * i));
    let o = !1;
    for (let a = 0; a < r; a++) {
      const c = e * r + a, u = s[c], h = t[a] || 0;
      u !== h && (s[c] = h, o = !0);
    }
    o && (this.needsUpdate = !0);
  }
}
const qs = Symbol("HAS_POPPED_IN"), Xs = /* @__PURE__ */ new A(), $s = /* @__PURE__ */ new A(), Qs = /* @__PURE__ */ new Cn(), Zs = /* @__PURE__ */ new Cn(), Ks = /* @__PURE__ */ new A();
function Ir() {
  const l = this._fadeManager, e = this.tiles;
  this._fadingBefore = l.fadeCount, this._displayActiveTiles = e.displayActiveTiles, e.displayActiveTiles = !0;
}
function wr() {
  const l = this._fadeManager, e = this._fadeMaterialManager, t = this._displayActiveTiles, s = this._fadingBefore, n = this._prevCameraTransforms, { tiles: i, maximumFadeOutTiles: r, batchedMesh: o } = this, { cameras: a } = i;
  i.displayActiveTiles = t, l.update();
  const c = l.fadeCount;
  if (s !== 0 && c !== 0 && (i.dispatchEvent({ type: "fade-change" }), i.dispatchEvent({ type: "needs-render" })), t || i.visibleTiles.forEach((u) => {
    const h = u.engineData.scene;
    h && (h.visible = u.traversal.inFrustum), this.forEachBatchIds(u, (d, m, p) => {
      m.setVisibleAt(d, u.traversal.inFrustum), p.batchedMesh.setVisibleAt(d, u.traversal.inFrustum);
    });
  }), r < this._fadingOutCount) {
    let u = !0;
    a.forEach((h) => {
      if (!n.has(h))
        return;
      const d = h.matrixWorld, m = n.get(h);
      d.decompose($s, Zs, Ks), m.decompose(Xs, Qs, Ks);
      const p = Zs.angleTo(Qs), f = $s.distanceTo(Xs);
      u = u && (p > 0.25 || f > 0.1);
    }), u && l.completeAllFades();
  }
  if (a.forEach((u) => {
    n.get(u).copy(u.matrixWorld);
  }), l.forEachObject((u, { fadeIn: h, fadeOut: d }) => {
    const m = u.engineData.scene, p = l.isFadingOut(u);
    i.markTileUsed(u), m && (e.setFade(m, h, d), p && (m.visible = !0)), this.forEachBatchIds(u, (f, g, y) => {
      g.setFadeAt(f, h, d), g.setVisibleAt(f, !0), y.batchedMesh.setVisibleAt(f, !1);
    });
  }), o) {
    const u = i.getPluginByName("BATCHED_TILES_PLUGIN").batchedMesh.material;
    o.material.map = u.map;
  }
}
class Ho {
  get fadeDuration() {
    return this._fadeManager.duration;
  }
  set fadeDuration(e) {
    this._fadeManager.duration = Number(e);
  }
  get fadingTiles() {
    return this._fadeManager.fadeCount;
  }
  constructor(e) {
    e = {
      maximumFadeOutTiles: 50,
      fadeRootTiles: !1,
      fadeDuration: 250,
      ...e
    }, this.name = "FADE_TILES_PLUGIN", this.priority = -2, this.tiles = null, this.batchedMesh = null, this._quickFadeTiles = /* @__PURE__ */ new Set(), this._fadeManager = new Cr(), this._fadeMaterialManager = new vr(), this._prevCameraTransforms = null, this._fadingOutCount = 0, this.maximumFadeOutTiles = e.maximumFadeOutTiles, this.fadeRootTiles = e.fadeRootTiles, this.fadeDuration = e.fadeDuration;
  }
  init(e) {
    this._onLoadModel = ({ scene: n }) => {
      this._fadeMaterialManager.prepareScene(n);
    }, this._onDisposeModel = ({ tile: n, scene: i }) => {
      this.tiles.visibleTiles.has(n) && this._quickFadeTiles.add(n.parent), this._fadeManager.deleteObject(n), this._fadeMaterialManager.deleteScene(i);
    }, this._onAddCamera = ({ camera: n }) => {
      this._prevCameraTransforms.set(n, new se());
    }, this._onDeleteCamera = ({ camera: n }) => {
      this._prevCameraTransforms.delete(n);
    }, this._onTileVisibilityChange = ({ tile: n, visible: i }) => {
      const r = n.engineData.scene;
      r && (r.visible = !0), this.forEachBatchIds(n, (o, a, c) => {
        a.setFadeAt(o, 0, 0), a.setVisibleAt(o, !1), c.batchedMesh.setVisibleAt(o, !1);
      });
    }, this._onUpdateBefore = () => {
      Ir.call(this);
    }, this._onUpdateAfter = () => {
      wr.call(this);
    }, e.addEventListener("load-model", this._onLoadModel), e.addEventListener("dispose-model", this._onDisposeModel), e.addEventListener("add-camera", this._onAddCamera), e.addEventListener("delete-camera", this._onDeleteCamera), e.addEventListener("update-before", this._onUpdateBefore), e.addEventListener("update-after", this._onUpdateAfter), e.addEventListener("tile-visibility-change", this._onTileVisibilityChange);
    const t = this._fadeManager;
    t.onFadeSetStart = () => {
      e.dispatchEvent({ type: "fade-start" }), e.dispatchEvent({ type: "needs-render" });
    }, t.onFadeSetComplete = () => {
      e.dispatchEvent({ type: "fade-end" }), e.dispatchEvent({ type: "needs-render" });
    }, t.onFadeComplete = (n, i) => {
      this._fadeMaterialManager.setFade(n.engineData.scene, 0, 0), this.forEachBatchIds(n, (r, o, a) => {
        o.setFadeAt(r, 0, 0), o.setVisibleAt(r, !1), a.batchedMesh.setVisibleAt(r, i);
      }), i || (e.invokeOnePlugin((r) => r !== this && r.setTileVisible && r.setTileVisible(n, !1)), this._fadingOutCount--);
    };
    const s = /* @__PURE__ */ new Map();
    e.cameras.forEach((n) => {
      s.set(n, new se());
    }), e.forEachLoadedModel((n, i) => {
      this._onLoadModel({ scene: n });
    }), this.tiles = e, this._fadeManager = t, this._prevCameraTransforms = s;
  }
  // initializes the batched mesh if it needs to be, dispose if it it's no longer needed
  initBatchedMesh() {
    var t;
    const e = (t = this.tiles.getPluginByName("BATCHED_TILES_PLUGIN")) == null ? void 0 : t.batchedMesh;
    if (e) {
      if (this.batchedMesh === null) {
        this._onBatchedMeshDispose = () => {
          this.batchedMesh.dispose(), this.batchedMesh.removeFromParent(), this.batchedMesh = null, e.removeEventListener("dispose", this._onBatchedMeshDispose);
        };
        const s = e.material.clone();
        s.onBeforeCompile = e.material.onBeforeCompile, this.batchedMesh = new Er(e, s), this.tiles.group.add(this.batchedMesh);
      }
    } else
      this.batchedMesh !== null && (this._onBatchedMeshDispose(), this._onBatchedMeshDispose = null);
  }
  // callback for fading to prevent tiles from being removed until the fade effect has completed
  setTileVisible(e, t) {
    const s = this._fadeManager, n = s.isFading(e);
    if (s.isFadingOut(e) && this._fadingOutCount--, t ? e.internal.depthFromRenderedParent === 1 ? ((e[qs] || this.fadeRootTiles) && this._fadeManager.fadeIn(e), e[qs] = !0) : this._fadeManager.fadeIn(e) : (this._fadingOutCount++, s.fadeOut(e)), this._quickFadeTiles.has(e) && (this._fadeManager.completeFade(e), this._quickFadeTiles.delete(e)), n)
      return !0;
    const i = this._fadeManager.isFading(e);
    return !!(!t && i);
  }
  dispose() {
    const e = this.tiles;
    this._fadeManager.completeAllFades(), this.batchedMesh !== null && this._onBatchedMeshDispose(), e.removeEventListener("load-model", this._onLoadModel), e.removeEventListener("dispose-model", this._onDisposeModel), e.removeEventListener("add-camera", this._onAddCamera), e.removeEventListener("delete-camera", this._onDeleteCamera), e.removeEventListener("update-before", this._onUpdateBefore), e.removeEventListener("update-after", this._onUpdateAfter), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChange), e.forEachLoadedModel((t, s) => {
      this._fadeManager.deleteObject(s), t && (t.visible = !0);
    });
  }
  // helper for iterating over the batch ids for a given tile
  forEachBatchIds(e, t) {
    if (this.initBatchedMesh(), this.batchedMesh) {
      const s = this.tiles.getPluginByName("BATCHED_TILES_PLUGIN"), n = s.getTileBatchIds(e);
      n && n.forEach((i) => {
        t(i, this.batchedMesh, s);
      });
    }
  }
}
const Gt = /* @__PURE__ */ new se(), Js = /* @__PURE__ */ new A(), en = /* @__PURE__ */ new A();
class Pr extends Mi {
  constructor(...e) {
    super(...e), this.resetDistance = 1e4, this._matricesTextureHandle = null, this._lastCameraPos = new se(), this._forceUpdate = !0, this._matrices = [];
  }
  setMatrixAt(e, t) {
    super.setMatrixAt(e, t), this._forceUpdate = !0;
    const s = this._matrices;
    for (; s.length <= e; )
      s.push(new se());
    s[e].copy(t);
  }
  setInstanceCount(...e) {
    super.setInstanceCount(...e);
    const t = this._matrices;
    for (; t.length > this.instanceCount; )
      t.pop();
  }
  onBeforeRender(e, t, s, n, i, r) {
    super.onBeforeRender(e, t, s, n, i, r), Js.setFromMatrixPosition(s.matrixWorld), en.setFromMatrixPosition(this._lastCameraPos);
    const o = this._matricesTexture;
    let a = this._modelViewMatricesTexture;
    if ((!a || a.image.width !== o.image.width || a.image.height !== o.image.height) && (a && a.dispose(), a = o.clone(), a.source = new Ci({
      ...a.image,
      data: a.image.data.slice()
    }), this._modelViewMatricesTexture = a), this._forceUpdate || Js.distanceTo(en) > this.resetDistance) {
      const c = this._matrices, u = a.image.data;
      for (let h = 0; h < this.maxInstanceCount; h++) {
        const d = c[h];
        d ? Gt.copy(d) : Gt.identity(), Gt.premultiply(this.matrixWorld).premultiply(s.matrixWorldInverse).toArray(u, h * 16);
      }
      a.needsUpdate = !0, this._lastCameraPos.copy(s.matrixWorld), this._forceUpdate = !1;
    }
    this._matricesTextureHandle = this._matricesTexture, this._matricesTexture = this._modelViewMatricesTexture, this.matrixWorld.copy(this._lastCameraPos);
  }
  onAfterRender() {
    this.updateMatrixWorld(), this._matricesTexture = this._matricesTextureHandle, this._matricesTextureHandle = null;
  }
  onAfterShadow(e, t, s, n, i, r) {
    this.onAfterRender(e, null, n, i, r);
  }
  dispose() {
    super.dispose(), this._modelViewMatricesTexture && this._modelViewMatricesTexture.dispose();
  }
}
const ie = /* @__PURE__ */ new ue(), et = [];
class Rr extends Pr {
  constructor(...e) {
    super(...e), this.expandPercent = 0.25, this.maxInstanceExpansionSize = 1 / 0, this._freeGeometryIds = [];
  }
  // Finds a free id that can fit the geometry with the requested ranges. Returns -1 if it could not be found.
  findFreeId(e, t, s) {
    const n = !!this.geometry.index, i = Math.max(n ? e.index.count : -1, s), r = Math.max(e.attributes.position.count, t);
    let o = -1, a = 1 / 0;
    const c = this._freeGeometryIds;
    if (c.forEach((u, h) => {
      const d = this.getGeometryRangeAt(u), { reservedIndexCount: m, reservedVertexCount: p } = d;
      if (m >= i && p >= r) {
        const f = i - m + (r - p);
        f < a && (o = h, a = f);
      }
    }), o !== -1) {
      const u = c[o];
      return c.splice(o, 1), u;
    } else
      return -1;
  }
  // Overrides addGeometry to find an option geometry slot, expand, or optimized if needed
  addGeometry(e, t, s) {
    const n = !!this.geometry.index;
    s = Math.max(n ? e.index.count : -1, s), t = Math.max(e.attributes.position.count, t);
    const { expandPercent: i, _freeGeometryIds: r } = this;
    let o = this.findFreeId(e, t, s);
    if (o !== -1)
      this.setGeometryAt(o, e);
    else {
      const a = () => {
        const h = this.unusedVertexCount < t, d = this.unusedIndexCount < s;
        return h || d;
      }, c = e.index, u = e.attributes.position;
      if (t = Math.max(t, u.count), s = Math.max(s, c ? c.count : 0), a() && (r.forEach((h) => this.deleteGeometry(h)), r.length = 0, this.optimize(), a())) {
        const h = this.geometry.index, d = this.geometry.attributes.position;
        let m, p;
        if (h) {
          const f = Math.ceil(i * h.count);
          m = Math.max(f, s, c.count) + h.count;
        } else
          m = Math.max(this.unusedIndexCount, s);
        if (d) {
          const f = Math.ceil(i * d.count);
          p = Math.max(f, t, u.count) + d.count;
        } else
          p = Math.max(this.unusedVertexCount, t);
        this.setGeometrySize(p, m);
      }
      o = super.addGeometry(e, t, s);
    }
    return o;
  }
  // add an instance and automatically expand the number of instances if necessary
  addInstance(e) {
    if (this.maxInstanceCount === this.instanceCount) {
      const t = Math.ceil(this.maxInstanceCount * (1 + this.expandPercent));
      this.setInstanceCount(Math.min(t, this.maxInstanceExpansionSize));
    }
    return super.addInstance(e);
  }
  // delete an instance, keeping note that the geometry id is now unused
  deleteInstance(e) {
    const t = this.getGeometryIdAt(e);
    return t !== -1 && this._freeGeometryIds.push(t), super.deleteInstance(e);
  }
  // add a function for raycasting per tile
  raycastInstance(e, t, s) {
    const n = this.geometry, i = this.getGeometryIdAt(e);
    ie.material = this.material, ie.geometry.index = n.index, ie.geometry.attributes = n.attributes;
    const r = this.getGeometryRangeAt(i);
    ie.geometry.setDrawRange(r.start, r.count), ie.geometry.boundingBox === null && (ie.geometry.boundingBox = new Mt()), ie.geometry.boundingSphere === null && (ie.geometry.boundingSphere = new he()), this.getMatrixAt(e, ie.matrixWorld).premultiply(this.matrixWorld), this.getBoundingBoxAt(i, ie.geometry.boundingBox), this.getBoundingSphereAt(i, ie.geometry.boundingSphere), ie.raycast(t, et);
    for (let o = 0, a = et.length; o < a; o++) {
      const c = et[o];
      c.object = this, c.batchId = e, s.push(c);
    }
    et.length = 0;
  }
}
function Br(l) {
  return l.r === 1 && l.g === 1 && l.b === 1;
}
function Dr(l) {
  l.needsUpdate = !0, l.onBeforeCompile = (e) => {
    e.vertexShader = e.vertexShader.replace(
      "#include <common>",
      /* glsl */
      `
				#include <common>
				varying float texture_index;
				`
    ).replace(
      "#include <uv_vertex>",
      /* glsl */
      `
				#include <uv_vertex>
				texture_index = getIndirectIndex( gl_DrawID );
				`
    ), e.fragmentShader = e.fragmentShader.replace(
      "#include <map_pars_fragment>",
      /* glsl */
      `
				#ifdef USE_MAP
				precision highp sampler2DArray;
				uniform sampler2DArray map;
				varying float texture_index;
				#endif
				`
    ).replace(
      "#include <map_fragment>",
      /* glsl */
      `
				#ifdef USE_MAP
					diffuseColor *= texture( map, vec3( vMapUv, texture_index ) );
				#endif
				`
    );
  };
}
const zt = new wn(new ce()), ts = new os(new Uint8Array([255, 255, 255, 255]), 1, 1);
ts.needsUpdate = !0;
class Yo {
  constructor(e = {}) {
    if (parseInt(vi) < 170)
      throw new Error("BatchedTilesPlugin: Three.js revision 170 or higher required.");
    e = {
      instanceCount: 500,
      vertexCount: 750,
      indexCount: 2e3,
      expandPercent: 0.25,
      maxInstanceCount: 1 / 0,
      discardOriginalContent: !0,
      textureSize: null,
      material: null,
      renderer: null,
      ...e
    }, this.name = "BATCHED_TILES_PLUGIN", this.priority = -1;
    const t = e.renderer.getContext();
    this.instanceCount = e.instanceCount, this.vertexCount = e.vertexCount, this.indexCount = e.indexCount, this.material = e.material ? e.material.clone() : null, this.expandPercent = e.expandPercent, this.maxInstanceCount = Math.min(e.maxInstanceCount, t.getParameter(t.MAX_3D_TEXTURE_SIZE)), this.renderer = e.renderer, this.discardOriginalContent = e.discardOriginalContent, this.textureSize = e.textureSize, this.batchedMesh = null, this.arrayTarget = null, this.tiles = null, this._tileToInstanceId = /* @__PURE__ */ new Map();
  }
  init(e) {
    this.tiles = e;
  }
  initTextureArray(e) {
    if (this.arrayTarget !== null || e.material.map === null)
      return;
    const { instanceCount: t, renderer: s, textureSize: n, batchedMesh: i } = this, r = e.material.map, o = {
      colorSpace: r.colorSpace,
      wrapS: r.wrapS,
      wrapT: r.wrapT,
      wrapR: r.wrapS,
      // TODO: Generating mipmaps for the volume every time a new texture is added is extremely slow
      // generateMipmaps: map.generateMipmaps,
      // minFilter: map.minFilter,
      magFilter: r.magFilter
    }, a = new Ts(n || r.image.width, n || r.image.height, t);
    Object.assign(a.texture, o), s.initRenderTarget(a), i.material.map = a.texture, this.arrayTarget = a, this._tileToInstanceId.forEach((c) => {
      c.forEach((u) => {
        this.assignTextureToLayer(ts, u);
      });
    });
  }
  // init the batched mesh if it's not ready
  initBatchedMesh(e) {
    if (this.batchedMesh !== null)
      return;
    const { instanceCount: t, vertexCount: s, indexCount: n, tiles: i } = this, r = this.material ? this.material : new e.material.constructor(), o = new Rr(t, t * s, t * n, r);
    o.name = "BatchTilesPlugin", o.frustumCulled = !1, i.group.add(o), o.updateMatrixWorld(), Dr(o.material), this.batchedMesh = o;
  }
  setTileVisible(e, t) {
    const s = e.engineData.scene;
    if (t && this.addSceneToBatchedMesh(s, e), this._tileToInstanceId.has(e)) {
      this._tileToInstanceId.get(e).forEach((r) => {
        this.batchedMesh.setVisibleAt(r, t);
      });
      const i = this.tiles;
      return t ? i.visibleTiles.add(e) : i.visibleTiles.delete(e), i.dispatchEvent({
        type: "tile-visibility-change",
        scene: s,
        tile: e,
        visible: t
      }), !0;
    }
    return !1;
  }
  disposeTile(e) {
    this.removeSceneFromBatchedMesh(e);
  }
  unloadTileFromGPU(e, t) {
    return !this.discardOriginalContent && this._tileToInstanceId.has(t) ? (this.removeSceneFromBatchedMesh(t), !0) : !1;
  }
  // render the given into the given layer
  assignTextureToLayer(e, t) {
    if (!this.arrayTarget)
      return;
    this.expandArrayTargetIfNeeded();
    const { renderer: s } = this, n = s.getRenderTarget();
    s.setRenderTarget(this.arrayTarget, t), zt.material.map = e, zt.render(s), s.setRenderTarget(n), zt.material.map = null, e.dispose();
  }
  // check if the array texture target needs to be expanded
  expandArrayTargetIfNeeded() {
    const { batchedMesh: e, arrayTarget: t, renderer: s } = this, n = Math.min(e.maxInstanceCount, this.maxInstanceCount);
    if (n > t.depth) {
      const i = {
        colorSpace: t.texture.colorSpace,
        wrapS: t.texture.wrapS,
        wrapT: t.texture.wrapT,
        generateMipmaps: t.texture.generateMipmaps,
        minFilter: t.texture.minFilter,
        magFilter: t.texture.magFilter
      }, r = new Ts(t.width, t.height, n);
      Object.assign(r.texture, i), s.initRenderTarget(r), s.copyTextureToTexture(t.texture, r.texture), t.dispose(), e.material.map = r.texture, this.arrayTarget = r;
    }
  }
  removeSceneFromBatchedMesh(e) {
    if (this._tileToInstanceId.has(e)) {
      const t = this._tileToInstanceId.get(e);
      this._tileToInstanceId.delete(e), t.forEach((s) => {
        this.batchedMesh.deleteInstance(s);
      });
    }
  }
  addSceneToBatchedMesh(e, t) {
    if (this._tileToInstanceId.has(t))
      return;
    const s = [];
    e.traverse((r) => {
      r.isMesh && s.push(r);
    });
    let n = !0;
    s.forEach((r) => {
      if (this.batchedMesh && n) {
        const o = r.geometry.attributes, a = this.batchedMesh.geometry.attributes;
        for (const c in a)
          if (!(c in o)) {
            n = !1;
            return;
          }
      }
    });
    const i = !this.batchedMesh || this.batchedMesh.instanceCount + s.length <= this.maxInstanceCount;
    if (n && i) {
      e.updateMatrixWorld();
      const r = [];
      this._tileToInstanceId.set(t, r), s.forEach((o) => {
        this.initBatchedMesh(o), this.initTextureArray(o);
        const { geometry: a, material: c } = o, { batchedMesh: u, expandPercent: h } = this;
        u.expandPercent = h;
        const d = u.addGeometry(a, this.vertexCount, this.indexCount), m = u.addInstance(d);
        r.push(m), u.setMatrixAt(m, o.matrixWorld), u.setVisibleAt(m, !1), Br(c.color) || (c.color.setHSL(Math.random(), 0.5, 0.5), u.setColorAt(m, c.color));
        const p = c.map;
        p ? this.assignTextureToLayer(p, m) : this.assignTextureToLayer(ts, m);
      }), this.discardOriginalContent && (t.engineData.textures.forEach((o) => {
        o.image instanceof ImageBitmap && o.image.close();
      }), t.engineData.scene = null, t.engineData.materials = [], t.engineData.geometries = [], t.engineData.textures = []);
    }
  }
  // Override raycasting per tile to defer to the batched mesh
  raycastTile(e, t, s, n) {
    return this._tileToInstanceId.has(e) ? (this._tileToInstanceId.get(e).forEach((r) => {
      this.batchedMesh.raycastInstance(r, s, n);
    }), !0) : !1;
  }
  dispose() {
    const { arrayTarget: e, batchedMesh: t } = this;
    e && e.dispose(), t && (t.material.dispose(), t.geometry.dispose(), t.dispose(), t.removeFromParent());
  }
  getTileBatchIds(e) {
    return this._tileToInstanceId.get(e);
  }
}
const Ht = /* @__PURE__ */ new he(), tt = /* @__PURE__ */ new A(), Ue = /* @__PURE__ */ new se(), tn = /* @__PURE__ */ new se(), Yt = /* @__PURE__ */ new Li(), Or = /* @__PURE__ */ new ce({ side: dt }), sn = /* @__PURE__ */ new Mt(), jt = 1e5;
function nn(l, e) {
  return l.isBufferGeometry ? (l.boundingSphere === null && l.computeBoundingSphere(), e.copy(l.boundingSphere)) : (sn.setFromObject(l), sn.getBoundingSphere(e), e);
}
class jo {
  constructor() {
    this.name = "TILE_FLATTENING_PLUGIN", this.priority = -100, this.tiles = null, this.shapes = /* @__PURE__ */ new Map(), this.positionsMap = /* @__PURE__ */ new Map(), this.positionsUpdated = /* @__PURE__ */ new Set(), this.needsUpdate = !1;
  }
  init(e) {
    this.tiles = e, this.needsUpdate = !0, this._updateBeforeCallback = () => {
      this.needsUpdate && (this._updateTiles(), this.needsUpdate = !1);
    }, this._disposeModelCallback = ({ tile: t }) => {
      this.positionsMap.delete(t), this.positionsUpdated.delete(t);
    }, e.addEventListener("update-before", this._updateBeforeCallback), e.addEventListener("dispose-model", this._disposeModelCallback);
  }
  // update tile flattening state if it has not been made visible, yet
  setTileActive(e, t) {
    t && !this.positionsUpdated.has(e) && this._updateTile(e);
  }
  _updateTile(e) {
    const { positionsUpdated: t, positionsMap: s, shapes: n, tiles: i } = this;
    t.add(e);
    const r = e.engineData.scene;
    if (s.has(e)) {
      const o = s.get(e);
      r.traverse((a) => {
        if (a.geometry) {
          const c = o.get(a.geometry);
          c && (a.geometry.attributes.position.array.set(c), a.geometry.attributes.position.needsUpdate = !0);
        }
      });
    } else {
      const o = /* @__PURE__ */ new Map();
      s.set(e, o), r.traverse((a) => {
        a.geometry && o.set(a.geometry, a.geometry.attributes.position.array.slice());
      });
    }
    r.updateMatrixWorld(!0), r.traverse((o) => {
      const { geometry: a } = o;
      a && (Ue.copy(o.matrixWorld), r.parent !== null && Ue.premultiply(i.group.matrixWorldInverse), tn.copy(Ue).invert(), nn(a, Ht).applyMatrix4(Ue), n.forEach(({
        shape: c,
        direction: u,
        sphere: h,
        thresholdMode: d,
        threshold: m,
        flattenRange: p
      }) => {
        tt.subVectors(Ht.center, h.center), tt.addScaledVector(u, -u.dot(tt));
        const f = (Ht.radius + h.radius) ** 2;
        if (tt.lengthSq() > f)
          return;
        const { position: g } = a.attributes, { ray: y } = Yt;
        y.direction.copy(u).multiplyScalar(-1);
        for (let x = 0, T = g.count; x < T; x++) {
          y.origin.fromBufferAttribute(g, x).applyMatrix4(Ue).addScaledVector(u, jt), Yt.far = jt;
          const b = Yt.intersectObject(c)[0];
          if (b) {
            let S = (jt - b.distance) / m;
            const M = S >= 1;
            (!M || M && d === "flatten") && (S = Math.min(S, 1), b.point.addScaledVector(y.direction, _.mapLinear(S, 0, 1, -p, 0)), b.point.applyMatrix4(tn), g.setXYZ(x, ...b.point));
          }
        }
      }));
    }), this.tiles.dispatchEvent({ type: "needs-render" });
  }
  _updateTiles() {
    this.positionsUpdated.clear(), this.tiles.activeTiles.forEach((e) => this._updateTile(e));
  }
  /**
   * Returns whether the given object has already been added as a shape.
   * @param {Object3D} mesh
   * @returns {boolean}
   */
  hasShape(e) {
    return this.shapes.has(e);
  }
  /**
   * Adds the given mesh as a flattening shape. All coordinates must be in the tileset's local
   * frame. Throws if the shape has already been added.
   * @param {Object3D} mesh The shape mesh to flatten tile vertices onto.
   * @param {Vector3} [direction] Direction to cast rays when flattening (default downward along -Z).
   * @param {Object} [options]
   * @param {number} [options.threshold=Infinity] Maximum distance from the shape surface within which vertices are flattened. `Infinity` always flattens; `0` never flattens.
   */
  addShape(e, t = new A(0, 0, -1), s = {}) {
    if (this.hasShape(e))
      throw new Error("TileFlatteningPlugin: Shape is already used.");
    typeof s == "number" && (console.warn('TileFlatteningPlugin: "addShape" function signature has changed. Please use an options object, instead.'), s = {
      threshold: s
    }), this.needsUpdate = !0;
    const n = e.clone();
    n.updateMatrixWorld(!0), n.traverse((r) => {
      r.material && (r.material = Or);
    });
    const i = nn(n, new he());
    this.shapes.set(e, {
      shape: n,
      direction: t.clone(),
      sphere: i,
      // "flatten": Flattens the vertices above the shape
      // "none": leaves the vertices above the shape as they are
      thresholdMode: "none",
      // only flatten within this range above the object
      threshold: 1 / 0,
      // the range to flatten vertices in to. 0 is completely flat
      // while 0.1 means a 10cm range.
      flattenRange: 0,
      ...s
    });
  }
  /**
   * Notifies the plugin that a shape's geometry or transform has changed and tile
   * flattening needs to be regenerated.
   * @param {Object3D} mesh
   */
  updateShape(e) {
    if (!this.hasShape(e))
      throw new Error("TileFlatteningPlugin: Shape is not present.");
    const { direction: t, threshold: s, thresholdMode: n, flattenRange: i } = this.shapes.get(e);
    this.deleteShape(e), this.addShape(e, t, {
      threshold: s,
      thresholdMode: n,
      flattenRange: i
    });
  }
  /**
   * Removes the given shape and triggers tile regeneration.
   * @param {Object3D} mesh
   * @returns {boolean} `true` if the shape was found and removed.
   */
  deleteShape(e) {
    return this.needsUpdate = !0, this.shapes.delete(e);
  }
  /**
   * Removes all shapes and resets flattened tiles to their original positions.
   */
  clearShapes() {
    this.shapes.size !== 0 && (this.needsUpdate = !0, this.shapes.clear());
  }
  // reset the vertex positions and remove the update callback
  dispose() {
    this.tiles.removeEventListener("before-update", this._updateBeforeCallback), this.tiles.removeEventListener("dispose-model", this._disposeModelCallback), this.positionsMap.forEach((e) => {
      e.forEach((t, s) => {
        const { position: n } = s.attributes;
        n.array.set(t), n.needsUpdate = !0;
      });
    });
  }
}
class Ur extends We {
  constructor(e = {}) {
    const {
      subdomains: t = ["t0"],
      ...s
    } = e;
    super(s), this.subdomains = t, this.subDomainIndex = 0;
  }
  getUrl(e, t, s) {
    return this.url.replace(/{\s*subdomain\s*}/gi, this._getSubdomain()).replace(/{\s*quadkey\s*}/gi, this._tileToQuadKey(e, t, s));
  }
  _tileToQuadKey(e, t, s) {
    let n = "";
    for (let i = s; i > 0; i--) {
      let r = 0;
      const o = 1 << i - 1;
      (e & o) !== 0 && (r += 1), (t & o) !== 0 && (r += 2), n += r.toString();
    }
    return n;
  }
  _getSubdomain() {
    return this.subDomainIndex = (this.subDomainIndex + 1) % this.subdomains.length, this.subdomains[this.subDomainIndex];
  }
}
function xe(l, e, t, s) {
  let [n, i, r, o] = l;
  i += 1e-8, n += 1e-8, o -= 1e-8, r -= 1e-8;
  const a = Math.max(Math.min(e, t.maxLevel), t.minLevel), [c, u, h, d] = t.getTilesInRange(n, i, r, o, a, !0);
  for (let m = c; m <= h; m++)
    for (let p = u; p <= d; p++)
      s(m, p, a);
}
function Vr(l, e, t) {
  const s = new A(), n = {}, i = [], r = l.getAttribute("position");
  l.computeBoundingBox(), l.boundingBox.getCenter(s).applyMatrix4(e), t.getPositionToCartographic(s, n);
  const o = n.lat || 0, a = n.lon || 0;
  let c = 1 / 0, u = 1 / 0, h = 1 / 0, d = -1 / 0, m = -1 / 0, p = -1 / 0;
  for (let y = 0; y < r.count; y++)
    s.fromBufferAttribute(r, y).applyMatrix4(e), t.getPositionToCartographic(s, n), Math.abs(Math.abs(n.lat) - Math.PI / 2) < 1e-5 && (n.lon = a), Math.abs(a - n.lon) > Math.PI && (n.lon += Math.sign(a - n.lon) * Math.PI * 2), Math.abs(o - n.lat) > Math.PI && (n.lat += Math.sign(o - n.lat) * Math.PI * 2), i.push(n.lon, n.lat, n.height), c = Math.min(c, n.lat), d = Math.max(d, n.lat), u = Math.min(u, n.lon), m = Math.max(m, n.lon), h = Math.min(h, n.height), p = Math.max(p, n.height);
  const f = [u, c, m, d], g = [...f, h, p];
  return {
    uv: i,
    range: f,
    region: g
  };
}
function rn(l, e, t = null, s = null, n = null) {
  let i = 1 / 0, r = 1 / 0, o = 1 / 0, a = -1 / 0, c = -1 / 0, u = -1 / 0;
  const h = [], d = new se();
  if (l.forEach((m) => {
    d.copy(m.matrixWorld), t && d.premultiply(t);
    const { uv: p, region: f } = Vr(m.geometry, d, e);
    h.push(p), i = Math.min(i, f[1]), a = Math.max(a, f[3]), r = Math.min(r, f[0]), c = Math.max(c, f[2]), o = Math.min(o, f[4]), u = Math.max(u, f[5]);
  }), s !== null) {
    n === null && (n = s.clampToBounds([r, i, c, a]), n = s.toNormalizedRange(n));
    const [m, p, f, g] = n;
    h.forEach((y) => {
      for (let x = 0, T = y.length; x < T; x += 3) {
        const b = y[x + 0], S = y[x + 1], M = y[x + 2];
        let [C, I] = s.toNormalizedPoint(b, S);
        C = _.clamp(C, 0, 1), I = _.clamp(I, 0, 1), y[x + 0] = _.mapLinear(C, m, f, 0, 1), y[x + 1] = _.mapLinear(I, p, g, 0, 1), y[x + 2] = _.mapLinear(M, o, u, 0, 1);
      }
    });
  }
  return {
    uvs: h,
    range: n,
    region: [r, i, c, a, o, u]
  };
}
function Nr(l, e) {
  const t = new A(), s = [], n = l.getAttribute("position");
  let i = 1 / 0, r = 1 / 0, o = 1 / 0, a = -1 / 0, c = -1 / 0, u = -1 / 0;
  for (let d = 0; d < n.count; d++)
    t.fromBufferAttribute(n, d).applyMatrix4(e), s.push(t.x, t.y, t.z), i = Math.min(i, t.x), a = Math.max(a, t.x), r = Math.min(r, t.y), c = Math.max(c, t.y), o = Math.min(o, t.z), u = Math.max(u, t.z);
  return {
    uv: s,
    range: [i, r, a, c],
    heightRange: [o, u]
  };
}
function Fr(l, e) {
  let t = 1 / 0, s = 1 / 0, n = 1 / 0, i = -1 / 0, r = -1 / 0, o = -1 / 0;
  const a = [], c = new se();
  return l.forEach((u) => {
    c.copy(u.matrixWorld), e && c.premultiply(e);
    const { uv: h, range: d, heightRange: m } = Nr(u.geometry, c);
    a.push(h), t = Math.min(t, d[0]), i = Math.max(i, d[2]), s = Math.min(s, d[1]), r = Math.max(r, d[3]), n = Math.min(n, m[0]), o = Math.max(o, m[1]);
  }), a.forEach((u) => {
    for (let h = 0, d = u.length; h < d; h += 3) {
      const m = u[h + 0], p = u[h + 1];
      u[h + 0] = _.mapLinear(m, t, i, 0, 1), u[h + 1] = _.mapLinear(p, s, r, 0, 1);
    }
  }), {
    uvs: a,
    range: [t, s, i, r],
    heightRange: [n, o]
  };
}
const Wt = Symbol("OVERLAY_PARAMS");
function kr(l, e) {
  if (l[Wt])
    return l[Wt];
  const t = {
    layerMaps: { value: [] },
    layerInfo: { value: [] }
  };
  return l[Wt] = t, l.defines = {
    ...l.defines || {},
    LAYER_COUNT: 0
  }, l.onBeforeCompile = (s) => {
    e && e(s), s.uniforms = {
      ...s.uniforms,
      ...t
    }, s.vertexShader = s.vertexShader.replace(/void main\(\s*\)\s*{/, (n) => (
      /* glsl */
      `

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							attribute vec3 layer_uv_UNROLLED_LOOP_INDEX;
							varying vec3 v_layer_uv_UNROLLED_LOOP_INDEX;

						#endif


					}
				#pragma unroll_loop_end

				${n}

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							v_layer_uv_UNROLLED_LOOP_INDEX = layer_uv_UNROLLED_LOOP_INDEX;

						#endif

					}
				#pragma unroll_loop_end

			`
    )), s.fragmentShader = s.fragmentShader.replace(/void main\(/, (n) => (
      /* glsl */
      `

				#if LAYER_COUNT != 0
					struct LayerInfo {
						vec3 color;
						float opacity;

						int alphaMask;
						int alphaInvert;
					};

					uniform sampler2D layerMaps[ LAYER_COUNT ];
					uniform LayerInfo layerInfo[ LAYER_COUNT ];
				#endif

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							varying vec3 v_layer_uv_UNROLLED_LOOP_INDEX;

						#endif

					}
				#pragma unroll_loop_end

				${n}

			`
    )).replace(/#include <color_fragment>/, (n) => (
      /* glsl */
      `

				${n}

				#if LAYER_COUNT != 0
				{
					vec4 tint;
					vec3 layerUV;
					float layerOpacity;
					float wOpacity;
					float wDelta;
					#pragma unroll_loop_start
						for ( int i = 0; i < 10; i ++ ) {

							#if UNROLLED_LOOP_INDEX < LAYER_COUNT

								layerUV = v_layer_uv_UNROLLED_LOOP_INDEX;
								tint = texture( layerMaps[ i ], layerUV.xy );

								// discard texture outside 0, 1 on w - offset the stepped value by an epsilon to avoid cases
								// where wDelta is near 0 (eg a flat surface) at the w boundary, resulting in artifacts on some
								// hardware.
								wDelta = max( fwidth( layerUV.z ), 1e-7 );
								wOpacity =
									smoothstep( - wDelta, 0.0, layerUV.z ) *
									smoothstep( 1.0 + wDelta, 1.0, layerUV.z );

								// apply tint & opacity
								tint.rgb *= layerInfo[ i ].color;
								tint.rgba *= layerInfo[ i ].opacity * wOpacity;

								// invert the alpha
								if ( layerInfo[ i ].alphaInvert > 0 ) {

									tint.a = 1.0 - tint.a;

								}

								// apply the alpha across all existing layers if alpha mask is true
								if ( layerInfo[ i ].alphaMask > 0 ) {

									diffuseColor.a *= tint.a;

								} else {

									tint.rgb *= tint.a;
									diffuseColor = tint + diffuseColor * ( 1.0 - tint.a );

								}

							#endif

						}
					#pragma unroll_loop_end
				}
				#endif
			`
    ));
  }, t;
}
class jn {
  constructor() {
    this.canvas = null, this.context = null, this.range = [0, 0, 1, 1];
  }
  // set the target render texture and the range that represents the full span
  setTarget(e, t) {
    this.canvas = e.image, this.context = e.image.getContext("2d"), this.range = [...t];
  }
  // draw the given texture at the given span with the provided projection
  draw(e, t) {
    const { canvas: s, range: n, context: i } = this, { width: r, height: o } = s, { image: a } = e, c = Math.round(_.mapLinear(t[0], n[0], n[2], 0, r)), u = Math.round(_.mapLinear(t[1], n[1], n[3], 0, o)), h = Math.round(_.mapLinear(t[2], n[0], n[2], 0, r)), d = Math.round(_.mapLinear(t[3], n[1], n[3], 0, o)), m = h - c, p = d - u;
    a instanceof ImageBitmap ? (i.save(), i.translate(c, o - u), i.scale(1, -1), i.drawImage(a, 0, 0, m, p), i.restore()) : i.drawImage(a, c, o - u, m, -p);
  }
  // clear the set target
  clear() {
    const { context: e, canvas: t } = this;
    e.clearRect(0, 0, t.width, t.height);
  }
}
const Gr = 1e-10;
function zr(l, e, t = 0) {
  if (l.length !== e.length)
    return !1;
  for (let s = 0, n = l.length; s < n; s++)
    if (Math.abs(l[s] - e[s]) > t)
      return !1;
  return !0;
}
class At extends cs {
  hasContent(...e) {
    return !0;
  }
}
class Wn extends At {
  constructor(e) {
    super(), this.tiledImageSource = e, this.tileComposer = new jn(), this.resolution = 256;
  }
  hasContent(e, t, s, n, i) {
    const r = this.tiledImageSource.tiling;
    let o = 0;
    return xe([e, t, s, n], i, r, () => {
      o++;
    }), o !== 0;
  }
  async fetchItem([e, t, s, n, i], r) {
    const { tiledImageSource: o, tileComposer: a } = this, c = [e, t, s, n], u = o.tiling;
    await this._markImages(c, i, !1);
    let h = null;
    if (xe(c, i, u, (p, f, g) => {
      const y = u.getTileBounds(p, f, g, !0, !1);
      zr(y, c, Gr) && (h = [p, f, g]);
    }), h !== null) {
      const [p, f, g] = h;
      return o.get(p, f, g).clone();
    }
    const d = document.createElement("canvas");
    d.width = this.resolution, d.height = this.resolution;
    const m = new Ct(d);
    return m.colorSpace = St, m.generateMipmaps = !1, a.setTarget(m, c), a.clear(16777215, 0), xe(c, i, u, (p, f, g) => {
      const y = u.getTileBounds(p, f, g, !0, !1), x = o.get(p, f, g);
      a.draw(x, y);
    }), m;
  }
  disposeItem(e, [t, s, n, i, r]) {
    e && e.dispose(), this._markImages([t, s, n, i], r, !0);
  }
  dispose() {
    super.dispose(), this.tiledImageSource.dispose();
  }
  _markImages(e, t, s = !1) {
    const n = this.tiledImageSource, i = n.tiling, r = [];
    xe(e, t, i, (a, c, u) => {
      s ? n.release(a, c, u) : r.push(n.lock(a, c, u));
    });
    const o = r.filter((a) => a instanceof Promise);
    return o.length !== 0 ? Promise.all(o) : null;
  }
}
const Se = Object.freeze({
  fill: "#cccccc",
  stroke: "transparent",
  strokeWidth: 1,
  radius: 2,
  order: 0,
  visible: !0
});
class ft {
  static get DEFAULT_STYLE() {
    return Se;
  }
  get fill() {
    return this._ctx.fillStyle;
  }
  set fill(e) {
    this._ctx.fillStyle = e;
  }
  get stroke() {
    return this._ctx.strokeStyle;
  }
  set stroke(e) {
    this._ctx.strokeStyle = e;
  }
  get strokeWidth() {
    return this._ctx.lineWidth;
  }
  set strokeWidth(e) {
    this._ctx.lineWidth = e;
  }
  constructor(e = {}) {
    const {
      getX: t = (r) => r.x,
      getY: s = (r) => r.y,
      flipY: n = !1,
      tileExtent: i = null
    } = e;
    this.getX = t, this.getY = s, this.flipY = n, this.tileExtent = i, this.radius = Se.radius, this.visible = !0, this._invScale = 1, this._ctx = null;
  }
  // Sets up the canvas transform and clip for a tile.
  // tileBounds and regionBounds are in the same coordinate space as getX/getY returns.
  setFrame(e, t, s) {
    e.restore();
    const [n, i, r, o] = t, [a, c, u, h] = s, { width: d, height: m } = e.canvas, { flipY: p, tileExtent: f } = this, g = f ?? r - n, y = f ?? o - i, x = Math.round(d * (n - a) / (u - a)), T = Math.round(d * (r - a) / (u - a)), b = Math.round(m * (h - o) / (h - c)), S = Math.round(m * (h - i) / (h - c)), M = (T - x) / g, C = (p ? -1 : 1) * (S - b) / y, I = f ? 0 : n, V = f ? 0 : p ? o : i, U = x - I * M, B = b - V * C;
    e.save(), e.setTransform(M, 0, 0, C, U, B), e.beginPath(), e.rect(I, f ? 0 : i, g, y), e.clip(), e.clearRect(I, f ? 0 : i, g, y), this._ctx = e, this._invScale = 1 / M;
  }
  // Applies a style object (as returned by getStyle) to the current canvas context.
  setStyle(e) {
    const { _invScale: t } = this;
    this.fill = (e == null ? void 0 : e.fill) ?? Se.fill, this.stroke = (e == null ? void 0 : e.stroke) ?? Se.stroke, this.strokeWidth = ((e == null ? void 0 : e.strokeWidth) ?? Se.strokeWidth) * t, this.radius = ((e == null ? void 0 : e.radius) ?? Se.radius) * t, this.visible = e ? (e == null ? void 0 : e.visible) ?? Se.visible : !1;
  }
  _renderPoints(e, t = 1) {
    const { _ctx: s, radius: n, getX: i, getY: r, visible: o } = this;
    if (o) {
      for (const a of e)
        for (const c of a) {
          const u = i(c), h = r(c);
          s.beginPath(), s.ellipse(u, h, n / t, n, 0, 0, Math.PI * 2), s.fill();
        }
      s.stroke();
    }
  }
  _renderLines(e) {
    const { _ctx: t, getX: s, getY: n, visible: i } = this;
    if (i) {
      if (e instanceof Path2D) {
        t.stroke(e);
        return;
      }
      t.beginPath();
      for (const r of e)
        for (let o = 0; o < r.length; o++)
          o === 0 ? t.moveTo(s(r[o]), n(r[o])) : t.lineTo(s(r[o]), n(r[o]));
      t.stroke();
    }
  }
  _renderPolygons(e) {
    const { _ctx: t, getX: s, getY: n, visible: i } = this;
    if (i) {
      if (e instanceof Path2D) {
        t.fill(e, "evenodd"), t.stroke(e);
        return;
      }
      t.beginPath();
      for (const r of e) {
        for (let o = 0; o < r.length; o++)
          o === 0 ? t.moveTo(s(r[o]), n(r[o])) : t.lineTo(s(r[o]), n(r[o]));
        t.closePath();
      }
      t.fill("evenodd"), t.stroke();
    }
  }
}
const Hr = /* @__PURE__ */ new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]), qt = /* @__PURE__ */ new A(), st = /* @__PURE__ */ new A();
function Yr(l, e, t) {
  l.getCartographicToPosition(e, t, 0, qt), l.getCartographicToPosition(e + 0.01, t, 0, st);
  const n = qt.distanceTo(st);
  return l.getCartographicToPosition(e, t + 0.01, 0, st), qt.distanceTo(st) / n;
}
class jr extends At {
  constructor({
    geojson: e = null,
    url: t = null,
    // URL or GeoJson object can be provided
    resolution: s = 256,
    pointRadius: n = 6,
    strokeStyle: i = "white",
    strokeWidth: r = 2,
    fillStyle: o = "rgba( 255, 255, 255, 0.5 )",
    getStyle: a = ((u, h) => ({
      fill: h.fillStyle || this.fillStyle,
      stroke: h.strokeStyle || this.strokeStyle,
      strokeWidth: h.strokeWidth || this.strokeWidth,
      radius: h.pointRadius || this.pointRadius
    })),
    ...c
  } = {}) {
    super(c), this.geojson = e, this.url = t, this.resolution = s, this.pointRadius = n, this.strokeStyle = i, this.strokeWidth = r, this.fillStyle = o, this.getStyle = a, this.features = null, this.featureBounds = /* @__PURE__ */ new Map(), this.contentBounds = null, this.projection = new ne(), this.fetchData = (...u) => fetch(...u), this._canvasRenderer = new ft({
      flipY: !0,
      getX: (u) => u[0],
      getY: (u) => u[1]
    });
  }
  async init() {
    const { geojson: e, url: t } = this;
    if (!e && t) {
      const s = await this.fetchData(t);
      this.geojson = await s.json();
    }
    this._updateCache(!0);
  }
  hasContent(e, t, s, n) {
    const i = [e, t, s, n].map((r) => r * Math.RAD2DEG);
    return this._boundsIntersectBounds(i, this.contentBounds);
  }
  // main fetch per region -> returns CanvasTexture
  async fetchItem(e, t) {
    const s = document.createElement("canvas"), n = new Ct(s);
    return n.colorSpace = St, n.generateMipmaps = !1, this._drawToCanvas(s, e), n.needsUpdate = !0, n;
  }
  disposeItem(e) {
    e && e.dispose();
  }
  redraw(...e) {
    const t = this.get(...e);
    t && (this._drawToCanvas(t.image, e), t.needsUpdate = !0);
  }
  _updateCache(e = !1) {
    const { geojson: t, featureBounds: s } = this;
    if (!t || this.features && !e)
      return;
    s.clear();
    let n = 1 / 0, i = 1 / 0, r = -1 / 0, o = -1 / 0;
    this.features = this._featuresFromGeoJSON(t);
    for (const a of this.features) {
      const c = this._getFeatureBounds(a);
      s.set(a, c);
      const [u, h, d, m] = c;
      n = Math.min(n, u), i = Math.min(i, h), r = Math.max(r, d), o = Math.max(o, m);
    }
    this.contentBounds = [n, i, r, o];
  }
  _drawToCanvas(e, t) {
    this._updateCache();
    const [s, n, i, r] = t, { projection: o, resolution: a, features: c, _canvasRenderer: u } = this;
    e.width = a, e.height = a;
    const h = o.convertNormalizedToLongitude(s), d = o.convertNormalizedToLatitude(n), m = o.convertNormalizedToLongitude(i), p = o.convertNormalizedToLatitude(r), f = [
      h * _.RAD2DEG,
      d * _.RAD2DEG,
      m * _.RAD2DEG,
      p * _.RAD2DEG
    ], g = e.getContext("2d");
    u.setFrame(g, f, f);
    for (const y of c)
      this._featureIntersectsTile(y, f) && this._drawFeatureOnCanvas(y, f, a);
  }
  // bounding box quick test in projected units
  _featureIntersectsTile(e, t) {
    const s = this.featureBounds.get(e);
    return s ? this._boundsIntersectBounds(s, t) : !1;
  }
  _boundsIntersectBounds(e, t) {
    const [s, n, i, r] = e, [o, a, c, u] = t;
    return !(i < o || s > c || r < a || n > u);
  }
  _getFeatureBounds(e) {
    const { geometry: t } = e;
    if (!t)
      return null;
    const { type: s, coordinates: n } = t;
    let i = 1 / 0, r = 1 / 0, o = -1 / 0, a = -1 / 0;
    const c = (u, h) => {
      i = Math.min(i, u), o = Math.max(o, u), r = Math.min(r, h), a = Math.max(a, h);
    };
    return s === "Point" ? c(n[0], n[1]) : s === "MultiPoint" || s === "LineString" ? n.forEach((u) => c(u[0], u[1])) : s === "MultiLineString" || s === "Polygon" ? n.forEach((u) => u.forEach((h) => c(h[0], h[1]))) : s === "MultiPolygon" && n.forEach(
      (u) => u.forEach((h) => h.forEach((d) => c(d[0], d[1])))
    ), [i, r, o, a];
  }
  // Normalize top-level geojson into an array of Feature objects
  _featuresFromGeoJSON(e) {
    const t = e.type;
    return t === "FeatureCollection" ? e.features : t === "Feature" ? [e] : t === "GeometryCollection" ? e.geometries.map((s) => ({ type: "Feature", geometry: s, properties: {} })) : Hr.has(t) ? [{ type: "Feature", geometry: e, properties: {} }] : [];
  }
  // draw feature on canvas ( assumes intersects already )
  _drawFeatureOnCanvas(e, t, s) {
    const { geometry: n = null, properties: i = {} } = e;
    if (!n)
      return;
    const [, r, , o] = t, { _canvasRenderer: a } = this, c = this.getStyle(e, i);
    a.setStyle(c);
    const u = n.type;
    if (u === "Point" || u === "MultiPoint") {
      a.radius = c.radius * (o - r) / s;
      const h = u === "Point" ? [n.coordinates] : n.coordinates;
      for (const d of h) {
        const m = Yr(
          Di,
          d[1] * _.DEG2RAD,
          d[0] * _.DEG2RAD
        ), p = [d];
        a._renderPoints([p], m);
      }
    } else u === "LineString" ? a._renderLines([n.coordinates]) : u === "MultiLineString" ? a._renderLines(n.coordinates) : u === "Polygon" ? a._renderPolygons(n.coordinates) : u === "MultiPolygon" && n.coordinates.forEach((h) => a._renderPolygons(h));
  }
}
class qn extends Pe {
  constructor(e = {}) {
    const { url: t = null, ...s } = e;
    super(s), this.url = t, this.format = null, this.stem = null;
  }
  getUrl(e, t, s) {
    return `${this.stem}_files/${s}/${e}_${t}.${this.format}`;
  }
  init() {
    const { url: e } = this;
    return this.fetchData(e, this.fetchOptions).then((t) => t.text()).then((t) => {
      const s = new DOMParser().parseFromString(t, "text/xml");
      if (s.querySelector("DisplayRects") || s.querySelector("Collection"))
        throw new Error("DeepZoomImagesPlugin: DisplayRect and Collection DZI files not supported.");
      const n = s.querySelector("Image"), i = n.querySelector("Size"), r = parseInt(i.getAttribute("Width")), o = parseInt(i.getAttribute("Height")), a = parseInt(n.getAttribute("TileSize")), c = parseInt(n.getAttribute("Overlap")), u = n.getAttribute("Format");
      this.format = u, this.stem = e.split(/\.[^.]+$/g)[0];
      const { tiling: h } = this, d = Math.ceil(Math.log2(Math.max(r, o))) + 1;
      h.flipY = !0, h.pixelOverlap = c, h.generateLevels(d, 1, 1, {
        tilePixelWidth: a,
        tilePixelHeight: a,
        pixelWidth: r,
        pixelHeight: o
      });
    });
  }
}
const Ae = /* @__PURE__ */ new se(), nt = /* @__PURE__ */ new A(), Xt = /* @__PURE__ */ new A(), $t = /* @__PURE__ */ new A(), oe = /* @__PURE__ */ new A(), Wr = /* @__PURE__ */ new Mt(), on = Symbol("SPLIT_TILE_DATA"), it = Symbol("SPLIT_HASH"), rt = Symbol("ORIGINAL_REFINE");
class Wo {
  get enableTileSplitting() {
    return this._enableTileSplitting;
  }
  set enableTileSplitting(e) {
    this._enableTileSplitting !== e && (this._enableTileSplitting = e, this._markNeedsUpdate());
  }
  constructor(e = {}) {
    const {
      overlays: t = [],
      resolution: s = 256,
      enableTileSplitting: n = !0
    } = e;
    this.name = "IMAGE_OVERLAY_PLUGIN", this.priority = -15, this.resolution = s, this._enableTileSplitting = n, this.overlays = [], this.needsUpdate = !1, this.tiles = null, this.tileComposer = null, this.tileControllers = /* @__PURE__ */ new Map(), this.overlayInfo = /* @__PURE__ */ new Map(), this.meshParams = /* @__PURE__ */ new WeakMap(), this.pendingTiles = /* @__PURE__ */ new Map(), this.processedTiles = /* @__PURE__ */ new Set(), this.processQueue = null, this._onUpdateAfter = null, this._onTileDownloadStart = null, this._onTileVisibilityChange = null, this._virtualChildResetId = 0, this._bytesUsed = /* @__PURE__ */ new WeakMap(), t.forEach((i) => {
      this.addOverlay(i);
    });
  }
  // plugin functions
  init(e) {
    const t = new jn(), s = new ls();
    s.maxJobs = 10, s.priorityCallback = (n, i) => {
      const r = n.tile, o = i.tile, a = e.visibleTiles.has(r), c = e.visibleTiles.has(o);
      return a !== c ? a ? 1 : -1 : e.downloadQueue.priorityCallback(r, o);
    }, this.tiles = e, this.tileComposer = t, this.processQueue = s, e.forEachLoadedModel((n, i) => {
      this._processTileModel(n, i, !0);
    }), this._onUpdateAfter = async () => {
      let n = !1;
      if (this.overlayInfo.forEach((i, r) => {
        if (!!r.frame != !!i.frame || r.frame && i.frame && !i.frame.equals(r.frame)) {
          const o = i.order;
          this.deleteOverlay(r), this.addOverlay(r, o), n = !0;
        }
      }), n) {
        const i = s.maxJobs;
        let r = 0;
        s.items.forEach((o) => {
          e.visibleTiles.has(o.tile) && r++;
        }), s.maxJobs = r + s.currJobs, s.tryRunJobs(), s.maxJobs = i, this.needsUpdate = !0;
      }
      if (this.needsUpdate) {
        this.needsUpdate = !1;
        const { overlays: i, overlayInfo: r } = this;
        i.sort((o, a) => r.get(o).order - r.get(a).order), this.processedTiles.forEach((o) => {
          this._updateLayers(o);
        }), this.resetVirtualChildren(!this.enableTileSplitting), e.recalculateBytesUsed(), e.dispatchEvent({ type: "needs-render" });
      }
    }, this._onTileDownloadStart = ({ tile: n, url: i }) => {
      !/\.json$/i.test(i) && !/\.subtree/i.test(i) && (this.processedTiles.add(n), this._initTileOverlayInfo(n));
    }, this._onTileVisibilityChange = ({ tile: n, visible: i }) => {
      this.overlayInfo.forEach(({ tileInfo: r }, o) => {
        const a = r.get(n);
        o.setRegionVisible(a.range, i);
      });
    }, e.addEventListener("update-after", this._onUpdateAfter), e.addEventListener("tile-download-start", this._onTileDownloadStart), e.addEventListener("tile-visibility-change", this._onTileVisibilityChange), this.overlays.forEach((n) => {
      this._initOverlay(n);
    });
  }
  _removeVirtualChildren(e) {
    if (!(rt in e))
      return;
    const { tiles: t } = this, { virtualChildCount: s } = e.internal, n = e.children.length, i = n - s;
    for (let r = i; r < n; r++) {
      const o = e.children[r];
      t.processNodeQueue.remove(o), t.lruCache.remove(o), o.parent = null;
    }
    e.children.length -= s, e.internal.virtualChildCount = 0, e.refine = e[rt], delete e[rt], delete e[it];
  }
  disposeTile(e) {
    const { overlayInfo: t, tileControllers: s, processQueue: n, pendingTiles: i, processedTiles: r } = this;
    r.delete(e), this._removeVirtualChildren(e), s.has(e) && (s.get(e).abort(), s.delete(e), i.delete(e)), t.forEach((({ tileInfo: o }, a) => {
      if (o.has(e)) {
        const { meshInfo: c, range: u } = o.get(e);
        u !== null && a.releaseTexture(u), o.delete(e), c.clear();
      }
    })), n.removeByFilter((o) => o.tile === e);
  }
  calculateBytesUsed(e) {
    const { overlayInfo: t } = this, s = this._bytesUsed;
    let n = null;
    return t.forEach(({ tileInfo: i }, r) => {
      if (i.has(e)) {
        const { target: o } = i.get(e);
        n = n || 0, n += Oi(o);
      }
    }), n !== null ? (s.set(e, n), n) : s.has(e) ? s.get(e) : 0;
  }
  processTileModel(e, t) {
    return this._processTileModel(e, t);
  }
  async _processTileModel(e, t, s = !1) {
    const { tileControllers: n, processedTiles: i, pendingTiles: r } = this;
    n.set(t, new AbortController()), s || r.set(t, e), i.add(t), this._wrapMaterials(e), this._initTileOverlayInfo(t), await this._initTileSceneOverlayInfo(e, t), this.expandVirtualChildren(e, t), this._updateLayers(t), r.delete(t);
  }
  dispose() {
    const { tiles: e } = this;
    [...this.overlays].forEach((s) => {
      this.deleteOverlay(s);
    }), this.processedTiles.forEach((s) => {
      this._updateLayers(s), this.disposeTile(s);
    }), e.removeEventListener("update-after", this._onUpdateAfter), e.removeEventListener("tile-download-start", this._onTileDownloadStart), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChange), this.resetVirtualChildren(!0);
  }
  getAttributions(e) {
    this.overlays.forEach((t) => {
      t.opacity > 0 && t.getAttributions(e);
    });
  }
  parseToMesh(e, t, s, n) {
    if (s === "image_overlay_tile_split")
      return t[on];
  }
  async resetVirtualChildren(e = !1) {
    this._virtualChildResetId++;
    const t = this._virtualChildResetId;
    if (await Promise.all(this.overlays.map((i) => i.whenReady())), t !== this._virtualChildResetId)
      return;
    const { tiles: s } = this, n = [];
    this.processedTiles.forEach((i) => {
      it in i && n.push(i);
    }), n.sort((i, r) => r.internal.depth - i.internal.depth), n.forEach((i) => {
      const r = i.engineData.scene.clone();
      r.updateMatrixWorld(), (e || i[it] !== this._getSplitVectors(r, i).hash) && this._removeVirtualChildren(i);
    }), e || s.forEachLoadedModel((i, r) => {
      this.expandVirtualChildren(i, r);
    });
  }
  _getSplitVectors(e, t, s = Xt) {
    const { tiles: n, overlayInfo: i } = this, r = new Mt();
    r.setFromObject(e), r.getCenter(s);
    const o = [], a = [];
    i.forEach(({ tileInfo: u }, h) => {
      const d = u.get(t);
      if (d && d.target && h.shouldSplit(d.range)) {
        h.frame ? oe.set(0, 0, 1).transformDirection(h.frame) : (n.ellipsoid.getPositionToNormal(s, oe), oe.length() < 1e-6 && oe.set(1, 0, 0));
        const m = `${oe.x.toFixed(3)},${oe.y.toFixed(3)},${oe.z.toFixed(3)}_`;
        a.includes(m) || a.push(m);
        const p = nt.set(0, 0, 1);
        Math.abs(oe.dot(p)) > 1 - 1e-4 && p.set(1, 0, 0);
        const f = new A().crossVectors(oe, p).normalize(), g = new A().crossVectors(oe, f).normalize();
        o.push(f, g);
      }
    });
    const c = [];
    for (; o.length !== 0; ) {
      const u = o.pop().clone(), h = u.clone();
      for (let d = 0; d < o.length; d++) {
        const m = o[d], p = u.dot(m);
        Math.abs(p) > Math.cos(Math.PI / 8) && (h.addScaledVector(m, Math.sign(p)), u.copy(h).normalize(), o.splice(d, 1), d--);
      }
      c.push(h.normalize());
    }
    return { directions: c, hash: a.join("") };
  }
  async expandVirtualChildren(e, t) {
    const { refine: s } = t, n = s === "REPLACE" && t.children.length === 0 || s === "ADD", i = t.internal.virtualChildCount !== 0;
    if (this.enableTileSplitting === !1 || !n || i)
      return;
    const r = e.clone();
    r.updateMatrixWorld();
    const { directions: o, hash: a } = this._getSplitVectors(r, t, Xt);
    if (o.length === 0)
      return;
    t[it] = a;
    const c = new Vn();
    c.attributeList = (h) => !/^layer_uv_\d+/.test(h), o.map((h) => {
      c.addSplitOperation((d, m, p, f, g, y) => (as.getInterpolatedAttribute(d.attributes.position, m, p, f, g, nt), nt.applyMatrix4(y).sub(Xt).dot(h)));
    });
    const u = [];
    c.forEachSplitPermutation(() => {
      const h = c.clipObject(r);
      h.matrix.premultiply(t.engineData.transformInverse).decompose(h.position, h.quaternion, h.scale);
      const d = [];
      if (h.traverse((p) => {
        if (p.isMesh) {
          const f = p.material.clone();
          p.material = f;
          for (const g in f) {
            const y = f[g];
            if (y && y.isTexture && y.source.data instanceof ImageBitmap) {
              const x = document.createElement("canvas");
              x.width = y.image.width, x.height = y.image.height;
              const T = x.getContext("2d");
              T.scale(1, -1), T.drawImage(y.source.data, 0, 0, x.width, -x.height);
              const b = new Ct(x);
              b.mapping = y.mapping, b.wrapS = y.wrapS, b.wrapT = y.wrapT, b.minFilter = y.minFilter, b.magFilter = y.magFilter, b.format = y.format, b.type = y.type, b.anisotropy = y.anisotropy, b.colorSpace = y.colorSpace, b.generateMipmaps = y.generateMipmaps, f[g] = b;
            }
          }
          d.push(p);
        }
      }), d.length === 0)
        return;
      const m = {};
      if (t.boundingVolume.region && (m.region = rn(d, this.tiles.ellipsoid).region), t.boundingVolume.box || t.boundingVolume.sphere) {
        Wr.setFromObject(h, !0).getCenter($t);
        let p = 0;
        h.traverse((f) => {
          const g = f.geometry;
          if (g) {
            const y = g.attributes.position;
            for (let x = 0, T = y.count; x < T; x++) {
              const b = nt.fromBufferAttribute(y, x).applyMatrix4(f.matrixWorld).distanceToSquared($t);
              p = Math.max(p, b);
            }
          }
        }), m.sphere = [...$t, Math.sqrt(p)];
      }
      u.push({
        internal: { isVirtual: !0 },
        refine: "REPLACE",
        geometricError: t.geometricError * 0.5,
        boundingVolume: m,
        content: { uri: "./child.image_overlay_tile_split" },
        children: [],
        [on]: h
      });
    }), t[rt] = t.refine, t.refine = "REPLACE", t.children.push(...u), t.internal.virtualChildCount += u.length;
  }
  fetchData(e, t) {
    if (/image_overlay_tile_split/.test(e))
      return new ArrayBuffer();
  }
  /**
   * Adds an image overlay source to the plugin. The `order` parameter controls the draw
   * order among overlays; lower values are drawn first. If omitted, the overlay is appended
   * after all existing overlays.
   * @param {ImageOverlay} overlay An image overlay instance.
   * @param {number|null} [order=null] Draw order for this overlay.
   */
  addOverlay(e, t = null) {
    const { tiles: s, overlays: n, overlayInfo: i } = this;
    t === null && (t = n.reduce((o, a) => Math.max(o, a.order + 1), 0));
    const r = new AbortController();
    n.push(e), i.set(e, {
      order: t,
      uniforms: {},
      tileInfo: /* @__PURE__ */ new Map(),
      controller: r,
      frame: e.frame ? e.frame.clone() : null
    }), s !== null && this._initOverlay(e);
  }
  /**
   * Updates the draw order for the given overlay.
   * @param {ImageOverlay} overlay The overlay to reorder.
   * @param {number} order New draw order value.
   */
  setOverlayOrder(e, t) {
    this.overlays.indexOf(e) !== -1 && (this.overlayInfo.get(e).order = t, this._markNeedsUpdate());
  }
  /**
   * Removes the given overlay from the plugin.
   * @param {ImageOverlay} overlay The overlay to remove.
   */
  deleteOverlay(e) {
    const { overlays: t, overlayInfo: s, processQueue: n, processedTiles: i } = this, r = t.indexOf(e);
    if (r !== -1) {
      const { tileInfo: o, controller: a } = s.get(e);
      i.forEach((c) => {
        if (!o.has(c))
          return;
        const {
          meshInfo: u,
          range: h
        } = o.get(c);
        h !== null && e.releaseTexture(h), o.delete(c), u.clear();
      }), o.clear(), s.delete(e), a.abort(), n.removeByFilter((c) => c.overlay === e), t.splice(r, 1), i.forEach((c) => {
        this._updateLayers(c);
      }), this._markNeedsUpdate();
    }
  }
  // initialize the overlay to use the right fetch options, load all data for existing tiles
  _initOverlay(e) {
    const { tiles: t } = this;
    e.init().then(() => {
      e.setResolution(this.resolution);
      const i = e.fetch.bind(e);
      e.fetch = (...r) => t.downloadQueue.add({ priority: -performance.now() }, () => i(...r));
    });
    const s = [], n = async (i, r) => {
      this._initTileOverlayInfo(r, e);
      const o = this._initTileSceneOverlayInfo(i, r, e);
      s.push(o), await o, this._updateLayers(r);
    };
    t.forEachLoadedModel((i, r) => {
      n(i, r);
    }), this.pendingTiles.forEach((i, r) => {
      n(i, r);
    }), Promise.all(s).then(() => {
      this._markNeedsUpdate();
    });
  }
  // wrap all materials in the given scene wit the overlay material shader
  _wrapMaterials(e) {
    e.traverse((t) => {
      if (t.material) {
        const s = kr(t.material, t.material.onBeforeCompile);
        this.meshParams.set(t, s);
      }
    });
  }
  // Initialize per-tile overlay information. This function triggers an async function but
  // does not need to be awaited for use since it's just locking textures which are awaited later.
  _initTileOverlayInfo(e, t = this.overlays) {
    if (Array.isArray(t)) {
      t.forEach((i) => this._initTileOverlayInfo(e, i));
      return;
    }
    const { overlayInfo: s } = this;
    if (s.get(t).tileInfo.has(e))
      return;
    const n = {
      range: null,
      target: null,
      meshInfo: /* @__PURE__ */ new Map(),
      failed: !1
    };
    if (s.get(t).tileInfo.set(e, n), t.isReady && !t.isPlanarProjection) {
      if (e.boundingVolume.region) {
        const [i, r, o, a] = e.boundingVolume.region;
        let c = [i, r, o, a];
        c = t.projection.clampToBounds(c), c = t.projection.toNormalizedRange(c), n.range = c, t.lockTexture(c);
      }
    }
  }
  // initialize the scene meshes
  async _initTileSceneOverlayInfo(e, t, s = this.overlays) {
    if (Array.isArray(s))
      return Promise.all(s.map((x) => this._initTileSceneOverlayInfo(e, t, x)));
    const { tiles: n, overlayInfo: i, tileControllers: r } = this, { ellipsoid: o } = n, { controller: a, tileInfo: c } = i.get(s), u = r.get(t);
    if (s.isReady || await s.whenReady(), a.signal.aborted || u.signal.aborted)
      return;
    const h = [];
    e.updateMatrixWorld(), e.traverse((x) => {
      x.isMesh && h.push(x);
    });
    const { aspectRatio: d, projection: m } = s, p = c.get(t);
    let f, g, y;
    if (s.isPlanarProjection) {
      Ae.makeScale(1 / d, 1, 1).multiply(s.frame), e.parent !== null && Ae.multiply(n.group.matrixWorldInverse);
      let x;
      ({ range: f, uvs: g, heightRange: x } = Fr(h, Ae)), y = !(x[0] > 1 || x[1] < 0);
    } else
      Ae.identity(), e.parent !== null && Ae.copy(n.group.matrixWorldInverse), { range: f, uvs: g } = rn(h, o, Ae, m, p.range), y = !0;
    p.range === null && (p.range = f, s.lockTexture(f)), t.traversal.visible && s.setRegionVisible(p.range, !0), y && s.hasContent(f) && await this._fetchTileOverlayTexture(t, s, p), h.forEach((x, T) => {
      const b = new Float32Array(g[T]), S = new K(b, 3);
      p.meshInfo.set(x, { attribute: S });
    });
  }
  // Queues an overlay texture fetch for the given tile, writing the result into info.target.
  // Never throws — failures mark info.failed and dispatch a load-error event instead.
  async _fetchTileOverlayTexture(e, t, s) {
    const { tiles: n, overlayInfo: i, tileControllers: r, processQueue: o } = this, { controller: a } = i.get(t), c = r.get(e), { range: u } = s;
    s.target = await o.add({ tile: e, overlay: t }, async () => {
      if (a.signal.aborted || c.signal.aborted)
        return null;
      const h = await t.getTexture(u);
      return a.signal.aborted || c.signal.aborted ? null : h;
    }).catch((h) => (h instanceof Fi || (s.failed = !0, n.dispatchEvent({ type: "load-error", tile: e, overlay: t, error: h, url: null })), null));
  }
  /**
   * Retries any overlay texture fetches that previously failed. Successfully loaded textures
   * are applied to their tiles without requiring a geometry reload. Pairs with the `load-error`
   * event, which fires on the `TilesRenderer` when an overlay texture fetch fails.
   */
  resetFailedOverlays() {
    const { processedTiles: e, overlayInfo: t, overlays: s } = this, n = [];
    e.forEach((i) => {
      s.forEach((r) => {
        const { tileInfo: o } = t.get(r), a = o.get(i);
        a.failed && (a.failed = !1, r.releaseTexture(a.range), n.push({ tile: i, overlay: r, info: a }));
      });
    }), requestAnimationFrame(() => {
      n.forEach(({ tile: i, overlay: r, info: o }) => {
        r.lockTexture(o.range), this._fetchTileOverlayTexture(i, r, o).then(() => {
          this._updateLayers(i);
        });
      });
    });
  }
  _updateLayers(e) {
    const { overlayInfo: t, overlays: s, tileControllers: n, meshParams: i } = this, r = n.get(e);
    if (this.tiles.recalculateBytesUsed(e), !(!r || r.signal.aborted)) {
      if (s.length === 0) {
        const o = e.engineData && e.engineData.scene;
        o && o.traverse((a) => {
          if (a.material && i.has(a)) {
            const c = i.get(a);
            c.layerMaps.length = 0, c.layerInfo.length = 0, a.material.defines.LAYER_COUNT = 0, a.material.needsUpdate = !0;
          }
        });
        return;
      }
      s.forEach((o, a) => {
        const { tileInfo: c } = t.get(o), { meshInfo: u, target: h } = c.get(e);
        u.forEach(({ attribute: d }, m) => {
          const { geometry: p, material: f } = m, g = i.get(m), y = `layer_uv_${a}`;
          p.getAttribute(y) !== d && (p.setAttribute(y, d), p.dispose()), g.layerMaps.length = s.length, g.layerInfo.length = s.length, g.layerMaps.value[a] = h !== null ? h : null, g.layerInfo.value[a] = o, f.defines[`LAYER_${a}_EXISTS`] = +(h !== null), f.defines[`LAYER_${a}_ALPHA_INVERT`] = Number(o.alphaInvert), f.defines[`LAYER_${a}_ALPHA_MASK`] = Number(o.alphaMask), f.defines.LAYER_COUNT = s.length, f.needsUpdate = !0;
        });
      });
    }
  }
  _markNeedsUpdate() {
    this.needsUpdate === !1 && (this.needsUpdate = !0, this.tiles !== null && this.tiles.dispatchEvent({ type: "needs-update" }));
  }
}
class fs {
  get isPlanarProjection() {
    return !!this.frame;
  }
  constructor(e = {}) {
    const {
      opacity: t = 1,
      color: s = 16777215,
      frame: n = null,
      preprocessURL: i = null,
      alphaMask: r = !1,
      alphaInvert: o = !1
    } = e;
    this.preprocessURL = i, this.opacity = t, this.color = new vn(s), this.frame = n !== null ? n.clone() : null, this.alphaMask = r, this.alphaInvert = o, this._whenReady = null, this.isReady = !1, this.isInitialized = !1, this._visibleRegionCounts = /* @__PURE__ */ new Map();
  }
  init() {
    return this.isInitialized || (this.isInitialized = !0, this._whenReady = this._init().then(() => this.isReady = !0)), this._whenReady;
  }
  whenReady() {
    return this._whenReady;
  }
  // overrideable
  _init() {
    return Promise.resolve();
  }
  fetch(e, t = {}) {
    return this.preprocessURL && (e = this.preprocessURL(e)), fetch(e, t);
  }
  getAttributions(e) {
  }
  hasContent(e, t = null) {
    return !1;
  }
  async getTexture(e, t = null) {
    return null;
  }
  async lockTexture(e, t = null) {
    return null;
  }
  releaseTexture(e, t = null) {
  }
  shouldSplit(e, t = null) {
    return !1;
  }
  setResolution(e) {
  }
  setRegionVisible(e, t) {
    const { _visibleRegionCounts: s } = this, n = e.join("_");
    let i = s.get(n);
    if (i || (i = { range: [...e], count: 0 }, s.set(n, i)), i.count += t ? 1 : -1, i.count < 0)
      throw new Error();
    i.count === 0 && s.delete(n);
  }
}
class ve extends fs {
  get tiling() {
    return this.imageSource.tiling;
  }
  get projection() {
    return this.tiling.projection;
  }
  get aspectRatio() {
    return this.tiling && this.isReady ? this.tiling.aspectRatio : 1;
  }
  get fetchOptions() {
    return this.imageSource.fetchOptions;
  }
  set fetchOptions(e) {
    this.imageSource.fetchOptions = e;
  }
  constructor(e = {}) {
    const { imageSource: t = null, ...s } = e;
    super(s), this.imageSource = t, this.regionImageSource = null;
  }
  _init() {
    return this._initImageSource().then(() => {
      this.imageSource.fetchData = (...e) => this.fetch(...e), this.regionImageSource = new Wn(this.imageSource);
    });
  }
  _initImageSource() {
    return this.imageSource.init();
  }
  // Texture acquisition API implementations
  calculateLevel(e) {
    const [t, s, n, i] = e, r = n - t, o = i - s;
    let a = 0;
    const c = this.regionImageSource.resolution, u = this.tiling.maxLevel;
    for (; a < u; a++) {
      const h = c / r, d = c / o, m = this.tiling.getLevel(a);
      if (m == null)
        continue;
      const { pixelWidth: p, pixelHeight: f } = m;
      if (p >= h || f >= d)
        break;
    }
    return a;
  }
  hasContent(e, t = this.calculateLevel(e)) {
    return this.regionImageSource.hasContent(...e, t);
  }
  getTexture(e, t = this.calculateLevel(e)) {
    return this.regionImageSource.get(...e, t);
  }
  lockTexture(e, t = this.calculateLevel(e)) {
    return this.regionImageSource.lock(...e, t);
  }
  releaseTexture(e, t = this.calculateLevel(e)) {
    this.regionImageSource.release(...e, t);
  }
  shouldSplit(e, t = this.calculateLevel(e)) {
    return this.tiling.maxLevel > t;
  }
  setResolution(e) {
    this.regionImageSource.resolution = e;
  }
}
class qo extends ve {
  constructor(e = {}) {
    super(e), this.imageSource = new We(e);
  }
}
class Xo extends ve {
  constructor(e) {
    super(e), this.imageSource = new qn(e);
  }
}
class $o extends fs {
  get projection() {
    return this.imageSource.projection;
  }
  get aspectRatio() {
    return 2;
  }
  get pointRadius() {
    return this.imageSource.pointRadius;
  }
  set pointRadius(e) {
    this.imageSource.pointRadius = e;
  }
  get strokeStyle() {
    return this.imageSource.strokeStyle;
  }
  set strokeStyle(e) {
    this.imageSource.strokeStyle = e;
  }
  get strokeWidth() {
    return this.imageSource.strokeWidth;
  }
  set strokeWidth(e) {
    this.imageSource.strokeWidth = e;
  }
  get fillStyle() {
    return this.imageSource.fillStyle;
  }
  set fillStyle(e) {
    this.imageSource.fillStyle = e;
  }
  get geojson() {
    return this.imageSource.geojson;
  }
  set geojson(e) {
    this.imageSource.geojson = e;
  }
  constructor(e = {}) {
    super(e), this.imageSource = new jr(e), this._redrawQueue = new ls(), this._redrawQueue.maxJobs = 4, this._redrawQueue.priorityCallback = () => 0;
  }
  _init() {
    return this.imageSource.init();
  }
  hasContent(e) {
    return this.imageSource.hasContent(...e);
  }
  getTexture(e) {
    return this.imageSource.get(...e);
  }
  lockTexture(e) {
    return this.imageSource.lock(...e);
  }
  releaseTexture(e) {
    this.imageSource.release(...e);
  }
  setResolution(e) {
    this.imageSource.resolution = e;
  }
  shouldSplit(e) {
    return !0;
  }
  setRegionVisible(e, t) {
    if (super.setRegionVisible(e, t), t) {
      const { _redrawQueue: s } = this, n = e.join("_");
      s.has(n) && s.flush(n);
    }
  }
  redraw() {
    const {
      imageSource: e,
      _redrawQueue: t,
      _visibleRegionCounts: s
    } = this;
    for (const { range: n } of s.values())
      e.redraw(...n);
    e.forEachItem((n, i) => {
      const r = i.join("_");
      !s.has(r) && !t.has(r) && t.add(r, () => {
        e.redraw(...i);
      });
    });
  }
}
class Qo extends ve {
  constructor(e = {}) {
    super(e), this.imageSource = new Un(e);
  }
}
class Zo extends ve {
  constructor(e = {}) {
    super(e), this.imageSource = new On(e);
  }
}
class Ko extends ve {
  constructor(e = {}) {
    super(e), this.imageSource = new us(e);
  }
}
class Jo extends ve {
  constructor(e = {}) {
    super(e);
    const { apiToken: t, autoRefreshToken: s, assetId: n } = e;
    this.options = e, this.assetId = n, this.auth = new li({ apiToken: t, autoRefreshToken: s }), this.auth.authURL = `https://api.cesium.com/v1/assets/${n}/endpoint`, this._attributions = [], this.externalType = !1;
  }
  _initImageSource() {
    return this.auth.refreshToken().then(async (e) => {
      if (this._attributions = e.attributions.map((t) => ({
        value: t.html,
        type: "html",
        collapsible: t.collapsible
      })), e.type !== "IMAGERY")
        throw new Error("CesiumIonOverlay: Only IMAGERY is supported as overlay type.");
      switch (this.externalType = !!e.externalType, e.externalType) {
        case "GOOGLE_2D_MAPS": {
          const { url: t, session: s, key: n, tileWidth: i } = e.options, r = `${t}/v1/2dtiles/{z}/{x}/{y}?session=${s}&key=${n}`;
          this.imageSource = new We({
            ...this.options,
            url: r,
            tileDimension: i,
            // Google maps tiles have a fixed depth of 22
            // https://developers.google.com/maps/documentation/tile/2d-tiles-overview
            levels: 22
          });
          break;
        }
        case "BING": {
          const { url: t, mapStyle: s, key: n } = e.options, i = `${t}/REST/v1/Imagery/Metadata/${s}?incl=ImageryProviders&key=${n}&uriScheme=https`, o = (await fetch(i).then((a) => a.json())).resourceSets[0].resources[0];
          this.imageSource = new Ur({
            ...this.options,
            url: o.imageUrl,
            subdomains: o.imageUrlSubdomains,
            tileDimension: o.tileWidth,
            levels: o.zoomMax
          });
          break;
        }
        default:
          this.imageSource = new us({
            ...this.options,
            url: e.url
          });
      }
      return this.imageSource.fetchData = (...t) => this.fetch(...t), this.imageSource.init();
    });
  }
  fetch(...e) {
    return this.externalType ? super.fetch(...e) : this.auth.fetch(...e);
  }
  getAttributions(e) {
    e.push(...this._attributions);
  }
}
class ea extends ve {
  constructor(e = {}) {
    super(e);
    const { apiToken: t, sessionOptions: s, autoRefreshToken: n, logoUrl: i } = e;
    this.logoUrl = i, this.auth = new ci({ apiToken: t, sessionOptions: s, autoRefreshToken: n }), this.imageSource = new We(), this.imageSource.fetchData = (...r) => this.fetch(...r), this._logoAttribution = {
      value: "",
      type: "image",
      collapsible: !1
    };
  }
  _initImageSource() {
    return this.auth.refreshToken().then((e) => (this.imageSource.tileDimension = e.tileWidth, this.imageSource.url = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}", this.imageSource.init()));
  }
  fetch(...e) {
    return this.auth.fetch(...e);
  }
  getAttributions(e) {
    this.logoUrl && (this._logoAttribution.value = this.logoUrl, e.push(this._logoAttribution));
  }
}
class ta {
  constructor() {
    this.name = "LOAD_REGION_PLUGIN", this.regions = [], this.tiles = null;
  }
  init(e) {
    this.tiles = e;
  }
  addRegion(e) {
    this.regions.indexOf(e) === -1 && this.regions.push(e);
  }
  removeRegion(e) {
    const t = this.regions.indexOf(e);
    t !== -1 && this.regions.splice(t, 1);
  }
  hasRegion(e) {
    return this.regions.indexOf(e) !== -1;
  }
  clearRegions() {
    this.regions = [];
  }
  // Calculates shape intersections and associated error values to use. If "mask" shapes are present then
  // tiles are only loaded if they are within those shapes.
  calculateTileViewError(e, t) {
    const s = e.engineData.boundingVolume, { regions: n, tiles: i } = this;
    let r = !1, o = null, a = 0, c = 1 / 0;
    for (const u of n) {
      const h = u.intersectsTile(s, e, i);
      r = r || h, h && (a = Math.max(u.calculateError(e, i), a), c = Math.min(u.calculateDistance(s, e, i), c)), u.mask && (o = o || h);
    }
    return t.inView = r && o !== !1, t.error = a, t.distance = c, t.inView || o !== null;
  }
  dispose() {
    this.regions = [];
  }
}
class ps {
  constructor(e = {}) {
    typeof e == "number" && (console.warn("LoadRegionPlugin: Region constructor has been changed to take options as an object."), e = { errorTarget: e });
    const {
      errorTarget: t = 10,
      mask: s = !1
    } = e;
    this.errorTarget = t, this.mask = s;
  }
  intersectsTile(e, t, s) {
    return !1;
  }
  calculateDistance(e, t, s) {
    return 1 / 0;
  }
  calculateError(e, t) {
    return e.geometricError - this.errorTarget + t.errorTarget;
  }
}
class sa extends ps {
  constructor(e = {}) {
    typeof e == "number" && (console.warn("SphereRegion: Region constructor has been changed to take options as an object."), e = {
      errorTarget: arguments[0],
      sphere: arguments[1]
    });
    const { sphere: t = new he() } = e;
    super(e), this.sphere = t.clone();
  }
  intersectsTile(e) {
    return e.intersectsSphere(this.sphere);
  }
}
class na extends ps {
  constructor(e = {}) {
    typeof e == "number" && (console.warn("RayRegion: Region constructor has been changed to take options as an object."), e = {
      errorTarget: arguments[0],
      ray: arguments[1]
    });
    const { ray: t = new Ei() } = e;
    super(e), this.ray = t.clone();
  }
  intersectsTile(e) {
    return e.intersectsRay(this.ray);
  }
}
class ia extends ps {
  constructor(e = {}) {
    typeof e == "number" && (console.warn("RayRegion: Region constructor has been changed to take options as an object."), e = {
      errorTarget: arguments[0],
      obb: arguments[1]
    });
    const { obb: t = new Ui() } = e;
    super(e), this.obb = t.clone(), this.obb.update();
  }
  intersectsTile(e) {
    return e.intersectsOBB(this.obb);
  }
}
const re = /* @__PURE__ */ new A(), an = ["x", "y", "z"];
class qr extends Ln {
  constructor(e, t = 16776960, s = 40) {
    const n = new He(), i = [];
    for (let r = 0; r < 3; r++) {
      const o = an[r], a = an[(r + 1) % 3];
      re.set(0, 0, 0);
      for (let c = 0; c < s; c++) {
        let u;
        u = 2 * Math.PI * c / (s - 1), re[o] = Math.sin(u), re[a] = Math.cos(u), i.push(re.x, re.y, re.z), u = 2 * Math.PI * (c + 1) / (s - 1), re[o] = Math.sin(u), re[a] = Math.cos(u), i.push(re.x, re.y, re.z);
      }
    }
    n.setAttribute("position", new K(new Float32Array(i), 3)), n.computeBoundingSphere(), super(n, new Ai({ color: t, toneMapped: !1 })), this.sphere = e, this.type = "SphereHelper";
  }
  updateMatrixWorld(e) {
    const t = this.sphere;
    this.position.copy(t.center), this.scale.setScalar(t.radius), super.updateMatrixWorld(e);
  }
}
const Qt = /* @__PURE__ */ new A(), ot = /* @__PURE__ */ new A(), ae = /* @__PURE__ */ new A(), ln = /* @__PURE__ */ new A(), cn = /* @__PURE__ */ new A();
function Xr(l) {
  l = l.toNonIndexed();
  const { groups: e } = l, { position: t, normal: s } = l.attributes, n = [], i = [];
  for (const o of e) {
    const { start: a, count: c } = o;
    for (let u = a, h = a + c; u < h; u++)
      ln.fromBufferAttribute(t, u), cn.fromBufferAttribute(s, u), i.push(...ln), n.push(...cn);
  }
  const r = new He();
  return r.setAttribute("position", new K(new Float32Array(i), 3)), r.setAttribute("normal", new K(new Float32Array(n), 3)), r;
}
function Xn(l, { computeNormals: e = !1 } = {}) {
  const {
    latStart: t = -Math.PI / 2,
    latEnd: s = Math.PI / 2,
    lonStart: n = 0,
    lonEnd: i = 2 * Math.PI,
    heightStart: r = 0,
    heightEnd: o = 0
  } = l, a = new En(1, 1, 1, 32, 32), { normal: c, position: u } = a.attributes, h = u.clone();
  for (let d = 0, m = u.count; d < m; d++) {
    ae.fromBufferAttribute(u, d);
    const p = _.mapLinear(ae.x, -0.5, 0.5, t, s), f = _.mapLinear(ae.y, -0.5, 0.5, n, i);
    let g = r;
    l.getCartographicToNormal(p, f, Qt), ae.z < 0 && (g = o), l.getCartographicToPosition(p, f, g, ae), u.setXYZ(d, ...ae);
  }
  e && a.computeVertexNormals();
  for (let d = 0, m = h.count; d < m; d++) {
    ae.fromBufferAttribute(h, d);
    const p = _.mapLinear(ae.x, -0.5, 0.5, t, s), f = _.mapLinear(ae.y, -0.5, 0.5, n, i);
    Qt.fromBufferAttribute(c, d), l.getCartographicToNormal(p, f, ot), Math.abs(Qt.dot(ot)) > 0.1 && (ae.z > 0 && ot.multiplyScalar(-1), c.setXYZ(d, ...ot));
  }
  return a;
}
class $r extends Ln {
  constructor(e = new In(), t = 16776960) {
    super(), this.ellipsoidRegion = e, this.material.color.set(t), this.update();
  }
  update() {
    const e = Xn(this.ellipsoidRegion);
    this.geometry.dispose(), this.geometry = new Ii(e, 80);
  }
  dispose() {
    this.geometry.dispose(), this.material.dispose();
  }
}
class Qr extends ue {
  constructor(e = new In(), t = 16776960) {
    super(), this.ellipsoidRegion = e, this.material.color.set(t), this.update();
  }
  update() {
    this.geometry.dispose();
    const e = Xn(this.ellipsoidRegion, { computeNormals: !0 }), { lonStart: t, lonEnd: s } = this;
    s - t >= 2 * Math.PI ? (e.groups.splice(2, 2), this.geometry = Xr(e)) : this.geometry = e;
  }
  dispose() {
    this.geometry.dispose(), this.material.dispose();
  }
}
const un = Symbol("ORIGINAL_MATERIAL"), at = Symbol("HAS_RANDOM_COLOR"), lt = Symbol("HAS_RANDOM_NODE_COLOR"), Zt = Symbol("LOAD_TIME"), Me = Symbol("PARENT_BOUND_REF_COUNT"), hn = /* @__PURE__ */ new he(), Ie = () => {
}, Kt = {};
function Ce(l) {
  if (!Kt[l]) {
    const e = Math.random(), t = 0.5 + Math.random() * 0.5, s = 0.375 + Math.random() * 0.25;
    Kt[l] = new vn().setHSL(e, t, s);
  }
  return Kt[l];
}
const fe = 0, $n = 1, Qn = 2, Zn = 3, Kn = 4, Jn = 5, ei = 6, Ge = 7, ze = 8, ti = 9, pt = 10, dn = 11, Zr = Object.freeze({
  NONE: fe,
  SCREEN_ERROR: $n,
  GEOMETRIC_ERROR: Qn,
  DISTANCE: Zn,
  DEPTH: Kn,
  RELATIVE_DEPTH: Jn,
  IS_LEAF: ei,
  RANDOM_COLOR: Ge,
  RANDOM_NODE_COLOR: ze,
  CUSTOM_COLOR: ti,
  LOAD_ORDER: pt
});
class ra {
  static get ColorModes() {
    return Zr;
  }
  get unlit() {
    return this._unlit;
  }
  set unlit(e) {
    e !== this._unlit && (this._unlit = e, this.materialsNeedUpdate = !0);
  }
  get colorMode() {
    return this._colorMode;
  }
  set colorMode(e) {
    e !== this._colorMode && (this._colorMode = e, this.materialsNeedUpdate = !0);
  }
  get boundsColorMode() {
    return this._boundsColorMode;
  }
  set boundsColorMode(e) {
    e !== this._boundsColorMode && (this._boundsColorMode = e, this.materialsNeedUpdate = !0);
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(e) {
    e !== this._enabled && this.tiles !== null && (this._enabled = e, e ? this.init(this.tiles) : this.dispose());
  }
  get displayParentBounds() {
    return this._displayParentBounds;
  }
  set displayParentBounds(e) {
    this._displayParentBounds !== e && (this._displayParentBounds = e, e ? this.tiles.traverse((t) => {
      t.traversal.visible && this._onTileVisibilityChange(t, !0);
    }) : this.tiles.traverse((t) => {
      t[Me] = null, this._onTileVisibilityChange(t, t.traversal.visible);
    }));
  }
  constructor(e) {
    e = {
      displayParentBounds: !1,
      displayBoxBounds: !1,
      displaySphereBounds: !1,
      displayRegionBounds: !1,
      colorMode: fe,
      boundsColorMode: fe,
      maxDebugDepth: -1,
      maxDebugDistance: -1,
      maxDebugError: -1,
      customColorCallback: null,
      unlit: !1,
      enabled: !0,
      ...e
    }, this.name = "DEBUG_TILES_PLUGIN", this.tiles = null, this._colorMode = null, this._boundsColorMode = null, this._unlit = null, this.materialsNeedUpdate = !1, this.extremeDebugDepth = -1, this.extremeDebugError = -1, this.boxGroup = null, this.sphereGroup = null, this.regionGroup = null, this._enabled = e.enabled, this._displayParentBounds = e.displayParentBounds, this.displayBoxBounds = e.displayBoxBounds, this.displaySphereBounds = e.displaySphereBounds, this.displayRegionBounds = e.displayRegionBounds, this.colorMode = e.colorMode, this.boundsColorMode = e.boundsColorMode, this.maxDebugDepth = e.maxDebugDepth, this.maxDebugDistance = e.maxDebugDistance, this.maxDebugError = e.maxDebugError, this.customColorCallback = e.customColorCallback, this.unlit = e.unlit, this.getDebugColor = (t, s) => {
      s.setRGB(t, t, t);
    };
  }
  // initialize the groups for displaying helpers, register events, and initialize existing tiles
  init(e) {
    if (this.tiles = e, !this.enabled)
      return;
    const t = e.group;
    this.boxGroup = new $e(), this.boxGroup.name = "DebugTilesRenderer.boxGroup", t.add(this.boxGroup), this.boxGroup.updateMatrixWorld(), this.sphereGroup = new $e(), this.sphereGroup.name = "DebugTilesRenderer.sphereGroup", t.add(this.sphereGroup), this.sphereGroup.updateMatrixWorld(), this.regionGroup = new $e(), this.regionGroup.name = "DebugTilesRenderer.regionGroup", t.add(this.regionGroup), this.regionGroup.updateMatrixWorld(), this._onLoadTilesetCB = () => {
      this._initExtremes();
    }, this._onLoadModelCB = ({ scene: s, tile: n }) => {
      this._onLoadModel(s, n);
    }, this._onDisposeModelCB = ({ tile: s }) => {
      this._onDisposeModel(s);
    }, this._onUpdateAfterCB = () => {
      this.update();
    }, this._onTileVisibilityChangeCB = ({ scene: s, tile: n, visible: i }) => {
      this._onTileVisibilityChange(n, i);
    }, e.addEventListener("load-tileset", this._onLoadTilesetCB), e.addEventListener("load-model", this._onLoadModelCB), e.addEventListener("dispose-model", this._onDisposeModelCB), e.addEventListener("update-after", this._onUpdateAfterCB), e.addEventListener("tile-visibility-change", this._onTileVisibilityChangeCB), this._initExtremes(), e.traverse((s) => {
      s.engineData.scene && this._onLoadModel(s.engineData.scene, s);
    }), e.visibleTiles.forEach((s) => {
      this._onTileVisibilityChange(s, !0);
    });
  }
  getTileFromObject3D(e) {
    let t = null;
    return this.tiles.activeTiles.forEach((n) => {
      if (t)
        return;
      const i = n.engineData.scene;
      i && i.traverse((r) => {
        r === e && (t = n);
      });
    }), t;
  }
  setEmptyTileVisible(e, t) {
    this._onTileVisibilityChange(e, t);
  }
  _initExtremes() {
    if (!(this.tiles && this.tiles.root))
      return;
    let e = -1, t = -1;
    this.tiles.traverse(null, (s, n, i) => {
      e = Math.max(e, i), t = Math.max(t, s.geometricError);
    }, !1), this.extremeDebugDepth = e, this.extremeDebugError = t;
  }
  /**
   * Applies the current plugin field values to all visible tile geometry. Call this
   * after modifying properties such as `colorMode`, `displayBoxBounds`, or
   * `displayParentBounds` when `TilesRenderer.update` is not being called every frame
   * so changes can be reflected.
   */
  update() {
    const { tiles: e, colorMode: t, boundsColorMode: s } = this;
    if (!e.root)
      return;
    this.materialsNeedUpdate && (e.forEachLoadedModel((m) => {
      this._updateMaterial(m);
    }), this.materialsNeedUpdate = !1), this.boxGroup.visible = this.displayBoxBounds, this.sphereGroup.visible = this.displaySphereBounds, this.regionGroup.visible = this.displayRegionBounds;
    let n = -1;
    this.maxDebugDepth === -1 ? n = this.extremeDebugDepth : n = this.maxDebugDepth;
    let i = -1;
    this.maxDebugError === -1 ? i = this.extremeDebugError : i = this.maxDebugError;
    let r = -1;
    this.maxDebugDistance === -1 ? (e.getBoundingSphere(hn), r = hn.radius) : r = this.maxDebugDistance;
    const { errorTarget: o, visibleTiles: a } = e;
    let c;
    (t === pt || s === pt) && (c = Array.from(a).sort((m, p) => m[Zt] - p[Zt]));
    const u = (m, p, f, g, y, x) => {
      switch (m !== Ge && delete f.material[at], m !== ze && delete f.material[lt], m) {
        case Kn: {
          const T = p.internal.depth / n;
          this.getDebugColor(T, f.material.color);
          break;
        }
        case Jn: {
          const T = p.internal.depthFromRenderedParent / n;
          this.getDebugColor(T, f.material.color);
          break;
        }
        case $n: {
          const T = p.traversal.error / o;
          T > 1 ? f.material.color.setRGB(1, 0, 0) : this.getDebugColor(T, f.material.color);
          break;
        }
        case Qn: {
          const T = Math.min(p.geometricError / i, 1);
          this.getDebugColor(T, f.material.color);
          break;
        }
        case Zn: {
          const T = Math.min(p.traversal.distanceFromCamera / r, 1);
          this.getDebugColor(T, f.material.color);
          break;
        }
        case ei: {
          !p.children || p.children.length === 0 ? this.getDebugColor(1, f.material.color) : this.getDebugColor(0, f.material.color);
          break;
        }
        case ze: {
          f.material[lt] || (f.material.color.setHSL(g, y, x), f.material[lt] = !0);
          break;
        }
        case Ge: {
          f.material[at] || (f.material.color.setHSL(g, y, x), f.material[at] = !0);
          break;
        }
        case ti: {
          this.customColorCallback ? this.customColorCallback(p, f) : console.warn("DebugTilesRenderer: customColorCallback not defined");
          break;
        }
        case pt: {
          const T = c.indexOf(p);
          this.getDebugColor(T / (c.length - 1), f.material.color);
          break;
        }
        case dn: {
          f.material.color.copy(Ce(p.internal.depth)), delete f.material[at], delete f.material[lt];
          break;
        }
      }
    };
    a.forEach((m) => {
      const p = m.engineData.scene;
      let f, g, y;
      t === Ge && (f = Math.random(), g = 0.5 + Math.random() * 0.5, y = 0.375 + Math.random() * 0.25), p.traverse((x) => {
        t === ze && (f = Math.random(), g = 0.5 + Math.random() * 0.5, y = 0.375 + Math.random() * 0.25), x.material && u(t, m, x, f, g, y);
      });
    });
    const h = s === fe ? dn : s, d = [this.boxGroup, this.sphereGroup, this.regionGroup];
    for (const m of d)
      for (const p of m.children) {
        const f = p.userData.tile;
        let g, y, x;
        h === Ge && (g = Math.random(), y = 0.5 + Math.random() * 0.5, x = 0.375 + Math.random() * 0.25), p.traverse((T) => {
          h === ze && (g = Math.random(), y = 0.5 + Math.random() * 0.5, x = 0.375 + Math.random() * 0.25), T.material && u(h, f, T, g, y, x);
        });
      }
  }
  _onTileVisibilityChange(e, t) {
    this.displayParentBounds ? ki(e, (s) => {
      s[Me] == null && (s[Me] = 0), t ? s[Me]++ : s[Me] > 0 && s[Me]--;
      const n = s === e && t || this.displayParentBounds && s[Me] > 0;
      this._updateBoundHelper(s, n);
    }) : this._updateBoundHelper(e, t);
  }
  _createBoundHelper(e) {
    const t = this.tiles, s = e.engineData, { sphere: n, obb: i, region: r } = s.boundingVolume;
    if (i) {
      const o = new $e();
      o.name = "DebugTilesRenderer.boxHelperGroup", o.matrix.copy(i.transform), o.matrixAutoUpdate = !1, o.userData.tile = e, s.boxHelperGroup = o;
      const a = new wi(i.box, Ce(e.internal.depth));
      a.raycast = Ie, o.add(a);
      const c = new ue(new En(), new ce({
        color: Ce(e.internal.depth),
        transparent: !0,
        depthWrite: !1,
        opacity: 0.05,
        side: dt
      }));
      i.box.getSize(c.scale), c.raycast = Ie, o.add(c), t.visibleTiles.has(e) && this.displayBoxBounds && (this.boxGroup.add(o), o.updateMatrixWorld(!0));
    }
    if (n) {
      const o = new qr(n, Ce(e.internal.depth));
      o.raycast = Ie, o.userData.tile = e;
      const a = new ue(new Pi(1), new ce({
        color: Ce(e.internal.depth),
        transparent: !0,
        depthWrite: !1,
        opacity: 0.05,
        side: dt
      }));
      a.raycast = Ie, o.add(a), s.sphereHelper = o, t.visibleTiles.has(e) && this.displaySphereBounds && (this.sphereGroup.add(o), o.updateMatrixWorld(!0));
    }
    if (r) {
      const o = new $r(r, Ce(e.internal.depth));
      o.raycast = Ie, o.userData.tile = e;
      const a = new Qr(r, Ce(e.internal.depth));
      a.material.transparent = !0, a.material.depthWrite = !1, a.material.opacity = 0.05, a.material.side = dt, a.raycast = Ie, o.add(a);
      const c = new he();
      r.getBoundingSphere(c), o.position.copy(c.center), c.center.multiplyScalar(-1), o.geometry.translate(...c.center), a.geometry.translate(...c.center), s.regionHelper = o, t.visibleTiles.has(e) && this.displayRegionBounds && (this.regionGroup.add(o), o.updateMatrixWorld(!0));
    }
  }
  _updateHelperMaterials(e, t) {
    t.traverse((s) => {
      const { material: n } = s;
      if (!n)
        return;
      e.traversal.visible || !this.displayParentBounds ? n.opacity = s.isMesh ? 0.05 : 1 : n.opacity = s.isMesh ? 0.01 : 0.2;
      const i = n.transparent;
      n.transparent = n.opacity < 1, n.transparent !== i && (n.needsUpdate = !0);
    });
  }
  _updateBoundHelper(e, t) {
    const s = e.engineData;
    if (!s)
      return;
    const n = this.sphereGroup, i = this.boxGroup, r = this.regionGroup;
    t && s.boxHelperGroup == null && s.sphereHelper == null && s.regionHelper == null && this._createBoundHelper(e);
    const o = s.boxHelperGroup, a = s.sphereHelper, c = s.regionHelper;
    t ? (o && (i.add(o), o.updateMatrixWorld(!0), this._updateHelperMaterials(e, o)), a && (n.add(a), a.updateMatrixWorld(!0), this._updateHelperMaterials(e, a)), c && (r.add(c), c.updateMatrixWorld(!0), this._updateHelperMaterials(e, c))) : (o && i.remove(o), a && n.remove(a), c && r.remove(c));
  }
  _updateMaterial(e) {
    const { colorMode: t, unlit: s } = this;
    e.traverse((n) => {
      if (!n.material)
        return;
      const i = n.material, r = n[un];
      if (i !== r && i.dispose(), t !== fe || s) {
        if (n.isPoints) {
          const o = new Ri();
          o.size = r.size, o.sizeAttenuation = r.sizeAttenuation, n.material = o;
        } else s ? n.material = new ce() : (n.material = new _n(), n.material.flatShading = !0);
        t === fe && (n.material.map = r.map, n.material.color.set(r.color));
      } else
        n.material = r;
    });
  }
  _onLoadModel(e, t) {
    t[Zt] = performance.now(), e.traverse((s) => {
      const n = s.material;
      n && (s[un] = n);
    }), this._updateMaterial(e);
  }
  _onDisposeModel(e) {
    const t = e.engineData;
    t != null && t.boxHelperGroup && (t.boxHelperGroup.traverse((s) => {
      s.geometry && (s.geometry.dispose(), s.material.dispose());
    }), delete t.boxHelperGroup), t != null && t.sphereHelper && (t.sphereHelper.traverse((s) => {
      s.geometry && (s.geometry.dispose(), s.material.dispose());
    }), delete t.sphereHelper), t != null && t.regionHelper && (t.regionHelper.traverse((s) => {
      s.geometry && (s.geometry.dispose(), s.material.dispose());
    }), delete t.regionHelper);
  }
  dispose() {
    var t, s, n;
    const e = this.tiles;
    e.removeEventListener("load-tileset", this._onLoadTilesetCB), e.removeEventListener("load-model", this._onLoadModelCB), e.removeEventListener("dispose-model", this._onDisposeModelCB), e.removeEventListener("update-after", this._onUpdateAfterCB), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChangeCB), this.colorMode = fe, this.boundsColorMode = fe, this.unlit = !1, e.forEachLoadedModel((i) => {
      this._updateMaterial(i);
    }), e.traverse((i) => {
      this._onDisposeModel(i);
    }, null, !1), (t = this.boxGroup) == null || t.removeFromParent(), (s = this.sphereGroup) == null || s.removeFromParent(), (n = this.regionGroup) == null || n.removeFromParent();
  }
}
const Kr = 30, Jr = 15, fn = 20, ct = Symbol("OVERLAY_RANGE"), ut = Symbol("OVERLAY_LEVEL"), Ve = /* @__PURE__ */ new A(), Ne = /* @__PURE__ */ new A(), Jt = /* @__PURE__ */ new he();
class oa {
  constructor(e = {}) {
    const {
      overlay: t = null,
      shape: s = "ellipsoid",
      endCaps: n = !0,
      center: i = !0,
      useRecommendedSettings: r = !0,
      applyOverlayTexture: o = !1
    } = e;
    this.priority = -10, this.tiles = null, this.overlay = t, this.shape = s, this.endCaps = n, this.center = i, this.useRecommendedSettings = r, this.applyOverlayTexture = o, this._tiling = null;
  }
  // Plugin functions
  init(e) {
    this.useRecommendedSettings && (e.errorTarget = 1), this.tiles = e;
  }
  async loadRootTileset() {
    const { overlay: e } = this;
    return e ? (await e.init(), this._tiling = e.tiling || this._createDefaultTiling()) : this._tiling = this._createDefaultTiling(), this.getTileset();
  }
  async parseToMesh(e, t, s, n, i) {
    if (s !== "generated_surface")
      return null;
    let r;
    this._useEllipsoid() ? r = this._createEllipsoidMesh(t) : r = this._createPlanarMesh(t);
    const { overlay: o, applyOverlayTexture: a } = this;
    if (o && a) {
      const c = t[ee], u = t[te], h = t[J], d = this._tiling.getTileBounds(c, u, h, !0, !1);
      if (o.hasContent(d, h)) {
        await o.lockTexture(d, h);
        const m = o.getTexture(d, h);
        if (t[ct] = d, t[ut] = h, i.aborted)
          return o.releaseTexture(d, h), delete t[ct], delete t[ut], null;
        r.material.map = m, r.material.needsUpdate = !0;
      }
    }
    return r;
  }
  preprocessNode(e) {
    const s = this._tiling.maxLevel;
    e[J] < s && e.parent !== null && this.expandChildren(e);
  }
  disposeTile(e) {
    const t = e[ct];
    this.overlay && t && (this.overlay.releaseTexture(t, e[ut]), delete e[ct], delete e[ut]);
  }
  dispose() {
    this.tiles.forEachLoadedModel((e, t) => {
      this.disposeTile(t);
    });
  }
  /**
   * Returns the cartographic coordinates for a given world-space position. "lat" and "lon" are assigned
   * to the target object.
   * @param {Vector3} position - World-space position. For ellipsoid surfaces this is a
   * 3D point on the surface; for planar surfaces it is a 2D point in the plane.
   * @param {{ lat: number, lon: number }} [target={}] - Optional target object to write results into.
   * @returns {{ lat: number, lon: number }} The cartographic coordinates in radians.
   * @throws {Error} If the tiling projection is not cartographic.
   */
  getCartographicFromPosition(e, t = {}) {
    const { _tiling: s } = this, { projection: n } = s;
    if (!n.isCartographic)
      throw new Error("GeneratedSurfacePlugin: getCartographicFromPosition requires a cartographic projection.");
    if (this._useEllipsoid())
      return this.tiles.ellipsoid.getPositionToCartographic(e, t);
    const { center: i } = this, r = e.x / s.aspectRatio + (i ? 0.5 : 0), o = e.y + (i ? 0.5 : 0);
    return t.lat = n.convertNormalizedToLatitude(o), t.lon = n.convertNormalizedToLongitude(r), t;
  }
  /**
   * Returns the world-space position for a given cartographic coordinate.
   * @param {number} lat - Latitude in radians.
   * @param {number} lon - Longitude in radians.
   * @param {Vector3} [target=new Vector3()] - Optional target Vector3 to write results into.
   * @returns {Vector3} The world-space position. For planar surfaces z is set to 0.
   * @throws {Error} If the tiling projection is not cartographic.
   */
  getPositionFromCartographic(e, t, s = new A()) {
    const { _tiling: n } = this, { projection: i } = n;
    if (!i.isCartographic)
      throw new Error("GeneratedSurfacePlugin: getPositionFromCartographic requires a cartographic projection.");
    if (this._useEllipsoid())
      return this.tiles.ellipsoid.getCartographicToPosition(e, t, 0, s);
    const { center: r } = this, o = i.convertLongitudeToNormalized(t), a = i.convertLatitudeToNormalized(e);
    return s.x = (o - (r ? 0.5 : 0)) * n.aspectRatio, s.y = a - (r ? 0.5 : 0), s.z = 0, s;
  }
  // whether the plugin is loading as an ellipsoid or not
  _useEllipsoid() {
    return this._tiling.projection.isCartographic && this.shape === "ellipsoid";
  }
  _createPlanarMesh(e) {
    const t = e[ee], s = e[te], n = e[J], i = e.boundingVolume.box;
    let r = 1, o = 1, a = 0, c = 0, u = 0;
    i && ([a, c, u] = i, r = i[3], o = i[7]);
    const h = new mt(2 * r, 2 * o), d = new ue(h, new ce());
    d.position.set(a, c, u);
    const m = this._tiling.getTileContentUVBounds(t, s, n), { uv: p } = h.attributes;
    for (let f = 0; f < p.count; f++)
      p.setXY(
        f,
        _.mapLinear(p.getX(f), 0, 1, m[0], m[2]),
        _.mapLinear(p.getY(f), 0, 1, m[1], m[3])
      );
    return d;
  }
  _createEllipsoidMesh(e) {
    const { tiles: t, endCaps: s, _tiling: n } = this, { projection: i } = n, r = e[J], o = e[ee], a = e[te], [c, u, h, d] = e.boundingVolume.region, m = Math.max(Jr, Math.ceil((d - u) * _.RAD2DEG * 0.25)), p = Math.max(Kr, Math.ceil((h - c) * _.RAD2DEG * 0.25)), f = p + 3, g = m + 3, y = new mt(1, 1, p + 2, m + 2), [x, T, b, S] = n.getTileBounds(o, a, r, !0, !0), { position: M, normal: C, uv: I } = y.attributes, V = M.count;
    e.engineData.boundingVolume.getSphere(Jt);
    for (let B = 0; B < V; B++) {
      const N = B % f, z = Math.floor(B / f), W = N === 0 || N === f - 1 || z === 0 || z === g - 1, H = Math.max(1, Math.min(f - 2, N)), L = Math.max(1, Math.min(g - 2, z)), v = (H - 1) / p, w = 1 - (L - 1) / m, R = i.convertNormalizedToLongitude(_.mapLinear(v, 0, 1, x, b));
      let E = i.convertNormalizedToLatitude(_.mapLinear(w, 0, 1, T, S));
      if (i.isMercator && s && (S === 1 && w === 1 && (E = Math.PI / 2), T === 0 && w === 0 && (E = -Math.PI / 2)), i.isMercator && w !== 0 && w !== 1) {
        const D = i.convertNormalizedToLatitude(1), k = 1 / m, O = _.mapLinear(w - k, 0, 1, u, d), X = _.mapLinear(w + k, 0, 1, u, d);
        E > D && O < D && (E = D), E < -D && X > -D && (E = -D);
      }
      t.ellipsoid.getCartographicToPosition(E, R, 0, Ve).sub(Jt.center), t.ellipsoid.getCartographicToNormal(E, R, Ne), W && Ve.addScaledVector(Ne, -e.geometricError);
      const F = _.mapLinear(i.convertLongitudeToNormalized(R), x, b, 0, 1), q = _.mapLinear(i.convertLatitudeToNormalized(E), T, S, 0, 1);
      M.setXYZ(B, Ve.x, Ve.y, Ve.z), C.setXYZ(B, Ne.x, Ne.y, Ne.z), I.setXY(B, F, q);
    }
    const U = new ue(y, new ce());
    return U.position.copy(Jt.center), U;
  }
  getTileset() {
    const { tiles: e, _tiling: t } = this, s = t.minLevel, { tileCountX: n, tileCountY: i } = t.getLevel(s), r = [];
    for (let a = 0; a < n; a++)
      for (let c = 0; c < i; c++) {
        const u = this.createChild(a, c, s);
        u !== null && r.push(u);
      }
    const o = {
      asset: { version: "1.1" },
      geometricError: 1 / 0,
      root: {
        refine: "REPLACE",
        geometricError: 1 / 0,
        boundingVolume: this.createBoundingVolume(0, 0, -1),
        children: r,
        [J]: -1,
        [ee]: 0,
        [te]: 0
      }
    };
    return e.preprocessTileset(o, ""), o;
  }
  getUrl() {
    return "tile.generated_surface";
  }
  fetchData(e) {
    if (/generated_surface/.test(e))
      return new ArrayBuffer();
  }
  createBoundingVolume(e, t, s, n = 0) {
    const { _tiling: i } = this, r = s === -1;
    if (this._useEllipsoid()) {
      const { endCaps: o } = this;
      let a, c;
      return r ? (a = i.getContentBounds(!0), c = i.getContentBounds()) : (a = i.getTileBounds(e, t, s, !0, !0), c = i.getTileBounds(e, t, s, !1, !0)), o && (a[3] === 1 && (c[3] = Math.PI / 2), a[1] === 0 && (c[1] = -Math.PI / 2)), { region: [...c, -n, 1] };
    } else {
      const { center: o } = this;
      let a;
      r ? a = i.getContentBounds(!0) : a = i.getTileBounds(e, t, s, !0);
      const [c, u, h, d] = a;
      let m = (h - c) / 2, p = (d - u) / 2, f = c + m, g = u + p;
      return o && (f -= 0.5, g -= 0.5), f *= i.aspectRatio, m *= i.aspectRatio, {
        box: [
          // center
          f,
          g,
          0,
          // x, y, z half extents
          m,
          0,
          0,
          0,
          p,
          0,
          0,
          0,
          0
        ]
      };
    }
  }
  createChild(e, t, s) {
    const { _tiling: n } = this, { projection: i } = n;
    if (!n.getTileExists(e, t, s))
      return null;
    let r;
    const o = this._useEllipsoid();
    if (o) {
      const [a, c, u, h] = n.getTileBounds(e, t, s, !0), { tilePixelWidth: d, tilePixelHeight: m } = n.getLevel(s), p = (u - a) / d, f = (h - c) / m, [
        /* west */
        ,
        g,
        y,
        x
      ] = n.getTileBounds(e, t, s), T = g > 0 != x > 0 ? 0 : Math.min(Math.abs(g), Math.abs(x)), b = i.convertLatitudeToNormalized(T), S = i.getLongitudeDerivativeAtNormalized(a), M = i.getLatitudeDerivativeAtNormalized(b), [C, I] = Dn(this.tiles.ellipsoid, T, y);
      r = Math.max(p * S * C, f * M * I);
    } else {
      const { pixelWidth: a, pixelHeight: c } = n.getLevel(s);
      r = Math.max(n.aspectRatio / a, 1 / c);
    }
    return {
      refine: "REPLACE",
      geometricError: r,
      boundingVolume: this.createBoundingVolume(e, t, s, o ? r : 0),
      content: {
        uri: this.getUrl(e, t, s)
      },
      children: [],
      // save the tile params so we can expand later
      [ee]: e,
      [te]: t,
      [J]: s
    };
  }
  expandChildren(e) {
    const t = e[J], s = e[ee], n = e[te], { tileSplitX: i, tileSplitY: r } = this._tiling.getLevel(t);
    for (let o = 0; o < i; o++)
      for (let a = 0; a < r; a++) {
        const c = this.createChild(i * s + o, r * n + a, t + 1);
        c && e.children.push(c);
      }
  }
  _createDefaultTiling() {
    const e = new Lt();
    if (this.shape === "ellipsoid") {
      const t = new ne("EPSG:3857");
      e.setProjection(t), e.generateLevels(fn, t.tileCountX, t.tileCountY);
    } else {
      const t = new ne("none");
      e.setProjection(t), e.generateLevels(fn, 1, 1);
    }
    return e;
  }
}
class aa extends Bn {
  constructor(e = {}) {
    const { url: t, ...s } = e;
    super(s), this.name = "DZI_TILES_PLUGIN", this.imageSource = new qn({ url: t });
  }
}
let eo = null;
function to() {
  return eo ?? (eo = Promise.all([
    import("@mapbox/vector-tile"),
    import("pbf")
  ]).then(([{ VectorTile: l }, { default: e }]) => ({ VectorTile: l, Protobuf: e })));
}
class si extends cs {
  constructor(e = {}) {
    super();
    const {
      url: t = null,
      levels: s = 20,
      projection: n = "EPSG:3857"
    } = e;
    this.url = t, this.levels = s, this.projectionId = n, this.tiling = new Lt(), this.fetchData = (...i) => fetch(...i), this.fetchOptions = {};
  }
  init() {
    const { tiling: e, levels: t, url: s, projectionId: n } = this;
    e.flipY = !/{\s*reverseY|-\s*y\s*}/g.test(s), e.setProjection(new ne(n)), e.setContentBounds(...e.projection.getBounds());
    const i = 512;
    return Array.isArray(t) ? t.forEach((r, o) => {
      r !== null && e.setLevel(o, {
        tilePixelWidth: i,
        tilePixelHeight: i,
        ...r
      });
    }) : e.generateLevels(t, e.projection.tileCountX, e.projection.tileCountY, {
      tilePixelWidth: i,
      tilePixelHeight: i
    }), Promise.resolve();
  }
  async fetchItem([e, t, s], n) {
    const i = this.getUrl(e, t, s), o = await (await this.fetchData(i, { ...this.fetchOptions, signal: n })).arrayBuffer();
    return this._parseVectorTile(o);
  }
  async _parseVectorTile(e) {
    if (!e || e.byteLength === 0)
      return null;
    const { VectorTile: t, Protobuf: s } = await to();
    return new t(new s(e));
  }
  // Parsed JS objects — nothing to dispose
  disposeItem() {
  }
  getUrl(e, t, s) {
    return this.url.replace(/{\s*z\s*}/gi, s).replace(/{\s*x\s*}/gi, e).replace(/{\s*(y|reverseY|-\s*y)\s*}/gi, t);
  }
}
class ss extends At {
  get tiling() {
    return this._contentCache.tiling;
  }
  get fetchData() {
    return this._contentCache.fetchData;
  }
  set fetchData(e) {
    this._contentCache.fetchData = e;
  }
  get fetchOptions() {
    return this._contentCache.fetchOptions;
  }
  set fetchOptions(e) {
    this._contentCache.fetchOptions = e;
  }
  constructor(e = {}) {
    const {
      resolution: t = 512,
      getStyle: s = () => null,
      contentCache: n,
      ...i
    } = e;
    super(), this.resolution = t, this.getStyle = s, this._canvasRenderer = new ft({ tileExtent: 4096 }), this._contentCache = n ?? new si(i);
  }
  init() {
    return this._contentCache.init();
  }
  hasContent(e, t, s, n, i) {
    let r = 0;
    return xe([e, t, s, n], i, this._contentCache.tiling, () => r++), r > 0;
  }
  async fetchItem([e, t, s, n, i], r) {
    const { resolution: o, _contentCache: a } = this, c = document.createElement("canvas");
    c.width = o, c.height = o;
    const u = [e, t, s, n], h = [];
    xe(u, i, a.tiling, (m, p, f) => {
      h.push(a.lock(m, p, f));
    }), await Promise.all(h), this._drawToCanvas(c, u, i);
    const d = new Ct(c);
    return d.colorSpace = St, d.generateMipmaps = !1, d.needsUpdate = !0, d;
  }
  disposeItem(e, [t, s, n, i, r]) {
    xe([t, s, n, i], r, this._contentCache.tiling, (o, a, c) => {
      this._contentCache.release(o, a, c);
    }), e && e.dispose();
  }
  redraw(...e) {
    const [t, s, n, i, r] = e, o = this.get(t, s, n, i, r);
    o && (this._drawToCanvas(o.image, [t, s, n, i], r), o.needsUpdate = !0);
  }
  dispose() {
    super.dispose(), this._contentCache.dispose();
  }
  _drawToCanvas(e, t, s) {
    const { _contentCache: n, _canvasRenderer: i } = this, r = e.getContext("2d");
    xe(t, s, n.tiling, (o, a, c) => {
      const u = n.tiling.getTileBounds(o, a, c, !0, !1);
      i.setFrame(r, u, t);
      const h = n.get(o, a, c);
      h && this._renderVectorTile(h);
    });
  }
  _renderVectorTile(e) {
    const { _canvasRenderer: t, getStyle: s } = this, n = [...Object.keys(e.layers)].sort((i, r) => {
      var o, a;
      if (s) {
        const c = ((o = s(i, null)) == null ? void 0 : o.order) ?? ft.DEFAULT_STYLE.order, u = ((a = s(r, null)) == null ? void 0 : a.order) ?? ft.DEFAULT_STYLE.order;
        if (c !== u) return c - u;
      }
      return i.localeCompare(r);
    });
    for (const i of n) {
      const r = e.layers[i];
      for (let o = 0; o < r.length; o++) {
        const a = r.feature(o), { properties: c, type: u } = a, h = s(i, c);
        t.setStyle(h);
        const d = a.loadGeometry();
        u === 1 ? t._renderPoints(d) : u === 2 ? t._renderLines(d) : u === 3 && t._renderPolygons(d);
      }
    }
  }
}
const ht = Math.PI / 180;
let so = null;
function no() {
  return so ?? (so = import("pmtiles").then((l) => l.PMTiles));
}
class io extends Pe {
  constructor(e, t) {
    super(), this.instance = e, this.tiling = t;
  }
  async fetchItem([e, t, s], n) {
    const i = await this.instance.getZxy(s, e, t, n);
    return !i || !i.data || i.data.byteLength === 0 ? null : this.processBufferToTexture(i.data);
  }
}
class ro extends si {
  constructor(e = {}) {
    super(e), this.instance = null, this.tileType = 1;
  }
  async init() {
    const { tiling: e } = this, t = await no();
    this.instance = new t({
      getKey: () => this.url,
      getBytes: async (i, r, o) => {
        const { fetchOptions: a, url: c } = this, u = await this.fetchData(c, {
          ...a,
          signal: o,
          headers: {
            ...a.headers,
            range: `bytes=${i}-${i + r - 1}`
          }
        });
        if (!u.ok)
          throw new Error(`PMTilesImageSource: Bad response code: ${u.status}`);
        if (u.status !== 206)
          throw new Error("PMTilesImageSource: Server does not support HTTP Byte Serving.");
        return {
          data: await u.arrayBuffer(),
          etag: u.headers.get("ETag"),
          cacheControl: u.headers.get("Cache-Control"),
          expires: u.headers.get("Expires")
        };
      }
    });
    const s = await this.instance.getHeader();
    this.tileType = s.tileType;
    const n = new ne("EPSG:3857");
    e.flipY = !0, e.setProjection(n), e.setContentBounds(
      ht * s.minLon,
      ht * s.minLat,
      ht * s.maxLon,
      ht * s.maxLat
    ), e.generateLevels(s.maxZoom + 1, n.tileCountX, n.tileCountY, {
      tilePixelWidth: 512,
      tilePixelHeight: 512,
      minLevel: s.minZoom
    });
  }
  async fetchItem([e, t, s], n) {
    const i = await this.instance.getZxy(s, e, t, n);
    return this._parseVectorTile(i ? i.data : null);
  }
}
class oo extends At {
  get tiling() {
    return this._contentCache.tiling;
  }
  get fetchData() {
    return this._contentCache.fetchData;
  }
  set fetchData(e) {
    this._contentCache.fetchData = e;
  }
  get resolution() {
    return this._resolution;
  }
  set resolution(e) {
    this._resolution = e, this._deferredSource && (this._deferredSource.resolution = e);
  }
  get fetchOptions() {
    return this._contentCache.fetchOptions;
  }
  set fetchOptions(e) {
    this._contentCache.fetchOptions = e;
  }
  constructor(e = {}) {
    super();
    const {
      resolution: t = 512,
      getStyle: s = () => null
    } = e;
    this._resolution = t, this._getStyle = s, this._contentCache = new ro(e), this._deferredSource = null, this.isVectorTile = !1;
  }
  async init() {
    await this._contentCache.init();
    const { _contentCache: e } = this;
    if (this.isVectorTile = e.tileType === 1, this.isVectorTile)
      this._deferredSource = new ss({
        resolution: this._resolution,
        getStyle: this._getStyle,
        contentCache: e
      });
    else {
      const t = new io(e.instance, e.tiling);
      this._deferredSource = new Wn(t), this._deferredSource.resolution = this._resolution;
    }
  }
  hasContent(e, t, s, n, i) {
    return this._deferredSource.hasContent(e, t, s, n, i);
  }
  lock(...e) {
    return this._deferredSource.lock(...e);
  }
  release(...e) {
    this._deferredSource.release(...e);
  }
  get(...e) {
    return this._deferredSource.get(...e);
  }
  redraw(...e) {
    this._deferredSource instanceof ss && this._deferredSource.redraw(...e);
  }
  forEachItem(...e) {
    return this._deferredSource.forEachItem(...e);
  }
  dispose() {
    super.dispose(), this._contentCache.dispose(), this._deferredSource && this._deferredSource.dispose();
  }
}
class ao extends fs {
  get tiling() {
    return this.imageSource.tiling;
  }
  get projection() {
    return this.tiling.projection;
  }
  get aspectRatio() {
    return this.tiling && this.isReady ? this.tiling.aspectRatio : 1;
  }
  get fetchOptions() {
    return this.imageSource.fetchOptions;
  }
  set fetchOptions(e) {
    this.imageSource.fetchOptions = e;
  }
  constructor(e = {}) {
    super(e), this.imageSource = e.imageSource ?? new ss(e), this._redrawQueue = new ls(), this._redrawQueue.maxJobs = 4, this._redrawQueue.priorityCallback = () => 0;
  }
  _init() {
    return this.imageSource.fetchData = (...e) => this.fetch(...e), this.imageSource.init();
  }
  calculateLevel(e) {
    const [t, s, n, i] = e, r = n - t, o = i - s, a = this.imageSource.resolution, c = this.tiling.maxLevel;
    let u = 0;
    for (; u < c; u++) {
      const h = this.tiling.getLevel(u);
      if (h == null)
        continue;
      const { pixelWidth: d, pixelHeight: m } = h;
      if (d >= a / r || m >= a / o)
        break;
    }
    return u;
  }
  hasContent(e) {
    return this.imageSource.hasContent(...e, this.calculateLevel(e));
  }
  getTexture(e) {
    return this.imageSource.get(...e, this.calculateLevel(e));
  }
  lockTexture(e) {
    return this.imageSource.lock(...e, this.calculateLevel(e));
  }
  releaseTexture(e) {
    this.imageSource.release(...e, this.calculateLevel(e));
  }
  setResolution(e) {
    this.imageSource.resolution = e;
  }
  shouldSplit(e) {
    return !0;
  }
  setRegionVisible(e, t) {
    if (super.setRegionVisible(e, t), t) {
      const { _redrawQueue: s } = this, n = e.join("_") + "_" + this.calculateLevel(e);
      s.has(n) && s.flush(n);
    }
  }
  redraw() {
    const {
      imageSource: e,
      _redrawQueue: t,
      _visibleRegionCounts: s
    } = this;
    for (const { range: n } of s.values())
      e.redraw(...n, this.calculateLevel(n));
    e.forEachItem((n, i) => {
      const r = i.join("_");
      !s.has(r) && !t.has(r) && t.add(r, () => {
        e.redraw(...i);
      });
    });
  }
}
class la extends ao {
  constructor(e = {}) {
    super({ ...e, imageSource: new oo(e) });
  }
  shouldSplit(e) {
    return this.imageSource.isVectorTile ? !0 : this.tiling.maxLevel > this.calculateLevel(e);
  }
}
const Tt = Pn * Math.PI * 2, pn = /* @__PURE__ */ new ne("EPSG:3857");
function lo(l) {
  return /:4326$/i.test(l);
}
function ni(l) {
  return /:3857$/i.test(l);
}
function ns(l) {
  return l.trim().split(/\s+/).map((e) => parseFloat(e));
}
function is(l, e) {
  lo(e) && ([l[1], l[0]] = [l[0], l[1]]);
}
function _t(l, e) {
  if (ni(e))
    return l[0] = pn.convertNormalizedToLongitude(0.5 + l[0] / Tt), l[1] = pn.convertNormalizedToLatitude(0.5 + l[1] / Tt), l[0] *= _.RAD2DEG, l[1] *= _.RAD2DEG, l;
}
function bt(l) {
  l[0] *= _.DEG2RAD, l[1] *= _.DEG2RAD;
}
class ca extends Rn {
  parse(e) {
    const t = new TextDecoder("utf-8").decode(new Uint8Array(e)), s = new DOMParser().parseFromString(t, "text/xml"), n = s.querySelector("Contents"), i = ge(n, "TileMatrixSet").map((a) => mo(a)), r = ge(n, "Layer").map((a) => uo(a)), o = co(s.querySelector("ServiceIdentification"));
    return r.forEach((a) => {
      a.tileMatrixSets = a.tileMatrixSetLinks.map((c) => i.find((u) => u.identifier === c));
    }), {
      serviceIdentification: o,
      tileMatrixSets: i,
      layers: r
    };
  }
}
function co(l) {
  var i;
  const e = l.querySelector("Title").textContent, t = ((i = l.querySelector("Abstract")) == null ? void 0 : i.textContent) || "", s = l.querySelector("ServiceType").textContent, n = l.querySelector("ServiceTypeVersion").textContent;
  return {
    title: e,
    abstract: t,
    serviceType: s,
    serviceTypeVersion: n
  };
}
function uo(l) {
  const e = l.querySelector("Title").textContent, t = l.querySelector("Identifier").textContent, s = l.querySelector("Format").textContent, n = ge(l, "ResourceURL").map((c) => ho(c)), i = ge(l, "TileMatrixSetLink").map((c) => ge(c, "TileMatrixSet")[0].textContent), r = ge(l, "Style").map((c) => po(c)), o = ge(l, "Dimension").map((c) => fo(c));
  let a = mn(l.querySelector("WGS84BoundingBox"));
  return a || (a = mn(l.querySelector("BoundingBox"))), {
    title: e,
    identifier: t,
    format: s,
    dimensions: o,
    tileMatrixSetLinks: i,
    styles: r,
    boundingBox: a,
    resourceUrls: n
  };
}
function ho(l) {
  const e = l.getAttribute("template"), t = l.getAttribute("format"), s = l.getAttribute("resourceType");
  return {
    template: e,
    format: t,
    resourceType: s
  };
}
function fo(l) {
  var r, o;
  const e = l.querySelector("Identifier").textContent, t = ((r = l.querySelector("UOM")) == null ? void 0 : r.textContent) || "", s = l.querySelector("Default").textContent, n = ((o = l.querySelector("Current")) == null ? void 0 : o.textContent) === "true", i = ge(l, "Value").map((a) => a.textContent);
  return {
    identifier: e,
    uom: t,
    defaultValue: s,
    current: n,
    values: i
  };
}
function mn(l) {
  if (!l)
    return null;
  const e = l.nodeName.endsWith("WGS84BoundingBox") ? "urn:ogc:def:crs:CRS::84" : l.getAttribute("crs"), t = ns(l.querySelector("LowerCorner").textContent), s = ns(l.querySelector("UpperCorner").textContent);
  return is(t, e), is(s, e), _t(t, e), _t(s, e), bt(t), bt(s), {
    crs: e,
    lowerCorner: t,
    upperCorner: s,
    bounds: [...t, ...s]
  };
}
function po(l) {
  var n;
  const e = ((n = l.querySelector("Title")) == null ? void 0 : n.textContent) || null, t = l.querySelector("Identifier").textContent, s = l.getAttribute("isDefault") === "true";
  return {
    title: e,
    identifier: t,
    isDefault: s
  };
}
function mo(l) {
  var r, o;
  const e = l.querySelector("SupportedCRS").textContent, t = ((r = l.querySelector("Title")) == null ? void 0 : r.textContent) || "", s = l.querySelector("Identifier").textContent, n = ((o = l.querySelector("Abstract")) == null ? void 0 : o.textContent) || "", i = [];
  return l.querySelectorAll("TileMatrix").forEach((a, c) => {
    const u = go(a), h = 28e-5 * u.scaleDenominator, d = u.tileWidth * u.matrixWidth * h, m = u.tileHeight * u.matrixHeight * h;
    let p;
    is(u.topLeftCorner, e), ni(e) ? p = [
      u.topLeftCorner[0] + d,
      u.topLeftCorner[1] - m
    ] : p = [
      u.topLeftCorner[0] + 360 * d / Tt,
      u.topLeftCorner[1] - 360 * m / Tt
    ], _t(p, e), _t(u.topLeftCorner, e), bt(p), bt(u.topLeftCorner), u.bounds = [...u.topLeftCorner, ...p], [u.bounds[1], u.bounds[3]] = [u.bounds[3], u.bounds[1]], i.push(u);
  }), {
    title: t,
    identifier: s,
    abstract: n,
    supportedCRS: e,
    tileMatrices: i
  };
}
function go(l) {
  const e = l.querySelector("Identifier").textContent, t = parseFloat(l.querySelector("TileWidth").textContent), s = parseFloat(l.querySelector("TileHeight").textContent), n = parseFloat(l.querySelector("MatrixWidth").textContent), i = parseFloat(l.querySelector("MatrixHeight").textContent), r = parseFloat(l.querySelector("ScaleDenominator").textContent), o = ns(l.querySelector("TopLeftCorner").textContent);
  return {
    identifier: e,
    tileWidth: t,
    tileHeight: s,
    matrixWidth: n,
    matrixHeight: i,
    scaleDenominator: r,
    topLeftCorner: o,
    bounds: null
  };
}
function ge(l, e) {
  return [...l.children].filter((t) => t.tagName === e);
}
const gn = Pn * Math.PI * 2, yn = /* @__PURE__ */ new ne("EPSG:3857");
function yo(l) {
  return /:4326$/i.test(l);
}
function xo(l) {
  return /:3857$/i.test(l);
}
function xn(l, e) {
  return xo(e) && (l[0] = yn.convertNormalizedToLongitude(0.5 + l[0] / (Math.PI * 2 * gn)), l[1] = yn.convertNormalizedToLatitude(0.5 + l[1] / (Math.PI * 2 * gn)), l[0] *= _.RAD2DEG, l[1] *= _.RAD2DEG), l;
}
function Tn(l, e, t) {
  const [s, n] = t.split(".").map((r) => parseInt(r)), i = s === 1 && n < 3 || s < 1;
  yo(e) && i && ([l[0], l[1]] = [l[1], l[0]]);
}
function we(l) {
  l[0] *= _.DEG2RAD, l[1] *= _.DEG2RAD;
}
function To(l, e) {
  if (!l)
    return null;
  const t = l.getAttribute("CRS") || l.getAttribute("crs") || l.getAttribute("SRS") || "", s = parseFloat(l.getAttribute("minx")), n = parseFloat(l.getAttribute("miny")), i = parseFloat(l.getAttribute("maxx")), r = parseFloat(l.getAttribute("maxy")), o = [s, n], a = [i, r];
  return Tn(o, t, e), Tn(a, t, e), xn(o, t), xn(a, t), we(o), we(a), { crs: t, bounds: [...o, ...a] };
}
function _o(l) {
  const e = parseFloat(l.querySelector("westBoundLongitude").textContent), t = parseFloat(l.querySelector("eastBoundLongitude").textContent), s = parseFloat(l.querySelector("southBoundLatitude").textContent), n = parseFloat(l.querySelector("northBoundLatitude").textContent), i = [e, s], r = [t, n];
  return we(i), we(r), [...i, ...r];
}
function bo(l) {
  const e = parseFloat(l.getAttribute("minx").textContent), t = parseFloat(l.getAttribute("maxx").textContent), s = parseFloat(l.getAttribute("miny").textContent), n = parseFloat(l.getAttribute("maxy").textContent), i = [e, s], r = [t, n];
  return we(i), we(r), [...i, ...r];
}
function So(l) {
  const e = l.querySelector("Name").textContent, t = l.querySelector("Title").textContent, s = [...l.querySelectorAll("LegendURL")].map((n) => {
    const i = parseInt(n.getAttribute("width")), r = parseInt(n.getAttribute("height")), o = n.querySelector("Format").textContent, a = n.querySelector("OnlineResource"), c = rs(a);
    return {
      width: i,
      height: r,
      format: o,
      url: c
    };
  });
  return {
    name: e,
    title: t,
    legends: s
  };
}
function ii(l, e, t = {}) {
  var f, g, y;
  let {
    styles: s = [],
    crs: n = [],
    contentBoundingBox: i = null,
    queryable: r = !1,
    opaque: o = !1
  } = t;
  const a = ((f = l.querySelector(":scope > Name")) == null ? void 0 : f.textContent) || null, c = ((g = l.querySelector(":scope > Title")) == null ? void 0 : g.textContent) || "", u = ((y = l.querySelector(":scope > Abstract")) == null ? void 0 : y.textContent) || "", h = [...l.querySelectorAll(":scope > Keyword")].map((x) => x.textContent), m = [...l.querySelectorAll(":scope > BoundingBox")].map((x) => To(x, e));
  n = [
    ...n,
    ...Array.from(l.querySelectorAll("CRS")).map((x) => x.textContent)
  ], s = [
    ...s,
    ...Array.from(l.querySelectorAll(":scope > Style")).map((x) => So(x))
  ], l.hasAttribute("queryable") && (r = l.getAttribute("queryable") === "1"), l.hasAttribute("opaque") && (o = l.getAttribute("opaque") === "1"), l.querySelector("EX_GeographicBoundingBox") ? i = _o(l.querySelector("EX_GeographicBoundingBox")) : l.querySelector("LatLonBoundingBox") && (i = bo(l.querySelector("LatLonBoundingBox")));
  const p = Array.from(l.querySelectorAll(":scope > Layer")).map((x) => ii(x, e, {
    // add
    styles: s,
    crs: n,
    // replace
    contentBoundingBox: i,
    queryable: r,
    opaque: o
  }));
  return {
    name: a,
    title: c,
    abstract: u,
    queryable: r,
    opaque: o,
    keywords: h,
    crs: n,
    boundingBoxes: m,
    contentBoundingBox: i,
    styles: s,
    subLayers: p
  };
}
function Mo(l) {
  var e, t, s;
  return {
    name: ((e = l.querySelector("Name")) == null ? void 0 : e.textContent) || "",
    title: ((t = l.querySelector("Title")) == null ? void 0 : t.textContent) || "",
    abstract: ((s = l.querySelector("Abstract")) == null ? void 0 : s.textContent) || "",
    keywords: Array.from(l.querySelectorAll("Keyword")).map((n) => n.textContent),
    maxWidth: parseFloat(l.querySelector("MaxWidth")) || null,
    maxHeight: parseFloat(l.querySelector("MaxHeight")) || null,
    layerLimit: parseFloat(l.querySelector("LayerLimit")) || null
  };
}
function rs(l) {
  return l ? (l.getAttribute("xlink:href") || l.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "").trim() : "";
}
function Co(l) {
  const e = Array.from(l.querySelectorAll("Format")).map((s) => s.textContent.trim()), t = Array.from(l.querySelectorAll("DCPType")).map((s) => {
    const n = s.querySelector("HTTP"), i = n.querySelector("Get OnlineResource") || n.querySelector("Get > OnlineResource") || n.querySelector("Get"), r = n.querySelector("Post OnlineResource") || n.querySelector("Post > OnlineResource") || n.querySelector("Post"), o = rs(i), a = rs(r);
    return { type: "HTTP", get: o, post: a };
  });
  return { formats: e, dcp: t, href: t[0].get };
}
function vo(l) {
  const e = {};
  return Array.from(l.querySelectorAll(":scope > *")).forEach((t) => {
    const s = t.localName;
    e[s] = Co(t);
  }), e;
}
function ri(l, e = []) {
  return l.forEach((t) => {
    t.name !== null && e.push(t), ri(t.subLayers, e);
  }), e;
}
class ua extends Rn {
  parse(e) {
    const t = new TextDecoder("utf-8").decode(new Uint8Array(e)), s = new DOMParser().parseFromString(t, "text/xml"), i = (s.querySelector("WMS_Capabilities") || s.querySelector("WMT_MS_Capabilities")).getAttribute("version"), r = s.querySelector("Capability"), o = Mo(s.querySelector(":scope > Service")), a = vo(r.querySelector(":scope > Request")), c = Array.from(r.querySelectorAll(":scope > Layer")).map((h) => ii(h, i)), u = ri(c);
    return { version: i, service: o, layers: u, request: a };
  }
}
export {
  ps as B,
  Uo as C,
  ra as D,
  Sr as G,
  fs as I,
  ta as L,
  ao as M,
  ia as O,
  la as P,
  tr as Q,
  na as R,
  sa as S,
  Ko as T,
  zo as U,
  ua as W,
  qo as X,
  Yo as a,
  Jo as b,
  aa as c,
  Xo as d,
  ko as e,
  br as f,
  xr as g,
  oa as h,
  $o as i,
  ea as j,
  Wo as k,
  _r as l,
  Go as m,
  zs as n,
  Yi as o,
  Fo as p,
  jo as q,
  ve as r,
  Ho as s,
  No as t,
  Qo as u,
  Oo as v,
  ca as w,
  Zo as x,
  Do as y,
  Bo as z
};
