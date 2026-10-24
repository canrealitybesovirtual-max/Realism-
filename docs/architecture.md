# Architecture

The project uses plain three.js (r186), Vite and TypeScript, with no framework layer. That keeps direct control of the WebXR frame loop. Units are metres, kilograms and seconds. +Y is up, the desk wall is −Z and the glazing is −X.

```
src/
  main.ts                 bootstrap: renderer, load, bakes, physics, input, frame loop
  config.ts               every real-world dimension in one place
  views.ts                fixed inspection viewpoints (screenshots / review)
  util/geometry.ts        rounded/bevelled panels, lofts, metre-scaled UVs, merging
  render/
    boxProjection.ts      shader patch: box-projected room probe, window-sun portal,
                          baked-AO occlusion of the window skylight
    aoBake.ts             GPU ambient-occlusion bake for planar receivers
    contactShadows.ts     soft contact shadows under movable props
  world/
    materials.ts          PBR material library (procedural textures from public/textures)
    room.ts               architectural shell, glazing, door, terrace; static colliders
    lighting.ts           HDRI sky dome, sun, window area light, RoomProbe (multi-bounce)
    workstation.ts        places all furniture/props/assets at real positions
    furniture/*.ts        desk, chair, monitor, keyboard, mouse, PC, sideboard, props
  computer/
    keyLayout.ts          ANSI TKL layout shared by 3D keyboard, animation and VR typing
    textBuffer.ts         editor model (pure, unit-tested)
    calculator.ts         calculator model (pure, unit-tested)
    windowManager.ts      window stack / hit testing / dragging (pure, unit-tested)
    os.ts                 canvas-rendered desktop: menu bar, dock, windows, 4 apps
    computer.ts           OS host: texture uploads, storage, key routing, sticky keys
  physics/
    physics.ts            Rapier world, fixed 120 Hz step, interpolation, holding
    propDefs.ts           mass / friction / restitution / collider shapes per prop
  interaction/
    shared.ts             walkable area, desk mouse, single pointer-owner lock
    desktop.ts            pointer-lock walking, use-the-computer mode, grab/throw
    xr.ts                 controllers, ray/poke/grab, desk mouse, teleport, snap turn
  dev/emulator.ts         IWER virtual Quest 3, loaded only with ?emulate
scripts/
  gen-textures.mjs        procedural PBR texture sets (concrete, plaster, oak, fabric, mesh)
  screenshots.mjs         renders the fixed views in headless Chromium
  e2e.mjs                 browser checks: desktop + emulated WebXR interaction
  metrics.mjs             draw calls, triangles, CPU cost per frame
tests/unit/               vitest: editor, calculator, window manager, layout, physics
```

## Rendering

- **Materials:** physically based (`MeshStandardMaterial` and `MeshPhysicalMaterial`).
  - Clear coat on the sealed concrete and the oiled oak.
  - Sheen on the upholstery.
  - Alpha-to-coverage on the chair's mesh back.
- **Lighting:**
  - **Sun:** a `DirectionalLight` with a 4K shadow map (2K on standalone headsets).
  - **Sun portal:** interior surfaces only accept sun whose ray passes through both the inner and the outer aperture of the window opening. This is an analytic test in the shader, so the shell never leaks light. The shadow map still handles the frame, mullions and furniture.
  - **Skylight:** a `RectAreaLight` filling the glazing opening. Area lights cannot cast shadows, so the baked AO map occludes them (dark under the desk, open near the glass).
  - **Indirect light:** `RoomProbe` renders a cube map of the lit room, convolves it with PMREM and repeats this three times, which approximates several bounces off the white walls and pale floor. The probe is *box-projected*: reflections line up with the walls and windows as you move, instead of sliding.
- **Ambient occlusion:** `PlanarAOBaker`.
  - For 96 cosine-distributed directions, it renders an orthographic depth map looking away from each large receiver (floor, 4 walls, ceiling, desk top), clipped behind the receiver.
  - Occluders closer than a radius darken the texel.
  - The result is contact shadows under the chair, desk and PC, and soft room corners, with zero per-frame cost, which matters in VR.
  - The bake runs at load: under a second on a GPU, minutes in software rendering.
- **Movable props:** they cannot use baked AO, so each one gets a ray-cast contact-shadow decal.
- **Sun shadow map updates:** re-rendered only while a physics body is awake.
- **Tone mapping and colour:** Khronos PBR Neutral, sRGB output. The exposure is in the URL: `?exp=`.

## The computer

`DesktopOS` draws a 1920×1080 desktop into a 2D canvas. The canvas is the emissive map of the monitor's LCD material, behind a matte anti-glare coat that still reflects the room.

- The canvas is only redrawn when something changes, and uploads are capped at about 45 per second.
- Input is device-agnostic, in screen pixels:
  - **Desktop:** a pointer-locked mouse moves the cursor, and the 3D desk mouse mirrors the movement.
  - **VR controller ray:** the cursor jumps to the hit point and the trigger clicks.
  - **VR desk mouse:** grab the mouse and slide it; the physical distance maps to pixels.
- Keys arrive from real `KeyboardEvent`s or from VR pokes on the 3D keys. VR uses sticky modifiers, because one controller cannot hold Shift and a letter at once.
- Apps:
  - **Notes:** caret, selection, word movement, undo, clipboard, autosave to `localStorage`.
  - **Calculator.**
  - **Sketch:** freehand drawing.
  - **System:** live renderer and XR statistics.
- `PointerOwner` gives the OS pointer to one input source at a time, so the second controller cannot fight the first.

A live HTML page rendered into a texture was considered and rejected:

- Cross-origin pages cannot be read into WebGL at all.
- Same-origin DOM-to-texture needs a full re-rasterisation every frame.
- There is no reliable input routing back into the DOM from an XR controller.

## Physics

Rapier (compat WASM build) steps at a fixed 120 Hz with an accumulator and interpolated render poses.

- **Static colliders:** architecture and furniture are fixed cuboids.
- **Dynamic props:** the mug (cylinder plus handle), the notebook (cuboid) and the pen (capsule). Each has its real mass, friction and restitution, continuous collision detection (CCD) is on, and bodies can sleep.
- **Holding:** a held object stays a dynamic body driven by velocity toward the hand pose, capped at 6 m/s.
  - Walls and furniture still stop it.
  - If it gets more than 40–45 cm away from the hand, it is released rather than dragged through geometry.
  - On release it keeps the hand's velocity, clamped to 5 m/s.

## WebXR

- `local-floor` reference space and 0.5 foveation. The rig is a `Group` that carries the camera and controllers.
- Priority per controller:
  1. Holding something.
  2. Poke typing, with 2 mm press / 4 mm release hysteresis and a haptic tick.
  3. The pointing ray (screen, keys, props, desk mouse).
  4. Locomotion, independent of the above so you can walk while holding things: the left stick walks smoothly at 1.3 m/s relative to the head's facing (dead zone, eased start/stop, sliding along walls and furniture footprints) with a mild comfort vignette while moving; the right stick snap-turns 30° about the head.
- When the right ray points at the monitor, its stick scrolls instead of turning.
- Head pose comes from the scene camera inside the rig, never from `renderer.xr.getCamera().getWorldPosition()`, which drops the rig transform.
- Controller models come from the WebXR input-profiles CDN. A built-in model is shown when that is unreachable.
