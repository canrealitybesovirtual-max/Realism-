// Reset the whole studio: back to the room as it was built, as on a first visit.
// Clears every saved Studio setting and edit (all "studio.*" keys in localStorage: scene autosave and saves,
// spawned/moved/scaled props, hidden/locked objects, room and object scripts, UI settings, window layout,
// door, wrist tablet...), deletes imported models (IndexedDB "studio-assets"), removes
// training enemies, then reloads the page. CQC Loop and Interstate keep their own saves.
// Asks first: arm() starts a 6 s window; a second press (confirm) inside it resets. Buttons: UI Settings
// (System app) "Reset the whole studio", wrist tablet "Reset studio", Commands palette.
// API: window.__studioReset = { arm(), armed(), cancel(), press() (arm or confirm), run() }.
(function () {
  "use strict";
  var WINDOW_MS = 6000, armedAt = 0, running = false, listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); var S = window.__studio, os = S && S.computer && S.computer.os; if (os) os.invalidate(); }
  function log(m, warn) { var S = window.__studio; if (S && S.log) S.log[warn ? "warn" : "info"](m); }
  var R = window.__studioReset = {
    armed: function () { return !running && Date.now() - armedAt < WINDOW_MS; },
    arm: function () { armedAt = Date.now(); log("Reset the whole studio? Press again within 6 s to confirm. Every Studio edit and setting will be lost.", true); changed(); setTimeout(changed, WINDOW_MS + 50); },
    cancel: function () { armedAt = 0; changed(); },
    press: function () { if (R.armed()) { R.run(); return "reset"; } R.arm(); return "armed"; },
    on: function (f) { listeners.push(f); },
    get running() { return running; },
    run: function () {
      if (running) return; running = true; changed();
      log("Resetting the studio…");
      var S = window.__studio;
      // nothing may write a studio key again on the way out (autosave timers, pagehide flush, layout saver)
      try {
        var set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && String(k).indexOf("studio.") === 0) return; return set.call(this, k, v); };
      } catch (e) {}
      try { if (S && S.editor && S.editor.autosaveTimer) { clearTimeout(S.editor.autosaveTimer); S.editor.autosaveTimer = 0; } } catch (e) {}
      try { if (window.__studioEnemies && window.__studioEnemies.clear) window.__studioEnemies.clear(); } catch (e) {}
      var n = 0;
      try {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("studio.") === 0) keys.push(k); }
        keys.forEach(function (k) { localStorage.removeItem(k); n++; });
      } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      var db = new Promise(function (res) {
        try { var rq = indexedDB.deleteDatabase("studio-assets"); rq.onsuccess = rq.onerror = rq.onblocked = function () { res(); }; } catch (e) { res(); }
        setTimeout(res, 1500);
      });
      var xr = new Promise(function (res) {
        try { var ses = S && S.renderer && S.renderer.xr.getSession && S.renderer.xr.getSession(); if (ses) { ses.end().then(res, res); setTimeout(res, 1500); return; } } catch (e) {}
        res();
      });
      console.log("Studio reset: cleared " + n + " saved keys");
      Promise.all([db, xr]).then(function () { location.reload(); });
    }
  };
})();
