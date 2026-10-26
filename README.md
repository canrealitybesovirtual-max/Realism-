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
| Home (your room) | **AR HOME** button in the Quest browser: your real room from the headset's room scan, through the passthrough. A tablet sits above your left hand: point at it with the right controller and pull the trigger. Hold **X** to talk. Point the right controller at something to make it "this". Later also through the office door (Door app → **Home**) |
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
- **Door + maps (`rally.js`, `rally-car.json`, `rally-snow.json`, `src/maps/highway.ts`):** the Door app chooses where the office door leads. *Snowy Mountain Rally* is a 2.4 km terrain with a 5.5 km road loop and a car you can drive. *Highway* is a procedural 8 km motorway loop: three lanes each way, a concrete median barrier, guardrails, lamp posts, gantry signs, rolling grassland with trees, and about 30 cars of GLB traffic: a BMW E30, a Renault 12, a Mercedes W123, five modern hatchbacks and saloons, and a Toyota Celica in five colours (credits below). All traffic is drawn instanced: cars near you have turning wheels and cast shadows, the rest are drawn without them (a few draw calls per model, however many cars). The traffic follows the car in front with the Intelligent Driver Model and changes lanes when it gains by it (keeping right otherwise); it brakes for you, and a car you hit gets shoved and pulls up. Your car waits on the hard shoulder by the lay-by.
- **Each map loads on its own:** nothing behind the door is downloaded or built with the office. The highway is a separate code chunk plus `models/traffic/traffic.json`, fetched the first time you go; the rally map fetches only its own data. Both are built when you go through the door and freed (geometry, textures, audio) when you come back. The car is shared and kept. The shooting range is its own chunk too, built the first time you go there. On desktop: <kbd>E</kbd> at the door or the car, <kbd>W A S D</kbd> drive, <kbd>Space</kbd> handbrake, <kbd>C</kbd> camera, <kbd>R</kbd> back on the road. In VR, see the controls above. You sit in the driver's seat, calibrated to where your head is when you get in; tyre slip and landings rumble the controllers.
- `node scripts/e2e-rally-vr.mjs` walks the whole thing in an emulated Quest 3; `node scripts/e2e-maps.mjs` checks the on-demand loading, the highway traffic, driving, barriers and crashes.

## Home: your own room, redesigned by talking to it

Home is your real room and nothing else: there is no made-up house. It comes from your headset's room scan and is kept on this device.

