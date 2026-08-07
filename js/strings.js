/* strings.js — every word the player reads, in one place.
 *
 * Edit copy here, not in the markup. index.html carries `data-t="key"` on the
 * elements this fills; main.js applies them once at startup. Add `data-t-html`
 * when the string contains markup.
 *
 * House rules: no trademarked names (this ships to itch.io), minimal words,
 * and one bold run per menu line — the phrase saying how much you can see. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* Shown in the menu's bottom corner and logged to the console, so you can
   * tell at a glance which build a deploy is actually serving.
   * ./tools/release.sh bumps this, tags it and pushes. */
  PV.VERSION = '1.5.0';

  PV.TEXT = {
    title: 'BLINK-MAN',
    logo: { before: 'BLINK', after: 'MAN' },

    /* Feeds <meta name="description">, so keep it plain and factual. The same
     * line is written literally into index.html; change both together. */
    description: 'A maze chase drawn one layer at a time.',

    /* One picked at random per load and shown under the logo. Add freely — any
     * length works. */
    splashes: [
      'We didn’t even know he had an eye.',
      'Blink and you’ll Ms. it',
      'Don’t forget to bring a torch.',
      'You can’t hide under the covers forever.',
      'Mascara sold separately.',
      'The eyelashes are canon.',
      'Dark mode, taken literally.',
      'Sight unseen.',
      'The eyes have it.',
      'Plenty of shut. Not much eye.',
      'Blink twice if you can see the walls.',
      'Our man in the dark.',
      'Developed in a darkroom.',
      'Your monitor is fine.',
      'Photographs as a black rectangle.',
      'Object permanence not included.',
      'Keep away from direct sunlight.',
      'The walls did nothing wrong.',
      'Hug a wall today!',
      'Off the wall. Then off the next one.',
      'The ghosts can see fine.',
      'The ghosts are having a lovely time.',
      'Ghosted, and they keep coming back.',
      'Connect the dots. From memory.',
      'Yes, it’s still on cooldown.',
      'Nobody is watching you play this.',
      'Quarters not accepted.',
      'Cherries still pending.',
      'Never tested on real speakers!',
      'Vanilla JavaScript, no toppings.',
      'Runs on your work laptop!',
      'No launcher, no account, no patch notes.'
    ],

    /* How each layer is named wherever the player sees it. */
    layers: {
      dots: 'Dots',
      ghosts: 'Ghosts',
      walls: 'Walls',
      // Second person, not the character's name: Stare Hard and Flash's Normal
      // and Hard switch this layer off, so it names something you can lose.
      pacman: 'You'
    },

    /* Written once and shared, so a level is spelled the same everywhere. */
    levels: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },

    /* One bold run per menu line, and it is always the phrase saying how much
     * you can see. `blurb` is the plain version the READY overlay uses. */
    modes: {
      stare: {
        name: 'Stare',
        menu: 'The layer you pick <b>stays lit</b>',
        levels: {
          easy: {
            blurb: 'You and your last two picks',
            menu: 'You and your last <b>two picks</b> &middot; 1s cooldown'
          },
          normal: {
            blurb: 'You and your last pick',
            menu: 'You and your <b>last pick</b> &middot; 1s cooldown'
          },
          hard: {
            blurb: 'One of four, and you can go dark',
            menu: '<b>One of four</b>, and you can go dark &middot; 3s cooldown'
          }
        }
      },
      torch: {
        name: 'Torch',
        menu: 'A circle and a cone, and a <b>ping that sweeps</b>',
        levels: {
          easy: {
            blurb: 'A wide cone, and it reaches',
            menu: 'A <b>wide</b> cone, and it reaches &middot; 1s cooldown'
          },
          normal: {
            blurb: 'A pool of light, and a ping that sweeps',
            menu: 'A <b>6-tile</b> cone, and a ping &middot; 1s cooldown'
          },
          hard: {
            blurb: 'A narrow cone, quick to fade',
            menu: 'A <b>narrow</b> cone, quick to fade &middot; 2s cooldown'
          }
        }
      },
      flash: {
        name: 'Flash',
        menu: 'Dark. <b>Flash one layer</b>, then it fades',
        levels: {
          easy: {
            blurb: 'You stay lit, and a flash lingers',
            menu: '<b>You stay lit.</b> A flash fades over 3.5s &middot; 1s cooldown'
          },
          normal: {
            blurb: 'Flash one layer and remember it',
            menu: 'Dark. A flash <b>fades over 2s</b> &middot; 1s cooldown'
          },
          hard: {
            blurb: 'Flash one layer, and it is gone',
            menu: 'Dark. A flash <b>fades over 1s</b> &middot; 2s cooldown'
          }
        }
      }
    },

    keys: {
      move: '&mdash; move',
      vision: '&mdash; dots / ghosts / walls / you'
    },

    /* The nudge on the board for a player who hasn't used the number keys.
     * PV.modeHint fills %KEYS% with the digits the mode answers to and %VERB%
     * with the entry named after its style — a pick does something different
     * in each. */
    hint: {
      press: 'Press %KEYS% %VERB%',
      persist: 'to change layer',
      torch: 'to scan',
      blink: 'to flash'
    },

    hud: {
      score: 'SCORE', best: 'BEST', level: 'LEVEL', maze: 'MAZE', lives: 'LIVES',
      vision: 'VISION', layers: 'LAYERS',
      idleBadge: 'DARK',          // badge name when nothing is on screen
      idleMode: 'PICK A MODE',
      free: 'ALWAYS',             // a layer you never have to spend a pick on
      unavailable: '—'
    },

    buttons: {
      soundOn: '♫ SOUND: ON',
      soundOff: '♫ SOUND: OFF',
      fullscreen: '⛶ FULLSCREEN',
      exitFullscreen: '⛶ EXIT FULLSCREEN',
      menu: '☰ MENU'
    },

    overlay: {
      ready: 'READY',
      readyHint: 'Maze %MAZE%  ·  move to begin',
      paused: 'PAUSED',
      pausedHint: 'P to resume  ·  Esc for menu',
      levelClear: 'LEVEL %N% CLEAR',
      levelClearBody: 'Score %SCORE%',
      levelClearHint: 'Look at the walls',
      gameOver: 'GAME OVER',
      gameOverBody: 'Score %SCORE%  ·  Best %BEST%',
      gameOverHint: 'R to play again  ·  Esc for menu'
    },

    canvasFallback: 'This game needs a browser with canvas support.'
  };

  /* Avoid repeating the line you just saw when returning to the menu. */
  var lastSplash = -1;

  PV.pickSplash = function () {
    var pool = PV.TEXT.splashes;
    if (pool.length < 2) return pool[0] || '';
    var i = lastSplash;
    while (i === lastSplash) i = Math.floor(Math.random() * pool.length);
    lastSplash = i;
    return pool[i];
  };

  /** Fill in %TOKEN% placeholders. */
  PV.t = function (template, values) {
    return template.replace(/%(\w+)%/g, function (whole, key) {
      return values && values[key] != null ? values[key] : whole;
    });
  };

})(window.PV);
