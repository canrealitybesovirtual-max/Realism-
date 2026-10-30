// Quest 3S performance guards (Phase 4).
// - Prop limit: a warning at 80 physics props, a soft stop at 100 for new spawns (Game Editor's
//   addThrowable and object-script spawnCopy). The room's own props are never refused.
//   Switch: "Prop limit" in UI Settings (addons/ui.js).
// - Foveation: 0.5 in VR; raised to 0.75 when the Profiler's average frame time passes 12.5 ms for
//   2 s, back to 0.5 after 15 s under 9.5 ms. Desktop is untouched.
(function () {
  "use strict";
  var WARN = 80, LIMIT = 100;
  var FOV_BASE = 0.5, FOV_HIGH = 0.75, SLOW_MS = 12.5, FAST_MS = 9.5;

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.physics) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, P = S.physics, renderer = S.renderer;

    // ---------- prop limit ----------
    // deleted (and hidden) props stay in the list with their body disabled; only live bodies count
    function count() { return P.props ? P.props.filter(function (p) { return !p.body || !p.body.isEnabled || p.body.isEnabled(); }).length : 0; }
    function limitOn() { return window.__studioUI ? window.__studioUI.get("propLimit") : os.storage.get("perf.propLimit") !== "off"; }
    function notify(msg) {
      console.warn("[perf] " + msg);
      var ed = os.apps.get("code");
      if (ed && ed.setStatus) ed.setStatus(msg, true);
    }
    var warned = false;
    if (P && typeof P.addProp === "function") {
      var addProp = P.addProp.bind(P);
      P.addProp = function (desc) {
        var r = addProp(desc);
        var n = count();
        if (n >= WARN && !warned) { warned = true; notify(n + " physics props: frame time may rise on Quest. New spawns stop at " + LIMIT + "."); }
        if (n < WARN - 10) warned = false;
        return r;
      };
    }
    window.__studioProps = {
      warn: WARN, limit: LIMIT, count: count,
      full: function () {
        if (!limitOn() || count() < LIMIT) return false;
        notify("Prop limit reached (" + LIMIT + "). Remove some props to spawn more.");
        return true;
      }
    };

    // ---------- foveation from the Profiler ----------
    var prof = S.profiler, fov = FOV_BASE, slowSince = 0, fastSince = 0;
    function setFov(v) {
      fov = v;
      try { renderer.xr.setFoveation(v); } catch (e) {}
    }
    setInterval(function () {
      if (!renderer.xr.isPresenting || !prof || !prof.history) {
        if (fov !== FOV_BASE) setFov(FOV_BASE);
        slowSince = fastSince = 0;
        return;
      }
      var h = prof.history, n = Math.min(72, h.length);
      if (n < 24) return;
      var sum = 0;
      for (var i = h.length - n; i < h.length; i++) sum += (h[i].ms && h[i].ms.frame) || 0;
      var avg = sum / n, now = performance.now();
      if (avg > SLOW_MS) {
        fastSince = 0; slowSince = slowSince || now;
        if (fov < FOV_HIGH && now - slowSince > 2000) setFov(FOV_HIGH);
      } else if (avg < FAST_MS) {
        slowSince = 0; fastSince = fastSince || now;
        if (fov > FOV_BASE && now - fastSince > 15000) setFov(FOV_BASE);
      } else {
        slowSince = fastSince = 0;
      }
    }, 500);
    window.__studioPerf = { get foveation() { return fov; } };
  });
})();
