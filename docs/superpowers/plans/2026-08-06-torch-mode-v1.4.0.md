# Torch Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth difficulty, Torch — a lit disc that follows Pac-Man, plus a sonar ping fired by the layer keys that sweeps one layer outward in a flat scan colour — and lay the menu out in two columns.

**Architecture:** A ping is Blink's flash on a distance-delayed clock: the same `(1 − t)²` curve and the same `hold`/`fade` rule fields, with each element's clock starting when the expanding ring reaches it rather than when the key was pressed. `js/vision.js` gains one pure function and a pulse slot; all the geometry lives in `js/render.js`. `vision.alpha` stays zero throughout, so every existing renderer guard is untouched.

**Tech Stack:** Plain ES5 scripts on a `window.PV` global, no modules and no build step. Canvas 2D. Tests are bare node scripts with a `global.window` stub, no framework.

**Spec:** `docs/superpowers/specs/2026-08-06-torch-mode-v1.4.0-design.md`

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `js/vision.js` | Modify | Adds `PV.pulseAlpha()`, `PV.PULSE_SPEED`, the `torch` rules entry, and a pulse slot on the existing `flash` variable |
| `js/game.js` | Modify | Passes Pac-Man as the ping origin; samples ghost blips after ghosts move |
| `js/render.js` | Modify | Draws the ping and the torch; owns `PV.wantsCalm()` |
| `js/hud.js` | Modify | Lights the chip of the layer being pinged |
| `js/main.js` | Modify | `Digit5` starts Torch; calls `PV.wantsCalm()` instead of a local copy |
| `js/strings.js` | Modify | Torch's name, blurb and menu line; splash fix; version 1.4.0 |
| `index.html` | Modify | Fifth mode button |
| `css/style.css` | Modify | `.diffs` becomes two columns |
| `test/torch-test.js` | Create | Fade curve, frozen origin, expiry, dark alpha, ghost blips |
| `README.md` | Modify | Modes table, load-order note, test list |

Task order keeps Torch unreachable from the menu until Task 7, so no intermediate commit ships a mode that renders black. Tests reach it directly with `PV.createGame('torch')`.

---

### Task 1: The fade curve

**Files:**
- Modify: `js/vision.js`
- Test: `test/torch-test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/torch-test.js`:

```js
/* Torch-mode regression test — run with:  node test/torch-test.js
 *
 * Covers the sonar ping: its distance-delayed fade curve, its frozen origin,
 * its expiry, and the ghost blips. All of it is timing- and geometry-sensitive
 * and none of it is visible to a layout check.
 */
global.window = {};
var path = require('path');
['maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f));
});
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

function near(actual, expected, tol) {
  return Math.abs(actual - expected) <= (tol === undefined ? 0.02 : tol);
}

var STEP = 1 / 60;
var RULES = PV.DIFFICULTIES.torch;
var SPEED = PV.PULSE_SPEED;

console.log('');
console.log('ping fade curve');

(function () {
  var d = 350;                   // half a board away
  var arrival = d / SPEED;       // 0.5s at 700 px/s

  check('dark before the ring arrives',
    PV.pulseAlpha(d, arrival - 0.05, RULES) === 0);
  check('full the moment it arrives',
    PV.pulseAlpha(d, arrival, RULES) === 1);
  check('still full through the hold',
    PV.pulseAlpha(d, arrival + RULES.hold - 0.01, RULES) === 1);

  var mid = PV.pulseAlpha(d, arrival + RULES.hold + RULES.fade / 2, RULES);
  check('eased at the fade midpoint', near(mid, 0.25, 0.001), mid);

  check('spent once the fade is done',
    PV.pulseAlpha(d, arrival + RULES.hold + RULES.fade, RULES) === 0);

  // The whole point of the mode: one age, two distances, two brightnesses.
  var age = 0.9;
  var nearA = PV.pulseAlpha(100, age, RULES);
  var farA = PV.pulseAlpha(500, age, RULES);
  check('near dims while far is still lighting up', nearA < farA,
    nearA.toFixed(3) + ' vs ' + farA.toFixed(3));
  check('beyond the ring is still dark',
    PV.pulseAlpha(age * SPEED + 20, age, RULES) === 0);
})();

console.log('');
console.log(failures === 0 ? 'ALL TORCH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/torch-test.js`
Expected: a `TypeError` — `PV.DIFFICULTIES.torch` is undefined, so reading `RULES.hold` throws before any check prints.

- [ ] **Step 3: Add the curve and the rules entry**

