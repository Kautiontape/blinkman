# Attract Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play an autopilot demo of the game behind the menu, with the lit layer rotating every four seconds.

**Architecture:** A new `js/attract.js` owns a `PV.createGame('normal', { persist: false })` instance and steps it. Each frame it runs two breadth-first searches over the 28x31 tile grid — one for a danger field around loose ghosts, one for a route to the nearest pellet — and hands the first step of that route to `game.steer()`. A separate 4s timer calls `game.selectVision()` to walk `walls → dots → ghosts`. `main.js` builds one on the menu and draws it; the HUD and menu panel are untouched.

**Tech Stack:** Plain browser scripts hanging off a `window.PV` global. No modules, no bundler, no build step. Tests are plain node scripts run directly — nothing to install.

**Spec:** `docs/superpowers/specs/2026-08-06-attract-mode-v1.4.0-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `js/attract.js` (new) | The demo: autopilot, layer rotation, keeping the round alive. Owns its own game instance. |
| `test/attract-test.js` (new) | Regression test for the above plus the persist guard. |
| `js/game.js` (modify) | Gains a `persist` option so a demo round cannot overwrite a stored best score. |
| `js/main.js` (modify) | Builds, drops and draws the attract game around the menu. |
| `index.html` (modify) | One script tag. |
| `css/style.css` (modify) | Menu scrim opacity. |
| `js/strings.js` (modify) | Version. |
| `README.md` (modify) | File list, test list, Modes section, Not done section. |

`attract.js` reads `PV.DIRS`, `PV.COLS` and `PV.ROWS` at load time, so it must load after `entities.js` and `maze.js`. Placing it after `game.js` satisfies both.

**Node harness note:** every file under test is DOM-free and `game.js` already wraps its `localStorage` access in try/catch, so `maze.js → entities.js → vision.js → game.js → attract.js` load headless under a `global.window` stub. This is the pattern `test/opening-test.js` already uses.

---

### Task 1: The `persist` option on `PV.createGame`

Without this, the autopilot's score is written to `pv-best-normal` and overwrites the player's real Normal high score, which the HUD displays and which survives across sessions.

**Files:**
- Create: `test/attract-test.js`
- Modify: `js/game.js:46-49` and `js/game.js:228-234`

- [ ] **Step 1: Write the failing test**

Create `test/attract-test.js` with exactly this content. Later tasks append sections to it before the final two lines.

```js
/* Attract-mode regression test — run with:  node test/attract-test.js
 *
 * Covers the demo that plays behind the menu: that the autopilot only ever
 * steers somewhere legal, that it clears dots at a reasonable rate, that the
 * rotation reaches every layer in order, and that a demo round cannot
 * overwrite a stored best score.
 */
global.window = {};
var path = require('path');

/* game.js reaches localStorage through a try/catch, so in node the write it
 * guards is invisible. The stub is what makes it observable, and so what makes
 * the persist option testable at all. */
var writes = [];
global.localStorage = {
  getItem: function () { return null; },
  setItem: function (k, v) { writes.push(k + '=' + v); }
};

['maze.js', 'entities.js', 'vision.js', 'game.js', 'attract.js'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f));
});
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

var STEP = 1 / 60;

console.log('score persistence');

/* Steering in a circle rather than in one direction: it eats regardless of
 * which way the spawn happens to open, and the spawn tile itself is bare. */
function driveByHand(game, seconds) {
  var turns = [PV.DIRS.left, PV.DIRS.up, PV.DIRS.right, PV.DIRS.down];
  game.startRound();
  game.invuln = Infinity;
  for (var i = 0; i < 60 * seconds; i++) {
    if (i % 30 === 0) game.steer(turns[(i / 30) % turns.length]);
    game.update(STEP);
  }
}

(function () {
  writes.length = 0;
  var demo = PV.createGame('normal', { persist: false });
  driveByHand(demo, 6);
  check('a persist:false game scores', demo.score > 0, demo.score);
  check('a persist:false game writes nothing', writes.length === 0, writes.join(' '));

  writes.length = 0;
  var real = PV.createGame('normal');
  driveByHand(real, 6);
  check('a default game still writes', real.score > 0 && writes.length > 0,
    real.score + ' / ' + writes.length + ' writes');
})();

