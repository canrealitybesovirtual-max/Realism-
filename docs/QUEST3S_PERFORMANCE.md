# Quest 3S performance guide (CQC / the apartment, WebXR in Meta Quest Browser)

Scope: this project runs as WebXR in the Quest Browser, not as a native APK. That decides what is possible:
the browser owns the GPU/CPU clock levels, the eye-buffer swapchain, Application SpaceWarp and the compositor.
A web app controls framebuffer scale, fixed foveation, target refresh rate, what it draws and how it shades.
Things marked **[verified here]** were measured in this repo (headless Chromium); **[on-device]** must be checked
on the headset; **[unverified]** means the official page could not be read from the build machine.

## 1. Already in the game (no action needed)

| Technique | What the game does | Where |
|---|---|---|
| Dynamic resolution | framebuffer scale learned per headset, lowered when frames run long, raised when they hold | `perf.xr.scale`, ADAPTIVE QUALITY |
| Adaptive fixed foveation | starts sharp (0.35, step 123), climbs under load, comes back when there is headroom | `renderer.xr.setFoveation`, `xs.fov` |
| Refresh rate ladder | 72 -> 80 -> 90 Hz one rung at a time with `session.updateTargetFrameRate` only while frames hold; never 120 | `RATE`, `CONFIG.xrRate` |
| Draw-call reduction | apartment merged per material, split into ~680 spatial chunks (one draw each, not 10,800 meshlets) | `world/src/clusters.js` |
| Frustum + back-face culling | per chunk sphere, per chunk normal cone | `clusters.js` |
| Occlusion culling (baked PVS) | GPU-baked per 1.5 m cell, both floors, two eye heights; chunks and loose props/fittings/mirrors behind walls are not drawn **[verified here: 21-45 % fewer draws, 29-43 % fewer triangles, same picture]** | `world/src/pvs.js` |
| Small-object culling | sub-pixel parts skipped, struggle mode | `CONFIG.detail` |
| LOD | enemies 100/30/10 % at 3.5/9 m in VR; rack guns 100/30/10 % at 2/5 m **[verified here: 308k -> 64k triangles at 6 m]** | `ENEMY_LOD`, `aptRackLod` |
| Baked lighting | irradiance volume (bounce), contact-occlusion field, sun shadow from a 97k-triangle proxy redrawn only when things move | `finish.js`, APARTMENT LOOK |
| Efficient shadows | no realtime shadow maps by default; sun map on demand; one shadowed flashlight | `REAL_LIGHT`, `aptSunRender` |
| Shader stalls | warm-up compiles before raids, no error-log sync reads, env map present from build (no recompiles) | `aptRaidWarm`, `checkShaderErrors` |
| Texture streaming | city view decoded off-thread, uploaded one face per ~18 ms, LRU of 2 probes in VR | `world/src/view.js` |

## 2. Officially supported knobs you can use today (safe, reversible)

1. **In-game Comfort / Graphics pages (terminal):** Sharpness on keeps foveation low at session start; Lite graphics is for laptops (never applied in the headset).
2. **Refresh rate:** the game climbs to 80/90 Hz by itself when frames hold. For close-quarters fights, 72 Hz gives 13.9 ms per frame, 90 Hz 11.1 ms. 90 Hz lowers motion-to-photon latency and judder but needs ~25 % more headroom. Recommendation: let the ladder decide; if a fight drops frames at 90, the game steps back.
3. **Quest 3S lenses (Fresnel) [reasoning]:** the 3S periphery is optically softer than the Quest 3's pancake lenses, so fixed foveation costs less visible quality there. Higher foveation is the cheapest pixel saving on this headset; keep text/UI panels near the centre of view.
4. **Measure, do not guess:**
   - Meta's **OVR Metrics Tool** (Meta Horizon Store / developer download): enable its overlay, then play. Read FPS, GPU %, CPU %, CPU/GPU clock levels, temperatures, stale frames. GPU near 100 % = pixel/shading bound (foveation and resolution help); CPU high with GPU low = draw / game-logic bound (culling, fewer objects help).
   - The game's own log: connect the headset by USB, open `chrome://inspect` on a computer, inspect the Quest Browser tab, run `cqcHitches('vr')` after a session: average / p95 / p99 frame time, dropped %, draw calls, triangles, foveation and scale used, CPU ms per system.

