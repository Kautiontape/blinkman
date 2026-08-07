# Torch mode: directional vision cone with wall occlusion

## Problem

Torch mode's vision is a plain 360° circle around Blinkman (`TORCH_R = 46px`, `js/render.js`). Players report running into ghosts with no warning and no time to react, because the circle gives equal, short-range awareness in every direction rather than useful forward visibility.

## Goal

Give players enough forward warning to see a ghost coming and react (reverse course, take a side path) while keeping the mode tense rather than trivializing it. Two changes, both scoped to `style: 'torch'` only — other vision modes (`easy`/`normal`/`hard`/`blink`) are untouched:

1. Union a forward-facing cone onto the existing fixed circle.
2. Block both shapes at maze walls, so vision doesn't "see" around corners.

## Shape & motion

- **Fixed circle**: unchanged. `TORCH_R = 46px` (2.3 tiles), centered on Blinkman, including its existing subtle radius flicker (`torchRadius(time)` in `js/render.js`).
- **Forward cone**: ±45° half-angle (90° total field of view), reaching 120px (6 tiles) from Blinkman. The cone's reach flickers in sync with the circle's existing wobble (same multiplier applied to both).
- **Beam heading**: the cone points along a continuously eased heading, not Blinkman's own `dir`. `dir` snaps between the 4 cardinal directions; the beam swings to a new one at `TORCH_TURN = 20 rad/s` (a 90° turn in ~0.08s, a reversal in ~0.17s), so a turn reads as a turn. A reversal is a tie — both ways round are equidistant — and breaks toward whichever sweep crosses the middle of the board, the side with more to look at. Ghost visibility reads this eased heading too, so what the beam lights always matches where it points.
- **Rim**: a faint warm stroke (`TORCH_RIM`, alpha 0.20) traces the lit boundary. Down a bare corridor no wall is close enough to catch the light, and without it the dark just thins out with nothing to say how far you can see.
- The union of circle and cone is the complete "lit" shape before occlusion is applied.

## Wall occlusion

- Applies to the entire lit shape (circle + cone) — a ghost one tile away around a corner is exactly as hidden as one across the map. This is the primary "claustrophobic" effect the design is going for.
- The sonar ping (keypress echolocation pulse, `js/game.js` `samplePulse`) is explicitly **exempt** and keeps working through walls unchanged. This gives players a reason to use the ping specifically to check blind corners — eyesight (circle+cone) is blocked by walls, "hearing" (ping) is not.
- Occlusion is a hard cutoff in space — no gradient at the shadow boundary, so a wall's shadow reads as a sharp edge. It is eased in *time* instead (see Algorithm), which is what keeps that hard edge from reading as a flash when it moves.

## Algorithm

No new data structures are needed — both parts reuse the existing `walls[row][col]` grid (`js/maze.js`).

1. **Background reveal (walls/pellets rendering)**: each frame, cast `TORCH_RAYS = 480` rays (~0.75° apart) from Blinkman. Each stops at the first wall it meets or at the shape's own reach at that angle, whichever is nearer, and sinks `TORCH_BITE` (half a tile) into the wall it lands on so walls read as lit surfaces rather than bare outlines — half a tile can never reach through to the corridor beyond. The resulting polygon is a canvas clip region: walls and pellets draw inside it exactly as they would in any other mode, so the darkness is the absence of the board rather than a mask over it. Per-tile lighting was tried first and rejected — whole-tile fills read as a grid.
2. **Ray easing**: ray lengths persist between frames and ease toward their new values at `TORCH_SPILL = 700 px/s` — deliberately the sonar ping's own speed, so the two read as the same light. Without this, clearing a corner makes a whole corridor arrive in one frame, which reads as a flash rather than as sight. Each ray stays hard-clamped to the wall distance in front of it every frame, so a lagging ray can never sit inside a wall Blinkman has just walked up to and show light through it. A position jump larger than `TORCH_JUMP` (2 tiles, i.e. the tunnel) skips the easing rather than sweeping the light across the board.
3. **Ghosts**: `torchGhostAlpha` tests the ghost's exact float position — `PV.torchAlpha` for the shape, then `PV.canSee` for line of sight. Blocked means alpha 0 regardless of distance. Ghosts are never clipped, so one straddling the edge shows whole rather than sliced.

## Edge cases

- Blinkman's `dir` is initialized to a cardinal direction at spawn and only changes when he moves, so it is never `{0,0}`; the swing treats a zero vector as "right" anyway rather than producing a heading of `atan2(0, 0)`.
- The tunnel row (the one row that runs off both maze edges, see `TUNNEL_ROW` in `js/maze.js`) gets no special-case handling. The cone/occlusion logic only reasons about in-grid tiles, so standing in the tunnel just behaves like being at the edge of the grid. Worth a quick playtest pass, not worth designing around further.

## Out of scope

- Other vision modes (`easy`, `normal`, `hard`, `blink`) — untouched, still purely layer-alpha based with no spatial/occlusion component.
- Changing the ping's radius, cooldown, or fade behavior.
- Any change to how ghosts are revealed while still inside the ghost house (`PV.ghostReveal`, separate mechanic, already disabled during torch mode).