console.log('');
console.log(failures === 0 ? 'ALL ATTRACT CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
node test/attract-test.js
```

Expected: it throws before reaching any check, because `js/attract.js` does not exist yet:

```
Error: Cannot find module '.../js/attract.js'
```

- [ ] **Step 3: Create a placeholder so the harness loads**

The persist option is what this task tests; the file it exists for arrives in Task 2. Create `js/attract.js` with only the module shell:

```js
/* attract.js — the demo that plays behind the menu. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';
})(window.PV);
```

- [ ] **Step 4: Run it to see the real failure**

```bash
node test/attract-test.js
```

Expected: the second check fails. With no `persist` option, `createGame` ignores its second argument, so the demo game writes its score like any other:

```
score persistence
  ok    a persist:false game scores
  FAIL  a persist:false game writes nothing   got pv-best-normal=10 ...
  ok    a default game still writes
```

- [ ] **Step 5: Add the option**

In `js/game.js`, change the opening of `PV.createGame` (currently lines 46-49) from:

```js
  PV.createGame = function (difficultyId) {
    var rules = PV.DIFFICULTIES[difficultyId];
    var bestKey = 'pv-best-' + difficultyId;
    var deathSounded = false;
```

to:

```js
  PV.createGame = function (difficultyId, opts) {
    var rules = PV.DIFFICULTIES[difficultyId];
    var bestKey = 'pv-best-' + difficultyId;
    // The menu demo scores like any other round; persisting that would
    // overwrite the player's own best.
    var persist = !opts || opts.persist !== false;
    var deathSounded = false;
```

Then change `addScore` (currently lines 228-234) from:

```js
    function addScore(points) {
      game.score += points;
      if (game.score > game.best) {
        game.best = game.score;
        store.set(bestKey, String(game.best));
      }
    }
```

to:

```js
    function addScore(points) {
      game.score += points;
      if (game.score > game.best) {
        game.best = game.score;
        if (persist) store.set(bestKey, String(game.best));
      }
    }
```

`game.best` is still read at construction. That read is harmless — it is only ever compared against, and the demo game's `best` is displayed nowhere.

- [ ] **Step 6: Run it to verify it passes**

```bash
node test/attract-test.js
```

Expected:

```
score persistence
  ok    a persist:false game scores
  ok    a persist:false game writes nothing
  ok    a default game still writes

ALL ATTRACT CHECKS OK
```

- [ ] **Step 7: Confirm nothing else regressed**

```bash
node test/maze-test.js && node test/opening-test.js
```

Expected: both end in their all-ok line and exit 0.

- [ ] **Step 8: Commit**

```bash
git add js/game.js js/attract.js test/attract-test.js
git commit -m "game: Add a persist option to createGame"
```

---

### Task 2: The autopilot

**Files:**
- Modify: `js/attract.js` (replace the placeholder)
- Modify: `test/attract-test.js`

- [ ] **Step 1: Write the failing tests**

In `test/attract-test.js`, insert these two sections after the `score persistence` block and before the final `console.log('')` / summary lines.

```js
console.log('');
console.log('autopilot steering');

/* The invariant: on every frame the autopilot steers, the direction it hands
 * over is passable from the tile Pac-Man is standing in. It only steers in
 * 'ready' and 'playing', so the other states are filtered out — `want` there is
 * whatever pacman.reset() left behind.
 *
 * `want` is read after the step because game.update() does not touch it, and
 * the tile is read before, because that is the tile the route was rooted at. */
(function () {
  var illegal = 0, samples = 0, blocked = 0, near = 0, first = '';

  for (var run = 0; run < 5; run++) {
    var a = PV.createAttract();
    for (var i = 0; i < 60 * 20; i++) {
      var p = a.game.pacman;
      var maze = a.game.maze;
      var was = p.tile();
      var state = a.game.state;
      a.update(STEP);

      if (a.game.maze !== maze) continue;      // a level clear rolled a new maze
      if (state !== 'ready' && state !== 'playing') continue;
      samples++;
      if (was.col <= 1 || was.col >= PV.COLS - 2) near++;
      if (p.blocked) blocked++;
      if (!maze.passable(was.col + p.want.x, was.row + p.want.y, false)) {
        illegal++;
        if (!first) first = p.want.name + ' from ' + was.col + ',' + was.row;
      }
    }
  }

  check('steered enough frames to mean something', samples > 3000, samples);
  check('never steers into a wall', illegal === 0, illegal + ' of ' + samples + '  ' + first);
  check('never walks into one either', blocked === 0, blocked);
  // The route search wraps columns, so the tunnel is an ordinary edge. If it
  // did not, the two mouths would be unreachable and this would read 0.
  check('uses the tunnel', near > 0, near);
})();

console.log('');
console.log('autopilot progress');

/* invuln frozen at Infinity is the seam opening-test.js uses to keep a ghost
 * from ending a round mid-measurement. Without it a death resets the board and
 * the count measures luck. */
(function () {
  var worst = Infinity;
  for (var run = 0; run < 5; run++) {
    var a = PV.createAttract();
    a.game.invuln = Infinity;
    for (var i = 0; i < 60 * 20; i++) a.update(STEP);
    worst = Math.min(worst, a.game.dotsEaten);
  }
  // 20s at 5.6 tiles/sec is ~112 tiles crossed. A Pac-Man that circles without
  // eating, or one that stalls, lands well under this.
  check('clears dots at a sane rate', worst >= 40, worst);
})();
```

- [ ] **Step 2: Run to verify the new sections fail**

```bash
node test/attract-test.js
```

Expected: a throw, because `PV.createAttract` is not a function yet:

```
score persistence
  ok    a persist:false game scores
  ok    a persist:false game writes nothing
  ok    a default game still writes

autopilot steering
...TypeError: PV.createAttract is not a function
```

- [ ] **Step 3: Write the autopilot**

Replace the whole of `js/attract.js` with this. The rotation referenced in Task 3 is deliberately absent.

```js
/* attract.js — the demo that plays behind the menu: an autopilot Pac-Man and a
 * timed rotation through the layers. It makes no sound and never touches the
 * HUD, which stays on its idle reading while this runs. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var COLS = PV.COLS, ROWS = PV.ROWS;
  var CELLS = COLS * ROWS;

  // Tiles this close to a loose ghost are routed around.
  var DANGER = 2;

  var STEPS = [PV.DIRS.up, PV.DIRS.left, PV.DIRS.down, PV.DIRS.right];

  PV.createAttract = function () {
    // persist:false — a demo round scores like any other, and the write would
    // land on the player's own Normal best.
    var game = PV.createGame('normal', { persist: false });

    /* Reused across frames so the searches allocate nothing. The `seen` arrays
     * hold a generation number rather than a flag, which saves clearing them. */
    var dangerSeen = new Int32Array(CELLS);
    var dangerDist = new Int16Array(CELLS);
    var routeSeen = new Int32Array(CELLS);
    var routeFirst = new Int8Array(CELLS);
    var queue = new Int32Array(CELLS);
    var dangerGen = 0;
    var routeGen = 0;

    function idx(col, row) { return row * COLS + col; }

    /* A column outside the board maps to the opposite edge, which makes the
     * tunnel an ordinary search edge. Off-board tiles are floor only on the
     * tunnel row, so anywhere else this resolves to the border wall. */
    function wrapCol(col) {
      return col < 0 ? col + COLS : col >= COLS ? col - COLS : col;
    }

    function open(col, row) {
      return row >= 0 && row < ROWS && game.maze.passable(col, row, false);
    }

    /** Step distance from each tile to the nearest loose, unfrightened ghost. */
    function buildDanger() {
      dangerGen++;
      var head = 0, tail = 0;

      for (var i = 0; i < game.ghosts.length; i++) {
        var g = game.ghosts[i];
        if (g.state !== 'out' || g.frightened) continue;
        var t = g.tile();
        var seed = idx(wrapCol(t.col), t.row);
        if (dangerSeen[seed] === dangerGen) continue;
        dangerSeen[seed] = dangerGen;
        dangerDist[seed] = 0;
        queue[tail++] = seed;
      }

      while (head < tail) {
        var cur = queue[head++];
        var d = dangerDist[cur];
        if (d >= DANGER) continue;        // nothing past the buffer is consulted
        var col = cur % COLS, row = (cur / COLS) | 0;
        for (var k = 0; k < STEPS.length; k++) {
          var nc = wrapCol(col + STEPS[k].x), nr = row + STEPS[k].y;
          if (!open(nc, nr)) continue;
          var n = idx(nc, nr);
          if (dangerSeen[n] === dangerGen) continue;
          dangerSeen[n] = dangerGen;
          dangerDist[n] = d + 1;
          queue[tail++] = n;
        }
      }
    }

    function dangerous(i) {
      return dangerSeen[i] === dangerGen && dangerDist[i] <= DANGER;
    }

    /** A pellet, or a ghost worth eating while one is edible. */
    function isTarget(col, row) {
      if (game.maze.pelletAt(col, row)) return true;
      if (game.frightTimer <= 0) return false;
      for (var i = 0; i < game.ghosts.length; i++) {
        var g = game.ghosts[i];
        if (!g.frightened || g.state !== 'out') continue;
        var t = g.tile();
        if (t.col === col && t.row === row) return true;
      }
      return false;
    }

    /* Breadth-first to the nearest target. Each tile records the step out of
     * Pac-Man's own tile that reached it, so arriving at a target hands back
     * the first move of the route with no path to walk back. */
    function routeStep(avoid) {
      routeGen++;
      var pac = game.pacman.tile();
      var root = idx(wrapCol(pac.col), pac.row);
      var head = 0, tail = 0;

      routeSeen[root] = routeGen;
      routeFirst[root] = -1;
      queue[tail++] = root;

      while (head < tail) {
        var cur = queue[head++];
        var col = cur % COLS, row = (cur / COLS) | 0;

        // The root is skipped: a pellet underfoot is eaten this frame anyway,
        // and it has no first step to report.
        if (routeFirst[cur] !== -1 && isTarget(col, row)) return STEPS[routeFirst[cur]];

        for (var k = 0; k < STEPS.length; k++) {
          var nc = wrapCol(col + STEPS[k].x), nr = row + STEPS[k].y;
          if (!open(nc, nr)) continue;
          var n = idx(nc, nr);
          if (routeSeen[n] === routeGen) continue;
          if (avoid && dangerous(n)) continue;
          routeSeen[n] = routeGen;
          routeFirst[n] = routeFirst[cur] === -1 ? k : routeFirst[cur];
          queue[tail++] = n;
        }
      }
      return null;
    }

    /* Last resort, so the direction handed over is always a legal one. Only
     * reachable in the frame between the last pellet and `levelclear`. */
    function anyOpenStep() {
      var t = game.pacman.tile();
      var back = PV.reverseOf(game.pacman.dir);
      var reverse = null;
      for (var k = 0; k < STEPS.length; k++) {
        if (!open(wrapCol(t.col + STEPS[k].x), t.row + STEPS[k].y)) continue;
        if (STEPS[k] === back) { reverse = STEPS[k]; continue; }
        return STEPS[k];
      }
      return reverse || game.pacman.dir;
    }

    function steer() {
      buildDanger();
      // Boxed in by ghosts, walk out through them rather than stall on screen.
      game.steer(routeStep(true) || routeStep(false) || anyOpenStep());
    }

    return {
      game: game,

      update: function (dt) {
        // 'levelclear' advances itself and 'dying' restarts the round; only
        // 'gameover' is terminal.
        if (game.state === 'gameover') game.restart();
        if (game.state === 'ready' || game.state === 'playing') steer();
        game.update(dt);
      }
    };
  };

})(window.PV);
```

- [ ] **Step 4: Run to verify it passes**

```bash
node test/attract-test.js
```

Expected — the `uses the tunnel` and `clears dots` numbers vary run to run because the maze is unseeded, but every line reads `ok`:

```
score persistence
  ok    a persist:false game scores
  ok    a persist:false game writes nothing
  ok    a default game still writes

