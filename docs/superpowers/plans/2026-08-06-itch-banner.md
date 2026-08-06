# itch.io Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `docs/banner.png` — an 1860x465 banner for the BLINK-MAN itch.io page, with the lit half rendered off the game's own maze and renderer rather than redrawn by hand.

**Architecture:** Pure layout arithmetic lives in `tools/banner-layout.js` and is unit-tested under node, following the `js/maze.js` + `test/maze-test.js` pattern. Canvas drawing lives in `tools/banner-draw.js`, which loads the real `js/maze.js` and `js/render.js` and drives `PV.createRenderer` with a stub game object. `tools/banner.html` wires them together and offers a download button, so the banner can be regenerated in any browser with no build step — matching the project's no-dependency ethos.

**Tech Stack:** Plain browser JS on a `window.PV` global, HTML5 canvas, node for tests, JetBrains Mono ExtraBold via Google Fonts.

**Spec:** `docs/superpowers/specs/2026-08-06-itch-banner-design.md`

---

## Key constraints discovered during design

Read these before starting — three of them are non-obvious and two have already caused visible bugs.

1. **`renderer.draw()` paints its own opaque black base.** `js/render.js:37-38` fills `#000` across the whole board before drawing anything. Layers therefore cannot be alpha-composited normally — they will occlude each other. All layer compositing in this plan uses `globalCompositeOperation = 'lighter'` (additive), which is correct here because the base is black and adds nothing.

2. **The ghost dome clips if the chord sits too high.** A radius-15 arc springing from y=12 has its apex at y=-3, outside a `0 0 34 28` box, and renders sheared flat. Chord must be at y=16. Task 2 tests this.

3. **The band must divide evenly into tiles.** 465 banner px / (1860/560) scale = exactly 140 design px = exactly 7 tiles. Changing either banner dimension without re-checking silently produces a band that cuts through tile rows. Task 1 tests this.

4. **`drawWalls` and `drawPellets` are private** to the `js/render.js` IIFE. The only public entry point is `PV.createRenderer(canvas)` returning `{draw, clear, setScale, kick, shake}`. Layers are selected by what the stub game's `visibleAlpha()` returns, not by calling draw functions directly.

5. **Do not modify anything in `js/`.** The banner tooling consumes the game; it does not change it.

## File structure

| File | Responsibility |
|---|---|
| Create: `tools/banner-layout.js` | Pure arithmetic — band geometry, ghost dome, player placement, font fitting. No canvas, no DOM. Loadable in node. |
| Create: `test/banner-layout-test.js` | Node tests for the above. |
| Create: `tools/banner-draw.js` | Canvas drawing. Consumes `banner-layout.js`, `js/maze.js`, `js/render.js`. |
| Create: `tools/banner.html` | Page that loads everything, renders, and offers a PNG download. |
| Create: `docs/banner.png` | The output artefact. |
| Modify: `docs/itch.md` | Add banner to the asset table; fix the stale cover path. |
| Modify: `README.md:105-108` | Mention banner regeneration alongside the itch packaging note. |

---

### Task 1: Band geometry

The banner is a horizontal slice of the 560x620 board. This computes the slice.

**Files:**
- Create: `tools/banner-layout.js`
- Test: `test/banner-layout-test.js`

- [ ] **Step 1: Write the failing test**

Create `test/banner-layout-test.js`:

```js
/* Banner layout regression test — run with:  node test/banner-layout-test.js
 *
 * Guards the arithmetic behind docs/banner.png. Every check here corresponds to
 * a mistake that renders as a subtly wrong image rather than an error.
 */
global.window = {};
require(require('path').join(__dirname, '..', 'tools', 'banner-layout.js'));
var PV = global.window.PV;

var failures = 0;
function check(label, pass, detail) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label +
    (detail ? '   ' + detail : ''));
  if (!pass) failures++;
}

console.log('band geometry');

var band = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 4
});

check('scale is banner width over board width', band.scale === 1860 / 560,
  'scale=' + band.scale);
check('band is a whole number of tile rows', band.bandRows === 7,
  'rows=' + band.bandRows);
check('band height lands exactly on tile boundaries',
  band.bandRows * 20 * band.scale === 465,
  'height=' + (band.bandRows * 20 * band.scale));
check('source y is an integer so the blit does not resample',
  Number.isInteger(band.srcY), 'srcY=' + band.srcY);
check('offscreen is tall enough for the whole board',
  band.offscreenH >= 620 * band.scale,
  'offscreenH=' + band.offscreenH);

var bad = PV.bannerBand({
  bannerW: 1860, bannerH: 500, boardW: 560, boardH: 620, tile: 20, topRow: 4
});
check('a non-integral band is reported rather than rounded away',
  bad.exact === false, 'exact=' + bad.exact);

console.log('');
console.log(failures === 0 ? 'BANNER LAYOUT OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/banner-layout-test.js`
Expected: FAIL — `Cannot find module` for `tools/banner-layout.js`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/banner-layout.js`:

```js
/* banner-layout.js — pure arithmetic for docs/banner.png.
 *
 * No canvas and no DOM, so test/banner-layout-test.js can run it under node
 * exactly the way test/maze-test.js runs js/maze.js. Everything that could be
 * silently wrong in the finished image is computed here and asserted there.
 */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* The banner is a horizontal slice of the board, rendered at full scale into
   * an offscreen canvas and then blitted 1:1. Blitting 1:1 (rather than
   * scaling) is what keeps the 2px wall strokes crisp, and that requires an
   * integer source y. */
  PV.bannerBand = function (opts) {
    var scale = opts.bannerW / opts.boardW;
    var bandDesignH = opts.bannerH / scale;
    var bandRows = bandDesignH / opts.tile;

    return {
      scale: scale,
      bandRows: bandRows,
      exact: Number.isInteger(bandRows),
      srcY: Math.round(opts.topRow * opts.tile * scale),
      offscreenW: opts.bannerW,
      offscreenH: Math.ceil(opts.boardH * scale)
    };
  };

})(window.PV);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/banner-layout-test.js`
Expected: PASS on all six checks, exit 0, final line `BANNER LAYOUT OK`.

- [ ] **Step 5: Commit**

```bash
git add tools/banner-layout.js test/banner-layout-test.js
git commit -m "blinkman: Add banner band geometry with tests"
```

---

### Task 2: Ghost dome geometry

This is the bug the design review caught by eye. Encode it so it cannot come back.

**Files:**
- Modify: `tools/banner-layout.js`
- Test: `test/banner-layout-test.js`

- [ ] **Step 1: Write the failing test**

Insert into `test/banner-layout-test.js`, immediately before the final `console.log('')` summary block:

```js
console.log('');
console.log('ghost dome');

var dome = PV.bannerGhost();

check('dome apex sits inside the box', dome.apexY >= 0, 'apexY=' + dome.apexY);
check('dome apex is not wastefully far inside', dome.apexY <= 2,
  'apexY=' + dome.apexY);
check('skirt sits on the box floor', dome.bottomY === dome.boxH,
  'bottomY=' + dome.bottomY);
check('eyes are ovals, taller than wide', dome.eyeRy > dome.eyeRx,
  'rx=' + dome.eyeRx + ' ry=' + dome.eyeRy);
check('pupils sit left of eye centre so both ghosts look at the player',
  dome.pupils[0].x < dome.eyes[0].x && dome.pupils[1].x < dome.eyes[1].x);
check('eyes fit inside the dome width',
  dome.eyes[0].x - dome.eyeRx >= 0 && dome.eyes[1].x + dome.eyeRx <= dome.boxW);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/banner-layout-test.js`
Expected: FAIL with `TypeError: PV.bannerGhost is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append inside the IIFE in `tools/banner-layout.js`, before the closing `})(window.PV);`:

```js
  /* Ghost geometry on a 34 x 28 box.
   *
   * The chord must sit at y=16. At y=12 the radius-15 arc puts its apex at
   * y=-3, outside the box, and the head renders sheared flat across the top —
   * which is exactly what happened during design review. */
  PV.bannerGhost = function () {
    var boxW = 34, boxH = 28;
    var chordY = 16, radius = 15;

    return {
      boxW: boxW,
      boxH: boxH,
      chordY: chordY,
      radius: radius,
      apexY: chordY - radius,
      bottomY: boxH,
      leftX: 2,
      rightX: 32,
      skirt: [[27, 23.6], [22, 27], [17, 23.6], [12, 27], [7, 23.6]],
      eyes: [{ x: 11, y: 15 }, { x: 24, y: 15 }],
      eyeRx: 5.6,
      eyeRy: 7.2,
      pupils: [{ x: 9.2, y: 16.2 }, { x: 22.2, y: 16.2 }],
      pupilR: 3
    };
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/banner-layout-test.js`
Expected: PASS on all twelve checks, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/banner-layout.js test/banner-layout-test.js
git commit -m "blinkman: Add ghost dome geometry, guarding the clipped-apex bug"
```

---

### Task 3: Player placement

The player sits at 12% of banner width. That lands on an arbitrary tile which may be solid wall, and which tile it is depends on the maze seed. Snap to the nearest open tile.

**Files:**
- Modify: `tools/banner-layout.js`
- Test: `test/banner-layout-test.js`

- [ ] **Step 1: Write the failing test**

Insert into `test/banner-layout-test.js`, immediately before the final summary block:

```js
console.log('');
console.log('player placement');

/* A stub wall grid: everything solid except a known pocket, so the search has
 * exactly one correct answer and cannot pass by accident. */
function stubMaze(openTiles) {
  var walls = [];
  for (var r = 0; r < 31; r++) {
    walls[r] = [];
    for (var c = 0; c < 28; c++) walls[r][c] = true;
  }
  openTiles.forEach(function (t) { walls[t[1]][t[0]] = false; });
  return { walls: walls, rows: 31, cols: 28 };
}

var spot = PV.bannerPlayerSpot(stubMaze([[6, 7]]), 3, 7, 4, 10);
check('snaps to the only open tile', spot.col === 6 && spot.row === 7,
  'got c' + spot.col + ',r' + spot.row);

var onTarget = PV.bannerPlayerSpot(stubMaze([[3, 7], [6, 7]]), 3, 7, 4, 10);
check('prefers the target tile when it is already open',
  onTarget.col === 3 && onTarget.row === 7,
  'got c' + onTarget.col + ',r' + onTarget.row);

var clamped = PV.bannerPlayerSpot(stubMaze([[5, 2], [5, 9]]), 5, 7, 4, 10);
check('never leaves the visible band', clamped.row >= 4 && clamped.row <= 10,
  'row=' + clamped.row);

var none = PV.bannerPlayerSpot(stubMaze([]), 3, 7, 4, 10);
check('reports failure rather than returning a wall tile', none === null,
  'got ' + JSON.stringify(none));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/banner-layout-test.js`
Expected: FAIL with `TypeError: PV.bannerPlayerSpot is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append inside the IIFE in `tools/banner-layout.js`, before the closing `})(window.PV);`:

```js
  /* Nearest open tile to (targetCol, targetRow), restricted to the rows the
   * banner actually shows. Every maze seed puts walls somewhere different, so
   * the player's 12%-of-width position has to be snapped rather than trusted.
   * Returns null when the band is solid — callers must not silently place the
   * player inside a wall. */
  PV.bannerPlayerSpot = function (maze, targetCol, targetRow, minRow, maxRow) {
    var best = null, bestDist = Infinity;

    for (var r = minRow; r <= maxRow; r++) {
      for (var c = 0; c < maze.cols; c++) {
        if (maze.walls[r][c]) continue;
        var dc = c - targetCol, dr = r - targetRow;
        var dist = dc * dc + dr * dr;
        if (dist < bestDist) { bestDist = dist; best = { col: c, row: r }; }
      }
    }

    return best;
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/banner-layout-test.js`
Expected: PASS on all sixteen checks, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/banner-layout.js test/banner-layout-test.js
git commit -m "blinkman: Snap banner player to the nearest open tile"
```

---

### Task 4: Wordmark fitting

The wordmark must occupy a fixed fraction of banner width regardless of how the font measures. Solve for the font size rather than hard-coding one.

**Files:**
- Modify: `tools/banner-layout.js`
- Test: `test/banner-layout-test.js`

- [ ] **Step 1: Write the failing test**

Insert into `test/banner-layout-test.js`, immediately before the final summary block:

```js
console.log('');
console.log('wordmark fitting');