- **Scan:** on a Quest 3 / 3S / Pro, open this page in the Quest browser and press **AR HOME**. The page reads the room scan from the headset's Space Setup through WebXR plane and mesh detection: walls, floor, ceiling, windows, doors and furniture (couch, table, bed, cabinets… as the headset names them). If the headset has no scan yet, **Scan room** on the tablet starts its room setup (where the browser allows it). Without a scan there is no Home.
- **In AR** you see your real room through the cameras and change it by voice (hold **X**, or the tablet's microphone), by pointing (the right controller makes things "this"), with undo and saves:
  - **Paint the real surfaces:** “paint the walls sage green”, “oak floor”, “marble floor”, “brick walls”, whole styles (“make this room scandinavian”, “show me three alternatives”). The paint is a layer over your real walls / floor / ceiling with holes for windows and doors; “make the walls original again” takes it off.
  - **Add furniture into your room:** “add a sofa against the wall”, “put a plant in the corner”, “add a floor lamp beside the couch”. New pieces stay inside the room, clear of your real furniture and the doorways. If “the couch” could mean your real one or one you added, you are asked which.
  - **Your real furniture stays real:** it cannot be repainted, moved or removed (it says so); you can place things around it. Its scanned box, and on headsets with depth sensing the live depth of everything, hides paint and added pieces behind it.
  - **Light:** added furniture is lit by the room's virtual lights; “dim the lights” / “warmer light” tints the passthrough view (a tint: your real lights cannot be changed).
  - The design autosaves and comes back next time, in the same place where the browser keeps a persistent anchor. The tablet has **Rescan**, **Scan room** and **Exit AR**.
- **On the desktop or in VR** (Door app → **Home**, through the office door): the same scanned room with your design, walls and floor drawn plain where they are unpainted and your real furniture as grey boxes (that is all the scan knows of them). You can walk around it and keep changing it; <kbd>E</kbd> leaves.
- **Talking:** hold <kbd>V</kbd> or the big microphone button (click to toggle), or turn on a wake word (“home, make the walls sage green”) in Settings. You see the words being heard, then what was understood, then progress. <kbd>T</kbd> types instead; <kbd>Esc</kbd> or “cancel” stops a running change. <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> or “undo” / “redo”. Replies can be spoken. What you look at (desktop) or point at (VR / AR) is outlined and is “this”.
- **Fast path:** everyday requests are understood on the page by a deterministic parser and applied straight away. Only open-ended requests go to Claude, which answers in JSON Lines applied line by line as they stream in. In dev that goes through the dev server (the API key stays on the server); on claude.ai it uses the page's own sample capability, which asks permission first. Without either, everyday requests still work and the page says Claude is not available.
- **Safe changes:** Claude (and the parser) only produce operations from a fixed list, each validated before it touches the scene; no code is ever run. Each request is one transaction: applied a few steps per frame, checked afterwards, rolled back completely if a step fails or you cancel, and undoable as one step. “save as …” keeps named designs (Designs tab), “restore …” brings one back, “reset” returns to your room as scanned (saving the current design as “Before reset” first).
- **Speed:** every request is timed from the end of speech (or Enter) to the first visible change and to the verified end; the **Speed** tab lists them. The shaders for every finish are compiled in the background when your room loads, so the first paint job does not wait for them.
- **Limits:** the page does not read the camera image (the headset composites the passthrough behind the 3D scene; camera pixels are only offered by experimental, browser-specific APIs), so your room is known from the scan, not from the picture: paint is a flat layer and covers pictures, switches and anything not in the scan (unless depth sensing is available). One room: the scanned one. Voice uses the browser's Web Speech API (Chrome / Edge yes; Firefox and many headset browsers no, so the panel and the tablet fall back to typing and buttons). AR needs the page in its own tab (the embedded artifact frame does not get the headset).
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
npm test                         # 105 unit tests: your room from the scan, the intent parser and design engine (undo, rollback, collisions, save/replay), engine ops/undo/save, components, graphs, scripts, agent proposals, asset checks, diff/highlighter, editor, calculator, window manager, physics (incl. hand sweeps), hands, grasps and skin attributes
npm run dev & node scripts/e2e.mjs        # 36 browser checks, desktop + emulated Quest 3 WebXR
npm run dev & node scripts/e2e-maps.mjs   # 11 checks: maps load on demand and free on leaving; highway traffic, driving, rails, crashes; lazy range
npm run dev & node scripts/e2e-home-ar.mjs # 15 checks: AR Home in an emulated Quest 3 (no scan → nothing invented; your scanned room in place; paint, furniture around real furniture, light, undo; same room on the desktop after)
npm run dev & node scripts/e2e-home.mjs  # 18 checks: your scanned room on the desktop: "make this room look more modern" timing, undo/redo, gaze targeting, moves around real furniture, cancel, questions, alternatives, save / reload / restore
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
- **Highway traffic, CC-BY-4.0 (Sketchfab):** “Car Pack 1” by buh (BMW E30, Renault 12, Mercedes W123), “Traffic Car Pack” by JUSTGAME (five cars), “Toyota Celica Gen7 scale1-70 for 3D-printing” by fishermans garage. Packed by `scripts/pack-cars.mjs`; full credits in `public/models/traffic/CREDITS.md`.
- **Highway trees, CC0:** [Nature Kit](https://kenney.nl/assets/nature-kit) by Kenney, taken from the `@netforge/asset-library-files` npm package and packed into `public/models/traffic/traffic.json` by `scripts/pack-traffic.cjs`. The road, terrain, sky and road textures are generated in code.
- **Textures:** concrete, plaster, oak, upholstery, chair mesh and grit are procedurally generated by `scripts/gen-textures.mjs`. They are original to this project.
- **Everything else** (furniture, hardware, architecture) is modelled in code, in `src/world`.

See `docs/visual-target.md` for the visual specification and `docs/architecture.md` for how the pieces fit together.