autopilot steering
  ok    steered enough frames to mean something
  ok    never steers into a wall
  ok    never walks into one either
  ok    uses the tunnel

autopilot progress
  ok    clears dots at a sane rate

ALL ATTRACT CHECKS OK
```

If `clears dots at a sane rate` fails, the route search is finding nothing and every frame is falling through to `anyOpenStep()`. Check `wrapCol` and the `routeFirst[cur] !== -1` guard first.

- [ ] **Step 5: Run it several times**

The maze is unseeded, so each run exercises a different layout. Confirm the result is stable:

```bash
for i in 1 2 3 4 5; do node test/attract-test.js | tail -1; done
```

Expected: five lines of `ALL ATTRACT CHECKS OK`.

- [ ] **Step 6: Commit**

```bash
git add js/attract.js test/attract-test.js
git commit -m "attract: Add the autopilot behind the menu demo"
```

---

### Task 3: The layer rotation

**Files:**
- Modify: `js/attract.js`
- Modify: `test/attract-test.js`

- [ ] **Step 1: Write the failing test**

In `test/attract-test.js`, insert this section after `autopilot progress` and before the summary lines.

```js
console.log('');
console.log('layer rotation');

/* One cycle is 12s, so 13s covers a full lap and the start of the next.
 * invuln is frozen because a death resets the vision to `walls` mid-lap. */
