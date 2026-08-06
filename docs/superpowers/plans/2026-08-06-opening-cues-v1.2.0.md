# Opening Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the start of a round legible — ghosts leave the house one at a
time, ghosts inside the house are visible and fade as they cross the door, and
the dots blink once at the opening before obeying the layer state.

**Architecture:** Three independent changes, each in the module that already
owns that concern. The release schedule is data on `GHOST_DEFS` plus a rule in
`game.js`. The house reveal is a pure function of ghost state and y-position in
`entities.js`, consumed by `render.js` as a per-ghost opacity floor. The dots
blink is a one-shot timer in `vision.js` applied as a floor on the dots layer.
A prerequisite change resets `game.stateTime` on both exits from the `ready`
state so the release ladder measures from the first playable frame.

**Tech Stack:** Plain ES5 browser scripts hanging off a `window.PV` global. No
modules, no bundler, no framework. Tests are bare `node` scripts that stub
`global.window` and `require` the game files directly.

**Spec:** `docs/superpowers/specs/2026-08-06-opening-cues-v1.2.0-design.md`

**Expected values are measured, not guessed.** Every number in a "verify it
fails" or "verify it passes" step was produced by running the code with the
task's edits applied. The release ladder yields 2.017 / 9.000 / 14.000 with no
dots eaten and 2.017 / 5.017 / 8.017 with the counts met; the intro curve hits
1 / 0 / 1 / 0 / 1 / 0 at the sampled blink points and settles to 0 in Normal
and Blink and 0.55 in Easy. Digits past the second place come from float
accumulation and will drift a little between runs, which is why every timing
comparison goes through `near()`.

---

## Background for the implementer

Read these before starting. The codebase has a few non-obvious rules.

**Script loading.** `js/*.js` files are plain scripts, each wrapped in
`window.PV = window.PV || {}; (function (PV) { ... })(window.PV);`. There is no
`export`/`import`. `maze.js` must load before `entities.js`, `render.js` and
`game.js`, which read `PV.TILE` and `PV.SPAWN` at load time.

**Everything is DOM-free except `main.js` and `hud.js`.** That is what lets the
tests run under `node` with nothing but a `global.window = {}` stub. Do not
introduce a `document` or `window` reference into `game.js`, `entities.js`,
`vision.js` or `maze.js` — it will break `test/opening-test.js`.

**Design space.** The board is a fixed 560x620 coordinate space, 28x31 tiles of
20px. `PV.center(n)` returns the pixel centre of tile index `n`. Relevant rows:
the house interior is row 14 (`y = 290`), the door is row 12 (`y = 250`), and
the tile the ghosts emerge onto is row 11 (`y = 230`).

**Comment style.** Comments state current-state facts. They never narrate the
change or why it was made ("previously this used X" is wrong). Keep them terse.

**Commits.** Message style is `topic: Message`, e.g. `ghosts: Stagger the
house exits`. Never add a `Co-Authored-By` line.

**Running the tests.**

    node test/maze-test.js
    node test/opening-test.js

Both print per-check lines and exit non-zero on failure.

---

## File Structure

| File | Responsibility |
|---|---|
| `test/opening-test.js` | **Create.** Headless regression for all three cues plus the `stateTime` baseline they depend on. Owns its own assert helpers; no framework. |
| `js/game.js` | **Modify.** Add `beginPlay()`; rewrite `releaseGhosts()` against the release triple. |
| `js/entities.js` | **Modify.** Release triples on `GHOST_DEFS`; `DOOR_Y`; `PV.ghostReveal()`. |
| `js/render.js` | **Modify.** Draw ghosts at a per-ghost alpha instead of gating the whole layer. |
| `js/vision.js` | **Modify.** Intro blink constants, `PV.introAlpha()`, and the dots floor in `update()`. |
| `js/strings.js` | **Modify.** `PV.VERSION` to `1.2.0`. |
| `README.md` | **Modify.** One paragraph describing the opening. |
| `docs/superpowers/specs/2026-08-06-opening-cues-v1.2.0-design.md` | **Modify.** One wording fix in Task 3. |

Task order matters: Task 1 is a prerequisite for Task 2 (the ladder's numbers
are meaningless without the baseline reset). Tasks 3 and 4 are independent of
everything and of each other.

