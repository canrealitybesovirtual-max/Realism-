# Engine and in-world editor ("Studio")

Studio turns the game into its own development environment. You walk up to the desk, open **Studio** on the in-world computer, and edit the world you are standing in. The computer is the control centre and the room around you is the live viewport.

This document records:

- how the engine is put together,
- what is live and what needs a reload,
- the security model,
- the staged plan and what each stage really delivers.

## Existing architecture this builds on

| Part | Implementation |
|---|---|
| Build | Vite 8 + TypeScript (`npm run dev`, `npm run build`). Relative base path, so it runs as a static site or a Claude artifact. |
| Rendering | three.js r186: one `WebGLRenderer`, baked AO, box-projected probe, PCF shadows. No second engine is added. |
| Physics | Rapier 3D (WASM): fixed 120 Hz step, dynamic props, statics, holding, teleport. |
| WebXR | `XRControls` (rig, rays, grab, poke typing, smooth walk, seated mode), `XRHand` skinned hands, hand tracking. IWER emulator for tests. |
| Desktop | `DesktopControls`: pointer lock, carry, aim down sights. |
| Computer | `DesktopOS`, a canvas-drawn OS (windows, dock, apps), drawn into the monitor texture. Input comes from the mouse, a VR ray, the 3D desk mouse or poked keys. |
| Gameplay | Guns (`Gun` interface), projectile ballistics, shooting range. Add-ons in `public/addons` (Door, rally, Game Editor, Video). |
| Tests | vitest unit tests; Playwright e2e (`scripts/e2e*.mjs`). |

## Engine layer (`src/engine`)

| Module | Role |
|---|---|
| `entities.ts` | **Shared scene model.** An `Entity` wraps the *real* `Object3D` and, for movable things, the real Rapier body. Gameplay and editor touch the same objects, so edits are visible immediately. Each entity has a layer, flags (`locked`, `bakedStatic`) and components. `registerScene` registers the existing game's objects by the names the builders give them. |
| `ops.ts` | **Scene operations as data:** `trs`, `mat`, `unique`, `light`, `phys`, `static`, `rename`, `delete`, `spawn` (primitive, light or clone). `validateOp` checks every field (finite numbers in range, colours, known ids, locked entities). `opToCommand` turns an op into an undoable command. The saved scene *is* the op list, compacted. |
| `commands.ts` | `History` handles undo and redo. A command that throws is rolled back and not recorded. Each command says whether it applies **live**, or which part waits for a **reload**. |
| `runtime.ts` | `play`, `pause`, `step` (one 1/120 s tick) and `stop` (bodies back to where Play started, then Edit mode). The main loop advances physics, guns and bullets only by `runtime.frameDt()`. |
| `editor.ts` | Selection with in-world highlight boxes, spawn, duplicate, delete (original content asks first), save, load and autosave, and in-world carrying with snapping. |
| `viewport.ts` | The Studio viewport: an orbit camera renders to a render target. The monitor's shader shows it wherever the OS canvas is transparent, so windows and the cursor over it cover it correctly. It is GPU-only, with no pixel readback. |
| `worldTool.ts` | Editing in the world. **Desktop:** click selects, G carries, `[` `]` turn, Delete, Ctrl+Z/Y/D. **VR:** trigger selects; squeeze carries; the stick pushes, pulls and turns. |
| `log.ts` | Runtime log. Captures uncaught errors, rejections and console warnings, and shows them in Studio. |
| `components.ts` | Component registry (`defineComponent`): typed fields, events, commands, start / update / use / hit hooks. Built-ins: Spinner, Bobber, Patrol, Trigger, Door, Health, Interactable, Pickup, Spawner, Sound, LightPulse, Script graph, Script. |
| `graph.ts` | Node graphs: typed ports, validation, a runner with a 2000-step guard and per-node debug values / errors. |
| `gameplay.ts` | Runs components, graphs and scripts while playing; records what gameplay touches and restores it on Stop; hot-reloads changed parts. |
| `scripts.ts` | Runtime scripts: acorn parse, engine lint, loop instrumentation, error-to-line mapping. |
| `codeTools.ts` | Highlighter, line diff, search, content hash (pure functions, unit-tested). |

The Studio app is in `src/computer/studioApp.ts`:

- a toolbar for the runtime, undo, World tool, snapping, spawning, duplicate, delete, frame, save, load and recover,
- a hierarchy with search and layer filters, plus multi-select,
- a viewport with orbit, pick and a move/yaw gizmo,
- an inspector: transform (drag to scrub or click to type), material (swatches, hex, roughness, metalness, opacity, glow, *make unique*), lights and physics (dynamic or static, mass, friction, bounce, gravity),
- a log showing live-vs-reload notes.

Other computer apps: **Logic** (`logicApp.ts`, node graphs) and **Code** (`codeApp.ts`, the code workstation, below).

## Code workstation (stage 4)

The **Code** app has two sides, kept clearly apart.

**Scripts** are runtime behaviours stored in the scene:

- **Writing.** A script is plain JavaScript defining any of `start()`, `update(dt)`, `onUse()`, `onEvent(entityId, event, value)` and `onHit(hit)`. It can use `self` (its object: move, rotate, colour, visibility, light, impulse, emit, command), `api` (other entities, the player, tones, timers, inventory, and `api.state`, which survives hot reloads) and `log()`.
- **Checks while you type.**
  - acorn parses the code and reports syntax errors with line and column.
  - An engine lint refuses page globals (`window`, `document`, `fetch`, storage, `eval`, timers, `constructor` chains, imports).
  - Misspelt hooks get warnings.
