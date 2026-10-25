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

The Studio app is in `src/computer/studioApp.ts`:

- a toolbar for the runtime, undo, World tool, snapping, spawning, duplicate, delete, frame, save, load and recover,
- a hierarchy with search and layer filters, plus multi-select,
- a viewport with orbit, pick and a move/yaw gizmo,
- an inspector: transform (drag to scrub or click to type), material (swatches, hex, roughness, metalness, opacity, glow, *make unique*), lights and physics (dynamic or static, mass, friction, bounce, gravity),
- a log showing live-vs-reload notes.

## Live vs reload

| Change | Live? |
|---|---|
| Move, rotate or scale an object with a physics body | Live: the body is teleported with it. Scaling keeps the old collider size until reload, and the editor says so. |
| Move or delete baked furniture (desk, sideboard, …) | Visual is live. Its baked AO shadow and static collision stay until reload; the editor says so on each change. |
| Material, light and physics values | Live. |
| Shared materials (one material on many meshes) | Live for all users. *Make unique* first to change one object only. |
| Spawned primitives and copies | Live, with real Rapier bodies. |
| Loading a saved scene | Live. It undoes back to the scene as built, then replays the ops. |

## Saving and recovery

- **Scene files.** Scenes are saved to browser storage as `{ format, saved, ops }`. Loading validates every op: invalid ones are skipped and logged, and unparseable files change nothing.
- **Autosave.** It runs 1.5 s after any change. It is never applied automatically at startup: the toolbar offers **Recover (n)**, which asks before applying.
- **Old changes.** Changes older than the 300-step undo history are still saved.

## Security model

- Nothing the editor does executes arbitrary code. Scene changes are typed ops validated before use, and that includes ops proposed by the Claude agent.
- Deleting original scene content requires confirmation, and undo always brings it back.
- Credentials never reach the browser:
  - **Artifact:** the hosted page reaches Claude only through the claude.ai host's `sample` capability, so the page holds no key.
  - **Local development:** any agent with file access runs in the dev server with the key in its environment. See stage 4–5 below.

## Stages

1. **Done.** Vertical slice: select an object in the running world, change its transform or material on the in-world computer, see it immediately. Undo, redo and save/load are included. Verified in the browser and covered by `tests/unit/engine.test.ts`.
2. **In progress.** Verification of the world tools on desktop and in VR, runtime controls, spawning and duplication, and autosave (`scripts/e2e-studio.mjs`).
3. Component API and gameplay components (trigger, door, spinner, health, spawner, sound), plus a node logic editor with typed ports and debugging.
4. Code workstation with controlled hot reload:
   - **Runtime scripts:** run in the page, sandboxed per component, with error boundaries.
   - **Project files:** in local dev only, through an allow-listed dev-server API with checkpoints, diffs and rollback.
5. Claude agent (ops and patches proposed for approval), diagnostics (performance overlay, colliders, bounds, frustum, expensive objects) and asset import.

## Known limitations

- The rally add-on runs its own loop and is not paused by the runtime.
- Undo history is per session. A reload keeps only what was saved or autosaved.
- The Studio UI is drawn on the 1920×1080 monitor canvas and sized for monitor distance. In VR, use the ray or the desk mouse on it.
