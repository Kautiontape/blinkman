# Torch Mode Directional Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Torch mode a forward-facing vision cone unioned onto its existing fixed circle, with both blocked by maze walls, so players get enough forward warning to react to an approaching ghost while corners stay genuinely hidden.

**Architecture:** Two new pure functions in `js/render.js` — `PV.canSee` (grid line-of-sight) and `PV.torchAlpha` (circle-∪-cone soft-edge membership test) — replace the old radius-only `torchReveal`. Rendering switches from "clip everything to a circle" to "test each wall tile, pellet, and ghost individually against shape + line-of-sight," since occlusion is inherently per-object, not a single clip region.

**Tech Stack:** Plain ES5 `window.PV` scripts, no build step. Tests are plain Node scripts (`node test/torch-test.js`), no framework.

---

## Spec

See `docs/superpowers/specs/2026-08-06-torch-mode-directional-vision-design.md`. Key numbers this plan implements:

- Circle: unchanged, radius 46px (2.3 tiles), existing flicker.
- Cone: ±45° half-angle (90° total), reach 120px (6 tiles), flickers in sync with the circle, faces `game.pacman.dir`.
- Soft edge: existing 12px falloff applies to the circle's rim, the cone's tip, and the cone's angular sides.
- Occlusion: hard cutoff, applies to circle + cone together, does **not** apply to the sonar ping.

## File Structure

- **Modify `js/render.js`**: add the two pure functions and the constants they need (all exported on `PV` so tests can reach them); replace the circle-clip torch rendering with per-object shape+occlusion tests.
- **Modify `test/torch-test.js`**: require `render.js` (not currently loaded — safe to load headless, verified below); add two new sections covering the pure functions.
- **Modify `README.md`**: update the Torch row in the mode table and the test-coverage sentence, both of which currently describe circle-only vision.

No other file changes. Other vision modes (`easy`/`normal`/`hard`/`blink`), `js/entities.js`, `js/game.js`, `js/maze.js` are untouched — `game.pacman.dir` and `maze.isWall`/`maze.walls`/`maze.doors` already expose everything this needs.

---

### Task 1: Line-of-sight primitive

**Files:**
- Modify: `js/render.js`
- Test: `test/torch-test.js`

- [ ] **Step 1: Update the require list so `render.js` is loaded in the test harness**

In `test/torch-test.js`, change:

```js
['maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
```

to:

```js
['maze.js', 'entities.js', 'vision.js', 'game.js', 'render.js'].forEach(function (f) {
```

