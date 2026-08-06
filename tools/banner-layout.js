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
    var boardRows = opts.boardH / opts.tile;

    return {
      scale: scale,
      bandRows: bandRows,
      exact: Number.isInteger(bandRows),
      /* A band that starts too low, or above the board entirely, runs off
       * the edge — the blit still succeeds, it just reads blank canvas
       * rather than maze tiles, so nothing else would ever catch it. */
      fits: opts.topRow >= 0 && opts.topRow + bandRows <= boardRows,
      srcY: Math.round(opts.topRow * opts.tile * scale),
      offscreenW: opts.bannerW,
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
   * Ties resolve to the first tile in scan order — lowest row, then lowest
   * column. The banner is a build artefact, so which tile wins matters less
   * than it winning the same way every time. */
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