/* Canvas text width is very close to linear in font size, so a linear stub is
 * a fair stand-in for ctx.measureText and lets the search be tested offline. */
function linearMeasure(perPx) {
  return function (size) { return size * perPx; };
}

var fit = PV.bannerFitFont(linearMeasure(8), 880, 10, 400);
check('hits the target width', Math.abs(fit.width - 880) <= 1,
  'width=' + fit.width.toFixed(2));
check('returns the size that produced it',
  Math.abs(fit.size * 8 - fit.width) < 1e-6, 'size=' + fit.size.toFixed(3));

var tiny = PV.bannerFitFont(linearMeasure(8), 5, 10, 400);
check('clamps to the minimum when the target is unreachably small',
  tiny.size === 10, 'size=' + tiny.size);

var huge = PV.bannerFitFont(linearMeasure(8), 99999, 10, 400);
check('clamps to the maximum when the target is unreachably large',
  huge.size === 400, 'size=' + huge.size);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/banner-layout-test.js`
Expected: FAIL with `TypeError: PV.bannerFitFont is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append inside the IIFE in `tools/banner-layout.js`, before the closing `})(window.PV);`:

```js
  /* Binary-search a font size whose measured width hits targetPx.
   *
   * Solving for the size keeps the wordmark at a fixed fraction of the banner
   * no matter how the font measures, which matters because the fallback face
   * on a machine without JetBrains Mono measures quite differently. */
  PV.bannerFitFont = function (measure, targetPx, minSize, maxSize) {
    var lo = minSize, hi = maxSize;

    if (measure(minSize) >= targetPx) return { size: minSize, width: measure(minSize) };
    if (measure(maxSize) <= targetPx) return { size: maxSize, width: measure(maxSize) };

    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (measure(mid) > targetPx) hi = mid; else lo = mid;
    }

    return { size: lo, width: measure(lo) };
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/banner-layout-test.js`
Expected: PASS on all twenty checks, exit 0, final line `BANNER LAYOUT OK`.

- [ ] **Step 5: Commit**

```bash
git add tools/banner-layout.js test/banner-layout-test.js
git commit -m "blinkman: Fit banner wordmark by solving for font size"
```

---

### Task 5: Draw the maze band

Render the real board through the real renderer, three times, one layer per pass.

**Files:**
- Create: `tools/banner-draw.js`

- [ ] **Step 1: Write the layer renderer**

Create `tools/banner-draw.js`:

```js
/* banner-draw.js — paints docs/banner.png onto a canvas.
 *
 * The lit half is the real board: real maze geometry from PV.createMaze, drawn
 * by the real PV.createRenderer, so the corridor and pellets are the game's
 * rather than an approximation of it. Only the fade, the ghosts and the
 * wordmark are original to the banner.
 */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var W = 1860, H = 465;
  var TOP_ROW = 4;
  var BG = '#05060c';

  PV.BANNER = { width: W, height: H, seed: 7, topRow: TOP_ROW };

  function canvasOf(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* One board render containing exactly one layer.
   *
   * Layers cannot be picked directly — drawWalls and drawPellets are private to
   * js/render.js — so each pass drives the renderer with a stub game whose
   * visibleAlpha() reveals one layer and hides the rest. */
  function layer(maze, band, alphas, pacman) {
    var off = canvasOf(band.offscreenW, band.offscreenH);
    var renderer = PV.createRenderer(off);
    renderer.setScale(band.scale);

    renderer.draw({
      maze: maze,
      time: 0,
      state: 'playing',
      stateTime: 0,
      invuln: 0,
      pops: [],
      ghosts: [],
      pacman: pacman,
      visibleAlpha: function () { return alphas; }
    }, 0);

    var strip = canvasOf(W, H);
    strip.getContext('2d').drawImage(off, 0, band.srcY, W, H, 0, 0, W, H);
    return strip;
  }

  /* Erase rightward with a gradient. Applied per layer because the walls and
   * the pellets fade out at different rates — the pellets go first. */
  function fade(strip, startFrac, endFrac) {
    var ctx = strip.getContext('2d');
    var g = ctx.createLinearGradient(startFrac * W, 0, endFrac * W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    return strip;
  }

  PV.drawBannerBoard = function (ctx, maze, band, pacman) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    var walls  = fade(layer(maze, band, alphaFor('walls'),  pacman), 0.22, 0.62);
    var dots   = fade(layer(maze, band, alphaFor('dots'),   pacman), 0.18, 0.56);
    var player =      layer(maze, band, alphaFor('pacman'), pacman);

    /* Additive, because js/render.js:37-38 fills each pass with opaque black
     * before drawing. Normal compositing would let each layer bury the one
     * beneath it; on a black base, adding is both correct and cheap. */
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(walls, 0, 0);
    ctx.drawImage(dots, 0, 0);
    ctx.drawImage(player, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };

  function alphaFor(which) {
    return {
      walls:  which === 'walls'  ? 1 : 0,
      dots:   which === 'dots'   ? 1 : 0,
      ghosts: 0,
      pacman: which === 'pacman' ? 1 : 0
    };
  }

})(window.PV);
```

