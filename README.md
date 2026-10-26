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
| Screen size | On the computer: **System** app → Screen size (24", 27", 32", 43"); remembered |
| Guns | Pick one up like any object. Click fires where you look; right mouse aims. **R**: magazine out, press again for a magazine in (a loaded one lying within reach, else the fullest spare on your belt). **F**: rack the slide / work the bolt. **B**: slide stop. **L**: light / laser. A line at the bottom shows rounds and spares. **E** on an ammo can refills the belt |

**VR (WebXR headset)**

Your controllers appear as animated hands. Fingers follow the trigger, grip and thumb rest, and the index finger extends near the keyboard and screen. Held objects settle into a natural grasp: pen in a pinch, fingers through the mug handle, thumb over the notebook, palm on the mouse. Anything else you pick up (a magazine, say) gets fingers that close until they touch it, and the hand stays where the object really is. An empty hand stops at the desk and the walls even when the controller goes through them. The skin has creases at the joints, palm lines, knuckle wrinkles, fine grain and nails with a lunula, all computed on the GPU (no textures). Quest hand tracking also works without controllers: your fingers drive the hand, a pinch clicks and grabs, and your fingertip types. Add `?controllers` to the URL to see plain controller models instead.

| Action | Input |
|---|---|
| Click on the monitor | Point the controller at the screen and pull the trigger. The stick scrolls |
| Type | Poke the keys of the 3D keyboard with the hand's index fingertip (haptic tick on each press). Or point at a key and pull the trigger. Shift, Ctrl and Caps are sticky: tap Shift, then a letter |
| Use the mouse | Grab the desk mouse (grip) and slide it on the pad. Trigger clicks while holding it |
| Pick up | Grip near an object, or point at it within 1.2 m and grip / trigger. Release to drop or throw |
| Walk | Left stick: smooth walking in the direction you look (walls and furniture stop you; edges dim slightly while moving, for comfort). Works while holding things |
| Guns | Grip to pick one up; trigger fires. **A / X**: magazine release - the magazine drops out as a real object. **Reload by hand:** squeeze your other hand at your hip to draw a spare magazine, bring it up to the magwell (it seats when lined up). **Glock:** grab the back of the slide with the other hand and pull it to rack; **B / Y** is the slide stop when it is locked back (else the light). **AWM:** grab the bolt handle, lift it, pull it back (the case flies out), push it forward and down. Let a magazine go at your hip to put it back on the belt; point at an ammo can and pull the trigger to refill. The old service pistol keeps its simple **A** reload |
| Snowy Mountain Rally / Highway | Pick one in the **Door** app on the computer, then walk to the office door and press **A** (or point at it and pull the trigger) |
| Get in the car | Walk up to it and press **A** |
| Drive | Right trigger: gas · Left trigger: brake, then reverse (both analog) · **Steer with your hands:** grip the steering wheel's rim (one or both hands) and turn it, or use either stick · **A**: handbrake · **B**: get out · **Y**: back on the road · **X**: re-centre the seat. The speedometer and rev counter in the dash work. The door back to the studio follows you around the map on foot and comes to where you get out |
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
| Action | Semi-auto, 8 rounds | Semi-auto, 17+1; slide locks back on an empty magazine; real magazines | Bolt action, 5+1; work the bolt after each shot; real magazines |
| Extras | | Olight weapon light | Scope 5-20x, mil-dot reticle; laser |
| Ballistics | 9x19, 360 m/s | 9x19, 360 m/s, zeroed 25 m | .338 Lapua, 900 m/s, zeroed 100 m |

- **Bullets fly.** They are projectiles with gravity and drag, not instant hits. At 500 m the .338 arrives after about 0.66 s and has dropped about 1.2 m below a 100 m zero, so hold over about 2.5 mil on the reticle.
- **The scope magnifies.** It renders a zoomed view in the eyepiece. Mil-dots are true milliradians at every zoom. Your eye must be behind the eyepiece at the right distance, or the view darkens at the edges.
- **VR:**
  - The bore follows your controller and the hand sits on the grip.
  - Grip the AWP's fore-end with your other hand to aim it with both hands.
  - **A/X:** magazine release (G17 / AWM): it falls out with the rounds it still holds; a magazine dropped or picked up keeps its count.
  - **Reload:** draw a spare at your hip with the free hand and push it into the magwell; rack the slide / work the bolt by hand to chamber.
  - **B/Y:** slide stop (Glock locked back), else weapon light / laser.
  - **Stick up/down:** scope zoom.