---

### Task 1: `stateTime` baseline and the test scaffold

`game.stateTime` resets in `startRound()` but keeps counting through the
`ready` state, whose length the player controls (up to 1.8s, or shorter if
they press a direction). The release ladder in Task 2 reads `stateTime`, so it
must measure from the first playable frame instead.

**Files:**
- Create: `test/opening-test.js`
- Modify: `js/game.js:119-122` (`game.steer`), `js/game.js:155-160` (the `ready` branch of `game.update`)

- [ ] **Step 1: Write the failing test**

Create `test/opening-test.js` with the scaffold and the first check. Later
tasks append to this file.

```js
/* Opening-cues regression test — run with:  node test/opening-test.js
 *
 * Covers what a round opens with: the staggered ghost release, the ghost-house
 * reveal, and the dots blink. All three are timing-sensitive and invisible to
 * maze-test.js, which only reads layouts.
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

/* Timings accumulate in floating point over hundreds of steps, so every
 * comparison against an expected second-value is a tolerance check. */
function near(actual, expected, tol) {
  return Math.abs(actual - expected) <= (tol === undefined ? 0.02 : tol);
}

var STEP = 1 / 60;

/* A game that can be stepped for as long as a test needs. eatPellet is frozen
 * so the release ladder's timers are what is under test rather than whatever
 * Pac-Man happens to wander into, and invuln never expires so a ghost can't
 * end the round mid-measurement. */
function newGame(difficulty) {
  var g = PV.createGame(difficulty || 'normal');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  return g;
}

console.log('');
console.log('stateTime baseline');

(function () {
  var g = newGame();
  for (var i = 0; i < 60 * 5 && g.state === 'ready'; i++) g.update(STEP);
  check('zero on the frame ready expires',
    g.state === 'playing' && g.stateTime === 0, g.state + '/' + g.stateTime);

  var h = newGame();
  h.update(STEP);
  h.update(STEP);
  h.steer(PV.DIRS.left);
  check('zero when steering out of ready',
    h.state === 'playing' && h.stateTime === 0, h.state + '/' + h.stateTime);
})();

console.log('');
console.log(failures === 0 ? 'ALL OPENING CUES OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/opening-test.js`

Expected: both checks FAIL, exit 1. `stateTime` currently carries the length of
the `ready` state into `playing` — 1.8s when it times out, and two steps' worth
when `steer` cuts it short.

```
stateTime baseline
  FAIL  zero on the frame ready expires   got playing/1.8166666666666689
  FAIL  zero when steering out of ready   got playing/0.03333333333333333

2 CHECK(S) FAILED
```

The reported decimals depend on float accumulation and may differ in the last
few digits. What matters is that both are non-zero.

- [ ] **Step 3: Add `beginPlay()` to `js/game.js`**

Insert this function directly above `game.steer` (currently `js/game.js:119`):

```js
    /* Entering 'playing' restarts the clock. The ghost release ladder measures
     * from the first frame the player can act, and 'ready' runs for a length
     * the player controls. */
    function beginPlay() {
      game.state = 'playing';
      game.stateTime = 0;
    }
```

- [ ] **Step 4: Route both exits from `ready` through it**

Replace `game.steer` (`js/game.js:119-122`):

```js
    game.steer = function (dir) {
      game.pacman.want = dir;
      if (game.state === 'ready') beginPlay();
    };
```

Replace the `ready` branch inside `game.update` (`js/game.js:155-160`):

```js
      if (game.state === 'ready') {
        // Returning before vision.update() freezes the cooldown and Blink's
        // opening flash while the board is still behind the curtain.
        if (game.stateTime > 1.8) beginPlay();
        return;
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node test/opening-test.js`

Expected: PASS, exit 0.

```
stateTime baseline
  ok    zero on the frame ready expires
  ok    zero when steering out of ready

ALL OPENING CUES OK
```

- [ ] **Step 6: Confirm nothing else regressed**

Run: `node test/maze-test.js`

