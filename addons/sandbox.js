// Script sandbox for the Game Editor's room script.
// Room scripts touch the live three.js scene, so they have to run on the render thread. Two layers
// keep a bad script from freezing the frame (and dropping VR):
//   1. check(code): a dry run in a Web Worker against a do-nothing stub of the API, with a hard time
//      limit. It catches hangs the in-page guard cannot stop (huge allocations, runaway regex,
//      endless built-in calls). The worker is terminated if it does not answer in time.
//   2. prepare(code): adds a time guard to every loop and function. On the render thread a runaway
//      loop then throws "Script stopped" instead of hanging. begin(ms)/end() set the budget for one
//      call; callbacks that fire later (timers, events) get their own short slice automatically.
(function () {
  "use strict";
  var safe = /[?&]safe=1(?:&|$)/.test(location.search);
  window.__studioSafe = safe;

  var GUARD = "__sbg";
  var AUTO_MS = 50;      // budget for callbacks that run outside begin()/end()
  var CHECK_MS = 1500;   // worker dry-run time limit
  var STUB_LOOP_MS = 300; // inside the worker, plain JS loops give up after this (the stub never ends them)

  // ---------- render-thread guard ----------
  var G = { on: false, d: 0, n: 0, ms: 0, tripped: null };
  function timeoutError() {
    var e = new Error(G.tripped);
    e.sandboxTimeout = true;
    return e;
  }
  function endSlice() { G.on = false; G.tripped = null; }
  function guard() {
    if (G.tripped) throw timeoutError(); // sticky, so a try/catch around a loop cannot swallow it
    if (!G.on) { G.on = true; G.n = 0; G.ms = AUTO_MS; G.d = performance.now() + AUTO_MS; setTimeout(endSlice, 0); }
    if ((++G.n & 127) === 0 && performance.now() > G.d) {
      G.tripped = "Script stopped: it ran longer than " + G.ms + " ms in one go, so the game kept running.";
      throw timeoutError();
    }
  }
  function begin(ms) { G.on = true; G.n = 0; G.ms = ms; G.d = performance.now() + ms; G.tripped = null; }
  function end() { endSlice(); }
  function isTimeout(e) { return !!(e && e.sandboxTimeout); }

  // ---------- instrumentation ----------
  var LOOPS = { ForStatement: 1, WhileStatement: 1, DoWhileStatement: 1, ForInStatement: 1, ForOfStatement: 1 };
  var FUNCS = { FunctionDeclaration: 1, FunctionExpression: 1, ArrowFunctionExpression: 1 };
  function prepare(code) {
    var parse = window.__studioParse;
    if (!parse) return { error: "The script checker is not ready yet. Try again in a moment." };
    var ast;
    try {
      ast = parse(code, { ecmaVersion: 2022, sourceType: "script", allowReturnOutsideFunction: true, locations: true });
    } catch (e) {
      return { error: "Syntax error: " + String(e.message || e) };
    }
    var ins = [];
    function open(p, t) { ins.push({ p: p, t: t, open: true, i: ins.length }); }
    function close(p, t) { ins.push({ p: p, t: t, open: false, i: ins.length }); }
    (function walk(n) {
      if (LOOPS[n.type]) {
        if (n.body.type === "BlockStatement") open(n.body.start + 1, GUARD + "();");
        else { open(n.body.start, "{" + GUARD + "();"); close(n.body.end, "}"); }
      } else if (FUNCS[n.type]) {
        if (n.body.type === "BlockStatement") open(n.body.start + 1, GUARD + "();");
        else { open(n.body.start, "(" + GUARD + "(),"); close(n.body.end, ")"); }
      }
      for (var k in n) {
        if (k === "loc") continue;
        var v = n[k];
        if (Array.isArray(v)) { for (var j = 0; j < v.length; j++) if (v[j] && typeof v[j].type === "string") walk(v[j]); }
        else if (v && typeof v.type === "string") walk(v);
      }
    })(ast);
    // Apply from the end. At the same spot, inner openers go in first and outer closers go in first,
    // so the text reads outer-open, inner-open ... inner-close, outer-close.
    ins.sort(function (a, b) { return b.p - a.p || (a.open ? b.i - a.i : a.i - b.i); });
    var out = code;
    ins.forEach(function (x) { out = out.slice(0, x.p) + x.t + out.slice(x.p); });
    return { code: out };
  }

  // ---------- worker dry run ----------
  function workerMain() {
    function stub() {
      var f = function () {};
      return new Proxy(f, {
        get: function (t, k) {
          if (k === Symbol.toPrimitive) return function () { return 0; };
          if (k === Symbol.iterator) return function () { return [][Symbol.iterator](); };
          if (k === "then") return undefined;
          if (k === "length") return 0;
          return stub();
        },
        set: function () { return true; },
        has: function () { return true; },
        apply: function () { return stub(); },
        construct: function () { return stub(); }
      });
    }
    self.onmessage = function (ev) {
      self.postMessage({ id: ev.data.id, started: true });
      var d = 0, n = 0;
      function g() { if ((++n & 127) === 0 && performance.now() > d) throw new Error("slow"); }
      var frames = [];
      try {
        var f = new Function(ev.data.guard, "THREE", "scene", "camera", "renderer", "studio", "add", "addThrowable", "onFrame", "find", "refreshShadows", "log", ev.data.code);
        d = performance.now() + ev.data.loopMs;
        try {
          f(g, stub(), stub(), stub(), stub(), stub(), function (o) { return o; }, function (o) { return o; },
            function (fn) { if (typeof fn === "function") frames.push(fn); return function () {}; },
            function () { return stub(); }, function () {}, function () {});
        } catch (e) { /* the stub is not the real scene, so ordinary errors here mean nothing */ }
        for (var i = 0; i < frames.length && i < 50; i++) {
          d = performance.now() + ev.data.loopMs;
          try { frames[i](1 / 72, 0); } catch (e) {}
        }
      } catch (e) {
        self.postMessage({ id: ev.data.id, error: "Syntax error: " + e.message });
        return;
      }
      self.postMessage({ id: ev.data.id, ok: true });
    };
  }
  // One warm worker is kept so a check does not pay for start-up; a worker that hangs is thrown away.
  // The time limit starts when the worker says it has begun, so a slow start (or a busy render
  // thread delaying messages) is never mistaken for a hanging script.
  var START_MS = 10000;  // worker never answered at all: skip the dry run, the render-thread guard still applies
  var workerUrl = null, worker = null, seq = 0;
  function getWorker() {
    if (worker) return worker;
    workerUrl = workerUrl || URL.createObjectURL(new Blob(["(" + workerMain + ")()"], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    return worker;
  }
  function dropWorker() { if (worker) { worker.terminate(); worker = null; } }
  function check(code) {
    return new Promise(function (resolve) {
      var w;
      try { w = getWorker(); } catch (e) { resolve({ ok: true, skipped: true }); return; }
      var id = ++seq, done = false, timer = 0;
      function finish(r, kill) {
        if (done) return;
        done = true; clearTimeout(timer);
        w.removeEventListener("message", onMsg); w.removeEventListener("error", onErr);
        if (kill) dropWorker();
        resolve(r);
      }
      function onMsg(ev) {
        var d = ev.data || {};
        if (d.id !== id) return;
        if (d.started) {
          clearTimeout(timer);
          timer = setTimeout(function () {
            // let a reply that is already queued through before calling it a hang
            setTimeout(function () {
              finish({ error: "Script stopped before it ran: in a test run it was still busy after " + (CHECK_MS / 1000) + " s, which would freeze the game. Look for a very large loop, array or text." }, true);
            }, 50);
          }, CHECK_MS);
          return;
        }
        finish(d.error ? { error: d.error } : { ok: true });
      }
      function onErr(ev) { ev.preventDefault(); finish({ ok: true, skipped: true }, true); }
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      timer = setTimeout(function () { finish({ ok: true, skipped: true }, true); }, START_MS);
      w.postMessage({ id: id, code: code, guard: GUARD, loopMs: STUB_LOOP_MS });
    });
  }
  // warm the worker up once the page has settled
  setTimeout(function () { try { getWorker(); } catch (e) {} }, 2000);

  window.__studioSandbox = {
    safe: safe, guardName: GUARD, guard: guard, begin: begin, end: end,
    isTimeout: isTimeout, prepare: prepare, check: check
  };
})();
