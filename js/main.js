/* main.js — wiring: input, the frame loop, overlays, and sound hookup. */
(function (PV) {
  'use strict';

  var canvas = document.getElementById('board');
  var overlay = document.getElementById('overlay');
  var panelMenu = document.getElementById('panel-menu');
  var panelMsg = document.getElementById('panel-message');
  var msgTitle = document.getElementById('msg-title');
  var msgBody = document.getElementById('msg-body');
  var msgHint = document.getElementById('msg-hint');

  var stage = document.getElementById('stage');
  var hudEl = document.getElementById('hud');
  var appEl = document.getElementById('app');
  var splashEl = document.getElementById('splash');
  var muteBtn = document.getElementById('btn-mute');
  var fullBtn = document.getElementById('btn-full');

  var renderer = PV.createRenderer(canvas);
  var hud = PV.createHud();

  var game = null;
  var attract = null;      // the demo behind the menu; null while a round is live
  var paused = false;
  var prevTs = 0;
  var overlayKey = '';

  function layout() {
    var styles = getComputedStyle(appEl);
    var padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    var padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    var gap = parseFloat(styles.columnGap || styles.gap) || 0;

    var availW = appEl.clientWidth - padX - hudEl.offsetWidth - gap;
    var availH = appEl.clientHeight - padY;

    // largest 28:31 rectangle that fits beside the HUD
    var fit = Math.max(0.35, Math.min(availW / PV.WIDTH, availH / PV.HEIGHT));
    var w = Math.floor(PV.WIDTH * fit);
    var h = Math.floor(PV.HEIGHT * fit);

    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.setProperty('--sc', (w / PV.WIDTH).toFixed(4));

    // Backing store at device resolution, capped at 2x.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    renderer.setScale(canvas.width / PV.WIDTH);

    if (!game) renderer.clear();   // menu screen has nothing to redraw
  }

  window.addEventListener('resize', layout);

  /* Moving the window to a monitor with a different pixel ratio fires no resize
   * event. A media query on the current ratio catches the change; it only
   * matches the ratio it was built with, so re-arm on every change. */
  function watchPixelRatio() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    var once = function () {
      layout();
      watchPixelRatio();
    };
    if (mq.addEventListener) mq.addEventListener('change', once, { once: true });
    else if (mq.addListener) mq.addListener(once);   // Safari < 14
  }
  watchPixelRatio();

  // ------------------------------------------------------------ static text

  /* Elements carrying data-t are filled once from strings.js, by dotted path. */
  function applyStaticText() {
    document.title = PV.TEXT.title;
    document.getElementById('version').textContent = 'v' + PV.VERSION;
    document.querySelectorAll('[data-t]').forEach(function (el) {
      var value = el.dataset.t.split('.').reduce(function (obj, key) {
        return obj == null ? null : obj[key];
      }, PV.TEXT);
      if (value == null) return;
      if (el.tagName === 'META') el.content = value;
      else if (el.dataset.tHtml !== undefined) el.innerHTML = value;
      else el.textContent = value;
    });
  }

  var SOUND = {
    chomp: 'chomp', power: 'power', bump: 'bump', eatGhost: 'eatGhost',
    caught: 'caught', death: 'death', gameOver: 'gameOver', levelClear: 'levelClear',
    visionSwitch: 'visionSwitch', visionDenied: 'visionDenied', blink: 'blinkFlash',
    roundStart: 'levelStart'
  };

  var SHAKE = { bump: 7, eatGhost: 5, caught: 14 };

  var calmQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function wantsCalm() { return !!(calmQuery && calmQuery.matches); }

  function handleEvent(name) {
    var sfx = PV.Sfx[SOUND[name]];
    if (sfx) sfx();
    if (SHAKE[name] && !wantsCalm()) renderer.kick(SHAKE[name]);
    if (name === 'caught' || name === 'roundStart') PV.Sfx.stopSiren();
  }

  function showMenu() {
    game = null;
    PV.game = null;
    paused = false;
    overlayKey = '';
    splashEl.textContent = PV.pickSplash();   // a fresh one each time you land here
    PV.Sfx.stopSiren();
    overlay.hidden = false;
    panelMenu.hidden = false;
    panelMsg.hidden = true;
    hud.showIdle();
    renderer.clear();
    // The shake decays on wall-clock time and the demo draws every frame, so a
    // death shaken into the last round would otherwise carry into this one.
    renderer.shake = 0;
    // Under reduced motion the board stays the black rectangle it was.
    attract = wantsCalm() ? null : PV.createAttract();
  }

  function startGame(difficultyId) {
    PV.Sfx.unlock();
    attract = null;
    game = PV.createGame(difficultyId);
    game.onEvent = handleEvent;
    PV.game = game;          // debug handle in the console
    paused = false;
    overlayKey = '';
    hud.rebuild(game);
    game.startRound();
    panelMenu.hidden = true;
  }

  /* The overlay text only changes when the round state does. */
  function syncOverlay() {
    if (!game) return;

    var key = paused + '|' + game.state + '|' + game.level + '|' +
      game.score + '|' + game.best + '|' + game.maze.recipe;
    if (key === overlayKey) return;
    overlayKey = key;

    var T = PV.TEXT.overlay;
    var show = true, title = '', body = '', hint = '';

    if (paused) {
      title = T.paused;
      hint = T.pausedHint;
    } else if (game.state === 'ready') {
      title = T.ready;
      body = PV.modeName(game.difficulty) + '  ·  ' + PV.modeBlurb(game.difficulty);
      hint = PV.t(T.readyHint, { MAZE: game.maze.recipe });
    } else if (game.state === 'levelclear') {
      title = PV.t(T.levelClear, { N: game.level });
      body = PV.t(T.levelClearBody, { SCORE: game.score });
      hint = T.levelClearHint;
    } else if (game.state === 'gameover') {
      title = T.gameOver;
      body = PV.t(T.gameOverBody, { SCORE: game.score, BEST: game.best });
      hint = T.gameOverHint;
    } else {
      show = false;
    }

    overlay.hidden = !show;
    if (show) {
      panelMenu.hidden = true;
      panelMsg.hidden = false;
      msgTitle.textContent = title;
      msgBody.textContent = body;
      msgHint.textContent = hint;
    }
  }

  var MOVE_KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  var VISION_KEYS = {
    Digit1: 'dots', Numpad1: 'dots', KeyH: 'dots',
    Digit2: 'ghosts', Numpad2: 'ghosts', KeyJ: 'ghosts',
    Digit3: 'walls', Numpad3: 'walls', KeyK: 'walls',
    Digit4: 'pacman', Numpad4: 'pacman', KeyL: 'pacman'
  };

  var MENU_KEYS = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard', Digit4: 'blink' };

  var SCROLL_KEYS = {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1
  };

  window.addEventListener('keydown', function (e) {
    // Ahead of the repeat guard and every early return below, because these
    // keys scroll the page on any screen and a held key keeps scrolling. Space
    // is exempt on a button: that is how a keyboard user activates it.
    if (SCROLL_KEYS[e.code] &&
        !(e.code === 'Space' && e.target && e.target.tagName === 'BUTTON')) {
      e.preventDefault();
    }

    if (e.repeat) return;
    // Ctrl+H, Ctrl+F, Ctrl+P and friends belong to the browser.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    PV.Sfx.unlock();

    // Mute and fullscreen work on every screen, menu included.
    if (e.code === 'KeyF') { toggleFullscreen(); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }

    if (!game) {
      if (MENU_KEYS[e.code]) { startGame(MENU_KEYS[e.code]); e.preventDefault(); }
      return;
    }

    if (e.code === 'Escape') { showMenu(); return; }
    if (e.code === 'KeyR') { paused = false; game.restart(); return; }
    if (e.code === 'KeyP') {
      paused = !paused;
      if (paused) PV.Sfx.stopSiren();
      return;
    }

    if (paused) return;

    if (MOVE_KEYS[e.code]) {
      game.steer(PV.DIRS[MOVE_KEYS[e.code]]);
      e.preventDefault();
      return;
    }

    if (VISION_KEYS[e.code]) {
      game.selectVision(VISION_KEYS[e.code]);
      e.preventDefault();
    }
  }, { passive: false });

  document.getElementById('diffs').addEventListener('click', function (e) {
    var btn = e.target.closest('.diff');
    if (btn) startGame(btn.dataset.diff);
  });

  /* A layer chip is the mouse equivalent of that layer's key, refusals and all:
   * the guards here are the ones the vision keys pass on their way down. The
   * chips are disabled on the menu, so `!game` only catches a stray event. */
  document.getElementById('chips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip || !game || paused) return;
    PV.Sfx.unlock();
    game.selectVision(chip.dataset.layer);
  });

  function updateMuteLabel() {
    muteBtn.textContent = PV.Sfx.isMuted()
      ? PV.TEXT.buttons.soundOff : PV.TEXT.buttons.soundOn;
  }

  function toggleMute() {
    PV.Sfx.setMuted(!PV.Sfx.isMuted());
    updateMuteLabel();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {
        /* the browser refused — nothing to recover from */
      });
    }
  }

  function updateFullLabel() {
    fullBtn.textContent = document.fullscreenElement
      ? PV.TEXT.buttons.exitFullscreen : PV.TEXT.buttons.fullscreen;
  }

  muteBtn.addEventListener('click', function () {
    PV.Sfx.unlock();
    toggleMute();
  });
  fullBtn.addEventListener('click', toggleFullscreen);
  document.getElementById('btn-menu').addEventListener('click', showMenu);

  document.addEventListener('fullscreenchange', function () {
    updateFullLabel();
    layout();
    requestAnimationFrame(layout);   // some browsers report the new size a frame late
  });

  // The siren runs only while a round is live, and rises as the board empties.
  function syncSiren() {
    if (game.state !== 'playing') { PV.Sfx.stopSiren(); return; }
    PV.Sfx.startSiren();
    PV.Sfx.setSirenPitch(game.frightTimer > 0 ? 176
      : 108 + (game.dotsEaten / Math.max(1, game.maze.totalPellets)) * 44);
  }

  function frame(ts) {
    requestAnimationFrame(frame);

    // clamped so a backgrounded tab doesn't resume by teleporting everyone
    var dt = prevTs ? Math.min((ts - prevTs) / 1000, 1 / 20) : 0;
    prevTs = ts;

    if (!game) {
      if (attract) {
        attract.update(dt);
        renderer.draw(attract.game, dt);
      }
      return;
    }

    if (!paused) {
      game.update(dt);
      syncSiren();
    }

    // Real dt even while paused: the shake decays on wall-clock time, not on
    // game time.
    renderer.draw(game, dt);
    hud.update(game);
    syncOverlay();
  }

  // Also on the console: an itch iframe hides the menu behind a play button.
  if (window.console) console.log('BLINK-MAN v' + PV.VERSION);

  applyStaticText();
  updateMuteLabel();
  updateFullLabel();
  layout();
  showMenu();
  requestAnimationFrame(frame);

})(window.PV);
