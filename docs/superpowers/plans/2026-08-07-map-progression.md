# Map Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board grows with the level — a 20x23 hand-tuned map at level 1, the arcade map at 28x31 by level 4, then density ramps within full size.

**Architecture:** `js/maze.js` gains a board template (dimensions, tunnel row, middle band, house bounds, spawn table, piece pools). `PV.createMaze(level, seed)` picks the template from the level and the pieces from the tier. Everything that reads board dimensions or spawn positions as a load-time `PV` constant moves to reading them off the maze object. `PV.TILE` stays 20, so the existing fit-to-window math in `main.js` gives small boards larger tiles for free.

**Tech Stack:** Plain ES5 scripts on a `window.PV` global. No modules, no bundler, no dependencies. Tests are bare `node` scripts.

**Spec:** `docs/superpowers/specs/2026-08-07-map-progression-design.md`

---

## Corrections to the spec

Two things surfaced while reading the code that the spec does not cover. Both are handled by tasks below.

1. **Ghost scatter tiles are hardcoded to 28x31.** `js/entities.js:154-163` sets scatter corners `{col:25,row:0}`, `{col:2,row:0}`, `{col:27,row:30}`, `{col:0,row:30}`. On a 20x23 board those are off the maze. Task 3 makes them board-relative.
2. **Dot count does not follow from board size.** A 24x27 board with dense pieces measured 252 pellets, more than the arcade's 242 on a larger board. Tier briefs therefore carry a dot target as a hard constraint alongside the score band, and Task 12 enforces monotonicity.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `js/maze.js` | board templates, piece pools, assembly, validation | heavy — new template concept, level-aware `createMaze` |
| `js/entities.js` | grid movement, ghost targeting, house exits | reads spawn/dimensions from the maze, board-relative scatter |
| `js/vision.js` | layer and cooldown state machine | per-maze pulse span and spawn centre |
| `js/render.js` | canvas drawing | per-maze design-space extent |
| `js/main.js` | input, frame loop, layout | `layout()` reruns on level change |
| `js/attract.js` | menu demo autopilot | per-maze typed arrays |
| `js/game.js` | rounds, scoring, level advance | passes level to `createMaze`, threads maze into actors |
| `test/maze-test.js` | the three authoring rules | generalises over templates |
| `test/progression-test.js` | the ramp actually ramps | new |
| `README.md` | player and contributor docs | maze section rewritten |

---

## Task 1: Board templates in maze.js

Introduce the template without changing any behaviour. `PV.COLS`, `PV.ROWS`, `PV.WIDTH`, `PV.HEIGHT` and `PV.SPAWN` stay exactly as they are so every consumer keeps working; later tasks migrate them one file at a time.

**Files:**
- Modify: `js/maze.js:12-13`, `:139-159`, `:183-190`, `:261-345`
- Test: `test/maze-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/maze-test.js`, immediately before the `var failures = 0;` line at `:63`:

```javascript
/* Board templates. The full board must describe exactly what the module
 * constants used to hardcode, so migrating consumers onto it is a no-op. */
var templateFailures = 0;
function expect(label, got, want) {
  if (got === want) return;
  templateFailures++;
  console.log('  TEMPLATE  ' + label + ': got ' + got + ', want ' + want);
}

var full = PV.BOARDS.full;
expect('full.cols', full.cols, 28);
expect('full.rows', full.rows, 31);
expect('full.tunnelRow', full.tunnelRow, 14);
expect('full.house.c0', full.house.c0, 10);
expect('full.house.c1', full.house.c1, 17);
expect('full.house.r0', full.house.r0, 12);
expect('full.house.r1', full.house.r1, 16);
expect('full.spawn.pacman.col', full.spawn.pacman.col, 13);
expect('full.spawn.pacman.row', full.spawn.pacman.row, 23);
expect('full.spawn.outside.row', full.spawn.outside.row, 11);
expect('full.spawn.inky.col', full.spawn.inky.col, 11);
expect('full.spawn.clyde.col', full.spawn.clyde.col, 15);

// A maze carries its own board, so nothing needs the module constants.
var m = PV.createMaze(9);
expect('maze.cols', m.cols, 28);
expect('maze.rows', m.rows, 31);
expect('maze.width', m.width, 560);
expect('maze.height', m.height, 620);
expect('maze.tunnelRow', m.tunnelRow, 14);
expect('maze.spawn.pacman.col', m.spawn.pacman.col, 13);
expect('maze.board', m.board, 'full');
```

And change the final result lines at `:114-118` to include it:

```javascript
var ok = failures === 0 && reproducible && distinct === combos && templateFailures === 0;
console.log('');
console.log('board templates:          ' + (templateFailures === 0 ? 'PASS' : 'FAIL'));
console.log(ok ? 'ALL ' + combos + ' MAZE COMBINATIONS VALID'
               : failures + ' COMBINATION(S) REJECTED');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/maze-test.js`
Expected: FAIL — `TypeError: Cannot read properties of undefined (reading 'full')`, because `PV.BOARDS` does not exist yet.

- [ ] **Step 3: Add the template**

In `js/maze.js`, rename the existing `MIDDLE` array (`:19-31`) to `MIDDLE_FULL`, leaving its contents untouched. Then insert after the `BOTTOM_PIECES` array closes at `:137`:

```javascript
  /* A board template is the shape a pair of pieces drops into: dimensions, the
   * tunnel row, the fixed middle band, the ghost-house block, and where the
   * seven actors start. `house` is the block including its walls; the sealed
   * interior is that shrunk by one on every side.
   *
   * Scatter corners are derived from the board rather than stored — see
   * PV.scatterCorners below. */
  var BOARDS = {
    full: {
      id: 'full',
      cols: 28, rows: 31, tunnelRow: 14,
      middle: MIDDLE_FULL,
      house: { c0: 10, c1: 17, r0: 12, r1: 16 },
      spawn: {
        pacman:  { col: 13, row: 23 },
        door:    { col: 13, row: 12 },
        outside: { col: 13, row: 11 },
        blinky:  { col: 13, row: 13 },
        pinky:   { col: 13, row: 14 },
        inky:    { col: 11, row: 14 },
        clyde:   { col: 15, row: 14 }
      }
    }
  };

  PV.BOARDS = BOARDS;

  /* The four corners a ghost retreats to in scatter, as offsets from the board
   * rather than fixed tiles, so they land inside every template. The two-in
   * inset on the top pair is the arcade's. */
  PV.scatterCorners = function (board) {
    return {
      blinky: { col: board.cols - 3, row: 0 },
      pinky:  { col: 2,              row: 0 },
      inky:   { col: board.cols - 1, row: board.rows - 1 },
      clyde:  { col: 0,              row: board.rows - 1 }
    };
  };
```

Delete the standalone `SPAWN` object at `:139-147` and the `PV.SPAWN = SPAWN;` line at `:155`; replace every remaining `SPAWN.` reference inside the module with `board.spawn.`. Keep `PV.COLS`, `PV.ROWS`, `PV.WIDTH`, `PV.HEIGHT` as they are, and add back a compatibility alias next to them so other files keep working until their own task:

```javascript
  PV.SPAWN = BOARDS.full.spawn;   // removed in Task 8
```

- [ ] **Step 4: Make assembly and validation take a board**

Replace `PV.assembleLayout` (`:183-190`), `inGhostHouse` (`:179-181`) and `PV.checkLayout` (`:195-256`) so they take the board rather than closing over module constants:

```javascript
  // The sealed interior of the ghost house: the block minus its walls.
  function inGhostHouse(board, c, r) {
    var h = board.house;
    return r > h.r0 && r < h.r1 && c > h.c0 && c < h.c1;
  }

  PV.assembleLayout = function (board, topPiece, bottomPiece) {
    var border = new Array(board.cols / 2 + 1).join('#');
    return [border]
      .concat(topPiece.rows)
      .concat(board.middle)
      .concat(bottomPiece.rows)
      .concat([border])
      .map(mirror);
  };
```

In `PV.checkLayout`, change the signature to `function (board, layout)` and replace every `ROWS` with `board.rows`, every `COLS` with `board.cols`, every `TUNNEL_ROW` with `board.tunnelRow`, `SPAWN` with `board.spawn`, and `inGhostHouse(c, r)` with `inGhostHouse(board, c, r)`. Replace the hardcoded sparsity floor:

```javascript
    if (pellets < board.minPellets) {
      problems.push('only ' + pellets + ' pellets — below this board\'s floor of ' + board.minPellets);
    }
```