(function () {
  var a = PV.createAttract();
  a.game.invuln = Infinity;

  var order = [], seen = {};
  for (var i = 0; i < 60 * 13; i++) {
    a.update(STEP);
    var cur = a.game.vision.current();
    if (!cur) continue;
    seen[cur] = true;
    if (order[order.length - 1] !== cur) order.push(cur);
  }

  var pool = PV.DIFFICULTIES.normal.pool.slice().sort().join(',');
  check('reaches every layer in the pool', Object.keys(seen).sort().join(',') === pool,
    Object.keys(seen).sort().join(','));
  check('walks walls -> dots -> ghosts, then repeats',
    order.join(' ') === 'walls dots ghosts walls', order.join(' '));
})();
```

- [ ] **Step 2: Run to verify it fails**

```bash
node test/attract-test.js
```

Expected: nothing ever swaps the layer, so it sits on Normal's `initial` for the whole 13s:

```
layer rotation
  FAIL  reaches every layer in the pool   walls
  FAIL  walks walls -> dots -> ghosts, then repeats   walls
```

- [ ] **Step 3: Add the rotation**

In `js/attract.js`, add to the constants near the top, directly above `// Tiles this close to a loose ghost`:

```js
  // The layers the rotation walks, and how long each one holds.
  var ROTATION = ['walls', 'dots', 'ghosts'];
  var HOLD = 4;
```

