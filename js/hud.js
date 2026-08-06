/* hud.js — score, lives, and the vision badge with its cooldown ring. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  // Tied to r=44 on #ring-fill in index.html and its stroke-dasharray in
  // css/style.css; all three have to agree or the ring won't close.
  var RING_LEN = 2 * Math.PI * 44;

  // Inline SVG: crisp at any size, and no extra requests when run from file://.
  var ICONS = {
    dots:
      '<svg viewBox="0 0 24 24" fill="#ffe9a8">' +
      '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/>' +
      '<circle cx="19" cy="12" r="1.8"/><circle cx="8.5" cy="5" r="4"/>' +
      '<circle cx="15.5" cy="19" r="4"/></svg>',
    ghosts:
      '<svg viewBox="0 0 24 24" fill="#ff6b8a">' +
      '<path d="M12 2a8 8 0 0 0-8 8v12l2.6-2.2L9.2 22l2.8-2.4L14.8 22l2.6-2.2L20 22V10a8 8 0 0 0-8-8z"/>' +
      '<circle cx="9" cy="10" r="2.2" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#fff"/>' +
      '<circle cx="9" cy="10" r="1.1" fill="#1a2acc"/><circle cx="15" cy="10" r="1.1" fill="#1a2acc"/>' +
      '</svg>',
    walls:
      '<svg viewBox="0 0 24 24" fill="none" stroke="#6b8bff" stroke-width="2" stroke-linecap="round">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
      '<path d="M3 9h6M15 9h6M9 3v6M9 15v6M15 9v6M9 15h6"/></svg>',
    pacman:
      '<svg viewBox="0 0 24 24" fill="#ffd23f">' +
      '<path d="M12 12L22 5.5a11 11 0 1 0 0 13z"/></svg>',
    none:
      '<svg viewBox="0 0 24 24" fill="none" stroke="#3a4468" stroke-width="2" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>'
  };
  PV.ICONS = ICONS;

  /* Layer keys are lowercase internally; strings.js holds what the player sees. */
  function layerName(layer) {
    return (PV.TEXT.layers[layer] || layer).toUpperCase();
  }

  PV.createHud = function () {
    var el = {
      score: document.getElementById('score'),
      best: document.getElementById('best'),
      level: document.getElementById('level'),
      mazeId: document.getElementById('maze-id'),
      lives: document.getElementById('lives'),
      badgeWrap: document.querySelector('.badge-wrap'),
      badgeIcon: document.getElementById('badge-icon'),
      badgeName: document.getElementById('badge-name'),
      badgeMode: document.getElementById('badge-mode'),
      badgeCd: document.getElementById('badge-cd'),
      ring: document.getElementById('ring-fill'),
      chips: document.getElementById('chips')
    };

    var chipEls = {};

    // Caches, so update() can skip DOM writes on the frames nothing moved.
    var lastIcon = null;
    var lastLives = -1;
    var lastStats = '';

    function buildChips(vision) {
      el.chips.innerHTML = '';
      chipEls = {};
      PV.LAYERS.forEach(function (layer) {
        var free = vision.isFree(layer);
        var pickable = vision.selectable(layer);

        var chip = document.createElement('div');
        chip.className = 'chip' + (free ? ' free' : '') + (pickable || free ? '' : ' locked');
        chip.innerHTML =
          '<span class="ico">' + ICONS[layer] + '</span>' +
          '<span class="nm">' + layerName(layer) + '</span>' +
          '<span class="key">' +
          (free ? PV.TEXT.hud.free : pickable ? PV.LAYER_KEYS[layer] : PV.TEXT.hud.unavailable) +
          '</span>';
        el.chips.appendChild(chip);
        chipEls[layer] = chip;
      });
    }

    function renderLives(count) {
      el.lives.innerHTML = '';
      if (count <= 0) { el.lives.textContent = PV.TEXT.hud.unavailable; return; }
      for (var i = 0; i < count; i++) {
        var pip = document.createElement('span');
        // sized by `#lives span` in em, so the pips scale with the rest of the HUD
        pip.innerHTML = ICONS.pacman;
        el.lives.appendChild(pip);
      }
    }

    var hud = {
      /** Neutral state for the menu screen, so the panels aren't just empty. */
      showIdle: function () {
        buildChips(PV.createVision(PV.DIFFICULTIES.normal));
        PV.LAYERS.forEach(function (l) { chipEls[l].classList.remove('on'); });
        el.badgeIcon.innerHTML = ICONS.none;
        el.badgeName.textContent = PV.TEXT.hud.idleBadge;
        el.badgeMode.textContent = PV.TEXT.hud.idleMode;
        el.badgeCd.textContent = '';
        el.ring.style.strokeDashoffset = RING_LEN;
        el.badgeWrap.className = 'badge-wrap';
        el.lives.textContent = PV.TEXT.hud.unavailable;
        el.score.textContent = '0';
        el.level.textContent = '1';
        el.mazeId.textContent = PV.TEXT.hud.unavailable;
        el.best.textContent = PV.TEXT.hud.unavailable;
        lastIcon = 'none';
        lastLives = -1;
        lastStats = '';
      },

      rebuild: function (game) {
        buildChips(game.vision);
        el.badgeMode.textContent = PV.modeName(game.difficulty);
        lastIcon = null;
        lastLives = -1;
        lastStats = '';
      },

      update: function (game) {
        var v = game.vision;

        var stats = game.score + '|' + game.best + '|' + game.level + '|' + game.maze.recipe;
        if (stats !== lastStats) {
          lastStats = stats;
          el.score.textContent = game.score;
          el.best.textContent = game.best;
          el.level.textContent = game.level;
          el.mazeId.textContent = game.maze.recipe;   // which quadrants are in play
        }

        if (game.lives !== lastLives) {
          lastLives = game.lives;
          renderLives(game.lives);
        }

        var cur = v.current();
        var iconKey = cur || 'none';
        if (iconKey !== lastIcon) {
          lastIcon = iconKey;
          el.badgeIcon.innerHTML = ICONS[iconKey];
          el.badgeName.textContent = cur ? layerName(cur) : PV.TEXT.hud.idleBadge;
        }

        // Full blue circle when ready; a red arc that shrinks as it recharges.
        var frac = v.cooldownFrac();
        var arc = frac > 0 ? frac : 1;
        el.ring.style.strokeDashoffset = (RING_LEN * (1 - arc)).toFixed(2);
        el.badgeCd.textContent = frac > 0 ? v.cooldownLeft().toFixed(1) + 's' : '';

        var wrap = el.badgeWrap;
        wrap.classList.toggle('cooling', frac > 0);
        wrap.classList.toggle('ready', frac === 0);
        wrap.classList.toggle('denied', v.wasDenied());

        // Chips follow what is actually on screen, including the forced reveal
        // during a death — not just what the player selected.
        var shown = game.visibleAlpha();
        PV.LAYERS.forEach(function (layer) {
          chipEls[layer].classList.toggle('on', shown[layer] > 0.001);
        });
      }
    };

    return hud;
  };

})(window.PV);
