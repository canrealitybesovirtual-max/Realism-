// Claude in the Game Editor (Phase 9, roadmap sections 7a, 7b, 7c).
// The Ask Claude tab gets a panel on the right: the conversation, a "thinking" strip with Cancel, plans to
// approve, and a push-to-talk microphone. What you type goes, in order, to:
//   1. the offline command runner when it is a known command (no AI, works without a connection);
//   2. the hosted backend (backend/worker.js) when connected. Claude answers with registry commands only:
//      a few commands run at once (quick lane), a bigger change comes back as a plan to approve (job lane),
//      a question gets a plain answer (chat). The game checks every command again with the same runner,
//      applies them a few per frame, and the whole reply is one Undo step.
//   3. without a backend, the claude.ai room-script writer (the old Ask Claude), when the page runs on claude.ai.
// Connect once by typing:  /connect https://your-worker.workers.dev  your-access-code
// The access code stays on this device. The API key never comes to the game.
(function () {
  "use strict";
  var QUICK_HINT_MS = 8000, TIMEOUT_MS = 65000, FRAME_BUDGET_MS = 5;

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.editor && os.apps.get("code") && window.__studioCommands && window.__studioCommands.ready) resolve({ S: s, os: os });
        else setTimeout(check, 300);
      })();
    });
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function inRect(x, y, b) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function wrap(c, text, w) {
    var out = [];
    String(text).split("\n").forEach(function (para) {
      var line = "";
      para.split(/(\s+)/).forEach(function (word) {
        if (c.measureText(line + word).width > w && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line += word;
        while (c.measureText(line).width > w && line.length > 1) { var k = line.length - 1; while (k > 1 && c.measureText(line.slice(0, k)).width > w) k--; out.push(line.slice(0, k)); line = line.slice(k); }
      });
      out.push(line);
    });
    return out;
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, ed = S.editor, C = window.__studioCommands, app = os.apps.get("code"), THREE = S.THREE, log = S.log;
    var UI = os.fonts.ui;
    var store = { get: function (k) { return os.storage.get(k); }, set: function (k, v) { os.storage.set(k, v); } };
    var cfg = { url: store.get("claude.url") || "", code: store.get("claude.code") || "" };
    var device = store.get("claude.device"); if (!device) { device = "q" + Math.random().toString(36).slice(2, 10); store.set("claude.device", device); }
    // the game's address for the backend can also ship in claude.config.json (the address only, never the code)
    if (!cfg.url) fetch("./claude.config.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && typeof j.workerUrl === "string" && /^https:\/\//.test(j.workerUrl)) { cfg.url = j.workerUrl.replace(/\/+$/, ""); os.invalidate(); } }).catch(function () {});

    var P = { entries: [], scroll: 0, maxScroll: 0, hits: [], busy: null, debug: store.get("claude.debug") || "auto", mouse: { x: -1, y: -1 }, rect: null, history: [] };
    try { P.entries = JSON.parse(store.get("claude.chat") || "[]").slice(-30); } catch (e) {}
    P.entries.forEach(function (e) { if (e.kind === "plan" && !e.state) e.state = "expired"; });
    function save() { try { store.set("claude.chat", JSON.stringify(P.entries.slice(-30).map(function (e) { return { who: e.who, text: e.text, kind: e.kind, state: e.state, summary: e.summary, steps: e.steps }; }))); } catch (e) {} }
    function add(who, text, extra) { var e = Object.assign({ who: who, text: String(text || "") }, extra || {}); P.entries.push(e); if (P.entries.length > 60) P.entries.shift(); P.scroll = 1e9; save(); os.invalidate(); return e; }
    function connected() { return !!(cfg.url && cfg.code); }

    // ---------- what Claude is told ----------
    function v(p) { return [p.x, p.y, p.z].map(function (n) { return n.toFixed(2); }).join(","); }
    function sceneSummary() {
      var lines = [], list = ed.world.list.filter(function (e) { return !e.deleted; }), sel = ed.selection.filter(function (e) { return !e.deleted; });
      lines.push("Studio office (metres, y up, floor at 0). Mode: " + (S.runtime ? S.runtime.mode : "edit") + ". In VR: " + !!S.renderer.xr.isPresenting + ".");
      lines.push("Selected: " + (sel.length ? sel.map(function (e) { return e.name; }).join(", ") : "nothing"));
      if (window.__studioProps) lines.push("Physics props: " + window.__studioProps.count() + " of " + (window.__studioProps.limit || 100));
      if (window.__rally && window.__rally.dest !== undefined) lines.push("Door leads to: " + (typeof window.__rally.dest === "function" ? window.__rally.dest() : window.__rally.dest));
      lines.push("Objects (name [layer] at x,y,z size w x h x d):");
      list.slice(0, 90).forEach(function (e) {
        var b = new THREE.Box3().setFromObject(e.object), s = b.isEmpty() ? null : b.getSize(new THREE.Vector3());
        var tags = [e.layer]; if (e.locked) tags.push("room"); if (e.userLocked) tags.push("locked"); if (e.bakedStatic) tags.push("baked"); if (!e.object.visible) tags.push("hidden");
        if (e.prop) tags.push(e.prop.body.bodyType() === 0 ? "dynamic " + e.prop.body.mass().toFixed(1) + " kg" : e.prop.body.bodyType() === 2 ? "moving" : "static");
        if (e.components && e.components.length) tags.push(e.components.map(function (c) { return c.type; }).join("+"));
        lines.push("- " + e.name + " [" + tags.join(", ") + "] at " + v(e.object.getWorldPosition(new THREE.Vector3())) + (s ? " size " + s.x.toFixed(2) + " x " + s.y.toFixed(2) + " x " + s.z.toFixed(2) : ""));
      });
      if (list.length > 90) lines.push("(" + (list.length - 90) + " more)");
      return lines.join("\n");
    }
    function debugInfo() {
      var out = [], pr = S.profiler, info = S.renderer.info;
      if (pr && pr.cur) out.push("Profiler (ms this frame): " + Object.keys(pr.cur).map(function (k) { return k + " " + Number(pr.cur[k]).toFixed(1); }).join(", ") + ". Budget at 72 Hz: 13.9 ms.");
      if (info) out.push("Draw calls " + info.render.calls + ", triangles " + info.render.triangles + ", textures " + info.memory.textures + ", geometries " + info.memory.geometries + ", shader programs " + (info.programs ? info.programs.length : "?") + ".");
      if (performance.memory) out.push("JS memory " + Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB.");
      if (log && log.entries) { out.push("Console (latest last):"); log.entries.slice(-25).forEach(function (e) { out.push("  [" + e.level + "] " + String(e.msg).slice(0, 220) + (e.count > 1 ? " (x" + e.count + ")" : "")); }); }
      var lr = store.get("editor.lastRun"); if (lr && lr !== "ok") out.push("Room script status: " + lr);
      return out.join("\n");
    }
    function wantsDebug(text) { return P.debug === "on" || (P.debug === "auto" && /\b(slow|lag|laggy|fps|frame|stutter|error|bug|broken|crash|fix|why|debug|performance|perf|freez|jitter|fall(s|ing)? through|inside (the )?wall)/i.test(text)); }

    // ---------- running Claude's commands: checked, a few per frame, one Undo step ----------
    function execute(calls, label, done) {
      var H = ed.history, start = H.done.length, i = 0, results = [], job = { cancelled: false };
      function step() {
        var t = performance.now();
        while (i < calls.length && !job.cancelled && performance.now() - t < FRAME_BUDGET_MS) {
          var c = calls[i++], r = C.runCall(String(c.name), c.args, { noRemember: true });
          results.push({ name: c.name, ok: r.ok, reply: r.reply });
        }
        if (i < calls.length && !job.cancelled) { setTimeout(step, 8); return; } // a timer, not requestAnimationFrame: that one stops in VR
        // fold the steps into one
        var steps = H.done.splice(start);
        if (steps.length > 1) {
          var all = [];
          steps.forEach(function (s) { if (s.ops) all.push.apply(all, s.ops); });
          H.done.push({ label: label, live: true, ops: all, do: function () { steps.forEach(function (s) { s.do(); }); }, undo: function () { steps.slice().reverse().forEach(function (s) { s.undo(); }); } });
          H.onChange(H.done[H.done.length - 1], "do");
        } else if (steps.length === 1) { steps[0].label = label; H.done.push(steps[0]); }
        ed.selectionVersion++; os.invalidate();
        done(results, steps.length > 0);
      }
      step();
      return job;
    }
    function summarize(results, changed) {
      var ok = results.filter(function (r) { return r.ok; }), bad = results.filter(function (r) { return !r.ok; });
      var text = ok.map(function (r) { return r.reply.replace(/\s*Undo\?$/, ""); }).slice(0, 6).join(" ");
      if (ok.length > 6) text += " (+" + (ok.length - 6) + " more)";
      if (bad.length) text += (text ? " " : "") + "Skipped " + bad.length + ": " + bad.slice(0, 3).map(function (r) { return r.reply; }).join(" ");
      if (changed) text += " Undo?";
      return text || "Nothing changed.";
    }

    // ---------- talking to the backend ----------
    function request(path, body, headers, signal) {
      return fetch(cfg.url + path, { method: "POST", signal: signal, headers: Object.assign({ "x-access-code": cfg.code, "x-device": device }, headers || {}), body: body })
        .then(function (r) { return r.json().catch(function () { return { error: "The backend sent a bad answer (" + r.status + ")." }; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "Error " + r.status); return j; }); });
    }
    function send(text) {
      text = String(text || "").trim();
      if (!text) { app.setStatus("Type or say what you want first.", true); return; }
      if (text[0] === "/") return slash(text);
      if (P.busy) { app.setStatus("Claude is still working. Cancel it first.", true); return; }
      add("you", text);
      clearBox();
      // 1. a known command runs offline at once
      var m = C.match(text);
      if (m && !m.loose && m.cmd.status === "ready") { var r = C.run(text); add("game", r.reply, { ok: r.ok }); P.history.push({ role: "user", text: text }, { role: "assistant", text: r.reply }); return; }
      if (!connected()) {
        if (window.claude && typeof window.claude.use === "function" && origAsk) { add("game", "Not connected to the backend: writing a room script with claude.ai instead."); restoreBox(text); return origAsk(); }
        add("game", m && m.cmd.status === "planned" ? C.run(text).reply : "Claude is not connected. Type: /connect <worker address> <access code>. Known commands still work offline (try: what can I say).", { ok: false });
        return;
      }
      var ctrl = new AbortController(), t0 = performance.now(), dbg = wantsDebug(text);
      P.busy = { t0: t0, ctrl: ctrl, debug: dbg };
      app.busy = true; app.setStatus("Claude is working. The room keeps running.", false);
      var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
      var body = JSON.stringify({ text: text, scene: sceneSummary(), debug: dbg ? debugInfo() : undefined, registryVersion: C.registry.version, history: P.history.slice(-8), mode: "auto" });
      request("/ask", body, { "content-type": "application/json" }, ctrl.signal).then(function (res) {
        P.history.push({ role: "user", text: text });
        if (res.kind === "calls") {
          var label = "Claude: " + text.slice(0, 50);
          execute(res.calls, label, function (results, changed) {
            var reply = (res.text ? res.text + "\n" : "") + summarize(results, changed) + (res.cut ? " (only the first 20 commands were used)" : "");
            add("claude", reply, { ok: results.some(function (r) { return r.ok; }) }); P.history.push({ role: "assistant", text: reply });
          });
        } else if (res.kind === "plan") {
          add("claude", (res.text ? res.text + "\n" : "") + res.summary, { kind: "plan", summary: res.summary, steps: res.steps, request: text });
          P.history.push({ role: "assistant", text: "Plan: " + res.summary });
        } else { add("claude", res.text + (res.truncated ? " (cut short)" : "")); P.history.push({ role: "assistant", text: res.text }); }
        app.setStatus("Claude answered in " + Math.round((performance.now() - t0) / 1000) + " s.", false);
      }).catch(function (e) {
        var msg = e.name === "AbortError" ? (P.busy && P.busy.cancelled ? "Cancelled." : "No answer within a minute. Try a smaller request.") : /Failed to fetch|NetworkError|Load failed/.test(e.message) ? "Can't reach the backend. Check the address and your connection." : e.message;
        add("game", msg, { ok: false }); app.setStatus(msg, true);
      }).finally(function () { clearTimeout(timer); P.busy = null; app.busy = false; os.invalidate(); });
    }
    function cancel() { if (P.busy) { P.busy.cancelled = true; P.busy.ctrl.abort(); } }
    function approve(entry) {
      if (entry.state || P.busy) return;
      entry.state = "running"; os.invalidate();
      P.busy = { t0: performance.now(), ctrl: { abort: function () { if (job) job.cancelled = true; } }, applying: true };
      var job = execute(entry.steps.map(function (s) { return { name: s.name, args: s.args }; }), "Claude plan: " + String(entry.request || entry.summary).slice(0, 44), function (results, changed) {
        entry.state = job.cancelled ? "stopped" : "done"; P.busy = null;
        add("game", (job.cancelled ? "Stopped part way. " : "") + summarize(results, changed), { ok: results.some(function (r) { return r.ok; }) });
      });
    }
    function slash(text) {
      var p = text.split(/\s+/), cmd = p[0].toLowerCase();
      clearBox();
      if (cmd === "/connect" && p[1]) {
        if (!/^https:\/\/|^http:\/\/localhost[:/]/.test(p[1])) { add("game", "The address must start with https://", { ok: false }); return; }
        cfg.url = p[1].replace(/\/+$/, ""); store.set("claude.url", cfg.url);
        if (p[2]) { cfg.code = p[2]; store.set("claude.code", cfg.code); }
        add("game", "Checking the backend…"); return check();
      }
      if (cmd === "/code" && p[1]) { cfg.code = p[1]; store.set("claude.code", cfg.code); add("game", "Access code saved on this device."); return check(); }
      if (cmd === "/forget") { cfg.url = ""; cfg.code = ""; store.set("claude.url", ""); store.set("claude.code", ""); add("game", "Backend address and access code removed from this device."); return; }
      if (cmd === "/clear") { P.entries = []; P.history = []; save(); os.invalidate(); return; }
      if (cmd === "/check") return check();
      add("game", "Slash commands: /connect <address> <code>, /code <code>, /check, /forget, /clear.");
    }
    function check() {
      if (!connected()) { add("game", "Add the access code too: /code <your code>", { ok: false }); return; }
      fetch(cfg.url + "/health", { headers: { "x-access-code": cfg.code, "x-device": device } }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error);
        var same = j.registryVersion === C.registry.version;
        add("game", "Connected: " + j.model + ", commands version " + j.registryVersion + (same ? "" : " (the game has " + C.registry.version + ": redeploy so they match)") + ". Voice on the backend: " + (j.voice ? "on" : "off") + ".", { ok: same });
      }).catch(function (e) { add("game", "Not connected: " + (/Failed to fetch|NetworkError|Load failed/.test(e.message) ? "can't reach that address (check it, and GAME_ORIGIN on the Worker)." : e.message), { ok: false }); });
    }
    function clearBox() { var B = app.bufs.ask.constructor; app.bufs.ask = new B(""); if (app.mode === "ask") app.buf = app.bufs.ask; app.save(); }
    function restoreBox(t) { var B = app.bufs.ask.constructor; app.bufs.ask = new B(t); if (app.mode === "ask") app.buf = app.bufs.ask; }
    function setBox(t) { restoreBox(t); app.buf.move && app.buf.move("docEnd"); app.save(); os.invalidate(); }

    // ---------- voice: push to talk, three routes ----------
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var V = { state: "idle", route: null, rec: null, media: null, chunks: [], timer: 0, brokeSR: false };
    function heard(text, route) {
      V.state = "idle"; os.invalidate();
      text = String(text || "").trim();
      if (!text) { add("game", "I didn't catch that. Try again, or type.", { ok: false }); return; }
      setBox(text);
      var m = C.match(text), sug = m && !m.loose ? [] : C.suggest(text);
      add("game", "Heard (" + route + "): \"" + text + "\". " + (m && !m.loose ? "Press Make it to run it." : sug.length ? "Did you mean: " + sug.join(" · ") + "? Fix the text or press Make it." : "Press Make it to send it to Claude, or fix it first."));
    }
    function talk() {
      if (V.state === "listening") return stopTalk();
      if (V.state !== "idle") return;
      if (SR && !V.brokeSR) return speechRoute();
      if (connected() && navigator.mediaDevices && window.MediaRecorder) return recordRoute();
      add("game", "Voice: this browser has no speech recognition" + (connected() ? "" : " and the backend is not connected") + ". Use the microphone key on the Quest keyboard to type into the box.", { ok: false });
    }
    function speechRoute() {
      var rec = new SR(); V.rec = rec; V.route = "browser";
      rec.lang = navigator.language || "en-US"; rec.interimResults = false; rec.maxAlternatives = 3; rec.continuous = false;
      var got = false;
      rec.onresult = function (ev) { got = true; var alts = []; for (var i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript); var best = alts.find(function (a) { var m = C.match(a); return m && !m.loose; }) || alts[0]; heard(best, "browser speech"); };
      rec.onerror = function (ev) {
        if (ev.error === "no-speech" || ev.error === "aborted") { V.state = "idle"; os.invalidate(); if (ev.error === "no-speech") add("game", "I didn't hear anything.", { ok: false }); return; }
        V.brokeSR = true; V.state = "idle";
        add("game", "Browser speech is not available here (" + ev.error + ")" + (connected() ? ". Switching to recording; press Talk again." : ". Use the Quest keyboard's microphone key."), { ok: false });
      };
      rec.onend = function () { if (!got && V.state === "listening") { V.state = "idle"; os.invalidate(); } };
      try { rec.start(); V.state = "listening"; V.timer = setTimeout(stopTalk, 10000); os.invalidate(); }
      catch (e) { V.brokeSR = true; V.state = "idle"; talk(); }
    }
    function recordRoute() {
      V.route = "recording"; V.state = "starting"; os.invalidate();
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var mr = new MediaRecorder(stream); V.media = mr; V.chunks = [];
        mr.ondataavailable = function (e) { if (e.data.size) V.chunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); }); // the microphone is closed after every press
          var blob = new Blob(V.chunks, { type: mr.mimeType || "audio/webm" });
          V.state = "sending"; os.invalidate();
          request("/stt", blob, { "content-type": blob.type }).then(function (j) { heard(j.text, "backend speech"); })
            .catch(function (e) { V.state = "idle"; add("game", "Speech to text failed: " + e.message, { ok: false }); });
        };
        mr.start(); V.state = "listening"; V.timer = setTimeout(stopTalk, 8000); os.invalidate();
      }).catch(function () { V.state = "idle"; add("game", "The microphone was not allowed. Type instead, or use the Quest keyboard's microphone key.", { ok: false }); });
    }
    function stopTalk() {
      clearTimeout(V.timer);
      if (V.rec && V.route === "browser") { try { V.rec.stop(); } catch (e) {} V.rec = null; }
      if (V.media && V.media.state === "recording") V.media.stop();
      if (V.state === "listening" && V.route === "browser") { V.state = "hearing"; os.invalidate(); setTimeout(function () { if (V.state === "hearing") { V.state = "idle"; os.invalidate(); } }, 4000); }
    }
    window.__studioVoice = { talk: talk, stop: stopTalk, state: function () { return V.state; }, routes: function () { return { browser: !!SR && !V.brokeSR, keyboard: true, backend: connected() && !!window.MediaRecorder }; } };

    // ---------- the panel on the Ask Claude tab ----------
    var origAsk = app.ask ? app.ask.bind(app) : null;
    function panelW(w) { return Math.round(Math.min(760, Math.max(420, w * 0.42))); }
    var er = app.er.bind(app);
    app.er = function (r) { var e = er(r); if (this.mode === "ask") e = { x: e.x, y: e.y, w: e.w - panelW(r.w), h: e.h }; return e; };
    app.ask = function () { send(this.bufs.ask.text); };
    var draw = app.draw.bind(app);
    app.draw = function (c, r, focused, t) {
      draw(c, r, focused, t);
      if (this.mode !== "ask") return;
      var W = panelW(r.w), x0 = r.x + r.w - W, y0 = r.y + this.barH, H = r.h - this.barH - 40, hits = P.hits = [];
      P.rect = { x: r.w - W, y: this.barH, w: W, h: H };
      c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip();
      c.fillStyle = "#f7f7f9"; c.fillRect(x0, y0, W, H); c.fillStyle = "#dadade"; c.fillRect(x0, y0, 1, H);
      c.textBaseline = "middle";
      // header
      c.fillStyle = "#1d1d1f"; c.font = "700 20px " + UI; c.fillText("✦ Claude", x0 + 18, y0 + 28);
      c.font = "500 14px " + UI; c.fillStyle = connected() ? "#1f8a4c" : "#8a8a8e";
      c.fillText(connected() ? "● connected" : window.claude ? "○ claude.ai" : "○ offline commands", x0 + 118, y0 + 29);
      function btn(label, bx, by, bw, bh, fn, on, danger) {
        rr(c, bx, by, bw, bh, 9); c.fillStyle = on ? "#0a5bd8" : danger ? "#ffe5e3" : "#ffffff"; c.fill();
        if (!on) { c.strokeStyle = "#cfcfd4"; c.lineWidth = 1; c.stroke(); }
        c.fillStyle = on ? "#fff" : danger ? "#c4271c" : "#1d1d1f"; c.font = "600 15px " + UI; c.textAlign = "center"; c.fillText(label, bx + bw / 2, by + bh / 2 + 1); c.textAlign = "left";
        hits.push({ x: bx - r.x, y: by - r.y, w: bw, h: bh, fn: fn });
      }
      var vs = V.state, talkLabel = vs === "listening" ? "■ Stop" : vs === "sending" || vs === "hearing" ? "…" : vs === "starting" ? "Mic…" : "🎤 Talk";
      var bx = x0 + W - 14;
      bx -= 70; btn("Clear", bx, y0 + 12, 70, 34, function () { slash("/clear"); });
      bx -= 132; btn("Debug: " + P.debug, bx, y0 + 12, 126, 34, function () { P.debug = P.debug === "auto" ? "on" : P.debug === "on" ? "off" : "auto"; store.set("claude.debug", P.debug); });
      bx -= 104; btn(talkLabel, bx, y0 + 12, 98, 34, talk, vs === "listening");
      c.fillStyle = "#dadade"; c.fillRect(x0, y0 + 58, W, 1);
      // conversation
      var top = y0 + 64, bottom = y0 + H - (P.busy ? 64 : 8), y = top - P.scroll, tw = W - 60;
      c.save(); c.beginPath(); c.rect(x0, top, W, bottom - top); c.clip();
      if (!P.entries.length) {
        c.fillStyle = "#8a8a8e"; c.font = "400 16px " + UI;
        wrap(c, connected() ? "Ask for a change (\"make the lamp red\"), a bigger job (\"build a small road with cones\"), or a question (\"why is it slow?\"). Commands run at once; bigger jobs come back as a plan to approve. Every reply is one Undo step."
          : "Known commands run here offline. To talk to Claude, deploy backend/worker.js (see backend/README.md) and type:\n/connect https://your-worker.workers.dev your-access-code", tw).forEach(function (l, i) { c.fillText(l, x0 + 22, top + 22 + i * 24); });
      }
      P.entries.forEach(function (e) {
        var mine = e.who === "you", font = (mine ? "500 " : "400 ") + "16px " + UI; c.font = font;
        var lines = wrap(c, e.text, tw - 24), h = lines.length * 22 + 20 + (e.kind === "plan" ? 44 + Math.min(8, e.steps.length) * 20 + (e.steps.length > 8 ? 20 : 0) : 0);
        if (y + h > top - 40 && y < bottom + 40) {
          var bxx = mine ? x0 + 46 : x0 + 14;
          rr(c, bxx, y, tw, h, 12); c.fillStyle = mine ? "#0a5bd8" : e.ok === false ? "#fdeceb" : e.who === "game" ? "#eceef2" : "#ffffff"; c.fill();
          if (!mine && e.who === "claude") { c.strokeStyle = "#dcdce0"; c.lineWidth = 1; c.stroke(); }
          c.fillStyle = mine ? "#fff" : e.ok === false ? "#a3241b" : "#1d1d1f"; c.font = font;
          lines.forEach(function (l, i) { c.fillText(l, bxx + 12, y + 20 + i * 22); });
          if (e.kind === "plan") {
            var py = y + 12 + lines.length * 22; c.font = "400 14px " + UI; c.fillStyle = "#555";
            e.steps.slice(0, 8).forEach(function (s, i) { var a = Object.keys(s.args || {}).map(function (k) { return s.args[k]; }).join(", "); c.fillText((i + 1) + ". " + s.name.replace(/_/g, " ") + (a ? " (" + a + ")" : ""), bxx + 16, py + 10 + i * 20); });
            if (e.steps.length > 8) c.fillText("… " + (e.steps.length - 8) + " more steps", bxx + 16, py + 10 + 8 * 20);
            var by2 = y + h - 42;
            if (!e.state) { btn("Approve " + e.steps.length + " steps", bxx + 12, by2, 190, 32, function () { approve(e); }, true); btn("Cancel", bxx + 210, by2, 100, 32, function () { e.state = "cancelled"; save(); add("game", "Plan cancelled. Nothing changed."); }); }
            else { c.font = "600 14px " + UI; c.fillStyle = "#6b6b70"; c.fillText({ running: "Applying…", done: "Applied (one Undo step)", cancelled: "Cancelled", stopped: "Stopped part way", expired: "Not applied (from an earlier session)" }[e.state] || e.state, bxx + 14, by2 + 16); }
          }
        }
        y += h + 10;
      });
      var content = y + P.scroll - top; P.maxScroll = Math.max(0, content - (bottom - top));
      if (P.scroll > P.maxScroll) P.scroll = P.maxScroll;
      c.restore();
      // thinking strip with Cancel
      if (P.busy) {
        var sy = y0 + H - 60, secs = Math.round((performance.now() - P.busy.t0) / 1000);
        c.fillStyle = "#eaf1fd"; c.fillRect(x0 + 1, sy, W - 1, 60);
        c.fillStyle = "#0a5bd8"; c.font = "600 16px " + UI;
        var dots = ".".repeat(1 + Math.floor(t / 400) % 3);
        c.fillText((P.busy.applying ? "Applying" : "Claude is working") + dots + " " + secs + " s", x0 + 18, sy + 20);
        c.font = "400 14px " + UI; c.fillStyle = "#4a5a75";
        c.fillText(P.busy.applying ? "A few changes per frame, so the room keeps running." : secs * 1000 > QUICK_HINT_MS ? "A bigger job: ready in about 10 s to 1 min." : P.busy.debug ? "Console, Profiler and scene attached." : "The room keeps running.", x0 + 18, sy + 42);
        btn("Cancel", x0 + W - 112, sy + 13, 96, 34, cancel, false, true);
      }
      c.restore();
      c.textBaseline = "alphabetic";
    };
    var pDown = app.pointerDown.bind(app);
    app.pointerDown = function (x, y, r) {
      if (this.mode === "ask" && P.rect && inRect(x, y, P.rect)) {
        for (var i = P.hits.length - 1; i >= 0; i--) if (inRect(x, y, P.hits[i])) { P.hits[i].fn(); os.invalidate(); return; }
        return;
      }
      pDown(x, y, r);
    };
    var pMove = app.pointerMove.bind(app);
    app.pointerMove = function (x, y, r, d) { P.mouse = { x: x, y: y }; if (this.mode === "ask" && P.rect && inRect(x, y, P.rect)) return; pMove(x, y, r, d); };
    var pUp = app.pointerUp.bind(app);
    app.pointerUp = function (x, y, r) { if (this.mode === "ask" && P.rect && inRect(x, y, P.rect)) return; pUp(x, y, r); };
    var cur = app.cursor.bind(app);
    app.cursor = function (x, y, r) { if (this.mode === "ask" && P.rect && inRect(x, y, P.rect)) return P.hits.some(function (h) { return inRect(x, y, h); }) ? "pointer" : "arrow"; return cur(x, y, r); };
    var wheel = app.wheel.bind(app);
    app.wheel = function (d) { if (this.mode === "ask" && P.rect && inRect(P.mouse.x, P.mouse.y, P.rect)) { P.scroll = Math.max(0, Math.min(P.maxScroll, P.scroll + Math.sign(d) * 60)); os.invalidate(); return; } wheel(d); };
    var anim = app.animating.bind(app);
    var lastSig = "";
    app.animating = function (f, t) { var sig = P.entries.length + "|" + V.state + "|" + !!P.busy + "|" + (P.busy ? Math.floor(t / 400) : 0); if (this.mode === "ask" && sig !== lastSig) { lastSig = sig; return true; } return anim(f, t); };
    if (app.mode === "ask") app.setStatus(connected() ? "Ask Claude: commands, bigger jobs or questions. Ctrl+Enter sends." : "Type a command, or connect Claude with /connect <address> <code>.", false);

    window.__studioClaude = { send: send, cancel: cancel, connected: connected, scene: sceneSummary, debug: debugInfo, execute: execute, approve: approve, entries: function () { return P.entries; } };
    os.invalidate();
  });
})();