and add `minPellets: 150` to the `full` template.

- [ ] **Step 5: Make createMaze build from a board**

Replace `PV.createMaze` (`:261-345`). The signature stays `(seed)` for now — Task 7 adds the level:

```javascript
  PV.createMaze = function (seed) {
    if (seed == null) seed = (Math.random() * 0xffffffff) >>> 0;
    var rand = mulberry32(seed);
    var board = BOARDS.full;

    var top = TOP_PIECES[Math.floor(rand() * TOP_PIECES.length)];
    var bottom = BOTTOM_PIECES[Math.floor(rand() * BOTTOM_PIECES.length)];
    var layout = PV.assembleLayout(board, top, bottom);

    var problems = PV.checkLayout(board, layout);
    if (problems.length) {
      var key = board.id + ' ' + top.id + '/' + bottom.id;
      if (!warned[key]) {
        warned[key] = true;
        console.error('maze: layout ' + key + ' rejected (' + problems.join('; ') +
          ') — falling back to the classic layout. Run test/maze-test.js.');
      }
      top = TOP_PIECES[0];
      bottom = BOTTOM_PIECES[0];
      layout = PV.assembleLayout(board, top, bottom);
    }

    return buildMaze(board, layout, seed, top.id + '/' + bottom.id);
  };
```

Extract the body from the old `var walls = []` onward into a `buildMaze(board, layout, seed, recipe)` function. Inside it, replace `ROWS`/`COLS`/`TUNNEL_ROW` with `board.rows`/`board.cols`/`board.tunnelRow`, pass `board` into `buildEdges`, and extend the returned object:

```javascript
    var maze = {
      board: board.id,
      cols: board.cols, rows: board.rows, tile: TILE,
      width: board.cols * TILE, height: board.rows * TILE,
      tunnelRow: board.tunnelRow,
      spawn: board.spawn,
      scatter: PV.scatterCorners(board),
      house: board.house,
      walls: walls, doors: doors, pellets: pellets,
      totalPellets: pelletsLeft,
      seed: seed,
      recipe: recipe,
      // ... the rest unchanged
```

- [ ] **Step 6: Run the test**

Run: `node test/maze-test.js`
Expected: PASS — all 16 combinations ok, `board templates: PASS`, `seed reproducible: PASS`.

- [ ] **Step 7: Run the rest of the suite**

Run: `node test/opening-test.js && node test/torch-test.js && node test/attract-test.js && node test/modes-test.js`
Expected: all PASS. Nothing outside `maze.js` has changed yet.

- [ ] **Step 8: Commit**

```bash
git add js/maze.js test/maze-test.js
git commit -m "maze: Describe the board as a template"
```

---

## Task 2: Score a layout

The tier bands need a measured number. Put the metric in `maze.js` so both the test and the piece-authoring agents use the same one.

**Files:**
- Modify: `js/maze.js`
- Test: `test/maze-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/maze-test.js` after the template block from Task 1:

```javascript
/* The complexity score the tier bands are expressed in. Pinned to the arcade
 * layout so a change to the metric has to be deliberate. */
var arcade = PV.assembleLayout(PV.BOARDS.full, PV.TOP_PIECES[0], PV.BOTTOM_PIECES[0]);
var sc = PV.scoreLayout(PV.BOARDS.full, arcade);
expect('arcade junctions', sc.junctions, 34);
expect('arcade corners', sc.corners, 30);
expect('arcade score', sc.score, 64);
expect('arcade pellets', sc.pellets, 242);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/maze-test.js`
Expected: FAIL — `PV.scoreLayout is not a function`.

- [ ] **Step 3: Implement**

Add to `js/maze.js`, after `PV.checkLayout`:

```javascript
  /* How cut-up a layout is. Junctions are tiles with three or more walkable
   * neighbours, corners are two-neighbour tiles where the two do not face each
   * other. Their sum is the score the tier bands are drawn against; the house
   * interior is excluded because it is the same at every size. */
  PV.scoreLayout = function (board, layout) {
    var junctions = 0, corners = 0, pellets = 0;

    /* The tunnel row wraps, so a mouth reads as the straight corridor it is
     * rather than as a corner. Wrapping here covers both the neighbour count
     * and the facing test below. */
    function isOpen(c, r) {
      if (r === board.tunnelRow) {
        if (c < 0) c = board.cols - 1;
        else if (c >= board.cols) c = 0;
      }
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
      var ch = layout[r][c];
      return ch !== '#' && ch !== '-';
    }

    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        var ch = layout[r][c];
        if (ch === '.' || ch === 'o') pellets++;
        if (!isOpen(c, r) || inGhostHouse(board, c, r)) continue;

        var u = isOpen(c, r - 1), d = isOpen(c, r + 1);
        var l = isOpen(c - 1, r), rt = isOpen(c + 1, r);
        var deg = (u ? 1 : 0) + (d ? 1 : 0) + (l ? 1 : 0) + (rt ? 1 : 0);

        if (deg >= 3) junctions++;
        else if (deg === 2 && !((u && d) || (l && rt))) corners++;
      }
    }
    return { junctions: junctions, corners: corners, score: junctions + corners,
             pellets: pellets };
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/maze-test.js`
Expected: PASS, including the four new `arcade` expectations.

- [ ] **Step 5: Commit**

```bash
git add js/maze.js test/maze-test.js
git commit -m "maze: Score how cut-up a layout is"
```

---

## Task 3: entities.js reads the maze

`EXIT_X`, `EXIT_Y`, `DOOR_Y` and `HOUSE_Y` at `js/entities.js:166-169` are computed once at load from `PV.SPAWN`. They and the scatter corners have to come from the live maze.

**Files:**
- Modify: `js/entities.js:52-53`, `:111-112`, `:154-163`, `:166-169`, `:177-183`, `:186-189`, `:287`, `:305`
- Test: `test/opening-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/opening-test.js`, before its final result block:

```javascript
/* Actors take their positions from the maze they are placed in, not from a
 * table read at load time. */
var boardFailures = 0;
function boardExpect(label, got, want) {
  if (got === want) return;
  boardFailures++;
  console.log('  BOARD  ' + label + ': got ' + got + ', want ' + want);
}

var maze = PV.createMaze(7);
var pac = PV.createPacman(maze);
boardExpect('pacman x', pac.x, PV.center(maze.spawn.pacman.col));
boardExpect('pacman y', pac.y, PV.center(maze.spawn.pacman.row));

var ghosts = PV.createGhosts(maze);
boardExpect('blinky scatter col', ghosts[0].scatterTile.col, maze.cols - 3);
boardExpect('pinky scatter col', ghosts[1].scatterTile.col, 2);
boardExpect('inky scatter col', ghosts[2].scatterTile.col, maze.cols - 1);
boardExpect('inky scatter row', ghosts[2].scatterTile.row, maze.rows - 1);
boardExpect('clyde scatter row', ghosts[3].scatterTile.row, maze.rows - 1);

// Every scatter corner is on the board.
ghosts.forEach(function (g) {
  var t = g.scatterTile;
  var inside = t.col >= 0 && t.col < maze.cols && t.row >= 0 && t.row < maze.rows;
  boardExpect(g.name + ' scatter on board', inside, true);
});

// A ghost still in the house reads as fully revealed; one on the exit tile does not.
var houseGhost = ghosts[1];
houseGhost.state = 'house';
houseGhost.y = PV.center(maze.spawn.pinky.row);
boardExpect('house ghost revealed', PV.ghostReveal(houseGhost, maze), 1);
houseGhost.state = 'leaving';
houseGhost.y = PV.center(maze.spawn.outside.row);
boardExpect('exited ghost hidden', PV.ghostReveal(houseGhost, maze), 0);
```

Add `boardFailures === 0` to that file's final `ok` expression and print `board-relative actors: PASS/FAIL`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/opening-test.js`
Expected: FAIL — `createPacman` ignores its argument and `PV.ghostReveal` takes one argument, so the reveal checks return the wrong value.

- [ ] **Step 3: Implement**

In `js/entities.js`:

Tunnel wrap at `:52-53` — `advance` already receives `maze`:

```javascript
    if (col < 0) e.x += maze.width;
    else if (col >= maze.cols) e.x -= maze.width;
```

`createPacman` at `:100` takes the maze and stores it:

```javascript
  PV.createPacman = function (maze) {
    var pac = {
      ...
      reset: function () {
        this.x = PV.center(maze.spawn.pacman.col);
        this.y = PV.center(maze.spawn.pacman.row);
```

