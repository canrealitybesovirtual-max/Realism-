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
| Snowy Mountain Rally | Pick it in the **Door** app on the computer, then walk to the office door and press **A** (or point at it and pull the trigger) |
| Get in the car | Walk up to it and press **A** |
| Drive | Right trigger: gas · Left trigger: brake, then reverse (both analog) · Either stick: steer · **A**: handbrake · **B**: get out · **Y**: back on the road · **X**: re-centre the seat |
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

## Guns and the shooting range

| | Service pistol (P38) | Glock 17 Gen 5 | AWM .338 Lapua (AWP) |
|---|---|---|---|
| Where | Sideboard | Sideboard | Floor by the sideboard |
| Action | Semi-auto, 8 rounds | Semi-auto, 17+1, slide locks back on empty | Bolt action, 5 rounds; work the bolt after each shot |
| Extras | | Olight weapon light | Scope 5-20x, mil-dot reticle; laser |
| Ballistics | 9x19, 360 m/s | 9x19, 360 m/s, zeroed 25 m | .338 Lapua, 900 m/s, zeroed 100 m |

- **Bullets fly.** They are projectiles with gravity and drag, not instant hits. At 500 m the .338 arrives after about 0.66 s and has dropped about 1.2 m below a 100 m zero, so hold over about 2.5 mil on the reticle.
- **The scope magnifies.** It renders a zoomed view in the eyepiece. Mil-dots are true milliradians at every zoom. Your eye must be behind the eyepiece at the right distance, or the view darkens at the edges.
- **VR:**
  - The bore follows your controller and the hand sits on the grip.
  - Grip the AWP's fore-end with your other hand to aim it with both hands.
  - **A/X:** reload (pistols) or work the bolt (rifle).
  - **B/Y:** weapon light (Glock), magazine (rifle) or laser.
  - **Stick up/down:** scope zoom.
- **Desktop:**
  - Hold right mouse to aim down the sights or scope. Click fires.
  - **R** reloads.
  - **F** works the bolt (rifle) or switches the light (Glock).
  - The mouse wheel zooms while aiming.

**Shooting Range:** in the Door app on the computer, pick *Shooting Range*, then go through the office door.

- **The firing line:** a covered bench. Every gun is laid on it when you arrive.
- **The trap house:** 15 m out. Clays are 110 mm and fly at about 27 m/s; leading them with a single bullet is as hard as it sounds.
  - **PULL:** green button, **P**, or a left-stick click in VR.
  - **AUTO:** orange button, **O**, or a right-stick click.
- **Steel plates:** on chains at 25 m (pistol), 50, 100, 200, 300, 500, 800 and 1000 m. A hit swings the plate and leaves a lead splash; the ring arrives after the sound's travel time.
- **The bench board:** shows clays broken and steel hits.
- **Back to the studio:** the door at the back of the firing line (**E**, or **A** in VR).

## Add-ons: Game Editor, Video, Door and the Snowy Mountain Rally

`public/addons` holds plain scripts that build on `window.__studio` once the room has loaded.

- **Game Editor (`editor.js`):** a computer app that runs JavaScript inside the live room. Its *Ask Claude* tab writes that code from a sentence. That needs the page to be opened on claude.ai while signed in; in a separate tab (which VR needs), use the *Code* tab.
- **Video (`editor.js`):** plays a video file from your device on the monitor. The browser's file dialog cannot open inside a VR session, so pick the file before entering VR.
- **Door + rally (`rally.js`, `rally-data.json`):** the Door app chooses where the office door leads. *Snowy Mountain Rally* is a 2.4 km terrain with a 5.5 km road loop and a car you can drive. On desktop: <kbd>E</kbd> at the door or the car, <kbd>W A S D</kbd> drive, <kbd>Space</kbd> handbrake, <kbd>C</kbd> camera, <kbd>R</kbd> back on the road. In VR, see the controls above. You sit in the driver's seat, calibrated to where your head is when you get in; tyre slip and landings rumble the controllers.
- `node scripts/e2e-rally-vr.mjs` walks the whole thing in an emulated Quest 3.

## The computer

