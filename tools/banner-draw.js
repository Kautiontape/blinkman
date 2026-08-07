/* banner-draw.js — paints docs/banner.png and the press art in press/.
 *
 * The lit half is the real board: real maze geometry from PV.createMaze, drawn
 * by the real PV.createRenderer, so the corridor and pellets are the game's
 * rather than an approximation of it. Only the fade, the ghosts and the
 * wordmark are original to the banner.
 *
 * Every preset in PV.PRESETS is the same painting at a different aspect ratio.
 * Sizes and positions are fractions of the target rather than pixels, so a
 * preset is a handful of numbers rather than a second copy of the drawing code.
 */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var BG = '#05060c';
  var INK = '#e8ecff';
  var YELLOW = '#ffd23f';

  /* The art is a fixed picture, not a level: the crops, the fades and the
   * ghost placements are all tuned against the full board and the classic
   * piece pool. Level 5 is the first rung that draws that pair, and pinning it
   * here keeps a preset's seed reproducing the same maze. */
  var BOARD_LEVEL = 5;

  /* Fractions of width unless a field says otherwise. `exactRows` demands the
   * visible band be a whole number of tile rows: true only for the banner,
   * whose 4:1 shape happens to divide evenly and whose 2px wall strokes are
   * thin enough that a part-row along the bottom edge would read as a defect.
   * The taller crops cannot divide evenly at any sensible height, and their
   * bottom edge is deep in the fade where a part-row is invisible. */
  PV.PRESETS = {
    banner: {
      w: 1860, h: 465, seed: 7, topRow: 4, exactRows: true,
      playerColFrac: 0.12,
      fade: { walls: [0.22, 0.62], dots: [0.18, 0.56] },
      wordmark: { target: 0.47, y: 0.5, scrim: 0.62 },
      tagline: null,
      ghosts: [
        { x: 0.805, y: 0.62, w: 0.076, bodyAlpha: 0.18, alpha: 1 },
        { x: 0.915, y: 0.30, w: 0.050, bodyAlpha: 0, alpha: 0.55 }
      ]
    },

    /* og:image. Sized for the 1.91:1 card Twitter, Facebook, Slack and Discord
     * all crop to; the wordmark runs wider than the banner's because feeds
     * display this around 500px across. */
    /* zoom 1.8375 is picked, not tuned: it is the value that makes 630px come
     * to exactly 8 tile rows, and 8 rows starting at row 3 stop just above the
     * ghost house. Left in frame, the house door draws a short red bar right
     * where the tagline sits, and it reads as a defect rather than as board. */
    social: {
      w: 1200, h: 630, seed: 7, topRow: 3, exactRows: true, zoom: 1.8375,
      playerColFrac: 0.11,
      fade: { walls: [0.26, 0.72], dots: [0.20, 0.64] },
      wordmark: { target: 0.62, y: 0.44, scrim: 0.74 },
      tagline: { text: 'A maze chase drawn one layer at a time.',
                 size: 0.0235, y: 0.60, alpha: 0.72 },
      ghosts: [
        { x: 0.775, y: 0.72, w: 0.115, bodyAlpha: 0.22, alpha: 1 },
        { x: 0.895, y: 0.26, w: 0.075, bodyAlpha: 0, alpha: 0.55 }
      ]
    },

    /* 16:9 landscape cover, for anywhere that wants a wide key image. */
    wide: {
      w: 1920, h: 1080, seed: 7, topRow: 3, exactRows: false, zoom: 1.5,
      playerColFrac: 0.11,
      fade: { walls: [0.28, 0.74], dots: [0.22, 0.66] },
      wordmark: { target: 0.58, y: 0.45, scrim: 0.70 },
      tagline: { text: 'A maze chase drawn one layer at a time.',
                 size: 0.0195, y: 0.575, alpha: 0.72 },
      ghosts: [
        { x: 0.780, y: 0.74, w: 0.098, bodyAlpha: 0.22, alpha: 1 },
        { x: 0.888, y: 0.24, w: 0.064, bodyAlpha: 0, alpha: 0.55 }
      ]
    }
  };

  // tools/banner.html reads PV.BANNER.seed.
  PV.BANNER = {
    width: PV.PRESETS.banner.w, height: PV.PRESETS.banner.h,
    seed: PV.PRESETS.banner.seed, topRow: PV.PRESETS.banner.topRow
  };

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
   * visibleAlpha() reveals one layer and hides the rest.
   *
   * The stub has to satisfy every field js/render.js reads on the path where
   * `ghosts` is empty and the style isn't torch. A field the renderer starts
   * reading unconditionally has to be added here too, or this throws — loudly,
   * which is the point: nothing else exercises this tool. */
  function layer(spec, maze, band, alphas, pacman) {
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
      killer: null,
      frightTimer: 0,
      // 'persist' keeps the pulse and the torch mask off, leaving a plainly
      // lit board. The press art is not a picture of one particular mode.
      rules: { style: 'persist' },
      pacman: pacman,
      visibleAlpha: function () { return alphas; }
    }, 0);

    var strip = canvasOf(spec.w, spec.h);
    strip.getContext('2d').drawImage(off, band.srcX, band.srcY, spec.w, spec.h,
      0, 0, spec.w, spec.h);
    return strip;
  }

  /* Erase rightward with a gradient. Applied per layer because the walls and
   * the pellets fade out at different rates — the pellets go first. */
  function fade(spec, strip, startFrac, endFrac) {
    var ctx = strip.getContext('2d');
    var g = ctx.createLinearGradient(startFrac * spec.w, 0, endFrac * spec.w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, spec.w, spec.h);
    ctx.globalCompositeOperation = 'source-over';
    return strip;
  }

  PV.drawBannerBoard = function (ctx, maze, band, pacman, spec) {
    spec = spec || PV.PRESETS.banner;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, spec.w, spec.h);

    var walls = fade(spec, layer(spec, maze, band, alphaFor('walls'), pacman),
      spec.fade.walls[0], spec.fade.walls[1]);
    var dots = fade(spec, layer(spec, maze, band, alphaFor('dots'), pacman),
      spec.fade.dots[0], spec.fade.dots[1]);
    var player = layer(spec, maze, band, alphaFor('pacman'), pacman);

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

  /* The near ghost's 0.18 body alpha on the banner is a floor, not a
   * preference. It was approved on a display that renders it brighter than
   * average, so most viewers see it fainter than it was signed off at, and
   * below roughly 0.15 on black it vanishes outright on a dim screen. If it
   * changes, it goes up — and re-check it against banner.html's dimmed canvas
   * first. The taller crops carry 0.22 because their fade reaches further
   * right, putting more light behind the ghost for it to compete with. */
  PV.drawBannerGhosts = function (ctx, spec) {
    spec = spec || PV.PRESETS.banner;
    var g = PV.bannerGhost();
    var boxRatio = g.boxH / g.boxW;

    spec.ghosts.forEach(function (item) {
      var w = item.w * spec.w;
      ghost(ctx, item.x * spec.w, item.y * spec.h - (w * boxRatio) / 2, w,
        item.bodyAlpha, '#ff3c3c', item.alpha);
    });
  };

  var WORDMARK = 'BLINK‑MAN';   // U+2011 non-breaking hyphen
  var TRACKING = 0.34;          // em, and the trailing space measureText adds

  PV.drawBannerWordmark = function (ctx, spec) {
    spec = spec || PV.PRESETS.banner;

    if (typeof ctx.letterSpacing !== 'string') {
      throw new Error('canvas letterSpacing unsupported — render in Chrome');
    }

    ctx.save();
    ctx.letterSpacing = TRACKING + 'em';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var fit = PV.bannerFitFont(function (size) {
      ctx.font = '800 ' + size + 'px "JetBrains Mono", monospace';
      return ctx.measureText(WORDMARK).width;
    }, spec.wordmark.target * spec.w, 20, 300);

    ctx.font = '800 ' + fit.size + 'px "JetBrains Mono", monospace';

    /* A soft scrim rather than a stroke or drop shadow, so the letterforms stay
     * clean where they cross the fading corridor. */
    var cx = spec.w / 2, cy = spec.wordmark.y * spec.h;
    var scrim = ctx.createRadialGradient(cx, cy, 0, cx, cy,
      fit.width * spec.wordmark.scrim);
    scrim.addColorStop(0, 'rgba(5,6,12,0.92)');
    scrim.addColorStop(1, 'rgba(5,6,12,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, spec.w, spec.h);

    /* Chrome appends a trailing letter-space after the final glyph and counts it
     * in measureText. textAlign 'center' centres that measured box, so the ink
     * already sits half a space LEFT of true centre — the correction adds the
     * half-space back rather than subtracting it again. Verified by measuring
     * actualBoundingBox: this lands the ink centre on 930.0 of an 1860 banner. */
    var trailing = TRACKING * fit.size;

    ctx.fillStyle = INK;
    ctx.fillText(WORDMARK, cx + trailing / 2, cy);

    if (spec.tagline) {
      var tagTracking = 0.06;
      var tagSize = spec.tagline.size * spec.w;
      ctx.letterSpacing = tagTracking + 'em';
      ctx.font = '500 ' + tagSize + 'px "JetBrains Mono", monospace';
      ctx.globalAlpha = spec.tagline.alpha;
      // Same trailing-space correction as the wordmark above.
      ctx.fillText(spec.tagline.text, spec.w / 2 + (tagTracking * tagSize) / 2,
        spec.tagline.y * spec.h);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  PV.drawPreset = function (canvas, name, seed) {
    var spec = PV.PRESETS[name];
    if (!spec) throw new Error('unknown preset: ' + name);
    if (seed === undefined) seed = spec.seed;

    var board = PV.BOARDS.full;
    var maze = PV.createMaze(BOARD_LEVEL, seed);
    var band = PV.bannerBand({
      bannerW: spec.w, bannerH: spec.h,
      boardW: board.cols * PV.TILE, boardH: board.rows * PV.TILE,
      tile: PV.TILE, topRow: spec.topRow, zoom: spec.zoom
    });

    if (spec.exactRows && !band.exact) {
      throw new Error('band is not a whole number of tile rows');
    }
    if (!band.fits) throw new Error('band runs off the board');

    /* Fractions of what the frame shows, not of the board, so a zoomed preset
     * puts the player the same distance across the picture. */
    var spot = PV.bannerPlayerSpot(maze,
      Math.round(spec.playerColFrac * band.bandCols),
      spec.topRow + Math.floor(band.bandRows / 2),
      spec.topRow, spec.topRow + Math.ceil(band.bandRows) - 1,
      Math.ceil(band.bandCols) - 1);
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
    PV.drawBannerBoard(ctx, maze, band, pacman, spec);
    PV.drawBannerGhosts(ctx, spec);
    PV.drawBannerWordmark(ctx, spec);

    return { seed: seed, recipe: maze.recipe, player: spot };
  };

  PV.drawBanner = function (canvas, seed) {
    return PV.drawPreset(canvas, 'banner', seed);
  };

  /* The logo shares no geometry with the crops above: no board, no fade, and a
   * transparent background, so it drops onto a page that isn't the game's. The
   * disc is drawn here rather than lifted from js/render.js because the game's
   * pacman carries an animated mouth angle and a torch mask, neither of which
   * belongs in a static mark. Angles match press/favicon.svg.
   *
   * The disc is sized off the canvas height and the wordmark off the width left
   * over, which couples them: widening the canvas grows the text against a
   * fixed disc. PV.logoLockup solves for the pair, and the test pins the ratio
   * between disc and cap height that makes the two read as one mark.
   *
   * One file has to serve every background, so the wordmark is neither the
   * banner's near-white INK (1.17:1 on white) nor a dark ink (1.14:1 on black).
   * LOGO_INK is 3.46:1 on white and 6.07:1 on black. That split is deliberate
   * rather than the most even one available: the logo is usually laid over a
   * dark module, so it spends its contrast where it is actually read and keeps
   * white above the 3:1 that large type and graphics need. Going lighter for
   * more punch on black drops white under that floor, which the test refuses.
   * It stays in the maze's blue family so the concession reads as the game's
   * palette rather than as a compromise.
   *
   * The disc keeps the full brand yellow, which is only 1.44:1 on white. That
   * is deliberate: it is a shape with a distinctive silhouette rather than
   * something to read, dulling it would cost the dark backgrounds the spec
   * calls typical, and the keyline gives it a defined edge on white instead. */
  PV.LOGO = { w: 1900, h: 340, discFrac: 0.62, padFrac: 0.035, gapFrac: 0.045 };
  PV.LOGO_INK = '#7183e4';

  PV.drawLogo = function (canvas, opts) {
    opts = opts || {};
    var ink = opts.ink || PV.LOGO_INK;
    var W = canvas.width, H = canvas.height;
    var ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, W, H);

    if (typeof ctx.letterSpacing !== 'string') {
      throw new Error('canvas letterSpacing unsupported — render in Chrome');
    }

    var lay = PV.logoLockup(W, H, PV.LOGO);
    var discY = H / 2;
    var mouth = Math.PI / 5;   // half-angle, wide enough to read at 64px tall

    ctx.beginPath();
    ctx.moveTo(lay.discX, discY);
    ctx.arc(lay.discX, discY, lay.discR, mouth, -mouth);
    ctx.closePath();
    ctx.fillStyle = YELLOW;
    ctx.fill();
    /* Stroked on the same path, so the mouth wedge is outlined too — on white
     * that edge is most of what separates the disc from the page. */
    ctx.strokeStyle = ink;
    ctx.lineWidth = lay.discR * 0.055;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.save();
    ctx.letterSpacing = TRACKING + 'em';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    /* Measured without the trailing letter-space, because textAlign 'left'
     * plants the ink at textLeft and the phantom space would otherwise eat
     * into the right margin rather than being centred away. */
    var fit = PV.bannerFitFont(function (size) {
      ctx.font = '800 ' + size + 'px "JetBrains Mono", monospace';
      return ctx.measureText(WORDMARK).width - TRACKING * size;
    }, lay.textWidth, 20, 400);

    ctx.font = '800 ' + fit.size + 'px "JetBrains Mono", monospace';
    ctx.fillStyle = ink;
    ctx.fillText(WORDMARK, lay.textLeft, discY);
    ctx.restore();

    return { discR: lay.discR, fontSize: fit.size, textLeft: lay.textLeft };
  };

})(window.PV);
