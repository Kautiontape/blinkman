/* vision.js — decides which layers you are allowed to see, and for how long. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var LAYERS = ['dots', 'ghosts', 'walls', 'pacman'];
  PV.LAYERS = LAYERS;

  PV.LAYER_KEYS = { dots: '1 / H', ghosts: '2 / J', walls: '3 / K', pacman: '4 / L' };

  var DENIED_FLASH = 0.35;   // how long the HUD flinches after a rejected press
  var OLDER_PICK_ALPHA = 0.55;
  var NO_PULSES = [];   // handed to the modes that have none, so callers can loop

  /* Torch mode's sonar ping. The ring expands at PULSE_SPEED and every element
   * fades on the same curve a Flash pick uses, clocked from the moment the
   * ring reached it — so near walls are already dimming while far ones are
   * still lighting up. Everything the ring covers is measured off the board it
   * is fired on, so a smaller board is swept sooner. */
  var PULSE_SPEED = 700;   // px/s
  PV.PULSE_SPEED = PULSE_SPEED;

  /* The worst case a ping has to cross: a corner origin to the far corner. */
  PV.pulseSpan = function (maze) { return Math.hypot(maze.width, maze.height); };

  /* Where a ping fires from when there is no Pac-Man to ask — the free one a
   * round opens with. */
  PV.pulseOrigin = function (maze) {
    return { x: PV.center(maze.spawn.pacman.col), y: PV.center(maze.spawn.pacman.row) };
  };

  PV.pulseAlpha = function (dist, age, rules) {
    var t = age - dist / PULSE_SPEED;   // seconds since the ring passed
    if (t < 0) return 0;                // not reached yet
    var f = (t - rules.hold) / rules.fade;
    if (f <= 0) return 1;
    if (f >= 1) return 0;
    return (1 - f) * (1 - f);
  };

  /** How long a ping lives: the ring clearing the board, then the last fade. */
  function pulseLife(maze, rules) {
    return PV.pulseSpan(maze) / PULSE_SPEED + rules.hold + rules.fade;
  }

  /* A Flash pick: full through the hold, then eased out on the same curve the
   * ping's tail uses, so the two cues read alike. */
  PV.flashAlpha = function (age, rules) {
    var f = (age - rules.hold) / rules.fade;
    if (f <= 0) return 1;
    if (f >= 1) return 0;
    return (1 - f) * (1 - f);
  };

  /* The opening dots cue: three blinks, then an eased fade out. It runs as a
   * floor under whatever the mode would show, so the dots get introduced even
   * in the modes that start them dark. */
  var INTRO_ON = 0.18, INTRO_OFF = 0.12, INTRO_BLINKS = 3, INTRO_FADE = 0.45;
  var INTRO_BLINK_TIME = INTRO_BLINKS * (INTRO_ON + INTRO_OFF);
  var INTRO_TIME = INTRO_BLINK_TIME + INTRO_FADE;

  PV.introAlpha = function (age) {
    if (age >= INTRO_TIME) return 0;
    if (age < INTRO_BLINK_TIME) return (age % (INTRO_ON + INTRO_OFF)) < INTRO_ON ? 1 : 0;
    // the eased falloff a Flash pick uses, so the two cues read alike
    var t = (age - INTRO_BLINK_TIME) / INTRO_FADE;
    return (1 - t) * (1 - t);
  };

  /* Behaviour only — every word the player reads lives in strings.js.
   *
   * mode 'stare' — your last `keep` picks stay lit until you pick again.
   * mode 'flash' — a pick flashes at full alpha, holds, then fades out.
   * mode 'torch' — a lit circle travels with you, with a forward cone on the
   *                levels that have one, and a pick pings outward from you;
   *                render.js paints them in board space, so the layer alphas
   *                stay dark.
   * freeSelf     — your own layer is always drawn and costs no pick.
   *
   * `base` is what a mode's three levels share; a level merges over it.
   * Nesting is authoring convenience only — PV.DIFFICULTIES below is the flat
   * table every consumer reads, so this stays a local. */
  var MODES = {
    stare: {
      base: {
        pool: ['dots', 'ghosts', 'walls'],
        freeSelf: true, initial: ['walls']
      },
      levels: {
        easy:   { keep: 2, cooldown: 1.0, ghostSpeed: 0.80, initial: ['walls', 'dots'] },
        normal: { keep: 1, cooldown: 1.0, ghostSpeed: 0.92 },
        hard:   { keep: 1, cooldown: 3.0, ghostSpeed: 1.00, pool: LAYERS, freeSelf: false }
      }
    },
    torch: {
      base: {
        pool: ['dots', 'ghosts', 'walls'],
        freeSelf: true, keep: 1, initial: ['walls']
      },
      levels: {
        easy: {
          torchRadius: 60, coneLen: 150, coneHalf: Math.PI / 3,
          hold: 0.35, fade: 1.8, cooldown: 1.0, ghostSpeed: 0.78,
          // A contact keeps following its ghost for as long as it is lit.
          pingTracks: true
        },
        normal: {
          // 46px = 2.3 tiles radius, 120px = 6-tile cone, coneHalf 45 deg
          // either side of facing (90 deg FOV) — easy and hard scale from this.
          torchRadius: 46, coneLen: 120, coneHalf: Math.PI / 4,
          hold: 0.25, fade: 1.1, cooldown: 1.0, ghostSpeed: 0.90
        },
        hard: {
          // No cone: a bare pool of light, near Normal's radius to pay for it.
          torchRadius: 44, coneLen: 0, coneHalf: 0,
          hold: 0.15, fade: 0.7, cooldown: 2.0, ghostSpeed: 1.00
        }
      }
    },
    flash: {
      // The badge names the last-seeded layer, so the board goes last —
      // the round opens showing you and the walls, badge reading WALLS.
      base: { pool: LAYERS, freeSelf: false, keep: 1, initial: ['pacman', 'walls'] },
      levels: {
        // Easy draws you always, so a flash is only ever spent on the board.
        easy:   { pool: ['dots', 'ghosts', 'walls'], freeSelf: true,
                  hold: 0.6, fade: 3.5, cooldown: 1.0, ghostSpeed: 0.74 },
        normal: { hold: 0.4, fade: 2.0, cooldown: 1.0, ghostSpeed: 0.86 },
        hard:   { hold: 0.25, fade: 1.0, cooldown: 2.0, ghostSpeed: 0.96 }
      }
    }
  };

  // Authored insertion order; a fourth mode would need no separate list.
  var MODE_IDS = Object.keys(MODES);
  var LEVELS = ['easy', 'normal', 'hard'];
  PV.MODE_IDS = MODE_IDS;
  PV.LEVELS = LEVELS;

  /* One flat table keyed 'mode-level'. createGame, the best-score key and the
   * menu all address a cell by that id. */
  PV.DIFFICULTIES = {};
  MODE_IDS.forEach(function (mode) {
    LEVELS.forEach(function (level) {
      var rules = { id: mode + '-' + level, mode: mode, level: level };
      [MODES[mode].base, MODES[mode].levels[level]].forEach(function (part) {
        Object.keys(part).forEach(function (k) { rules[k] = part[k]; });
      });
      PV.DIFFICULTIES[rules.id] = rules;
    });
  });

  /** Display name for a cell's mode. */
  PV.modeName = function (id) {
    return PV.TEXT.modes[PV.DIFFICULTIES[id].mode].name.toUpperCase();
  };

  /** Display name for a cell's level. */
  PV.levelName = function (id) {
    return PV.TEXT.levels[PV.DIFFICULTIES[id].level].toUpperCase();
  };

  /* The board nudge for a player who hasn't used the number keys. Only the
   * digits the mode answers to are named: a freeSelf mode never spends a pick
   * on your own layer, so it has no 4. Digits come off LAYER_KEYS rather than
   * the layer order, so the two can't drift apart. */
  PV.modeHint = function (id) {
    var rules = PV.DIFFICULTIES[id];
    var keys = LAYERS.filter(function (l) { return rules.pool.indexOf(l) !== -1; })
      .map(function (l) { return PV.LAYER_KEYS[l].split(' / ')[0]; })
      .join('/');
    return PV.t(PV.TEXT.hint.press, { KEYS: keys, VERB: PV.TEXT.hint[rules.mode] });
  };

  PV.createVision = function (rules) {
    var stack = [];      // stare mode: lit layers, most recent first
    var flashes = [];    // flash and torch: live picks, oldest first
    var cooldown = 0;
    var denied = 0;
    var intro = 0;       // age of the opening dots blink

    /* Flash ignores the origin; Torch expands from it. Copied, not referenced,
     * so walking away doesn't drag the ring's centre along. */
    function newFlash(layer, origin) {
      return { layer: layer, age: 0, x: origin.x, y: origin.y, blips: [] };
    }

    /* The state a round opens on, minus the board: reset() adds the opening
     * picks, which are fired across one. */
    function clear() {
      stack = (rules.initial || []).slice(0, rules.keep);
      flashes = [];
      cooldown = 0;
      denied = 0;
      intro = 0;
    }

    /* Ages every live pick and drops the spent ones. Walking backwards keeps
     * the indices valid as entries go. */
    function ageFlashes(dt, life) {
      for (var i = flashes.length - 1; i >= 0; i--) {
        flashes[i].age += dt;
        if (flashes[i].age > life) flashes.splice(i, 1);
      }
    }

    var v = {
      rules: rules,
      alpha: { dots: 0, ghosts: 0, walls: 0, pacman: 0 },

      cooldownLeft: function () { return cooldown; },
      cooldownFrac: function () {
        return rules.cooldown > 0 ? Math.max(0, cooldown / rules.cooldown) : 0;
      },
      ready: function () { return cooldown <= 0; },
      wasDenied: function () { return denied > 0; },

      /** The layer the HUD badge shows. */
      current: function () {
        if (rules.mode === 'stare') return stack[0] || null;
        return flashes.length ? flashes[flashes.length - 1].layer : null;
      },

      selectable: function (layer) { return rules.pool.indexOf(layer) !== -1; },

      /** Visible without ever spending a pick. */
      isFree: function (layer) { return rules.freeSelf && layer === 'pacman'; },

      /**
       * Torch mode's live pings, oldest first; an empty list in the other
       * modes. game.js fills each ping's `blips`, one entry per ghost that
       * ring has reached; render.js draws from them.
       * @returns {Array<{layer: string, age: number, x: number, y: number, blips: Array}>}
       */
      pulses: function () { return rules.mode === 'torch' ? flashes : NO_PULSES; },

      /**
       * Player pressed a vision key.
       * @param origin  where a Torch ping expands from; ignored by other modes
       * @returns {'ok'|'cooldown'|'unavailable'|'same'}
       */
      select: function (layer, origin) {
        if (!v.selectable(layer)) { denied = DENIED_FLASH; return 'unavailable'; }
        if (cooldown > 0) { denied = DENIED_FLASH; return 'cooldown'; }

        if (rules.mode === 'stare') {
          var i = stack.indexOf(layer);
          // Re-picking the layer already on top changes nothing, so it costs no
          // cooldown. Promoting an older one from the stack still does.
          if (i === 0) return 'same';
          if (i !== -1) stack.splice(i, 1);
          stack.unshift(layer);
          if (stack.length > rules.keep) stack.length = rules.keep;
        } else {
          flashes.push(newFlash(layer, origin));
        }
        cooldown = rules.cooldown;
        return 'ok';
      },

      /**
       * @param dt    seconds since the last frame
       * @param maze  the board a live ping is sweeping
       */
      update: function (dt, maze) {
        cooldown = Math.max(0, cooldown - dt);
        denied = Math.max(0, denied - dt);

        var a = v.alpha;
        LAYERS.forEach(function (l) { a[l] = 0; });

        if (rules.mode === 'torch') {
          // No layer alpha: the pings and the torch are spatial and are drawn
          // in board space by render.js.
          // Guarded: a life is measured off a board, and a vision has none
          // until reset() places it on one.
          if (flashes.length) ageFlashes(dt, pulseLife(maze, rules));
        } else if (rules.mode === 'flash') {
          ageFlashes(dt, rules.hold + rules.fade);
          // Brightest wins, so a new pick lifts its layer rather than
          // replacing whatever is still fading.
          flashes.forEach(function (f) {
            a[f.layer] = Math.max(a[f.layer], PV.flashAlpha(f.age, rules));
          });
        } else {
          // Older picks sit dimmer, so you can tell which one you just asked for.
          stack.forEach(function (l, idx) {
            a[l] = idx === 0 ? 1 : OLDER_PICK_ALPHA;
          });
        }

        if (intro < INTRO_TIME) {
          intro += dt;
          a.dots = Math.max(a.dots, PV.introAlpha(intro));
        }

        if (rules.freeSelf) a.pacman = 1;
      },

      isLit: function (layer) { return v.alpha[layer] > 0.001; },

      /** @param maze  the board the round opens on. */
      reset: function (maze) {
        clear();
        // Flash and Torch start pitch black, so the round opens on the free
        // picks `initial` names, fired from the board's own spawn.
        if (rules.mode !== 'stare') {
          var origin = PV.pulseOrigin(maze);
          flashes = (rules.initial || []).map(function (layer) {
            return newFlash(layer, origin);
          });
        }
        v.update(0, maze);
      }
    };

    // A vision exists before it is placed on a board; reset() places it.
    clear();
    v.update(0);
    return v;
  };

})(window.PV);