Drop `scatter` from the four `GHOST_DEFS` entries at `:154-163`, keeping `name`, `color`, `spawn` and `release`. Delete the four module constants at `:166-169`. Rewrite `PV.ghostReveal` at `:177-183`:

```javascript
  PV.ghostReveal = function (g, maze) {
    if (!IN_HOUSE[g.state]) return 0;
    var exitY = PV.center(maze.spawn.outside.row);
    var doorY = PV.center(maze.spawn.door.row);
    var t = (g.y - exitY) / (doorY - exitY);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
```

`createGhosts` at `:185` takes the maze and pulls both spawn and scatter from it:

```javascript
  PV.createGhosts = function (maze) {
    var scatter = maze.scatter;
    return GHOST_DEFS.map(function (def) {
      var spawn = maze.spawn[def.spawn];
      var g = {
        name: def.name,
        color: def.color,
        scatterTile: scatter[def.name],
```

Anywhere inside a ghost's own methods that used `EXIT_X`, `EXIT_Y`, `DOOR_Y` or `HOUSE_Y`, compute from `maze.spawn` at the top of the method instead. At `:287` and `:305`, replace `PV.SPAWN.outside` with `maze.spawn.outside`; `updateGhost` already receives `maze`, and `PV.ghostTarget` gains a `maze` parameter:

```javascript
  PV.ghostTarget = function (g, mode, pac, blinky, maze) {
    if (g.state === 'eaten') return maze.spawn.outside;
```

- [ ] **Step 4: Update the one call site**

`js/game.js:309` passes the maze through:

```javascript
        var target = PV.ghostTarget(g, mode, game.pacman, game.ghosts[0], game.maze);
```

and `js/game.js:84-86` constructs the actors from the maze. Because object-literal properties evaluate in order and `maze` is built first, hoist it out:

```javascript
    var maze = PV.createMaze();

    var game = {
      difficulty: difficultyId,
      rules: rules,
      maze: maze,
      pacman: PV.createPacman(maze),
      ghosts: PV.createGhosts(maze),
      vision: PV.createVision(rules),
```

- [ ] **Step 5: Run tests**

Run: `node test/opening-test.js && node test/maze-test.js && node test/torch-test.js && node test/attract-test.js && node test/modes-test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/game.js test/opening-test.js
git commit -m "entities: Take positions from the maze"
```

---

## Task 4: vision.js reads the maze

`PULSE_SPAN` at `js/vision.js:20` and `SPAWN_CENTRE` at `:40-43` are load-time constants. A ping on a small board should finish its sweep sooner, not linger after covering everything.

**Files:**
- Modify: `js/vision.js:17-20`, `:38-43`
- Test: `test/torch-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/torch-test.js` before its result block:

```javascript
/* A ping's ring spans the board it is fired on. */
var spanFailures = 0;
var fullMaze = PV.createMaze(3);
var span = PV.pulseSpan(fullMaze);
if (Math.abs(span - Math.hypot(560, 620)) > 1e-6) {
  spanFailures++;
  console.log('  PULSE  full board span: got ' + span + ', want ' + Math.hypot(560, 620));
}
var centre = PV.pulseOrigin(fullMaze);
if (centre.x !== PV.center(fullMaze.spawn.pacman.col)) {
  spanFailures++;
  console.log('  PULSE  origin x: got ' + centre.x);
}
```

Add `spanFailures === 0` to the file's `ok` expression.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/torch-test.js`
Expected: FAIL — `PV.pulseSpan is not a function`.

- [ ] **Step 3: Implement**

In `js/vision.js`, delete the `PULSE_SPAN` constant at `:20` and the `SPAWN_CENTRE` object at `:40-43`, and add:

```javascript
  /* The worst case a ping has to cross: a corner origin to the far corner. */
  PV.pulseSpan = function (maze) { return Math.hypot(maze.width, maze.height); };

  /* Where a ping fires from when there is no Pac-Man to ask — the free one a
   * round opens with. */
  PV.pulseOrigin = function (maze) {
    return { x: PV.center(maze.spawn.pacman.col), y: PV.center(maze.spawn.pacman.row) };
  };
```

`pulseLife` at `:34-36` takes the maze:

```javascript
  function pulseLife(maze, rules) {
    return PV.pulseSpan(maze) / PULSE_SPEED + rules.hold + rules.fade;
  }
```

Thread `maze` through every caller of `pulseLife` and every reader of the two deleted constants inside `js/vision.js`. Where the vision state machine has no maze in scope, add it as a parameter on the enclosing function and pass `game.maze` from `js/game.js`.

- [ ] **Step 4: Run tests**

Run: `node test/torch-test.js && node test/modes-test.js && node test/opening-test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/vision.js test/torch-test.js
git commit -m "vision: Span the board the ping is fired on"
```

---

## Task 5: render.js and main.js size to the maze

**Files:**
- Modify: `js/render.js:7`, `:165-167`, `:415`; `js/main.js:28-58`
- Test: none automated — verified by running the game

- [ ] **Step 1: render.js**

At `:165-167`, the transform's clear rect uses the live maze:

```javascript
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, game.maze.width, game.maze.height);
```

Update the comment above it — it names a fixed 560x620 design space that no longer exists:

```javascript
        // Everything below is authored in the maze's design space, 20px to a
        // tile; this maps it onto the real canvas size so the board stays sharp.
```

At `:415`, `torchSwing` needs the board centre. Add a `maze` parameter to `torchSwing` and to the function that calls it, and pass `game.maze` down:

```javascript
        var toMiddle = Math.atan2(maze.height / 2 - y, maze.width / 2 - x);
```

`drawWalls`, `drawPellets` and `drawHouseDoors` already loop on `maze.rows` / `maze.cols` (`:205-206`, `:230-231`) and need no change.

- [ ] **Step 2: main.js**

`layout()` at `:28-58` takes its extent from the live maze, falling back to the full board on the menu screen where no game exists:

```javascript
  function layout() {
    var styles = getComputedStyle(appEl);
    var padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    var padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    var gap = parseFloat(styles.columnGap || styles.gap) || 0;

    var availW = appEl.clientWidth - padX - hudEl.offsetWidth - gap;
    var availH = appEl.clientHeight - padY;

    // The live board, or the full one behind the menu.
    var src = (game || attract && attract.game || {}).maze;
    var bw = src ? src.width : PV.BOARDS.full.cols * PV.TILE;
    var bh = src ? src.height : PV.BOARDS.full.rows * PV.TILE;

    // largest board-shaped rectangle that fits beside the HUD
    var fit = Math.max(0.35, Math.min(availW / bw, availH / bh));
    var w = Math.floor(bw * fit);
    var h = Math.floor(bh * fit);

    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.setProperty('--sc', (w / bw).toFixed(4));

    // Backing store at device resolution, capped at 2x.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    renderer.setScale(canvas.width / bw);

    if (!game) renderer.clear();   // menu screen has nothing to redraw
  }
```

- [ ] **Step 3: Rerun layout when the board changes**

`layout()` currently runs only on resize (`:60`). The board changes on level advance and on restart, so track it and re-run when it differs. Add near the other module state at `:22-26`:

```javascript
  var boardKey = '';       // re-lays out when the level changes the board size
```

and in the frame loop, before rendering:

```javascript
    var key = game ? game.maze.cols + 'x' + game.maze.rows : '';
    if (key !== boardKey) { boardKey = key; layout(); }
```

- [ ] **Step 4: Verify by running the game**

Run: `python3 -m http.server 8000` and open `http://localhost:8000`.
Expected: the game plays exactly as before. Nothing has changed size yet — every maze is still the full board — so this is a no-visible-change refactor. Confirm the board still fills its space and the walls are sharp.

- [ ] **Step 5: Commit**

```bash
git add js/render.js js/main.js
git commit -m "render: Size the design space to the maze"
```

---

## Task 6: attract.js sizes to the maze

`js/attract.js:8-9` caches `COLS`, `ROWS` and `CELLS` at load, and `:27-31` allocates five typed arrays from `CELLS`. Those must follow the demo's own maze.

**Files:**
- Modify: `js/attract.js:8-9`, `:27-46`, `:69`, `:114`
- Test: `test/attract-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/attract-test.js` before its result block:

```javascript
/* The autopilot's scratch buffers follow the maze it is steering on. */
var sizeFailures = 0;
var small = { cols: 20, rows: 23 };
var demo = PV.createAttract();
demo.start();
if (demo.game.maze.cols * demo.game.maze.rows <= 0) {
  sizeFailures++;
  console.log('  ATTRACT  demo has no maze');
}
// Steering only ever proposes open tiles, whatever the board size.
for (var i = 0; i < 600; i++) {
  demo.update(1 / 60);
  var t = demo.game.pacman.tile();
  if (t.col < 0 || t.col >= demo.game.maze.cols || t.row < 0 || t.row >= demo.game.maze.rows) {
    sizeFailures++;
    console.log('  ATTRACT  pacman left the board at c' + t.col + ',r' + t.row);
    break;
  }
}
```

Add `sizeFailures === 0` to the file's `ok` expression.

- [ ] **Step 2: Run test to verify it fails or passes trivially**

Run: `node test/attract-test.js`
Expected: PASS at this point (the demo still runs on the full board). This test is a guard for Task 9, when the demo could be handed a different size. Record that it passes.

- [ ] **Step 3: Implement**

Delete `:8-9`. Inside `PV.createAttract`, after the game is created, derive the sizes and allocate lazily so a board change reallocates:

```javascript
    var cols = 0, rows = 0, cells = 0;
    var dangerSeen, dangerDist, routeSeen, routeFirst, queue;

    function sizeTo(maze) {
      if (maze.cols === cols && maze.rows === rows) return;
      cols = maze.cols; rows = maze.rows; cells = cols * rows;
      dangerSeen = new Int32Array(cells);
      dangerDist = new Int16Array(cells);
      routeSeen = new Int32Array(cells);
      routeFirst = new Int8Array(cells);
      queue = new Int32Array(cells);
    }

    function idx(col, row) { return row * cols + col; }

    function wrapCol(col) {
      return col < 0 ? col + cols : col >= cols ? col - cols : col;
    }

    function walkable(col, row) {
      return row >= 0 && row < rows && game.maze.passable(col, row, false);
    }
```

Call `sizeTo(game.maze)` at the top of the demo's `update`, and replace the two `cur % COLS` / `(cur / COLS) | 0` decompositions at `:69` and `:114` with `cols`.

- [ ] **Step 4: Run tests**

Run: `node test/attract-test.js && node test/maze-test.js`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add js/attract.js test/attract-test.js
git commit -m "attract: Size the autopilot buffers to its maze"
```

---

## Task 7: The level picks the board

**Files:**
- Modify: `js/maze.js`, `js/game.js:84`, `:135-136`, `:141-144`
- Test: `test/maze-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/maze-test.js`:

```javascript
/* The level chooses the board and the tier; the seed chooses within it. */
expect('L1 board', PV.createMaze(1, 5).board, 'small');
expect('L2 board', PV.createMaze(2, 5).board, 'mid');
expect('L3 board', PV.createMaze(3, 5).board, 'large');
expect('L4 board', PV.createMaze(4, 5).board, 'full');
expect('L4 recipe', PV.createMaze(4, 5).recipe, 'T1/B1');
expect('L5 board', PV.createMaze(5, 5).board, 'full');
expect('L9 board', PV.createMaze(9, 5).board, 'full');

// Level 4 is the arcade map whatever the seed.
var arcadeAlways = true;
for (var s = 0; s < 200; s++) if (PV.createMaze(4, s).recipe !== 'T1/B1') arcadeAlways = false;
expect('L4 always arcade', arcadeAlways, true);

// Deterministic in both arguments.
expect('same level+seed', PV.createMaze(6, 42).recipe, PV.createMaze(6, 42).recipe);
```

Note: the three small boards do not exist until Task 9, so this test is expected to fail until then. Add the assertions now and let them ride red through Task 8 — Task 9 is what turns them green.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/maze-test.js`
Expected: FAIL — `createMaze` takes one argument, so `PV.createMaze(1, 5)` reads level 1 as the seed and returns the full board.

- [ ] **Step 3: Add the level plan**

In `js/maze.js`, add above `PV.createMaze`:

```javascript
  /* Which board and which pool a level draws from. Levels 1 and 4 are fixed
   * maps rather than a pool: an on-ramp a player can learn, and the arcade
   * layout as a landmark. */
  var LADDER = [
    { upTo: 1,        board: 'small', fixed: true },
    { upTo: 2,        board: 'mid',   tier: 'gentle' },
    { upTo: 3,        board: 'large', tier: 'medium' },
    { upTo: 4,        board: 'full',  fixed: true },
    { upTo: 6,        board: 'full',  tier: 'classic' },
    { upTo: 8,        board: 'full',  tier: 'dense' },
    { upTo: Infinity, board: 'full',  tier: 'densest' }
  ];

  PV.planFor = function (level) {
    for (var i = 0; i < LADDER.length; i++) {
      if (level <= LADDER[i].upTo) return LADDER[i];
    }
    return LADDER[LADDER.length - 1];
  };
```

- [ ] **Step 4: Make createMaze level-aware**

```javascript
  PV.createMaze = function (level, seed) {
    if (level == null) level = 1;
    if (seed == null) seed = (Math.random() * 0xffffffff) >>> 0;
    var rand = mulberry32(seed);

    var plan = PV.planFor(level);
    var board = BOARDS[plan.board];
    var top, bottom;

    if (plan.fixed) {
      top = board.tiers.fixed.top[0];
      bottom = board.tiers.fixed.bottom[0];
    } else {
      var pool = board.tiers[plan.tier];
      top = pool.top[Math.floor(rand() * pool.top.length)];
      bottom = pool.bottom[Math.floor(rand() * pool.bottom.length)];
    }

    var layout = PV.assembleLayout(board, top, bottom);
    var problems = PV.checkLayout(board, layout);
    if (problems.length) {
      var key = board.id + ' ' + top.id + '/' + bottom.id;
      if (!warned[key]) {
        warned[key] = true;
        console.error('maze: layout ' + key + ' rejected (' + problems.join('; ') +
          ') — falling back to the classic layout. Run test/maze-test.js.');
      }
      board = BOARDS.full;
      top = board.tiers.fixed.top[0];
      bottom = board.tiers.fixed.bottom[0];
      layout = PV.assembleLayout(board, top, bottom);
    }

    return buildMaze(board, layout, seed, top.id + '/' + bottom.id);
  };
```

Give the `full` template its pools, reusing the existing arrays:

```javascript
      tiers: {
        fixed:   { top: [TOP_PIECES[0]], bottom: [BOTTOM_PIECES[0]] },
        classic: { top: TOP_PIECES,      bottom: BOTTOM_PIECES }
      }
```

`dense` and `densest` are added in Task 13. Until then, `PV.planFor` returning them will throw — acceptable while the ladder is under construction, and Task 13 closes it.

- [ ] **Step 5: Update game.js**

`js/game.js:84`, `:135-136` and `:141-144`. Note the ordering bug in `restart`: it currently builds the maze before resetting `level` to 1, which would give a restart the wrong board.

```javascript
    var maze = PV.createMaze(1);

    // ... inside the game object, unchanged: maze: maze,

    game.nextLevel = function () {
      game.level++;
      game.maze = PV.createMaze(game.level);
      game.dotsEaten = 0;
      game.startRound();
    };

    game.restart = function () {
      game.level = 1;                       // before the maze, which reads it
      game.maze = PV.createMaze(game.level);
      game.score = 0;
      game.lives = 3;
      game.dotsEaten = 0;
      game.pops = [];
      game.startRound();
    };
```

- [ ] **Step 6: Run tests**

Run: `node test/maze-test.js`
Expected: FAIL on the `L1 board` / `L2 board` / `L3 board` assertions — the small templates do not exist yet. The `L4`, `L5` and determinism assertions should PASS.

- [ ] **Step 7: Commit**

```bash
git add js/maze.js js/game.js test/maze-test.js
git commit -m "maze: Let the level choose the board"
```

---

## Task 8: Delete the module-level board constants

**Files:**
- Modify: `js/maze.js:151-157`
- Test: whole suite

- [ ] **Step 1: Delete**

Remove these five lines from `js/maze.js`:

```javascript
  PV.COLS = COLS;
  PV.ROWS = ROWS;
  PV.WIDTH = COLS * TILE;
  PV.HEIGHT = ROWS * TILE;
  PV.SPAWN = BOARDS.full.spawn;
```

Keep `PV.TILE`, `PV.TOP_PIECES`, `PV.BOTTOM_PIECES`, `PV.center` and `PV.tileOf`. Delete the now-unused `COLS`, `ROWS` and `TUNNEL_ROW` module vars at `:12-13`.

