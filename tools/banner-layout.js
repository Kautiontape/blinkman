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
  /* `zoom` renders the board larger than the target and crops the right-hand
   * columns away, which thickens the walls and pellets relative to the frame.
   * The banner leaves it at 1 and fits the board's full width; a 16:9 crop
   * needs it above 1 or the maze reads as fine texture rather than as a maze.
   * The crop is left-aligned because every preset fades out rightward, so the
   * columns it discards are the ones about to be erased anyway. */
  PV.bannerBand = function (opts) {
    var zoom = opts.zoom || 1;
    var scale = (opts.bannerW * zoom) / opts.boardW;
    var bandDesignH = opts.bannerH / scale;
    var bandRows = bandDesignH / opts.tile;
    var boardRows = opts.boardH / opts.tile;

    return {
      scale: scale,
      zoom: zoom,
      bandRows: bandRows,
      bandCols: opts.bannerW / (opts.tile * scale),
      exact: Number.isInteger(bandRows),
      /* A band that starts too low, or above the board entirely, runs off
       * the edge — the blit still succeeds, it just reads blank canvas
       * rather than maze tiles, so nothing else would ever catch it. */
      fits: opts.topRow >= 0 && opts.topRow + bandRows <= boardRows,
      srcX: 0,
      srcY: Math.round(opts.topRow * opts.tile * scale),
      offscreenW: Math.ceil(opts.boardW * scale),
      offscreenH: Math.ceil(opts.boardH * scale)
    };
  };

  /* Ghost geometry on a 34 x 28 box.
   *
   * The chord must sit at y=16. At y=12 the radius-15 arc puts its apex at
   * y=-3, outside the box, and the head renders sheared flat across the top —
   * which is exactly what happened during design review. */
  PV.bannerGhost = function () {
    var boxW = 34, boxH = 28;
    var chordY = 16, radius = 15;

    /* bottomY is 27, not the box floor (boxH=28). The skirt's valley
     * points sit at y=27, so anchoring the outer corners to the box floor
     * instead would hang them one unit below the valleys and skew the
     * silhouette. */
    return {
      boxW: boxW,
      boxH: boxH,
      chordY: chordY,
      radius: radius,
      apexY: chordY - radius,
      bottomY: 27,
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

  /* Nearest open tile to (targetCol, targetRow), restricted to the rows the
   * banner actually shows. Every maze seed puts walls somewhere different, so
   * the player's 12%-of-width position has to be snapped rather than trusted.
   * Returns null when the band is solid — callers must not silently place the
   * player inside a wall.
   *
   * maxCol bounds the search the same way for columns, which matters once a
   * preset zooms in and crops the right-hand columns away: without it the
   * search can answer with a tile that is not in the picture. It defaults to
   * the full width, which is what every unzoomed preset wants.
   *
   * Ties resolve to the first tile in scan order — lowest row, then lowest
   * column. The banner is a build artefact, so which tile wins matters less
   * than it winning the same way every time. */
  PV.bannerPlayerSpot = function (maze, targetCol, targetRow, minRow, maxRow, maxCol) {
    var best = null, bestDist = Infinity;
    if (maxCol === undefined) maxCol = maze.cols - 1;

    for (var r = minRow; r <= maxRow; r++) {
      for (var c = 0; c <= maxCol; c++) {
        if (maze.walls[r][c]) continue;
        var dc = c - targetCol, dr = r - targetRow;
        var dist = dc * dc + dr * dr;
        if (dist < bestDist) { bestDist = dist; best = { col: c, row: r }; }
      }
    }

    return best;
  };

  /* WCAG relative luminance and contrast ratio.
   *
   * Here because press/logo.png is one file that has to stay readable on both
   * white and black, which is a genuine constraint rather than a preference:
   * contrast against one background falls as it rises against the other, and
   * the best any single colour can do on both is 4.58:1, at luminance 0.179.
   * A wordmark colour is therefore a solved problem, not a taste question, and
   * the test checks it rather than trusting the eye. */
  PV.relativeLuminance = function (hex) {
    var ch = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };

  PV.contrastRatio = function (hexA, hexB) {
    var a = PV.relativeLuminance(hexA), b = PV.relativeLuminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  /* Horizontal lockup for press/logo.png: a disc on the left, the wordmark
   * filling whatever width is left.
   *
   * The disc comes off the height and the text off the remaining width, so the
   * two are coupled through the canvas aspect — there is no size that satisfies
   * both independently. `fits` is false when the padding and disc have eaten
   * the whole width, which draws a wordmark squeezed to the minimum font size
   * rather than erroring, and is invisible unless something checks. */
  PV.logoLockup = function (w, h, opts) {
    var discR = (opts.discFrac * h) / 2;
    var padX = opts.padFrac * w;
    var discX = padX + discR;
    var textLeft = discX + discR + opts.gapFrac * w;
    var textWidth = w - padX - textLeft;

    return {
      discR: discR,
      discX: discX,
      textLeft: textLeft,
      textWidth: textWidth,
      fits: textWidth > 0,
      /* Disc diameter over the wordmark's cap height. JetBrains Mono's caps are
       * 0.73 em, and the pair reads as one mark near 1.6 — much above and the
       * disc becomes a bullet the text hangs off, much below and the mark turns
       * into a line of type with a dot. Only meaningful once the caller has
       * fitted a font size to textWidth. */
      discToCap: function (fontSize) { return (discR * 2) / (0.73 * fontSize); }
    };
  };

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

})(window.PV);