- [ ] **Step 2: Commit**

```bash
git add tools/banner-draw.js
git commit -m "blinkman: Render banner maze band off the real renderer"
```

---

### Task 6: Draw the ghosts and the wordmark

**Files:**
- Modify: `tools/banner-draw.js`

- [ ] **Step 1: Add the ghost painter**

Append inside the IIFE in `tools/banner-draw.js`, before the closing `})(window.PV);`:

```js
  /* One ghost, scaled from the 34x28 box in banner-layout.js.
   * bodyAlpha 0 draws eyes only — the far ghost has no body at all. */
  function ghost(ctx, x, y, widthPx, bodyAlpha, bodyColor, alpha) {
    var g = PV.bannerGhost();
    var s = widthPx / g.boxW;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(s, s);

    if (bodyAlpha > 0) {
      ctx.globalAlpha = alpha * bodyAlpha;
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(g.leftX, g.bottomY);
      ctx.lineTo(g.leftX, g.chordY);
      ctx.arc(g.boxW / 2, g.chordY, g.radius, Math.PI, 0);
      ctx.lineTo(g.rightX, g.bottomY);
      g.skirt.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    ctx.fillStyle = '#ffffff';
    g.eyes.forEach(function (e) {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, g.eyeRx, g.eyeRy, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#1a2acc';
    g.pupils.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, g.pupilR, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  PV.drawBannerGhosts = function (ctx) {
    var nearW = 0.076 * W, farW = 0.05 * W;
    var boxRatio = PV.bannerGhost().boxH / PV.bannerGhost().boxW;

    // Near: below the wordmark baseline, body just barely resolvable.
    ghost(ctx, 0.805 * W, 0.62 * H - (nearW * boxRatio) / 2, nearW,
      0.18, '#ff3c3c', 1);

    // Far: higher, smaller, dimmer, and no body whatsoever.
    ghost(ctx, 0.915 * W, 0.30 * H - (farW * boxRatio) / 2, farW,
      0, '#ff3c3c', 0.55);
  };
```

- [ ] **Step 2: Add the wordmark painter**

Append inside the IIFE in `tools/banner-draw.js`, before the closing `})(window.PV);`:

```js
  var WORDMARK = 'BLINK‑MAN';        // non-breaking hyphen
  var WORDMARK_TARGET = 0.47;             // fraction of banner width

  PV.drawBannerWordmark = function (ctx) {
    if (typeof ctx.letterSpacing !== 'string') {
      throw new Error('canvas letterSpacing unsupported — render in Chrome');
    }

    ctx.save();
    ctx.letterSpacing = '0.34em';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var fit = PV.bannerFitFont(function (size) {
      ctx.font = '800 ' + size + 'px "JetBrains Mono", monospace';
      return ctx.measureText(WORDMARK).width;
    }, WORDMARK_TARGET * W, 20, 300);

    ctx.font = '800 ' + fit.size + 'px "JetBrains Mono", monospace';

    /* A soft scrim rather than a stroke or drop shadow, so the letterforms stay
     * clean where they cross the fading corridor. */
    var scrim = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, fit.width * 0.62);
    scrim.addColorStop(0, 'rgba(5,6,12,0.92)');
    scrim.addColorStop(1, 'rgba(5,6,12,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    /* Chrome appends a trailing letter-space after the final glyph and counts
     * it in measureText, so a centred draw sits half a space right of true
     * centre. Nudge back by half an em-space to actually centre it. */
    var trailing = 0.34 * fit.size;

    ctx.fillStyle = '#e8ecff';
    ctx.fillText(WORDMARK, W / 2 - trailing / 2, H / 2);
    ctx.restore();
  };
```

