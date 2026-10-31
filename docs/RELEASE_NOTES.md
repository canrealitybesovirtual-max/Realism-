# CQC Loop: release notes

A close-quarters shooter for the browser: Meta Quest (WebXR), computer (mouse and keyboard) and phone. Clear a room, move on, and walk back into the safe room to bank your score. Open `cqc/index.html` (or start in the Studio office and take the door to CQC Loop).

## Controls

### Computer
| Action | Key |
| --- | --- |
| Look / move | Click the view, mouse; W A S D, Shift to walk faster |
| Fire / aim down the sights | Left click / hold Space or right mouse |
| Pick up, drop, use | E (or click with the dot on a door, screen or object) |
| Reload / rack, bolt, pump | R / V |
| Chamber check (press check) | Shift+V |
| Fire selector | X |
| Holster pistol / sling rifle | 1 / 2 |
| Weapon light / laser | F / T (hold: infrared) |
| Night vision (once worn) | N |
| Frag / flashbang | Hold 3 / 4, let go to throw |
| Lean / crouch / jump | Z and C / Caps Lock / J |
| Kick / shove | N (Shift+N with night vision on your head) / G |
| Auto-injector / watch menu | I / M |
| Gunsmith vise | B at the bench |
| Exposure / quality / graphics mode | [ ] / Q / B |
| Help panel / profiler | H / O |

### VR (Quest, controllers or hands)
- Left stick moves (click to run), right stick turns; right stick down crouches, up kicks. Or crouch, lean and jump for real.
- Grip grabs. Trigger fires. Pull the slide or charging handle with your other hand to rack; take magazines from your vest and push them into the well.
- Chamber check: pull the slide or bolt back a little and let go: the brass shows in the port and nothing is ejected. B / Y releases a locked-open slide or M4 bolt.
- Let go of a pistol at your hip to holster it, a rifle at your chest to sling it.
- Buttons and screens: press them with a fingertip or thumb tip.
- Grenades: frags on the left of your chest, flashbangs on the right. Pull the ring with your other hand (or A / X), throw; squeeze the trigger first to cook it.
- Night vision: squeeze the grip with an empty hand at your brow to flip it down.
- Comfort (seated / standing, turning, vignette, body position, brightness): the safe room terminal, COMFORT.

## Features
- An endless building streamed room by room (warehouse, storage, records, office, plant room, lockers, stairwells, a long range for the AWM), day or night.
- Squad AI: roles, suppression, flanking, hearing, morale, surrender (keep him covered, then tie his hands).
- Six player guns in the safe room's gun locker: Glock 17, Beretta 92X, M1911, AKM, M4A1-S, AWM. Real handling: chamber, magazines, press checks, slides and bolts that lock open on the last round (pistols, M4A1-S, AWM; the AKM closes), recoil, ballistics with penetration through drywall and doors.
- Gunsmith: buy parts with banked points (optics, suppressors and muzzle chains, lights, lasers, grips, stocks, magazines, rails), fit them at the vise or from the store, see the build turn in the live BUILD view, and paint guns in solid finishes or camos.
- Night vision with infrared lasers and lights; brass collection and selling; grenades with recorded sound, smoke and scorch.
- Detailed sound: recorded gun handling, room acoustics, foley, ambience.
- Also included: the Studio office (`index.html`, a WebXR office with a game editor) and Interstate (`interstate/index.html`, a winter highway driving game).

## Known issues
- Built and tested mostly with automated headless checks; frame rate on Quest 2 and 3 with every effect on has not been fully measured. Lower the graphics mode (B / terminal GRAPHICS) if frames drop.
- Entering VR loads controller models from cdn.jsdelivr.net (needs an internet connection).
- Attachment finishes (FINISH, ATTACHMENTS) cover the housings only: glass, lenses, reticles, rubber, lit parts and bright steel (screws, reflectors) keep their own look.
- A weapon light or laser bought for an M4A1-S without a rail (quad rail or handguard clamp rail) is not fitted by the store; buy a rail first, or clamp it on at the gunsmith vise.
- A man who surrendered and was left in a room that unloads comes back unarmed where he was (his dropped gun goes with the room).
- First-time compile hitches: a new gun finish or a new part can stall a frame the first time it shows.
- The Studio office: `/__studio/session` returns 404 on a static host (expected).

## Credits
- Beretta 92X model: "Beretta 92X - 9mm Pistol" by KaL-ABIZZARE, CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).
- three.js (MIT), Rapier (Apache-2.0), fonts (SIL Open Font License).
- Sound effects from freesound.org (licences being confirmed; CC-BY sounds will be credited here): 841313 takareads, 874593 samrad20, 812821 beyercreative, 90967 department64, 402791, 675008, 677160, 855656 serutonin-deprivd, 142892 ceremonialchapstick, 184438 capslok, 762911 ienba, 369604 evanboyerman, 121765 / 121766 kno-sfx, 486226 ruben_uitenweerde, 174058 pjkasinski3, 395541 alayan, 712564 newlocknew, 528808 garuda1982, 161622 ryanconway, 172334 knova.
- Interstate radio: royalty-free tracks (artists listed in `interstate/radio/radio.json` and the game's Credits page).
