# Torch mode (v1.4.0)

## Problem

Blink is the only mode that plays in the dark, and it is the hardest thing in
the game by a wide margin. A press lights one whole layer for an instant and
then the board is black again, so there is no continuous sense of where you
are — only a series of stills you have to hold in your head.

There is nothing between Hard and Blink. A player who wants to play in the
dark has one option, and it is the punishing one.

## Definitions

- **Torch**: a small disc of light centred on Pac-Man, always on, inside which
  the walls and dots layers are drawn in their real colours regardless of what
  the vision state says.
- **Pulse**: a one-shot expanding ring, fired by a layer key, that reveals that
  layer in a flat scan colour as the ring passes over it.
- **Origin**: the board position a pulse expands from, frozen at the moment it
  is fired.
- **Blip**: a ghost's position sampled once, at the moment the ring reaches it,
  and drawn there for the rest of the pulse.
- **Reach**: the pulse's current ring radius, `age × PULSE_SPEED`.

## Scope

### 1. The mode

A fifth entry in `PV.DIFFICULTIES` in `js/vision.js`:

```js
torch: {
  id: 'torch',
  pool: ['dots', 'ghosts', 'walls'],
  style: 'torch', keep: 1, freeSelf: true,
  cooldown: 1.0, hold: 0.25, fade: 1.1,
  ghostSpeed: 0.90, initial: ['walls']
}
```

`freeSelf: true` because you stand in your own torch and are always visible.
It keeps `pacman` out of the pool, so key `4` is a no-op and the You chip reads
`ALWAYS` — the same arrangement Easy and Normal use, and honest here for a
different reason.

`initial: ['walls']` gives the round a free opening walls sweep, exactly as it
does in Blink. `game.update()` returns before `vision.update()` while `ready`,
so that sweep starts the frame the overlay lifts rather than burning down
behind it.

`ghostSpeed: 0.90` sits between Blink's 0.86 and Normal's 0.92. A torch is a
real advantage over Blink and the ghosts get some of it back.

### 2. The pulse is Blink's flash on a distance-delayed clock

Blink's fade is `(1 − t)²` over `fade` seconds after a `hold`. A pulse runs the
same curve, with each element's clock starting when the ring reaches it rather
than when the key was pressed. A pure function in `js/vision.js`:

```js
PV.PULSE_SPEED = 700;               // px/s

PV.pulseAlpha = function (dist, age, rules) {
  var t = age - dist / PV.PULSE_SPEED;   // seconds since the ring passed
  if (t < 0) return 0;                   // not reached yet
  var f = (t - rules.hold) / rules.fade;
  if (f <= 0) return 1;
  if (f >= 1) return 0;
  return (1 - f) * (1 - f);
};
```

At 700 px/s the ring crosses the 560px board width in 0.8s. Each element holds
for 0.25s and fades over 1.1s from the moment it is reached, so near walls are
already dimming while far ones are still lighting up.

A pulse is spent once the ring has left the board and the last element has
faded:

```js
PULSE_LIFE = Math.hypot(PV.WIDTH, PV.HEIGHT) / PV.PULSE_SPEED + hold + fade
```

which is 2.54s at the worst case of a corner origin. `js/vision.js` therefore
reads `PV.WIDTH`, `PV.HEIGHT`, `PV.SPAWN` and `PV.center` at load time, joining
`entities.js`, `render.js` and `game.js` in depending on `maze.js` loading
first. The script order in `index.html` already satisfies this; the README note
about it needs `vision.js` added.

### 3. Pulse state

`style: 'torch'` reuses Blink's branch in `select()`, with the flash object
carrying the origin and the blip array:

```js
flash = { layer: layer, age: 0, x: origin.x, y: origin.y, blips: [] };
```

`select(layer, origin)` takes a second argument. `game.selectVision()` passes
`game.pacman`; the other three styles ignore it. `v.reset()` defaults the origin
to Pac-Man's spawn centre, which is where the opening sweep belongs anyway.

The origin is frozen at fire time. Walking away does not drag the ring's centre
with you, so the picture a pulse paints stays true to the moment you asked for
it.

`update()` advances `flash.age` and drops the flash past `PULSE_LIFE`. It does
**not** touch `v.alpha` — see §6. A new accessor exposes the state:

```js
pulse: function () { return rules.style === 'torch' ? flash : null; }
```