- [ ] **Step 3: Add the top-level entry point**

Append inside the IIFE in `tools/banner-draw.js`, before the closing `})(window.PV);`:

```js
  PV.drawBanner = function (canvas, seed) {
    var maze = PV.createMaze(seed);
    var band = PV.bannerBand({
      bannerW: W, bannerH: H, boardW: PV.WIDTH, boardH: PV.HEIGHT,
      tile: PV.TILE, topRow: TOP_ROW
    });

    if (!band.exact) throw new Error('band is not a whole number of tile rows');

    var spot = PV.bannerPlayerSpot(maze, Math.round(0.12 * PV.COLS),
      TOP_ROW + Math.floor(band.bandRows / 2), TOP_ROW, TOP_ROW + band.bandRows - 1);
    if (!spot) throw new Error('no open tile in the band for the player');

    var pacman = {
      x: PV.center(spot.col), y: PV.center(spot.row),
      dir: { x: 1, y: 0 }, mouth: Math.PI / 2, blocked: false
    };

    var ctx = canvas.getContext('2d');
    PV.drawBannerBoard(ctx, maze, band, pacman);
    PV.drawBannerGhosts(ctx);
    PV.drawBannerWordmark(ctx);

    return { seed: seed, recipe: maze.recipe, player: spot };
  };
```

- [ ] **Step 4: Commit**

```bash
git add tools/banner-draw.js
git commit -m "blinkman: Draw banner ghosts and wordmark"
```

---

### Task 7: The render page

**Files:**
- Create: `tools/banner.html`

- [ ] **Step 1: Write the page**

Create `tools/banner.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BLINK-MAN banner</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@800&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 28px; background: #12141c; color: #e8ecff;
         font: 13px ui-monospace, monospace; }
  canvas { display: block; width: 930px; height: 233px; margin-bottom: 18px; }
  /* Half brightness, to check the 18% ghost survives a dim screen. */
  #dim { filter: brightness(0.55); }
  button { font: inherit; padding: 7px 14px; background: #ffd23f; color: #05060c;
           border: 0; border-radius: 3px; cursor: pointer; }
  p { color: #6a7398; }
</style>
</head>
<body>
  <p>Full brightness</p>
  <canvas id="out" width="1860" height="465"></canvas>
  <p>Dimmed to 55% — the near ghost must still resolve</p>
  <canvas id="dim" width="1860" height="465"></canvas>
  <button id="save">Download banner.png</button>
  <p id="info"></p>

<script src="../js/maze.js"></script>
<script src="../js/render.js"></script>
<script src="./banner-layout.js"></script>
<script src="./banner-draw.js"></script>
<script>
  var out = document.getElementById('out');

  document.fonts.load('800 100px "JetBrains Mono"').then(function () {
    return document.fonts.ready;
  }).then(function () {
    var meta = PV.drawBanner(out, PV.BANNER.seed);
    document.getElementById('dim').getContext('2d').drawImage(out, 0, 0);
    document.getElementById('info').textContent =
      'seed ' + meta.seed + '  recipe ' + meta.recipe +
      '  player c' + meta.player.col + ',r' + meta.player.row;
  });

  document.getElementById('save').onclick = function () {
    out.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'banner.png';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
</script>
</body>
</html>
```

- [ ] **Step 2: Serve and open it**

Run: `python3 -m http.server 8000` from the repo root, then open
`http://localhost:8000/tools/banner.html`.

