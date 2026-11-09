/* ============================================================================
 *  XBOX MODE (cqc/xbox/xbox-mode.js) — the console's own rendering and performance configuration.
 *
 *  A classic script (no modules, no top-level await, ES2019 syntax: the console's Edge rejected newer syntax),
 *  loaded before the title script and the game module. It only DEFINES things; nothing here touches the page,
 *  the renderer or the game unless Xbox mode is active. Everything Xbox-specific in the game asks one question:
 *  window.CQCXbox.active (UniversalPlatformManager.isXbox()).
 *
 *  Parts:
 *    XboxModeDetector        which device this is, and why (confirmed / probable / manual / forced off)
 *    XboxQualityManager      the three Xbox profiles: performance, balanced (default), quality
 *    XboxRendererConfig      snapshot the renderer's own settings, apply the Xbox ones, restore the snapshot
 *    XboxPerformanceManager  60 fps target: render scale up / down with hysteresis and cooldowns, 1 s windows
 *    XboxDiagnostics         an overlay (off unless asked for): mode, detection, profile, fps, frame time,
 *                            draw calls, triangles, geometries, textures, pixel ratio, renderer
 *    UniversalPlatformManager the one entry point: platform name, isXbox(), the game's hooks
 *
 *  Activation (stored choice beats detection; the address beats both):
 *    ?xbox=on | ?xbox=off | ?xbox=auto     this visit (on = manual, off = never, auto = detection)
 *    localStorage cqc.xbox.v1 = on|off|auto the saved choice (the title screen's Xbox mode button writes it)
 *    ?xboxprofile=performance|balanced|quality, localStorage cqc.xbox.profile.v1
 *    ?xboxdiag (or Ctrl+Shift+D, or both stick clicks held 1 s on the pad) shows the diagnostics overlay
 *  A mode or profile change applies on the next load: the profiles choose which shader programs are built, and
 *  three.js programs cannot be swapped under a running game without recompiling everything (the console's slowest
 *  operation). The renderer-level part (render scale) is applied and restored live.
 * ========================================================================== */