`current()` already returns the flashed layer, so the HUD badge and its cooldown
ring need no change. Its guard changes from `rules.style === 'blink'` to
`rules.style === 'persist'` returning the stack and everything else returning
the flash.

### 4. Ghost blips

`js/game.js` owns entities, so it fills the array; `js/vision.js` only carries
it and `js/render.js` only reads it. A new step in `game.update()`, after
`moveGhosts()`:

```js
function samplePulse() {
  var p = game.vision.pulse();
  if (!p || p.layer !== 'ghosts') return;
  var reach = p.age * PV.PULSE_SPEED;
  game.ghosts.forEach(function (g, i) {
    if (p.blips[i]) return;
    if (Math.hypot(g.x - p.x, g.y - p.y) <= reach) p.blips[i] = { x: g.x, y: g.y };
  });
}
```

A new pulse is a new object, so the blips clear themselves and no reset path is
needed.

Distance here is the plain one, not the tunnel-wrapped distance
`checkCollisions()` uses. The ring is drawn as a circle in board space, so a
wrapped distance would light a blip before the visible ring reached it.

Every ghost is sampled regardless of state, `eaten` and housed included. The
pulse reports where things are, and the ghosts layer shows eaten ghosts as eyes
in every other mode.

Because a blip is stored where the ring met it, `hypot(blip − origin)` recovers
that hit distance, and `PV.pulseAlpha()` fades the blip on the same clock as
everything else. No extra field.

### 5. Drawing

Two new passes in `js/render.js`, drawn before the existing layer draws so the
death reveal still wins:

```js
var torchR = game.rules.style === 'torch' ? torchRadius(game.time) : 0;
if (torchR) { drawPulse(ctx, game); drawTorch(ctx, game, torchR, scale); }
```

**`drawPulse`** paints one flat scan colour, `#5cffb0`, for all three layers —
that is the whole point of the effect reading as a sweep rather than as the
board. Per element, distance from the origin feeds `PV.pulseAlpha()`:

- **walls** — `maze.edges` is already one segment per tile face, so a per-segment
  midpoint distance gives a clean sweep with no new geometry.
- **dots** — pellet centres as points, reading live pellet state, so an eaten
  dot simply is not there.
- **ghosts** — `pulse.blips`, drawn as a filled point inside a ring so a contact
  reads differently from a pellet.

Elements reached within the last 0.1s draw in a near-white `#d8fff0` and one
step thicker. That leading edge is what makes the ring legible as a ring.

**`drawTorch`** clips to a disc of radius `torchR` around Pac-Man and calls the
existing `drawWalls` and `drawPellets` at alpha 1, then strokes a warm halo at
the rim. The radius flickers on two summed sines:

```js
TORCH_R = 46;   // 2.3 tiles
r = TORCH_R * (1 + 0.045 * Math.sin(t * 11.3) + 0.028 * Math.sin(t * 23.7));
```

about ±7%, or ±3px. Under `prefers-reduced-motion` the radius is frozen at
`TORCH_R`. `wantsCalm()` moves out of `js/main.js` to `PV.wantsCalm()` in
`js/render.js`, which is now its main consumer; `main.js` calls it for the
screen shake as before.

Ghosts are **not** clipped. `drawGhosts` already takes a per-entity alpha floor
— `PV.ghostReveal(g)` — and gains a second one for the torch, on the same
pattern:

```js
a = Math.max(alpha, PV.ghostReveal(g), torchReveal(g, pacman, torchR));
```

ramping from 1 to 0 over the outermost 12px of the disc. A ghost straddling the
rim shows whole rather than sliced, which is both what the existing reveal does
and what reads correctly. Pac-Man is already drawn by `freeSelf`.

### 6. `vision.alpha` stays dark, and the chips still light

`v.alpha` keeps meaning exactly what it means today: how lit a layer is across
the whole board. In Torch that is 0 for every pool layer, because the sweep and
the torch are both spatial and live entirely in the renderer. The existing
`if (alpha.walls > 0)` guards in `render.js` are untouched and draw nothing, and
the dots intro blink still plays globally in Torch because it is a floor on
`a.dots` — the same cue in all five modes.

The chips are a HUD concern and get their answer in `js/hud.js`:

```js
var p = v.pulse();
var lit = shown[layer] > 0.001 || !!(p && p.layer === layer);
```

so the chip you pressed stays lit for the life of the pulse and confirms the
press, the way it does in Blink.