Add a timer alongside the other per-instance state, directly below `var routeGen = 0;`:

```js
    var rotateTimer = 0;
```

Add this function directly above the `return {` block:

```js
    /* The next layer is read off the one that is lit rather than kept in a
     * counter, so a round reset — which puts the vision back to `walls` —
     * resumes the cycle instead of skipping a layer. An unrecognised or absent
     * layer indexes to -1 and so starts the lap over. */
    function rotate(dt) {
      rotateTimer += dt;
      if (rotateTimer < HOLD) return;
      rotateTimer -= HOLD;
      var at = ROTATION.indexOf(game.vision.current());
      game.selectVision(ROTATION[(at + 1) % ROTATION.length]);
    }
```

Then add one line to `update`, between the `steer()` line and the `game.update(dt)` line:

```js
        if (game.state === 'playing') rotate(dt);
```

so that `update` reads:

```js
      update: function (dt) {
        // 'levelclear' advances itself and 'dying' restarts the round; only
        // 'gameover' is terminal.
        if (game.state === 'gameover') game.restart();
        if (game.state === 'ready' || game.state === 'playing') steer();
        // Held outside 'playing': selectVision() refuses there, and a death
        // would otherwise burn cycle time behind a frozen board.
        if (game.state === 'playing') rotate(dt);
        game.update(dt);
      }
```

