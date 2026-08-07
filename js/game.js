/* game.js — round state, scoring, collisions, and the ghost release schedule. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var TILE = PV.TILE;

  // scatter/chase alternation, in seconds; the last entry runs forever
  var WAVES = [
    { mode: 'scatter', t: 7 },
    { mode: 'chase',   t: 20 },
    { mode: 'scatter', t: 7 },
    { mode: 'chase',   t: 20 },
    { mode: 'scatter', t: 5 },
    { mode: 'chase',   t: Infinity }
  ];

  var FRIGHT_TIME = 7;
  var GHOST_VALUES = [200, 400, 800, 1600];
  var POWER_PELLET = 2;    // maze.eatPellet() returns 1 for a dot, 2 for a power pellet

  // Seconds the killer is held in view before the death animation starts.
  var DEATH_REVEAL = 0.6;
  var DEATH_ANIM = 1.15;
  PV.DEATH_REVEAL = DEATH_REVEAL;   // render.js times the death animation off these
  PV.DEATH_ANIM = DEATH_ANIM;

  // Chrome refuses localStorage on file:// origins, and opening index.html by
  // double-clicking is a supported way to play this. Degrade to a no-op.
  var store = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* not persisted */ }
    }
  };

  /* Anything unparseable reads as 0: NaN loses every `score > best` comparison,
   * so a stored NaN would freeze the best score for good. */
  function readBest(key) {
    var n = Number(store.get(key));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* The ids carry a mode prefix, so a score stored under a bare difficulty name
   * belongs to that mode's Normal. Copies each old key to its new one, skipping
   * any the player has already scored under, so running it twice cannot cost a
   * score. */
  var OLD_BEST_KEYS = {
    'pv-best-easy': 'pv-best-stare-easy',
    'pv-best-normal': 'pv-best-stare-normal',
    'pv-best-hard': 'pv-best-stare-hard',
    'pv-best-torch': 'pv-best-torch-normal',
    'pv-best-blink': 'pv-best-flash-normal'
  };

  PV.migrateBests = function (target) {
    // `target` mirrors the browser's localStorage (getItem/setItem); the page
    // itself reaches that through `store`, whose get/set wrap it in a try/catch.
    var get = target ? target.getItem.bind(target) : store.get;
    var set = target ? target.setItem.bind(target) : store.set;

    Object.keys(OLD_BEST_KEYS).forEach(function (from) {
      var value = get(from);
      if (value == null) return;
      var to = OLD_BEST_KEYS[from];
      if (get(to) != null) return;
      set(to, value);
    });
  };

  PV.createGame = function (difficultyId, opts) {
    var rules = PV.DIFFICULTIES[difficultyId];
    var bestKey = 'pv-best-' + difficultyId;
    // The menu demo scores like any other round; persisting that would
    // overwrite the player's own best.
    var persist = !opts || opts.persist !== false;
    var deathSounded = false;

    var game = {
      difficulty: difficultyId,
      rules: rules,
      maze: PV.createMaze(),
      pacman: PV.createPacman(),
      ghosts: PV.createGhosts(),
      vision: PV.createVision(rules),

      state: 'ready',      // ready | playing | dying | levelclear | gameover
      stateTime: 0,
      time: 0,

      score: 0,
      best: readBest(bestKey),
      level: 1,
      lives: 3,

      invuln: 0,
      frightTimer: 0,
      frightEndingCued: false,   // has the countdown cue fired for the current fright?
      ghostCombo: 0,
      killer: null,        // the ghost that caught you, shown during 'dying'
      waveIndex: 0,
      waveTimer: WAVES[0].t,
      dotsEaten: 0,
      pops: [],

      // set by main.js so the game can make noise and shake the screen
      onEvent: function () {}
    };

    function resetActors() {
      game.pacman.reset();
      game.ghosts.forEach(function (g) {
        g.reset();
        g.speedScale = rules.ghostSpeed * (1 + (game.level - 1) * 0.06);
      });
      game.vision.reset();
      game.frightTimer = 0;
      game.frightEndingCued = false;
      game.ghostCombo = 0;
      game.waveIndex = 0;
      game.waveTimer = WAVES[0].t;
      game.invuln = 1.2;
    }

    game.startRound = function () {
      resetActors();
      game.state = 'ready';
      game.stateTime = 0;
      game.onEvent('roundStart');
    };

    game.nextLevel = function () {
      game.level++;
      game.maze = PV.createMaze();
      game.dotsEaten = 0;
      game.startRound();
    };

    game.restart = function () {
      game.maze = PV.createMaze();
      game.score = 0;
      game.level = 1;
      game.lives = 3;
      game.dotsEaten = 0;
      game.pops = [];
      game.startRound();
    };

    /* Entering 'playing' restarts the clock. The ghost release ladder measures
     * from the first frame the player can act, and 'ready' runs for a length
     * the player controls. */
    function beginPlay() {
      game.state = 'playing';
      game.stateTime = 0;
    }

    game.steer = function (dir) {
      game.pacman.want = dir;
      if (game.state === 'ready') beginPlay();
    };

    /**
     * The player's chosen layers, except while dying — then ghosts and Pac-Man
     * are forced on. Renderer and HUD both read this, so the layer chips stay
     * honest about what's on screen.
     */
    game.visibleAlpha = function () {
      var a = game.vision.alpha;
      if (game.state !== 'dying') return a;
      return { dots: a.dots, walls: a.walls, ghosts: 1, pacman: 1 };
    };

    game.selectVision = function (layer) {
      // The board is covered outside 'playing', so a pick there spends a
      // cooldown on nothing.
      if (game.state !== 'playing') return 'ignored';
      // Torch expands its ping from wherever Pac-Man is standing; the other
      // modes ignore the origin.
      var res = game.vision.select(layer, game.pacman);
      if (res === 'ok') {
        // Torch is a flash on a delay, so it takes the flash sound too.
        game.onEvent(rules.mode === 'stare' ? 'visionSwitch' : 'blink');
      } else if (res !== 'same' && res !== 'ignored') {
        // 'cooldown' and 'unavailable' are refusals and get the denied sound;
        // 'same' is silent — you already have that layer.
        game.onEvent('visionDenied');
      }
      return res;
    };

    game.update = function (dt) {
      game.time += dt;
      game.stateTime += dt;
      updatePops(dt);

      if (game.state === 'ready') {
        // Returning before vision.update() freezes the cooldown and Flash's
        // opening flash while the board is still behind the curtain.
        if (game.stateTime > 1.8) beginPlay();
        return;
      }

      game.vision.update(dt);
      if (game.state === 'dying') { updateDying(); return; }
      if (game.state === 'levelclear') {
        if (game.stateTime > 2.0) game.nextLevel();
        return;
      }
      if (game.state === 'gameover') return;

      if (game.invuln > 0) game.invuln -= dt;
      advanceWaves(dt);

      var bumped = game.pacman.update(dt, game.maze);
      if (bumped) game.onEvent('bump');

      consumePellet();
      moveGhosts(dt);
      samplePulse();
      checkCollisions();

      // Only while still alive: checkCollisions above may have set 'dying', and
      // that has to win over clearing the level on the same frame.
      if (game.state === 'playing' && game.maze.pelletsLeft === 0) {
        game.state = 'levelclear';
        game.stateTime = 0;
        game.onEvent('levelClear');
      }
    };

    function updateDying() {
      // the death jingle waits out the reveal beat
      if (!deathSounded && game.stateTime >= DEATH_REVEAL) {
        deathSounded = true;
        game.onEvent('death');
      }
      if (game.stateTime > DEATH_REVEAL + DEATH_ANIM + 0.25) afterDeath();
    }

    /** Scatter/chase alternation. A power pellet suspends the schedule. */
    function advanceWaves(dt) {
      if (game.frightTimer > 0) {
        game.frightTimer -= dt;
        // fire the countdown cue once, the instant the last-two-seconds
        // warning window opens (mirrors render.js's flash threshold)
        if (!game.frightEndingCued && game.frightTimer > 0 && game.frightTimer < 2) {
          game.frightEndingCued = true;
          game.onEvent('frightEnding', game.frightTimer);
        }
        if (game.frightTimer <= 0) {
          game.ghosts.forEach(function (g) { g.frightened = false; });
          game.ghostCombo = 0;
        }
        return;
      }

      game.waveTimer -= dt;
      if (game.waveTimer <= 0 && game.waveIndex < WAVES.length - 1) {
        game.waveIndex++;
        game.waveTimer = WAVES[game.waveIndex].t;
        // classic behaviour: ghosts about-face when the wave flips
        game.ghosts.forEach(function (g) {
          if (g.state === 'out') g.dir = PV.reverseOf(g.dir);
        });
      }
    }

    function addScore(points) {
      game.score += points;
      if (game.score > game.best) {
        game.best = game.score;
        if (persist) store.set(bestKey, String(game.best));
      }
    }

    function consumePellet() {
      var t = game.pacman.tile();
      var kind = game.maze.eatPellet(t.col, t.row);
      if (!kind) return;

      game.dotsEaten++;
      if (kind !== POWER_PELLET) {
        addScore(10);
        game.onEvent('chomp');
        return;
      }

      addScore(50);
      game.frightTimer = Math.max(1, FRIGHT_TIME - (game.level - 1) * 0.6);
      game.frightEndingCued = false;
      game.ghostCombo = 0;
      game.ghosts.forEach(function (g) {
        if (g.state === 'out') {
          g.frightened = true;
          g.dir = PV.reverseOf(g.dir);
        }
      });
      game.onEvent('power');
    }

    function moveGhosts(dt) {
      releaseGhosts(dt);
      var mode = game.frightTimer > 0 ? 'chase' : WAVES[game.waveIndex].mode;
      var blinky = game.ghosts[0];
      game.ghosts.forEach(function (g) {
        var target = PV.ghostTarget(g, mode, game.pacman, blinky);
        PV.updateGhost(g, dt, game.maze, target);
      });
    }

    /* Torch mode: a ghost blips where the expanding ring first reaches it.
     * `dist` is the distance it was found at and clocks the blip's fade —
     * plain distance, not the tunnel-wrapped one checkCollisions uses, since
     * the ring is drawn as a circle in board space and a wrapped distance
     * would light a blip before the visible ring arrived. Under `pingTracks`
     * the contact then follows its ghost, fading to the schedule it was found
     * on rather than to wherever the ghost has wandered. Every ghost is
     * sampled whatever its state: the ping reports where things are, and eaten
     * ghosts show as eyes in every mode. */
    function samplePulse() {
      game.vision.pulses().forEach(function (p) {
        if (p.layer !== 'ghosts') return;
        var reach = p.age * PV.PULSE_SPEED;
        game.ghosts.forEach(function (g, i) {
          var blip = p.blips[i];
          if (blip) {
            // wobble too: render.js draws the contact as the ghost's own
            // outline, and a still contact should be still mid-waddle.
            if (rules.pingTracks) {
              blip.x = g.x;
              blip.y = g.y;
              blip.wobble = g.wobble;
            }
            return;
          }
          var d = Math.hypot(g.x - p.x, g.y - p.y);
          if (d <= reach) {
            p.blips[i] = { x: g.x, y: g.y, wobble: g.wobble, dist: d };
          }
        });
      });
    }

    function releaseGhosts(dt) {
      game.ghosts.forEach(function (g) {
        if (g.state !== 'house') return;
        if (g.releaseTimer > 0) { g.releaseTimer -= dt; return; }

        // `earliest` staggers the exits so they read one at a time; `latest`
        // covers a player who isn't eating, so nobody is left alone with Blinky.
        var r = g.release;
        if (game.stateTime < r.earliest) return;
        if (game.dotsEaten < r.dots && game.stateTime < r.latest) return;

        g.state = 'leaving';
        // A ghost released mid-fright joins the fright already running.
        g.frightened = game.frightTimer > 0;
      });
    }

    function checkCollisions() {
      var p = game.pacman;
      for (var i = 0; i < game.ghosts.length; i++) {
        var g = game.ghosts[i];
        if (g.state === 'eaten' || g.state === 'entering' || g.state === 'house') continue;

        // tunnel wrap means the raw dx can be a whole board wide
        var dx = Math.abs(p.x - g.x);
        dx = Math.min(dx, PV.WIDTH - dx);
        var dy = Math.abs(p.y - g.y);
        if (Math.hypot(dx, dy) > TILE * 0.7) continue;

        if (g.frightened) {
          var value = GHOST_VALUES[Math.min(game.ghostCombo, GHOST_VALUES.length - 1)];
          game.ghostCombo++;
          addScore(value);
          g.frightened = false;
          g.state = 'eaten';
          addPop(g.x, g.y, String(value), '#42e8ff');
          game.onEvent('eatGhost');
        } else if (game.invuln <= 0) {
          die(g);
          return;
        }
      }
    }

    function die(ghost) {
      game.lives--;
      game.killer = ghost || null;
      game.state = 'dying';
      game.stateTime = 0;
      deathSounded = false;
      game.onEvent('caught');
    }

    function afterDeath() {
      if (game.lives <= 0) {
        game.state = 'gameover';
        game.stateTime = 0;
        game.onEvent('gameOver');
      } else {
        game.startRound();
      }
    }

    function addPop(x, y, text, color) {
      game.pops.push({ x: x, y: y, text: text, color: color, age: 0, life: 1.1 });
    }

    function updatePops(dt) {
      for (var i = game.pops.length - 1; i >= 0; i--) {
        game.pops[i].age += dt;
        if (game.pops[i].age > game.pops[i].life) game.pops.splice(i, 1);
      }
    }

    resetActors();
    return game;
  };

})(window.PV);