### 7. Menu

`.diffs` in `css/style.css` becomes two columns:

```css
.diffs {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(3, auto);
  grid-auto-columns: 1fr;
  gap: calc(8px * var(--sc, 1));
  margin-bottom: calc(22px * var(--sc, 1));
}
```

DOM order stays `easy, normal, hard, blink, torch`, which fills the left column
with the three standard modes and the right with the two dark ones, and keeps
tab order matching keys `1`–`5`. `index.html` gains one `.diff` button with
`aria-keyshortcuts="5"`; `MENU_KEYS` in `js/main.js` gains `Digit5: 'torch'`.

### 8. Strings

`js/strings.js`:

```js
torch: {
  name: 'Torch',
  blurb: 'A pool of light, and a ping that sweeps',
  menu: 'Lit around you. A ping <b>sweeps one layer</b> &middot; 1s cooldown'
}
```

One bold run, on the phrase saying how much you can see, per the file's house
rule.

The splash `'Torches not supplied.'` becomes false in a game with a Torch mode
and is replaced with `'Don’t forget to bring a torch.'`.

`PV.VERSION` moves to `1.4.0`.

Torch fires the same `blinkFlash` sound a Blink press does — it is a flash on a
delay, and a ping wants that shape. `game.selectVision()` picks the sound on
`rules.style === 'persist' ? 'visionSwitch' : 'blink'`.

### 9. README

The Modes table gains a Torch row. The load-order note gains `vision.js`. The
test list gains `node test/torch-test.js`.

## Consequences

- **`docs/menu.png` goes stale.** It shows four modes in one column. The
  screenshot needs retaking; nothing in the code depends on it.
- **Menu blurbs wrap to two lines in the narrower columns.** Grid row stretch
  keeps the buttons in a row the same height, so this reads as intended rather
  than as ragged. The existing four strings are left alone.
- **Housed ghosts inside the torch are drawn once, not twice.** Using an alpha
  floor rather than a second clipped pass means `max()` resolves the overlap,
  so no partial alpha composites with itself.
- **A pulse outlives its cooldown, and re-firing cuts it short.** A pulse runs
  up to 2.54s against a 1.0s cooldown, so the ring is often still fading when
  the next press is allowed. `flash` is a single slot, so that press discards
  what is left of the previous sweep rather than overlapping it. This is Blink's
  existing behaviour, kept, and it means pinging as fast as the cooldown allows
  shows you less than pacing the presses out.
- **The badge shows the pulsing layer, not the torch.** `current()` returns the
  flash layer and falls back to `DARK` between pulses, even though the torch is
  still lit. Accepted: the badge tracks what the cooldown ring governs, and the
  ring governs pulses.
- **Torch is the only mode where the board is lit without a key press.** The
  layer chips cannot represent that, and do not try to.

## Enforcement

`test/torch-test.js`, a plain node script in the style of the other two — no
framework, non-zero exit on failure, `global.window` stub.

1. **Fade curve** — `PV.pulseAlpha()` is 0 before the ring arrives, 1 through
   the hold, eased at the fade midpoint, and 0 after. At one fixed age, a far
   element is dimmer than a near one, and a far enough element is still dark.
2. **Frozen origin** — fire a pulse, move Pac-Man several tiles, and assert
   `vision.pulse()` still reports the position at fire time.
3. **Expiry** — `vision.pulse()` returns null past `PULSE_LIFE`, and non-torch
   modes return null from it at all times.
4. **Blips** — step a torch game and assert a ghost gets no blip before the
   reach passes it, gets one after, and that the recorded position is the one it
   held at that moment rather than its later position.
5. **Alpha stays dark** — past the 1.35s dots intro, assert `vision.alpha` is 0
   for dots, ghosts and walls through a live pulse, and 1 for pacman. This is
   what keeps the existing renderer guards correct.

## Out of scope

- A soft radial falloff at the torch rim. The clip is hard-edged and the flicker
  does the work. A two-pass or gradient falloff would either draw the layers
  twice or punch a hole in the pulse underneath it.
- Any change to Easy, Normal, Hard or Blink, including their strings.
- Occlusion. Neither the torch nor the pulse is blocked by walls; both are pure
  distance. A wall does not cast a shadow.
- Sound for the sweep beyond reusing `blinkFlash`. No new audio.
- Retaking `docs/menu.png`.