In `js/vision.js`, after the `OLDER_PICK_ALPHA` line, insert:

```js
  /* Torch mode's sonar ping. The ring expands at PULSE_SPEED and every element
   * fades on the same curve a Blink flash uses, clocked from the moment the
   * ring reached it — so near walls are already dimming while far ones are
   * still lighting up. PV.WIDTH and PV.HEIGHT are read at load time, which is
   * why maze.js has to load first. */
  var PULSE_SPEED = 700;                              // px/s
  var PULSE_SPAN = Math.hypot(PV.WIDTH, PV.HEIGHT);   // worst-case corner origin
  PV.PULSE_SPEED = PULSE_SPEED;

  PV.pulseAlpha = function (dist, age, rules) {
    var t = age - dist / PULSE_SPEED;   // seconds since the ring passed
    if (t < 0) return 0;                // not reached yet
    var f = (t - rules.hold) / rules.fade;
    if (f <= 0) return 1;
    if (f >= 1) return 0;
    return (1 - f) * (1 - f);
  };

  /** How long a ping lives: the ring clearing the board, then the last fade. */
  function pulseLife(rules) {
    return PULSE_SPAN / PULSE_SPEED + rules.hold + rules.fade;
  }
```

Then add a fifth entry to `PV.DIFFICULTIES`, after `blink`:

```js
    blink: {
      id: 'blink',
      pool: LAYERS,
      style: 'blink', keep: 1, freeSelf: false,
      cooldown: 1.0, hold: 0.4, fade: 2.0,
      ghostSpeed: 0.86, initial: ['walls']
    },
    torch: {
      id: 'torch',
      pool: ['dots', 'ghosts', 'walls'],
      style: 'torch', keep: 1, freeSelf: true,
      cooldown: 1.0, hold: 0.25, fade: 1.1,
      ghostSpeed: 0.90, initial: ['walls']
    }
```

Also extend the style comment above `PV.DIFFICULTIES`, which currently documents two styles:

```js
   * style 'persist' — your last `keep` picks stay lit until you pick again.
   * style 'blink'   — a pick flashes at full alpha, holds, then fades out.
   * style 'torch'   — a pick pings outward from you; render.js paints it in
   *                   board space, so the layer alphas stay dark.
   * freeSelf        — your own layer is always drawn and costs no pick. */
```

`pulseLife` is unused until Task 2. That is deliberate — it belongs with the constants it is derived from.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: 7 `ok` lines under `ping fade curve`, then `ALL TORCH CHECKS OK`, exit 0.

- [ ] **Step 5: Run the other suites to confirm nothing regressed**

Run: `node test/maze-test.js && node test/opening-test.js`
Expected: `ALL 16 MAZE COMBINATIONS VALID` and `ALL OPENING CUES OK`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add js/vision.js test/torch-test.js
git commit -m "vision: Add the torch ping fade curve"
```

---

### Task 2: Pulse state

**Files:**
- Modify: `js/vision.js`
- Modify: `js/game.js` — `selectVision` only
- Test: `test/torch-test.js`

> Corrected during execution: the `select(layer, game.pacman)` call and the
> sound switch were originally scheduled for Task 3, but the frozen-origin test
> below cannot pass without them — it reads the spawn fallback instead. They
> moved here; Task 3 is now `samplePulse` alone.

- [ ] **Step 1: Write the failing tests**

In `test/torch-test.js`, insert these three blocks between the `ping fade curve` block and the final `console.log` summary lines.

First, a shared helper — put it just below the `var SPEED = PV.PULSE_SPEED;` line at the top of the file:

```js
/* The same seam opening-test.js uses: pellets frozen so nothing under test
 * depends on what Pac-Man wanders into, and invuln held so a ghost can't end
 * the round mid-measurement. steer() is what moves a round out of 'ready'. */
function playing() {
  var g = PV.createGame('torch');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  return g;
}
```

Then the three blocks:

```js
console.log('');
console.log('ping origin');

(function () {
  var g = playing();
  g.update(STEP);
  var start = { x: g.pacman.x, y: g.pacman.y };

  check('a press opens a ping', g.selectVision('walls') === 'ok');
  var p = g.vision.pulse();
  check('the ping records where it was fired',
    p && near(p.x, start.x, 0.001) && near(p.y, start.y, 0.001),
    p && p.x + ',' + p.y);

  // Storing a reference to pacman rather than a copy is the regression here.
  g.pacman.x = start.x + 140;
  g.pacman.y = start.y + 60;
  check('the origin does not follow him',
    near(p.x, start.x, 0.001) && near(p.y, start.y, 0.001), p.x + ',' + p.y);
})();

