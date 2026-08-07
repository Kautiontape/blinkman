# General improvements — design

Twelve changes, grouped by the file they land in. They are independent of each
other except where noted.

## 1. Flashes stack

`js/vision.js`

`createVision` keeps one `flash` slot, replaced on every pick. It becomes
`flashes`, an array. Both Flash and Torch push onto it; each entry ages and
expires on its own clock.

- `select()` pushes a new entry instead of assigning one.
- `update()` ages every entry and drops the expired ones — past `hold + fade`
  for Flash, past `pulseLife(rules)` for Torch.
- Flash layer alpha is the **max** over live entries on that layer, so a second
  flash brightens rather than replaces.
- `current()` — the HUD badge — reports the newest live entry's layer.

No cap is needed. Cooldown divided by life bounds the count on its own: at most
about three concurrent pings in Torch Easy, five flashes in Flash Easy.

`pulse()` becomes `pulses()` and returns the array. Three consumers loop rather
than testing one object:

- `game.samplePulse` samples ghosts against every live ping.
- `render.drawPulse` draws each ping.
- `hud.update` lights a chip if any live ping names that layer.

## 2. The opening reveal includes You

`js/vision.js`

`reset()` seeds one flash from `rules.initial[0]`. It seeds one per entry
instead, and Flash's `initial` becomes `['walls', 'pacman']`. A Flash round
opens with the walls and Blinkman both lit, fading together.

Torch and Stare are unchanged. Torch already draws him under `freeSelf`; Stare's
`initial` is its stack, where a `pacman` entry would consume a `keep` slot.

`reset()` bypasses `selectable()`, so seeding `pacman` is fine in Flash Easy
where the layer is outside the pool.

## 3. House ghosts no longer glow through the dark

`js/entities.js`, `js/render.js`

`PV.ghostReveal`, `DOOR_Y` and `IN_HOUSE` are deleted. `EXIT_Y` stays —
`updateGhost` reads it to lift a ghost out of the house. `drawGhosts` drops the
`housed` term from its alpha, leaving the layer alpha and Torch's own light.

Dark is now dark in all three modes. Torch's `torch ? 0 :` special case goes
with it.

Fallout: `test/opening-test.js` loses its `ghostReveal` block, and the README
paragraph describing the house glow (and Torch opting out of it) is removed.

## 4. Torch Hard has no cone

`js/vision.js`, `js/render.js`, `js/strings.js`

Torch Hard becomes `torchRadius: 44, coneLen: 0, coneHalf: 0` — a bare pool of
light, roughly 2.2 tiles, with no forward beam. The radius rises from 32 to
offset losing a 96px cone.

Two places in `render.js` break at `coneLen: 0`:

- `torchReach()` returns `coneLen` whenever the angle offset is within
  `coneHalf`. At `coneHalf: 0` an exactly-forward ray still matches and returns
  0, notching the lit polygon. It must return `radius` when there is no cone.
- `torchSpill()` caps each ray at `torch.coneLen`, which at 0 collapses the
  whole light. The cap is `Math.max(coneLen, radius)` — correct in general, and
  load-bearing here.

`PV.torchAlpha` needs no change: its cone branch is guarded by
`dist <= params.coneLen`, which never matches at 0.

Copy for Torch Hard is rewritten, since "a narrow cone, quick to fade" no longer
describes it. One bold run, on the phrase saying how much you can see:

- `menu`: `<b>No cone.</b> Only the light you stand in &middot; 2s cooldown`

## 5. Torch Easy pings track

`js/vision.js`, `js/game.js`

New rule flag `pingTracks: true` on Torch Easy only.

A blip gains a `dist` field, frozen at the distance where the ring found the
ghost. That is what clocks its fade. Under `pingTracks`, `samplePulse` keeps
refreshing an existing blip's `x`, `y` and `wobble` from the live ghost every
frame, leaving `dist` alone. The contact waddles along with the ghost while it
is lit, and still fades on the schedule it was found on.

`drawPulseBlips` reads `b.dist` instead of recomputing the distance, so the
renderer needs no knowledge of the flag.

