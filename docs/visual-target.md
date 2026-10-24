# Visual target

The direction you chose: a modern, clean room with a polished concrete floor, white walls and crisp lighting.

## Reference photography (described, not bundled)

The sandbox could not download reference photos, so these are the photographic conventions the scene is built to match:

- **Architectural interior photography of minimalist residential studios and home offices.** The look is a polished grey concrete floor, white skim-plastered walls, floor-to-ceiling black aluminium glazing and a single workstation. It is shot at standing eye height with a 24–28 mm lens in morning daylight.
- What these photos consistently show, and what the renderer must therefore reproduce:
  1. A gradient of skylight from the window across the room. Walls near the glass are bright; the far corners are 1–1.5 stops darker.
  2. Soft occlusion in wall/ceiling corners and under furniture, rather than hard black shadows.
  3. One hard-edged sun patch, with crisp mullion shadows, raking across a wall.
  4. The floor reflecting the window as a blurred, slightly glossy reflection that is still recognisable. A sealed polished slab is not a mirror.
  5. Neutral whites: no blue or orange cast on the walls. The exterior is brighter than the interior but not blown out.
  6. Real thicknesses: 200 mm wall reveals at the glazing, 28 mm desk top, thin black frames.

## Room

| Item | Value | Notes |
|---|---|---|
| Plan | 4.4 × 5.0 m | Medium study/studio |
| Ceiling | 2.8 m | Common in newer builds |
| Walls | 200 mm, white emulsion over skim plaster | Albedo ≈ 0.80 |
| Skirting | 15 mm recessed shadow gap | Modern detail instead of a skirting board |
| Floor | Sealed polished concrete, 4 mm saw-cut control joints | Base roughness 0.3, thin clear coat |
| Glazing | West wall, 3.5 × 2.55 m, 2 mullions + transom, 50 mm black powder-coated frame | Frame set in the outer part of the reveal |
| Door | East wall, 900 × 2250 mm flush door, black lever | Satin white |
| Ceiling lights | 4 flush downlights, off | It is daytime |

## Light

- **Time:** early morning, low sun (16° elevation), warm white (≈ 5000 K).
- **Sun direction:** north-west and low. It enters at an oblique angle and lands on the south wall, away from the desk, so there is no glare on the monitor.
- **Sky:** the CC0 Poly Haven *Spruit Sunrise* HDRI (4K, UltraHDR) is the view and the outdoor light. A rectangular area light fills the glazing opening as the interior skylight.
- **Tone mapping:** Khronos PBR Neutral at exposure 1.05. This was picked over AgX and ACES in a side-by-side render because it gives the crisp, neutral whites you asked for.

## Workstation (real dimensions)

| Object | Size | Placement |
|---|---|---|
| Desk | 1600 × 750 × 735 mm, 28 mm oak top, steel sled legs | Back edge 25 mm from the north wall |
| Monitor | 27" 16:9 (597 × 336 mm active), 7 mm bezels | Screen centre 1.05 m from the floor, about 0.7 m from a seated eye, tilted 6° back |
| Keyboard | Tenkeyless, 365 × 141 mm, 5.5° typing angle | 10 cm from the desk edge |
| Mouse | 118 × 64 × 39 mm | On the felt pad, right of the keyboard |
| Chair | Seat 470 mm high, arm pads 685 mm (clear the 707 mm desk underside) | Pulled out and slightly turned, as if just left |
| PC | 210 × 470 × 420 mm | On the floor under the right end of the desk |
| Sideboard | 1600 × 420 × 662 mm | Under the 700 × 1000 mm print on the east wall |

Eye heights: standing 1.62 m, seated 1.18 m.

## Fixed inspection viewpoints

These are defined in `src/views.ts` and rendered by `npm run shots`:

| View | What it shows |
|---|---|
| `door` | Entering the room |
| `seated` | Sitting at the desk |
| `shoulder` | Over the chair |
| `corner` | Whole room |
| `window` | Glazing and sun patch |
| `deskClose` | Peripherals |
| `low` | Floor reflections and contact |
| `credenza` | East wall |
| `cornerZoom` | Seam check |
