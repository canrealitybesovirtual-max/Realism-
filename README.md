# Realism — a photoreal WebXR office

One room, built to look like a professionally photographed modern studio: polished concrete, white walls, floor-to-ceiling glazing and a morning sun. It holds a working computer, objects you can pick up and throw, and runs both in a desktop browser and in a VR headset (WebXR).

```
npm install
npm run dev          # http://localhost:5173  (use https / a tunnel for a headset on your LAN)
```

## Controls

**Desktop**

| Action | Input |
|---|---|
| Look | Click the view to capture the mouse, then move it |
| Walk | W A S D (Shift = faster) |
| Pick up / drop / throw | Click or **E** on the mug, notebook or pen; a hand appears holding it. Mouse wheel changes the holding distance |
| Use the computer | Click the monitor. The mouse now drives the on-screen cursor (and the desk mouse); typing goes to the computer and animates the 3D keys |
| Stop using the computer | **Esc** |
| Pistol | Pick it up from the sideboard like any object. While holding it, click fires where you look; **R** reloads |

**VR (WebXR headset)**

Your controllers appear as animated hands. Fingers follow the trigger, grip and thumb rest, and the index finger extends near the keyboard and screen. Held objects settle into a natural grasp: pen in a pinch, fingers through the mug handle, thumb over the notebook, palm on the mouse. Quest hand tracking also works without controllers: your fingers drive the hand, a pinch clicks and grabs, and your fingertip types. Add `?controllers` to the URL to see plain controller models instead.

| Action | Input |
|---|---|
| Click on the monitor | Point the controller at the screen and pull the trigger. The stick scrolls |
| Type | Poke the keys of the 3D keyboard with the hand's index fingertip (haptic tick on each press). Or point at a key and pull the trigger. Shift, Ctrl and Caps are sticky: tap Shift, then a letter |
| Use the mouse | Grab the desk mouse (grip) and slide it on the pad. Trigger clicks while holding it |
| Pick up | Grip near an object, or point at it within 1.2 m and grip / trigger. Release to drop or throw |
| Walk | Left stick: smooth walking in the direction you look (walls and furniture stop you; edges dim slightly while moving, for comfort). Works while holding things |
| Pistol | Grip to pick it up (it stays in your hand when you let go of the trigger). Trigger fires; **A / X** reloads. Release grip to put it down |
| Turn | Right stick: flick left/right to snap-turn 30°. Up/down scrolls when pointing at the monitor |

URL options:

| Option | Effect |
|---|---|
| `?q=xr` | Light quality tier (automatic on Quest / Pico browsers) |
| `?exp=1.2` | Exposure |
| `?view=seated` | Fixed viewpoint (see `src/views.ts`) |
| `?emulate` | Virtual Quest 3 via IWER, for testing without a headset |
| `?noao` | Skip the AO bake |
| `?controllers` | Show controller models instead of hands in VR |
| `?handpreview=fist,point` | Development: hands in named poses on the desk |

## The computer

A canvas-rendered desktop (menu bar, dock, draggable windows) with four apps:

- **Notes:** a real text editor with selection, word navigation, undo, cut/copy/paste and autosave.
- **Calculator.**
- **Sketch:** draw with the mouse or a controller.
- **System:** live renderer and XR statistics.

## Checks

```
npm run typecheck
npm test                         # 33 unit tests: editor, calculator, window manager, key layout, physics, hands and grasps
npm run dev & node scripts/e2e.mjs        # 33 browser checks, desktop + emulated Quest 3 WebXR
npm run dev & npm run shots               # renders the fixed viewpoints to ./shots
npm run dev & node scripts/metrics.mjs    # draw calls, triangles, CPU ms per frame
npm run textures                 # regenerate the procedural PBR textures
```

## Assets and licences

- **Poly Haven, CC0:**
  - [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01), [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) and [Wall Clock](https://polyhaven.com/a/wall_clock), as 1K glTF.
  - These were fetched from a public GitHub mirror (`specht/backrooms-nachtschicht`), because the build environment could not reach Poly Haven's CDN. The files carry Poly Haven's naming and structure. Re-download them from polyhaven.com if you need verified originals.
- **Pistol:** [Service Pistol](https://polyhaven.com/a/service_pistol) by Mateusz Sadek, Poly Haven, CC0 (1K glTF, fetched from the `vvanghelue/mini-cry` GitHub mirror). The scan is a single mesh, so the slide is split off at load time in `src/world/pistol.ts` and animated separately.
- **Sounds, Freesound, CC0:** [9mm pistol shot](https://freesound.org/people/michorvath/sounds/427592/) by michorvath; [Dry Fire](https://freesound.org/people/brianhanson2nd/sounds/171211/) by brianhanson2nd; magazine out/in from [Colt SMG - Firing, Handling](https://freesound.org/people/hyperix6/sounds/676588/) by hyperix6.
- **HDRI:** [Spruit Sunrise](https://polyhaven.com/a/spruit_sunrise), Poly Haven, CC0. The 4K UltraHDR JPEG comes from the three.js examples.
- **Textures:** concrete, plaster, oak, upholstery, chair mesh and grit are procedurally generated by `scripts/gen-textures.mjs`. They are original to this project.
- **Everything else** (furniture, hardware, architecture) is modelled in code, in `src/world`.

See `docs/visual-target.md` for the visual specification and `docs/architecture.md` for how the pieces fit together.