- [ ] **Step 2: Find every straggler**

Run: `grep -rn "PV\.COLS\|PV\.ROWS\|PV\.WIDTH\|PV\.HEIGHT\|PV\.SPAWN\|PV\.TUNNEL_ROW" js/ test/`
Expected: two hits remain — `js/game.js:358` and `test/maze-test.js`'s `wideSpots`/`deadEnds`. Fix `game.js:358`, which measures tunnel-aware distance:

```javascript
        dx = Math.min(dx, game.maze.width - dx);
```

`test/maze-test.js` is rewritten in Task 11.

- [ ] **Step 3: Run the whole suite**

Run: `node test/maze-test.js; node test/opening-test.js && node test/torch-test.js && node test/attract-test.js && node test/modes-test.js`
Expected: `maze-test.js` still fails only on the three missing small boards. The other four PASS.

- [ ] **Step 4: Verify in the browser**

Run: `python3 -m http.server 8000`, play a level through to a level-clear.
Expected: identical to before. Level 2 still draws the full board because the small templates do not exist.

- [ ] **Step 5: Commit**

```bash
git add js/maze.js js/game.js
git commit -m "maze: Drop the module-level board constants"
```

---

## Task 9: The three small board templates

The middle bands below are validated: full reachability, no 2x2 outside the house block, no dead ends, all seven spawns on legal tiles.

**Files:**
- Modify: `js/maze.js`
- Test: `test/maze-test.js`

- [ ] **Step 1: Add the templates**

In `js/maze.js`, above the `BOARDS` object:

```javascript
  /* Rows 8-14 of the small board. The house is the full 8x5 block with a 6x3
   * interior at every size; what shrinks is the playfield beside it. The band's
   * top and bottom rows double as the maze's horizontal corridors rather than
   * being a dedicated moat, which is what makes a full house fit. */
  var MIDDLE_SMALL = [
    '#....     ',
    '#.### ###-',
    '#.### #   ',
    '      #   ',     // tunnel
    '#.### #   ',
    '#.### ####',
    '#....     '
  ];

  // Rows 9-15 of the mid board.
  var MIDDLE_MID = [
    '#.....     ',
    '#.##.# ###-',
    '#.##.# #   ',
    '       #   ',    // tunnel
    '#.##.# #   ',
    '#.##.# ####',
    '#.....     '
  ];

  // Rows 10-16 of the large board.
  var MIDDLE_LARGE = [
    '#.....      ',
    '#.###.# ###-',
    '#.###.# #   ',
    '        #   ',   // tunnel
    '#.###.# #   ',
    '#.###.# ####',
    '#.....      '
  ];
```

And three entries in `BOARDS`:

```javascript
    small: {
      id: 'small',
      cols: 20, rows: 23, tunnelRow: 11,
      middle: MIDDLE_SMALL,
      house: { c0: 6, c1: 13, r0: 9, r1: 13 },
      minPellets: 110,
      spawn: {
        pacman:  { col: 9, row: 17 },
        door:    { col: 9, row: 9 },
        outside: { col: 9, row: 8 },
        blinky:  { col: 9, row: 10 },
        pinky:   { col: 9, row: 11 },
        inky:    { col: 7, row: 11 },
        clyde:   { col: 11, row: 11 }
      },
      tiers: {}      // filled by Task 10
    },
    mid: {
      id: 'mid',
      cols: 22, rows: 25, tunnelRow: 12,
      middle: MIDDLE_MID,
      house: { c0: 7, c1: 14, r0: 10, r1: 14 },
      minPellets: 130,
      spawn: {
        pacman:  { col: 10, row: 19 },
        door:    { col: 10, row: 10 },
        outside: { col: 10, row: 9 },
        blinky:  { col: 10, row: 11 },
        pinky:   { col: 10, row: 12 },
        inky:    { col: 8,  row: 12 },
        clyde:   { col: 12, row: 12 }
      },
      tiers: {}      // filled by Task 12
    },
    large: {
      id: 'large',
      cols: 24, rows: 27, tunnelRow: 13,
      middle: MIDDLE_LARGE,
      house: { c0: 8, c1: 15, r0: 11, r1: 15 },
      minPellets: 160,
      spawn: {
        pacman:  { col: 11, row: 20 },
        door:    { col: 11, row: 11 },
        outside: { col: 11, row: 10 },
        blinky:  { col: 11, row: 12 },
        pinky:   { col: 11, row: 13 },
        inky:    { col: 9,  row: 13 },
        clyde:   { col: 13, row: 13 }
      },
      tiers: {}      // filled by Task 12
    },
```

Add `topRows` and `bottomRows` to all four templates, including `full`. Task 12's
harness and Task 14's row-budget check both read them, and every authored piece
must match exactly:

| Board | Authored cols | `topRows` | `bottomRows` |
|---|---|---|---|
| small 20x23 | 10 | 7 | 7 |
| mid 22x25 | 11 | 8 | 8 |
| large 24x27 | 12 | 9 | 9 |
| full 28x31 | 14 | 8 | 10 |

- [ ] **Step 2: Commit**

```bash
git add js/maze.js
git commit -m "maze: Add the three small board templates"
```

---

## Task 10: The level 1 map

**Files:**
- Modify: `js/maze.js`
- Test: `test/maze-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/maze-test.js`:

```javascript
/* Level 1: the on-ramp. Small, open, and the same every game. */
var l1 = PV.createMaze(1, 11);
expect('L1 board', l1.board, 'small');
expect('L1 cols', l1.cols, 20);
expect('L1 rows', l1.rows, 23);
expect('L1 pellets', l1.totalPellets, 128);

var l1Same = true;
for (var s = 0; s < 200; s++) if (PV.createMaze(1, s).totalPellets !== 128) l1Same = false;
expect('L1 fixed across seeds', l1Same, true);

var l1Layout = PV.assembleLayout(PV.BOARDS.small,
  PV.BOARDS.small.tiers.fixed.top[0], PV.BOARDS.small.tiers.fixed.bottom[0]);
var l1Score = PV.scoreLayout(PV.BOARDS.small, l1Layout);
expect('L1 score', l1Score.score, 36);
if (PV.checkLayout(PV.BOARDS.small, l1Layout).length) {
  templateFailures++;
  console.log('  L1 BROKEN: ' + PV.checkLayout(PV.BOARDS.small, l1Layout).join('; '));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/maze-test.js`
Expected: FAIL — `PV.BOARDS.small.tiers.fixed` is undefined.

- [ ] **Step 3: Add the map**

These pieces are validated: 128 pellets, 4 power pellets, 28 junctions, 10 corners, score 38, no 2x2, no dead ends, nothing unreachable.

```javascript
  /* The level 1 map. Deliberately the same every game — it is the one board a
   * new player can build a mental model of, which is what makes a game about
   * not being able to see learnable at all. */
  var SMALL_FIXED_TOP = { id: 'S1', rows: [
    '#........#',
    '#.######.#',
    '#o######.#',
    '#........ ',
    '#.####.###',
    '#.####.###',
    '#.####.###'
  ]};

  var SMALL_FIXED_BOTTOM = { id: 'S1', rows: [
    '#.####.###',
    '#.####.###',
    '#o....... ',
    '#.######.#',
    '#.######.#',
    '#.######.#',
    '#........#'
  ]};
```

and on the `small` template:

```javascript
      tiers: {
        fixed: { top: [SMALL_FIXED_TOP], bottom: [SMALL_FIXED_BOTTOM] }
      }
```

- [ ] **Step 4: Run tests**

Run: `node test/maze-test.js`
Expected: the level 1 assertions PASS. `L2 board` / `L3 board` still FAIL — Task 12 fills those pools.

- [ ] **Step 5: Verify in the browser**

Run: `python3 -m http.server 8000`, start a round.
Expected: level 1 draws a visibly smaller board with noticeably larger tiles, filling the same space on screen. All four ghosts sit in the house. The tunnel wraps. Clearing it advances to level 2.

- [ ] **Step 6: Commit**

```bash
git add js/maze.js test/maze-test.js
git commit -m "maze: Add the level 1 map"
```

---

## Task 11: Generalise the maze test

`test/maze-test.js` closes over `PV.ROWS`, `PV.COLS` and a hardcoded house rectangle. It has to check every board.

**Files:**
- Rewrite: `test/maze-test.js`

- [ ] **Step 1: Rewrite the two rule checks**

