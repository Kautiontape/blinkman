/* vision.js — decides which layers you are allowed to see, and for how long. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var LAYERS = ['dots', 'ghosts', 'walls', 'pacman'];
  PV.LAYERS = LAYERS;

  PV.LAYER_KEYS = { dots: '1 / H', ghosts: '2 / J', walls: '3 / K', pacman: '4 / L' };

  var DENIED_FLASH = 0.35;   // how long the HUD flinches after a rejected press
  var OLDER_PICK_ALPHA = 0.55;

  /* The opening dots cue: three blinks, then an eased fade out. It runs as a
   * floor under whatever the mode would show, so the dots get introduced even
   * in the modes that start them dark. */
  var INTRO_ON = 0.18, INTRO_OFF = 0.12, INTRO_BLINKS = 3, INTRO_FADE = 0.45;
  var INTRO_BLINK_TIME = INTRO_BLINKS * (INTRO_ON + INTRO_OFF);
  var INTRO_TIME = INTRO_BLINK_TIME + INTRO_FADE;

  PV.introAlpha = function (age) {
    if (age >= INTRO_TIME) return 0;
    if (age < INTRO_BLINK_TIME) return (age % (INTRO_ON + INTRO_OFF)) < INTRO_ON ? 1 : 0;
    // the eased falloff a Blink flash uses, so the two cues read alike
    var t = (age - INTRO_BLINK_TIME) / INTRO_FADE;
    return (1 - t) * (1 - t);
  };

  /* Behaviour only — the name and blurb of each mode live in strings.js.
   *
   * style 'persist' — your last `keep` picks stay lit until you pick again.
   * style 'blink'   — a pick flashes at full alpha, holds, then fades out.
   * freeSelf        — your own layer is always drawn and costs no pick. */
  PV.DIFFICULTIES = {
    easy: {
      id: 'easy',
      pool: ['dots', 'ghosts', 'walls'],
      style: 'persist', keep: 2, freeSelf: true,
      cooldown: 1.0,
      ghostSpeed: 0.80, initial: ['walls', 'dots']
    },
    normal: {
      id: 'normal',
      pool: ['dots', 'ghosts', 'walls'],
      style: 'persist', keep: 1, freeSelf: true,
      cooldown: 1.0,
      ghostSpeed: 0.92, initial: ['walls']
    },
    hard: {
      id: 'hard',
      pool: LAYERS,
      style: 'persist', keep: 1, freeSelf: false,
      cooldown: 3.0,
      ghostSpeed: 1.0, initial: ['walls']
    },
    blink: {
      id: 'blink',
      pool: LAYERS,
      style: 'blink', keep: 1, freeSelf: false,
      cooldown: 1.0, hold: 0.4, fade: 2.0,
      ghostSpeed: 0.86, initial: ['walls']
    }
  };

  /** Display name for a mode, from strings.js. */
  PV.modeName = function (id) { return PV.TEXT.modes[id].name.toUpperCase(); };
  PV.modeBlurb = function (id) { return PV.TEXT.modes[id].blurb; };

  PV.createVision = function (rules) {
    var stack = [];      // persist mode: lit layers, most recent first
    var flash = null;    // blink mode: { layer, age }
    var cooldown = 0;
    var denied = 0;
    var intro = 0;       // age of the opening dots blink

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
        if (rules.style === 'blink') return flash ? flash.layer : null;
        return stack[0] || null;
      },

      selectable: function (layer) { return rules.pool.indexOf(layer) !== -1; },

      /** Visible without ever spending a pick. */
      isFree: function (layer) { return rules.freeSelf && layer === 'pacman'; },

      /**
       * Player pressed a vision key.
       * @returns {'ok'|'cooldown'|'unavailable'|'same'}
       */
      select: function (layer) {
        if (!v.selectable(layer)) { denied = DENIED_FLASH; return 'unavailable'; }
        if (cooldown > 0) { denied = DENIED_FLASH; return 'cooldown'; }

        if (rules.style === 'blink') {
          flash = { layer: layer, age: 0 };
        } else {
          var i = stack.indexOf(layer);
          // Re-picking the layer already on top changes nothing, so it costs no
          // cooldown. Promoting an older one from the stack still does.
          if (i === 0) return 'same';
          if (i !== -1) stack.splice(i, 1);
          stack.unshift(layer);
          if (stack.length > rules.keep) stack.length = rules.keep;
        }
        cooldown = rules.cooldown;
        return 'ok';
      },

      update: function (dt) {
        cooldown = Math.max(0, cooldown - dt);
        denied = Math.max(0, denied - dt);

        var a = v.alpha;
        LAYERS.forEach(function (l) { a[l] = 0; });

        if (rules.style === 'blink') {
          if (flash) {
            flash.age += dt;
            var fade = (flash.age - rules.hold) / rules.fade;
            if (fade <= 0) a[flash.layer] = 1;
            // eased, so the last sliver of visibility lingers
            else if (fade < 1) a[flash.layer] = (1 - fade) * (1 - fade);
            else flash = null;
          }
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

      reset: function () {
        stack = (rules.initial || []).slice(0, rules.keep);
        // Blink starts pitch black, so the round opens on one free flash.
        flash = rules.style === 'blink' && rules.initial
          ? { layer: rules.initial[0], age: 0 }
          : null;
        cooldown = 0;
        denied = 0;
        intro = 0;
        v.update(0);
      }
    };

    v.reset();
    return v;
  };

})(window.PV);
