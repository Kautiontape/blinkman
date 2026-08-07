# General Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Twelve gameplay and presentation fixes — stacking flashes, a coneless
Torch Hard, tracking pings, a board-edge aura for fright and death, and a READY
screen that waits for you and shows you the maze.

**Architecture:** Vanilla ES5 in the browser, no build step and no dependencies.
Every file attaches to the `window.PV` namespace inside an IIFE and is loaded by
a `<script>` tag in `index.html`, in a load order that matters. Player-facing
copy lives only in `js/strings.js`. Tests are plain node scripts with a
hand-rolled `check()` helper and no framework.

**Tech Stack:** JavaScript (ES5), Canvas 2D, CSS, node for tests, bash for the
release plumbing.

**Design:** `docs/superpowers/specs/2026-08-07-general-improvements-design.md`

**Comment style:** Comments state what the code does now. They never narrate
the change or why it was made. Keep the README terse.

**Do not touch `PV.VERSION`.** The release process owns it.

---

### Task 1: Flashes and pings stack

`createVision` holds one `flash` slot that every pick overwrites. It becomes a
list, so a second flash brightens its layer instead of killing the first.

**Files:**
- Modify: `js/vision.js`
- Modify: `js/game.js:319-331` (`samplePulse`)
- Modify: `js/render.js:246-257` (`drawPulse`)
- Modify: `js/hud.js:174-186` (chip sync)
- Modify: `test/torch-test.js`
- Create: `test/flash-test.js`

- [ ] **Step 1: Write the failing test**

Create `test/flash-test.js`:

```js
/* Flash-mode regression test — run with:  node test/flash-test.js
 *
 * Covers what a pick leaves behind: picks stack rather than replace, each one
 * fades on its own clock, and a round opens with the layers `initial` names.
 * All of it is timing-sensitive and invisible to a layout check.
 */
global.window = {};
var path = require('path');
['strings.js', 'maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
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

/* A round moved out of 'ready', with pellets frozen so nothing under test
 * depends on what Pac-Man wanders into and invuln held so a ghost cannot end
 * the round mid-measurement. */
function playing(difficulty) {
  var g = PV.createGame(difficulty || 'flash-normal', { persist: false });
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  return g;
}

/* Steps past the opening flashes and the 1.35s dots intro, so a pick under
 * test is the only thing lighting anything. */
function settled(difficulty) {
  var g = playing(difficulty);
  for (var i = 0; i < 400; i++) g.update(STEP);
  return g;
}

console.log('');
console.log('the flash curve');

(function () {
  var RULES = PV.DIFFICULTIES['flash-normal'];
  check('full through the hold', PV.flashAlpha(RULES.hold - 0.01, RULES) === 1);
  var mid = PV.flashAlpha(RULES.hold + RULES.fade / 2, RULES);
  check('eased at the fade midpoint', near(mid, 0.25, 0.001), mid);
  check('spent once the fade is done',
    PV.flashAlpha(RULES.hold + RULES.fade, RULES) === 0);
})();

console.log('');
console.log('picks stack');

(function () {
  var g = settled();
  check('the board is dark to start with',
    g.vision.alpha.walls === 0 && g.vision.alpha.dots === 0,
    g.vision.alpha.walls + ' / ' + g.vision.alpha.dots);

  check('a first pick lands', g.selectVision('walls') === 'ok');
  // Past the 1s cooldown, so a second pick is allowed while the first fades.
  for (var i = 0; i < 66; i++) g.update(STEP);

  var before = g.vision.alpha.walls;
  check('the first pick is still fading', before > 0 && before < 1, before);

  check('a second pick lands', g.selectVision('dots') === 'ok');
  g.update(STEP);

  check('the second pick does not kill the first',
    g.vision.alpha.walls > 0, g.vision.alpha.walls);
  check('the second pick lights its own layer',
    g.vision.alpha.dots === 1, g.vision.alpha.dots);
  check('the badge names the newest pick',
    g.vision.current() === 'dots', g.vision.current());
})();

console.log('');
console.log('each pick keeps its own clock');

(function () {
  var g = settled();
  var RULES = PV.DIFFICULTIES['flash-normal'];
  g.selectVision('walls');
  for (var i = 0; i < 66; i++) g.update(STEP);   // 1.1s, past the cooldown
  g.selectVision('walls');                        // the same layer again

  // Step until the first would have expired on its own.
  var n = Math.ceil((RULES.hold + RULES.fade) / STEP) - 66;
  for (var j = 0; j < n + 2; j++) g.update(STEP);
  check('the older pick expires while the newer one still burns',
    g.vision.alpha.walls > 0, g.vision.alpha.walls);

  for (var k = 0; k < 80; k++) g.update(STEP);
  check('the newer pick expires too', g.vision.alpha.walls === 0, g.vision.alpha.walls);
})();

console.log('');
console.log('pings stack');

(function () {
  var g = settled('torch-normal');
  check('a first ping lands', g.selectVision('walls') === 'ok');
  for (var i = 0; i < 66; i++) g.update(STEP);
  check('a second ping lands', g.selectVision('dots') === 'ok');
  g.update(STEP);

  var live = g.vision.pulses();
  check('both pings are running', live.length === 2, live.length);
  check('they are oldest first', live[0].age > live[1].age,
    live[0].age + ' / ' + live[1].age);
  check('each remembers its own layer',
    live[0].layer === 'walls' && live[1].layer === 'dots',
    live[0].layer + ' / ' + live[1].layer);

  check('flash reports no pings', PV.createGame('flash-normal').vision.pulses().length === 0);
  check('stare reports no pings', PV.createGame('stare-normal').vision.pulses().length === 0);
})();

console.log('');
console.log(failures === 0 ? 'ALL FLASH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/flash-test.js`
Expected: FAIL — `TypeError: PV.flashAlpha is not a function`, or once past that,
`g.vision.pulses is not a function`.

- [ ] **Step 3: Export the flash curve from `js/vision.js`**

Add after `PV.pulseAlpha` and its `pulseLife` helper (after line 36), before the
`SPAWN_CENTRE` block:

```js
  /* A Flash pick: full through the hold, then eased out on the same curve the
   * ping's tail uses, so the two cues read alike. */
  PV.flashAlpha = function (age, rules) {
    var f = (age - rules.hold) / rules.fade;
    if (f <= 0) return 1;
    if (f >= 1) return 0;
    return (1 - f) * (1 - f);
  };
```

- [ ] **Step 4: Turn the flash slot into a list in `js/vision.js`**

Add at module scope, beside `OLDER_PICK_ALPHA` (line 12):

```js
  var NO_PULSES = [];   // handed to the modes that have none, so callers can loop
```

Replace line 175 (`var flash = null;    // flash mode: { layer, age }`) with:

```js
    var flashes = [];    // flash and torch: live picks, oldest first
```

Add this helper immediately after `newFlash` (after line 178):

```js
    /* Ages every live pick and drops the spent ones. Walking backwards keeps
     * the indices valid as entries go. */
    function ageFlashes(dt, life) {
      for (var i = flashes.length - 1; i >= 0; i--) {
        flashes[i].age += dt;
        if (flashes[i].age > life) flashes.splice(i, 1);
      }
    }
```

Replace `current()` (lines 191-194) with:

```js
      /** The layer the HUD badge shows. */
      current: function () {
        if (rules.mode === 'stare') return stack[0] || null;
        return flashes.length ? flashes[flashes.length - 1].layer : null;
      },
```

Replace the `pulse()` block (lines 200-206) with:

```js
      /**
       * Torch mode's live pings, oldest first; an empty list in the other
       * modes. game.js fills each ping's `blips`, one entry per ghost that
       * ring has reached; render.js draws from them.
       * @returns {Array<{layer: string, age: number, x: number, y: number, blips: Array}>}
       */
      pulses: function () { return rules.mode === 'torch' ? flashes : NO_PULSES; },
```