console.log('');
console.log('ping lifetime');

(function () {
  var g = playing();
  g.update(STEP);
  g.selectVision('walls');

  var life = Math.hypot(PV.WIDTH, PV.HEIGHT) / SPEED + RULES.hold + RULES.fade;
  check('a ping is alive well before its life is up', g.vision.pulse() !== null);

  for (var i = 0, n = Math.ceil((life + 0.1) / STEP); i < n; i++) g.update(STEP);
  check('the ping expires once the last element has faded',
    g.vision.pulse() === null, g.vision.pulse());

  check('blink has no ping', PV.createGame('blink').vision.pulse() === null);
  check('normal has no ping', PV.createGame('normal').vision.pulse() === null);
})();

console.log('');
console.log('layer alpha stays dark');

(function () {
  var g = playing();
  // 100 steps clears the 1.35s dots intro, which is a floor in every mode.
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a press lands after the intro', g.selectVision('walls') === 'ok');
  for (var j = 0; j < 12; j++) g.update(STEP);

  var a = g.vision.alpha;
  check('the ping is running', g.vision.pulse() !== null);
  check('dots dark', a.dots === 0, a.dots);
  check('ghosts dark', a.ghosts === 0, a.ghosts);
  check('walls dark through a live ping', a.walls === 0, a.walls);
  check('you are always lit', a.pacman === 1, a.pacman);
  check('the badge names the pinged layer', g.vision.current() === 'walls',
    g.vision.current());
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/torch-test.js`
Expected: a `TypeError` on `g.vision.pulse is not a function` in the `ping origin` block. The fade-curve checks above it still print `ok`.

- [ ] **Step 3: Add the pulse slot**

All edits are in `js/vision.js`.

Add the spawn centre next to the other module constants, just below the `PV.pulseAlpha` / `pulseLife` block from Task 1:

```js
  /* Where a ping fires from when there is no Pac-Man to ask — the free one a
   * round opens with. Reads the spawn table at load time, as above. */
  var SPAWN_CENTRE = {
    x: PV.center(PV.SPAWN.pacman.col),
    y: PV.center(PV.SPAWN.pacman.row)
  };
```

Inside `PV.createVision`, add this helper above the `var v = {` line:

```js
    /* Blink ignores the origin; Torch expands from it. Copied, not referenced,
     * so walking away doesn't drag the ring's centre along. */
    function newFlash(layer, origin) {
      var o = origin || SPAWN_CENTRE;
      return { layer: layer, age: 0, x: o.x, y: o.y, blips: [] };
    }
```

Replace `current()`:

```js
      /** The layer the HUD badge shows. */
      current: function () {
        if (rules.style === 'persist') return stack[0] || null;
        return flash ? flash.layer : null;
      },
```

Add `pulse()` immediately after `isFree`:

```js
      /**
       * Torch mode's live ping, or null. game.js fills `blips`, one entry per
       * ghost the ring has reached; render.js draws from it.
       * @returns {?{layer: string, age: number, x: number, y: number, blips: Array}}
       */
      pulse: function () { return rules.style === 'torch' ? flash : null; },
```

Replace the body of `select()`. Note the signature gains `origin`, and the branch inverts to test `persist` so both flash styles share a path:

```js
      /**
       * Player pressed a vision key.
       * @param origin  where a Torch ping expands from; ignored by other styles
       * @returns {'ok'|'cooldown'|'unavailable'|'same'}
       */
      select: function (layer, origin) {
        if (!v.selectable(layer)) { denied = DENIED_FLASH; return 'unavailable'; }
        if (cooldown > 0) { denied = DENIED_FLASH; return 'cooldown'; }

        if (rules.style === 'persist') {
          var i = stack.indexOf(layer);
          // Re-picking the layer already on top changes nothing, so it costs no
          // cooldown. Promoting an older one from the stack still does.
          if (i === 0) return 'same';
          if (i !== -1) stack.splice(i, 1);
          stack.unshift(layer);
          if (stack.length > rules.keep) stack.length = rules.keep;
        } else {
          flash = newFlash(layer, origin);
        }
        cooldown = rules.cooldown;
        return 'ok';
      },
```

In `update()`, replace the `if (rules.style === 'blink') { ... } else { ... }` block with a three-way branch:

```js
        if (rules.style === 'torch') {
          // No layer alpha: the ping and the torch are spatial and are drawn
          // in board space by render.js.
          if (flash) {
            flash.age += dt;
            if (flash.age > pulseLife(rules)) flash = null;
          }
        } else if (rules.style === 'blink') {
          if (flash) {
            flash.age += dt;
            var fade = (flash.age - rules.hold) / rules.fade;
            if (fade <= 0) a[flash.layer] = 1;
            // eased, so the last sliver of visibility lingers
            else if (fade < 1) a[flash.layer] = (1 - fade) * (1 - fade);
            else flash = null;
          }
        } else {
          // Older picks sit dimmer, so you can tell which one you just asked for.
          stack.forEach(function (l, idx) {
            a[l] = idx === 0 ? 1 : OLDER_PICK_ALPHA;
          });
        }
```

In `reset()`, widen the flash condition from `blink` to both flash styles:

```js
      reset: function () {
        stack = (rules.initial || []).slice(0, rules.keep);
        // Blink and Torch start pitch black, so the round opens on one free
        // flash, fired from the spawn.
        flash = rules.style !== 'persist' && rules.initial
          ? newFlash(rules.initial[0], null)
          : null;
        cooldown = 0;
        denied = 0;
        intro = 0;
        v.update(0);
      }
```

Finally, in `js/game.js`, hand `select()` the origin and let Torch take the flash sound:

```js
      // Torch expands its ping from wherever Pac-Man is standing; the other
      // styles ignore the origin.
      var res = game.vision.select(layer, game.pacman);
      if (res === 'ok') {
        // Torch is a flash on a delay, so it takes the flash sound too.
        game.onEvent(rules.style === 'persist' ? 'visionSwitch' : 'blink');
      } else if (res !== 'same' && res !== 'ignored') {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: the three new groups all `ok` — 4 checks under `ping origin`, 4 under `ping lifetime`, 6 under `layer alpha stays dark` — then `ALL TORCH CHECKS OK`, exit 0.

- [ ] **Step 5: Run the other suites**

Run: `node test/maze-test.js && node test/opening-test.js`
Expected: both pass. `opening-test.js` covers Blink's flash and the dots intro, which the `update()` rewrite touches, so this is the real check on that edit.

- [ ] **Step 6: Commit**

```bash
git add js/vision.js test/torch-test.js
git commit -m "vision: Track the torch ping and its origin"
```

---

### Task 3: Ghost blips and the origin plumbing

**Files:**
- Modify: `js/game.js`
- Test: `test/torch-test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/torch-test.js`, before the summary lines:

```js
console.log('');
console.log('ghost blips');

(function () {
  var g = playing();
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a ghost ping opens', g.selectVision('ghosts') === 'ok');

  var p = g.vision.pulse();
  var ghost = g.ghosts[0];       // blinky, out of the house by now
  check('no blip on the frame it is fired', p.blips[0] === undefined, p.blips[0]);

  // Step until the ring reaches it, remembering where it was each frame.
  var at = null;
  for (var f = 0; f < 60 && !at; f++) {
    g.update(STEP);
    if (p.blips[0]) at = { x: ghost.x, y: ghost.y };
  }
  check('the ring eventually reaches it', at !== null);
  check('the blip is where the ghost stood when the ring arrived',
    near(p.blips[0].x, at.x, 0.001) && near(p.blips[0].y, at.y, 0.001),
    p.blips[0].x + ',' + p.blips[0].y);

  var frozen = { x: p.blips[0].x, y: p.blips[0].y };
  for (var k = 0; k < 20; k++) g.update(STEP);
  check('the ghost moved on',
    Math.hypot(ghost.x - frozen.x, ghost.y - frozen.y) > 4,
    Math.hypot(ghost.x - frozen.x, ghost.y - frozen.y).toFixed(1));
  check('the blip stayed where the ring found it',
    p.blips[0].x === frozen.x && p.blips[0].y === frozen.y);

  // A walls ping must not leave ghost blips behind.
  var h = playing();
  for (var m = 0; m < 100; m++) h.update(STEP);
  h.selectVision('walls');
  for (var n = 0; n < 40; n++) h.update(STEP);
  check('a walls ping records no blips',
    h.vision.pulse().blips.length === 0, h.vision.pulse().blips.length);
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/torch-test.js`
Expected: `FAIL  the ring eventually reaches it`, then a `TypeError` reading `.x` of undefined on the next check. Nothing fills `blips` yet.

- [ ] **Step 3: Sample the blips**

In `js/game.js`, add this function next to `moveGhosts` and `releaseGhosts`:

```js
    /* Torch mode: a ghost blips where the expanding ring first reaches it, and
     * stays drawn there for the rest of the ping. Plain distance, not the
     * tunnel-wrapped one checkCollisions uses — the ring is drawn as a circle
     * in board space, so a wrapped distance would light a blip before the
     * visible ring arrived. Every ghost is sampled whatever its state: the ping
     * reports where things are, and eaten ghosts show as eyes in every mode. */
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

Call it in `game.update()`, between `moveGhosts(dt)` and `checkCollisions()`:

```js
      consumePellet();
      moveGhosts(dt);
      samplePulse();
      checkCollisions();
```

Then pass the origin and pick the sound in `game.selectVision`:

```js
    game.selectVision = function (layer) {
      // The board is covered outside 'playing', so a pick there spends a
      // cooldown on nothing.
      if (game.state !== 'playing') return 'ignored';
      // Torch expands its ping from wherever Pac-Man is standing; the other
      // styles ignore the origin.
      var res = game.vision.select(layer, game.pacman);
      if (res === 'ok') {
        // Torch is a flash on a delay, so it takes the flash sound too.
        game.onEvent(rules.style === 'persist' ? 'visionSwitch' : 'blink');
      } else if (res !== 'same' && res !== 'ignored') {
        // 'cooldown' and 'unavailable' are refusals and get the denied sound;
        // 'same' is silent — you already have that layer.
        game.onEvent('visionDenied');
      }
      return res;
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: 7 `ok` lines under `ghost blips`, then `ALL TORCH CHECKS OK`, exit 0.

- [ ] **Step 5: Run the other suites**

Run: `node test/maze-test.js && node test/opening-test.js`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add js/game.js test/torch-test.js
git commit -m "game: Sample ghost blips as the torch ping passes"
```

---

### Task 4: The chip follows the ping

**Files:**
- Modify: `js/hud.js:174-182`

`hud.js` is DOM-bound and has no test harness in this repo, matching how the rest of the HUD is covered. Verify it by eye in Task 8.

- [ ] **Step 1: Light the pinged layer's chip**

In `js/hud.js`, replace the closing block of `hud.update`:

```js
        // Chips follow what is actually on screen, including the forced reveal
        // during a death — not just what the player selected. Torch's ping
        // paints in board space rather than through the layer alphas, so it
        // has to report itself.
        var shown = game.visibleAlpha();
        var pulse = v.pulse();
        PV.LAYERS.forEach(function (layer) {
          var lit = shown[layer] > 0.001 || !!(pulse && pulse.layer === layer);
          if (lit === lastShown[layer]) return;
          lastShown[layer] = lit;
          chipEls[layer].classList.toggle('on', lit);
          chipEls[layer].setAttribute('aria-pressed', lit ? 'true' : 'false');
        });
```

`v` is already bound at the top of `hud.update` as `var v = game.vision;`, and `pulse()` returns null in every other mode, so the four existing modes are unaffected.

- [ ] **Step 2: Confirm nothing regressed**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three pass. None of them load `hud.js`; this is a guard against an accidental edit elsewhere.

- [ ] **Step 3: Commit**

```bash
git add js/hud.js
git commit -m "hud: Light the chip a torch ping is sweeping"
```

---

### Task 5: Drawing the ping and the torch

**Files:**
- Modify: `js/render.js`

No headless test — this is canvas drawing. Task 8 is the verification step.

- [ ] **Step 1: Add the constants and `PV.wantsCalm`**

In `js/render.js`, replace the `var PAC_YELLOW = '#ffd23f';` line with:

```js
  var PAC_YELLOW = '#ffd23f';

  /* The ping is one flat colour for every layer. Reading as a sweep rather
   * than as the board is the whole point, so nothing here uses a layer's own
   * palette. */
  var SCAN = '#5cffb0';
  var SCAN_EDGE = '#d8fff0';   // the leading edge, so the ring reads as a ring
  var EDGE_TIME = 0.1;         // how long an element counts as just-reached

  var TORCH_R = 46;            // 2.3 tiles
  var TORCH_SOFT = 12;         // px over which a ghost fades in at the rim

  var calmQuery = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)');

  /** True when the player has asked for less movement. */
  PV.wantsCalm = function () { return !!(calmQuery && calmQuery.matches); };

  /* Two summed sines, so the flicker never settles into an obvious beat. */
  function torchRadius(time) {
    if (PV.wantsCalm()) return TORCH_R;
    return TORCH_R * (1 + 0.045 * Math.sin(time * 11.3) + 0.028 * Math.sin(time * 23.7));
  }
```

- [ ] **Step 2: Hook both passes into `draw`**

Replace the body of `renderer.draw`:

```js
      draw: function (game, dt) {
        // visibleAlpha(), not vision.alpha: a death forces ghosts + Pac-Man on.
        var alpha = game.visibleAlpha();
        // Non-zero only in Torch, where it doubles as the mode test.
        var torchR = game.rules.style === 'torch' ? torchRadius(game.time) : 0;

        ctx.save();
        // Everything below is authored in the fixed 560x620 design space; this
        // maps it onto the real canvas size so the board stays sharp.
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, PV.WIDTH, PV.HEIGHT);

        if (renderer.shake > 0) {
          var s = renderer.shake;
          ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
          renderer.shake = Math.max(0, renderer.shake - dt * 26);
        }

        // Under the layers, so a death reveal still draws over the top.
        if (torchR) {
          drawPulse(ctx, game);
          drawTorch(ctx, game, torchR, scale);
        }

        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        drawGhosts(ctx, game, alpha.ghosts, torchR);
        if (alpha.pacman > 0) drawPacman(ctx, game, alpha.pacman);

        drawFloatingScores(ctx, game);
        ctx.restore();
      }
```

- [ ] **Step 3: Add the ping**

Add these four functions to `js/render.js`, after `drawHouseDoors`:

```js
  /* The ping. Each element's distance from the frozen origin decides both how
   * bright it is and whether the ring has reached it at all. */
  function drawPulse(ctx, game) {
    var p = game.vision.pulse();
    if (!p) return;

    ctx.save();
    if (p.layer === 'walls') drawPulseWalls(ctx, game.maze, p, game.rules);
    else if (p.layer === 'dots') drawPulseDots(ctx, game.maze, p, game.rules);
    else if (p.layer === 'ghosts') drawPulseBlips(ctx, p, game.rules);
    ctx.restore();
  }

  /** True while an element is close enough behind the ring to read as its edge. */
  function justReached(dist, age) {
    return age - dist / PV.PULSE_SPEED < EDGE_TIME;
  }

  function drawPulseWalls(ctx, maze, p, rules) {
    var segs = maze.edges;   // already one segment per tile face
    ctx.lineCap = 'round';
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var d = Math.hypot((s[0] + s[2]) / 2 - p.x, (s[1] + s[3]) / 2 - p.y);
      var a = PV.pulseAlpha(d, p.age, rules);
      if (a <= 0.001) continue;
      var edge = justReached(d, p.age);
      ctx.globalAlpha = a;
      ctx.strokeStyle = edge ? SCAN_EDGE : SCAN;
      ctx.lineWidth = edge ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]);
      ctx.lineTo(s[2], s[3]);
      ctx.stroke();
    }
  }

  function drawPulseDots(ctx, maze, p, rules) {
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (!maze.pellets[r][c]) continue;   // an eaten dot simply isn't there
        var x = PV.center(c), y = PV.center(r);
        var d = Math.hypot(x - p.x, y - p.y);
        var a = PV.pulseAlpha(d, p.age, rules);
        if (a <= 0.001) continue;
        var edge = justReached(d, p.age);
        ctx.globalAlpha = a;
        ctx.fillStyle = edge ? SCAN_EDGE : SCAN;
        fillCircle(ctx, x, y, edge ? 2.6 : 1.8);
      }
    }
  }

  /* A contact reads differently from a pellet: a point inside a ring. blips is
   * sparse — indexed by ghost — and forEach skips the holes. */
  function drawPulseBlips(ctx, p, rules) {
    p.blips.forEach(function (b) {
      var d = Math.hypot(b.x - p.x, b.y - p.y);
      var a = PV.pulseAlpha(d, p.age, rules);
      if (a <= 0.001) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = SCAN;
      fillCircle(ctx, b.x, b.y, 3);
      ctx.strokeStyle = SCAN;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, TILE * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
```

- [ ] **Step 4: Add the torch**

Add after the functions from Step 3:

```js
  /* The torch: a disc of real colour around Pac-Man in a mode that is
   * otherwise black. Ghosts are not clipped — drawGhosts gives them an alpha
   * floor instead, so one straddling the rim shows whole rather than sliced.
   * Pac-Man himself is drawn by the freeSelf path. */
  function drawTorch(ctx, game, radius, scale) {
    var p = game.pacman;

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.clip();
    drawWalls(ctx, game.maze, 1, scale);
    drawPellets(ctx, game.maze, 1, game.time);
    ctx.restore();

    // A warm halo on the rim, so the hard clip edge reads as light falling off.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,130,0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,196,92,0.9)';
    ctx.shadowBlur = 10 * scale;   // in device pixels, so scale by hand
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Same shape as PV.ghostReveal: a per-entity alpha floor, not a clip. */
  function torchReveal(g, pacman, radius) {
    if (!radius) return 0;
    var d = Math.hypot(g.x - pacman.x, g.y - pacman.y);
    if (d <= radius - TORCH_SOFT) return 1;
    if (d >= radius) return 0;
    return (radius - d) / TORCH_SOFT;
  }
```

- [ ] **Step 5: Let ghosts show inside the torch**

In `drawGhosts`, take the new parameter and add the third floor:

```js
  function drawGhosts(ctx, game, alpha, torchR) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      // A ghost in the house, or one standing in the torch, shows through even
      // with the layer dark.
      var a = Math.max(alpha, PV.ghostReveal(g), torchReveal(g, game.pacman, torchR));
      if (a <= 0.001) return;
```

The rest of `drawGhosts` is unchanged.

- [ ] **Step 6: Confirm nothing regressed**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three pass. `render.js` is not loaded headlessly; this only guards against a stray edit.

- [ ] **Step 7: Commit**

```bash
git add js/render.js
git commit -m "render: Draw the torch and its sonar ping"
```

---

### Task 6: Strings and the version bump

**Files:**
- Modify: `js/strings.js:16`, `js/strings.js:30`, `js/strings.js:89-93`

- [ ] **Step 1: Bump the version**

```js
  PV.VERSION = '1.4.0';
```

- [ ] **Step 2: Fix the splash that Torch makes false**

Replace the `'Torches not supplied.'` entry in `splashes` with:

```js
      'Don’t forget to bring a torch.',
```

Keep the typographic apostrophe — every other entry in the pool uses one.

- [ ] **Step 3: Add Torch's copy**

After the `blink` entry in `modes`:

```js
      blink: {
        name: 'Blink',
        blurb: 'Flash one layer and remember it',
        menu: 'Dark. Flash <b>one layer</b>, then it fades &middot; 1s cooldown'
      },
      torch: {
        name: 'Torch',
        blurb: 'A pool of light, and a ping that sweeps',
        menu: 'Lit around you. A ping <b>sweeps one layer</b> &middot; 1s cooldown'
      }
```

One bold run, on the phrase saying how much you can see, per the file's house rule.

- [ ] **Step 4: Commit**

```bash
git add js/strings.js
git commit -m "strings: Name Torch mode and bump to 1.4.0"
```

---

### Task 7: The two-column menu

**Files:**
- Modify: `index.html:60-63`, `css/style.css:115`, `js/main.js:98-104`, `js/main.js:189`

- [ ] **Step 1: Add the fifth button**

In `index.html`, after the `blink` button and before the closing `</div>` of `.diffs`:

```html
          <button class="diff" type="button" data-diff="torch" aria-keyshortcuts="5">
            <span class="dname" data-t="modes.torch.name"></span>
            <span class="ddesc" data-t="modes.torch.menu" data-t-html></span>
          </button>
```

- [ ] **Step 2: Lay the modes out in two columns**

In `css/style.css`, replace the one-line `.diffs` rule:

```css
/* Three rows filled column-first, so DOM order — and therefore tab order and
   the 1-5 keys — puts the standard modes on the left and the dark ones right. */
.diffs {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(3, auto);
  grid-auto-columns: 1fr;
  gap: calc(8px * var(--sc, 1));
  margin-bottom: calc(22px * var(--sc, 1));
}
```

- [ ] **Step 3: Bind key 5**

In `js/main.js`:

```js
  var MENU_KEYS = {
    Digit1: 'easy', Digit2: 'normal', Digit3: 'hard', Digit4: 'blink', Digit5: 'torch'
  };
```

- [ ] **Step 4: Use the shared reduced-motion helper**

Delete these two lines from `js/main.js`:

```js
  var calmQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function wantsCalm() { return !!(calmQuery && calmQuery.matches); }
```

and change the one call site in `handleEvent`:

```js
    if (SHAKE[name] && !PV.wantsCalm()) renderer.kick(SHAKE[name]);
```

`render.js` loads before `main.js`, so `PV.wantsCalm` is defined by then.

- [ ] **Step 5: Confirm nothing regressed**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add index.html css/style.css js/main.js
git commit -m "menu: Add Torch and lay the modes out in two columns"
```

---

### Task 8: Play it

**Files:** none — this is the verification step for Tasks 4, 5 and 7.

- [ ] **Step 1: Serve the worktree**

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` and hard-reload with Ctrl-Shift-R — this project has no cache busting and a stale `render.js` is the usual cause of "my change did nothing".

- [ ] **Step 2: Check the menu**

Two columns: Easy / Normal / Hard on the left, Blink / Torch on the right. Both columns the same width, buttons in a row the same height. `v1.4.0` in the bottom corner. Keys `1`–`5` each start their mode, and Tab moves through them in that order.

- [ ] **Step 3: Check the torch**

Press `5`. A disc of lit maze follows Pac-Man, its edge flickering, the rest of the board black. Dots inside it are their normal colour and vanish as they are eaten. A ghost walking into it appears in full colour and fades in across the rim rather than being sliced by it.

- [ ] **Step 4: Check the ping**

Press `3`. Walls light outward from where you stood, near ones dimming while far ones are still arriving, all in flat green with a brighter leading edge. Walking while it runs does not drag the ring's centre. Press `1` for dots and `2` for ghosts — ghost contacts are ringed points that stay put while the ghosts move on. Press `4`: nothing happens and the You chip reads `ALWAYS`.

- [ ] **Step 5: Check the HUD**

The badge names the layer you pinged and its ring runs the 1s cooldown. The chip for that layer lights for the life of the ping, then goes out. The dots chip lights during the opening blink in Torch, as in every other mode.

- [ ] **Step 6: Check a death**

Get caught. The ghosts light up in full colour across the whole board for the reveal beat, with the red ring on the culprit — the torch does not suppress it.

- [ ] **Step 7: Check reduced motion**

With the OS set to reduce motion, the torch rim holds a steady radius. The ping is unaffected; it is the mechanic, not decoration.

- [ ] **Step 8: Confirm the other modes are untouched**

Play a round each of Normal and Blink. Layers, cooldowns and the opening dots blink behave as before.

---

### Task 9: README

**Files:**
- Modify: `README.md:46-54`, `README.md:115-124`

- [ ] **Step 1: Add Torch to the modes table**

```markdown
| | What you see | Cooldown |
|---|---|---|
| Easy | You and your last two picks | 1s |
| Normal | You and your last pick | 1s |
| Hard | One of four, and you can go dark | 3s |
| Blink | Nothing. A press flashes one layer, which fades over 2s. | 1s |
| Torch | A lit circle around you. A press pings one layer outward from where you stood, and it fades behind the ring. | 1s |
```

- [ ] **Step 2: Correct the load-order note**

```markdown
`maze.js` has to load before `vision.js`, `entities.js`, `render.js` and
`game.js`, which read `PV.TILE`, the board size and the spawn table at load
time. `main.js` has to load last. Everything else in the script order is slack.
```

- [ ] **Step 3: Add the third suite**

```markdown
Three test suites, all plain node scripts with nothing to install. The second
covers the ghost release ladder, the house reveal and the dots blink; the third
covers Torch's ping — its fade curve, its frozen origin, and the ghost blips it
leaves behind. None of that is visible to a layout check.

    node test/maze-test.js
    node test/opening-test.js
    node test/torch-test.js
```

- [ ] **Step 4: Leave `docs/menu.png` alone**

It shows four modes in one column and is now stale. Retaking it is out of scope, and do not add a note to the README saying so — a README that documents its own screenshots being stale is worse than a stale screenshot. Mention it in the handoff instead.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: Document Torch mode"
```

---

## Notes for the implementer

- **`vision.js` now reads `maze.js` values at load time.** `PV.WIDTH`, `PV.HEIGHT`, `PV.SPAWN` and `PV.center` are all read when the file executes, not when a game starts. `index.html` and both test files already load `maze.js` first; anything new that loads `vision.js` must too.
- **`select()` gained a parameter.** `game.selectVision` is the only caller. The layer chips in `main.js` go through `game.selectVision`, so they get the origin for free.
- **If the walls ping stutters**, `drawPulseWalls` strokes each segment separately because alpha varies per segment. Quantising alpha into a handful of buckets and batching each bucket into one path would fix it. Do not do this pre-emptively — the board is 28×31 and it is very likely fine.