- **Desktop:**
  - Hold right mouse to aim down the sights or scope. Click fires.
  - **R:** magazine out / in. **F:** rack the slide or work the bolt. **B:** slide stop. **L:** light / laser.
  - Ammo cans (office floor by the sideboard, range bench) refill the belt pouch: three spare magazines per gun.
  - The mouse wheel zooms while aiming.

**Shooting Range:** in the Door app on the computer, pick *Shooting Range*, then go through the office door.

- **The firing line:** a covered bench. Every gun is laid on it when you arrive.
- **The trap house:** 15 m out. Clays are 110 mm and fly at about 27 m/s; leading them with a single bullet is as hard as it sounds.
  - **PULL:** green button, **P**, or a left-stick click in VR.
  - **AUTO:** orange button, **O**, or a right-stick click.
- **Steel plates:** on chains at 25 m (pistol), 50, 100, 200, 300, 500, 800 and 1000 m. A hit swings the plate and leaves a lead splash; the ring arrives after the sound's travel time.
- **The bench board:** shows clays broken and steel hits.
- **Back to the studio:** the door at the back of the firing line (**E**, or **A** in VR).

## Add-ons: Game Editor, Video, Door, the Snowy Mountain Rally and the Highway

`public/addons` holds plain scripts that build on `window.__studio` once the room has loaded.