A file:// open will fail — the Google Fonts request needs an http origin, and
without the font the wordmark silently renders in a fallback.

Expected: two banners, the second visibly dimmer, and a seed/recipe line.

- [ ] **Step 3: Commit**

```bash
git add tools/banner.html
git commit -m "blinkman: Add banner render page"
```

---

### Task 8: Produce and verify the artefact

**Files:**
- Create: `docs/banner.png`
- Modify: `tools/banner-draw.js` (seed only, if a different one reads better)

- [ ] **Step 1: Choose the seed**

With the page open, edit `PV.BANNER.seed` in `tools/banner-draw.js` and reload
across seeds 1 through 8. Pick the one whose corridor reads best across the lit
third — a long horizontal run beats a busy junction, because the fade has to
have something to eat.

Record the chosen seed in the spec's Production section.

- [ ] **Step 2: Verify the dimmed copy**

Look at the second canvas. The near ghost's dome must still be discernible as a
shape against the black.

Expected: silhouette visible. If it is not, raise the `0.18` in
`PV.drawBannerGhosts` to `0.22` and re-check. Per the spec this value only ever
goes up — it was approved on a bright display, so most viewers already see it
fainter than it was signed off at.

- [ ] **Step 3: Confirm nothing collides with the wordmark**

Expected: neither ghost overlaps any glyph of `BLINK-MAN`. The near ghost sits
below the baseline and right of the final `N`. If the chosen font renders wider
than expected, reduce `WORDMARK_TARGET` from `0.47` to `0.44` rather than moving
the ghosts, which are placed relative to the fade.

- [ ] **Step 4: Save the file**

Click **Download banner.png**, then move it into place:

```bash
mv ~/Downloads/banner.png docs/banner.png
```

- [ ] **Step 5: Verify the output**

Run: `identify -format '%wx%h %b\n' docs/banner.png`
Expected: `1860x465` and a file size under 3 MB.

- [ ] **Step 6: Commit**

```bash
git add docs/banner.png tools/banner-draw.js
git commit -m "blinkman: Add itch.io banner artwork"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/itch.md`
- Modify: `README.md`

- [ ] **Step 1: Update the itch asset table**

In `docs/itch.md`, replace the `docs/cover.png` row and add a banner row. The
cover path is currently stale — the file lives at the repo root, not in `docs/`:

```markdown
| File | Use | Size |
|---|---|---|
| `cover.png` | Cover image, already the size itch wants | 630x500 |
| `docs/banner.png` | Page banner. Replaces the title, so upload it under Theme, not Screenshots | 1860x465 |
| `docs/screenshot.png` | A live round with the walls layer up | 1600x1000 |
```

- [ ] **Step 2: Add the theme settings**

Append to the "Project settings" section of `docs/itch.md`:

```markdown
Theme colours, taken from `css/style.css` so the page and the embed agree:
BG `#05060c`, BG2 `#0c0f1c` at 100% alpha, Text `#e8ecff`, Link `#4fc3ff`,
Buttons and Headers `#ffd23f`. Layout **Sidebar**, not Auto — Auto picks Hidden
for embedded projects and buries the screenshots.

Set the page font to **JetBrains Mono**. The banner's wordmark is baked into the
PNG in that face and itch cannot restyle it, so a different page font makes the
top of the page read as two sites.

Regenerate the banner with `tools/banner.html` — see the README.
```

- [ ] **Step 3: Add the README note**

In `README.md`, replace the Publishing section body with:

```markdown
`docs/itch.md` covers the itch.io upload. `./tools/package-itch.sh` builds the
zip.

The page banner is generated, not hand-drawn: serve the repo and open
`tools/banner.html`, which renders it off the real maze and renderer and offers
a download. `node test/banner-layout-test.js` covers the arithmetic behind it.
```

- [ ] **Step 4: Verify both test suites still pass**

Run: `node test/maze-test.js && node test/banner-layout-test.js`
Expected: both exit 0, `ALL 16 MAZE COMBINATIONS VALID` and `BANNER LAYOUT OK`.

- [ ] **Step 5: Commit**

```bash
git add docs/itch.md README.md
git commit -m "blinkman: Document the banner and itch theme settings"
```