Replace the `else` branch of `select()` (lines 225-227) with:

```js
        } else {
          flashes.push(newFlash(layer, origin));
        }
```

Replace the mode branches inside `update()` (lines 239-254) with:

```js
        if (rules.mode === 'torch') {
          // No layer alpha: the pings and the torch are spatial and are drawn
          // in board space by render.js.
          ageFlashes(dt, pulseLife(rules));
        } else if (rules.mode === 'flash') {
          ageFlashes(dt, rules.hold + rules.fade);
          // Brightest wins, so a new pick lifts its layer rather than
          // replacing whatever is still fading.
          flashes.forEach(function (f) {
            a[f.layer] = Math.max(a[f.layer], PV.flashAlpha(f.age, rules));
          });
        } else {
```

Replace the `flash =` assignment in `reset()` (lines 274-278) with:

```js
        // Flash and Torch start pitch black, so the round opens on the free
        // picks `initial` names, fired from the spawn.
        flashes = rules.mode === 'stare' ? [] : (rules.initial || [])
          .map(function (layer) { return newFlash(layer, null); });
```

- [ ] **Step 5: Loop the pings in `js/game.js`**

Replace `samplePulse` (lines 319-331). Keep the comment block above it (lines
313-318) as it is:

```js
    function samplePulse() {
      game.vision.pulses().forEach(function (p) {
        if (p.layer !== 'ghosts') return;
        var reach = p.age * PV.PULSE_SPEED;
        game.ghosts.forEach(function (g, i) {
          if (p.blips[i]) return;
          // wobble too: render.js draws the contact as the ghost's own
          // outline, and a frozen contact should be frozen mid-waddle.
          if (Math.hypot(g.x - p.x, g.y - p.y) <= reach) {
            p.blips[i] = { x: g.x, y: g.y, wobble: g.wobble };
          }
        });
      });
    }
```

- [ ] **Step 6: Loop the pings in `js/render.js`**

Replace `drawPulse` (lines 246-257):

```js
  function drawPulse(ctx, game) {
    var pulses = game.vision.pulses();
    if (!pulses.length) return;

    ctx.save();
    pulses.forEach(function (p) {
      // Under the layer, so it never sits over a contact.
      drawPulseFront(ctx, p);
      if (p.layer === 'walls') drawPulseWalls(ctx, game.maze, p, game.rules);
      else if (p.layer === 'dots') drawPulseDots(ctx, game.maze, p, game.rules);
      else if (p.layer === 'ghosts') drawPulseBlips(ctx, p, game.rules);
    });
    ctx.restore();
  }
```

- [ ] **Step 7: Loop the pings in `js/hud.js`**

Replace lines 178-186 (from `var shown =` to the end of the `forEach`):

```js
        var shown = game.visibleAlpha();
        var pulses = v.pulses();
        PV.LAYERS.forEach(function (layer) {
          var lit = shown[layer] > 0.001 || pulses.some(function (p) {
            return p.layer === layer;
          });
          if (lit === lastShown[layer]) return;
          lastShown[layer] = lit;
          chipEls[layer].classList.toggle('on', lit);
          chipEls[layer].setAttribute('aria-pressed', lit ? 'true' : 'false');
        });
```

- [ ] **Step 8: Run the new suite**

Run: `node test/flash-test.js`
Expected: PASS — `ALL FLASH CHECKS OK`

- [ ] **Step 9: Move `test/torch-test.js` onto `pulses()`**

Add this helper just below `playing()` (after line 40):

```js
/* The oldest live ping, or null. Every check here fires one ping at a time. */
function livePulse(g) {
  return g.vision.pulses()[0] || null;
}
```

Then replace each `pulse()` call:

- Line 81: `var p = g.vision.pulse();` → `var p = livePulse(g);`
- Line 102: `g.vision.pulse() !== null` → `livePulse(g) !== null`
- Lines 105-106:

```js
  check('the ping expires once the last element has faded',
    livePulse(g) === null, livePulse(g));
```

- Lines 108-109:

```js
  check('flash has no ping', PV.createGame('flash-normal').vision.pulses().length === 0);
  check('stare has no ping', PV.createGame('stare-normal').vision.pulses().length === 0);
```

- Line 123: `check('the ping is running', livePulse(g) !== null);`
- Line 140: `var p = livePulse(g);`
- Lines 173-174:

```js
  check('a walls ping records no blips',
    livePulse(h).blips.length === 0, livePulse(h).blips.length);
```

- [ ] **Step 10: Run the whole suite set**

Run:
```bash
node test/maze-test.js && node test/opening-test.js && node test/torch-test.js \
  && node test/attract-test.js && node test/modes-test.js && node test/flash-test.js
```
Expected: every suite ends `ALL ... OK` and exits 0.

- [ ] **Step 11: Commit**

```bash
git add js/vision.js js/game.js js/render.js js/hud.js test/torch-test.js test/flash-test.js
git commit -m "vision: Let picks stack instead of replacing each other"
```

---

### Task 2: A Flash round opens with You lit

`reset()` already seeds one flash per `initial` entry after Task 1. Flash's
`initial` gains `pacman`, so Blinkman is shown at the start along with the walls.

