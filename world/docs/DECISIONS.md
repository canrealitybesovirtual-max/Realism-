# Decisions log (master prompt v6: anything not marked OPEN is decided here)

## Setup
- Lives in `world/` beside the other games; touches none of their files. Opens at `world/index.html`.
- No build step: plain ES modules in `world/src`, three.js r170 and Rapier compat 0.14 copied into `world/vendor` (the spec's Vite / npm tool chain and the USB headset bridge do not fit this repo's static hosting; revisit when the world generator needs bundling or workers).
- Units metres; x east, y up, z south.

## Apartment, architecture pass (no furniture)
- Floor one follows the reference plan (111 W 57th St PH76, floor one): great hall 15.8 x 6.7 m along the north glass with two columns at the glass, core band (fire stair, hallway, duplex elevator, curved stair, powder room, view gallery, two private elevators), kitchen 3.4 x 7.6 m with the breakfast room, media room 7 x 3.2 m, terrace 1.7 m deep along the south.
- Floor two (no plan given) is designed from the interior photos: primary bath (north-west, onyx) and primary bedroom (park view), library in the north-east corner (corner glazing), primary closet, second bath (travertine), third bath (grey marble), bedroom two (south-west), bedroom three (south-east) with a walk-in closet, an upper gallery round the stair void, a sitting nook to the south glass.
- Heights: floor-to-floor 4.6 m; floor one ceilings 4.2 m in the great hall (soffit 3.82 at the edges), 3.4 m elsewhere; floor two 3.6 m. Doors 2.74 m (floor one), 2.44 m (floor two), shown open.
- Stair: helical, 26 risers of 177 mm over 330 degrees, walk line radius 1.05 m (going ~0.24 m), white plaster body with a smooth soffit, marble treads, black balusters, oak handrail; outer guard where it flies over the gallery; guard round the void on floor two. Physics walks on a smooth ramp through the tread middles.
- Facades: north and south floor-to-ceiling glass in bronze frames (mullions every ~1.45 m), floor grilles along the glass, curtain pockets in the ceiling; east and west thick walls with full-height slot windows (photos: the tower's piers).
- Materials are generated on canvas at load (smoke oak planks, Versailles parquet, macauba-style stone, onyx, travertine, grey marble, pavers, grille); plaster uses the repo's scanned plaster normal map.
- Outside: generated stand-in city 360 m below (grid of instanced towers, a long park with lakes to the north, rivers east and west), sky dome and its image light, fog. To be replaced by the world generator.
- Light: sun from the south-west with a static shadow map, warm hemisphere fill, sky image light, emissive downlights.
- Walking: Rapier kinematic character controller (capsule 1.72 m), autostep, snap to ground. Computer: mouse look + WASD, Shift runs. Headset: left stick walks, right stick smooth turn (the user's rule: smooth turning everywhere), real walking collided.
