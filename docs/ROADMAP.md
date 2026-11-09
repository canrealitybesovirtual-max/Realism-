# WebXR Studio Engine – Master Roadmap (v2)

*Quest 3S standalone · Rooms: Studio office, Snowy Mountain Rally, Interstate · Based on a static code review of the Studio Office zip. Nothing here has been run on a headset yet.*

## Read this first: instructions for Claude

You are helping build **WebXR Studio Engine** (also called Studio Office), a standalone game and engine for the Meta Quest 3S headset, running in the headset's browser with WebXR. The user will upload the game file, normally a zip of built output: one large minified bundle, two add-on scripts, a separate Interstate page and assets. Your job is to apply this document to that file in safe, ordered steps.

**The goal in one sentence:** a stable 72 Hz Quest 3S game with three rooms (Studio office, Snowy Mountain Rally, Interstate), an in-game computer whose Game Editor app turns on all editing tools, and a hosted Claude that can make safe live changes and help debug.

**How to work:**

1. Inspect before changing. List the files and check each claim in this document against the real file. This document comes from a static code review, not a headset test, so report anything that differs.
2. The file is a zip of built, minified output and there is no source project. That is expected. Unzip it into a working folder, never change the original zip, patch the built files carefully, keep every chunk mapping table consistent so the page still loads, and deliver a new zip.
3. Follow the work order below, one phase at a time. After each phase, list the files you changed, how to test them on the headset, and what is still open. Do not start the next phase until the user confirms.
4. Change only what this document asks for. If something is unclear, ask one short question instead of guessing.
5. Obey the immersion rule in section 0 at all times.
6. Stay inside the Quest 3S budget: 72 Hz (13.9 ms per frame), texture memory under 120 MB, no heavy new per-frame work, no WebGPU.
7. You cannot test on a headset. For every change, say "headset check needed" and what to look for.
8. Keep the game loadable at every step. The `?safe=1` start must keep working.
9. Give complete replacement files or exact find-and-replace patches the user can apply. Never give fragments with "..." in them.

**Decisions already made (do not reopen):**

| Topic | Decision |
| --- | --- |
| Rooms kept | Studio office, Snowy Mountain Rally, Interstate |
| Rooms removed | Highway, Shooting Range, Home AR scan. Delete all of their code, files and door entries and leave no stubs or patches behind |
| Editor | The Game Editor app is the single editor. Code workbench merges into it. Opening it turns Editor mode on, closing it turns it off |
| Wrist tablet and helpers | Allowed, but only in Editor mode, each with an open/close tab so nothing blocks the view |
| Dollhouse view, floating cables | Removed from the plan |
| Ask Claude | Kept, through a small hosted backend that holds the API key |
| Desk pistol | Keep it. Do not remove the desk pistol (the service\_pistol model) |
| WebGPU | Not now |

**Work order (phases):**

1. Cleanup: remove Highway, Range and Home, update the Door app, add the saved-door fallback, confirm zero 404s.
2. Safety: script sandbox in a Web Worker with a time limit, `?safe=1`, auto-disable a script that failed last time, merge Code workbench into Game Editor.
3. Interstate: open as its own page from the door, Back link, local three.js and fonts, Performance preset by default.
4. Performance: texture sizes, prop limit guard, sleep when idle, Profiler as the gauge.
5. UI Settings page, Editor mode, Console and Status bar, then the rest of section 6 in its sub-phases A to D.
6. Command registry and command runner (section 7a).
7. Prop library and physics presets (section 8 and Appendix B).
8. Inspector (section 9 and the full option table in Appendix C).
9. Hosted backend, Claude hookup and debug helper (sections 7a and 7b).

**Words used in this document:**

| Word | Meaning |
| --- | --- |
| Editor mode | All editing tools are visible. On only while the Game Editor app is open |
| Command registry | The file `commands.json`, the single source of truth for every command |
| Command runner | The code that checks a command against the registry, runs it, and records one Undo step |
| Play / Stop | Snapshot the room, run scripts, then restore the room on Stop |
| Safe start | Opening the page with `?safe=1`: skips saved scripts and forces the Minimal UI preset |
| Wrist tablet | A small panel on the off-hand wrist, Editor mode only |

## 0. Design rule: immersion first (new)

The player should always feel they are sitting in an office or driving on a road. Everything an engine needs lives **on the office computer monitor** or on a wrist tablet, and only while Editor mode is on. Nothing floats over the view otherwise.

**Editor mode (new):** the wrist tablet, Inspector, gizmos, grids, outlines, Console and every other editing helper appear only while the Game Editor app is open on the in-game desktop computer. Closing the app, or pressing Stop, turns Editor mode off and every helper disappears, so the office, Rally and Interstate look untouched. Each visible helper has an open/close tab on its edge: tap it to fold the panel down to a small tab, tap again to open. Tab states are remembered, and the wrist tablet starts folded so nothing blocks the view.