### Test protocol (repeatable)
1. Charge to >80 %, room temperature, same spot (library, then the great hall facing the gallery, then a 4-man Siege raid).
2. OVR Metrics overlay on. Stand still 30 s per spot; note FPS, GPU %, CPU %, GPU level.
3. Play 20 minutes of raids without a break (thermal soak). Note when (if) clock levels or FPS drop.
4. After leaving VR read `cqcHitches('vr')` for p95 / p99 frame time and dropped %.
5. Change ONE thing (a URL flag below or an ADB property), repeat. Keep a table.

URL flags for A/B on the headset (open the game with them, nothing is saved): `?aptpvs=off` (occlusion culling), `?aptclusters=off`, `?skincull=off`, `?elod=off`, `?aptmerge=off`, `?rate=off` (refresh ladder), `?sharp=off`.

## 3. Experimental / unsupported (developer mode + ADB) — read the risks

Needs: developer mode (Meta Horizon phone app -> headset -> Developer mode; requires a developer organisation), USB debugging allowed in the headset, `adb` on a computer.

| Property (`adb shell setprop ...`) | Effect | Applies to WebXR in the browser? | Risk / undo |
|---|---|---|---|
| `debug.oculus.cpuLevel <n>` / `debug.oculus.gpuLevel <n>` | overrides the app's CPU/GPU clock level | **[unverified]** the browser is the foreground app, so it may apply; confirm the level in OVR Metrics | more heat and battery drain, earlier thermal throttling (can end up slower in a 20-min soak). Undo: `setprop` back to `0`/empty or reboot (`debug.*` properties do not survive a reboot). |
| `debug.oculus.foveation.level <0-4>` | forces fixed foveation | **[unverified]** the browser sets its own from WebXR | visible blur in the periphery at high levels. Reboot undoes it. |
| `debug.oculus.refreshRate <72/90/120>` | forces the display rate | **[unverified]**; the game already requests rates through WebXR | at 120 Hz the 8.3 ms budget is not reachable for this content. Reboot undoes it. |
| `debug.oculus.textureWidth/Height` | eye-buffer size for native apps | very likely **no**: WebXR sizes its own buffer (framebufferScaleFactor) | — |

Check a value with `adb shell getprop <name>`. Never use `setprop persist.*` (survives reboots), never sideload firmware tools.

**Quest Games Optimizer (QGO, third party, itch.io):** applies per-app overrides of the same kind (resolution, refresh rate, CPU/GPU levels, foveation) through ADB for native games. For a WebXR game its resolution and foveation settings are unlikely to matter (the page sets those); its CPU/GPU level setting is the only part that might, with the same heat/throttling risk. It is unofficial and can break with system updates; undo = remove its profile and reboot. Not recommended over the built-in adaptive systems unless OVR Metrics shows the clocks are low while frames drop.

**Application SpaceWarp, CPU/GPU level APIs, eye-tracked foveation:** native-only (OpenXR/OVR). Not available to WebXR in the browser **[unverified for current browser builds]**.

## 4. Multiview stereo (in the game, on by default; headset check needed)

One draw call renders both eyes (`OCULUS_multiview` / `OVR_multiview2` on a `texture-array` projection layer), so the CPU cost of drawing in VR is roughly halved. three.js's `WebGLRenderer` has no multiview (checked up to r187), so CQC's vendored three.js r170 is patched:
- shaders are shaded in one common view space (the XR camera's); only `projectionMatrix` (P_eye x V_eye x V_common^-1) and `cameraPosition` are per eye, and the specular view direction starts at each eye, so every existing custom shader works unchanged **[verified here: a test scene and the game's own scenes, multiview vs each eye drawn alone, pixel-identical]**;
- MSAA comes from `OCULUS_multiview`'s multisampled attachments (resolved on the tile, as before);
- mirrors draw each eye's reflection side by side; cluster and PVS culling test both eyes.

Off switch: OPTIONS > GRAPHICS "Multiview stereo (VR)" or `?mv=off`. If the first frames of a VR session raise a GL error, the game says so in the headset and the next session is drawn the old way (cleared by turning the option back on). A/B on the headset: OVR Metrics CPU % and `cqcHitches('vr')` with and without `?mv=off`.
