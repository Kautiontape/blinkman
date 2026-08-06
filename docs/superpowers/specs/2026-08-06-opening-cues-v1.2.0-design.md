# Opening cues (v1.2.0)

## Problem

A round opens without telling the player what is happening. Three specific
gaps:

1. **Two ghosts are loose immediately.** Blinky spawns on the board, and
   Pinky's release rule is `dotsEaten >= 0`, which is true on the first
   playing frame. After a mid-level death it is worse: `dotsEaten` carries
   across deaths, so Inky (20 dots) and Clyde (60 dots) both satisfy their
   counts instantly and leave together.
2. **The ghost house looks empty.** `render.js` gates every ghost on
   `alpha.ghosts > 0`, so when the ghosts layer is off there is no sign that
   three ghosts are sitting in the middle of the board waiting to come out,
   and no moment that shows them going invisible.
3. **The dots are never introduced.** In Normal, Hard and Blink the dots
   layer starts off, so the board opens with no indication that pellets exist
   or which chip reveals them.

## Definitions

- **Round start**: `game.startRound()`, which runs on a new level and after
  every death. All three cues play on every round start.
- **Release ladder**: the per-ghost schedule governing when a ghost in the
  house transitions to `leaving`.
- **Reveal alpha**: a per-ghost opacity floor, independent of the ghosts
  layer, that makes a ghost inside the house visible.
- **Intro blink**: a one-shot opacity floor on the dots layer at the start of
  a round.

## Scope

### 1. Release ladder

`GHOST_DEFS` in `js/entities.js` carries a release triple instead of a bare
dot count. `releaseGhosts()` in `js/game.js` releases a housed ghost when
`earliest` has passed **and** (`dotsEaten` meets `dots` **or** `latest` has
passed).

| Ghost | dots | earliest | latest |
|---|---|---|---|
| blinky | 0 | 0 | 0 |
| pinky | 0 | 2.0s | 2.0s |
| inky | 20 | 5.0s | 9.0s |
| clyde | 60 | 8.0s | 14.0s |

Blinky opens the round already outside, so the ladder only applies to it on a
respawn.

> Superseded in v1.3.0: Blinky's spawn moved inside the house, to `(13, 13)`
> below the door. All four now start housed and the ladder governs every exit,
> Blinky's included, so the opening reads as a countable file-out. Its release
> triple is unchanged — all zeroes still means it leads.

`earliest` is the new term and guarantees a ≥2s gap between exits that no dot
count can undercut. A passive player sees exits at 0 / 2 / 9 / 14; a fast one
at 0 / 2 / 5 / 8.

This replaces the `4 + releaseAt * 0.08` patience expression with named
numbers. `latest` carries that expression's intent: a cautious player is not
left alone with Blinky.

Both timers read `game.stateTime`, and both transitions out of `ready` — the
1.8s expiry in `game.update()` and the early exit in `game.steer()` — reset it
to 0. Without that reset the ladder measures from `startRound()` and so
includes the `ready` period, whose length depends on the player: Pinky's 2.0s
would land 0.2s after the overlay lifts for someone who waits `ready` out, but
a full 2.0s after for someone who presses a direction immediately. The ladder
needs to measure the same thing either way.

The reset also makes `stateTime` mean the same thing in every state. `dying`,
`levelclear` and `ready` already reset it on entry and read it as a per-state
timer; the release code was alone in reading it as a per-round timer. Nothing
else reads it across a state change: `render.js` touches it only during
`dying`, and the HUD and overlay never do.

The ladder and the intro blink then share a baseline, since `vision.update()`
is likewise unreachable while `ready`.

The 1.0s `releaseTimer` dwell a ghost serves on re-entering the house after
being eaten is unchanged. Mid-level, `stateTime` is already past every
`earliest` and `latest`, so that dwell remains the only gate on a respawn —
the ladder applies to round openings only.

### 2. Reveal alpha

`PV.ghostReveal(g)` in `js/entities.js` returns a ghost's reveal alpha. It is a
pure function of position and state, with no timer and nothing stored:

- states `out` and `eaten` → `0`
- states `house`, `leaving` and `entering` →
  `clamp((y - EXIT_Y) / (DOOR_Y - EXIT_Y), 0, 1)`

where `EXIT_Y = PV.center(11) = 230` and `DOOR_Y = PV.center(12) = 250`.

The state guard is required, not decorative: an `out` ghost below row 12
would otherwise clamp to 1 and stay visible across the whole lower board.

