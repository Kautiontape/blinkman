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

  function alphaFor(which) {
    return {
      walls:  which === 'walls'  ? 1 : 0,
      dots:   which === 'dots'   ? 1 : 0,
      ghosts: 0,
      pacman: which === 'pacman' ? 1 : 0
    };
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

    /* Additive, because js/render.js fills each pass with opaque black before
     * drawing. Normal compositing would let each layer bury the one beneath it;
     * on a black base, adding is both correct and cheap. */
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(walls, 0, 0);
    ctx.drawImage(dots, 0, 0);
    ctx.drawImage(player, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };

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
    var g = PV.bannerGhost();
    var boxRatio = g.boxH / g.boxW;
    var nearW = 0.076 * W, farW = 0.05 * W;

    /* Near: below the wordmark baseline, body just barely resolvable.
     *
     * The 0.18 is a floor, not a preference. It was approved on a display that
     * renders it brighter than average, so most viewers see it fainter than it
     * was signed off at, and below roughly 0.15 on black it vanishes outright
     * on a dim screen. If it changes, it goes up — and re-check it against
     * banner.html's dimmed canvas first.
     *
     * The 0.62 here is a vertical position, unrelated to the wall fade's 0.62
     * horizontal endpoint above. The two are coincidental, not coupled. */
    ghost(ctx, 0.805 * W, 0.62 * H - (nearW * boxRatio) / 2, nearW,
      0.18, '#ff3c3c', 1);

    // Far: higher, smaller, dimmer, and no body whatsoever.
    ghost(ctx, 0.915 * W, 0.30 * H - (farW * boxRatio) / 2, farW,
      0, '#ff3c3c', 0.55);
  };

  var WORDMARK = 'BLINK‑MAN';   // U+2011 non-breaking hyphen
  var WORDMARK_TARGET = 0.47;        // fraction of banner width

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

    /* Chrome appends a trailing letter-space after the final glyph and counts it
     * in measureText. textAlign 'center' centres that measured box, so the ink
     * already sits half a space LEFT of true centre — the correction adds the
     * half-space back rather than subtracting it again. Verified by measuring
     * actualBoundingBox: this lands the ink centre on 930.0 of an 1860 banner. */
    var trailing = 0.34 * fit.size;

    ctx.fillStyle = '#e8ecff';
    ctx.fillText(WORDMARK, W / 2 + trailing / 2, H / 2);
    ctx.restore();
  };

  PV.drawBanner = function (canvas, seed) {
    var maze = PV.createMaze(seed);
    var band = PV.bannerBand({
      bannerW: W, bannerH: H, boardW: PV.WIDTH, boardH: PV.HEIGHT,
      tile: PV.TILE, topRow: TOP_ROW
    });

    if (!band.exact) throw new Error('band is not a whole number of tile rows');
    if (!band.fits) throw new Error('band runs off the board');

    var spot = PV.bannerPlayerSpot(maze, Math.round(0.12 * PV.COLS),
      TOP_ROW + Math.floor(band.bandRows / 2), TOP_ROW, TOP_ROW + band.bandRows - 1);
    if (!spot) throw new Error('no open tile in the band for the player');

    /* Eat the dot the player is standing on. Layers composite additively, so an
     * uneaten pellet under the disc would sum with it — (255,210,63) plus
     * (255,233,168) clamps to a blown-out near-white patch inside the yellow
     * instead of being hidden behind it. Eating it is also just what the game
     * would show for a player parked on that tile. */
    maze.eatPellet(spot.col, spot.row);

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

})(window.PV);
