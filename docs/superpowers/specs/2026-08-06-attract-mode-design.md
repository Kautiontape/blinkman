# Attract mode

## Problem

The menu draws a black board. `showMenu()` calls `renderer.clear()` and the
frame loop returns early on `!game`, so the largest element on the screen is an
empty rectangle behind a scrim. Nothing on the menu shows what the game looks
like or what "drawn one layer at a time" means, and the four mode blurbs are
the only explanation a first-time player gets.

## Definitions

- **Attract game**: a `PV.createGame()` instance owned by the menu, driven by
  code rather than by the player, and never shown in the HUD.
- **Autopilot**: the routine that sets `pacman.want` each frame.
- **Danger field**: per-tile step distance to the nearest loose, unfrightened
  ghost.
- **Rotation**: the timed cycle of `game.selectVision()` calls that swaps the
  lit layer.

## Scope

### 1. `js/attract.js`

A new file exporting `PV.createAttract()`, which returns `{ game, update }`.
It loads after `game.js` and before `main.js`; the file list in `index.html`
and in the README gains it in that position.

The game is built with `PV.createGame('normal', { persist: false })`. Normal's
rules are what the design calls for without inventing a fifth difficulty:
`freeSelf` keeps Pac-Man lit at all times, `keep: 1` means exactly one other
layer is on, and `pool` is the three layers the rotation cycles.

`onEvent` is left at its default no-op, so the attract game is silent — no
chomps, no siren, no screen shake. `main.js` reaches `syncSiren()` only inside
the `game` branch, so nothing else has to be muted.

#### Autopilot

`update(dt)` recomputes `pacman.want` before stepping the game, every frame,
while `state` is `ready` or `playing`. Two breadth-first searches over the
28x31 grid, both into preallocated arrays reused across frames:

1. **Danger field** — multi-source BFS seeded with the tile of every ghost in
   state `out` that is not frightened. Ghosts in the house, leaving, eaten or
   entering seed nothing; neither do frightened ones.
2. **Route** — BFS from Pac-Man's tile across tiles that are passable and have
   a danger distance above 2, stopping at the first target found. Targets are
   any tile holding a pellet, plus the tiles of frightened `out` ghosts while
   `frightTimer > 0`. The direction returned is the first step of that route.

Both searches wrap columns: a neighbour column outside `0..COLS-1` maps to the
opposite edge before the passability check. Off-board tiles are floor only on
`TUNNEL_ROW`, so the wrap resolves to the far tunnel mouth there and to the
border wall everywhere else. The direction handed to `game.steer()` is the
unwrapped one, which `advance()` already wraps in `wrapTunnel()`.

Two fallbacks, in order, when the route search finds nothing:

1. Rerun it with the danger threshold dropped, so a Pac-Man boxed in by ghosts
   walks out through them rather than freezing.
2. Take any passable neighbour, preferring one that is not a reverse.

The second fallback makes the direction legal unconditionally, which is the
invariant the test asserts. It is reachable only in the frame between the last
pellet being eaten and `levelclear` being set.

Recomputing every frame rather than caching per tile costs roughly 7000 tile
visits a frame and removes the one-tile lag a cached route has: `advance()`
consumes `want` at a tile centre, so a route computed on arrival at that centre
would not be applied until the next one.

#### Rotation

A timer advancing only while `state === 'playing'`. Every 4s it calls
`game.selectVision()` with the next of `walls → dots → ghosts`, a 12s full
cycle. The 1.0s cooldown cannot collide with a 4s period, so no pick is ever
refused. Holding the timer outside `playing` means a death or a level clear
holds the current layer instead of burning cycle time behind a frozen board.

Normal's `initial` is `['walls']`, so the round opens on walls and the first
swap is to dots at 4s.

#### Keeping it running

`levelclear` advances itself after 2s and `dying` restarts the round itself.
`gameover` is terminal — `game.update()` returns immediately and never leaves
the state — so `update()` calls `game.restart()` when it sees it.

### 2. `js/game.js`

`PV.createGame(difficultyId, opts)` gains one option. `opts.persist === false`
suppresses the `store.set()` inside `addScore()`; the default and every
existing call site are unchanged.

Without it the autopilot's score is written to `pv-best-normal` and overwrites
the player's real Normal high score, which is displayed in the HUD and survives
across sessions. Reading `best` at construction is left alone: it is only ever
compared against, and the attract game's `best` is displayed nowhere.