- **Removed from the plan:** dollhouse / miniature scale view and floating cables (tactile event splines). Panels that stay open and hover in the room are not allowed; editing helpers that appear in Editor mode are, each with a fold-away tab.
- **Editor visuals are edit-only:** 3D gizmo handles, grid, collider outlines, names and selection outlines show only while editing and are hidden automatically in Play mode, in Rally and in Interstate.
- **Rally and Interstate stay clean:** no editor UI or debug overlays by default. Only the car's own dash and gauges. Editor tools never appear here.
- **Props match the room:** office props in the office, road props in the driving rooms. Neon, glow and effects are off by default and never appear unless you add them.
- **Comfort tools keep the realism:** Undo, Console and Inspector are monitor apps and can also open on the wrist tablet. Hover highlights are subtle and can be turned off.

## 1. Rooms

| Room | Decision | Needed change |
| --- | --- | --- |
| Studio office | KEEP | Remove weapon props tied to the range. Keep the desk pistol |
| Snowy Mountain Rally | KEEP | Headset test: exit and re-enter 3 times for leaks |
| Interstate | FIX | Open as its own page, add Back link, bundle three.js and fonts locally |
| Highway | REMOVE | Delete chunk and traffic models |
| Shooting Range | REMOVE | Delete chunk, AWM and Glock models, gun sounds, scope second pass |
| Home (AR room scan) | REMOVE | Delete the AR scan, its door entry and its loader |

## 2. Critical standalone blockers (fix first)

1. **Script sandbox and recovery.** Scripts run on the render thread, so a `while(true)` freezes the frame and drops VR. Run user code in a Web Worker with a time limit, add a `?safe=1` start, and auto-disable a script that failed last time.
2. **Interstate in VR.** It loads in an iframe and VR is only granted to a top-level page. The door should navigate the whole page, Interstate gets a Back to studio link, three.js and fonts are bundled locally, and the Performance preset is the default. Expect to press Enter VR again after each hop.
3. **Highway, Range and Home removal.** Delete the files below, then cut every entry point. The zip is built output only, so the clean way is to remove them in the original project and rebuild.
4. **Performance and memory enforcement.** Hard target of 72 Hz (13.9 ms). Texture memory is about 260 MB uncompressed and should be under 120 MB. Add a prop limit guard, sleep when idle, shared parts, and a per-frame script time budget.
5. **Duplicate editors and AI.** Merge Code workbench and Game Editor into one app, named Game Editor, which also switches Editor mode on. Keep Ask Claude as the one assistant entry, served by a small hosted backend that holds the API key so it never ships in the page. Until that backend is live, hide the button instead of showing Unavailable.

### Removal list

| Delete | Size |
| --- | --- |
| assets/highway chunk | 60 KB |
| assets/range chunk and rangeOrigin | 18 KB |
| models/traffic | 3.00 MB |
| models/g17 (Glock) | 6.26 MB |
| models/awp (AWM) | 5.47 MB |
| sfx (7 gun sounds) | 462 KB |
| **Total** | **about 15.3 MB of the 52.4 MB zip** |

**Entry points to cut:** door list, preview paintings and open branches in `addons/rally.js`; highway map loader, range controller, weapon table, gun sound loader, the Shooting range row and the Home AR scan loader in `assets/index-*.js`. Keep the chunk mapping table consistent. Add a fallback so a saved door value of Range, Highway or Home becomes the locked door. Verify with the console open: zero 404s and the door still opens Rally and Interstate.

## 3. The computer: apps

| App | Action |
| --- | --- |
| Door | Show only Rally and Interstate; reset invalid saved choice |
| Code | Merge into the Game Editor app (one editor); keep the Game Editor's Run-in-room |
| Game Editor | Keep as the single editor app; opening it turns Editor mode on, closing it turns it off |
| Assistant / Ask Claude | Keep Ask Claude as the single assistant, via the hosted backend |
| Video | Headset check: file picker in an immersive session; fallback URL box |
| Assets, Logic, Studio, Profiler | Keep; remove the Shooting range row from Studio |
| Notes, Calculator, Sketch, System | Click-through test with controller and hand pointer |

## 4. Quest 3S performance budget

- Sky to 2048x1024, concrete to 1024, oak to 2048x512. Move to KTX2 later.
- Keep baked lighting. Keep shadow updates off while idle.
- Foveation 0.5 in studio; raise to 0.75 if frame time passes 12.5 ms. Interstate uses its Performance preset.
- Cap script time per frame and kill any onFrame over budget.
- Do not switch to WebGPU on Quest 3S for now.

## 5. Roadmap status

