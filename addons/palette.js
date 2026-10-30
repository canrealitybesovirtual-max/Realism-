// Command palette (Phase 5D): Ctrl+K anywhere on the computer, or the ⌘ button in the Game Editor.
// Type to filter, Up/Down to choose, Enter or click to run, Esc to close. The list is built from the
// actions below and from the command registry (commands.json, addons/commands.js).
(function () {
  "use strict";

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && window.__studioUI && os.apps.get("code")) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // every word typed must start a word of the label or group, in any order
  function matches(a, q) {
    if (!q) return true;
    var hay = (a.label + " " + a.group + " " + (a.keys || "")).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) === 0 || hay.indexOf(" " + w) >= 0; });
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, UI = window.__studioUI;
    var FONT = os.fonts.ui;

    function editor() { return os.apps.get("code"); }
    function openTab(tab) { var e = editor(); os.openApp("code"); if (e && e.setMode) e.setMode(tab); }
    function openApp(id) { if (os.apps.get(id)) os.openApp(id); }
    function say(msg, err) { var e = editor(); if (e && e.setStatus) e.setStatus(msg, !!err); if (S.log) S.log[err ? "warn" : "info"](msg); }

    function actions() {
      var A = [], R = S.runtime, ed = S.editor, H = ed && ed.history, rally = window.__rally, P = window.__studioProject;
      function add(group, label, run, keys, enabled) { A.push({ group: group, label: label, run: run, keys: keys, enabled: enabled !== false }); }
      if (R) {
        add("Game", "Play", function () { R.play(); }, "start run", R.mode !== "play");
        add("Game", "Pause", function () { R.pause(); }, "", R.mode === "play");
        add("Game", "Stop and put the room back", function () { R.stop(); }, "stop reset", R.mode !== "edit");
      }
      if (H) {
        add("Edit", "Undo" + (H.canUndo ? ": " + H.undoLabel : ""), function () { ed.undo(); }, "back", H.canUndo);
        add("Edit", "Redo" + (H.canRedo ? ": " + H.redoLabel : ""), function () { ed.redo(); }, "again", H.canRedo);
      }
      add("Game Editor", "Ask Claude", function () { openTab("ask"); }, "assistant ai");
      add("Game Editor", "Scene", function () { openTab("scene"); }, "outliner inspector objects select");
      add("Game Editor", "Room script", function () { openTab("code"); }, "code javascript");
      add("Game Editor", "Run the room script", function () { openTab("code"); var e = editor(); e && e.run && e.run(); }, "execute");
      add("Game Editor", "Object scripts", function () { openTab("objects"); }, "code behaviours");
      [["props", "Props", "library crate cone spawn objects"], ["console", "Console", "log errors"], ["profiler", "Profiler", "performance frame time"], ["assets", "Assets", "models import"], ["logic", "Logic", "nodes graph"],
       ["door", "Door", "rooms travel"], ["video", "Video", "player movie"], ["notes", "Notes", "text"], ["calculator", "Calculator", ""], ["sketch", "Sketch", "draw"]].forEach(function (a) {
        if (os.apps.get(a[0]) && (a[0] !== "console" || UI.get("console"))) add("Open", a[1], function () { openApp(a[0]); }, a[2]);
      });
      add("Open", "UI Settings", function () { var sys = os.apps.get("system"); os.openApp("system"); if (sys) { sys.page = "ui"; os.invalidate(); } }, "system preferences options");
      if (rally) {
        add("Travel", "Go to Snowy Mountain Rally", function () { rally.enterMap("rally"); }, "drive snow");
        if (rally.goInterstate) add("Travel", "Go to Interstate", function () { rally.goInterstate(); }, "highway drive traffic");
        if (rally.goCQC) add("Travel", "Go to CQC Loop", function () { rally.goCQC(); }, "close quarters combat shooting rooms");
      }
      var EN = window.__studioEnemies;
      if (EN && EN.spawn) {
        add("Enemies", "Spawn an enemy: FSB operator", function () { EN.spawn("fsb"); }, "enemy spawner cqc target dummy man");
        add("Enemies", "Spawn an enemy: Soldier", function () { EN.spawn("soldier"); }, "enemy spawner cqc target dummy man");
        add("Enemies", "Remove all enemies", function () { EN.clear(); }, "enemy delete clear", EN.count() > 0);
        add("Enemies", (EN.getUp ? "Enemies stay down when shot" : "Enemies get back up after a fall"), function () { EN.setGetUp(!EN.getUp); }, "enemy dummy respawn");
      }
      var RS = window.__studioReset;
      if (RS) add("Studio", RS.armed() ? "Yes, reset the whole studio now" : "Reset the whole studio\u2026 (asks again)", function () { RS.press(); }, "reset clear wipe factory default start over new");
      if (!UI.safe) {
        add("UI", "Preset: Minimal", function () { UI.apply("minimal"); }, "simple");
        add("UI", "Preset: Comfort", function () { UI.apply("comfort"); });
        add("UI", "Preset: Full", function () { UI.apply("full"); }, "all");
      }
      UI.features.forEach(function (f) {
        if (f.type === "choice") {
          f.options.forEach(function (o) { add("UI", f.label + ": " + o[1], function () { UI.setValue(f.key, o[0]); }, "size zoom bigger smaller text", UI.value(f.key) !== o[0]); });
        } else {
          var on = UI.get(f.key);
          add("UI", (on ? "Turn off " : "Turn on ") + f.label, function () { UI.set(f.key, !on); }, "switch toggle", !(UI.safe && f.key in { wristTablet: 1, console: 1, statusBar: 1, undoButtons: 1, playControls: 1, savedLayout: 1, editorHelpers: 1, palette: 1, pointerLabels: 1 }));
        }
      });
      if (ed && ed.snap) {
        [[0, "off"], [0.05, "5 cm"], [0.1, "10 cm"], [0.25, "25 cm"]].forEach(function (g) { add("Snap", "Grid " + g[1], function () { ed.snap.grid = g[0]; }, "move step", ed.snap.grid !== g[0]); });
        [[0, "free"], [5, "5°"], [15, "15°"], [45, "45°"], [90, "90°"]].forEach(function (g) { add("Snap", "Angle " + g[1], function () { ed.snap.angle = g[0]; }, "rotate step degrees", ed.snap.angle !== g[0]); });
      }
      if (P) {
        add("Project", "Export project to a file", function () { var n = P.exportProject(); say(n ? "Exported " + n : "Export failed; see the Console.", !n); }, "save download backup");
        add("Project", "Import a project file", function () { P.importProject(function (err) { if (err) say("Import: " + err, true); }); }, "load open upload");
        if (os.storage.get("project.backup")) add("Project", "Undo the last import", function () { var err = P.undoImport(); if (err) say(err, true); }, "revert backup");
      }
      return A;
    }

    class PaletteApp {
      id = "palette"; title = "Commands";
      defaultRect = { x: 510, y: 140, w: 900, h: 640 }; minSize = [600, 400];
      q = ""; sel = 0; scroll = 0; rowH = 48; list = []; hits = []; lastRect = null;
      constructor(o) { this.os = o; }
      // Rows: a typed command first ("Run: ..."), then app actions, then registry examples. With an empty
      // box: favourites, recent commands, actions and every registry command by group. Picking an example
      // fills the box so it can be edited before Enter.
      refresh() {
        var q = this.q, C = window.__studioCommands, items = [], ready = C && C.ready;
        function examples(filter) {
          return C.registry.commands.filter(filter).map(function (c) {
            return { label: c.example, group: c.group + (c.status === "planned" ? " · later" : ""), fill: c.example, dim: c.status === "planned" };
          });
        }
        if (q) {
          var m = ready && C.match(q);
          if (m) items.push({ label: (m.cmd.status === "planned" ? "Later: " : "Run: ") + q, group: m.cmd.group, cmd: q, dim: m.cmd.status === "planned" });
          else if (ready) C.suggest(q).forEach(function (ex) { items.push({ label: "Did you mean: " + ex, group: "Command", fill: ex }); });
          actions().filter(function (a) { return a.enabled && matches(a, q); }).forEach(function (a) { items.push(a); });
          if (ready) {
            var words = C.normalize(q).split(" ").filter(Boolean);
            items = items.concat(examples(function (c) {
              var hay = (c.example + " " + c.phrases.join(" ") + " " + c.group).toLowerCase();
              return words.every(function (w) { return hay.indexOf(w) >= 0; }) && (!m || c !== m.cmd);
            }).slice(0, 8));
          }
        } else {
          var b = this.browse;
          if (ready) {
            C.favorites().forEach(function (f) { items.push({ label: f, group: "Favourite", cmd: f }); });
            C.recent().slice(0, b === "recent" ? 20 : 5).forEach(function (f) { items.push({ label: f, group: "Recent", cmd: f }); });
          }
          if (b === "recent") { /* only recent */ }
          else if (typeof b === "string" && ready) items = items.concat(examples(function (c) { return c.group === b; }));
          else {
            if (!b) actions().filter(function (a) { return a.enabled; }).forEach(function (a) { items.push(a); });
            if (ready) items = items.concat(examples(function () { return true; }));
          }
        }
        this.list = items;
        if (this.sel >= this.list.length) this.sel = Math.max(0, this.list.length - 1);
      }
      draw(c, r, focused, t) {
        this.lastRect = r; this.hits = [];
        this.refresh();
        c.fillStyle = "#ffffff"; c.fillRect(r.x, r.y, r.w, r.h);
        rr(c, r.x + 16, r.y + 14, r.w - 32, 52, 12); c.fillStyle = "#f2f2f5"; c.fill();
        c.font = "500 22px " + FONT; c.textBaseline = "middle";
        c.fillStyle = this.q ? "#1d1d1f" : "#9a9aa0";
        var shown = this.q || "Type a command, e.g. add a box";
        c.fillText(shown, r.x + 34, r.y + 41);
        if (this.q && Math.floor(t / 500) % 2 === 0) { var cw = c.measureText(this.q).width; c.fillStyle = "#0a84ff"; c.fillRect(r.x + 36 + cw, r.y + 27, 2, 28); }
        var top = r.y + 80, vis = Math.floor((r.h - 80 - 40 - (this.reply ? 48 : 0)) / this.rowH);
        if (this.sel < this.scroll) this.scroll = this.sel;
        if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
        var self = this;
        if (!this.list.length) { c.fillStyle = "#8a8a8e"; c.font = "400 19px " + FONT; c.fillText("No command matches.", r.x + 34, top + 24); }
        this.list.slice(this.scroll, this.scroll + vis).forEach(function (a, k) {
          var i = self.scroll + k, y = top + k * self.rowH, on = i === self.sel;
          if (on) { rr(c, r.x + 12, y, r.w - 24, self.rowH - 4, 10); c.fillStyle = "#0a84ff"; c.fill(); }
          c.fillStyle = on ? "#ffffff" : a.dim ? "#a1a1a6" : "#1d1d1f"; c.font = (a.cmd && !a.dim ? "600 20px " : "500 20px ") + FONT;
          var lbl = a.label; while (lbl.length > 4 && c.measureText(lbl).width > r.w - 260) lbl = lbl.slice(0, -2);
          c.fillText(lbl === a.label ? lbl : lbl + "…", r.x + 34, y + self.rowH / 2 - 2);
          c.fillStyle = on ? "rgba(255,255,255,.8)" : "#8a8a8e"; c.font = "500 15px " + FONT; c.textAlign = "right";
          c.fillText(a.group, r.x + r.w - 34, y + self.rowH / 2 - 2); c.textAlign = "left";
          self.hits.push({ x: 12, y: y - r.y, w: r.w - 24, h: self.rowH - 4, i: i });
        });
        if (this.reply) {
          var ry = r.y + r.h - 86;
          rr(c, r.x + 16, ry, r.w - 32, 40, 10); c.fillStyle = this.replyOk ? "#e8f6ec" : "#fdeceb"; c.fill();
          c.fillStyle = this.replyOk ? "#1f6f43" : "#a3241b"; c.font = "500 17px " + FONT;
          var rep = this.reply; while (rep.length > 4 && c.measureText(rep).width > r.w - 70) rep = rep.slice(0, -2);
          c.fillText(rep === this.reply ? rep : rep + "…", r.x + 30, ry + 21);
        }
        c.fillStyle = "#8a8a8e"; c.font = "400 15px " + FONT;
        c.fillText("Type a command or search.   ↑ ↓ choose   Enter run   Esc close", r.x + 22, r.y + r.h - 20);
        c.textBaseline = "alphabetic";
      }
      animating(focused, t) { var ph = Math.floor(t / 500); if (focused && ph !== this.blink) { this.blink = ph; return true; } return false; }
      cursor(x, y) { return this.hits.some(function (h) { return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h; }) ? "pointer" : "arrow"; }
      pointerMove(x, y) {
        for (var k = 0; k < this.hits.length; k++) { var h = this.hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && this.sel !== h.i) { this.sel = h.i; this.os.invalidate(); } }
      }
      pointerUp(x, y) {
        for (var k = 0; k < this.hits.length; k++) { var h = this.hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { this.sel = h.i; this.runSelected(); return; } }
      }
      wheel(d) { this.sel = Math.max(0, Math.min(this.list.length - 1, this.sel + Math.sign(d) * 3)); this.os.invalidate(); }
      key(e) {
        if (e.code === "Escape") { this.close(); return true; }
        if (e.code === "ArrowDown") { this.sel = Math.min(this.list.length - 1, this.sel + 1); this.os.invalidate(); return true; }
        if (e.code === "ArrowUp") { this.sel = Math.max(0, this.sel - 1); this.os.invalidate(); return true; }
        if (e.code === "Enter" || e.code === "NumpadEnter") { this.runSelected(); return true; }
        if (e.code === "Backspace") { this.q = this.q.slice(0, -1); this.sel = 0; this.os.invalidate(); return true; }
        if (e.key && e.key.length === 1 && !e.ctrl && !e.meta && !e.alt) { this.q += e.key; this.sel = 0; this.os.invalidate(); return true; }
        return false;
      }
      close() { var w = this.os.wm.byApp("palette"); if (w) this.os.wm.close(w.id); this.os.invalidate(); }
      runSelected() {
        var a = this.list[this.sel], C = window.__studioCommands;
        if (!a && this.q && C && C.ready) a = { cmd: this.q };
        if (!a) return;
        if (a.fill) { this.q = a.fill; this.sel = 0; this.scroll = 0; this.os.invalidate(); return; }
        if (a.cmd) {
          var res = C.run(a.cmd);
          this.reply = res.reply; this.replyOk = res.ok; this.replyT = performance.now();
          if (res.ok) this.q = "";
          this.sel = 0; this.os.invalidate();
          return;
        }
        this.close();
        try { a.run(); if (S.log) S.log.info("Command: " + a.label); } catch (e) { say("Command failed: " + e.message, true); }
        this.os.invalidate();
      }
      open(opts) {
        if (!UI.get("palette")) return false;
        this.q = ""; this.sel = 0; this.scroll = 0; this.reply = ""; this.browse = opts && opts.browse || null;
        var w = this.os.wm.byApp("palette");
        if (w) this.os.wm.focus(w.id);
        else {
          var d = this.defaultRect;
          d.x = Math.max(10, Math.round((this.os.W - d.w) / 2)); d.y = Math.max(46, Math.round((this.os.H - d.h) / 2) - 40);
          this.os.openApp("palette");
        }
        this.os.invalidate();
        return true;
      }
      drawIcon(c, x, y, s) {
        c.save(); rr(c, x, y, s, s, s * 0.23);
        var g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, "#5b6170"); g.addColorStop(1, "#2a2e38"); c.fillStyle = g; c.fill();
        c.fillStyle = "#fff"; c.font = "700 " + Math.round(s * 0.5) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("⌘", x + s / 2, y + s * 0.53); c.restore();
      }
    }
    var palette = new PaletteApp(os);
    os.apps.set(palette.id, palette); // no dock icon: Ctrl+K or the Game Editor button

    var key = os.key.bind(os);
    os.key = function (e) {
      if ((e.ctrl || e.meta) && e.code === "KeyK" && UI.get("palette")) { palette.open(); return true; }
      return key(e);
    };
    window.__studioPalette = { open: function (opts) { return palette.open(opts); }, actions: actions };
  });
})();