Expected: `ALL 16 MAZE COMBINATIONS VALID`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add test/opening-test.js js/game.js
git commit -m "game: Restart stateTime when play begins"
```

---

### Task 2: Staggered ghost release

Blinky spawns on the board and Pinky's rule is `dotsEaten >= 0`, true on the
first playing frame, so two ghosts are loose at once. After a mid-level death
`dotsEaten` carries over, so Inky and Clyde both satisfy their counts instantly
and leave together too.

**Files:**
- Modify: `js/entities.js:148-154` (`GHOST_DEFS`), `js/entities.js:167` (the ghost object's `releaseAt`)
- Modify: `js/game.js:262-273` (`releaseGhosts`)
- Test: `test/opening-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/opening-test.js`, directly above the `console.log('')` /
summary block at the bottom. Every later task appends in the same place.

```js
console.log('');
console.log('ghost release ladder');

/* Steps until every ghost has left the house, recording the stateTime each one
 * went. 'leaving' is the moment of release; reaching 'out' takes another
 * half-second of scripted movement that isn't part of the schedule. */
function releaseTimes(g) {
  var times = {};
  for (var i = 0; i < 60 * 40; i++) {
    g.update(STEP);
    if (g.state !== 'playing') continue;
    for (var j = 0; j < g.ghosts.length; j++) {
      var gh = g.ghosts[j];
      if (times[gh.name] === undefined && gh.state !== 'house') {
        times[gh.name] = g.stateTime;
      }
    }
    if (Object.keys(times).length === g.ghosts.length) break;
  }
  return times;
}

(function () {
  var slow = releaseTimes(newGame());
  check('blinky is already out', near(slow.blinky, 0, 0.02), slow.blinky);
  check('pinky leaves at 2s', near(slow.pinky, 2), slow.pinky);
  check('inky waits out latest at 9s', near(slow.inky, 9), slow.inky);
  check('clyde waits out latest at 14s', near(slow.clyde, 14), slow.clyde);

  // The mid-level respawn case: the dot counts are long since met, so only the
  // earliest floors are holding the exits apart.
  var g = newGame();
  g.dotsEaten = 999;
  var fast = releaseTimes(g);
  check('pinky floor at 2s', near(fast.pinky, 2), fast.pinky);
  check('inky floor at 5s', near(fast.inky, 5), fast.inky);
  check('clyde floor at 8s', near(fast.clyde, 8), fast.clyde);

  var order = ['pinky', 'inky', 'clyde'];
  [slow, fast].forEach(function (t, n) {
    var gaps = [t[order[0]], t[order[1]] - t[order[0]], t[order[2]] - t[order[1]]];
    check('exits stay 2s apart (' + (n === 0 ? 'no dots' : 'dots met') + ')',
      gaps.every(function (d) { return d >= 2 - 0.02; }), gaps.join(' / '));
  });
})();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/opening-test.js`

Expected: the two `stateTime baseline` checks still pass; the release checks
report the current schedule.

```
ghost release ladder
  ok    blinky is already out
  FAIL  pinky leaves at 2s   got 0.0166...
  FAIL  inky waits out latest at 9s   got 5.61...
  FAIL  clyde waits out latest at 14s   got 8.80...
  FAIL  pinky floor at 2s   got 0.0166...
  FAIL  inky floor at 5s   got 0.0166...
  FAIL  clyde floor at 8s   got 0.0166...
  FAIL  exits stay 2s apart (no dots)   got 0.0166... / 5.6 / 3.18
  FAIL  exits stay 2s apart (dots met)   got 0.0166... / 0 / 0