| Feature | Status | Note |
| --- | --- | --- |
| Gesture puppeteering, recorded playback | MISSING / LATER | Hand tracking is input only today |
| Semantic physics materials | PARTIAL | Add convex colliders on import |
| Collision audio, spatial 3D audio | MISSING / LATER | Only Interstate has audio |
| Asset drag and drop | PARTIAL | Headset check: import a .glb |
| Code sandbox | MISSING | Fix first |
| Multi-user, cloud sync | MISSING / LATER | Start with export and import file |
| Wrist tablet | **APPROVED / LATER** | Editor mode only, folded by default; carries Inspector, Console, Commands, Status bar |
| Dollhouse scale | **REMOVED** | Conflicts with immersion rule |
| Tactile event splines | **REMOVED** | Logic wires stay on the monitor only |
| High-res monitor display | PARTIAL | Test text legibility in headset |
| Visual node scripting (Logic) | PRESENT | Headset check |
| Transform gizmos | PARTIAL | Verify; edit-only visibility |
| Door and level dashboard | UPDATE | Two rooms |
| Seamless transitions | PARTIAL | Fade then build; fine for two rooms |
| One-click physics presets | MISSING | New, low risk |
| Mouse, controller, hand switching | PRESENT | Headset check mid-session |
| One-click publishing | PARTIAL | Already a static site |

## 6. Comfort layer (monitor or wrist tablet, each with an on/off switch)

Undo/redo · Play/Stop with room snapshot · Console · Inspector · Outliner tools · Snap settings · Command palette · Saved window layout · UI scale · Pointer feedback · Autosave and export · Status bar.

**Switch rules:** one UI Settings page in the System app; instant, no reload; remembered between sessions; presets Minimal, Comfort, Full plus Reset; `?safe=1` forces Minimal; features work independently.

**Build order:** A) UI Settings, Console, Status bar. B) Undo and Play/Stop (needs the sandbox). C) Inspector, Outliner, Snapping, Saved layout. D) Command palette, UI scale, Pointer feedback, Autosave.

**Wrist tablet and UI helpers (approved):** the wrist tablet is a small panel on your off-hand wrist, available only in Editor mode, opened by a wrist glance or a button, closed with one gesture, and folded by default. It carries Inspector, Console, Commands, Status bar, door picker and pause. Other helpers follow the same rules: appear only in Editor mode, have an open/close tab, cost nothing while closed, and are gone in Play, Rally and Interstate. Each has its own switch in UI Settings (wrist tablet default ON, built in Phase D). Other approved helpers: pointer laser with hover tooltips, recenter button, quick undo button.

## 7. Command list (offline, no AI)

Fixed, safe actions that work by typing or voice, with plain-language replies and Undo. Groups: Spawn and delete · Move, rotate, scale · Shape · Look and material · Physics · Presets · Lights · Rooms and travel · Scene and project · View and reading · Help.

Examples: `add a crate`, `spawn 12 crates in a pyramid`, `put the lamp on the desk`, `make this metal`, `bounce 0.8`, `preset heavy metal`, `lights off`, `go to rally`, `back to studio`, `undo`, `play`.

**Changes in v2:** the `show grid / names / colliders` commands are edit-only and auto-hide in Play and in the driving rooms. The `look at` and `teleport to` commands use a quick fade, not a camera fly-through. The full list is in Appendix A.

## 7a. Command registry and Claude hookup

One file, `commands.json`, in the computer's Files section is the single source of truth for every command. Claude only ever uses commands found in it, so it cannot invent one.

**Each registry entry holds:**

| Field | What it is |
| --- | --- |
| Name and group | For example `color`, in Look and material |
| Phrases | The words a person can say or type |
| Blanks | Object, number or color, each with a type and allowed range |
| Example and reply | The tappable example and the plain-language reply |
| Cost tag | Low, Med or High, same as the Inspector |
| Editor-only flag | Whether it works outside Editor mode |

**Four things read the registry:** the Commands app list, the command runner that checks and runs every command, the Console help, and the backend that hands the commands to Claude as tools. Add a command once and all four know it.

**Hookup steps:**

1. Build the registry from the command list in section 7.
2. Build the command runner: it checks a command, runs it, records one Undo step and returns the reply. It works offline with no AI.
3. Host the small backend from section 2, item 5: it holds the API key, checks an access code, limits requests per device, and loads the registry version that matches the game.
4. In Editor mode, send the player's text, a short scene summary (room, selected object, object names and positions, prop count) and the registry version.
5. Claude answers with tool calls only, taken from the registry.
6. The game checks each call (known command, values in range, object exists, prop limit) and runs it through the same command runner.
7. The player gets a plain reply such as "Lamp is now red. Undo?".

**Keeping the game from freezing:**

- The request runs in the background while the room keeps rendering. A small "thinking" tab shows in the editor panel, with a Cancel button.
- A time limit on every request (about 15 seconds). A failure shows a friendly message and the game is unaffected.
- A cap on commands per reply (about 20), applied in small batches under a per-frame time budget, so changes appear live without a hitch.
- A snapshot before each Claude reply, and the whole reply is one Undo step.
- No raw code from Claude by default. Scripts go only through the Code sandbox worker, with its time limit and a Play snapshot.
- Works only while the Game Editor app is open (Editor mode).

**Build order:** registry and command runner with Phase B and C. Claude hookup after the script sandbox and the hosted backend are working.

## 7b. Claude in the editor: full help mode and debug helper

The user wants to ask the hosted Claude for nearly anything they could ask in the Claude app, from inside the Game Editor, without ever freezing the game. A wait of 10 seconds up to 1 minute is fine, as long as the game keeps running and the wait is visible.