- **Game Editor (`editor.js`):** a computer app that runs JavaScript inside the live room. Its *Ask Claude* tab writes that code from a sentence. That needs the page to be opened on claude.ai while signed in; in a separate tab (which VR needs), use the *Code* tab.
- **Video (`editor.js`):** plays a video file from your device on the monitor. The browser's file dialog cannot open inside a VR session, so pick the file before entering VR.
- **Door + maps (`rally.js`, `rally-car.json`, `rally-snow.json`, `src/maps/highway.ts`):** the Door app chooses where the office door leads. *Snowy Mountain Rally* is a 2.4 km terrain with a 5.5 km road loop and a car you can drive. *Highway* is a procedural 8 km motorway loop: three lanes each way, a concrete median barrier, guardrails, lamp posts, gantry signs, rolling grassland with trees, and about 30 cars of GLB traffic (Kenney's Car Kit). Most of the traffic wears photo skins wrapped from paper-model sheets (a Chevrolet C10, Ford Focus wagon, Hyundai Grace, FSO Polonez, Volvo 850, BMW 7, Fiat Uno, a rusty VW flatbed, a grey van), and three lorries pull J.B. Hunt, Pultrum and plain trailers behind Mack / Volvo FH style cabs. Each model's faces take their panel by the way they face and their position within the model, and the sides are stretched so the printed wheel arches meet the real wheels. All traffic is drawn instanced: cars near you have turning wheels and cast shadows, the rest are one merged mesh per model (about 40 draw calls for 32 cars). The traffic follows the car in front with the Intelligent Driver Model and changes lanes when it gains by it (keeping right otherwise); it brakes for you, and a car you hit gets shoved and pulls up. Your car waits on the hard shoulder by the lay-by.
- **Each map loads on its own:** nothing behind the door is downloaded or built with the office. The highway is a separate code chunk plus `models/traffic/traffic.json`, fetched the first time you go; the rally map fetches only its own data. Both are built when you go through the door and freed (geometry, textures, audio) when you come back. The car is shared and kept. The shooting range is its own chunk too, built the first time you go there. On desktop: <kbd>E</kbd> at the door or the car, <kbd>W A S D</kbd> drive, <kbd>Space</kbd> handbrake, <kbd>C</kbd> camera, <kbd>R</kbd> back on the road. In VR, see the controls above. You sit in the driver's seat, calibrated to where your head is when you get in; tyre slip and landings rumble the controllers.
- `node scripts/e2e-rally-vr.mjs` walks the whole thing in an emulated Quest 3; `node scripts/e2e-maps.mjs` checks the on-demand loading, the highway traffic, driving, barriers and crashes.

## The computer

A canvas-rendered desktop (menu bar, dock, draggable windows) with four apps:

- **Notes:** a real text editor with selection, word navigation, undo, cut/copy/paste and autosave.
- **Calculator.**
- **Sketch:** draw with the mouse or a controller.
- **System:** live renderer and XR statistics.

It also carries the engine tools, which edit the running game you are standing in (details in [docs/engine.md](docs/engine.md)):

- **Studio:** hierarchy, live viewport, inspector, components, play / pause / step / stop, undo, save / load / autosave recovery. In the world: click (desktop) or trigger (VR) selects; G or squeeze carries.
- **Logic:** node graphs with typed ports and live debugging, attached to objects with a *Script graph* component.
- **Code:** JavaScript scripts on objects, checked as you type and hot-reloaded when you Apply (Ctrl+S) while playing. With `npm run dev` it also edits the project's own source files, through a guarded dev-server API (allowlist, confirmation, conflict check, checkpoints and restore), and runs the real type check and unit tests. In the published page the project side says it is unavailable.
- **Assistant:** ask Claude for a change in plain words; it proposes validated scene ops (scripts shown as diffs), and you approve or reject. It runs on claude.ai (your account) or through the dev server with `ANTHROPIC_API_KEY`. One Undo reverts an applied proposal.
- **Profiler:** CPU time per frame section, draw calls, triangles, memory, the most expensive objects, a regression baseline, and collider / bounds / frustum overlays.
- **Assets:** import `.glb` models (checked, stored in the browser), prefabs, exposure / reflections / shadow softness.

## Checks

```
npm run typecheck
npm test                         # 81 unit tests: engine ops/undo/save, components, graphs, scripts, agent proposals, asset checks, diff/highlighter, editor, calculator, window manager, physics (incl. hand sweeps), hands, grasps and skin attributes
npm run dev & node scripts/e2e.mjs        # 36 browser checks, desktop + emulated Quest 3 WebXR
npm run dev & node scripts/e2e-maps.mjs   # 11 checks: maps load on demand and free on leaving; highway traffic, driving, rails, crashes; lazy range
npm run dev & node scripts/e2e-hands-vr.mjs # 4 checks: hands stop at the desk; fingers close onto a held magazine
npm run dev & node scripts/e2e-studio.mjs # 16 editor checks (world tools on desktop and in VR, runtime, save/load)
npm run dev & node scripts/e2e-code.mjs   # code workstation through the computer's own input, incl. project files on the dev server
npm run preview & node scripts/e2e-agent.mjs --url http://localhost:4173/  # assistant (with a sample() test double), profiler, assets
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
- **Rally car and mountain textures, CC BY 4.0 (Sketchfab):** car "art of rally Latest Version 2027" by FarHandle5255; textures "Snowy Mountain Road Scene" by 99.Miles. They are packed into `public/addons/rally-car.json` and `public/addons/rally-snow.json`, and the credit is shown on screen while you are on a map.
- **Traffic skins:** paper-model sheets supplied by the project owner, kept in `tools/car-skins/sheets` and packed by `tools/car-skins/build.py` (crops in `tools/car-skins/skins.json`) into `public/models/traffic/skins`. They are third-party designs and carry their makers' terms: the Volvo FH sheet (bouwplaatvanjeeigentruck.nl) is free for private, non-commercial use only and asks not to be modified, Papermau's sheets are for personal use, and the vehicles' makes and logos are their owners' trademarks. They are not committed (see `.gitignore`): without them the highway traffic keeps Kenney's own paint. Put the sheets in `tools/car-skins/sheets` and run the build script to bring the skins back for your own copy.
- **Highway traffic and trees, CC0:** [Car Kit](https://kenney.nl/assets/car-kit) and [Nature Kit](https://kenney.nl/assets/nature-kit) by Kenney, taken from the `@netforge/asset-library-files` npm package and packed into `public/models/traffic/traffic.json` by `scripts/pack-traffic.cjs`. The road, terrain, sky and road textures are generated in code.
- **Textures:** concrete, plaster, oak, upholstery, chair mesh and grit are procedurally generated by `scripts/gen-textures.mjs`. They are original to this project.
- **Everything else** (furniture, hardware, architecture) is modelled in code, in `src/world`.

See `docs/visual-target.md` for the visual specification and `docs/architecture.md` for how the pieces fit together.