All three housed ghosts sit on row 14 (`y = 290`), so the expression is 1
anywhere at or below the door line and falls to 0 across the 20px doorway.
Rising out at 6 tiles/sec that is a 0.17s fade; the descent on `entering` at
11 tiles/sec fades back in over 0.09s, so re-entry is symmetric at no extra
cost.

`js/render.js` stops gating `drawGhosts` on `alpha.ghosts > 0` and draws each
ghost at `max(layerAlpha, PV.ghostReveal(g))`, skipping any that resolve to
zero.
The forced reveal during a death and the culprit dimming are unchanged.

### 3. Intro blink

A one-shot timer in `js/vision.js` applied as a floor in `update()`:
`a.dots = max(a.dots, intro)`. Three blinks at 0.18s on / 0.12s off, then a
0.45s fade to the layer's real alpha. 1.35s total. The fade reuses the eased
falloff Blink mode already applies to a flash, `(1 - t)²`, so the last sliver
of visibility lingers the same way in both.

`v.reset()` arms it. The clock needs no special casing for the `ready` state:
`game.update()` returns before `vision.update()` while `ready`, so the blink
starts the frame the overlay lifts rather than burning down behind it.

In Easy the dots layer starts lit at `OLDER_PICK_ALPHA`, so the blink reaches
full opacity and settles back to 0.55. The cue plays identically in all four
modes.

### 4. Version

`PV.VERSION` in `js/strings.js` moves to `1.2.0`.

## Consequences

- **The dots chip lights during the blink**, then goes dark. `hud.update()`
  reads `visibleAlpha()` and the intro floor lives inside it. Intended: it
  ties the flash to the chip that controls it.
- **The dots chip also sits lit through the `ready` countdown.** `v.reset()`
  arms the intro and paints its first frame via `v.update(0)`, and
  `vision.update()` is unreachable while `ready`, so that frame holds until
  play starts. The chip is in the side panel rather than behind the overlay,
  so it is fully visible for up to 1.8s before the blink begins. The walls
  chip already behaves this way in Normal and Hard.
- **The ghosts chip does not light for housed ghosts.** `PV.ghostReveal()` is
  per-entity and sits outside `visibleAlpha()`. The ghosts layer genuinely is
  not on, so the chip stays honest.
- **Housed ghosts are faintly visible behind the `ready` overlay**, which is
  86% opaque rather than opaque. `PV.ghostReveal()` reads position and state
  directly, so this holds from the first frame of the round with no
  initialisation.
- **Hard and Blink lose some blackout.** A housed ghost is visible mid-level,
  including one respawning after being eaten. Accepted: housed ghosts are
  stationary and cannot threaten the player.

## Enforcement

`test/opening-test.js`, a plain node script in the style of
`test/maze-test.js` — no framework, non-zero exit on failure. The modules are
DOM-free and `localStorage` is already wrapped in try/catch, so `maze.js` →
`entities.js` → `vision.js` → `game.js` load headless under a `global.window`
stub.

Five checks:

1. **Release ladder** — step a game with zero dots eaten and assert Pinky,
   Inky and Clyde leave the house at their `latest` times, in that order,
   with gaps of at least 2s. Blinky opens the round in `out`, so the ladder
   does not govern its first exit. Step a second game with `dotsEaten` forced
   past every count and assert the exits move to the `earliest` times rather
   than all firing at once — the mid-level respawn case that motivates the
   floors.
2. **Respawn through the house** — drive a ghost through `entering` into
   `house` and step past the 1.0s dwell, asserting it leaves again without
   throwing. Every ghost lands in the house on the way back from being eaten,
   Blinky included, so every ghost needs a release rule. The `newGame()` seam
   freezes `eatPellet`, which makes fright and the eaten state unreachable, so
   nothing else in this file covers that path.
3. **Baseline** — assert `stateTime` is 0 on the first `playing` frame by
   both routes out of `ready`: waiting the 1.8s out, and calling
   `game.steer()` early.
4. **Reveal alpha** — assert the value at the house row, the door line, a
   mid-doorway position and the exit row, for each of the five ghost states.
   `out` and `eaten` must read 0 at every one of those positions.
5. **Intro blink** — sample `vision.update()` on a fine step and assert the
   floor reaches 1 three times, drops to 0 between them, and has released to
   the layer's own alpha by 1.35s. Run it against Normal (dots start dark)
   and Easy (dots start at 0.55) so the floor is shown to settle to each.

## Out of scope

- Arcade speed tables and per-ghost house dot counters. The release ladder
  gets closer to the arcade but does not adopt them.
- Any change to the `ready` overlay, its duration, or its opacity.
- Walls, pacman and ghosts layers at round start. Only dots blink.