**Two lanes:**

| Lane | Used for | How it behaves |
| --- | --- | --- |
| Quick | Anything a registry command can do ("make the lamp red") | Validated, runs at once, one Undo step |
| Job | Bigger requests ("build a set of road props", "fix the slowdown") | A tab shows "working, ready in about 10 seconds to 1 minute" with Cancel. Claude returns a plan first. The user approves, then the changes apply in small batches as one Undo step |

**Chat panel:** a chat panel inside the Game Editor answers general questions, planning and explanations. The backend can switch on Claude API tools such as web search or code execution; check Anthropic's current documentation before building, because the available tools change. The Claude app's own memory, artifacts, connectors and voice mode do not carry over. Rebuild only what the user asks for, for example a notes file as memory.

**Debug helper:** with each request the game can attach the last lines of the Console, the Profiler readings (frame time, memory, prop count) and the scene summary.

| Claude can | Claude cannot |
| --- | --- |
| Explain a script error and propose a fix, which runs only in the sandbox worker after a Play snapshot | Feel or see the Quest: comfort, text legibility and real frame drops stay with the user |
| Read the Profiler and cut cost through commands (shadows off on small props, lower detail, remove extra spawned props) | Change the built game files from inside the game. Those changes happen outside, when the user uploads the file in chat or Claude Code |
| Spot scene problems (props inside walls, missing physics, objects falling through the floor) and fix them with commands | Find a bug that shows nothing in the Console, Profiler or scene summary, unless the user describes it |
| Check that a door points at a room that exists |  |

**Safety and cost:** the backend checks an access code, limits requests per device and caps reply length. Every Claude change is one Undo step after a snapshot. Claude never runs raw code outside the sandbox worker.

**Build order:** Phase 9 in the work order, after the registry, runner and script sandbox work.

## 7c. Hosting plan and voice commands