Replace `wideSpots` (`:15-32`) and `deadEnds` (`:37-61`) so both take a board:

```javascript
function openAt(board, layout, c, r) {
  if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
  var ch = layout[r][c];
  return ch !== '#' && ch !== '-';
}

/* A 2x2 block of open tiles is a two-wide corridor. Real Pac-Man mazes have
 * none, and it would let a ghost slide past Pac-Man in the same passage.
 * The ghost-house block is the one legitimate exception. */
function wideSpots(board, layout) {
  var hits = [];
  var h = board.house;
  for (var r = 0; r < board.rows - 1; r++) {
    for (var c = 0; c < board.cols - 1; c++) {
      if (c >= h.c0 && c <= h.c1 && r >= h.r0 && r <= h.r1) continue;
      if (openAt(board, layout, c, r) && openAt(board, layout, c + 1, r) &&
          openAt(board, layout, c, r + 1) && openAt(board, layout, c + 1, r + 1)) {
        hits.push('(c' + c + ',r' + r + ')');
      }
    }
  }
  return hits;
}

/* An open tile with only one walkable neighbour is a dead end. The two tunnel
 * mouths are the one exception — they wrap to each other rather than stopping. */
function deadEnds(board, layout) {
  var hits = [];
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var r = 0; r < board.rows; r++) {
    for (var c = 0; c < board.cols; c++) {
      if (!openAt(board, layout, c, r)) continue;
      if (r === board.tunnelRow && (c === 0 || c === board.cols - 1)) continue;
      var deg = 0;
      DIRS.forEach(function (d) {
        var nc = c + d[0], nr = r + d[1];
        if (r === board.tunnelRow) {
          if (nc < 0) nc = board.cols - 1;
          else if (nc >= board.cols) nc = 0;
        }
        if (openAt(board, layout, nc, nr)) deg++;
      });
      if (deg <= 1) hits.push('(c' + c + ',r' + r + ')');
    }
  }
  return hits;
}
```

- [ ] **Step 2: Rewrite the combination sweep**

Replace `:63-97` so it walks every board and every tier:

```javascript
var failures = 0;
var combos = 0;

Object.keys(PV.BOARDS).forEach(function (boardId) {
  var board = PV.BOARDS[boardId];
  console.log(boardId + '  ' + board.cols + 'x' + board.rows);
  Object.keys(board.tiers).forEach(function (tierId) {
    var pool = board.tiers[tierId];
    pool.top.forEach(function (top) {
      pool.bottom.forEach(function (bottom) {
        combos++;
        var id = boardId + '/' + tierId + '  ' + top.id + '/' + bottom.id;
        var layout = PV.assembleLayout(board, top, bottom);
        var problems = PV.checkLayout(board, layout);
        var wide = wideSpots(board, layout);
        var dead = deadEnds(board, layout);
        var sc = PV.scoreLayout(board, layout);

        if (problems.length || wide.length || dead.length) {
          failures++;
          if (problems.length) console.log('  ' + id + '  BROKEN: ' + problems.join('; '));
          if (wide.length) {
            console.log('  ' + id + '  TWO-WIDE CORRIDOR at ' + wide.slice(0, 8).join(' ') +
              (wide.length > 8 ? ' (+' + (wide.length - 8) + ' more)' : ''));
          }
          if (dead.length) {
            console.log('  ' + id + '  DEAD END at ' + dead.slice(0, 8).join(' ') +
              (dead.length > 8 ? ' (+' + (dead.length - 8) + ' more)' : ''));
          }
        } else {
          console.log('  ' + id + '  ok    pellets=' + sc.pellets + ' score=' + sc.score);
        }
      });
    });
  });
});
```

Update the determinism block at `:99-107` to pass a level:

```javascript
var a = PV.createMaze(5, 12345), b = PV.createMaze(5, 12345);
var reproducible = a.recipe === b.recipe && a.totalPellets === b.totalPellets;
var seen = {};
var distinct = 0;
for (var s = 0; s < 2000; s++) {
  var rec = PV.createMaze(5, s).recipe;
  if (!seen[rec]) { seen[rec] = true; distinct++; }
}
var classicCombos = PV.BOARDS.full.tiers.classic.top.length *
                    PV.BOARDS.full.tiers.classic.bottom.length;
```

and check `distinct === classicCombos` rather than `distinct === combos`.

- [ ] **Step 3: Run it**

Run: `node test/maze-test.js`
Expected: every board's every tier reported ok. The `L2 board` / `L3 board` assertions still FAIL until Task 12.

- [ ] **Step 4: Commit**

```bash
git add test/maze-test.js
git commit -m "test: Check the authoring rules on every board"
```

---

## Task 12: Author the gentle and medium tiers

Eight pieces per tier — four top, four bottom — for the `mid` and `large` boards. This is the task the map agents do.

**Files:**
- Modify: `js/maze.js`
- Test: `test/maze-test.js`

- [ ] **Step 1: Write the acceptance harness**

Create `tools/piece-check.js`:

```javascript
/* Validate a candidate piece pool without editing js/maze.js.
 *
 *   node tools/piece-check.js <boardId> <tierId> <pieces.json>
 *
 * The JSON is { "top": [{"id":"...","rows":[...]}, ...], "bottom": [...] }.
 * Prints one line per combination and exits non-zero if any fails. */
global.window = {};
require(require('path').join(__dirname, '..', 'js', 'maze.js'));
var PV = global.window.PV;
var fs = require('fs');

var boardId = process.argv[2], tierId = process.argv[3];
var pool = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
var board = PV.BOARDS[boardId];
if (!board) { console.error('unknown board ' + boardId); process.exit(2); }

var BANDS = {
  gentle:  { score: [42, 52],   pellets: [150, 175] },
  medium:  { score: [54, 62],   pellets: [185, 215] },
  dense:   { score: [88, 104],  pellets: [250, 300] },
  densest: { score: [106, 130], pellets: [250, 310] }
};
var band = BANDS[tierId];
if (!band) { console.error('unknown tier ' + tierId); process.exit(2); }

var bad = 0;
pool.top.forEach(function (top) {
  pool.bottom.forEach(function (bottom) {
    var id = top.id + '/' + bottom.id;
    var problems = [];
    if (top.rows.length !== board.topRows) {
      problems.push('top has ' + top.rows.length + ' rows, want ' + board.topRows);
    }
    if (bottom.rows.length !== board.bottomRows) {
      problems.push('bottom has ' + bottom.rows.length + ' rows, want ' + board.bottomRows);
    }
    if (problems.length) { bad++; console.log(id + '  ' + problems.join('; ')); return; }

    var layout = PV.assembleLayout(board, top, bottom);
    problems = PV.checkLayout(board, layout);
    var sc = PV.scoreLayout(board, layout);
    if (sc.score < band.score[0] || sc.score > band.score[1]) {
      problems.push('score ' + sc.score + ' outside ' + band.score.join('-'));
    }
    if (sc.pellets < band.pellets[0] || sc.pellets > band.pellets[1]) {
      problems.push('pellets ' + sc.pellets + ' outside ' + band.pellets.join('-'));
    }
    if (problems.length) { bad++; console.log(id + '  FAIL: ' + problems.join('; ')); }
    else console.log(id + '  ok  pellets=' + sc.pellets + ' score=' + sc.score);
  });
});
console.log(bad ? bad + ' COMBINATION(S) FAILED' : 'ALL COMBINATIONS OK');
process.exit(bad ? 1 : 0);
```

The two-wide and dead-end rules are not in `checkLayout` — they live in `test/maze-test.js`. Import them by exporting `wideSpots` and `deadEnds` from the test file and requiring them here, or duplicate the two functions verbatim. Prefer exporting: add `module.exports = { wideSpots: wideSpots, deadEnds: deadEnds };` guarded by `if (typeof module !== 'undefined')` at the bottom of `test/maze-test.js`, and have the test only run its sweep when invoked directly (`if (require.main === module)`).

Add `topRows` and `bottomRows` to all four board templates in `js/maze.js`, matching the table in Task 9.

- [ ] **Step 2: Verify the harness rejects known-bad input**

Write a throwaway `/tmp/bad.json` with a top piece one row short and run:

Run: `node tools/piece-check.js mid gentle /tmp/bad.json`
Expected: exit 1, `top has N rows, want 8`.

- [ ] **Step 3: Dispatch the map agents**

Four agents in parallel, one per (board, tier, half). Each gets this brief, with the bracketed values filled in:

> Author 4 maze pieces for a Pac-Man-like game. Board: [22x25 / 24x27]. You are writing the **[top / bottom]** half, [8 / 9] rows, **[11 / 12] characters per row** — only the left half is authored and each row is mirrored to full width.
>
> Legend: `#` wall, `.` pellet, `o` power pellet, space = open floor with no pellet.
>
> Hard rules, all machine-checked:
> 1. Everything reachable from Pac-Man's spawn.
> 2. No 2x2 block of open floor anywhere outside the ghost-house block. In practice a two-row band between fixed corridors can hold only vertical corridors, and corridor columns must never be adjacent.
> 3. No dead ends — every open tile needs at least two walkable neighbours. The two tunnel mouths are the only exception.
> 4. Exactly one `o` per piece (it mirrors to two).
> 5. The row nearest the middle band must be a comb: no two adjacent open tiles, because the band's edge row is a full-width corridor and would otherwise form a 2x2.
> 6. Target score [45-60 / 65-80] and [140-165 / 170-200] pellets, where score = junctions + corners.
>
> Style: this tier is [gentle — big solid wall blocks, long straight runs, few decision points / medium — a mix of blocks and thinner corridors]. Aim for the feel of the arcade maze, not a grid of 1-wide corridors.
>
> Return JSON only: `{"top": [{"id":"M1","rows":["...", ...]}, ...]}`. Write it to `<path>` and run `node tools/piece-check.js <board> <tier> <path>`. Iterate until it exits 0. Do not report success without a clean run — paste the command output.

- [ ] **Step 4: Validate every returned pool yourself**

Do not trust an agent's report. For each returned file:

Run: `node tools/piece-check.js mid gentle /tmp/mid-gentle.json && node tools/piece-check.js large medium /tmp/large-medium.json`
Expected: exit 0 for both, `ALL COMBINATIONS OK`.

Anything that fails goes back to the agent that wrote it with the failing output pasted in.

- [ ] **Step 5: Paste the accepted pieces into maze.js**

Add them as `MID_GENTLE_TOP` / `MID_GENTLE_BOTTOM` / `LARGE_MEDIUM_TOP` / `LARGE_MEDIUM_BOTTOM` arrays and wire the pools:

```javascript
      // on the `mid` template
      tiers: { gentle: { top: MID_GENTLE_TOP, bottom: MID_GENTLE_BOTTOM } }

      // on the `large` template
      tiers: { medium: { top: LARGE_MEDIUM_TOP, bottom: LARGE_MEDIUM_BOTTOM } }
```

- [ ] **Step 6: Run tests**

Run: `node test/maze-test.js`
Expected: PASS in full, including the `L2 board` and `L3 board` assertions from Task 7.

- [ ] **Step 7: Commit**

```bash
git add js/maze.js tools/piece-check.js test/maze-test.js
git commit -m "maze: Author the gentle and medium tiers"
```

---

## Task 13: Author the dense and densest tiers

Same shape as Task 12, on the `full` board.

**Files:**
- Modify: `js/maze.js`
- Test: `test/maze-test.js`

- [ ] **Step 1: Dispatch the map agents**

Four agents, same brief as Task 12 Step 3, with these values: board 28x31, **14 characters per row**, top pieces 8 rows, bottom pieces 10 rows. Tiers:

- `dense` — score 105-125, pellets 250-300. Denser than any shipped piece; the existing ceiling is `T2/B2` at 102.
- `densest` — score 125+, pellets 250-320. The plateau the game sits on from level 9.

Add to the brief for these two:

> The existing pieces in `js/maze.js` (`TOP_PIECES`, `BOTTOM_PIECES`) score 82 to 102 and are what levels 5-6 use. Yours must be clearly more cut-up than those, but must still read as a maze — a solid grid of 1-wide corridors is noise, not difficulty. Add junctions and corners by breaking long straight runs, not by removing every wall block.

- [ ] **Step 2: Validate**

Run: `node tools/piece-check.js full dense /tmp/full-dense.json && node tools/piece-check.js full densest /tmp/full-densest.json`
Expected: exit 0 for both.

- [ ] **Step 3: Wire the pools**

```javascript
      // on the `full` template
      tiers: {
        fixed:   { top: [TOP_PIECES[0]], bottom: [BOTTOM_PIECES[0]] },
        classic: { top: TOP_PIECES,      bottom: BOTTOM_PIECES },
        dense:   { top: FULL_DENSE_TOP,  bottom: FULL_DENSE_BOTTOM },
        densest: { top: FULL_DENSEST_TOP, bottom: FULL_DENSEST_BOTTOM }
      }
```

- [ ] **Step 4: Run tests**

Run: `node test/maze-test.js`
Expected: PASS. Every board and tier reported ok.

- [ ] **Step 5: Commit**

```bash
git add js/maze.js
git commit -m "maze: Author the dense and densest tiers"
```

---

## Task 14: The progression test

**Files:**
- Create: `test/progression-test.js`

- [ ] **Step 1: Write it**