Torch Easy's menu line moves its bold run onto the new behaviour, which is now
the more useful thing it says:

- `menu`: `A wide cone, and a ping that <b>follows them</b> &middot; 1s cooldown`

## 6. The board aura

New `js/aura.js`, loaded before `js/render.js`.

`PV.createAura()` returns `{ update(game, dt), draw(ctx) }`. A separate file
rather than more `render.js`, which is already the largest in the project; the
aura has one job and a two-method interface.

Form: four linear gradients, one per board edge, fading from the rim inward over
about 34px, composited `lighter` so the corners come out brighter.

| When | Look |
| --- | --- |
| Fright running | White, always present, breathing near 1.2 Hz between 0.35 and 0.75 |
| Fright's last 2s | White, blinking, accelerating from about 4 Hz to 9 Hz |
| Fright expires | One yellow pulse, about 0.5s, fast attack and eased decay |
| Caught | Red, held through `DEATH_REVEAL`, decaying over `DEATH_ANIM` |

The blink threshold is `frightTimer < 2` — the same one the ghosts already flash
white on, so the two cues agree.

Red cancels a running white aura and suppresses the yellow pulse: a round that
ended is no longer news about the fright.

The yellow pulse is the aura's only memory. It fires when `frightTimer` crosses
to 0 **while `game.state` is still `playing`**. That condition is also what
keeps a round reset from firing it — `resetActors` zeroes `frightTimer` under
state `ready` or during `dying`, never `playing`.

Under `PV.wantsCalm()` the breathing and blinking flatten to steady levels, and
the yellow and red become steady fades.

## 7. READY waits, says less, shows more

`js/game.js`, `js/main.js`, `js/strings.js`

**Waits.** `game.update`'s `if (game.stateTime > 1.8) beginPlay()` is deleted.
`steer()` already calls `beginPlay()` from `ready`, so movement becomes the only
way in. The attract demo steers on its first frame in `ready`, so it is
unaffected.

**Shows more.** `visibleAlpha()` gains a `ready` case beside the existing
`dying` one: walls floored at 0.55 in every mode. Torch still draws its cone on
top of the dim map. The HUD walls chip lights during READY, which is honest —
the chips report what is on screen.

**Says less.** The overlay body is the mode and level alone
(`STARE · NORMAL`); the hint is `move to begin`. `readyHint` drops
`Maze %MAZE%`, which the HUD already carries. `PV.levelBlurb` and all nine
`blurb` strings are deleted as dead copy, costing `test/modes-test.js` its
blurb check. `syncOverlay`'s cache key drops `game.maze.recipe`, which no
remaining overlay reads.

## 8. The hint breathes

`css/style.css`

`#hint.on` swaps its flat `.55` opacity for a 3.6s `ease-in-out` loop between
.35 and .95. The existing `prefers-reduced-motion` block gains a line pinning it
back to a static `.55`.

## Testing

- `test/torch-test.js` — `pulse()` → `pulses()` throughout. New coverage: two
  pings alive at once, Torch Hard's coneless light reaching its full radius in
  every direction, and a tracked blip following its ghost while its `dist`
  holds.
- `test/opening-test.js` — the `ghostReveal` block is removed and replaced by a
  check that a Flash round opens with `pacman` lit.
- `test/modes-test.js` — the blurb check is removed.
- New coverage for stacked flashes: a second pick does not darken the first
  layer, and both fade independently.
- The aura's schedule is testable without a canvas if `update()` exposes its
  resolved colour and intensity; `draw()` stays untested.
- READY: a round in `ready` stays there past 1.8s, and `steer()` moves it to
  `playing`.

## Documentation

The README's mode grid gets new Torch Easy and Torch Hard cells, its Torch
summary drops the cone as a universal feature, and the paragraph about house
ghosts glowing through the dark is removed. `index.html` gains the `js/aura.js`
tag ahead of `js/render.js`, and its load-order comment names the new
dependency.

## Out of scope

`PV.VERSION` is not touched. The release process owns it.