A canvas-rendered desktop (menu bar, dock, draggable windows) with four apps:

- **Notes:** a real text editor with selection, word navigation, undo, cut/copy/paste and autosave.
- **Calculator.**
- **Sketch:** draw with the mouse or a controller.
- **System:** live renderer and XR statistics.

## Checks

```
npm run typecheck
npm test                         # 35 unit tests: editor, calculator, window manager, key layout, physics, hands and grasps (incl. the pistol grip fit)
npm run dev & node scripts/e2e.mjs        # 34 browser checks, desktop + emulated Quest 3 WebXR
npm run dev & npm run shots               # renders the fixed viewpoints to ./shots
npm run dev & node scripts/metrics.mjs    # draw calls, triangles, CPU ms per frame
npm run textures                 # regenerate the procedural PBR textures
```

## Assets and licences

- **Poly Haven, CC0:**
  - [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01), [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) and [Wall Clock](https://polyhaven.com/a/wall_clock), as 1K glTF.
  - These were fetched from a public GitHub mirror (`specht/backrooms-nachtschicht`), because the build environment could not reach Poly Haven's CDN. The files carry Poly Haven's naming and structure. Re-download them from polyhaven.com if you need verified originals.
- **Pistol:** [Service Pistol](https://polyhaven.com/a/service_pistol) by Mateusz Sadek, Poly Haven, CC0 (1K glTF, fetched from the `vvanghelue/mini-cry` GitHub mirror). The scan is a single mesh, so the slide is split off at load time in `src/world/pistol.ts` and animated separately.
- **Glock 17 Gen 5 + Olight, CC BY 4.0:** ["G17 Gen 5 Handgun + Olight - NSW Police Force"](https://sketchfab.com/3d-models/g17-gen-5-handgun-olight-nsw-police-force-0200c248eba14385ad2bee8d4dc4e586) by [8sianDude](https://sketchfab.com/haoliu95), Sketchfab. Textures were recompressed to 1024 px JPEG/PNG (`scripts/compress-glb.mjs`).
- **AWP sniper rifle, CC BY 4.0:** ["Awp Sniper Rifle - Custom Scope"](https://sketchfab.com/3d-models/awp-sniper-rifle-custom-scope-f78a0ccafd304f15b46d087ad896478f) by [M37_R](https://sketchfab.com/ahmettanju.2013), Sketchfab. Scaled to a real AWM's 1.2 m; textures recompressed.
- **More sounds, Freesound, CC0:** [Sniper Rifle](https://freesound.org/people/SuperPhat/sounds/514228/) by SuperPhat; bolt from [AR15 M4 Gun Hardware Magazine Movement Sounds](https://freesound.org/people/jackthemurray/sounds/393732/) by jackthemurray; brass from [shotgun sounds](https://freesound.org/people/lensflare8642/sounds/145209/) by lensflare8642. The range's clay break, steel ring and trap thunk are synthesised in code.
- **Sounds, Freesound, CC0:** [9mm pistol shot](https://freesound.org/people/michorvath/sounds/427592/) by michorvath; [Dry Fire](https://freesound.org/people/brianhanson2nd/sounds/171211/) by brianhanson2nd; magazine out/in from [Colt SMG - Firing, Handling](https://freesound.org/people/hyperix6/sounds/676588/) by hyperix6.
- **HDRI:** [Spruit Sunrise](https://polyhaven.com/a/spruit_sunrise), Poly Haven, CC0. The 4K UltraHDR JPEG comes from the three.js examples.
- **Rally car and mountain textures, CC BY 4.0 (Sketchfab):** car "art of rally Latest Version 2027" by FarHandle5255; textures "Snowy Mountain Road Scene" by 99.Miles. They are packed into `public/addons/rally-data.json`, and the credit is shown on screen while you are on the mountain.
- **Textures:** concrete, plaster, oak, upholstery, chair mesh and grit are procedurally generated by `scripts/gen-textures.mjs`. They are original to this project.
- **Everything else** (furniture, hardware, architecture) is modelled in code, in `src/world`.

See `docs/visual-target.md` for the visual specification and `docs/architecture.md` for how the pieces fit together.
