// Props app (Phase 7): the prop library as cards on the computer, so it works with a pointer in VR as well
// as with the mouse. A card spawns that prop on the terrace outside the glazing; the bar below applies a material preset or a
// physics preset to the selected object. Everything goes through the command runner (one Undo step each).
(function () {
  "use strict";
  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && window.__studioPropLib && window.__studioCommands && window.__studioCommands.ready) resolve({ S: s, os: os });
        else setTimeout(check, 300);
      })();
    });
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function inRect(x, y, b) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, LIB = window.__studioPropLib, C = window.__studioCommands, FONT = os.fonts.ui;
    var GROUPS = ["All", "Range", "Enemies", "Office", "Driving", "Building", "Interactive", "Toys", "Lights"];
    var TINT = { Range: "#3b3d42", Office: "#b8916a", Driving: "#e2672d", Building: "#a9a59d", Interactive: "#4f8fd6", Toys: "#c64a57", Lights: "#e9c46a", Enemies: "#5b4a3a" };
    var MATS = ["wood", "dark wood", "steel", "painted metal", "concrete", "fabric", "plastic", "rubber", "glass", "cardboard"];
    var PRESETS = ["heavy metal", "bouncy rubber", "zero-g", "static lock", "ice", "wood", "stone", "foam", "glass", "balloon"];
    // the word the command runner knows for each library prop
    var WORD = {}; Object.keys(C.registry.props).forEach(function (w) { var k = C.registry.props[w]; if (k && k.indexOf("prop:") === 0 && !WORD[k.slice(5)]) WORD[k.slice(5)] = w; });
    WORD["box stack"] = "box stack"; WORD["seesaw"] = "seesaw";
    function cards(group) {
      var list = LIB.list().filter(function (d) { return d.name !== "seesaw base" && d.name !== "seesaw plank"; }).map(function (d) { return { name: d.name, label: d.label, group: d.group, d: d }; });
      list.splice(list.findIndex(function (c) { return c.name === "cardboard box"; }) + 1, 0, { name: "box stack", label: "Box stack", group: "Office" });
      list.push({ name: "seesaw", label: "Seesaw", group: "Toys" });
      // training enemies (addons/enemies.js): not props, so they have their own actions
      var EN = window.__studioEnemies;
      if (EN && EN.spawn) {
        var n = EN.count ? EN.count() : 0;
        list.unshift(
          { name: "enemy fsb", label: "Enemy: FSB operator", group: "Enemies", info: "CQC Loop man · shootable", tint: "#3d4a3a", act: function () { EN.spawn("fsb"); } },
          { name: "enemy soldier", label: "Enemy: Soldier", group: "Enemies", info: "CQC Loop man · shootable", tint: "#55603f", act: function () { EN.spawn("soldier"); } },
          { name: "enemy clear", label: "Remove all enemies", group: "Enemies", info: n + (n === 1 ? " in the room" : " in the room"), tint: "#7a2a2a", act: function () { EN.clear(); } },
          { name: "enemy getup", label: "Get back up: " + (EN.getUp ? "on" : "off"), group: "Enemies", info: EN.getUp ? "they stand up after 6 s" : "they stay down", tint: "#4a4f5a", act: function () { EN.setGetUp(!EN.getUp); } }
        );
      }
      // the range (addons/range.js): CQC guns and targets, its own actions
      var RG = window.__studioRange;
      if (RG && RG.ready && RG.cards) list = RG.cards().concat(list);
      return group === "All" ? list : list.filter(function (c) { return c.group === group; });
    }

    class PropsApp {
      id = "props"; title = "Props";
      defaultRect = { x: 120, y: 70, w: 1500, h: 860 }; minSize = [980, 620];
      group = "All"; scroll = 0; hits = []; reply = ""; replyOk = true; sig = ""; hover = -1;
      constructor(o) { this.os = o; }
      say(r) { this.reply = r.reply; this.replyOk = r.ok; this.os.invalidate(); }
      run(text) { this.say(C.run(text)); }
      draw(c, r, focused, t) {
        var self = this; this.hits = []; this.lastRect = r;
        c.fillStyle = "#f6f6f8"; c.fillRect(r.x, r.y, r.w, r.h);
        // group tabs
        var x = r.x + 16, y = r.y + 14;
        c.font = "600 18px " + FONT; c.textBaseline = "middle";
        GROUPS.forEach(function (g) {
          var w = c.measureText(g).width + 34, on = self.group === g;
          rr(c, x, y, w, 42, 21); c.fillStyle = on ? "#1d1d1f" : "#e6e6ea"; c.fill();
          c.fillStyle = on ? "#ffffff" : "#3a3a3c"; c.fillText(g, x + 17, y + 22);
          self.hits.push({ x: x - r.x, y: y - r.y, w: w, h: 42, act: function () { self.group = g; self.scroll = 0; } });
          x += w + 8;
        });
        // cards
        var top = r.y + 72, barH = 196, area = r.h - 72 - barH, cw = 196, ch = 176, gap = 14, cols = Math.max(1, Math.floor((r.w - 32 + gap) / (cw + gap)));
        var list = cards(this.group), rows = Math.ceil(list.length / cols), maxScroll = Math.max(0, rows * (ch + gap) - area + 10);
        this.scroll = Math.max(0, Math.min(this.scroll, maxScroll)); this.maxScroll = maxScroll;
        c.save(); c.beginPath(); c.rect(r.x, top, r.w, area); c.clip();
        list.forEach(function (card, i) {
          var cx = r.x + 16 + (i % cols) * (cw + gap), cy = top + Math.floor(i / cols) * (ch + gap) - self.scroll;
          if (cy + ch < top || cy > top + area) return;
          rr(c, cx, cy, cw, ch, 14); c.fillStyle = "#ffffff"; c.fill(); c.strokeStyle = self.hover === i ? "#0a84ff" : "#dcdce0"; c.lineWidth = self.hover === i ? 2 : 1; c.stroke();
          // swatch: the prop's own texture once it has been made, else its group colour
          c.save(); rr(c, cx + 10, cy + 10, cw - 20, 104, 10); c.clip();
          var sw = card.act ? null : LIB.swatch(card.name);
          if (sw) {
            var im = sw.img, sh = Math.min(im.height, im.width * 104 / (cw - 20));
            c.drawImage(im, 0, 0, im.width, sh, cx + 10, cy + 10, cw - 20, 104);
            if (sw.tint) { c.globalCompositeOperation = "multiply"; c.fillStyle = sw.tint; c.fillRect(cx + 10, cy + 10, cw - 20, 104); c.globalCompositeOperation = "source-over"; }
          }
          else { var g = c.createLinearGradient(cx, cy, cx, cy + 114); g.addColorStop(0, card.tint || TINT[card.group] || "#999"); g.addColorStop(1, "#3a3a3c"); c.fillStyle = g; c.fillRect(cx + 10, cy + 10, cw - 20, 104);
            if (card.act && /fsb|soldier/.test(card.name)) { // a figure on the card
              var mx = cx + cw / 2; c.fillStyle = "rgba(15,16,18,0.85)";
              c.beginPath(); c.arc(mx, cy + 32, 10, 0, Math.PI * 2); c.fill();
              rr(c, mx - 15, cy + 44, 30, 38, 7); c.fill(); c.fillRect(mx - 13, cy + 80, 11, 32); c.fillRect(mx + 2, cy + 80, 11, 32);
              c.fillRect(mx - 22, cy + 46, 7, 32); c.fillRect(mx + 15, cy + 46, 7, 32);
            } }
          c.restore();
          c.fillStyle = "#1d1d1f"; c.font = "600 18px " + FONT; c.fillText(card.label, cx + 14, cy + 134);
          c.fillStyle = "#8a8a8e"; c.font = "400 14px " + FONT;
          var info = card.info ? card.info : card.d ? (card.d.phys.mass >= 1 ? Math.round(card.d.phys.mass) + " kg" : Math.round(card.d.phys.mass * 1000) + " g") + (card.d.dyn === false ? " · fixed" : "") + (card.d.comp ? " · " + card.d.comp[0].toLowerCase() : "") : "several pieces";
          c.fillText(info, cx + 14, cy + 158);
          self.hits.push({ x: cx - r.x, y: Math.max(cy, top) - r.y, w: cw, h: Math.min(ch, top + area - Math.max(cy, top)), card: i, act: function () { if (card.act) { card.act(); setTimeout(function () { self.os.invalidate(); }, 50); } else self.run("add " + (WORD[card.name] || card.name)); } });
        });
        c.restore();
        // preset bar for the selection
        var by = r.y + r.h - barH, sel = S.editor && S.editor.selection.filter(function (e) { return !e.deleted; });
        c.fillStyle = "#ffffff"; c.fillRect(r.x, by, r.w, barH); c.fillStyle = "#dcdce0"; c.fillRect(r.x, by, r.w, 1);
        c.fillStyle = "#3a3a3c"; c.font = "600 16px " + FONT;
        c.fillText(sel && sel.length ? "Selected: " + (sel.length > 1 ? sel.length + " things" : sel[0].name) : "Select something (click it in the room with the World tool, or on the Scene tab) to give it a look or physics.", r.x + 16, by + 22);
        function chips(label, items, y, cmd) {
          c.fillStyle = "#8a8a8e"; c.font = "700 13px " + FONT; c.fillText(label, r.x + 16, y + 18);
          var x2 = r.x + 110; c.font = "500 16px " + FONT;
          items.forEach(function (it) {
            var w = c.measureText(it).width + 26;
            if (x2 + w > r.x + r.w - 16) return;
            rr(c, x2, y, w, 36, 18); c.fillStyle = sel && sel.length ? "#eef1f6" : "#f2f2f4"; c.fill();
            c.fillStyle = sel && sel.length ? "#1d1d1f" : "#b0b0b5"; c.fillText(it, x2 + 13, y + 19);
            self.hits.push({ x: x2 - r.x, y: y - r.y, w: w, h: 36, act: function () { if (sel && sel.length) self.run(cmd(it)); } });
            x2 += w + 8;
          });
        }
        chips("LOOK", MATS, by + 44, function (m) { return "make it " + m; });
        chips("PHYSICS", PRESETS, by + 90, function (p) { return "preset " + p; });
        if (this.reply) {
          rr(c, r.x + 16, by + 138, r.w - 32, 42, 10); c.fillStyle = this.replyOk ? "#e8f6ec" : "#fdeceb"; c.fill();
          c.fillStyle = this.replyOk ? "#1f6f43" : "#a3241b"; c.font = "500 17px " + FONT; c.fillText(this.reply, r.x + 30, by + 160);
        }
        c.textBaseline = "alphabetic";
        this.sig = this.state();
      }
      state() { var e = S.editor, EN = window.__studioEnemies, RG = window.__studioRange; return (RG && RG.ready ? RG.guns.length + "|" + RG.stats.shots + "|" : "") + (EN && EN.count ? EN.count() + "|" + EN.getUp + "|" : "") + this.group + "|" + this.scroll + "|" + this.hover + "|" + this.reply + "|" + (e ? e.selectionVersion : 0) + "|" + LIB.list().filter(function (d) { return LIB.swatch(d.name); }).length; }
      animating() { return this.state() !== this.sig; }
      cursor(x, y) { return this.hits.some(function (h) { return inRect(x, y, h); }) ? "pointer" : "arrow"; }
      pointerMove(x, y) { var h = this.hits.find(function (h) { return h.card !== undefined && inRect(x, y, h); }); var v = h ? h.card : -1; if (v !== this.hover) { this.hover = v; this.os.invalidate(); } }
      pointerUp(x, y) { for (var i = this.hits.length - 1; i >= 0; i--) if (inRect(x, y, this.hits[i])) { this.hits[i].act(); this.os.invalidate(); return; } }
      wheel(d) { this.scroll = Math.max(0, Math.min(this.maxScroll || 0, this.scroll + Math.sign(d) * 120)); this.os.invalidate(); }
      drawIcon(c, x, y, s) {
        c.save(); rr(c, x, y, s, s, s * 0.23);
        var g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, "#c89a63"); g.addColorStop(1, "#8b6239"); c.fillStyle = g; c.fill();
        c.strokeStyle = "rgba(60,36,18,.8)"; c.lineWidth = s * 0.05; c.strokeRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
        c.beginPath(); c.moveTo(x + s * 0.22, y + s * 0.22); c.lineTo(x + s * 0.78, y + s * 0.78); c.stroke();
        c.restore();
      }
    }
    var app = new PropsApp(os);
    os.apps.set(app.id, app);
    var i = os.dockApps.indexOf("code"); os.dockApps.splice(i >= 0 ? i + 1 : os.dockApps.length - 1, 0, "props");
    os.invalidate();
  });
})();
