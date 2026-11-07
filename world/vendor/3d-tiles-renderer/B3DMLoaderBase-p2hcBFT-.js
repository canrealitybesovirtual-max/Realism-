import { L as p, F as S, S as de, U as y, b as ce, c as I, a as F, Q as R, P as D } from "./constants-CBDAm28G.js";
import { t as he, b as ue, L as fe, r as ve } from "./LoaderBase-ATuDWTDB.js";
function M(t) {
  if (!t)
    return null;
  let e = t.length;
  const s = t.indexOf("?"), n = t.indexOf("#");
  s !== -1 && (e = Math.min(e, s)), n !== -1 && (e = Math.min(e, n));
  const r = t.lastIndexOf(".", e), a = t.lastIndexOf("/", e), i = t.indexOf("://");
  return i !== -1 && i + 2 === a || r === -1 || r < a ? null : t.substring(r + 1, e) || null;
}
const U = {
  inView: !1,
  error: 1 / 0,
  distanceFromCamera: 1 / 0
};
function A(t) {
  return t === p || t === S;
}
function g(t, e) {
  return N(t) && t.traversal.lastFrameVisited === e && t.traversal.used;
}
function N(t) {
  return !!t.traversal;
}
function P(t) {
  const { children: e } = t, s = e.length === 0 || N(e[e.length - 1]), n = !t.internal.hasUnrenderableContent || A(t.internal.loadingState);
  return s && n;
}
function w(t) {
  return t.internal.hasUnrenderableContent || t.parent && t.parent.geometricError < t.geometricError;
}
function k(t, e) {
  e.ensureChildrenArePreprocessed(t), t.traversal.lastFrameVisited !== e.frameCount && (t.traversal.lastFrameVisited = e.frameCount, t.traversal.used = !1, t.traversal.inFrustum = !1, t.traversal.isLeaf = !1, t.traversal.visible = !1, t.traversal.active = !1, t.traversal.error = 1 / 0, t.traversal.distanceFromCamera = 1 / 0, t.traversal.allChildrenReady = !1, t.traversal.allChildrenLoaded = !1, t.traversal.kicked = !1, t.traversal.allUsedChildrenProcessed = !1, e.calculateTileViewErrorWithPlugin(t, U), t.traversal.inFrustum = U.inView, t.traversal.error = U.error, t.traversal.distanceFromCamera = U.distanceFromCamera);
}
function V(t, e, s = !1) {
  if (k(t, e), s ? e.markTileUsed(t) : E(t), w(t) && P(t)) {
    const n = t.children;
    for (let r = 0, a = n.length; r < a; r++)
      V(n[r], e, s);
  }
}
function H(t, e) {
  if (k(t, e), t.traversal.usedLastFrame && (E(t), t.traversal.wasSetActive && (t.traversal.active = !0), (!t.traversal.active || w(t)) && P(t))) {
    const s = t.children;
    for (let n = 0, r = s.length; n < r; n++)
      H(s[n], e);
  }
}
function E(t) {
  t.traversal.used = !0;
}
function pe(t, e) {
  return !(t.traversal.error <= e.errorTarget && !w(t) || e.maxDepth > 0 && t.internal.depth + 1 >= e.maxDepth || !P(t));
}
function J(t, e) {
  const { frameCount: s } = e, { children: n } = t;
  for (let r = 0, a = n.length; r < a; r++) {
    const i = n[r];
    g(i, s) && (i.traversal.active && (i.traversal.kicked = !0, i.traversal.active = !1), J(i, e));
  }
}
function j(t) {
  return !w(t) && (!t.internal.hasContent || A(t.internal.loadingState));
}
function W(t, e) {
  if (k(t, e), !t.traversal.inFrustum)
    return;
  if (!pe(t, e)) {
    E(t);
    return;
  }
  let s = !1, n = !1;
  const r = t.children;
  for (let a = 0, i = r.length; a < i; a++) {
    const l = r[a];
    W(l, e), s = s || g(l, e.frameCount), n = n || l.traversal.inFrustum;
  }
  if (t.refine === "REPLACE" && !n && r.length !== 0) {
    t.traversal.inFrustum = !1, e.markTileUsed(t);
    for (let a = 0, i = r.length; a < i; a++)
      V(r[a], e, !0);
    return;
  }
  if (E(t), t.refine === "REPLACE" && s && (e.loadSiblings || e.loadAncestors))
    for (let a = 0, i = r.length; a < i; a++)
      V(r[a], e);
}
function K(t, e) {
  const s = e.frameCount;
  if (!g(t, s))
    return;
  const n = t.children;
  let r = !1;
  for (let i = 0, l = n.length; i < l; i++) {
    const o = n[i];
    r = r || g(o, s);
  }
  if (!r)
    t.traversal.isLeaf = !0;
  else {
    for (let l = 0, o = n.length; l < o; l++)
      K(n[l], e);
    let i = !0;
    for (let l = 0, o = n.length; l < o; l++) {
      const c = n[l];
      if (g(c, s)) {
        const u = !w(c), v = !c.internal.hasContent || A(c.internal.loadingState);
        u && v || c.traversal.allChildrenLoaded || (i = !1);
      }
    }
    t.traversal.allChildrenLoaded = i;
  }
  let a = !0;
  for (let i = 0, l = n.length; i < l; i++) {
    const o = n[i];
    g(o, e.frameCount) && !o.traversal.allUsedChildrenProcessed && (a = !1);
  }
  t.traversal.allUsedChildrenProcessed = a && P(t);
}
function Y(t, e) {
  if (!g(t, e.frameCount))
    return;
  const s = t.children;
  if (e.loadAncestors && !t.traversal.allChildrenLoaded && !w(t) && (t.traversal.isLeaf = !0), t.traversal.isLeaf) {
    if (!w(t) && (t.traversal.active = !0, P(t) && t.internal.hasContent && !A(t.internal.loadingState)))
      for (let r = 0, a = s.length; r < a; r++)
        H(s[r], e);
    return;
  }
  let n = s.length > 0;
  for (let r = 0, a = s.length; r < a; r++) {
    const i = s[r];
    Y(i, e), g(i, e.frameCount) && !(i.traversal.active && j(i)) && !i.traversal.allChildrenReady && (n = !1);
  }
  t.traversal.allChildrenReady = n, !n && t.traversal.wasSetActive && j(t) && (t.traversal.active = !0, J(t, e));
}
function X(t, e) {
  const s = g(t, e.frameCount);
  if (s && ((t.internal.hasUnrenderableContent || t.internal.hasRenderableContent && t.refine === "ADD") && (t.traversal.active = !0), (t.traversal.active || t.traversal.kicked) && t.internal.hasContent && (e.markTileUsed(t), (t.internal.hasUnrenderableContent || t.traversal.allUsedChildrenProcessed) && e.queueTileForDownload(t), t.internal.loadingState !== p && (t.traversal.active = !1)), e.loadAncestors && t.internal.hasContent && (e.markTileUsed(t), e.queueTileForDownload(t)), t.internal.virtualChildCount > 0 && t.internal.hasContent && e.markTileUsed(t), t.traversal.visible = t.internal.hasRenderableContent && t.traversal.active && t.traversal.inFrustum && t.internal.loadingState === p, e.stats.used++, t.traversal.inFrustum && e.stats.inFrustum++), s || N(t) && t.traversal.usedLastFrame) {
    let n = !1, r = !1;
    s ? (n = t.traversal.active, e.displayActiveTiles ? r = t.traversal.active || t.traversal.visible : r = t.traversal.visible) : k(t, e), t.internal.hasRenderableContent && t.internal.loadingState === p ? (n && e.stats.active++, r && e.stats.visible++, t.traversal.wasSetActive !== n && e.invokeOnePlugin((i) => i.setTileActive && i.setTileActive(t, n)), t.traversal.wasSetVisible !== r && e.invokeOnePlugin((i) => i.setTileVisible && i.setTileVisible(t, r))) : t.internal.hasRenderableContent || (r = t.traversal.isLeaf, t.traversal.wasSetVisible !== r && e.invokeOnePlugin((i) => i.setEmptyTileVisible && i.setEmptyTileVisible(t, r))), t.traversal.wasSetActive = n, t.traversal.wasSetVisible = r, t.traversal.usedLastFrame = s;
    const a = t.children;
    for (let i = 0, l = a.length; i < l; i++) {
      const o = a[i];
      X(o, e);
    }
  }
}
function me(t, e) {
  W(t, e), K(t, e), Y(t, e), X(t, e);
}
const L = {
  inView: !1,
  error: 1 / 0,
  distanceFromCamera: 1 / 0
}, Z = !0;
function ee(t) {
  return t === p || t === S;
}
function b(t, e) {
  return _(t) && t.traversal.lastFrameVisited === e && t.traversal.used;
}
function _(t) {
  return !!t.traversal;
}
function $(t) {
  const e = t.children;
  return e.length === 0 || _(e[e.length - 1]);
}
function q(t) {
  return t.internal.hasUnrenderableContent || t.parent && t.parent.geometricError < t.geometricError;
}
function Q(t, e) {
  t.traversal.lastFrameVisited !== e.frameCount && (t.traversal.lastFrameVisited = e.frameCount, t.traversal.used = !1, t.traversal.inFrustum = !1, t.traversal.isLeaf = !1, t.traversal.visible = !1, t.traversal.active = !1, t.traversal.error = 1 / 0, t.traversal.distanceFromCamera = 1 / 0, t.traversal.allChildrenReady = !1, e.calculateTileViewErrorWithPlugin(t, L), t.traversal.inFrustum = L.inView, t.traversal.error = L.error, t.traversal.distanceFromCamera = L.distanceFromCamera);
}
function O(t, e, s = !1) {
  if (e.ensureChildrenArePreprocessed(t), Q(t, e), x(t, e, s), q(t) && $(t)) {
    const n = t.children;
    for (let r = 0, a = n.length; r < a; r++)
      O(n[r], e, s);
  }
}
function te(t, e) {
  if (e.ensureChildrenArePreprocessed(t), b(t, e.frameCount) && (t.internal.hasContent && e.queueTileForDownload(t), $(t))) {
    const s = t.children;
    for (let n = 0, r = s.length; n < r; n++)
      te(s[n], e);
  }
}
function x(t, e, s = !1) {
  t.traversal.used || (s || (t.traversal.used = !0, e.stats.used++), e.markTileUsed(t), t.traversal.inFrustum === !0 && e.stats.inFrustum++);
}
function ge(t, e) {
  return !(t.traversal.error <= e.errorTarget && !q(t) || e.maxDepth > 0 && t.internal.depth + 1 >= e.maxDepth || !$(t));
}
function se(t, e) {
  if (e.ensureChildrenArePreprocessed(t), Q(t, e), !t.traversal.inFrustum)
    return;
  if (!ge(t, e)) {
    x(t, e);
    return;
  }
  let s = !1, n = !1;
  const r = t.children;
  for (let a = 0, i = r.length; a < i; a++) {
    const l = r[a];
    se(l, e), s = s || b(l, e.frameCount), n = n || l.traversal.inFrustum;
  }
  if (t.refine === "REPLACE" && !n && r.length !== 0) {
    t.traversal.inFrustum = !1;
    for (let a = 0, i = r.length; a < i; a++)
      O(r[a], e, !0);
    return;
  }
  if (x(t, e), t.refine === "REPLACE" && (s && t.internal.depth !== 0 || Z))
    for (let a = 0, i = r.length; a < i; a++)
      O(r[a], e);
}
function re(t, e) {
  const s = e.frameCount;
  if (!b(t, s))
    return;
  const n = t.children;
  let r = !1;
  for (let a = 0, i = n.length; a < i; a++) {
    const l = n[a];
    r = r || b(l, s);
  }
  if (!r)
    t.traversal.isLeaf = !0;
  else {
    let a = !0;
    for (let i = 0, l = n.length; i < l; i++) {
      const o = n[i];
      if (re(o, e), b(o, s)) {
        const c = !q(o);
        let u = !o.internal.hasContent || o.internal.hasRenderableContent && ee(o.internal.loadingState) || o.internal.hasUnrenderableContent && o.internal.loadingState === S;
        u = c && u || o.traversal.allChildrenReady, a = a && u;
      }
    }
    t.traversal.allChildrenReady = a;
  }
}
function ne(t, e) {
  const s = e.stats;
  if (!b(t, e.frameCount))
    return;
  if (t.traversal.isLeaf) {
    t.internal.loadingState === p ? (t.traversal.inFrustum && (t.traversal.visible = !0, s.visible++), t.traversal.active = !0, s.active++) : t.internal.hasContent && e.queueTileForDownload(t);
    return;
  }
  const n = t.children, r = t.internal.hasContent, a = ee(t.internal.loadingState) && r, i = (e.errorTarget + 1) * e.errorThreshold, l = t.traversal.error <= i, o = t.refine === "ADD", c = t.traversal.allChildrenReady || t.internal.depth === 0 && !Z;
  if (r && (l || o) && e.queueTileForDownload(t), (l && a && !c || a && o) && (t.traversal.inFrustum && (t.traversal.visible = !0, s.visible++), t.traversal.active = !0, s.active++), !o && l && !c)
    for (let u = 0, v = n.length; u < v; u++) {
      const h = n[u];
      b(h, e.frameCount) && te(h, e);
    }
  else
    for (let u = 0, v = n.length; u < v; u++)
      ne(n[u], e);
}
function ae(t, e) {
  const s = b(t, e.frameCount);
  if (s || _(t) && t.traversal.usedLastFrame) {
    let n = !1, r = !1;
    s ? (n = t.traversal.active, e.displayActiveTiles ? r = t.traversal.active || t.traversal.visible : r = t.traversal.visible) : Q(t, e), t.internal.hasRenderableContent && t.internal.loadingState === p && (t.traversal.wasSetActive !== n && e.invokeOnePlugin((i) => i.setTileActive && i.setTileActive(t, n)), t.traversal.wasSetVisible !== r && e.invokeOnePlugin((i) => i.setTileVisible && i.setTileVisible(t, r))), t.traversal.wasSetActive = n, t.traversal.wasSetVisible = r, t.traversal.usedLastFrame = s;
    const a = t.children;
    for (let i = 0, l = a.length; i < l; i++) {
      const o = a[i];
      ae(o, e);
    }
  }
}
function Te(t, e) {
  se(t, e), re(t, e), ne(t, e), ae(t, e);
}
function ye(t) {
  let e = null;
  return () => {
    e === null && (e = de.requestAnimationFrame(() => {
      e = null, t();
    }));
  };
}
const z = Symbol("PLUGIN_REGISTERED"), C = {
  inView: !0,
  error: 0,
  distance: 1 / 0
}, B = (t, e) => {
  const s = t.priority || 0, n = e.priority || 0;
  return s !== n ? s > n ? 1 : -1 : !t.traversal || !e.traversal ? 0 : t.traversal.used !== e.traversal.used ? t.traversal.used ? 1 : -1 : t.traversal.error !== e.traversal.error ? t.traversal.error > e.traversal.error ? 1 : -1 : t.traversal.distanceFromCamera !== e.traversal.distanceFromCamera ? t.traversal.distanceFromCamera > e.traversal.distanceFromCamera ? -1 : 1 : t.internal.depthFromRenderedParent !== e.internal.depthFromRenderedParent ? t.internal.depthFromRenderedParent > e.internal.depthFromRenderedParent ? -1 : 1 : 0;
}, Ce = (t, e) => t.traversal.used !== e.traversal.used ? t.traversal.used ? 1 : -1 : t.traversal.inFrustum !== e.traversal.inFrustum ? t.traversal.inFrustum ? 1 : -1 : t.internal.hasUnrenderableContent !== e.internal.hasUnrenderableContent ? t.internal.hasUnrenderableContent ? 1 : -1 : t.traversal.distanceFromCamera !== e.traversal.distanceFromCamera ? t.traversal.distanceFromCamera > e.traversal.distanceFromCamera ? -1 : 1 : t.internal.depthFromRenderedParent !== e.internal.depthFromRenderedParent ? t.internal.depthFromRenderedParent > e.internal.depthFromRenderedParent ? -1 : 1 : 0, be = (t, e) => t.traversal.lastFrameVisited !== e.traversal.lastFrameVisited ? t.traversal.lastFrameVisited > e.traversal.lastFrameVisited ? -1 : 1 : t.internal.depthFromRenderedParent !== e.internal.depthFromRenderedParent ? t.internal.depthFromRenderedParent > e.internal.depthFromRenderedParent ? 1 : -1 : t.internal.loadingState !== e.internal.loadingState ? t.internal.loadingState > e.internal.loadingState ? -1 : 1 : t.internal.hasUnrenderableContent !== e.internal.hasUnrenderableContent ? t.internal.hasUnrenderableContent ? -1 : 1 : t.traversal.error !== e.traversal.error ? t.traversal.error > e.traversal.error ? -1 : 1 : 0, G = (t, e) => {
  const s = t.priority ?? 1 / 0, n = e.priority ?? 1 / 0;
  if (s !== n)
    return s > n ? 1 : -1;
  if (!t.internal || !e.internal)
    return 0;
  const r = t.internal.renderer, a = e.internal.renderer, i = r.optimizedLoadStrategy && !r.loadAncestors, l = a.optimizedLoadStrategy && !a.loadAncestors;
  return i && l ? Ce(t, e) : B(t, e);
};
class Re {
  /**
   * Root tile of the loaded root tileset, or null if not yet loaded.
   * @type {Tile|null}
   * @readonly
   */
  get root() {
    const e = this.rootTileset;
    return e ? e.root : null;
  }
  get rootTileSet() {
    return console.warn('TilesRenderer: "rootTileSet" has been deprecated. Use "rootTileset" instead.'), this.rootTileset;
  }
  /**
   * Fraction of tiles loaded since the last idle state, from 0 (nothing loaded) to 1 (all loaded).
   * @type {number}
   * @readonly
   */
  get loadProgress() {
    const { stats: e, isLoading: s } = this, n = e.queued + e.downloading + e.parsing, r = e.inCacheSinceLoad + (s ? 1 : 0);
    return r === 0 ? 1 : 1 - n / r;
  }
  get errorThreshold() {
    return this._errorThreshold;
  }
  set errorThreshold(e) {
    console.warn('TilesRenderer: The "errorThreshold" option has been deprecated.'), this._errorThreshold = e;
  }
  /**
   * Enables an optimized tile loading strategy that loads only the tiles
   * needed for the current view, reducing memory usage and improving initial load times.
   * Tiles are loaded independently based on screen-space error without requiring all parent
   * tiles to load first. Prevents visual gaps and flashing during camera movement.
   *
   * Based in part on {@link https://cesium.com/learn/cesium-native/ref-doc/selection-algorithm-details.html Cesium Native tile selection}.
   *
   * @warn This option has been deprecated and will be removed in upcoming releases. The "optimized
   * load strategy" will be the only option with "loadSiblings" and "loadAncestors" as toggles.
   * @type {boolean}
   * @default true
   */
  get optimizedLoadStrategy() {
    return this._optimizedLoadStrategy;
  }
  set optimizedLoadStrategy(e) {
    console.warn('TilesRenderer: "optimizedLoadStrategy" has been deprecated. Please toggle "loadAncestors" to adjust the tile load behavior.'), this._optimizedLoadStrategy = e;
  }
  /**
   * @param {string} [url] - URL of the root tileset JSON to load.
   */
  constructor(e = null) {
    this.rootLoadingState = y, this.rootTileset = null, this.rootURL = e, this.fetchOptions = {}, this.plugins = [], this.queuedTiles = [], this.cachedSinceLoadComplete = /* @__PURE__ */ new Set(), this.isLoading = !1;
    const s = new ce();
    s.unloadPriorityCallback = be;
    const n = new I();
    n.maxJobs = 25, n.priorityCallback = B;
    const r = new I();
    r.maxJobs = 5, r.priorityCallback = B;
    const a = new I();
    a.maxJobs = 25, a.priorityCallback = (i, l) => {
      const o = i.parent, c = l.parent;
      return o === c ? 0 : o ? c ? n.priorityCallback(o, c) : -1 : 1;
    }, this.processedTiles = /* @__PURE__ */ new WeakSet(), this.visibleTiles = /* @__PURE__ */ new Set(), this.activeTiles = /* @__PURE__ */ new Set(), this.usedSet = /* @__PURE__ */ new Set(), this.loadingTiles = /* @__PURE__ */ new Set(), this.lruCache = s, this.downloadQueue = n, this.downloadQueue.priorityCallback = G, this.parseQueue = r, this.parseQueue.priorityCallback = G, this.processNodeQueue = a, this.stats = {
      inCacheSinceLoad: 0,
      inCache: 0,
      queued: 0,
      downloading: 0,
      parsing: 0,
      loaded: 0,
      failed: 0,
      inFrustum: 0,
      used: 0,
      active: 0,
      visible: 0,
      tilesProcessed: 0
    }, this.frameCount = 0, this._dispatchNeedsUpdateEvent = ye(() => {
      this.dispatchEvent({ type: "needs-update" });
    }), this.errorTarget = 16, this._errorThreshold = 1 / 0, this.displayActiveTiles = !1, this.maxDepth = 1 / 0, this._optimizedLoadStrategy = !0, this.loadSiblings = !0, this.loadAncestors = !0, this.maxTilesProcessed = 250;
  }
  // Plugins
  /**
   * Registers a plugin with this renderer. Plugins are inserted in priority order and
   * receive lifecycle callbacks throughout the tile loading and rendering process.
   * A plugin instance may only be registered to one renderer at a time.
   * @param {Object} plugin
   */
  registerPlugin(e) {
    if (e[z] === !0)
      throw new Error("TilesRendererBase: A plugin can only be registered to a single tileset");
    e.loadRootTileSet && !e.loadRootTileset && (console.warn('TilesRendererBase: Plugin implements deprecated "loadRootTileSet" method. Please rename to "loadRootTileset".'), e.loadRootTileset = e.loadRootTileSet), e.preprocessTileSet && !e.preprocessTileset && (console.warn('TilesRendererBase: Plugin implements deprecated "preprocessTileSet" method. Please rename to "preprocessTileset".'), e.preprocessTileset = e.preprocessTileSet);
    const s = this.plugins, n = e.priority || 0;
    let r = s.length;
    for (let a = 0; a < s.length; a++)
      if ((s[a].priority || 0) > n) {
        r = a;
        break;
      }
    s.splice(r, 0, e), e[z] = !0, e.init && e.init(this);
  }
  /**
   * Removes a registered plugin. Calls `plugin.dispose()` if defined.
   * Accepts either the plugin instance or its string name.
   * Returns true if the plugin was found and removed.
   * @param {Object|string} plugin
   * @returns {boolean}
   */
  unregisterPlugin(e) {
    const s = this.plugins;
    if (typeof e == "string" && (e = this.getPluginByName(e)), s.includes(e)) {
      const n = s.indexOf(e);
      return s.splice(n, 1), e.dispose && e.dispose(), !0;
    }
    return !1;
  }
  /**
   * Returns the first registered plugin whose `name` property matches, or null.
   * @param {string} name
   * @returns {Object|null}
   */
  getPluginByName(e) {
    return this.plugins.find((s) => s.name === e) || null;
  }
  invokeOnePlugin(e) {
    const s = [...this.plugins, this];
    for (let n = 0; n < s.length; n++) {
      const r = e(s[n]);
      if (r)
        return r;
    }
    return null;
  }
  invokeAllPlugins(e) {
    const s = [...this.plugins, this], n = [];
    for (let r = 0; r < s.length; r++) {
      const a = e(s[r]);
      a && n.push(a);
    }
    return n.length === 0 ? null : Promise.all(n);
  }
  // Public API
  /**
   * Iterates over all tiles in the loaded hierarchy. `beforecb` is called before
   * descending into a tile's children; returning true from it skips the subtree.
   * `aftercb` is called after all children have been visited.
   * @param {TileBeforeCallback|null} [beforecb]
   * @param {TileAfterCallback|null} [aftercb]
   */
  traverse(e, s, n = !0) {
    this.root && he(this.root, (r, ...a) => (n && this.ensureChildrenArePreprocessed(r, !0), e ? e(r, ...a) : !1), s);
  }
  /**
   * Collects attribution data from all registered plugins into `target` and returns it.
   * @param {Array<{type: string, value: any}>} [target]
   * @returns {Array<{type: string, value: any}>}
   */
  getAttributions(e = []) {
    return this.invokeAllPlugins((s) => s !== this && s.getAttributions && s.getAttributions(e)), e;
  }
  /**
   * Runs the tile traversal and update loop. Should be called once per frame after
   * camera matrices have been updated. Triggers tile loading, visibility updates,
   * and LRU cache eviction.
   */
  update() {
    const { lruCache: e, usedSet: s, stats: n, root: r, downloadQueue: a, parseQueue: i, processNodeQueue: l, optimizedLoadStrategy: o } = this;
    if (this.rootLoadingState === y && (this.rootLoadingState = F, this.invokeOnePlugin((h) => h.loadRootTileset && h.loadRootTileset()).then((h) => {
      let f = this.rootURL;
      f !== null && this.invokeAllPlugins((d) => f = d.preprocessURL ? d.preprocessURL(f, null) : f), this.rootLoadingState = p, this.rootTileset = h, this.dispatchEvent({ type: "needs-update" }), this.dispatchEvent({ type: "load-content" }), this.dispatchEvent({
        type: "load-tileset",
        tileset: h,
        url: f
      }), this.dispatchEvent({
        type: "load-root-tileset",
        tileset: h,
        url: f
      });
    }).catch((h) => {
      this.rootLoadingState = S, console.error(h), this.rootTileset = null, this.dispatchEvent({
        type: "load-error",
        tile: null,
        error: h,
        url: this.rootURL
      });
    })), !r)
      return;
    let c = null;
    if (this.invokeAllPlugins((h) => {
      if (h.doTilesNeedUpdate) {
        const f = h.doTilesNeedUpdate();
        c === null ? c = f : c = !!(c || f);
      }
    }), c === !1) {
      this.dispatchEvent({ type: "update-before" }), this.dispatchEvent({ type: "update-after" });
      return;
    }
    this.dispatchEvent({ type: "update-before" }), n.inFrustum = 0, n.used = 0, n.active = 0, n.visible = 0, n.tilesProcessed = 0, this.frameCount++, s.forEach((h) => e.markUnused(h)), s.clear(), this.prepareForTraversal(), o ? me(r, this) : Te(r, this), this.removeUnusedPendingTiles();
    const u = this.queuedTiles;
    u.sort(e.unloadPriorityCallback);
    for (let h = 0, f = u.length; h < f && !e.isFull(); h++)
      this.requestTileContents(u[h]);
    u.length = 0, e.scheduleUnload(), (a.running || i.running || l.running) === !1 && this.isLoading === !0 && (this.cachedSinceLoadComplete.clear(), n.inCacheSinceLoad = 0, this.dispatchEvent({ type: "tiles-load-end" }), this.isLoading = !1), this.dispatchEvent({ type: "update-after" });
  }
  /**
   * Resets any tiles that previously failed to load so they will be retried on the next `update`.
   */
  resetFailedTiles() {
    this.rootLoadingState === S && (this.rootLoadingState = y);
    const e = this.stats;
    e.failed !== 0 && (this.traverse((s) => {
      s.internal.loadingState === S && (s.internal.loadingState = y);
    }, null, !1), e.failed = 0);
  }
  calculateTileViewErrorWithPlugin(e, s) {
    this.calculateTileViewError(e, s);
    let n = null, r = 0, a = 1 / 0;
    this.invokeAllPlugins((i) => {
      i !== this && i.calculateTileViewError && (C.inView = !0, C.error = 0, C.distance = 1 / 0, i.calculateTileViewError(e, C) && (n === null && (n = !0), n = n && C.inView, C.inView && (a = Math.min(a, C.distance), r = Math.max(r, C.error))));
    }), s.inView && n !== !1 ? (s.error = Math.max(s.error, r), s.distanceFromCamera = Math.min(s.distanceFromCamera, a)) : n ? (s.inView = !0, s.error = r, s.distanceFromCamera = a) : s.inView = !1;
  }
  /**
   * Disposes all loaded tiles and unregisters all plugins. The renderer should not
   * be used after calling this.
   */
  dispose() {
    [...this.plugins].forEach((r) => {
      this.unregisterPlugin(r);
    });
    const s = this.lruCache, n = [];
    this.traverse((r) => (n.push(r), !1), null, !1);
    for (let r = 0, a = n.length; r < a; r++)
      s.remove(n[r]);
    this.stats = {
      queued: 0,
      parsing: 0,
      downloading: 0,
      failed: 0,
      inFrustum: 0,
      traversed: 0,
      used: 0,
      active: 0,
      visible: 0
    }, this.frameCount = 0, this.loadingTiles.clear();
  }
  // Overrideable
  calculateBytesUsed(e, s) {
    return 0;
  }
  /**
   * Dispatches an event to all registered listeners for the given event type.
   * @param {{ type: string }} e
   */
  dispatchEvent(e) {
  }
  /**
   * Registers a listener for the given event type.
   * @param {string} name
   * @param {EventCallback} callback
   */
  addEventListener(e, s) {
  }
  /**
   * Removes a previously registered event listener.
   * @param {string} name
   * @param {EventCallback} callback
   */
  removeEventListener(e, s) {
  }
  parseTile(e, s, n) {
    return null;
  }
  prepareForTraversal() {
  }
  disposeTile(e) {
    e.traversal.visible && (this.invokeOnePlugin((n) => n.setTileVisible && n.setTileVisible(e, !1)), e.traversal.visible = !1), e.traversal.active && (this.invokeOnePlugin((n) => n.setTileActive && n.setTileActive(e, !1)), e.traversal.active = !1);
    const { scene: s } = e.engineData;
    s && this.dispatchEvent({
      type: "dispose-model",
      scene: s,
      tile: e
    });
  }
  preprocessNode(e, s, n = null) {
    var r;
    if (this.processedTiles.add(e), this.stats.tilesProcessed++, e.content && (!("uri" in e.content) && "url" in e.content && (e.content.uri = e.content.url, delete e.content.url), e.content.boundingVolume && !("box" in e.content.boundingVolume || "sphere" in e.content.boundingVolume || "region" in e.content.boundingVolume) && delete e.content.boundingVolume), e.parent = n, e.children = e.children || [], e.internal = {
      hasContent: !1,
      hasRenderableContent: !1,
      hasUnrenderableContent: !1,
      loadingState: y,
      basePath: s,
      depth: -1,
      depthFromRenderedParent: -1,
      isVirtual: !1,
      virtualChildCount: 0,
      renderer: this,
      // preserve any pre-seeded fields
      ...e.internal
    }, (r = e.content) != null && r.uri) {
      const a = M(e.content.uri), i = !!(a && /json$/.test(a));
      e.internal.hasContent = !0, e.internal.hasUnrenderableContent = i, e.internal.hasRenderableContent = !i;
    } else
      e.internal.hasContent = !1, e.internal.hasUnrenderableContent = !1, e.internal.hasRenderableContent = !1;
    n ? (e.internal.depth = n.internal.depth + 1, e.internal.depthFromRenderedParent = n.internal.depthFromRenderedParent + (e.internal.hasRenderableContent ? 1 : 0)) : (e.internal.depth = 0, e.internal.depthFromRenderedParent = e.internal.hasRenderableContent ? 1 : 0), e.traversal = {
      distanceFromCamera: 1 / 0,
      error: 1 / 0,
      inFrustum: !1,
      isLeaf: !1,
      used: !1,
      usedLastFrame: !1,
      visible: !1,
      wasSetVisible: !1,
      active: !1,
      wasSetActive: !1,
      allChildrenReady: !1,
      allChildrenLoaded: !1,
      kicked: !1,
      allUsedChildrenProcessed: !1,
      lastFrameVisited: -1
    }, n === null ? e.refine = e.refine || "REPLACE" : e.refine = e.refine || n.refine, e.engineData = {
      scene: null,
      metadata: null,
      boundingVolume: null
    }, Object.defineProperty(e, "cached", {
      get() {
        return console.warn('TilesRenderer: "tile.cached" field has been renamed to "tile.engineData".'), this.engineData;
      },
      enumerable: !1,
      configurable: !0
    }), this.invokeAllPlugins((a) => {
      a !== this && a.preprocessNode && a.preprocessNode(e, s, n);
    });
  }
  setTileActive(e, s) {
    s ? this.activeTiles.add(e) : this.activeTiles.delete(e);
  }
  setTileVisible(e, s) {
    s ? this.visibleTiles.add(e) : this.visibleTiles.delete(e), this.dispatchEvent({
      type: "tile-visibility-change",
      scene: e.engineData.scene,
      tile: e,
      visible: s
    });
  }
  calculateTileViewError(e, s) {
  }
  removeUnusedPendingTiles() {
    const { lruCache: e, loadingTiles: s } = this, n = [];
    for (const r of s)
      !e.isUsed(r) && r.internal.loadingState === R && n.push(r);
    for (let r = 0; r < n.length; r++)
      e.remove(n[r]);
  }
  // Private Functions
  queueTileForDownload(e) {
    e.internal.loadingState !== y || this.lruCache.isFull() || this.queuedTiles.push(e);
  }
  markTileUsed(e) {
    this.usedSet.add(e), this.lruCache.markUsed(e);
  }
  fetchData(e, s) {
    return fetch(e, s);
  }
  ensureChildrenArePreprocessed(e, s = this.stats.tilesProcessed < this.maxTilesProcessed) {
    const n = e.children;
    if (n.length === 0 || n[n.length - 1].traversal)
      return;
    const r = (a) => {
      for (let i = 0, l = a.length; i < l; i++) {
        const o = a[i];
        o && !o.traversal && this.preprocessNode(o, e.internal.basePath, e);
      }
    };
    s ? (this.processNodeQueue.remove(e), r(n)) : this.processNodeQueue.has(e) || this.processNodeQueue.add(e, (a) => {
      r(a.children), this._dispatchNeedsUpdateEvent();
    });
  }
  // returns the total bytes used for by the given tile as reported by all plugins
  getBytesUsed(e) {
    let s = 0;
    return this.invokeAllPlugins((n) => {
      n.calculateBytesUsed && (s += n.calculateBytesUsed(e, e.engineData.scene) || 0);
    }), s;
  }
  // force a recalculation of the tile or all tiles if no tile is provided
  recalculateBytesUsed(e = null) {
    const { lruCache: s, processedTiles: n } = this;
    e === null ? s.itemSet.forEach((r) => {
      n.has(r) && s.setMemoryUsage(r, this.getBytesUsed(r));
    }) : s.setMemoryUsage(e, this.getBytesUsed(e));
  }
  preprocessTileset(e, s, n = null) {
    const r = Object.getPrototypeOf(this);
    Object.hasOwn(r, "preprocessTileSet") && console.warn(`${r.constructor.name}: Class overrides deprecated "preprocessTileSet" method. Please rename to "preprocessTileset".`);
    const a = e.asset.version, [i, l] = a.split(".").map((c) => parseInt(c));
    console.assert(
      i <= 1,
      "TilesRenderer: asset.version is expected to be a 1.x or a compatible version."
    ), i === 1 && l > 0 && console.warn("TilesRenderer: tiles versions at 1.1 or higher have limited support. Some new extensions and features may not be supported.");
    let o = s.replace(/\/[^/]*$/, "");
    o = new URL(o, window.location.href).toString(), this.preprocessNode(e.root, o, n);
  }
  preprocessTileSet(...e) {
    return console.warn('TilesRenderer: "preprocessTileSet" has been deprecated. Use "preprocessTileset" instead.'), this.preprocessTileset(...e);
  }
  loadRootTileset() {
    const e = Object.getPrototypeOf(this);
    Object.hasOwn(e, "loadRootTileSet") && console.warn(`${e.constructor.name}: Class overrides deprecated "loadRootTileSet" method. Please rename to "loadRootTileset".`);
    let s = this.rootURL;
    return this.invokeAllPlugins((r) => s = r.preprocessURL ? r.preprocessURL(s, null) : s), this.invokeOnePlugin((r) => r.fetchData && r.fetchData(s, this.fetchOptions)).then((r) => {
      if (r instanceof Response) {
        if (r.ok)
          return r.json();
        throw new Error(`TilesRenderer: Failed to load tileset "${s}" with status ${r.status} : ${r.statusText}`);
      } else return r;
    }).then((r) => (this.preprocessTileset(r, s), r));
  }
  loadRootTileSet(...e) {
    return console.warn('TilesRenderer: "loadRootTileSet" has been deprecated. Use "loadRootTileset" instead.'), this.loadRootTileSet(...e);
  }
  requestTileContents(e) {
    if (e.internal.loadingState !== y)
      return;
    let s = !1, n = null, r = new URL(e.content.uri, e.internal.basePath + "/").toString();
    this.invokeAllPlugins((d) => r = d.preprocessURL ? d.preprocessURL(r, e) : r);
    const a = this.stats, i = this.lruCache, l = this.downloadQueue, o = this.parseQueue, c = this.loadingTiles, u = M(r), v = new AbortController(), h = v.signal;
    if (i.add(e, (d) => {
      v.abort(), s ? d.children.length = 0 : this.invokeAllPlugins((m) => {
        m.disposeTile && m.disposeTile(d);
      }), a.inCache--, this.cachedSinceLoadComplete.has(e) && (this.cachedSinceLoadComplete.delete(e), a.inCacheSinceLoad--), d.internal.loadingState === R ? a.queued-- : d.internal.loadingState === F ? a.downloading-- : d.internal.loadingState === D ? a.parsing-- : d.internal.loadingState === p && a.loaded--, d.internal.loadingState = y, o.remove(d), l.remove(d), c.delete(d);
    }))
      return this.isLoading || (this.isLoading = !0, this.dispatchEvent({ type: "tiles-load-start" })), i.setMemoryUsage(e, this.getBytesUsed(e)), this.cachedSinceLoadComplete.add(e), a.inCacheSinceLoad++, a.inCache++, a.queued++, e.internal.loadingState = R, c.add(e), l.add(e, (d) => {
        if (h.aborted)
          return Promise.resolve();
        e.internal.loadingState = F, a.downloading++, a.queued--;
        const m = this.invokeOnePlugin((T) => T.fetchData && T.fetchData(r, { ...this.fetchOptions, signal: h }));
        return this.dispatchEvent({
          type: "tile-download-start",
          tile: e,
          url: r,
          get uri() {
            return console.warn('tile-download-start event: "uri" has been renamed to "url".'), this.url;
          }
        }), m;
      }).then((d) => {
        if (!h.aborted)
          if (d instanceof Response) {
            if (d.ok)
              return u === "json" ? d.json() : d.arrayBuffer();
            throw new Error(`Failed to load model with error code ${d.status}`);
          } else return d;
      }).then((d) => {
        if (!h.aborted)
          return a.downloading--, a.parsing++, e.internal.loadingState = D, o.add(e, (m) => h.aborted ? Promise.resolve() : u === "json" && d.root ? (this.preprocessTileset(d, r, e), e.children.push(d.root), n = d, s = !0, Promise.resolve()) : this.invokeOnePlugin((T) => T.parseTile && T.parseTile(d, m, u, r, h)));
      }).then(() => {
        if (h.aborted)
          return;
        a.parsing--, a.loaded++, e.internal.loadingState = p, c.delete(e), i.setLoaded(e, !0);
        const d = this.getBytesUsed(e);
        if (i.getMemoryUsage(e) === 0 && d > 0 && i.isFull()) {
          i.remove(e);
          return;
        }
        i.setMemoryUsage(e, d), this.dispatchEvent({ type: "needs-update" }), this.dispatchEvent({ type: "load-content" }), s && this.dispatchEvent({
          type: "load-tileset",
          tileset: n,
          url: r
        }), e.engineData.scene && this.dispatchEvent({
          type: "load-model",
          scene: e.engineData.scene,
          tile: e,
          url: r
        });
      }).catch((d) => {
        h.aborted || (d.name !== "AbortError" ? (o.remove(e), l.remove(e), e.internal.loadingState === R ? a.queued-- : e.internal.loadingState === F ? a.downloading-- : e.internal.loadingState === D ? a.parsing-- : e.internal.loadingState === p && a.loaded--, a.failed++, console.error(`TilesRenderer : Failed to load tile at url "${e.content.uri}".`), console.error(d), e.internal.loadingState = S, c.delete(e), i.setLoaded(e, !0), this.dispatchEvent({
          type: "load-error",
          tile: e,
          error: d,
          url: r
        })) : i.remove(e));
      });
  }
}
function ie(t, e, s, n, r, a) {
  let i;
  switch (n) {
    case "SCALAR":
      i = 1;
      break;
    case "VEC2":
      i = 2;
      break;
    case "VEC3":
      i = 3;
      break;
    case "VEC4":
      i = 4;
      break;
    default:
      throw new Error(`FeatureTable : Feature type not provided for "${a}".`);
  }
  let l;
  const o = s * i;
  switch (r) {
    case "BYTE":
      l = new Int8Array(t, e, o);
      break;
    case "UNSIGNED_BYTE":
      l = new Uint8Array(t, e, o);
      break;
    case "SHORT":
      l = new Int16Array(t, e, o);
      break;
    case "UNSIGNED_SHORT":
      l = new Uint16Array(t, e, o);
      break;
    case "INT":
      l = new Int32Array(t, e, o);
      break;
    case "UNSIGNED_INT":
      l = new Uint32Array(t, e, o);
      break;
    case "FLOAT":
      l = new Float32Array(t, e, o);
      break;
    case "DOUBLE":
      l = new Float64Array(t, e, o);
      break;
    default:
      throw new Error(`FeatureTable : Feature component type not provided for "${a}".`);
  }
  return l;
}
class oe {
  /**
   * @param {ArrayBuffer} buffer
   * @param {number} start - Byte offset of the feature table within the buffer
   * @param {number} headerLength - Byte length of the JSON header
   * @param {number} binLength - Byte length of the binary body
   */
  constructor(e, s, n, r) {
    this.buffer = e, this.binOffset = s + n, this.binLength = r;
    let a = null;
    if (n !== 0) {
      const i = new Uint8Array(e, s, n);
      a = JSON.parse(ue(i));
    } else
      a = {};
    this.header = a;
  }
  /**
   * Returns all property key names defined in the feature table header, excluding `extensions`.
   * @returns {Array<string>}
   */
  getKeys() {
    return Object.keys(this.header).filter((e) => e !== "extensions");
  }
  /**
   * Returns the value for the given property key. For binary properties, reads typed array data
   * from the binary body using the provided count, component type, and vector type.
   * @param {string} key
   * @param {number} count - Number of elements to read for binary properties
   * @param {string | null} [defaultComponentType] - Fallback component type (e.g. `'FLOAT'`, `'UNSIGNED_SHORT'`)
   * @param {string | null} [defaultType] - Fallback vector type (e.g. `'SCALAR'`, `'VEC3'`)
   * @returns {number | string | ArrayBufferView | null}
   */
  getData(e, s, n = null, r = null) {
    const a = this.header;
    if (!(e in a))
      return null;
    const i = a[e];
    if (i instanceof Object) {
      if (Array.isArray(i))
        return i;
      {
        const { buffer: l, binOffset: o, binLength: c } = this, u = i.byteOffset || 0, v = i.type || r, h = i.componentType || n;
        if ("type" in i && r && i.type !== r)
          throw new Error("FeatureTable: Specified type does not match expected type.");
        const f = o + u, d = ie(l, f, s, v, h, e);
        if (f + d.byteLength > o + c)
          throw new Error("FeatureTable: Feature data read outside binary body length.");
        return d;
      }
    } else return i;
  }
  /**
   * Returns a slice of the binary body at the given offset and length.
   * @param {number} byteOffset
   * @param {number} byteLength
   * @returns {ArrayBuffer}
   */
  getBuffer(e, s) {
    const { buffer: n, binOffset: r } = this;
    return n.slice(r + e, r + e + s);
  }
}
class Se {
  constructor(e) {
    this.batchTable = e;
    const s = e.header.extensions["3DTILES_batch_table_hierarchy"];
    this.classes = s.classes;
    for (const r of this.classes) {
      const a = r.instances;
      for (const i in a)
        r.instances[i] = this._parseProperty(a[i], r.length, i);
    }
    if (this.instancesLength = s.instancesLength, this.classIds = this._parseProperty(s.classIds, this.instancesLength, "classIds"), s.parentCounts ? this.parentCounts = this._parseProperty(s.parentCounts, this.instancesLength, "parentCounts") : this.parentCounts = new Array(this.instancesLength).fill(1), s.parentIds) {
      const r = this.parentCounts.reduce((a, i) => a + i, 0);
      this.parentIds = this._parseProperty(s.parentIds, r, "parentIds");
    } else
      this.parentIds = null;
    this.instancesIds = [];
    const n = {};
    for (const r of this.classIds)
      n[r] = n[r] ?? 0, this.instancesIds.push(n[r]), n[r]++;
  }
  _parseProperty(e, s, n) {
    if (Array.isArray(e))
      return e;
    {
      const { buffer: r, binOffset: a } = this.batchTable, i = e.byteOffset, l = e.componentType || "UNSIGNED_SHORT", o = a + i;
      return ie(r, o, s, "SCALAR", l, n);
    }
  }
  getDataFromId(e, s = {}) {
    const n = this.parentCounts[e];
    if (this.parentIds && n > 0) {
      let o = 0;
      for (let c = 0; c < e; c++)
        o += this.parentCounts[c];
      for (let c = 0; c < n; c++) {
        const u = this.parentIds[o + c];
        u !== e && this.getDataFromId(u, s);
      }
    }
    const r = this.classIds[e], a = this.classes[r].instances, i = this.classes[r].name, l = this.instancesIds[e];
    for (const o in a)
      s[i] = s[i] || {}, s[i][o] = a[o][l];
    return s;
  }
}
class we extends oe {
  get batchSize() {
    return console.warn("BatchTable.batchSize has been deprecated and replaced with BatchTable.count."), this.count;
  }
  /**
   * @param {ArrayBuffer} buffer
   * @param {number} count - Number of features in the batch
   * @param {number} start - Byte offset of the batch table within the buffer
   * @param {number} headerLength - Byte length of the JSON header
   * @param {number} binLength - Byte length of the binary body
   */
  constructor(e, s, n, r, a) {
    super(e, n, r, a), this.count = s, this.extensions = {};
    const i = this.header.extensions;
    i && i["3DTILES_batch_table_hierarchy"] && (this.extensions["3DTILES_batch_table_hierarchy"] = new Se(this));
  }
  /**
   * @deprecated Use `getDataFromId` or `getPropertyArray` instead.
   * @param {string} key
   * @param {string | null} [componentType]
   * @param {string | null} [type]
   * @returns {number | string | ArrayBufferView | null}
   */
  getData(e, s = null, n = null) {
    return console.warn("BatchTable: BatchTable.getData is deprecated. Use BatchTable.getDataFromId to get allproperties for an id or BatchTable.getPropertyArray for getting an array of value for a property."), super.getData(e, this.count, s, n);
  }
  /**
   * Returns an object with all properties of the batch table and its extensions for the
   * given feature id. A `target` object can be specified to store the result. Throws if
   * `id` is out of bounds.
   * @param {number} id - Feature index (0 to count - 1)
   * @param {Object} [target={}] - Optional object to write properties into
   * @returns {Object}
   */
  getDataFromId(e, s = {}) {
    if (e < 0 || e >= this.count)
      throw new Error(`BatchTable: id value "${e}" out of bounds for "${this.count}" features number.`);
    for (const n of this.getKeys())
      s[n] = super.getData(n, this.count)[e];
    for (const n in this.extensions) {
      const r = this.extensions[n];
      r.getDataFromId instanceof Function && (s[n] = s[n] || {}, r.getDataFromId(e, s[n]));
    }
    return s;
  }
  /**
   * Returns the array of values for the given property key across all features. Returns
   * `null` if the key is not in the table.
   * @param {string} key
   * @returns {Array | TypedArray | null}
   */
  getPropertyArray(e) {
    return super.getData(e, this.count);
  }
}
class Ue extends fe {
  /**
   * Parses a B3DM buffer and returns the raw tile data.
   * @param {ArrayBuffer} buffer
   * @returns {{ version: string, featureTable: FeatureTable, batchTable: BatchTable, glbBytes: Uint8Array }}
   */
  parse(e) {
    const s = new DataView(e), n = ve(s);
    console.assert(n === "b3dm");
    const r = s.getUint32(4, !0);
    console.assert(r === 1);
    const a = s.getUint32(8, !0);
    console.assert(a === e.byteLength);
    const i = s.getUint32(12, !0), l = s.getUint32(16, !0), o = s.getUint32(20, !0), c = s.getUint32(24, !0), u = 28, v = e.slice(
      u,
      u + i + l
    ), h = new oe(
      v,
      0,
      i,
      l
    ), f = u + i + l, d = e.slice(
      f,
      f + o + c
    ), m = new we(
      d,
      h.getData("BATCH_LENGTH"),
      0,
      o,
      c
    ), T = f + o + c, le = new Uint8Array(e, T, a - T);
    return {
      version: r,
      featureTable: h,
      batchTable: m,
      glbBytes: le
    };
  }
}
export {
  Ue as B,
  oe as F,
  Re as T,
  we as a
};
