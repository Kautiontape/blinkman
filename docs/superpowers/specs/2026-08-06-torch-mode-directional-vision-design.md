# Torch mode: directional vision cone with wall occlusion

## Problem

Torch mode's vision is a plain 360° circle around Blinkman (`TORCH_R = 46px`, `js/render.js`). Players report running into ghosts with no warning and no time to react, because the circle gives equal, short-range awareness in every direction rather than useful forward visibility.

## Goal

Give players enough forward warning to see a ghost coming and react (reverse course, take a side path) while keeping the mode tense rather than trivializing it. Two changes, both scoped to `style: 'torch'` only — other vision modes (`easy`/`normal`/`hard`/`blink`) are untouched:

1. Union a forward-facing cone onto the existing fixed circle.
2. Block both shapes at maze walls, so vision doesn't "see" around corners.

## Shape & motion

- **Fixed circle**: unchanged. `TORCH_R = 46px` (2.3 tiles), centered on Blinkman, including its existing subtle radius flicker (`torchRadius(time)` in `js/render.js`).
- **Forward cone**: new. ±45° half-angle (90° total field of view), reaching 120px (6 tiles) from Blinkman, pointing along his existing `dir` vector. `dir` already snaps to the 4 cardinal directions (used today for sprite rotation, `js/render.js:409`) — no new facing concept is needed. The cone's reach flickers in sync with the circle's existing wobble (same multiplier applied to both).
- **Rim softness**: the existing `TORCH_SOFT = 12px` soft-edge falloff applies to both the circle's edge and the cone's outer edge/sides, same behavior as today's circle-only fade.
- The union of circle and cone is the complete "lit" shape before occlusion is applied.

## Wall occlusion

- Applies to the entire lit shape (circle + cone) — a ghost one tile away around a corner is exactly as hidden as one across the map. This is the primary "claustrophobic" effect the design is going for.
- The sonar ping (keypress echolocation pulse, `js/game.js` `samplePulse`) is explicitly **exempt** and keeps working through walls unchanged. This gives players a reason to use the ping specifically to check blind corners — eyesight (circle+cone) is blocked by walls, "hearing" (ping) is not.
- Occlusion is a hard cutoff — no gradient at the shadow boundary. This is deliberately distinct from the soft distance-based rim fade at the vision boundary, so the wall shadow reads as a sharp, dramatic edge.

## Algorithm

No new data structures are needed — both parts reuse the existing `walls[row][col]` grid and precomputed `maze.edges` wall-segment list (`js/maze.js`).

1. **Background reveal (walls/pellets rendering)**: each frame, build a visibility polygon by casting rays from Blinkman toward the circle+cone boundary and toward every wall corner within range (plus a standard shadowcasting offset — a ray angled just past each corner — for crisp corner edges). Each ray stops at the nearest wall it hits, or the circle/cone boundary if it hits nothing. The resulting polygon is used as a canvas clip region: walls/pellets draw only inside it, still subject to the existing distance-based soft-edge alpha.
2. **Ghosts**: a single line-of-sight test per ghost, `canSee(blinkman, ghost)`, checked against `maze.edges`. If blocked, the ghost's torch-reveal alpha is 0 regardless of distance. If clear, the existing distance-based `torchReveal` alpha logic (`js/render.js`) applies unchanged.

## Edge cases

- Blinkman's `dir` is initialized to a cardinal direction at spawn and only changes when he moves, so it is never `{0,0}` — the cone always has a valid facing direction. No fallback is needed.
- The tunnel row (the one row that runs off both maze edges, see `TUNNEL_ROW` in `js/maze.js`) gets no special-case handling. The cone/occlusion logic only reasons about in-grid tiles, so standing in the tunnel just behaves like being at the edge of the grid. Worth a quick playtest pass, not worth designing around further.

## Out of scope

- Other vision modes (`easy`, `normal`, `hard`, `blink`) — untouched, still purely layer-alpha based with no spatial/occlusion component.
- Changing the ping's radius, cooldown, or fade behavior.
- Any change to how ghosts are revealed while still inside the ghost house (`PV.ghostReveal`, separate mechanic, already disabled during torch mode).
