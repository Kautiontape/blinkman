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

  // A fright running: a slow breath between two levels.
  var BREATH_HZ = 1.2, BREATH_LOW = 0.35, BREATH_HIGH = 0.75;

  // The last stretch of a fright: a blink that quickens.
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
    // Read at call time, not captured at load: aura.js loads before game.js,
    // so PV.FRIGHT_ENDING doesn't exist yet at this file's own load time.
    var ending = PV.FRIGHT_ENDING;
    if (left >= ending) {
      var breath = 0.5 + 0.5 * Math.sin(time * BREATH_HZ * Math.PI * 2);
      return BREATH_LOW + (BREATH_HIGH - BREATH_LOW) * breath;
    }
    var t = ending - left;
    var phase = BLINK_SLOW * t + (BLINK_FAST - BLINK_SLOW) * t * t / (2 * ending);
    return Math.floor(phase * 2) % 2 === 0 ? BREATH_HIGH : BLINK_OFF;
  }

  /* Full through the reveal beat so the collision reads, then fading with the
   * death animation. The wobble is phased off the fade's own clock, so cos(0)
   * is 1 on the frame the fade opens and the level continues from the full it
   * was held at. */
  function deathLevel(stateTime) {
    var t = (stateTime - PV.DEATH_REVEAL) / PV.DEATH_ANIM;
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    var fade = 1 - t;
    return PV.wantsCalm() ? fade
      : fade * (0.78 + 0.22 * Math.cos((stateTime - PV.DEATH_REVEAL) * 18));
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

        /* Only while the round is live: game.js counts the timer down inside
         * the 'playing' branch alone, so a board cleared mid-fright freezes it
         * at a positive value that would otherwise breathe on through the
         * level-clear pause. */
        var fright = game.frightTimer > 0 && game.state === 'playing';
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