(`render.js` only touches `window.matchMedia` at load time, guarded with `window.matchMedia && ...`; the test harness's `global.window = {}` makes that `undefined && ...`, which short-circuits safely. `PV.createRenderer`, the only function that needs a real canvas, is never called by these tests.)

- [ ] **Step 2: Write the failing test**

Append to `test/torch-test.js`, after the `ghost blips` section and before the final `console.log(failures === 0 ...)` line:

```js
console.log('');
console.log('line of sight');

(function () {
  // A single wall tile at (col 1, row 1); everything else in this 3x3
  // patch is open. isWall is the only method PV.canSee calls on a maze.
  function fakeMaze(wallTiles) {
    return {
      isWall: function (c, r) { return wallTiles.indexOf(c + ',' + r) !== -1; }
    };
  }

  var maze = fakeMaze(['1,1']);

  check('a straight line with nothing on it sees through',
    PV.canSee(PV.center(0), PV.center(0), PV.center(0), PV.center(2), maze));

  check('a wall directly on the line blocks it',
    !PV.canSee(PV.center(0), PV.center(1), PV.center(2), PV.center(1), maze));

  check('a line that goes around the wall still sees',
    PV.canSee(PV.center(0), PV.center(0), PV.center(2), PV.center(0), maze));

  check('a point can always see itself',
    PV.canSee(PV.center(5), PV.center(5), PV.center(5), PV.center(5), maze));
})();
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node test/torch-test.js`
Expected: crashes with `TypeError: PV.canSee is not a function`.

- [ ] **Step 4: Implement `PV.canSee`**

In `js/render.js`, add this after the `torchRadius` function (after line 32, before `PV.createRenderer =`):

```js
  /**
   * Line-of-sight against the wall grid: true if nothing solid sits between
   * the two points. Walls are always a full tile (20px) thick, so sampling
   * every quarter-tile can't step clean through one. Origin and destination
   * tiles are never tested — a caller checking visibility of a wall tile's
   * own face passes that wall's *open* neighbour as the destination, not the
   * wall tile itself; testing the endpoints would make a target inside or
   * beside a wall spuriously block itself.
   */
  PV.canSee = function (x0, y0, x1, y1, maze) {
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return true;

    var steps = Math.max(1, Math.ceil(dist / (TILE / 4)));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var c = Math.floor((x0 + dx * t) / TILE);
      var r = Math.floor((y0 + dy * t) / TILE);
      if (maze.isWall(c, r)) return false;
    }
    return true;
  };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: the four `line of sight` checks all print `ok`, `ALL TORCH CHECKS OK` (or the prior sections' own failures only, if any predate this change — there should be none).

- [ ] **Step 6: Commit**

```bash
git add js/render.js test/torch-test.js
git commit -m "render: Add PV.canSee, a grid line-of-sight primitive"
```

---

### Task 2: Circle-∪-cone soft-edge alpha primitive

**Files:**
- Modify: `js/render.js`
- Test: `test/torch-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/torch-test.js`, after the `line of sight` section:

```js
console.log('');
console.log('cone + circle shape');

(function () {
  var P = { radius: 46, coneLen: 120, coneHalf: Math.PI / 4, soft: 12 };
  var right = PV.DIRS.right;

  check('your own position is always fully lit',
    PV.torchAlpha(0, 0, right, P) === 1);

  check('far away in every sense is dark',
    PV.torchAlpha(200, 200, right, P) === 0);

  check('close behind you is lit by the circle',
    PV.torchAlpha(-20, 0, right, P) === 1);

  check('straight ahead beyond the circle is lit by the cone',
    PV.torchAlpha(80, 0, right, P) === 1);

  var off = PV.torchAlpha(40, 69.28, right, P);   // 60 deg off-axis, within coneLen
  check('outside the cone angle stays dark even in range', off === 0, off);

  var circleEdge = PV.torchAlpha(-40, 0, right, P);   // dist 40, between 34 and 46
  check('the circle rim fades rather than snapping off',
    near(circleEdge, (46 - 40) / 12, 0.001), circleEdge);

  var coneTip = PV.torchAlpha(115, 0, right, P);      // dist 115, between 108 and 120
  check('the cone tip fades the same way',
    near(coneTip, (120 - 115) / 12, 0.001), coneTip);

  var coneSide = PV.torchAlpha(46.5, 37.9, right, P); // ~39 deg off-axis, dist 60
  check('the cone side edge is a fade, not a hard line',
    coneSide > 0 && coneSide < 1, coneSide);
})();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/torch-test.js`
Expected: crashes with `TypeError: PV.torchAlpha is not a function`.

- [ ] **Step 3: Implement `PV.torchAlpha` and the exported torch constants**

In `js/render.js`, change:

```js
  var TORCH_R = 46;            // 2.3 tiles
  var TORCH_SOFT = 12;         // px over which a ghost fades in at the rim
```

to:

```js
  var TORCH_R = 46;                    // 2.3 tiles
  var TORCH_SOFT = 12;                 // px over which an edge fades in
  var TORCH_CONE_HALF = Math.PI / 4;   // 45 deg either side of facing — 90 deg FOV
  var TORCH_CONE_LEN = 120;            // 6 tiles

  PV.TORCH_R = TORCH_R;
  PV.TORCH_SOFT = TORCH_SOFT;
  PV.TORCH_CONE_HALF = TORCH_CONE_HALF;
  PV.TORCH_CONE_LEN = TORCH_CONE_LEN;
```

Then add this after `PV.canSee` (which Task 1 placed after `torchRadius`, before `PV.createRenderer =`):

```js
  /**
   * How lit a point at offset (dx, dy) from Blinkman is, before occlusion —
   * the union of the fixed circle and the forward cone, each with a soft
   * TORCH_SOFT-px edge. `dir` is one of PV.DIRS (a unit vector); `params` is
   * {radius, coneLen, coneHalf, soft}. Independent of occlusion on purpose:
   * callers AND this with PV.canSee once they know what they're looking at.
   */
  PV.torchAlpha = function (dx, dy, dir, params) {
    var dist = Math.hypot(dx, dy);
    var soft = params.soft;

    var circleA = 0;
    if (dist <= params.radius) {
      circleA = dist <= params.radius - soft ? 1 : (params.radius - dist) / soft;
    }

    var coneA = 0;
    if (dist > 0 && dist <= params.coneLen) {
      var cosTheta = Math.max(-1, Math.min(1, (dx * dir.x + dy * dir.y) / dist));
      var theta = Math.acos(cosTheta);
      if (theta <= params.coneHalf) {
        var radialEdge = params.coneLen - dist;
        var sideEdge = (params.coneHalf - theta) * dist;   // arc length, in px
        var edge = Math.min(radialEdge, sideEdge);
        coneA = edge >= soft ? 1 : edge / soft;
      }
    }

    return Math.max(circleA, coneA);
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/torch-test.js`
Expected: all `cone + circle shape` checks print `ok`, `ALL TORCH CHECKS OK`.

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/torch-test.js
git commit -m "render: Add PV.torchAlpha, a circle+cone soft-edge shape test"
```

---

### Task 3: Occlusion-aware wall and pellet rendering

**Files:**
- Modify: `js/render.js`

No new automated test here: this task wires the two pure functions (already covered by Task 1 and 2's tests) into the canvas-drawing path, which the codebase has never unit-tested (see `README.md`'s description of `render.js` as "canvas drawing" — none of the three existing test suites touch it). Verification is the manual playtest in Task 5.

- [ ] **Step 1: Replace the circle-clip `drawTorch` with per-tile shape+occlusion tests**

In `js/render.js`, delete the old `drawTorch` and `torchReveal` functions:

```js
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

Replace them with:

```js
  /* Is this open tile inside the circle-or-cone shape, and is Blinkman's
   * line of sight to it clear? The two are deliberately separate tests:
   * shape first (cheap), occlusion second (a grid walk), so a tile that's
   * simply out of range never pays for a line-of-sight check. */
  function torchTileLit(maze, torch, c, r) {
    var x = PV.center(c), y = PV.center(r);
    var dx = x - torch.x, dy = y - torch.y;
    if (PV.torchAlpha(dx, dy, torch.dir, torch) <= 0) return false;
    return PV.canSee(torch.x, torch.y, x, y, maze);
  }

  /* One face per wall tile per lit open neighbour, same offsets buildEdges
   * uses in maze.js. A wall tile fills if any face of it is lit; a face
   * strokes only on the side that's actually visible, which is what makes a
   * wall behind a corner disappear instead of showing its far side. */
  var WALL_FACES = [
    { dc: 0, dr: -1, x1: 0, y1: 0, x2: TILE, y2: 0 },
    { dc: 0, dr: 1, x1: 0, y1: TILE, x2: TILE, y2: TILE },
    { dc: -1, dr: 0, x1: 0, y1: 0, x2: 0, y2: TILE },
    { dc: 1, dr: 0, x1: TILE, y1: 0, x2: TILE, y2: TILE }
  ];

  function drawTorchWalls(ctx, maze, torch, scale) {
    ctx.save();
    ctx.fillStyle = 'rgba(24,36,102,0.45)';

    var edges = [];
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (!maze.walls[r][c]) continue;
        var lit = false;
        for (var i = 0; i < WALL_FACES.length; i++) {
          var f = WALL_FACES[i];
          var nc = c + f.dc, nr = r + f.dr;
          if (maze.isWall(nc, nr)) continue;
          if (!torchTileLit(maze, torch, nc, nr)) continue;
          lit = true;
          edges.push([c * TILE + f.x1, r * TILE + f.y1, c * TILE + f.x2, r * TILE + f.y2]);
        }
        if (lit) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    ctx.strokeStyle = '#4b6bff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(75,107,255,0.85)';
    ctx.shadowBlur = 6 * scale;
    ctx.beginPath();
    for (var j = 0; j < edges.length; j++) {
      ctx.moveTo(edges[j][0], edges[j][1]);
      ctx.lineTo(edges[j][2], edges[j][3]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // The house door is a floor tile for isWall's purposes (see maze.js), so
    // it gets the same single-tile lit test pellets use, not the wall faces.
    ctx.strokeStyle = '#ff9ede';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var dr = 0; dr < maze.rows; dr++) {
      for (var dc = 0; dc < maze.cols; dc++) {
        if (!maze.doors[dr][dc]) continue;
        if (!torchTileLit(maze, torch, dc, dr)) continue;
        ctx.moveTo(dc * TILE, dr * TILE + TILE / 2);
        ctx.lineTo(dc * TILE + TILE, dr * TILE + TILE / 2);
      }
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawTorchPellets(ctx, maze, torch, time) {
    ctx.save();
    ctx.fillStyle = '#ffe9a8';

    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        var kind = maze.pellets[r][c];
        if (!kind) continue;
        if (!torchTileLit(maze, torch, c, r)) continue;
        var x = PV.center(c), y = PV.center(r);
        if (kind === 1) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        else fillCircle(ctx, x, y, 4 + Math.sin(time * 6) * 1.6);
      }
    }
    ctx.restore();
  }

  /* The torch: the union of a disc and a forward cone, each clipped to
   * Blinkman's line of sight, in a mode that's otherwise black. Ghosts are
   * not part of this — drawGhosts gives them an alpha floor instead, so one
   * straddling the rim shows whole rather than sliced. */
  function drawTorch(ctx, game, torch, scale) {
    drawTorchWalls(ctx, game.maze, torch, scale);
    drawTorchPellets(ctx, game.maze, torch, game.time);

    // A warm halo on both boundaries, so the hard edges read as light
    // falling off rather than a level-editor viewport.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,130,0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255,196,92,0.9)';
    ctx.shadowBlur = 10 * scale;

    ctx.beginPath();
    ctx.arc(torch.x, torch.y, torch.radius, 0, Math.PI * 2);
    ctx.stroke();

    var base = Math.atan2(torch.dir.y, torch.dir.x);
    ctx.beginPath();
    ctx.moveTo(torch.x, torch.y);
    ctx.arc(torch.x, torch.y, torch.coneLen, base - torch.coneHalf, base + torch.coneHalf);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }
```

- [ ] **Step 2: Assemble the `torch` params object in `draw()` and pass it through**

In `js/render.js`, change:

```js
      draw: function (game, dt) {
        // visibleAlpha(), not vision.alpha: a death forces ghosts + Pac-Man on.
        var alpha = game.visibleAlpha();
        // Non-zero only in Torch, where it doubles as the mode test.
        var torchR = game.rules.style === 'torch' ? torchRadius(game.time) : 0;
```

to:

```js
      draw: function (game, dt) {
        // visibleAlpha(), not vision.alpha: a death forces ghosts + Pac-Man on.
        var alpha = game.visibleAlpha();
        // Non-null only in Torch, where it doubles as the mode test.
        var torch = null;
        if (game.rules.style === 'torch') {
          var r = torchRadius(game.time);
          torch = {
            x: game.pacman.x, y: game.pacman.y, dir: game.pacman.dir,
            radius: r,
            coneLen: TORCH_CONE_LEN * (r / TORCH_R),   // flickers in step with the circle
            coneHalf: TORCH_CONE_HALF,
            soft: TORCH_SOFT
          };
        }
```

Then change:

```js
        // Under the layers, so a death reveal still draws over the top.
        if (torchR) {
          drawPulse(ctx, game);
          drawTorch(ctx, game, torchR, scale);
        }

        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        drawGhosts(ctx, game, alpha.ghosts, torchR);
```

to:

```js
        // Under the layers, so a death reveal still draws over the top.
        if (torch) {
          drawPulse(ctx, game);
          drawTorch(ctx, game, torch, scale);
        }

        // Only drawWalls needs `scale` — see its shadowBlur.
        if (alpha.walls > 0)  drawWalls(ctx, game.maze, alpha.walls, scale);
        if (alpha.dots > 0)   drawPellets(ctx, game.maze, alpha.dots, game.time);
        drawGhosts(ctx, game, alpha.ghosts, torch);
```

- [ ] **Step 3: Run the full test suite to confirm nothing else broke**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three print their `ALL ... OK` lines. (`drawGhosts` still takes the old `torchR` number at this point — Task 4 fixes that. The game still runs, since `drawGhosts` only uses it via a truthy check and one function call.)

- [ ] **Step 4: Commit**

```bash
git add js/render.js
git commit -m "render: Torch walls and pellets stop where a wall does"
```

---

### Task 4: Occlusion-aware ghost reveal

**Files:**
- Modify: `js/render.js`

- [ ] **Step 1: Replace the `torchReveal` call in `drawGhosts` with the shape+occlusion pair**

In `js/render.js`, change:

```js
  function drawGhosts(ctx, game, alpha, torchR) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      // A ghost in the house shows through even with the layer dark — except
      // in Torch, which brings its own light and so opts out: what is waiting
      // in the house is something you walk up to or ping for.
      var housed = torchR ? 0 : PV.ghostReveal(g);
      var a = Math.max(alpha, housed, torchReveal(g, game.pacman, torchR));
      if (a <= 0.001) return;
```

to:

```js
  function drawGhosts(ctx, game, alpha, torch) {
    var dying = game.state === 'dying';
    var rad = TILE * 0.46;

    game.ghosts.forEach(function (g) {
      // A ghost in the house shows through even with the layer dark — except
      // in Torch, which brings its own light and so opts out: what is waiting
      // in the house is something you walk up to or ping for.
      var housed = torch ? 0 : PV.ghostReveal(g);
      var a = Math.max(alpha, housed, torch ? torchGhostAlpha(g, game.maze, torch) : 0);
      if (a <= 0.001) return;
```

Then add this just above `drawGhosts` (after `drawTorch`, which Task 3 placed before `torchTileLit`'s neighbours — place it directly above the `function drawGhosts` line):

```js
  /* Same shape as torchTileLit, but against the ghost's exact float position
   * rather than a tile centre — a ghost fading in mid-tile shouldn't snap. */
  function torchGhostAlpha(g, maze, torch) {
    var dx = g.x - torch.x, dy = g.y - torch.y;
    var a = PV.torchAlpha(dx, dy, torch.dir, torch);
    if (a <= 0) return 0;
    return PV.canSee(torch.x, torch.y, g.x, g.y, maze) ? a : 0;
  }
```

- [ ] **Step 2: Run the full test suite**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three print their `ALL ... OK` lines.

- [ ] **Step 3: Commit**

```bash
git add js/render.js
git commit -m "render: Torch stops revealing ghosts it can't see"
```

---

### Task 5: Update the docs that describe the old circle-only behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the mode table row**

In `README.md`, change:

```
| Torch | A lit circle around you. A press pings one layer outward from where you stood, and it fades behind the ring. | 1s |
```

to:

```
| Torch | A lit circle around you, plus a longer cone ahead — both stop at a wall. A press pings one layer outward from where you stood, and it fades behind the ring, through walls. | 1s |
```

- [ ] **Step 2: Update the test-coverage sentence**

In `README.md`, change:

```
wording of the layer nudge; the third covers Torch's ping — its fade curve, its
frozen origin, and the ghost blips it leaves behind. None of that is visible to
a layout check.
```

to:

```
wording of the layer nudge; the third covers Torch — its ping's fade curve and
frozen origin, the ghost blips it leaves behind, and the line-of-sight and
circle/cone math behind what the light itself reaches. None of that is visible
to a layout check.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Describe Torch's cone and wall occlusion"
```

---

### Task 6: Manual playtest

**Files:** none — verification only.

- [ ] **Step 1: Run every automated test suite one more time**

Run: `node test/maze-test.js && node test/opening-test.js && node test/torch-test.js`
Expected: all three print their `ALL ... OK` lines.

- [ ] **Step 2: Open the game and check Torch mode by eye**

Open `index.html` in a browser, start a round on Torch difficulty, and confirm:
- A circle around Blinkman is lit in every direction, and a longer cone extends ahead of whichever way he's facing, turning instantly when he turns.
- Walking up to a wall or corner: what's around the corner is dark, even close by; stepping past the corner reveals it.
- A ghost visible through open space fades in the same way it did before; a ghost one tile away but behind a wall stays hidden until there's a clear line to it.
- The sonar ping (press 1/2/3) still lights things up through walls, unaffected by the above.
- Nothing looks reversed (i.e. the cone points in front of Blinkman, not behind him) after turning a corner.

- [ ] **Step 3: Report back**

If anything in Step 2 doesn't match, note exactly what's wrong (direction, shape, occlusion, or the ping) before making further changes — don't guess-fix.
