// Autosave and export (Phase 5D).
// - Restore on start: the engine autosaves scene edits ("studio.autosave") but only re-applies them when
//   Recover is pressed. With "Restore autosave on start" on (default; never in safe start) they are applied
//   at load and become the starting point, so Undo does not walk back into them.
// - Export: one .json file with everything that makes the project: scene edits (including object scripts
//   and logic graphs), the room script, hidden/locked objects, snap, UI settings and the door.
// - Import: checks the file, keeps a backup of the current project, writes the imported one and reloads.
//   "Undo import" puts the backup back.
(function () {
  "use strict";
  var FORMAT = "studio-project", VERSION = 1;
  var OS_KEYS = ["editor.code", "editor.keep", "editor.outliner", "editor.snap", "ui.settings", "door.dest"];
  var AUTOSAVE = "studio.autosave";

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.editor && window.__studioUI && (!window.__studioSet || window.__studioSet.compsReady) && (!window.__studioArmoryPending || window.__studioArmoryReady)) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, ed = S.editor, UI = window.__studioUI, log = S.log;
    var store = ed.storage || null;

    // ---------- restore the autosave on start ----------
    (function restore() {
      if (UI.safe || !UI.get("autoRestore") || !store || !ed.history || ed.history.done.length) return;
      var info = ed.autosaveInfo && ed.autosaveInfo();
      if (!info) return;
      if (window.__studioMaterialBaseline) window.__studioMaterialBaseline(); // "reset look" goes back to the room as built
      var res = ed.load(null);
      // the restored edits are the new starting point: keep them in the save, not in Undo
      ed.history.done.forEach(function (op) {
        if (op.ops) ed.committed.push.apply(ed.committed, op.ops); else if (op.op) ed.committed.push(op.op);
      });
      ed.history.clear();
      if (log) log.info("Restored " + (res && res.applied != null ? res.applied : info.n) + " scene changes from the autosave" + (res && res.skipped ? " (" + res.skipped + " skipped)" : ""));
    })();

    // ---------- never lose the last 1.5 s ----------
    // The engine saves 1.5 s after a change. Leaving the page (reload, close, the door to Interstate) inside
    // that window would drop the change, so a pending save is written at once when the page is hidden.
    function flush() {
      if (!ed.autosaveTimer || !store) return;
      clearTimeout(ed.autosaveTimer); ed.autosaveTimer = 0;
      try { ed.write(AUTOSAVE, ed.ops()); } catch (e) {}
    }
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });

    // ---------- export ----------
    function current() {
      var data = { format: FORMAT, version: VERSION, saved: new Date().toISOString(), scene: ed.ops(), os: {} };
      OS_KEYS.forEach(function (k) { var v = os.storage.get(k); if (v != null) data.os[k] = v; });
      return data;
    }
    function exportProject() {
      var text = JSON.stringify(current(), null, 1);
      var name = "studio-project-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json";
      try {
        var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        var a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        if (log) log.info("Exported " + name + " (" + Math.round(text.length / 1024) + " KB)");
        return name;
      } catch (e) {
        if (log) log.error("Export failed: " + e.message);
        return null;
      }
    }

    // ---------- import ----------
    function check(data) {
      if (!data || data.format !== FORMAT) return "This is not a Studio project file.";
      if (data.version > VERSION) return "This project was made by a newer version of the game.";
      if (!Array.isArray(data.scene)) return "The project has no scene changes list.";
      if (data.os && typeof data.os !== "object") return "The project settings are damaged.";
      for (var k in (data.os || {})) if (OS_KEYS.indexOf(k) < 0 || typeof data.os[k] !== "string") return "The project has an unknown setting: " + k;
      return null;
    }
    function write(data) {
      ed.write(AUTOSAVE, data.scene);
      OS_KEYS.forEach(function (k) { if (data.os && k in data.os) os.storage.set(k, data.os[k]); else os.storage.set(k, ""); });
      os.storage.set("editor.lastRun", "ok");
    }
    function applyFile(text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { return "The file is not valid JSON."; }
      var err = check(data);
      if (err) return err;
      try { os.storage.set("project.backup", JSON.stringify(current())); } catch (e) { return "Could not keep a backup of the current project, so nothing was imported."; }
      write(data);
      if (log) log.info("Imported a project; reloading");
      setTimeout(function () { location.reload(); }, 300);
      return null;
    }
    function importProject(done) {
      var input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json"; input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", function () {
        var f = input.files && input.files[0]; input.remove();
        if (!f) return;
        if (f.size > 4 * 1024 * 1024) { done && done("The file is larger than 4 MB."); return; }
        f.text().then(function (t) { var err = applyFile(t); if (err && log) log.error("Import: " + err); done && done(err); });
      });
      input.click();
    }
    function undoImport() {
      var raw = os.storage.get("project.backup");
      if (!raw) return "There is no import to undo.";
      var data; try { data = JSON.parse(raw); } catch (e) { return "The backup is damaged."; }
      var err = check(data); if (err) return err;
      write(data); os.storage.set("project.backup", "");
      setTimeout(function () { location.reload(); }, 300);
      return null;
    }

    window.__studioProject = { exportProject: exportProject, importProject: importProject, undoImport: undoImport, applyFile: applyFile, current: current };
  });
})();