- [ ] **Step 4: Run to verify it passes**

```bash
node test/attract-test.js
```

Expected: every line `ok`, ending in `ALL ATTRACT CHECKS OK`. The rotation is purely time-driven, so those two checks are deterministic across runs.

- [ ] **Step 5: Run the whole suite**

```bash
node test/maze-test.js && node test/opening-test.js && node test/attract-test.js
```

Expected: three all-ok lines, exit 0.

- [ ] **Step 6: Commit**

```bash
git add js/attract.js test/attract-test.js
git commit -m "attract: Rotate the lit layer every four seconds"
```

---

### Task 4: Wire it into the menu

Nothing in this task is covered by the node tests — it is DOM wiring, and it gets verified in a browser.

**Files:**
- Modify: `index.html:135-136`
- Modify: `js/main.js:23`, `js/main.js:108-120`, `js/main.js:122-132`, `js/main.js:308`
- Modify: `css/style.css:63`

- [ ] **Step 1: Add the script tag**

In `index.html`, insert `attract.js` between `game.js` and `main.js`:

```html
<script src="js/game.js"></script>
<script src="js/attract.js"></script>
<script src="js/main.js"></script>
```

Also extend the comment above that block (currently lines 126-127) to name the new constraint:

```html
<!-- maze.js first of the game files: entities, render and game read PV.TILE at
     load time, and attract reads PV.DIRS and the grid size. main.js last — it
     starts the loop. -->
```

- [ ] **Step 2: Declare the variable**

In `js/main.js`, change line 23 from:

```js
  var game = null;
```

to:

```js
  var game = null;
  var attract = null;      // the demo behind the menu; null while a round is live
```

- [ ] **Step 3: Build one on the menu**

In `js/main.js`, change the last line of `showMenu()` (currently line 119) from:

```js
    renderer.clear();
  }
```

to:

```js
    renderer.clear();
    // Under reduced motion the board stays the black rectangle it was.
    attract = wantsCalm() ? null : PV.createAttract();
  }
```

`wantsCalm()` is defined at line 99, above `showMenu`, so it is in scope.

- [ ] **Step 4: Drop it when a round starts**

In `js/main.js`, change the opening of `startGame()` (currently lines 122-124) from:

```js
  function startGame(difficultyId) {
    PV.Sfx.unlock();
    game = PV.createGame(difficultyId);
```

to:

```js
  function startGame(difficultyId) {
    PV.Sfx.unlock();
    attract = null;
    game = PV.createGame(difficultyId);
```

- [ ] **Step 5: Draw it in the frame loop**

In `js/main.js`, change line 308 from:

```js
    if (!game) return;
```

to:

```js
    if (!game) {
      if (attract) {
        attract.update(dt);
        renderer.draw(attract.game, dt);
      }
      return;
    }
```

Everything below that return — `syncSiren()`, `hud.update()`, `syncOverlay()` — stays unreached on the menu, which is what keeps the side panel and the menu panel behaving exactly as before.

- [ ] **Step 6: Lighten the scrim**

In `css/style.css`, change line 63 from:

```css
  background: rgba(3,5,12,.86);
```

to:

```css
  background: rgba(3,5,12,.78);
```

- [ ] **Step 7: Check every file still parses**

```bash
node --check js/attract.js && node --check js/main.js && node --check js/game.js && echo "parse ok"
```

Expected: `parse ok`.

- [ ] **Step 8: Verify in a browser**

Serve the game and look at it. Use the `run` skill, or by hand:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. On the menu, confirm all of:

1. Pac-Man is moving around the board behind the menu panel, eating dots.
2. The layer behind him swaps roughly every four seconds — walls, then dots, then ghosts, then back to walls. Pac-Man himself stays visible the whole time.
3. The menu text, the four mode buttons and the version stamp are all still legible against it.
4. The side panel reads its idle values: score `0`, best `—`, level `1`, maze `—`, badge dark, layer chips greyed out.
5. It is silent.
6. Open the console — no errors, and the only log is the `BLINK-MAN v…` line.
7. Press `2` to start a Normal round. The demo stops, a real round begins, and the board is yours.
8. Press `Esc` to come back. A fresh demo is running and the splash line has changed.

Then check the high score is safe. In the console before starting any round:

```js
localStorage.getItem('pv-best-normal')
```

Leave the menu demo running for a minute, re-run that line, and confirm the value has not changed.

- [ ] **Step 9: Commit**

```bash
git add index.html js/main.js css/style.css
git commit -m "menu: Play the attract demo behind the menu"
```

---

### Task 5: Version and documentation

**Files:**
- Modify: `js/strings.js:16`
- Modify: `README.md`

- [ ] **Step 1: Bump the version**

In `js/strings.js`, change line 16 from:

```js
  PV.VERSION = '1.3.0';
```

to:

```js
  PV.VERSION = '1.4.0';
```

- [ ] **Step 2: Describe it in the Modes section**

In `README.md`, after the paragraph ending "so a death always has a visible cause." (currently line 57), add a blank line and:

```markdown
The menu runs a demo behind it: a Normal round on autopilot, with the lit layer
rotating every four seconds. `prefers-reduced-motion` turns it off.
```

- [ ] **Step 3: Add the file to the code list**

In `README.md`, add one line to the file list, directly below the `js/game.js` line:

```
    js/attract.js   the autopilot demo behind the menu
```

- [ ] **Step 4: Record the load-order constraint**

In `README.md`, change the paragraph currently at lines 115-117 from:

```markdown
`maze.js` has to load before `entities.js`, `render.js` and `game.js`, which
read `PV.TILE` and the spawn table at load time. `main.js` has to load last.
Everything else in the script order is slack.
```

to:

```markdown
`maze.js` has to load before `entities.js`, `render.js` and `game.js`, which
read `PV.TILE` and the spawn table at load time. `attract.js` reads `PV.DIRS`
and the grid size, so it comes after `entities.js` too. `main.js` has to load
last. Everything else in the script order is slack.
```

- [ ] **Step 5: Add the test**

In `README.md`, change the paragraph and command block currently at lines 119-124 from:

```markdown
Two test suites, both plain node scripts with nothing to install. The second
covers the ghost release ladder, the house reveal and the dots blink, none of
which are visible to a layout check.

    node test/maze-test.js
    node test/opening-test.js
```

to:

```markdown
Three test suites, all plain node scripts with nothing to install. The second
covers the ghost release ladder, the house reveal and the dots blink, none of
which are visible to a layout check. The third covers the menu demo: that its
autopilot only steers into open tiles, that it eats, and that the layer
rotation reaches every layer.

    node test/maze-test.js
    node test/opening-test.js
    node test/attract-test.js
```

- [ ] **Step 6: Drop the stale line from Not done**

In `README.md`, change the line currently at line 149 from:

```markdown
- No bonus fruit, no attract mode.
```

to:

```markdown
- No bonus fruit.
```

- [ ] **Step 7: Verify the version renders**

Reload `http://localhost:8000/` and confirm the faint stamp in the bottom-right of the menu panel reads `v1.4.0`.

- [ ] **Step 8: Run everything one last time**

```bash
node test/maze-test.js && node test/opening-test.js && node test/attract-test.js
```

Expected: three all-ok lines, exit 0.

- [ ] **Step 9: Commit**

```bash
git add js/strings.js README.md
git commit -m "blinkman: Bump version to 1.4.0"
```

---

## Out of scope

Named here so nobody adds them mid-task:

- Any change to the HUD. It keeps showing `hud.showIdle()` and learns nothing about the demo.
- Any change to the menu panel, its layout, or its wording.
- Sound on the menu.
- A difficulty picker or mode preview for the demo. It runs Normal.
- Arcade-style attract sequences: no scripted chase, no character roll call, no demo-play banner.