```

Those are the current schedule: Pinky on the first playing frame because
`dotsEaten >= 0` is already true, then Inky and Clyde on the old
`4 + releaseAt * 0.08` patience expression at 5.6s and 8.8s. Decimals past the
second place come from float accumulation and will vary.

The `dots met` row is the bug this task fixes: with the counters already
satisfied, all three leave on the same frame.

- [ ] **Step 3: Put the release triple on `GHOST_DEFS`**

Replace `js/entities.js:148-154`:

```js
  /* `release` gates the trip out of the house: a ghost goes once `earliest`
   * has passed and either the dot count is met or `latest` has passed too.
   * The floors are what keep the exits one at a time — dot counts alone send
   * Inky and Clyde out together on a mid-level respawn, where dotsEaten is
   * already well past both. Blinky's is all zeroes: it opens the round on the
   * board and only passes through the house after being eaten, where the 1s
   * dwell is the gate. */
  var GHOST_DEFS = [
    { name: 'blinky', color: '#ff3c3c', spawn: 'blinky', scatter: { col: 25, row: 0 },
      release: { dots: 0, earliest: 0, latest: 0 } },
    { name: 'pinky',  color: '#ff9ede', spawn: 'pinky',  scatter: { col: 2,  row: 0 },
      release: { dots: 0,  earliest: 2, latest: 2 } },
    { name: 'inky',   color: '#42e8ff', spawn: 'inky',   scatter: { col: 27, row: 30 },
      release: { dots: 20, earliest: 5, latest: 9 } },
    { name: 'clyde',  color: '#ffab42', spawn: 'clyde',  scatter: { col: 0,  row: 30 },
      release: { dots: 60, earliest: 8, latest: 14 } }
  ];
  PV.GHOST_DEFS = GHOST_DEFS;
```

- [ ] **Step 4: Carry it onto the ghost object**

In `PV.createGhosts`, replace the `releaseAt` line (`js/entities.js:167`):

```js
        release: def.release,       // when this one may leave the house
```

- [ ] **Step 5: Rewrite the release rule**

Replace `releaseGhosts` in `js/game.js:262-273`:

```js
    function releaseGhosts(dt) {
      game.ghosts.forEach(function (g) {
        if (g.state !== 'house') return;
        if (g.releaseTimer > 0) { g.releaseTimer -= dt; return; }

        // `earliest` staggers the exits so they read one at a time; `latest`
        // covers a player who isn't eating, so nobody is left alone with Blinky.
        var r = g.release;
        if (game.stateTime < r.earliest) return;
        if (game.dotsEaten < r.dots && game.stateTime < r.latest) return;

        g.state = 'leaving';
        // A ghost released mid-fright joins the fright already running.
        g.frightened = game.frightTimer > 0;
      });
    }
```

Every ghost needs a release rule, not just the three that start in the house.
Blinky passes through `house` too on the way back from being eaten, where
`PV.updateGhost` sets `releaseTimer = 1.0` for any ghost, so `g.release` is
read for it as well.

- [ ] **Step 6: Run the test to verify it passes**

Run: `node test/opening-test.js`

Expected: PASS, exit 0. All eleven checks report `ok` — the two baseline checks
from Task 1 and the nine here.

- [ ] **Step 7: Play it**

Serve the game and start a round on Normal:

    python3 -m http.server 8000

Open `http://localhost:8000`, press `2` for Normal, and press `3` to light the
ghosts layer so the exits are visible. Confirm Pinky leaves about two seconds
after the READY curtain lifts, then Inky, then Clyde, with a clear beat between
each. Die on purpose mid-level and confirm the same stagger repeats instead of
all three pouring out at once.

- [ ] **Step 8: Commit**

```bash
git add js/entities.js js/game.js test/opening-test.js
git commit -m "ghosts: Stagger the house exits one at a time"
```

---

### Task 3: Ghost-house reveal

`render.js` gates every ghost on `alpha.ghosts > 0`, so with the layer dark
the house looks empty and there is no moment showing a ghost going invisible.

**Files:**
- Modify: `js/entities.js:156-158` (the exit constants), and add `PV.ghostReveal` below them
- Modify: `js/render.js:47-50` (the draw calls), `js/render.js:129-155` (`drawGhosts`)
- Modify: `docs/superpowers/specs/2026-08-06-opening-cues-v1.2.0-design.md`
- Test: `test/opening-test.js`

**Spec deviation, deliberate:** the spec says each ghost "carries `revealAlpha`,
set in `PV.updateGhost()` and in `g.reset()`". Implement it as the pure
function `PV.ghostReveal(g)` instead. The value depends only on `g.state` and
`g.y`, so a stored field can go stale between the write and the read and needs
initialising in `reset()` to be correct on the first frame; a function cannot.
Behaviour is identical, including visibility behind the `ready` overlay. Step 6
updates the spec to match.

- [ ] **Step 1: Write the failing test**

Append to `test/opening-test.js`, above the summary block.