```javascript
/* Progression regression test — run with:  node test/progression-test.js
 *
 * The ladder has to actually ladder. A piece that lands in the wrong tier, or
 * a board whose pieces are so dense it out-dots a larger board, is invisible
 * to the per-combination checks in maze-test.js but ruins the curve. */
global.window = {};
require(require('path').join(__dirname, '..', 'js', 'maze.js'));
var PV = global.window.PV;

var failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log('  ok    ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? ': ' + detail : ''));
}

/* The worst case a player can draw at each level: the most cut-up and the most
 * pellet-heavy combination its tier can produce. The curve has to hold there,
 * not just on average. */
function extremes(level) {
  var plan = PV.planFor(level);
  var board = PV.BOARDS[plan.board];
  var pool = plan.fixed ? board.tiers.fixed : board.tiers[plan.tier];
  var maxScore = -Infinity, maxPellets = -Infinity;
  var minScore = Infinity, minPellets = Infinity;
  pool.top.forEach(function (top) {
    pool.bottom.forEach(function (bottom) {
      var sc = PV.scoreLayout(board, PV.assembleLayout(board, top, bottom));
      if (sc.score > maxScore) maxScore = sc.score;
      if (sc.score < minScore) minScore = sc.score;
      if (sc.pellets > maxPellets) maxPellets = sc.pellets;
      if (sc.pellets < minPellets) minPellets = sc.pellets;
    });
  });
  return { board: plan.board, minScore: minScore, maxScore: maxScore,
           minPellets: minPellets, maxPellets: maxPellets };
}

console.log('the ladder');
var LEVELS = [1, 2, 3, 4, 5, 7, 9];
var rows = LEVELS.map(function (lv) {
  var e = extremes(lv);
  console.log('  L' + lv + '  ' + e.board.padEnd(6) +
    ' pellets ' + e.minPellets + '-' + e.maxPellets +
    '  score ' + e.minScore + '-' + e.maxScore);
  return e;
});

console.log('');
/* Score climbs the whole way: the ceiling has to rise and the floor must never
 * drop. Not "the floor clears the previous ceiling" — level 4 is the arcade map
 * and levels 5-6 draw from a pool that contains it, so those two legitimately
 * touch at 64 and 242.
 *
 * Pellets climb only while the board grows. From level 4 the board is fixed at
 * 28x31 and the escalation is density alone; making levels longer as well would
 * compound two difficulty axes at once. */
console.log('monotonicity');
for (var i = 1; i < rows.length; i++) {
  var prev = rows[i - 1], cur = rows[i];
  check('L' + LEVELS[i] + ' ceiling rises above L' + LEVELS[i - 1] + ' (score)',
    cur.maxScore > prev.maxScore,
    'L' + LEVELS[i] + ' ceiling ' + cur.maxScore + ' vs L' + LEVELS[i - 1] + ' ceiling ' + prev.maxScore);
  check('L' + LEVELS[i] + ' floor holds against L' + LEVELS[i - 1] + ' (score)',
    cur.minScore >= prev.minScore,
    'L' + LEVELS[i] + ' floor ' + cur.minScore + ' vs L' + LEVELS[i - 1] + ' floor ' + prev.minScore);

  if (cur.board !== prev.board) {
    check('L' + LEVELS[i] + ' ceiling rises above L' + LEVELS[i - 1] + ' (pellets)',
      cur.maxPellets > prev.maxPellets,
      'L' + LEVELS[i] + ' ceiling ' + cur.maxPellets + ' vs L' + LEVELS[i - 1] + ' ceiling ' + prev.maxPellets);
    check('L' + LEVELS[i] + ' floor holds against L' + LEVELS[i - 1] + ' (pellets)',
      cur.minPellets >= prev.minPellets,
      'L' + LEVELS[i] + ' floor ' + cur.minPellets + ' vs L' + LEVELS[i - 1] + ' floor ' + prev.minPellets);
  }
}

console.log('');
console.log('landmarks');
check('L1 is the small board', PV.createMaze(1, 0).board === 'small');
check('L4 is the full board', PV.createMaze(4, 0).board === 'full');

var l1Fixed = true, l4Arcade = true;
for (var s = 0; s < 300; s++) {
  if (PV.createMaze(1, s).recipe !== PV.createMaze(1, 0).recipe) l1Fixed = false;
  if (PV.createMaze(4, s).recipe !== 'T1/B1') l4Arcade = false;
}
check('L1 is the same map every game', l1Fixed);
check('L4 is always the arcade map', l4Arcade);

console.log('');
console.log('boards');
Object.keys(PV.BOARDS).forEach(function (id) {
  var b = PV.BOARDS[id];
  check(id + ' mirrors evenly', b.cols % 2 === 0, b.cols + ' columns');
  check(id + ' tunnel runs through the house',
    b.tunnelRow > b.house.r0 && b.tunnelRow < b.house.r1);
  check(id + ' house interior is 6x3',
    (b.house.c1 - b.house.c0 - 1) === 6 && (b.house.r1 - b.house.r0 - 1) === 3,
    (b.house.c1 - b.house.c0 - 1) + 'x' + (b.house.r1 - b.house.r0 - 1));
  check(id + ' rows add up',
    1 + b.topRows + b.middle.length + b.bottomRows + 1 === b.rows);
  var corners = PV.scatterCorners(b);
  Object.keys(corners).forEach(function (n) {
    var t = corners[n];
    check(id + ' ' + n + ' scatters onto the board',
      t.col >= 0 && t.col < b.cols && t.row >= 0 && t.row < b.rows,
      'c' + t.col + ',r' + t.row);
  });
});

console.log('');
console.log('determinism');
check('same level and seed reproduce',
  PV.createMaze(7, 999).recipe === PV.createMaze(7, 999).recipe);

console.log('');
console.log(failures ? failures + ' PROGRESSION CHECK(S) FAILED' : 'PROGRESSION LADDER VALID');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `node test/progression-test.js`
Expected: the ladder table prints, then PASS or FAIL. A monotonicity failure names the two levels and the numbers that overlap.

- [ ] **Step 3: Fix any overlap at its source**

If a tier's ceiling does not clear the one below it, the fix is in the pieces, not the test. Narrow that tier's band in `tools/piece-check.js` and re-run Task 12 or 13 for that tier only, sending the failing output back to the agent that wrote it. Do not relax the check to make it pass — a ladder that does not climb is the whole bug this work exists to fix.

- [ ] **Step 4: Run the whole suite**

Run: `node test/maze-test.js && node test/progression-test.js && node test/opening-test.js && node test/torch-test.js && node test/attract-test.js && node test/modes-test.js`
Expected: all six PASS.

- [ ] **Step 5: Commit**

```bash
git add test/progression-test.js
git commit -m "test: Check the ladder actually ladders"
```

---

## Task 15: Wire the new test into CI

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Find the test step**

Run: `grep -n "maze-test\|node test" .github/workflows/deploy.yml`
Expected: a step running the game suites.

- [ ] **Step 2: Add progression-test.js**

Add `node test/progression-test.js` to that step, next to `node test/maze-test.js`, preserving the existing `&&` chaining so a failure fails the deploy.

- [ ] **Step 3: Verify the file parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: Run the progression test"
```

---

## Task 16: Play it, then document it

**Files:**
- Modify: `README.md:89-121`, `:145-165`

- [ ] **Step 1: Play the ladder**

Run: `python3 -m http.server 8000`

Play levels 1 through 5 in Stare Normal. Confirm each: the board grows at 1, 2, 3 and 4; tiles shrink as it grows; level 4 is recognisably the arcade map; ghosts scatter to corners that are on the board; the tunnel wraps at every size; the HUD's maze recipe updates. Then play level 1 in Torch Normal and check the cone is not so generous it trivialises the board — this is the risk the spec flags.

- [ ] **Step 2: Rewrite the Mazes section**

Replace `README.md:89-121`:

```markdown
## Mazes

The board grows with the level. Level 1 is a small, open map — the same one
every game, so there is one board a new player can actually learn. It grows at
levels 2 and 3, and at level 4 it reaches full size as the original arcade
layout. From there the size holds and the mazes get more cut-up instead.

| Level | Board | Dots |
|---|---|---|
| 1 | 20x23 | 128, one fixed map |
| 2 | 22x25 | a gentle pair drawn from four tops and four bottoms |
| 3 | 24x27 | a medium pair |
| 4 | 28x31 | 242, the arcade layout |
| 5-6 | 28x31 | the sixteen classic combinations |
| 7-8 | 28x31 | denser pieces |
| 9+ | 28x31 | the densest pieces, from here on |

Every level after level 1 builds a new maze, so you can't coast on memory. It
isn't a random generator though. A fixed skeleton holds the parts that make it
feel like Pac-Man: the border, the tunnel row, the ghost house and the
perimeter corridors. Only the wall blocks between them change, and every row is
mirrored left to right like the original. The HUD shows which pair you got.

The ghost house is the same 8x5 block with a 6x3 interior at every board size,
so all four ghosts always start abreast. What shrinks is the playfield around
it.

![Four of the sixteen mazes side by side](docs/mazes.png)

Mazes only change between levels, so dying never costs you pellet progress.

To add pieces, edit the board's tier pool in `js/maze.js`. Three rules apply,
and the test enforces all three:

1. Everything must be reachable from Pac-Man's spawn.
2. No 2x2 block of open floor. Real Pac-Man mazes have none, and a two-wide
   corridor lets a ghost slide past you in the same passage. In practice a
   two-row band between fixed corridors can only hold vertical corridors, and
   corridor columns can't sit next to each other.
3. No dead-ends. Every open tile needs at least one walkable neighbour beyond
   the one it's reached from; the two tunnel mouths are the only exception.

    node test/maze-test.js
    node test/progression-test.js

A piece also has to land in its tier's band, or it flattens the curve.
`tools/piece-check.js` checks a candidate pool against a tier's score and
pellet range before you paste it in:

    node tools/piece-check.js mid gentle pieces.json

One more guideline, not test-enforced: when closing a dead-end into a
corridor, leave at least 2 straight tiles before the next turn.

`PV.createMaze(level, seed)` is deterministic, so any maze can be reproduced
from its level and seed. At runtime a piece that leaves something unreachable
gets logged and falls back to the arcade layout rather than shipping a broken
level. The two-wide and dead-end checks are test-only, so run the tests after
editing pieces.
```

- [ ] **Step 3: Update the test list**

At `README.md:145-165`, the count is now eight suites, six node and two bash. Add a clause describing the new one, in the style of the existing run-on sentence:

```markdown
the sixth checks that the difficulty ladder actually climbs — that no level can
draw a maze gentler or shorter than the level below it can, and that levels 1
and 4 are the fixed maps they are meant to be.
```

and add `node test/progression-test.js` to the command block.

- [ ] **Step 4: Check the board-size claim**

`README.md:167-170` says the game always draws into a fixed 560x620 space. That is no longer true. Replace with:

```markdown
The game draws into a design space of 20 pixels to a tile, so the board's
extent changes with the level, and a canvas transform maps that onto whatever
size the board actually is. Nothing in the game logic knows the screen size,
and the maze stays sharp instead of being a stretched bitmap. A smaller board
gets larger tiles rather than a smaller picture.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: Describe the board that grows with the level"
```

---

## Done when

- [ ] `node test/maze-test.js` — every board, every tier, all three rules
- [ ] `node test/progression-test.js` — ladder monotonic, landmarks fixed
- [ ] `node test/opening-test.js` — actors board-relative
- [ ] `node test/torch-test.js` — ping spans its own board
- [ ] `node test/attract-test.js` — autopilot sizes to its maze
- [ ] `node test/modes-test.js` — the nine cells unchanged
- [ ] Levels 1-5 played through in the browser, board growing at each step
- [ ] `grep -rn "PV\.COLS\|PV\.ROWS\|PV\.WIDTH\|PV\.HEIGHT\|PV\.SPAWN" js/ test/` returns nothing