- **Applying.** Apply (Ctrl+S) refuses code with errors. Otherwise it records an undoable `script` op. If the game is playing, the script hot-reloads at once: only its own instances restart.
- **Containment.**
  - Every loop is instrumented, so an endless loop throws after 1,000,000 iterations instead of freezing the headset.
  - A hook that throws is stopped on that object. Its runtime line is shown in the editor gutter and in Problems, and the rest of the game keeps running.
  - Stop restores everything scripts changed.
- **Versions.** Each Apply keeps a version; you can diff it against the editor and load it back. Studio's Undo also reverts script edits.
- **What this is not.** The lint and guards are not a security sandbox. Scripts run with the page's privileges. They are your own content. Code from elsewhere (an imported save, the Claude agent) has to be shown and approved before it runs.

**Project** gives access to the game's source files, only while the local dev server (`npm run dev`) is running. It goes through `tools/studioServer.ts`:

- **What it can reach.** An allowlist covering `src/`, `tests/unit/`, `docs/`, `tools/`, `public/addons/`, `README.md`, `index.html` and `vite.config.ts`. No dotfiles, no `package.json`, no `node_modules`, nothing outside the project. Nothing is ever deleted.
- **Access control.** A per-server-session token and a required custom header, so cross-site pages cannot call it. Writes and commands are accepted only from loopback; the headset on the LAN can read. Set `STUDIO_ALLOW_LAN=1` to change that.
- **Writing.**
  - Every save asks for confirmation.
  - It is refused if the file changed on disk since it was opened; that case is reported as a conflict, with the disk version and your edits diffed.
  - The old content is checkpointed to `.studio/history` first.
  - Checkpoints can be diffed and restored (with confirmation); the current file is checkpointed before a restore.
- **Commands.** Only the type check (`tsc --noEmit`) and the unit tests (`vitest run`) can run. They run without a shell, one at a time, with a 4-minute limit. Their real output and exit code are shown, and tsc errors link to the file and line.
- **Drafts.** Unsaved edits are kept in the computer's storage, because Vite reloads the page after a source write.
- **In the published artifact** there is no dev server. The Project side says so and offers nothing; nothing is simulated.

## Live vs reload

| Change | Live? |
|---|---|
| Move, rotate or scale an object with a physics body | Live: the body is teleported with it. Scaling keeps the old collider size until reload, and the editor says so. |
| Move or delete baked furniture (desk, sideboard, …) | Visual is live. Its baked AO shadow and static collision stay until reload; the editor says so on each change. |
| Material, light and physics values | Live. |
| Shared materials (one material on many meshes) | Live for all users. *Make unique* first to change one object only. |
| Spawned primitives and copies | Live, with real Rapier bodies. |
| Loading a saved scene | Live. It undoes back to the scene as built, then replays the ops. |
| Components, graphs, scripts | Live. Editing while playing hot-reloads just that part. |
| Project source files (Code app, dev server) | Vite reloads the page (HMR where the module supports it). Drafts and the scene autosave survive. |

## Saving and recovery

- **Scene files.** Scenes are saved to browser storage as `{ format, saved, ops }`. Loading validates every op: invalid ones are skipped and logged, and unparseable files change nothing.
- **Autosave.** It runs 1.5 s after any change. It is never applied automatically at startup: the toolbar offers **Recover (n)**, which asks before applying.
- **Old changes.** Changes older than the 300-step undo history are still saved.

## Security model

- Scene changes are typed ops validated before use, including ops proposed by the Claude agent.
- Runtime scripts are the one place code runs. They are checked (syntax, engine lint, loop guards) and contained (per-object error boundary, restore on Stop), but they are not sandboxed; see the Code workstation section.
- Project files are reachable only through the dev-server allowlist, with token, conflict checks, confirmation, checkpoints and two fixed commands. No shell.
- Deleting original scene content requires confirmation, and undo always brings it back.
- Credentials never reach the browser:
  - **Artifact:** the hosted page reaches Claude only through the claude.ai host's `sample` capability, so the page holds no key.
  - **Local development:** any agent with file access runs in the dev server with the key in its environment. See stage 4–5 below.

## Stages

1. **Done.** Vertical slice: select an object in the running world, change its transform or material on the in-world computer, see it immediately. Undo, redo and save/load are included. Verified in the browser and covered by `tests/unit/engine.test.ts`.
2. **Done.** World tools on desktop and in VR, runtime controls, spawning and duplication, and autosave (`scripts/e2e-studio.mjs`).
3. **Done.** Component API, gameplay components, and the Logic node editor with typed ports and live debugging (`tests/unit/gameplay.test.ts`).
4. **Done.** The Code workstation: runtime scripts with hot reload and error boundaries, and project files through the guarded dev-server API. Tests: `tests/unit/scripts.test.ts`, `tests/unit/codeTools.test.ts` and `scripts/e2e-code.mjs` (in-world input; the project part runs against the dev server).
5. Claude agent (ops and patches proposed for approval), diagnostics (performance overlay, colliders, bounds, frustum, expensive objects) and asset import.

## Known limitations

- The rally add-on runs its own loop and is not paused by the runtime.
- Undo history is per session. A reload keeps only what was saved or autosaved.
- A script that moves a *dynamic* physics body (`moveBy` / `moveTo` / `rotateBy`) teleports it each frame, and gravity still acts between frames, so upward motion is partly cancelled. To animate an object freely, make it Static in Studio's physics section; to push it physically, use `self.impulse`.
- TypeScript diagnostics come from running the real compiler (“Type check”), not as you type: there is no TS parser in the page. JavaScript files and scripts are checked as you type.
- Project files cannot be created or deleted from the Code app (only edited and restored).
- The Studio UI is drawn on the 1920×1080 monitor canvas and sized for monitor distance. In VR, use the ray or the desk mouse on it.