```js
console.log('');
console.log('ghost-house reveal');

(function () {
  var HOUSE = PV.center(14), DOOR = PV.center(12);
  var MID = (DOOR + PV.center(11)) / 2, EXIT = PV.center(11);

  // Full below the door line, falling to zero across the doorway.
  ['house', 'leaving', 'entering'].forEach(function (st) {
    check(st + ' is lit in the house',
      PV.ghostReveal({ state: st, y: HOUSE }) === 1);
    check(st + ' is lit at the door line',
      PV.ghostReveal({ state: st, y: DOOR }) === 1);
    check(st + ' is half lit mid-doorway',
      near(PV.ghostReveal({ state: st, y: MID }), 0.5, 0.001));
    check(st + ' is dark at the exit',
      PV.ghostReveal({ state: st, y: EXIT }) === 0);
  });

  /* The state guard is load-bearing: a ghost loose on the lower board sits well
   * below the door line, and the position term alone would clamp it to 1. */
  ['out', 'eaten'].forEach(function (st) {
    [HOUSE, DOOR, MID, EXIT, PV.center(23)].forEach(function (y) {
      check(st + ' is dark at y=' + y, PV.ghostReveal({ state: st, y: y }) === 0);
    });
  });
})();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/opening-test.js`

Expected: a crash, because the function does not exist yet.

```
TypeError: PV.ghostReveal is not a function
```

- [ ] **Step 3: Add the door constant and the reveal function**

In `js/entities.js`, replace the three exit constants at `js/entities.js:156-158`:

```js
  var EXIT_X = PV.center(PV.SPAWN.outside.col);
  var EXIT_Y = PV.center(PV.SPAWN.outside.row);
  var DOOR_Y = PV.center(PV.SPAWN.door.row);
  var HOUSE_Y = PV.center(PV.SPAWN.pinky.row);
```

Then add directly below them:

```js
  // The states in which a ghost is inside the house or crossing its door.
  var IN_HOUSE = { house: 1, leaving: 1, entering: 1 };

  /* How strongly a ghost shows through a dark ghosts layer. Full anywhere at or
   * below the door line, zero on the tile it emerges onto, linear across the
   * doorway between them, so leaving the house is what turns a ghost invisible
   * and re-entering is what brings it back. Position alone drives it — no timer
   * to keep in step. The state list is load-bearing: a ghost loose on the lower
   * board is below the door line too, and would otherwise read as fully lit. */
  PV.ghostReveal = function (g) {
    if (!IN_HOUSE[g.state]) return 0;
    var t = (g.y - EXIT_Y) / (DOOR_Y - EXIT_Y);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/opening-test.js`

Expected: PASS, exit 0. Twenty-two reveal checks report `ok`.

- [ ] **Step 5: Draw ghosts at a per-ghost alpha**

In `js/render.js`, replace the four draw calls at `js/render.js:47-50`. Ghosts
lose their gate, because a housed ghost draws even when the layer is dark:

```js
        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        drawGhosts(ctx, game, alpha.ghosts);
        if (alpha.pacman > 0) drawPacman(ctx, game, alpha.pacman);
```

Then replace `drawGhosts` at `js/render.js:129-155`:

```js
  function drawGhosts(ctx, game, alpha) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      // A ghost in the house shows through even with the layer dark.
      var a = Math.max(alpha, PV.ghostReveal(g));
      if (a <= 0.001) return;

      var eyesOnly = g.state === 'eaten' || g.state === 'entering';
      var isCulprit = dying && game.killer === g;
      var body = g.color;

      if (g.frightened && !eyesOnly) {
        // flash white over the last two seconds of the power pellet
        var ending = game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;
        body = ending ? '#ffffff' : '#2b4bff';
      }

      ctx.save();
      // fade the bystanders during a death so the culprit stands out
      ctx.globalAlpha = dying && !isCulprit ? a * 0.35 : a;
      ctx.translate(g.x, g.y);

      if (isCulprit) drawCulpritRing(ctx, game.stateTime, rad);
      if (!eyesOnly) drawGhostBody(ctx, body, rad, g.wobble);
      drawGhostEyes(ctx, g, body, rad, eyesOnly);

      ctx.restore();
    });
  }
```

- [ ] **Step 6: Correct the spec wording**