**Where each piece lives (all on the user's own accounts):**

| Piece | Where | Why |
| --- | --- | --- |
| The game | Cloudflare Pages (static site) | WebXR needs HTTPS. Deploy by uploading the unzipped, patched folder |
| Claude backend | One Cloudflare Worker in the same account | Holds the secrets, starts fast, supports rate limits |
| AI model | Claude Opus through the Anthropic API, using the user's own API key | The user chose Opus. Look up the current Opus model name in Anthropic's documentation |
| Speech to text (voice fallback) | A Cloudflare Workers AI speech model, called by the same Worker | Keeps voice working even if the headset browser has no speech recognition. Check current availability |

**Backend rules (the Worker must do all of these):**

1. Keep the Anthropic API key and the access code as Worker secrets. Never put either in a game file.
2. Reject any request without the correct access code.
3. Allow requests only from the game's own web address.
4. Rate-limit per device and overall, cap the request size, cap the reply length, and time out after about 60 seconds.
5. Send the registry as Claude's tools, plus the scene summary, with every request. Use prompt caching for the registry to cut cost if the API supports it; check the documentation.
6. Return errors as short plain messages. Do not store prompts.
7. The user sets a monthly spend limit in the Anthropic account so a leaked access code cannot run up a bill.

**Setup steps (Opus writes the Worker file and a short README with the exact clicks):**

1. The user creates a Cloudflare account and an Anthropic API key.
2. Deploy the patched game to Cloudflare Pages.
3. Create the Worker, add the two secrets (API key and access code).
4. Point the game's Ask Claude setting at the Worker's address.
5. Test one registry command from the Game Editor, then one job-lane request.
6. Set the spend limit and test on the headset.

**Voice commands (must work):** the user requires this, so build three routes and use the first one that works on the headset:

1. **Browser speech recognition** (the Web Speech API) if the Quest browser offers it while in an immersive session.
2. **The Quest keyboard's microphone key** typing into the command box. This needs no code beyond a clear text field.
3. **Push-to-talk recording** sent to the Worker for speech to text, which returns the text.

Rules for all routes:

- Push-to-talk only. The game never listens all the time.
- Show the heard text before running it. If the match is unsure, ask "Did you mean ...?" with the closest registry commands.
- Heard text goes through the same registry matching as typed text.
- Ask for microphone permission once, and keep a typing fallback always.
- This is the biggest unknown. Test every route inside and outside an immersive session on the headset, and report which ones work.

## 8. Prop library

Props are generated from simple shapes, so there is almost no download cost.

- **Office:** chair, table, shelf, crate, barrel, bin, box stack, cushion, books.
- **Driving:** cone, barrier, tire stack, hay bale, sign, flag, ramp.
- **Basic and building shapes:** box, sphere, cylinder, wall, platform, pillar, beam, stairs, arch.
- **Interactive:** button, switch, lever, pressure plate, trigger zone, spawner.
- **Physics toys:** domino, bowling pin, balloon, trampoline pad, seesaw, pendulum.
- **Lights:** lamp, spotlight, lantern. Neon strip is optional.
- **Effects:** smoke, sparks, dust. Off by default.

**Physics presets:** Heavy Metal, Bouncy Rubber, Zero-G, Static Lock, Ice, Wood, Stone, Foam, Glass, Balloon (starting values from v1, to be tuned in headset).

**Lag guards:** warning at 80 physics props, soft stop at 100 (switchable); sleep when idle; shared shapes and materials; spawned props removed when you leave their room; effects off and shadows off on spawned lights.

## 9. Object options (Inspector)

Groups A to N: Transform · Shape and mesh · Material · Textures · Physics · Interaction · Events and logic · Animation · Lights · Rendering · Audio (later) · Identity · Scene and world · Editor tools.

- Each option carries a Quest cost tag: Low, Med (amber), High (red, asks once, off by default).
- Simple mode shows the 10 most-used options; Advanced shows all. Sections collapse, with Reset, Copy and Paste. Inspector search and one-line tooltips included.
- Build the Inspector shell and groups A, C, D, E first.
- Scene settings that would change the look (bloom, ambient occlusion, motion blur, depth of field) stay off by default and are never part of a preset.

## 10. Headset acceptance checklist

- Studio loads on Quest 3S with Profiler at 72 Hz and no console errors.
- Every dock app works with controller and with hand tracking.
- Door lists only kept rooms; Rally round-trip 3 times with memory returning to baseline.
- Interstate: page navigates, Drive in VR starts, Back to studio returns, no flat-screen message.
- Deliberate infinite loop script is stopped and the headset stays alive.
- Broken saved script: studio still loads in safe mode.
- No 404s for highway, range, traffic, g17, awp or sfx.
- UI Settings: every switch toggles instantly, frame time does not rise, setting survives reload.
- Minimal preset and `?safe=1` leave a usable computer with Console only.
- Commands: five from every group, each with a plain reply and working Undo.
- Inspector: one option per group A to N works, Reset and Undo work.
- Props: spawn one of each group, test every preset, spawn 100 and hold 72 Hz, confirm they vanish on room exit.
- **Immersion check (new):** in Play, Rally and Interstate, no gizmos, grids or outlines float in view, and no editor tool appears unless the Game Editor app is open, and every panel folds and closes cleanly.
- **Editor mode check (new):** open the Game Editor app and the wrist tablet and tools become available; close it and every one vanishes. Fold and unfold each panel with its tab, confirm the state is remembered, and confirm no panel blocks the road or the desk view.
- **Voice check (new):** say five commands from different groups by voice. Each shows the heard text, runs through the registry, and can be undone. Test the browser route, the keyboard microphone route and the push-to-talk route, in and out of an immersive session.

## 11. Open items

- Create the Cloudflare account, the Anthropic API key and its spend limit (section 7c).
- Verify on headset: video file picker, monitor text legibility, hand/controller switching mid-session.

## Appendix A. Command list (build the registry from this)

Words in \[brackets\] are blanks: an object name, a number or a color. "this" or "it" means the aimed-at or selected object. Every command gives a plain-language reply and can be undone. Unknown words show the closest matches instead of an error, and a vague command asks one short question.

**Spawn and delete**

- `add [prop]`: create a prop in front of you
- `spawn [N] [prop]`: create several
- `spawn at my hand`: create it in your hand, ready to throw
- `spawn [N] [prop] in a [row/grid/circle/stack/pyramid]`: arrange the copies
- `duplicate [it]`: copy with physics settings
- `clone [it] [N] times`: N copies in a line
- `replace [it] with [prop]`: swap, keeping position and size
- `delete [it]` and `delete all [prop]`
- `clear spawned`: remove everything you added, keep the room
- `random props [N]`: a mix of props for testing

**Move, rotate, scale**

- `move [it] [up/down/left/right/forward/back] [N]`
- `put [it] on [object]` and `put [it] on the floor`
- `center [it]`
- `rotate [it] [N]` (degrees) and `face [object]`
- `flip` and `stand upright`
- `scale [it] [N]x`, `make [it] wider/taller/longer`, `bigger`, `smaller`, `reset size`
- `snap to grid` and `line up with [object]`

**Shape**

- `make [it] a [box/sphere/cylinder/cone/capsule/ramp/wedge]`
- `round the corners`, `hollow it`, `thickness [N]`, `taper [N]`
- `detail low/medium/high` (low is cheaper)

**Look and material**

- `color [it] [color]` and `paint the [wall/floor/ceiling] [color]`
- `make [it] [metal/wood/stone/glass/rubber/plastic/ice/neon]`
- `shiny` and `matte`
- `transparent [N]%`
- `glow [it]` and `outline [it]`
- `hide [it]`, `show [it]`, `reset look`

**Physics**

- `gravity off/on [it]` and `gravity off/on everything`
- `make [it] static/dynamic/moving`
- `mass [N]` or `light/medium/heavy`
- `bounce [0 to 1]`, `friction [0 to 1]` or `slippery/sticky`, `drag [N]`, `spin [N]`
- `throw [it]`, `freeze [it]`, `unfreeze [it]`, `freeze everything`
- `lock [x/y/z axis]`
- `make [it] a trigger` (no collision, fires an event)
- `make [it] breakable [N]`
- `ignore collisions with [it]`
- `grabbable on/off`

**Presets** (one word sets several traits, values in Appendix B)

- `preset heavy metal/bouncy rubber/zero-g/static lock/ice/wood/stone/foam/glass/balloon`

**Lights**

- `lights on/off`, `dim lights`, `brighter`, `warmer`, `cooler`
- `night mode` and `day mode`
- `add lamp/spotlight/neon strip`, `light color [color]`, `flicker [it]`
- `shadows on/off` (off saves frame time)

**Rooms and travel** (rooms are Rally and Interstate only)

- `go to rally/interstate` and `back to studio`
- `open the door`, `close the door`, `lock the door`, `set the door to [room]`
- `teleport to [object]` (quick fade, no fly-through) and `recenter`

**Scene and project**

- `undo`, `redo`, `snapshot`
- `save [name]`, `load [name]`, `export`, `import`
- `play`, `pause`, `stop` (stop restores the room)
- `select [name]`, `select all [prop]`, `deselect`, `group`, `ungroup`, `rename [it] to [name]`
- `find [name]`, `lock [it]`, `unlock [it]`, `hide all`, `show all`
- `reset room` (asks first)

**View and reading** (grid, names and colliders are Editor mode only)

- `show grid`, `show names`, `show colliders`, `show frame time`
- `text bigger`, `text smaller`, `high contrast on/off`
- `look at [it]`

**Help**

- `list commands`, `commands for [category]`, `what can I say`, `favorite [command]`, `recent`

## Appendix B. Physics presets (starting values, to be tuned on the headset)

Mass is relative to a medium prop. Gravity 1.0 is normal.

| Preset | Mass | Friction | Bounce | Gravity | Notes |
| --- | --- | --- | --- | --- | --- |
| Heavy Metal | x5 | 0.6 | 0.05 | 1.0 | Hard to push, dull thud |
| Bouncy Rubber | x0.5 | 0.9 | 0.85 | 1.0 | Springs back |
| Zero-G | x1 | 0.2 | 0.4 | 0 | Floats, drifts slowly |
| Static Lock | none | 0.6 | 0 | none | Fixed in place, still blocks things |
| Ice | x1 | 0.02 | 0.1 | 1.0 | Very slippery |
| Wood | x1 | 0.5 | 0.2 | 1.0 | General purpose default |
| Stone | x4 | 0.7 | 0.05 | 1.0 | Heavy and grippy |
| Foam | x0.2 | 0.8 | 0.3 | 1.0 | Light and soft |
| Glass | x1 | 0.3 | 0.1 | 1.0 | Breakable at medium impact |
| Balloon | x0.05 | 0.4 | 0.6 | -0.1 | Drifts upward slowly |

## Appendix C. Full Inspector options (groups A to N)

This is the complete option set for the Inspector (the panel for the selected object), the material and texture editor, scene settings and editor tools. It lives in Editor mode only. The last column is the Quest cost of turning an option on: Low is safe, Med needs watching, High is off by default and used on a few objects only, LATER needs an engine feature the game does not have yet. Today the game has a Studio app with selection and a layer list, a Logic app, an Assets app and a Profiler. A per-object Inspector, a material and texture editor, 3D handles and an audio engine were not found, so most of this is new work. Build the Inspector shell and groups A, C, D, E first.

**A. Transform**

| Option | Choices | Cost |
| --- | --- | --- |
| Position X/Y/Z | Type, drag, or use 3D handles; copy and paste values | Low |
| Rotation X/Y/Z | Degrees; quick buttons 45, 90, 180; reset | Low |
| Scale X/Y/Z | Lock-ratio toggle; reset | Low |
| Pivot | Center, bottom, top, or custom point | Low |
| Space | Local or world axes | Low |
| Snap | Grid step, angle step, scale step; hold to override | Low |
| Parent | Attach to another object; detach | Low |
| Align and distribute | Align to another object, spread evenly, center on floor | Low |
| Mirror and array | Mirror on an axis; line, grid or circle of copies | Low (Med above 50 copies) |

**B. Shape and mesh**

| Option | Choices | Cost |
| --- | --- | --- |
| Base shape | Box, sphere, cylinder, cone, capsule, ramp, wedge, ring, plane, imported model | Low |
| Shape settings | Width, height, depth, radius, segments, taper, bevel, hollow, thickness | Low |
| Detail level | Low, medium, high for curved shapes | Low to Med |
| Normals | Smooth or flat shading; flip faces | Low |
| UV mapping | Tile and offset follow object size; rotate; flip | Low |
| Imported model info | Triangle count, material count, texture memory, heavy-model warnings | Info only |

**C. Material**

| Option | Choices | Cost |
| --- | --- | --- |
| Material preset | Metal, wood, stone, plastic, rubber, glass, ice, fabric, concrete, plaster, neon, paint; then tweak | Low |
| Base color | Color picker, hex field, recent colors, eyedropper | Low |
| Metalness | 0 to 1 slider | Low |
| Roughness | 0 (mirror) to 1 (matte) slider | Low |
| Opacity and mode | Opaque, blended (see-through), cut-out (leaves, fences) with cut-off value | Low (blended Med) |
| Emissive (glow) | Color, strength, optional glow texture | Low |
| Double-sided | Draw both faces of thin shapes | Low |
| Wireframe and flat look | Debug looks | Low |
| Environment reflection | Strength of sky reflection | Low |
| Clear coat | Glossy top layer for car paint | Med |
| Glass and transmission | Refraction, thickness, tint; cheap see-through glass is the default | High |
| Fresnel rim and outline | Edge highlight; selection outline | Low |
| Vertex colors | Paint colors per corner | Low |

**D. Textures**

| Option | Choices | Cost |
| --- | --- | --- |
| Color map | Image on the surface from the texture library or an import | Low |
| Normal map | Fake bumps; strength slider | Low to Med |
| Roughness and metal map | Per-pixel shine; the game already uses a packed occlusion-roughness-metal image | Low |
| Ambient occlusion map | Baked contact shadows; strength slider | Low |
| Emissive map | Glow pattern | Low |
| Opacity map | Cut-out or see-through pattern | Low |
| Tiling, offset, rotation | Repeat, slide, turn; per slot | Low |
| Wrap mode | Repeat, mirror, or clamp at edges | Low |
| Filtering and sharpness | Smooth or crisp; anisotropy for floors seen at a slant | Low |
| Color space | Color image or data image; prevents washed-out looks | Low |
| Flip and invert | Flip vertically; invert normal green channel | Low |
| Texture size cap | Max pixels per image: 512, 1024, 2048. Spawned props default 1024, large surfaces 2048 | Controls memory |
| Texture library | Thumbnails of the game's concrete, oak, plaster, fabric, grit and mesh sets plus imports; search and favorites | Low |
| Import image | png, jpg or webp from the device; auto-shrinks to the size cap | Low |
| Generated patterns | Checker, stripes, grid, dots, noise, gradient; no image file needed | Very low |
| Texture memory badge | MB used by this object | Info only |

**E. Physics**

| Option | Choices | Cost |
| --- | --- | --- |
| Body type | Static, Dynamic, Moving platform (kinematic), Trigger | Low |
| Collider shape | Auto, box, sphere, capsule, cylinder, convex hull; size and offset editable; show colliders toggle | Low (convex Med) |
| Mass or density | Light, medium, heavy, custom kg; center of mass offset | Low |
| Friction | 0 to 1, plus slippery or sticky quick choices | Low |
| Bounce | 0 to 1; how bounce combines (average, min, max) | Low |
| Gravity scale | -1 to 2; zero floats, negative rises | Low |
| Drag and spin damping | Slows movement and spinning | Low |
| Start velocity and spin | Launch settings for when Play starts | Low |
| Lock axes | Stop movement or rotation on X, Y or Z | Low |
| Fast-object mode | Stops fast things passing through thin walls | Med |
| Sleep when idle | Rests when still; default on | Saves cost |
| Collision layers | Everything, player only, props only, nothing | Low |
| Trigger zone | No collision; fires events on enter and exit | Low |
| One-way platform | Pass through from below, stand on from above | Low |
| Break strength | Shatter above an impact strength, with a piece-count limit | High (limit pieces) |
| Joints | Hinge, slider, spring, ball, fixed; motor speed and limits | Med |
| Constant force and wind | Pushes objects in a direction; fans and updrafts | Low |
| Surface speed | Conveyor belt behavior | Low |
| Physics preset | The ten presets in Appendix B | Low |

**F. Interaction**

| Option | Choices | Cost |
| --- | --- | --- |
| Grabbable and throwable | Switches; hold style: snap to hand, keep offset, two-handed | Low |
| Distance grab | Pull from a distance with the pointer | Low |
| Snap points | Where objects click together or onto a surface | Low |
| Hover highlight | Glow or outline when pointed at; subtle and can be turned off | Low |
| Haptics | Buzz strength when touched or grabbed | Low |
| Use action | What E or the trigger does: toggle, push, open, custom event | Low |
| Pointer cursor text | Short label when aimed at, such as Open or Pick up | Low |

**G. Events and logic**

| Option | Choices | Cost |
| --- | --- | --- |
| Triggers (when) | Touched, entered, exited, used, grabbed, dropped, broken, timer, switch changed | Low |
| Actions (then) | Move, rotate, scale, color, show/hide, toggle light, spawn, delete, open door, go to room, set variable, play animation | Low |
| Link to Logic graph | Opens this object's connections as nodes in the Logic app | Low |
| Variables | Per-object numbers, true/false, text; visible and editable | Low |
| Attach script | Run a Game Editor script on this object, with the sandbox time limit | Med |

**H. Animation (no keyframes needed)**

| Option | Choices | Cost |
| --- | --- | --- |
| Move along a path | Pick points, set speed, loop or ping-pong | Low |
| Spin, bob, pulse | Constant rotate, float up and down, scale in and out | Low |
| Open and close | Doors, lids, drawers: angle or slide distance | Low |
| Easing | Linear, ease in, ease out, smooth, bounce | Low |
| Start rule | On play, on trigger, always, manual | Low |
| Record by hand | Grab and act it out; the engine records a reusable move | LATER |

**I. Lights (when the object is a light)**

| Option | Choices | Cost |
| --- | --- | --- |
| Type | Point, spot, directional (sun), area strip | Low (spot Med) |
| Color, intensity, range | Color picker, brightness, reach | Low |
| Cone angle and softness | For spotlights | Low |
| Shadows | Off, low, medium quality; default off for spawned lights | High |
| Flicker and pulse | Gentle variation | Low |
| Static or dynamic | Static is baked and cheaper; dynamic can move | Saves cost |

**J. Rendering and visibility**

| Option | Choices | Cost |
| --- | --- | --- |
| Visible | Show or hide without deleting | Low |
| Cast and receive shadows | Per-object switches; off for small props to save cost | Med |
| Draw distance | Hide when farther than a set distance | Saves cost |
| Render order and layer | Draw this over that; layers for hiding groups | Low |
| Fog and tone mapping | Whether this object is affected by fog | Low |
| Outline | Colored edge for selection or highlight; Editor mode only | Low |

**K. Audio (the game has no audio engine today)**

| Option | Choices | Cost |
| --- | --- | --- |
| Sound on hit | Click, thud, glass, metal, chosen by material and speed | LATER |
| Looping sound | Hum, fan, engine, with volume and range | LATER |
| 3D positional | Gets quieter with distance and direction | LATER |
| Volume and mute | Per object and master | LATER |

**L. Identity and organization**

| Option | Choices | Cost |
| --- | --- | --- |
| Name, tags, notes | Searchable; notes appear in the tooltip | Info only |
| Group and layer | Select or hide a whole set | Low |
| Lock | Prevents accidental moves | Low |
| Prefab | Save this object with all its settings as a reusable prop; update or revert instances | Low |
| Copy and paste | Whole object, or one section (Material, Physics) onto others | Low |
| Favorite | Pins it to the quick palette | Low |

**M. Scene and world settings**

| Option | Choices | Cost |
| --- | --- | --- |
| Sky and environment | Pick a sky image, rotate it, set brightness; lower sky resolution on Quest | Med |
| Sun | Direction, color, strength, shadows on or off | Med to High (shadows) |
| Ambient light | Base brightness and color | Low |
| Fog | Off, linear, or dense; color and distance | Low |
| Exposure and tone mapping | Brightness curve choice | Low |
| Effects | Bloom, ambient occlusion, motion blur, depth of field; off by default on Quest | High |
| Gravity and time scale | World gravity, slow motion, fast forward | Low |
| Physics quality | Steps per second: low, medium, high | Med |
| World limits | Kill plane: objects below it are removed or reset | Low |
| Units and grid | Meters, grid size, show grid | Low |
| Quality tier | Quest standard, Quest high, Desktop; sets resolution scale, shadows, foveation | Controls cost |

**N. Editor tools**

| Option | Choices | Cost |
| --- | --- | --- |
| Selection | Point, multi-select, box select, select by name, tag or color | Low |
| 3D handles (gizmos) | Move, rotate, scale handles on the selected object | Low |
| Hierarchy panel | Tree of everything with drag to re-parent, eye and lock icons, search | Low |
| History panel | List of past actions to jump back to | Low |
| Asset browser | Thumbnails, tags, favorites, search for models, textures, sounds | Low |
| Import | glb and gltf models, png/jpg/webp images, wav/mp3/ogg sounds (sounds LATER) | Low |
| Measure tool | Distance between two points | Low |
| Camera bookmarks | Save and jump to viewpoints | Low |
| Performance badges | Per object: triangles, draw cost, texture MB, warning color when heavy | Info only |
| Validation | Warns about missing textures, huge images, too many bodies | Info only |
| Input mapping | See and change controller, hand and keyboard shortcuts | Low |

**How the Inspector stays easy to read**

- Simple and Advanced modes. Simple shows only the 10 most-used options (color, material, size, mass, bounce, friction, gravity, grabbable, visible, name).
- Collapsible sections A to N, with the open or closed state remembered, and Reset, Copy and Paste on each.
- Search box: type "bounce" and only that option shows, wherever it lives.
- A small sphere or box preview at the top of the Material section updates live.
- Cost colors: Low is plain, Med is amber, High is red with a short warning and asks once before turning on.
- A one-line tooltip on every option, with tappable example chips where they help.
- Big touch targets sized for a controller pointer and tracked hands, not only a mouse.
- Switches in UI Settings: Inspector mode (Simple or Advanced, default Simple), Advanced physics options, Material preview, Performance badges, Validation warnings, Scene settings panel. Each one is instant, remembered, costs nothing when off, and is forced to Minimal by safe start.