(function () {
  'use strict';
  var KEY_MODE = 'cqc.xbox.v1', KEY_PROFILE = 'cqc.xbox.profile.v1';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function qp(name) { var m = new RegExp('[?&]' + name + '(?:=([a-z]+))?\\b', 'i').exec(location.search); return m ? (m[1] || 'on').toLowerCase() : null; }

  /* ---------------------------------------------------------------- detector
   * Signals:
   *   ua        the user agent names the console ("Xbox; Xbox One", "Xbox Series"). Edge on Xbox sends it by
   *             default: CONFIRMED.
   *   emu       navigator.gamepadInputEmulation exists (Edge's console feature that turns the pad into a mouse).
   *             Without the ua signal it is PROBABLE only when nothing says it is a PC: no fine pointer that can
   *             hover (a real mouse), and a Windows platform string (Edge on Xbox reports Windows).
   *   A Windows PC with a mouse never becomes Xbox by itself; it can only be switched on by hand (MANUAL).
   */
  var XboxModeDetector = {
    detect: function () {
      var ua = navigator.userAgent || '';
      var s = {
        ua: /\bXbox\b/i.test(ua),
        emu: 'gamepadInputEmulation' in navigator,
        windows: /Windows/i.test(ua),
        mouse: !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches),
        webgl2: typeof window.WebGL2RenderingContext === 'function',
        gamepadApi: typeof navigator.getGamepads === 'function'
      };
      var q = qp('xbox'), saved = lsGet(KEY_MODE), choice = q === 'on' || q === 'off' || q === 'auto' ? q : (saved === 'on' || saved === 'off' ? saved : 'auto');
      // older builds kept a sticky "xbox" device key that any detection wrote; it is not a user choice, so it is dropped
      if (lsGet('cqc.device.v1') === 'xbox') lsSet('cqc.device.v1', null);
      var detected = s.ua ? 'confirmed' : (s.emu && s.windows && !s.mouse ? 'probable' : 'none');
      var active, source;
      if (choice === 'off') { active = false; source = 'forced off'; }
      else if (choice === 'on') { active = true; source = detected === 'none' ? 'manual' : 'manual (also ' + detected + ')'; }
      else { active = detected !== 'none'; source = detected === 'none' ? 'not an Xbox' : 'detected (' + detected + ')'; }
      return { active: active, source: source, detected: detected, choice: choice, signals: s };
    },
    setChoice: function (v) { lsSet(KEY_MODE, v === 'on' || v === 'off' ? v : null); }
  };

  /* ---------------------------------------------------------------- profiles
   * scale: render scale of the window's size (start, lower bound, upper bound): the performance manager moves
   *        between the bounds. post: the post chain (bloom, film grade, SMAA) or straight to the screen.
   * texCap: largest texture side uploaded (px). off: game features built without (fewer, cheaper shader programs).
   * enemyLod: distances (m) where the men switch to 30 % / 10 % of their triangles. minPx: small parts stop
   * drawing under this many pixels. poseHz: rate men outside the view are posed. gore: blood detail.
   */
  var BASE_OFF = ['bounce', 'tfill', 'pdmg', 'handshadow', 'dazzle', 'beam', 'shelflight', 'buildview', 'mv', 'stills', 'vmh', 'glove104', 'vmsleeves'];   // the computer arms (vm) stay on: they are loaded while the game prepares, not at the first pickup
  var PROFILES = {
    performance: {
      label: 'Xbox Performance', scale: [0.75, 0.6, 0.85], post: false, texCap: 256, minPx: 2.5, poseHz: 8, enemyLod: [3.5, 9], gore: 'mild',
      off: BASE_OFF.concat(['trickle', 'mblast', 'wisp', 'laserbeam', 'splash', 'wetstep', 'glass', 'fixtures', 'canheat', 'amb', 'ambbed', 'surf', 'wear', 'wallwear', 'propwear', 'bodywear', 'torchhaze', 'benchlamp'])
    },
    balanced: {
      label: 'Xbox Balanced', scale: [0.85, 0.7, 1.0], post: false, texCap: 256, minPx: 2, poseHz: 10, enemyLod: [4.5, 12], gore: 'mild',
      off: BASE_OFF.concat(['trickle', 'mblast', 'wisp', 'laserbeam', 'splash', 'wetstep', 'glass', 'fixtures', 'canheat', 'amb', 'ambbed', 'surf', 'wear', 'wallwear', 'propwear', 'bodywear', 'torchhaze', 'benchlamp'])
    },
    quality: {
      label: 'Xbox Quality', scale: [1.0, 0.8, 1.0], post: true, texCap: 512, minPx: 1.5, poseHz: 15, enemyLod: [5.5, 14], gore: null,
      off: BASE_OFF.concat(['canheat', 'amb', 'ambbed', 'surf', 'propwear', 'bodywear'])
    }
  };
  var XboxQualityManager = {
    PROFILES: PROFILES,
    name: function () {
      var q = qp('xboxprofile'), s = lsGet(KEY_PROFILE), n = PROFILES[q] ? q : PROFILES[s] ? s : 'performance';   // default: the lightest (the console's frame time goes to the people and shots)
      return n;
    },
    profile: function () { return PROFILES[this.name()]; },
    set: function (n) { if (PROFILES[n]) lsSet(KEY_PROFILE, n); },
    next: function () { var k = Object.keys(PROFILES), i = (k.indexOf(this.name()) + 1) % k.length; this.set(k[i]); return k[i]; },
    // the game's load-time feature switches for this profile ("&flag=off" each; an OPTIONS switch set on wins)
    flags: function (opt) {
      var p = this.profile(), out = '';
      for (var i = 0; i < p.off.length; i++) if (!opt || opt[p.off[i]] !== 'on') out += '&' + p.off[i] + '=off';
      if (p.gore && !(opt && opt.gore)) out += '&gore=' + p.gore;
      return out;
    }
  };

  /* ---------------------------------------------------------------- renderer config
   * Only the settings the Xbox profile changes are snapshotted and restored, so leaving Xbox mode puts back exactly
   * what the game had set (pixel ratio, size): nothing else on the renderer is ever touched here.
   */
  var XboxRendererConfig = {
    snap: null,
    // context options: the console's GPU, no MSAA on the default framebuffer (the post chain or FXAA-free direct path)
    contextOptions: function () {
      return [{ antialias: false, powerPreference: 'high-performance' }, { antialias: false }, { antialias: false, stencil: false, failIfMajorPerformanceCaveat: false }, { antialias: false, powerPreference: 'low-power' }];
    },
    snapshot: function (renderer) { this.snap = { pr: renderer.getPixelRatio() }; return this.snap; },
    apply: function (renderer, pr, onResize) {
      if (!this.snap) this.snapshot(renderer);
      if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) { renderer.setPixelRatio(pr); if (onResize) onResize(pr); }
    },
    restore: function (renderer, onResize) {
      if (!this.snap) return;
      var pr = this.snap.pr; this.snap = null;
      if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) { renderer.setPixelRatio(pr); if (onResize) onResize(pr); }
    },
    // what this browser's WebGL can do (read from the game's own context: no probe context, the console allows few)
    caps: function (renderer) {
      var gl = renderer.getContext(), c = { webgl2: !!(window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext) };
      try {
        c.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        c.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
        var x = gl.getExtension('WEBGL_debug_renderer_info');
        c.renderer = String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        c.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
        c.halfFloatLinear = !!gl.getExtension('OES_texture_float_linear');
        c.s3tc = !!gl.getExtension('WEBGL_compressed_texture_s3tc');
        c.astc = !!gl.getExtension('WEBGL_compressed_texture_astc');
        c.etc = !!gl.getExtension('WEBGL_compressed_texture_etc');
        c.parallelCompile = !!gl.getExtension('KHR_parallel_shader_compile');
        c.highp = (function () { var f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return !!(f && f.precision > 0); })();
      } catch (e) { /* partial */ }
      if (performance && performance.memory) c.heapLimitMB = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
      c.deviceMemoryGB = navigator.deviceMemory || null;
      return c;
    }
  };

  /* ---------------------------------------------------------------- performance manager
   * Cheap per frame (one add); judged once a second. A window under 54 fps (or a slow 95th-ish frame) is "bad",
   * over 58.5 fps with no frame over 22 ms is "good". Two bad windows in a row drop the scale one step (0.05 when
   * close, 0.1 when far off); eight good windows in a row raise it one step. After any change: 6 s cooldown. A step
   * that was dropped from is only retried after twice the wait (it doubles each time it fails, to 120 s), so the
   * scale never ping-pongs. Windows with a single stall over 250 ms (a room switching on, a compile) are ignored.
   */
  function XboxPerformanceManager(profile, apply) {
    this.min = profile.scale[1]; this.max = profile.scale[2]; this.scale = profile.scale[0];
    this.apply = apply; this.n = 0; this.t = 0; this.worst = 0; this.slow = 0;
    this.bad = 0; this.good = 0; this.cool = 0; this.retry = {}; this.fps = 0; this.ms = 0; this.changes = 0; this.paused = false;
  }
  XboxPerformanceManager.prototype.tick = function (dt, now) {
    if (this.paused || !(dt > 0)) return;
    this.n++; this.t += dt; if (dt > this.worst) this.worst = dt; if (dt > 1 / 45) this.slow++;
    if (this.t < 1) return;
    var fps = this.n / this.t, stall = this.worst > 0.25, slowShare = this.slow / this.n;
    this.fps = fps; this.ms = 1000 * this.t / this.n;
    this.n = 0; this.t = 0; this.worst = 0; this.slow = 0;
    if (stall || now < this.cool) return;
    if (fps < 54 || slowShare > 0.12) { this.good = 0; if (++this.bad >= 2) this.step(fps < 45 ? -0.1 : -0.05, now); }
    else if (fps > 58.5 && slowShare < 0.02) { this.bad = 0; if (++this.good >= 8) this.step(0.05, now); }
    else { this.bad = 0; this.good = 0; }
  };
  XboxPerformanceManager.prototype.step = function (d, now) {
    var s = Math.round(Math.min(this.max, Math.max(this.min, this.scale + d)) * 100) / 100;
    this.bad = 0; this.good = 0;
    if (s === this.scale) return;
    var key = s.toFixed(2);
    if (d > 0) { var r = this.retry[key]; if (r && now < r.at) return; }
    else { var k0 = this.scale.toFixed(2), r0 = this.retry[k0] || { wait: 15 }; r0.wait = Math.min(120, r0.wait * 2); r0.at = now + r0.wait; this.retry[k0] = r0; }
    this.scale = s; this.changes++; this.cool = now + 6;
    this.apply(s);
  };

  /* ---------------------------------------------------------------- diagnostics overlay (off by default) */
  var XboxDiagnostics = {
    el: null, on: false, last: 0,
    toggle: function (v) {
      this.on = typeof v === 'boolean' ? v : !this.on;
      if (this.on && !this.el) {
        this.el = document.createElement('pre');
        this.el.style.cssText = 'position:fixed;left:12px;top:12px;z-index:1000;margin:0;padding:10px 12px;background:rgba(0,0,0,.72);color:#bff5a8;font:13px/1.35 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
        document.body.appendChild(this.el);
      }
      if (this.el) this.el.style.display = this.on ? 'block' : 'none';
    },
    // twice a second; the game resets renderer.info at the start of each frame and counts the whole frame (post passes
    // included), so the numbers read between frames are the last frame's
    update: function (now, renderer, P) {
      if (!this.on || now - this.last < 0.5) return;
      this.last = now;
      var I = renderer.info, calls = I.render.calls, tris = I.render.triangles;
      var D = P.state, pm = P.perf, c = P.caps || {};
      this.el.textContent =
        'platform   ' + P.platform() + (D.active ? '  (Xbox mode ON)' : '') + '\n' +
        'detection  ' + D.source + '  [ua ' + (D.signals.ua ? 'yes' : 'no') + ', input emulation ' + (D.signals.emu ? 'yes' : 'no') + ', mouse ' + (D.signals.mouse ? 'yes' : 'no') + ']\n' +
        'profile    ' + (D.active ? XboxQualityManager.profile().label : '(not Xbox)') + '\n' +
        'fps        ' + (pm ? pm.fps.toFixed(1) : '-') + '   frame ' + (pm ? pm.ms.toFixed(1) : '-') + ' ms\n' +
        'scale      ' + (pm ? pm.scale.toFixed(2) + ' (' + pm.min + '-' + pm.max + ', ' + pm.changes + ' changes)' : '-') + '   pixel ratio ' + renderer.getPixelRatio().toFixed(2) + '\n' +
        'draw calls ' + Math.round(calls) + '   triangles ' + Math.round(tris) + '\n' +
        'geometries ' + I.memory.geometries + '   textures ' + I.memory.textures + '   programs ' + (I.programs ? I.programs.length : '-') + '\n' +
        'gpu        ' + (c.renderer || '?') + '\n' +
        'webgl2 ' + (c.webgl2 ? 'yes' : 'NO') + '  max texture ' + (c.maxTexture || '?') + '  float targets ' + (c.floatTargets ? 'yes' : 'no') + '  parallel compile ' + (c.parallelCompile ? 'yes' : 'no') + (c.heapLimitMB ? '  heap limit ' + c.heapLimitMB + ' MB' : '');
    }
  };

  /* ---------------------------------------------------------------- platform manager (the one entry point) */
  var state = XboxModeDetector.detect();
  var UniversalPlatformManager = {
    state: state,
    active: state.active,
    perf: null, caps: null, renderer: null, onResize: null,
    isXbox: function () { return this.active; },
    platform: function () {
      if (this.active) return 'xbox';
      var ua = navigator.userAgent || '';
      if (/OculusBrowser|Quest|Pico|Wolvic/i.test(ua)) return 'vr';
      if (window.matchMedia && matchMedia('(pointer: coarse)').matches) return 'mobile';
      return 'pc';
    },
    profileName: function () { return this.active ? XboxQualityManager.name() : null; },
    profile: function () { return this.active ? XboxQualityManager.profile() : null; },
    flags: function (opt) { return this.active ? XboxQualityManager.flags(opt) : ''; },
    contextOptions: function () { return this.active ? XboxRendererConfig.contextOptions() : null; },
    // after the game's renderer exists (Xbox mode only): snapshot it, set the profile's start scale, start the controller
    attach: function (renderer, onResize) {
      this.renderer = renderer;                       // kept on every platform for the optional overlay only
      if (!this.active) return;
      this.onResize = onResize;
      try { this.caps = XboxRendererConfig.caps(renderer); } catch (e) { this.caps = {}; }
      var self = this, base = Math.max(1, Math.min(window.devicePixelRatio || 1, 1));   // TV output: the window's own pixels
      this.base = base;
      XboxRendererConfig.snapshot(renderer);
      this.perf = new XboxPerformanceManager(XboxQualityManager.profile(), function (s) { XboxRendererConfig.apply(self.renderer, self.base * s, self.onResize); });
      XboxRendererConfig.apply(renderer, base * this.perf.scale, onResize);
    },
    // per frame (Xbox mode only): one add in the controller, the overlay twice a second
    frame: function (dt, now, presenting) {
      if (XboxDiagnostics.on && this.renderer) XboxDiagnostics.update(now, this.renderer, this);   // only when asked for
      if (!this.active || presenting) return;
      if (this.perf) this.perf.tick(dt, now);
    },
    // leave Xbox mode live (renderer part; the load-time profile switches go on the next load)
    deactivate: function () {
      if (!this.active) return;
      if (this.perf) this.perf.paused = true;
      if (this.renderer) XboxRendererConfig.restore(this.renderer, this.onResize);
      this.perf = null; this.active = false;
    },
    setMode: function (v) { XboxModeDetector.setChoice(v); },
    nextProfile: function () { return XboxQualityManager.next(); },
    diagnostics: XboxDiagnostics,
    XboxModeDetector: XboxModeDetector, XboxQualityManager: XboxQualityManager, XboxRendererConfig: XboxRendererConfig,
    XboxPerformanceManager: XboxPerformanceManager, XboxDiagnostics: XboxDiagnostics
  };
  // the overlay can be asked for on any platform (it reads the renderer only); Xbox controls stay Xbox-only
  if (qp('xboxdiag')) setTimeout(function () { XboxDiagnostics.toggle(true); }, 0);
  window.addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') { XboxDiagnostics.toggle(); e.preventDefault(); } });
  window.CQCXbox = UniversalPlatformManager;
})();