In `docs/superpowers/specs/2026-08-06-opening-cues-v1.2.0-design.md`, replace
the two lines opening the "Reveal alpha" section:

```markdown
`PV.ghostReveal(g)` in `js/entities.js` returns a ghost's reveal alpha. It is a
pure function of position and state, with no timer and nothing stored:
```

And in the Consequences list, replace the third bullet:

```markdown
- **Housed ghosts are faintly visible behind the `ready` overlay**, which is
  86% opaque rather than opaque. `PV.ghostReveal()` reads position and state
  directly, so this holds from the first frame of the round with no
  initialisation.
```

- [ ] **Step 7: Play it**

Serve the game and start a round on Hard, where every layer starts dark except
the walls:

    python3 -m http.server 8000

Open `http://localhost:8000` and press `3` for Hard. Confirm the three housed
ghosts are visible in the middle of the board with the ghosts layer off, and
that each one fades out as it rises through the door rather than blinking out.
Then eat a power pellet, eat a ghost, and confirm its eyes fade back in as they
drop into the house and it sits there visible until it leaves again.

- [ ] **Step 8: Commit**

```bash
git add js/entities.js js/render.js test/opening-test.js \
  docs/superpowers/specs/2026-08-06-opening-cues-v1.2.0-design.md
git commit -m "ghosts: Show the house through a dark ghosts layer"
```

---

### Task 4: Dots blink at the opening

In Normal, Hard and Blink the dots layer starts dark, so a round opens with no
indication that pellets exist or which chip reveals them.

**Files:**
- Modify: `js/vision.js:11-12` (below the existing tuning constants), `js/vision.js:105-129` (`update`), `js/vision.js:133-142` (`reset`)
- Test: `test/opening-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/opening-test.js`, above the summary block.

```js
console.log('');
console.log('dots intro blink');

(function () {
  // Sampled away from the phase boundaries: the constants are sums of tenths
  // and land a few float ulps either side of them.
  [[0.05, 1], [0.24, 0], [0.35, 1], [0.54, 0], [0.65, 1], [0.84, 0]]
    .forEach(function (row) {
      check('blink phase at ' + row[0] + 's is ' + row[1],
        PV.introAlpha(row[0]) === row[1], PV.introAlpha(row[0]));
    });

  check('fade opens near full', near(PV.introAlpha(0.92), 0.91, 0.02), PV.introAlpha(0.92));
  check('fade is eased at the midpoint', near(PV.introAlpha(1.125), 0.25, 0.01), PV.introAlpha(1.125));
  check('fade is spent by 1.4s', PV.introAlpha(1.4) === 0, PV.introAlpha(1.4));

  /* Wired into the layer alphas as a floor, so it lifts the dots in the modes
   * that start them dark and settles back to whatever the mode itself shows. */
  function dotsAfter(difficulty, seconds) {
    var v = PV.createVision(PV.DIFFICULTIES[difficulty]);
    var peak = 0;
    for (var t = 0; t < seconds; t += 0.01) {
      v.update(0.01);
      if (v.alpha.dots > peak) peak = v.alpha.dots;
    }
    return { peak: peak, settled: v.alpha.dots };
  }

  var normal = dotsAfter('normal', 1.6);
  check('normal blinks the dots to full', near(normal.peak, 1, 0.001), normal.peak);
  check('normal settles the dots dark', normal.settled === 0, normal.settled);

  var easy = dotsAfter('easy', 1.6);
  check('easy blinks the dots to full', near(easy.peak, 1, 0.001), easy.peak);
  check('easy settles the dots to its own alpha', near(easy.settled, 0.55, 0.001), easy.settled);
})();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/opening-test.js`

Expected: a crash, because the function does not exist yet.

```
TypeError: PV.introAlpha is not a function
```

- [ ] **Step 3: Add the intro constants and curve**

In `js/vision.js`, insert directly below the two existing tuning constants at
`js/vision.js:11-12`:

```js
  /* The opening dots cue: three blinks, then an eased fade out. It runs as a
   * floor under whatever the mode would show, so the dots get introduced even
   * in the modes that start them dark. */
  var INTRO_ON = 0.18, INTRO_OFF = 0.12, INTRO_BLINKS = 3, INTRO_FADE = 0.45;
  var INTRO_BLINK_TIME = INTRO_BLINKS * (INTRO_ON + INTRO_OFF);
  var INTRO_TIME = INTRO_BLINK_TIME + INTRO_FADE;

  PV.introAlpha = function (age) {
    if (age >= INTRO_TIME) return 0;
    if (age < INTRO_BLINK_TIME) return (age % (INTRO_ON + INTRO_OFF)) < INTRO_ON ? 1 : 0;
    // the eased falloff a Blink flash uses, so the two cues read alike
    var t = (age - INTRO_BLINK_TIME) / INTRO_FADE;
    return (1 - t) * (1 - t);
  };
```

- [ ] **Step 4: Add the timer to the vision closure**

In `PV.createVision`, add `intro` alongside the other closure state
(`js/vision.js:56-59`, joining `stack`, `flash`, `cooldown` and `denied`):

```js
    var intro = 0;       // age of the opening dots blink
```

- [ ] **Step 5: Apply it as a floor**

In `v.update`, replace the closing `freeSelf` line (`js/vision.js:128`) with:

```js
        if (intro < INTRO_TIME) {
          intro += dt;
          a.dots = Math.max(a.dots, PV.introAlpha(intro));
        }

        if (rules.freeSelf) a.pacman = 1;
```

- [ ] **Step 6: Arm it on reset**

In `v.reset`, add the `intro` line above the existing `v.update(0)` call
(`js/vision.js:133-142`). It has to be set before that call, which is what
paints the first frame of the blink:

```js
        cooldown = 0;
        denied = 0;
        intro = 0;
        v.update(0);
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node test/opening-test.js`

Expected: PASS, exit 0. All thirteen intro checks report `ok`.

- [ ] **Step 8: Play it**

Serve the game and check the two ends of the range:

    python3 -m http.server 8000

On Blink (`4`), confirm the dots flash three times as the READY curtain lifts
and then fade out, leaving the board dark. On Easy (`1`), confirm they flash to
full and settle back to the dimmer alpha rather than going dark. In both, the
dots chip in the HUD should light during the blink and then follow the layer.

- [ ] **Step 9: Commit**

```bash
git add js/vision.js test/opening-test.js
git commit -m "vision: Blink the dots when a round opens"
```

---

### Task 5: Version bump and README

**Files:**
- Modify: `js/strings.js:16`
- Modify: `README.md` (the Modes section, after the death paragraph; and the maze-test line under Mazes)

- [ ] **Step 1: Bump the version**

Replace `js/strings.js:16`:

```js
  PV.VERSION = '1.2.0';
```

- [ ] **Step 2: Describe the opening in the README**

In `README.md`, add this paragraph to the Modes section directly after the
paragraph beginning "Death is the one exception to all of this":

```markdown
A round opens the same way in every mode. The dots blink three times and then
obey the layer, ghosts leave the house one at a time over the first several
seconds, and a ghost inside the house is visible whatever the layer says,
fading out as it crosses the door.
```

- [ ] **Step 3: List the second test**

In `README.md`, replace the single test command under the Mazes section's
three authoring rules:

```markdown
    node test/maze-test.js
    node test/opening-test.js
```

- [ ] **Step 4: Verify the version renders**

Serve the game and confirm the marker in the menu's bottom corner reads
`v1.2.0`, and that the console logs `BLINK-MAN v1.2.0`.

    python3 -m http.server 8000

- [ ] **Step 5: Run both tests**

```bash
node test/maze-test.js && node test/opening-test.js
```

Expected: `ALL 16 MAZE COMBINATIONS VALID` then `ALL OPENING CUES OK`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add js/strings.js README.md
git commit -m "blinkman: Bump version to 1.2.0"
```

---

## Done when

- `node test/maze-test.js` and `node test/opening-test.js` both exit 0.
- On Hard, the three housed ghosts are visible with the ghosts layer dark, and
  each fades across the door on the way out.
- On Normal, Pinky, Inky and Clyde leave with a visible beat between them, both
  at level start and after a mid-level death.
- On Blink, the dots flash three times at the opening and then go dark.
- The menu corner reads `v1.2.0`.