**Files:**
- Modify: `js/vision.js:107` (Flash's `base`)
- Modify: `test/flash-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/flash-test.js`, immediately before the final `console.log` /
`process.exit` pair:

```js
console.log('');
console.log('the opening reveal');

(function () {
  ['flash-normal', 'flash-hard'].forEach(function (id) {
    var g = PV.createGame(id, { persist: false });
    g.startRound();
    var a = g.vision.alpha;
    check(id + ' opens with the walls lit', a.walls === 1, a.walls);
    check(id + ' opens with you lit', a.pacman === 1, a.pacman);
  });

  // Easy draws you always, so the seeded pick changes nothing there.
  var easy = PV.createGame('flash-easy', { persist: false });
  easy.startRound();
  check('flash-easy still draws you', easy.vision.alpha.pacman === 1,
    easy.vision.alpha.pacman);

  // The opening reveal fades out like any other pick.
  var g = PV.createGame('flash-normal', { persist: false });
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  var RULES = PV.DIFFICULTIES['flash-normal'];
  for (var i = 0, n = Math.ceil((RULES.hold + RULES.fade) / STEP) + 2; i < n; i++) {
    g.update(STEP);
  }
  check('the opening reveal fades out', g.vision.alpha.pacman === 0,
    g.vision.alpha.pacman);

  // Stare's `initial` is its stack, and must not gain a pacman entry.
  check('stare seeds no pings', PV.DIFFICULTIES['stare-normal'].initial.join(',') === 'walls',
    PV.DIFFICULTIES['stare-normal'].initial.join(','));
  check('torch seeds only the walls', PV.DIFFICULTIES['torch-normal'].initial.join(',') === 'walls',
    PV.DIFFICULTIES['torch-normal'].initial.join(','));
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/flash-test.js`
Expected: FAIL — `flash-normal opens with you lit   got 0`

- [ ] **Step 3: Add `pacman` to Flash's opening**

In `js/vision.js`, replace the `flash.base` line (line 107):

```js
      // The round opens showing the board and where you are standing on it.
      base: { pool: LAYERS, freeSelf: false, keep: 1, initial: ['walls', 'pacman'] },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/flash-test.js`
Expected: PASS — `ALL FLASH CHECKS OK`

- [ ] **Step 5: Check the mode table test still holds**

`test/modes-test.js` pins `flash-normal`'s `initial` as the string `'walls'`.
Update that line (line 94) to match the new value:

```js
    cooldown: 1, ghostSpeed: 0.86, initial: 'walls,pacman', hold: 0.4, fade: 2.0
```

Run: `node test/modes-test.js`
Expected: PASS — `ALL GRID CHECKS OK`

- [ ] **Step 6: Commit**

```bash
git add js/vision.js test/flash-test.js test/modes-test.js
git commit -m "vision: Open a Flash round showing where you are"
```

---

### Task 3: House ghosts stop glowing through the dark

`PV.ghostReveal` gives a ghost in the house an alpha floor in every mode but
Torch. It goes, in all three modes.

**Files:**
- Modify: `js/entities.js:167-184`
- Modify: `js/render.js:513-522` (`drawGhosts`)
- Modify: `test/opening-test.js:143-169`
- Modify: `README.md`

- [ ] **Step 1: Delete the reveal block from `test/opening-test.js`**

Delete lines 143-169 in full — the `console.log('ghost-house reveal')` pair and
the IIFE beneath it. Nothing replaces it here; Task 2 already covers what a
round opens with.

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/opening-test.js`
Expected: PASS (the suite no longer exercises `ghostReveal`). This step is
removing coverage of behaviour being deleted, so there is no red phase — the
red phase is Step 3's assertion.

- [ ] **Step 3: Write the failing test**

Append to `test/flash-test.js`, immediately before the final `console.log` /
`process.exit` pair:

```js
console.log('');
console.log('the house stays dark');

(function () {
  // A ghost in the house is drawn on the ghosts layer alone. Nothing lifts it
  // above what the mode is showing, in any mode.
  check('nothing reveals the house', PV.ghostReveal === undefined, PV.ghostReveal);

  var g = settled('flash-normal');
  var housed = g.ghosts.filter(function (gh) { return gh.state === 'house'; });
  check('someone is still in the house', housed.length > 0, housed.length);
  check('the ghosts layer is dark', g.vision.alpha.ghosts === 0, g.vision.alpha.ghosts);
})();
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node test/flash-test.js`
Expected: FAIL — `nothing reveals the house   got function ...`

- [ ] **Step 5: Delete the reveal from `js/entities.js`**

Delete lines 167-184 — `EXIT_Y`, `DOOR_Y`, `IN_HOUSE`, the comment above
`PV.ghostReveal`, and the function itself — then put `EXIT_Y` back on its own,
because `updateGhost` reads it at line 243 to lift a ghost out of the house:

```js
  var EXIT_Y = PV.center(PV.SPAWN.outside.row);
```

Confirm nothing else was using the deleted names:

```bash
grep -rn "ghostReveal\|DOOR_Y\|IN_HOUSE" js/ test/
```
Expected: no output.

- [ ] **Step 6: Drop the alpha floor from `js/render.js`**

Replace lines 517-522 (the head of the `forEach` in `drawGhosts`, from
`game.ghosts.forEach` through the `if (a <= 0.001) return;`):

```js
    game.ghosts.forEach(function (g) {
      var a = Math.max(alpha, torch ? torchGhostAlpha(g, game.maze, torch) : 0);
      if (a <= 0.001) return;
```

- [ ] **Step 7: Run the tests**

Run: `node test/flash-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three pass.

- [ ] **Step 8: Update the README**

In `README.md`, in the paragraph starting `A round opens the same way in every
mode.`, delete the two sentences beginning `A ghost inside the house is visible`
and ending `something you walk up to or ping for.` The paragraph becomes:

```
A round opens the same way in every mode. The dots blink three times and then
obey the layer, and all four ghosts start in the house and file out one at a
time over the first several seconds. Pac-Man starts Blinky outside the house;
keeping all four in makes the count readable, which matters more here than the
pedigree.
```

In the same file, in the test-suite paragraph, the second suite no longer covers
the house reveal. Change `the ghost release ladder, the house reveal, the dots
blink` to `the ghost release ladder, the dots blink`.

- [ ] **Step 9: Commit**

```bash
git add js/entities.js js/render.js test/opening-test.js test/flash-test.js README.md
git commit -m "render: Keep the ghost house dark in every mode"
```

---

### Task 4: Torch Hard has no cone

**Files:**
- Modify: `js/vision.js:100-103` (Torch Hard's level)
- Modify: `js/render.js:366-372` (`torchReach`), `js/render.js:429-445` (`torchSpill`)
- Modify: `js/strings.js:109-112`
- Modify: `test/torch-test.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

In `test/torch-test.js`, append this block inside the `the torch ladder` IIFE,
just before its closing `})();` (after line 309):

```js
  // Hard is a bare pool of light: no cone, so nothing reaches past the disc.
  check('hard has no cone at all',
    hard.coneLen === 0 && hard.coneHalf === 0,
    hard.coneLen + ' / ' + hard.coneHalf);

  var P = {
    radius: hard.torchRadius, coneLen: hard.coneLen,
    coneHalf: hard.coneHalf, soft: PV.TORCH_SOFT
  };
  check('hard lights every direction the same',
    PV.torchAlpha(hard.torchRadius - 20, 0, PV.DIRS.right, P) ===
    PV.torchAlpha(-(hard.torchRadius - 20), 0, PV.DIRS.right, P));
  check('hard lights nothing past its own radius',
    PV.torchAlpha(hard.torchRadius + 1, 0, PV.DIRS.right, P) === 0,
    PV.torchAlpha(hard.torchRadius + 1, 0, PV.DIRS.right, P));
```

Then add a whole new block after the `the torch ladder` IIFE, before the final
`console.log` / `process.exit` pair:

```js
console.log('');
console.log('a coneless torch still reaches');

/* render.js caps every ray at the cone's length and treats an on-axis ray as
 * cone-lit. Both collapse a torch with no cone unless they fall back to the
 * disc, and neither is visible to torchAlpha. */
(function () {
  var openMaze = { isWall: function () { return false; } };
  var hard = PV.DIFFICULTIES['torch-hard'];
  var torch = {
    x: PV.center(14), y: PV.center(23),
    radius: hard.torchRadius, coneLen: hard.coneLen, coneHalf: hard.coneHalf,
    soft: PV.TORCH_SOFT, dir: PV.DIRS.right
  };

  var reach = PV.torchSpill(torch, openMaze);
  var min = Infinity, max = 0;
  for (var i = 0; i < reach.length; i++) {
    if (reach[i] < min) min = reach[i];
    if (reach[i] > max) max = reach[i];
  }
  check('every ray reaches the disc edge in open space',
    near(min, hard.torchRadius, 0.001) && near(max, hard.torchRadius, 0.001),
    min + ' .. ' + max);
})();
```

`PV.torchSpill` does not exist yet as an export — Step 4 adds it.

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/torch-test.js`
Expected: FAIL — `hard has no cone at all   got 96 / 0.5235987755982988`

- [ ] **Step 3: Retune Torch Hard in `js/vision.js`**

Replace lines 100-103:

```js
        hard: {
          // No cone: a bare pool of light, wider than Normal's to pay for it.
          torchRadius: 44, coneLen: 0, coneHalf: 0,
          hold: 0.15, fade: 0.7, cooldown: 2.0, ghostSpeed: 1.00
        }
```

- [ ] **Step 4: Fix the two coneless collapses in `js/render.js`**

Replace `torchReach` (lines 366-372):

```js
  /* How far the light reaches at this absolute angle: the cone's length
   * within the cone, the disc's radius everywhere else. Their union is the
   * lit shape before any wall gets in the way. A torch with no cone is the
   * disc alone — without the first line an exactly-forward ray matches
   * `coneHalf: 0` and reports a reach of zero, notching the lit shape. */
  function torchReach(ang, torch) {
    if (torch.coneLen <= 0) return torch.radius;
    var off = ang - Math.atan2(torch.dir.y, torch.dir.x);
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    return Math.abs(off) <= torch.coneHalf ? torch.coneLen : torch.radius;
  }
```

Replace the body of `torchSpill` (lines 429-445) with a version that caps rays
at the furthest the light can go in any direction, and split the per-frame
easing from the geometry so a test can drive the geometry on its own:

```js
  /* The furthest the light can go in any direction: the cone where there is
   * one, the disc otherwise. Capping at the cone alone collapses a coneless
   * torch to nothing. */
  function torchFar(torch) {
    return Math.max(torch.coneLen, torch.radius);
  }

  /* Each ray's length against the walls, with no easing — the shape the light
   * would take if it arrived all at once. */
  PV.torchSpill = function (torch, maze) {
    var far = torchFar(torch);
    var want = new Array(TORCH_RAYS);
    for (var i = 0; i < TORCH_RAYS; i++) {
      var ang = i / TORCH_RAYS * Math.PI * 2;
      var wall = torchRay(torch.x, torch.y, ang, far, maze);
      want[i] = Math.min(torchReach(ang, torch), wall);
    }
    return want;
  };

  /* Each ray's length, eased from where it was last frame. Easing is what
   * keeps a corridor from arriving all at once the instant he clears a
   * corner — the light runs down it instead. The clamp to the wall is not
   * optional: without it a lagging ray would sit inside a wall he has just
   * walked up to, and light would show through it. A jump too big to be a
   * step (the tunnel) skips the easing rather than sweeping the board. */
  function torchEase(mem, torch, maze, dt) {
    var reach = mem.reach;
    var cut = reach === null || Math.hypot(torch.x - mem.x, torch.y - mem.y) > TORCH_JUMP;
    if (reach === null) reach = mem.reach = new Array(TORCH_RAYS);

    var far = torchFar(torch);
    var step = TORCH_SPILL * dt;
    for (var i = 0; i < TORCH_RAYS; i++) {
      var ang = i / TORCH_RAYS * Math.PI * 2;
      var wall = torchRay(torch.x, torch.y, ang, far, maze);
      var want = Math.min(torchReach(ang, torch), wall);
      reach[i] = Math.min(cut ? want : approach(reach[i], want, step), wall);
    }

    mem.x = torch.x;
    mem.y = torch.y;
    return reach;
  }
```

Update the one caller, in `renderer.draw` (line 159):

```js
          reach = torchEase(torchMemory, torch, game.maze, dt);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: PASS — `ALL TORCH CHECKS OK`

- [ ] **Step 6: Rewrite Torch Hard's copy in `js/strings.js`**

Replace lines 109-112. `blurb` goes away entirely in Task 9, so only `menu`
remains here — but Task 9 has not run yet, so keep the key and give it wording
that matches:

```js
          hard: {
            blurb: 'No cone, just the light you stand in',
            menu: '<b>No cone.</b> Only the light you stand in &middot; 2s cooldown'
          }
```

- [ ] **Step 7: Verify the copy rules still hold**

Run: `node test/modes-test.js`
Expected: PASS — the `menu has one bold run` check covers the new line.

- [ ] **Step 8: Update the README**

In the `What a press does` table, replace the Torch row — the cone is no longer
universal:

```
| Torch | A lit circle travels with you, and on Easy and Normal a forward cone too, both stopping at walls. A press pings one layer outward from where you stood, through walls. |
```

In the difficulty grid, replace the Torch Hard cell:

```
| Torch | A wide cone that reaches, 1s | A 6-tile cone, 1s | No cone, just the light you stand in, 2s |
```

- [ ] **Step 9: Commit**

```bash
git add js/vision.js js/render.js js/strings.js test/torch-test.js README.md
git commit -m "torch: Strip the cone off Hard"
```

---

### Task 5: Torch Easy's pings track

A blip freezes where the ring found the ghost. On Easy it keeps following the
ghost while it is lit, fading on the schedule it was found on.

**Files:**
- Modify: `js/vision.js:90-93` (Torch Easy's level)
- Modify: `js/game.js` (`samplePulse`)
- Modify: `js/render.js:320-337` (`drawPulseBlips`)
- Modify: `js/strings.js:104-107`
- Modify: `test/torch-test.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

In `test/torch-test.js`, append a block after the `ghost blips` IIFE and before
`console.log('line of sight')`:

```js
console.log('');
console.log('tracked blips');

(function () {
  var g = PV.createGame('torch-easy');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a ghost ping opens', g.selectVision('ghosts') === 'ok');

  var p = livePulse(g);
  var ghost = g.ghosts[0];
  for (var f = 0; f < 60 && !p.blips[0]; f++) g.update(STEP);
  check('the ring reaches it', !!p.blips[0]);

  var dist = p.blips[0].dist;
  check('the contact distance is recorded', dist > 0, dist);

  var at = { x: p.blips[0].x, y: p.blips[0].y };
  for (var k = 0; k < 20; k++) g.update(STEP);

  check('the ghost moved on', Math.hypot(ghost.x - at.x, ghost.y - at.y) > 4,
    Math.hypot(ghost.x - at.x, ghost.y - at.y).toFixed(1));
  check('the blip followed it',
    near(p.blips[0].x, ghost.x, 0.001) && near(p.blips[0].y, ghost.y, 0.001),
    p.blips[0].x + ',' + p.blips[0].y);
  check('the blip keeps waddling', p.blips[0].wobble === ghost.wobble,
    p.blips[0].wobble);
  check('the fade still runs off the contact distance',
    p.blips[0].dist === dist, p.blips[0].dist);

  // Normal and Hard leave a contact where they found it.
  check('normal does not track', !PV.DIFFICULTIES['torch-normal'].pingTracks);
  check('hard does not track', !PV.DIFFICULTIES['torch-hard'].pingTracks);
  check('easy tracks', PV.DIFFICULTIES['torch-easy'].pingTracks === true);
})();
```

In the existing `ghost blips` IIFE, the frozen-contact checks now also need
`dist`. After line 155 (`var frozen = ...`), add:

```js
  check('the contact records the distance the ring found it at',
    near(p.blips[0].dist,
      Math.hypot(frozen.x - p.x, frozen.y - p.y), 0.001), p.blips[0].dist);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/torch-test.js`
Expected: FAIL — `the contact distance is recorded   got undefined`

- [ ] **Step 3: Add the flag in `js/vision.js`**

Replace Torch Easy's level (lines 90-93):

```js
        easy: {
          torchRadius: 60, coneLen: 150, coneHalf: Math.PI / 3,
          hold: 0.35, fade: 1.8, cooldown: 1.0, ghostSpeed: 0.78,
          // A contact keeps following its ghost for as long as it is lit.
          pingTracks: true
        },
```

- [ ] **Step 4: Record the distance and follow the ghost in `js/game.js`**

Replace `samplePulse` and the comment block above it (lines 313-331):

```js
    /* Torch mode: a ghost blips where the expanding ring first reaches it.
     * `dist` is the distance it was found at and clocks the blip's fade —
     * plain distance, not the tunnel-wrapped one checkCollisions uses, since
     * the ring is drawn as a circle in board space and a wrapped distance
     * would light a blip before the visible ring arrived. Under `pingTracks`
     * the contact then follows its ghost, fading to the schedule it was found
     * on rather than to wherever the ghost has wandered. Every ghost is
     * sampled whatever its state: the ping reports where things are, and eaten
     * ghosts show as eyes in every mode. */
    function samplePulse() {
      game.vision.pulses().forEach(function (p) {
        if (p.layer !== 'ghosts') return;
        var reach = p.age * PV.PULSE_SPEED;
        game.ghosts.forEach(function (g, i) {
          var blip = p.blips[i];
          if (blip) {
            // wobble too: render.js draws the contact as the ghost's own
            // outline, and a still contact should be still mid-waddle.
            if (rules.pingTracks) {
              blip.x = g.x;
              blip.y = g.y;
              blip.wobble = g.wobble;
            }
            return;
          }
          var d = Math.hypot(g.x - p.x, g.y - p.y);
          if (d <= reach) {
            p.blips[i] = { x: g.x, y: g.y, wobble: g.wobble, dist: d };
          }
        });
      });
    }
```

- [ ] **Step 5: Read the recorded distance in `js/render.js`**

In `drawPulseBlips`, replace lines 321-322:

```js
    p.blips.forEach(function (b) {
      var a = PV.pulseAlpha(b.dist, p.age, rules);
```

and replace line 324 (`var edge = justReached(d, p.age);`):

```js
      var edge = justReached(b.dist, p.age);
```

Update the comment above the function (lines 316-319) to match:

```js
  /* A contact is the ghost's own outline, so there is no doubt what the ring
   * found. `dist` is where the ring found it and clocks the fade, whether or
   * not the contact has since followed the ghost. blips is sparse, indexed by
   * ghost, and forEach skips the holes. */
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: PASS — `ALL TORCH CHECKS OK`

- [ ] **Step 7: Rewrite Torch Easy's copy in `js/strings.js`**

Replace lines 104-107:

```js
          easy: {
            blurb: 'A wide cone, and pings that follow',
            menu: 'A wide cone, and a ping that <b>follows them</b> &middot; 1s cooldown'
          },
```

- [ ] **Step 8: Update the README**

In the difficulty grid, replace the Torch Easy cell (the row is otherwise as
Task 4 left it):

```
| Torch | A wide cone, and pings that follow, 1s | A 6-tile cone, 1s | No cone, just the light you stand in, 2s |
```

- [ ] **Step 9: Run everything and commit**

Run:
```bash
node test/maze-test.js && node test/opening-test.js && node test/torch-test.js \
  && node test/attract-test.js && node test/modes-test.js && node test/flash-test.js
```
Expected: all six pass.

```bash
git add js/vision.js js/game.js js/render.js js/strings.js test/torch-test.js README.md
git commit -m "torch: Keep an Easy ping's contacts on their ghosts"
```

---

### Task 6: The board aura

A glow at the board edge reporting the round's state: white while a fright runs,
blinking as it ends, one yellow pulse when it expires, red when a life is lost.

**Files:**
- Create: `js/aura.js`
- Create: `test/aura-test.js`
- Modify: `js/render.js` (`createRenderer`, `renderer.draw`)
- Modify: `index.html:134` (script order)
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

Create `test/aura-test.js`:

```js
/* Board-aura regression test — run with:  node test/aura-test.js
 *
 * Covers the glow at the board edge: the white breath while a fright runs, the
 * blink that quickens as it ends, the yellow pulse that closes it, and the red
 * a lost life overrides both with. The schedule is timing-sensitive and
 * invisible to a layout check. draw() needs a canvas and is not covered here.
 */
global.window = {};
var path = require('path');
['maze.js', 'entities.js', 'vision.js', 'game.js', 'render.js', 'aura.js']
  .forEach(function (f) { require(path.join(__dirname, '..', 'js', f)); });
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

var STEP = 1 / 60;
var TINTS = PV.AURA_TINTS;

/* The aura reads four fields off a round and nothing else, so a plain object
 * drives it more directly than a real game would. */
function round(over) {
  var g = { state: 'playing', frightTimer: 0, time: 0, stateTime: 0 };
  Object.keys(over || {}).forEach(function (k) { g[k] = over[k]; });
  return g;
}

console.log('');
console.log('nothing to report');

(function () {
  var a = PV.createAura();
  a.update(round(), STEP);
  check('a quiet round draws no aura', a.tint === null, a.tint);
  check('and sits at zero', a.level === 0, a.level);
})();

console.log('');
console.log('a fright running');

(function () {
  var a = PV.createAura();
  var g = round({ frightTimer: 7 });
  var seen = [];
  for (var i = 0; i < 120; i++) {
    g.time += STEP;
    a.update(g, STEP);
    seen.push(a.level);
  }
  check('the aura is white', a.tint === TINTS.white, a.tint);

  var low = Math.min.apply(null, seen), high = Math.max.apply(null, seen);
  check('it stays lit throughout', low > 0, low);
  check('it breathes rather than holding still', high - low > 0.2,
    (high - low).toFixed(3));
  check('it never reaches full', high < 1, high);
})();

console.log('');
console.log('a fright ending');

/* Counts how many times the level changes direction over a window — the blink
 * quickening means more transitions in the second half than the first. */
function transitions(from, to) {
  var a = PV.createAura();
  var g = round({ frightTimer: from, time: 0 });
  var last = null, count = 0;
  while (g.frightTimer > to) {
    g.frightTimer -= STEP;
    g.time += STEP;
    a.update(g, STEP);
    if (last !== null && a.level !== last) count++;
    last = a.level;
  }
  return count;
}

(function () {
  var a = PV.createAura();
  a.update(round({ frightTimer: 1.5 }), STEP);
  check('the aura is still white as it ends', a.tint === TINTS.white, a.tint);

  var early = transitions(2, 1);
  var late = transitions(1, 0.05);
  check('the blink quickens as the time runs out', late > early,
    early + ' then ' + late);
  check('the early half blinks at all', early > 0, early);
})();

console.log('');
console.log('the closing pulse');

(function () {
  var a = PV.createAura();
  var g = round({ frightTimer: STEP / 2 });
  a.update(g, STEP);
  g.frightTimer = 0;
  a.update(g, STEP);

  check('a spent fright closes on yellow', a.tint === TINTS.yellow, a.tint);
  check('the pulse opens near full', a.level > 0.8, a.level);

  var first = a.level;
  for (var i = 0; i < 10; i++) a.update(g, STEP);
  check('and decays', a.level < first, a.level);

  for (var j = 0; j < 60; j++) a.update(g, STEP);
  check('until there is nothing left', a.tint === null && a.level === 0,
    a.tint + ' / ' + a.level);
})();

console.log('');
console.log('a round reset is not a spent fright');

(function () {
  // resetActors() zeroes frightTimer, but never while the state is 'playing'.
  var a = PV.createAura();
  var g = round({ frightTimer: 7 });
  a.update(g, STEP);
  g.frightTimer = 0;
  g.state = 'ready';
  a.update(g, STEP);
  check('no pulse fires on a reset', a.tint === null, a.tint);
})();

console.log('');
console.log('a life lost');

(function () {
  var a = PV.createAura();
  // Caught mid-fright: red takes over and the closing pulse never fires.
  var g = round({ frightTimer: 7 });
  a.update(g, STEP);
  g.frightTimer = 0;
  g.state = 'dying';
  g.stateTime = 0;
  a.update(g, STEP);

  check('the aura turns red', a.tint === TINTS.red, a.tint);
  check('and opens full', a.level === 1, a.level);

  // Held through the reveal beat, then fading with the death animation.
  g.stateTime = PV.DEATH_REVEAL;
  a.update(g, STEP);
  check('still full at the end of the reveal', a.level === 1, a.level);

  g.stateTime = PV.DEATH_REVEAL + PV.DEATH_ANIM / 2;
  a.update(g, STEP);
  check('half gone halfway through the animation', a.level > 0 && a.level < 1, a.level);

  g.stateTime = PV.DEATH_REVEAL + PV.DEATH_ANIM;
  a.update(g, STEP);
  check('spent when the animation is', a.level === 0, a.level);

  // Back on the board, with no yellow owed from the fright it interrupted.
  g.state = 'playing';
  a.update(g, STEP);
  check('no pulse is owed afterwards', a.tint === null, a.tint);
})();

console.log('');
console.log(failures === 0 ? 'ALL AURA CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/aura-test.js`
Expected: FAIL — `Cannot find module '.../js/aura.js'`

- [ ] **Step 3: Write `js/aura.js`**

```js
/* aura.js — the glow at the board's edge, reporting the round rather than the
 * board: a fright running, a fright about to end, and a life lost. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var BAND = 34;   // px the glow reaches in from the rim

  /* Yellow and red are the ones Blinkman and the culprit ring are already
   * drawn in, so the aura reads as the same cast. */
  var TINTS = {
    white: '255,255,255',
    yellow: '255,210,63',
    red: '255,77,109'
  };
  PV.AURA_TINTS = TINTS;
  PV.AURA_BAND = BAND;

  // A fright running: a slow breath between two levels.
  var BREATH_HZ = 1.2, BREATH_LOW = 0.35, BREATH_HIGH = 0.75;

  /* The last stretch of a fright: a blink that quickens. ENDING matches the
   * window render.js already flashes the ghosts white over, so the two cues
   * open together. */
  var ENDING = 2;
  var BLINK_SLOW = 4, BLINK_FAST = 9;   // Hz at the start and end of it
  var BLINK_OFF = 0.14;                 // the dim half of the blink

  var YELLOW_TIME = 0.5;   // the pulse that closes a spent fright
  var CALM = 0.5;          // the steady stand-in for breath and blink

  /* Where the breath sits between its two levels, and where the blink is in
   * its accelerating cycle. The blink's phase is the integral of a rate
   * ramping from BLINK_SLOW to BLINK_FAST, so it speeds up smoothly instead
   * of jumping every frame the rate changes. */
  function frightLevel(left, time) {
    if (PV.wantsCalm()) return CALM;
    if (left >= ENDING) {
      var breath = 0.5 + 0.5 * Math.sin(time * BREATH_HZ * Math.PI * 2);
      return BREATH_LOW + (BREATH_HIGH - BREATH_LOW) * breath;
    }
    var t = ENDING - left;
    var phase = BLINK_SLOW * t + (BLINK_FAST - BLINK_SLOW) * t * t / (2 * ENDING);
    return Math.floor(phase * 2) % 2 === 0 ? BREATH_HIGH : BLINK_OFF;
  }

  /* Full through the reveal beat so the collision reads, then fading with the
   * death animation. */
  function deathLevel(stateTime) {
    var t = (stateTime - PV.DEATH_REVEAL) / PV.DEATH_ANIM;
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    var fade = 1 - t;
    return PV.wantsCalm() ? fade : fade * (0.78 + 0.22 * Math.sin(stateTime * 18));
  }

  /**
   * The aura for one session. `tint` is null when there is nothing to draw;
   * `level` is 0..1 and is the peak alpha at the rim.
   */
  PV.createAura = function () {
    var pulse = 0;         // seconds left of the closing yellow
    var wasFright = false;

    var aura = {
      tint: null,
      level: 0,

      update: function (game, dt) {
        pulse = Math.max(0, pulse - dt);

        /* A life lost outranks the fright it interrupted, and takes the
         * closing pulse with it: the round ending is the news now. */
        if (game.state === 'dying') {
          wasFright = false;
          pulse = 0;
          aura.tint = TINTS.red;
          aura.level = deathLevel(game.stateTime);
          return;
        }

        var fright = game.frightTimer > 0;
        /* The pulse fires on the frame a fright runs out mid-play. A round
         * reset zeroes the same timer, but never while state is 'playing'. */
        if (wasFright && !fright && game.state === 'playing') pulse = YELLOW_TIME;
        wasFright = fright;

        if (fright) {
          aura.tint = TINTS.white;
          aura.level = frightLevel(game.frightTimer, game.time);
          return;
        }

        if (pulse > 0) {
          var t = pulse / YELLOW_TIME;
          aura.tint = TINTS.yellow;
          aura.level = t * t;   // straight to full, then eased away
          return;
        }

        aura.tint = null;
        aura.level = 0;
      },

      /* Four bands, one per edge, each fading from the rim inward. Composited
       * `lighter` so where two meet — the corners — they add rather than one
       * covering the other. */
      draw: function (ctx) {
        if (!aura.tint || aura.level <= 0.001) return;
        var W = PV.WIDTH, H = PV.HEIGHT, b = BAND;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        band(ctx, 0, 0, 0, b, 0, 0, W, b);            // top, fading down
        band(ctx, 0, H, 0, H - b, 0, H - b, W, b);    // bottom, fading up
        band(ctx, 0, 0, b, 0, 0, 0, b, H);            // left, fading right
        band(ctx, W, 0, W - b, 0, W - b, 0, b, H);    // right, fading left
        ctx.restore();
      }
    };

    /* One edge: a gradient from (x0,y0) to (x1,y1), painted over the rect at
     * (rx,ry) sized rw by rh. */
    function band(ctx, x0, y0, x1, y1, rx, ry, rw, rh) {
      var grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(' + aura.tint + ',' + aura.level.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + aura.tint + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rw, rh);
    }

    return aura;
  };

})(window.PV);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/aura-test.js`
Expected: PASS — `ALL AURA CHECKS OK`

- [ ] **Step 5: Draw it from `js/render.js`**

In `createRenderer`, after the `torchMemory` declaration (line 125), add:

```js
    var aura = PV.createAura();
```

In `renderer.draw`, replace the tail of the function — the two lines
`drawFloatingScores(ctx, game);` and `ctx.restore();` (lines 187-188):

```js
        drawFloatingScores(ctx, game);
        ctx.restore();

        // Outside the shake: a band pinned to the board's edge must not slide
        // off it.
        aura.update(game, dt);
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        aura.draw(ctx);
        ctx.restore();
```

- [ ] **Step 6: Load it in `index.html`**

Add the tag after `js/render.js` (line 134) — `aura.js` calls `PV.wantsCalm`,
which `render.js` defines:

```html
<script src="js/render.js"></script>
<script src="js/aura.js"></script>
```

Update the load-order comment above the script block (lines 126-128) to name it:

```html
<!-- maze.js first of the game files: entities, render and game read PV.TILE at
     load time, and attract reads PV.DIRS and the grid size. aura.js comes after
     render.js, whose PV.wantsCalm it reads. main.js last — it starts the
     loop. -->
```

- [ ] **Step 7: Check it in the browser**

Run: `python3 -m http.server 8000` from the repo root, open
`http://localhost:8000/`, start a Stare Normal round and eat a power pellet.

Expected: a white glow breathes at the board edge, blinks faster over the last
two seconds, and closes on a single yellow pulse. Getting caught turns it red.

- [ ] **Step 8: Update the README**

In the `Modes` section, after the paragraph beginning `Death is the one
exception`, add:

```
A power pellet lights the board's edge white, breathing while it lasts and
blinking faster as it runs out, then closing on one yellow pulse. A life lost
turns the same edge red.
```

- [ ] **Step 9: Commit**

```bash
git add js/aura.js js/render.js index.html test/aura-test.js README.md
git commit -m "aura: Light the board edge for a fright and a death"
```

---

### Task 7: READY waits for the player

The round starts itself after 1.8s regardless of what the player does. It stops
doing that.

**Files:**
- Modify: `js/game.js:198-202`
- Modify: `test/opening-test.js`

- [ ] **Step 1: Rework the ready checks in `test/opening-test.js`**

Add a helper below `newGame()` (after line 42):

```js
/* The same, moved out of 'ready'. Nothing else does it: a round waits on the
 * player for as long as it takes. */
function playing(difficulty) {
  var g = newGame(difficulty);
  g.steer(PV.DIRS.left);
  return g;
}
```

Replace the `stateTime baseline` IIFE (lines 47-59):

```js
(function () {
  var g = newGame();
  for (var i = 0; i < 60 * 10; i++) g.update(STEP);
  check('ready waits for the player, however long it takes',
    g.state === 'ready', g.state);

  var h = newGame();
  h.update(STEP);
  h.update(STEP);
  h.steer(PV.DIRS.left);
  check('zero when steering out of ready',
    h.state === 'playing' && h.stateTime === 0, h.state + '/' + h.stateTime);
})();
```

In the `ghost release ladder` IIFE, replace line 85 (`var start = newGame();`)
with `var start = playing();`, and line 98 (`var g = newGame();`) with
`var g = playing();`.

In the `respawn through the house` IIFE, replace lines 121-122:

```js
  var g = playing();
```

(deleting the `for` loop that spun out of `ready`).

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/opening-test.js`
Expected: FAIL — `ready waits for the player, however long it takes   got playing`

- [ ] **Step 3: Delete the auto-start in `js/game.js`**

Replace lines 198-203:

```js
      if (game.state === 'ready') {
        // Returning before vision.update() freezes the cooldown and the
        // opening picks while the board is still behind the curtain. steer()
        // is the only way out of here.
        return;
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/opening-test.js`
Expected: PASS — `ALL OPENING CUES OK`

- [ ] **Step 5: Check nothing else relied on the auto-start**

Run: `node test/attract-test.js && node test/modes-test.js && node test/torch-test.js && node test/flash-test.js`
Expected: all four pass. The attract demo steers on its first frame in `ready`,
and the other three suites steer by hand.

- [ ] **Step 6: Update the README**

In the `Modes` section, after the paragraph beginning `A round opens the same
way in every mode.`, add:

```
The round holds on READY until you move.
```

- [ ] **Step 7: Commit**

```bash
git add js/game.js test/opening-test.js README.md
git commit -m "game: Hold READY until the player moves"
```

---

### Task 8: READY shows the maze

**Files:**
- Modify: `js/game.js:164-173` (`visibleAlpha`)
- Modify: `test/flash-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/flash-test.js`, before the final `console.log` /
`process.exit` pair:

```js
console.log('');
console.log('the maze on READY');

(function () {
  // The one moment to study the maze, so every mode shows it dimly.
  ['stare-hard', 'torch-hard', 'flash-hard'].forEach(function (id) {
    var g = PV.createGame(id, { persist: false });
    g.startRound();
    g.update(STEP);
    check(id + ' shows the walls on ready', g.visibleAlpha().walls >= 0.55,
      g.visibleAlpha().walls);
  });

  // And it drops back to the mode's own rules the moment you move.
  var g = PV.createGame('torch-hard', { persist: false });
  g.startRound();
  g.steer(PV.DIRS.left);
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  for (var i = 0; i < 400; i++) g.update(STEP);
  check('torch-hard goes dark once you move', g.visibleAlpha().walls === 0,
    g.visibleAlpha().walls);

  // A pick brighter than the floor is not dimmed by it.
  var s = PV.createGame('stare-normal', { persist: false });
  s.startRound();
  s.update(STEP);
  check('a lit layer is not dimmed to the floor', s.visibleAlpha().walls === 1,
    s.visibleAlpha().walls);
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node test/flash-test.js`
Expected: FAIL — `torch-hard shows the walls on ready   got 0`

- [ ] **Step 3: Add the floor in `js/game.js`**

Add beside the other round constants, after `DEATH_ANIM` (line 26):

```js
    // How much of the maze READY shows, whatever the mode would.
    var READY_WALLS = 0.55;
```

Place it at module scope alongside `DEATH_REVEAL` and `DEATH_ANIM` rather than
inside `createGame` — replace lines 22-26 with:

```js
  // Seconds the killer is held in view before the death animation starts.
  var DEATH_REVEAL = 0.6;
  var DEATH_ANIM = 1.15;
  PV.DEATH_REVEAL = DEATH_REVEAL;   // render.js times the death animation off these
  PV.DEATH_ANIM = DEATH_ANIM;

  // How much of the maze READY shows, whatever the mode would.
  var READY_WALLS = 0.55;
```

Replace `visibleAlpha` (lines 164-173):

```js
    /**
     * The player's chosen layers, with two exceptions. READY floors the walls,
     * since it is the one moment to study the maze. Dying forces ghosts and
     * Pac-Man on. Renderer and HUD both read this, so the layer chips stay
     * honest about what's on screen.
     */
    game.visibleAlpha = function () {
      var a = game.vision.alpha;
      if (game.state === 'ready') {
        return {
          dots: a.dots, walls: Math.max(a.walls, READY_WALLS),
          ghosts: a.ghosts, pacman: a.pacman
        };
      }
      if (game.state !== 'dying') return a;
      return { dots: a.dots, walls: a.walls, ghosts: 1, pacman: 1 };
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/flash-test.js`
Expected: PASS — `ALL FLASH CHECKS OK`

- [ ] **Step 5: Check the browser**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`, start a Torch
Hard round.

Expected: the whole maze is visible dimly behind the READY panel, and goes dark
except for the torch the moment you press a direction.

- [ ] **Step 6: Update the README**

Extend the sentence added in Task 7 so the pair reads as one fact:

```
The round holds on READY until you move, with the maze up dimly in every mode
— the one chance to study it.
```

- [ ] **Step 7: Commit**

```bash
git add js/game.js test/flash-test.js README.md
git commit -m "game: Show the maze dimly while READY holds"
```

---

### Task 9: READY says less

The overlay carries the mode, the level, the level's blurb and the maze number.
It keeps the mode and level.

**Files:**
- Modify: `js/strings.js` (`readyHint`, the nine `blurb` keys, `PV.levelBlurb`)
- Modify: `js/main.js:144-184` (`syncOverlay`)
- Modify: `test/modes-test.js:115`

- [ ] **Step 1: Drop the blurb check from `test/modes-test.js`**

Delete line 115:

```js
  check(id + ' has a blurb', (PV.levelBlurb(id) || '').length > 0, PV.levelBlurb(id));
```

- [ ] **Step 2: Write the failing test**

Append to `test/modes-test.js`, immediately before the `best-score migration`
block:

```js
console.log('');
console.log('READY carries no blurb');

/* The overlay names the mode and the level and nothing else, so the per-level
 * blurbs and the accessor that read them are gone. */
check('no levelBlurb accessor', PV.levelBlurb === undefined, PV.levelBlurb);

IDS.forEach(function (id) {
  var r = PV.DIFFICULTIES[id];
  check(id + ' has no blurb',
    PV.TEXT.modes[r.mode].levels[r.level].blurb === undefined,
    PV.TEXT.modes[r.mode].levels[r.level].blurb);
});

check('the ready hint names no maze',
  PV.TEXT.overlay.readyHint.indexOf('%MAZE%') === -1, PV.TEXT.overlay.readyHint);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node test/modes-test.js`
Expected: FAIL — `no levelBlurb accessor   got function ...`

- [ ] **Step 4: Strip the blurbs from `js/strings.js`**

Delete the `blurb` key from all nine level entries in `PV.TEXT.modes`, leaving
each level as a `menu` line only. The `modes` block becomes:

```js
    /* One bold run per menu line, and it is always the phrase saying how much
     * you can see. */
    modes: {
      stare: {
        name: 'Stare',
        menu: 'The layer you pick <b>stays lit</b>',
        levels: {
          easy:   { menu: 'You and your last <b>two picks</b> &middot; 1s cooldown' },
          normal: { menu: 'You and your <b>last pick</b> &middot; 1s cooldown' },
          hard:   { menu: '<b>One of four</b>, and you can go dark &middot; 3s cooldown' }
        }
      },
      torch: {
        name: 'Torch',
        // Hard has no cone, so the shared line names only what every level has.
        menu: 'A circle that travels with you, and a <b>ping that sweeps</b>',
        levels: {
          easy:   { menu: 'A wide cone, and a ping that <b>follows them</b> &middot; 1s cooldown' },
          normal: { menu: 'A <b>6-tile</b> cone, and a ping &middot; 1s cooldown' },
          hard:   { menu: '<b>No cone.</b> Only the light you stand in &middot; 2s cooldown' }
        }
      },
      flash: {
        name: 'Flash',
        menu: 'Dark. <b>Flash one layer</b>, then it fades',
        levels: {
          easy:   { menu: '<b>You stay lit.</b> A flash fades over 3.5s &middot; 1s cooldown' },
          normal: { menu: 'Dark. A flash <b>fades over 2s</b> &middot; 1s cooldown' },
          hard:   { menu: 'Dark. A flash <b>fades over 1s</b> &middot; 2s cooldown' }
        }
      }
    },
```

Replace the `readyHint` line in `PV.TEXT.overlay` (line 170):

```js
      readyHint: 'move to begin',
```

- [ ] **Step 5: Delete `PV.levelBlurb` from `js/vision.js`**

Delete lines 147-151 — the comment and the function:

```js
  /** The level's one-liner, shown on the READY overlay. */
  PV.levelBlurb = function (id) { ... };
```

Confirm nothing else calls it:

```bash
grep -rn "levelBlurb\|blurb" js/ test/ index.html
```
Expected: no output.

- [ ] **Step 6: Trim the overlay in `js/main.js`**

Replace the `ready` branch in `syncOverlay` (lines 159-163):

```js
    } else if (game.state === 'ready') {
      title = T.ready;
      body = PV.modeName(game.difficulty) + ' · ' + PV.levelName(game.difficulty);
      hint = T.readyHint;
```

Replace the cache key (lines 148-149) — no overlay reads the maze any more:

```js
    var key = paused + '|' + game.state + '|' + game.level + '|' +
      game.score + '|' + game.best;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node test/modes-test.js`
Expected: PASS — `ALL GRID CHECKS OK`

- [ ] **Step 8: Check the browser**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`, start any
round.

Expected: the panel reads `READY`, then `TORCH · HARD`, then `move to begin`,
and nothing else.

- [ ] **Step 9: Commit**

```bash
git add js/strings.js js/vision.js js/main.js test/modes-test.js
git commit -m "menu: Cut the READY panel back to the mode and the level"
```

---

### Task 10: The layer nudge breathes

**Files:**
- Modify: `css/style.css:81`, `css/style.css:345-350`

- [ ] **Step 1: Replace the flat opacity**

In `css/style.css`, replace line 81:

```css
/* Breathing rather than flat: it competes with a lit maze behind it, and the
   movement is what carries across a board the player is reading. */
#hint.on {
  opacity: .55;
  animation: hint-breathe 3.6s ease-in-out infinite;
}

@keyframes hint-breathe {
  0%, 100% { opacity: .35; }
  50%      { opacity: .95; }
}
```

- [ ] **Step 2: Pin it under reduced motion**

In the `prefers-reduced-motion` block (lines 345-350), add a rule beside the
existing ones:

```css
@media (prefers-reduced-motion: reduce) {
  /* The border colour above still marks a refusal without the movement. */
  .badge-wrap.denied .badge { animation: none; }
  .mrow.is-cursor { transform: none; }
  #hint.on { animation: none; opacity: .55; }
  * { transition-duration: .01ms !important; }
}
```

- [ ] **Step 3: Check the browser**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`, start a round
and wait five seconds without pressing a number key.

Expected: `Press 1/2/3 to scan` appears low on the board and pulses slowly
between dim and near-white. With the OS set to reduce motion, it holds steady.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "hud: Breathe the layer nudge so it catches the eye"
```

---

### Task 11: Register the new suites

`tools/release.sh` and the deploy workflow run four of the node suites. There are
now six, and `modes-test.js` was already missing from both.

**Files:**
- Modify: `tools/release.sh:51-54`
- Modify: `.github/workflows/deploy.yml`
- Modify: `test/release-test.sh:30`
- Modify: `README.md`

- [ ] **Step 1: Add the suites to `tools/release.sh`**

Replace lines 51-54:

```bash
run_suite test/maze-test.js
run_suite test/opening-test.js
run_suite test/torch-test.js
run_suite test/attract-test.js
run_suite test/modes-test.js
run_suite test/flash-test.js
run_suite test/aura-test.js
```

- [ ] **Step 2: Widen the stub loop in `test/release-test.sh`**

`setup()` stubs one file per suite `release.sh` runs. A suite with no stub makes
every case fail on a missing file. Replace line 30:

```bash
  for suite in maze opening torch attract modes flash aura; do
```

- [ ] **Step 3: Run the release harness**

Run: `bash test/release-test.sh`
Expected: `N passed, 0 failed`

- [ ] **Step 4: Add the suites to the deploy workflow**

In `.github/workflows/deploy.yml`, replace the `run:` block under
`- name: Test`:

```yaml
        run: |
          node test/maze-test.js
          node test/opening-test.js
          node test/torch-test.js
          node test/attract-test.js
          node test/modes-test.js
          node test/flash-test.js
          node test/aura-test.js
```

- [ ] **Step 5: Update the README**

Replace the test-suite paragraph and command block. The count goes from seven to
nine, and the two new suites need a clause each:

```
Nine test suites, seven node and two bash, none of them needing anything
installed. The second covers the ghost release ladder, the dots blink and the
wording of the layer nudge; the third covers Torch — its ping's fade curve and
frozen origin, the ghost blips it leaves behind, and the line-of-sight and
circle/cone math behind what the light itself reaches; the fourth covers the
menu demo, whose autopilot has to steer only into open tiles, eat at a
reasonable rate, and reach every layer as it rotates; the fifth pins the shape
of all nine cells and the exact tuning each mode's Normal is balanced around,
so a change to it has to be deliberate; the sixth covers what a pick leaves
behind — picks stack rather than replace, each fades on its own clock, and a
round opens on the layers `initial` names; the seventh covers the board aura's
schedule. None of that is visible to a layout check. The last two are bash
because what they exercise is bash; `release-test.sh` drives `tools/release.sh`
against a throwaway repo, so nothing it does reaches GitHub.

    node test/maze-test.js
    node test/opening-test.js
    node test/torch-test.js
    node test/attract-test.js
    node test/modes-test.js
    node test/flash-test.js
    node test/aura-test.js
    bash test/release-test.sh
    bash test/itch-deploy-test.sh
```

- [ ] **Step 6: Run every suite**

Run:
```bash
node test/maze-test.js && node test/opening-test.js && node test/torch-test.js \
  && node test/attract-test.js && node test/modes-test.js && node test/flash-test.js \
  && node test/aura-test.js && bash test/release-test.sh && bash test/itch-deploy-test.sh
```
Expected: every suite passes.

- [ ] **Step 7: Commit**

```bash
git add tools/release.sh test/release-test.sh .github/workflows/deploy.yml README.md
git commit -m "test: Run the flash, aura and modes suites on release"
```

---

### Task 12: Play it

The last three tasks change what the player sees more than what any test can
assert. This is the pass that catches what the suites cannot.

**Files:** none — no commit unless something needs fixing.

- [ ] **Step 1: Serve the game**

Run: `python3 -m http.server 8000` and open `http://localhost:8000/`.

- [ ] **Step 2: Walk the checklist**

- Flash Normal: the round opens showing the walls and Blinkman, both fading
  together. Press `3`, wait about a second, press `1` — the walls keep fading
  while the dots come up full.
- Flash Normal: sit still with everything dark. No ghost glows in the house.
- Torch Hard: the light is a disc with no beam, and turning does not change its
  shape. Walking into a corridor still lights the corridor.
- Torch Easy: press `2` and watch a contact — it waddles along with its ghost
  instead of sitting where the ring found it, and fades on its own clock.
- Any mode: eat a power pellet. The edge breathes white, blinks faster over the
  last two seconds, and closes on one yellow pulse. Get caught instead and it
  goes red with no yellow.
- Any mode: on READY the maze is dimly visible, the panel reads `READY` /
  `MODE · LEVEL` / `move to begin`, and nothing starts until you press a
  direction.
- Any mode: wait five seconds without pressing a number. The nudge appears and
  pulses slowly.

- [ ] **Step 3: Check the console**

Expected: no errors, and one `BLINK-MAN v1.5.0` line.

---

## Notes for the implementer

- **Do not touch `PV.VERSION`.** The release process owns it. `1.5.0` in the
  console line above is what is on the branch now, not something to change.
- **No `Co-Authored-By` lines on commits.** Commit subjects are
  `topic: Message`.
- Comments state what the code does now — never what changed or why.
- Task 1 must land before Tasks 2 and 5; both build on the flash list. Task 4
  must land before Task 5 only because they touch adjacent lines of
  `js/strings.js`. Tasks 6, 7, 8, 9 and 10 are independent of each other.
