// Scene editor additions (Phase 5C), for the Game Editor's Scene tab (the Studio app).
// - Outliner: a show/hide and a lock button on every row. Both are Undo steps and are remembered
//   (storage "editor.outliner"). A hidden physics prop stops colliding. A locked object refuses moves,
//   deletes and physics changes through the engine's own lock check (bundle: entity.userLocked);
//   colour, light and rename stay allowed, as for the room's built-in locked parts.
// - Snap: grid step and angle step (free, 5, 15, 45, 90 degrees) are remembered (storage "editor.snap").
(function () {
  "use strict";

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.editor && os.apps.get("studio") && window.__studioProject) resolve({ S: s, os: os }); // after the autosave restore
        else setTimeout(check, 250);
      })();
    });
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, ed = S.editor, world = ed.world, studio = os.apps.get("studio");
    var P = S.physics;

    // ---------- shared: one Undo step ----------
    function step(label, doFn, undoFn) {
      var H = ed.history;
      doFn();
      var op = { label: label, live: true, do: doFn, undo: undoFn };
      H.done.push(op);
      if (H.done.length > H.limit) H.onEvict(H.done.shift());
      H.undone.length = 0;
      H.onChange(op, "do");
      if (S.log) S.log.info(label);
    }

    // ---------- hide / lock ----------
    var state = { hidden: [], locked: [] };
    try { var raw = JSON.parse(os.storage.get("editor.outliner") || "{}"); state.hidden = raw.hidden || []; state.locked = raw.locked || []; } catch (e) {}
    function save() { os.storage.set("editor.outliner", JSON.stringify(state)); }
    function setList(list, id, on) { var i = list.indexOf(id); if (on && i < 0) list.push(id); if (!on && i >= 0) list.splice(i, 1); }
    function setHidden(e, hidden) {
      e.object.visible = !hidden;
      if (e.prop && P && P.setPropEnabled) { try { P.setPropEnabled(e.prop, !hidden); } catch (err) {} }
      setList(state.hidden, e.id, hidden); save();
      try { S.renderer.shadowMap.needsUpdate = true; } catch (err) {}
      os.invalidate();
    }
    function setLocked(e, locked) { e.userLocked = locked; setList(state.locked, e.id, locked); save(); os.invalidate(); }
    state.hidden.slice().forEach(function (id) { var e = world.get(id); if (e && !e.deleted) setHidden(e, true); });
    state.locked.slice().forEach(function (id) { var e = world.get(id); if (e && !e.deleted) setLocked(e, true); });
    function isHidden(e) { return state.hidden.indexOf(e.id) >= 0; }

    function drawEye(c, x, y, on) {
      c.save(); c.strokeStyle = on ? "#c8ccd4" : "#5c6270"; c.fillStyle = c.strokeStyle; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
      if (!on) { c.beginPath(); c.moveTo(x - 11, y + 8); c.lineTo(x + 11, y - 8); c.stroke(); }
      c.restore();
    }
    function drawLock(c, x, y, on) {
      c.save(); c.strokeStyle = on ? "#ffd36b" : "#5c6270"; c.fillStyle = c.strokeStyle; c.lineWidth = 2;
      c.fillRect(x - 7, y - 1, 14, 10);
      c.beginPath(); if (on) c.arc(x, y - 2, 5, Math.PI, 0); else c.arc(x + 5, y - 3, 5, Math.PI, Math.PI * 1.9); c.stroke();
      c.restore();
    }
    var hierarchy = studio.hierarchy.bind(studio);
    studio.hierarchy = function (c, t, n, r, i) {
      hierarchy(c, t, n, r, i);
      var area = this.areas.list, list = world.search(this.search, this.layer), self = this;
      c.save(); c.beginPath(); c.rect(area.x, area.y, area.w, area.h); c.clip();
      list.forEach(function (e, k) {
        var y = area.y + k * 34 - self.listScroll;
        if (y + 34 < area.y || y > area.y + area.h) return;
        var ex = t + r - 62, lx = t + r - 28, cy = y + 17;
        drawEye(c, ex, cy, !isHidden(e));
        self.hits.push({ x: ex - 14, y: y, w: 28, h: 34, cursor: "pointer", up: function () {
          var h = isHidden(e);
          step((h ? "Show " : "Hide ") + e.name, function () { setHidden(e, !h); }, function () { setHidden(e, h); });
        } });
        if (!e.locked) {
          drawLock(c, lx, cy, !!e.userLocked);
          self.hits.push({ x: lx - 14, y: y, w: 28, h: 34, cursor: "pointer", up: function () {
            var l = !!e.userLocked;
            step((l ? "Unlock " : "Lock ") + e.name, function () { setLocked(e, !l); }, function () { setLocked(e, l); });
          } });
        }
      });
      c.restore();
    };

    // ---------- snap settings, remembered ----------
    try {
      var sn = JSON.parse(os.storage.get("editor.snap") || "null");
      if (sn) { if (typeof sn.grid === "number") ed.snap.grid = sn.grid; if (typeof sn.angle === "number") ed.snap.angle = sn.angle; }
    } catch (e) {}
    var snapSig = ed.snap.grid + "|" + ed.snap.angle;
    setInterval(function () {
      var sig = ed.snap.grid + "|" + ed.snap.angle;
      if (sig !== snapSig) { snapSig = sig; os.storage.set("editor.snap", JSON.stringify({ grid: ed.snap.grid, angle: ed.snap.angle })); }
    }, 1000);

    window.__studioScene = { step: step, setHidden: setHidden, setLocked: setLocked, isHidden: isHidden };
  });
})();