### 3. `js/main.js`

An `attract` variable alongside `game`.

- `showMenu()` builds one instead of calling `renderer.clear()`, unless
  `wantsCalm()` — under `prefers-reduced-motion` the board stays black and no
  attract game is created.
- `startGame()` drops it.
- `frame()`'s `if (!game) return;` becomes a branch that, when an attract game
  exists, calls `attract.update(dt)` and `renderer.draw(attract.game, dt)`
  before returning.

`syncSiren()`, `syncOverlay()` and `hud.update()` all sit below that return and
are untouched, so the menu panel and the whole side panel behave exactly as
before. `layout()`'s `if (!game) renderer.clear()` stays: it blanks a stale
frame during a resize, and the next frame redraws.

### 4. `css/style.css`

`.overlay` background moves from `rgba(3,5,12,.86)` to `rgba(3,5,12,.78)`. At
86% the sim reads as a shimmer; at 78% the motion registers while the menu text
stays at full contrast against it. No other rule changes.

### 5. Documentation

`PV.VERSION` is left alone. A release sets it, not a feature branch.

The README gains `js/attract.js` in the file list and `test/attract-test.js` in
the test list, and drops "no attract mode" from the *Not done* section.

## Consequences

- **The dots blink three times on every attract round start.** `vision.reset()`
  arms the v1.2.0 intro cue and the attract game resets on every death and
  level. Intended: it is the cue the menu most wants to advertise.
- **The board never sits still.** The menu now runs a full simulation and a
  canvas redraw at 60fps where it previously ran neither. `requestAnimationFrame`
  already stops in a backgrounded tab, and `prefers-reduced-motion` opts out
  entirely.
- **Round starts have no `ready` pause.** The autopilot calls `game.steer()` on
  the first frame of every round, which trips `beginPlay()` immediately. The
  1.2s `invuln` still applies, so Pac-Man flickers briefly after each respawn.
- **The autopilot dies.** Ghost avoidance is a two-tile buffer, not a solver,
  and the death animation plus the culprit ring play behind the menu. Accepted:
  a demo that gets caught shows more of the game than one that does not.
- **The menu maze is not the maze you play.** `PV.createMaze()` is unseeded, so
  the attract game picks its own recipe and rerolls it on every level clear.
- **Housed ghosts are more visible than before.** `PV.ghostReveal()` ignores the
  layer, and the scrim is now 8 points lighter. This applies to the `ready` and
  `gameover` panels during a real round too, which share the `.overlay` rule.

## Enforcement

`test/attract-test.js`, a plain node script in the style of
`test/opening-test.js` — no framework, non-zero exit on failure. It loads
`maze.js` → `entities.js` → `vision.js` → `game.js` → `attract.js` under a
`global.window` stub.

Four checks:

1. **Legal steering** — step an attract game for 20 simulated seconds and, on
   every frame where Pac-Man is at a tile centre, assert `pacman.want` names a
   direction that is passable from his tile. Covers the wrap handling at both
   tunnel mouths and every fallback path.
2. **Progress** — step for 20 seconds with `invuln` frozen at `Infinity`, the
   seam `opening-test.js` already uses to keep a ghost from ending a round
   mid-measurement, and assert `dotsEaten` passes 40. At 5.6 tiles/sec that is
   a third of the tiles crossed, so it fails on a Pac-Man that circles without
   eating as well as on one that stalls.
3. **Rotation** — step for 13 seconds, sampling `vision.current()`, and assert
   the set of values seen is exactly Normal's pool. One cycle is 12s, so a
   period or an ordering that skips a layer fails.
4. **Persistence** — with a `localStorage` stub counting `setItem`, assert a
   `{ persist: false }` game scores without writing, and that a default game
   still writes. `game.js` wraps its storage access in try/catch, so the stub
   is what makes the write observable at all.

## Out of scope

- Any change to the HUD. It keeps showing `hud.showIdle()` — score `0`, best
  and maze `—`, chips disabled, badge dark — and learns nothing about the
  attract game.
- Any change to the menu panel, its layout, or its wording.
- Sound on the menu.
- A difficulty picker or mode preview for the attract game. It runs Normal.
- Arcade-style attract sequences: no scripted chase, no character roll call,
  no demo-play banner.
