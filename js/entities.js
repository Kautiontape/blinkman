/* entities.js — Pac-Man and the ghosts: grid movement and ghost targeting. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var TILE = PV.TILE;
  var EPS = 1e-6;

  var DIRS = {
    up:    { x: 0, y: -1, name: 'up' },
    left:  { x: -1, y: 0, name: 'left' },
    down:  { x: 0, y: 1, name: 'down' },
    right: { x: 1, y: 0, name: 'right' },
    none:  { x: 0, y: 0, name: 'none' }
  };
  PV.DIRS = DIRS;

  // Classic tie-break order when two routes score the same.
  var TURN_ORDER = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];

  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', none: 'none' };

  function reverseOf(d) { return DIRS[OPPOSITE[d.name]]; }
  PV.reverseOf = reverseOf;

  function atCenter(e) {
    return Math.abs(e.x - PV.center(Math.floor(e.x / TILE))) < EPS &&
           Math.abs(e.y - PV.center(Math.floor(e.y / TILE))) < EPS;
  }

  /* The 1e-9 nudge absorbs float drift: a coordinate a hair short of a centre
   * must report a whole tile, not a ~0 step that stalls the walk. */
  function gapToNextCenter(pos, sign) {
    var k = (pos - TILE / 2) / TILE;
    var i = sign > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
    return Math.abs(PV.center(i) - pos);
  }

  function distToNextCenter(e) {
    if (e.dir.x !== 0) return gapToNextCenter(e.x, e.dir.x);
    if (e.dir.y !== 0) return gapToNextCenter(e.y, e.dir.y);
    return Infinity;
  }

  function snap(e) {
    e.x = PV.center(Math.round((e.x - TILE / 2) / TILE));
    e.y = PV.center(Math.round((e.y - TILE / 2) / TILE));
  }

  function wrapTunnel(e) {
    var col = Math.floor(e.x / TILE);
    if (col < 0) e.x += PV.WIDTH;
    else if (col >= PV.COLS) e.x -= PV.WIDTH;
  }

  /* Walk an entity along the grid; returns true if it hit a wall. Turns happen
   * only at tile centres. `onCenter` steers by returning a direction (the ghost
   * AI); without one the entity turns toward `e.want` when that way is open.
   * `guard` caps the tiles crossed in one call. */
  function advance(e, dist, maze, forGhost, onCenter) {
    var remaining = dist;
    var blocked = false;
    var guard = 0;

    while (remaining > EPS && guard++ < 64) {
      if (atCenter(e)) {
        var col = Math.floor(e.x / TILE);
        var row = Math.floor(e.y / TILE);

        if (onCenter) {
          var steer = onCenter(col, row);
          if (steer) e.dir = steer;
        } else if (e.want && (e.want.x !== e.dir.x || e.want.y !== e.dir.y)) {
          if (maze.passable(col + e.want.x, row + e.want.y, forGhost)) {
            e.dir = e.want;
          }
        }

        if (e.dir === DIRS.none ||
            !maze.passable(col + e.dir.x, row + e.dir.y, forGhost)) {
          blocked = true;
          break;
        }
      }

      var toCenter = distToNextCenter(e);
      var step = Math.min(remaining, toCenter);
      e.x += e.dir.x * step;
      e.y += e.dir.y * step;
      remaining -= step;

      if (step >= toCenter - EPS) snap(e);   // landed on a centre — realign
      wrapTunnel(e);
    }
    return blocked;
  }

  PV.advance = advance;

  PV.createPacman = function () {
    var pac = {
      x: 0, y: 0,
      dir: DIRS.left,
      want: DIRS.left,        // queued turn, applied at the next centre that allows it
      speed: 5.6 * TILE,      // tiles/sec -> px/sec
      mouth: 0,               // chew phase in radians, 0..2pi
      blocked: false,
      bumpedWant: null,       // the direction the last bump was reported for

      reset: function () {
        this.x = PV.center(PV.SPAWN.pacman.col);
        this.y = PV.center(PV.SPAWN.pacman.row);
        this.dir = DIRS.left;
        this.want = DIRS.left;
        this.mouth = 0;
        this.blocked = false;
        this.bumpedWant = null;
      },

      /** @returns true on the frames a wall should be heard */
      update: function (dt, maze) {
        var wasBlocked = this.blocked;
        this.blocked = advance(this, this.speed * dt, maze, false, null);

        if (!this.blocked) {
          this.mouth = (this.mouth + dt * 9) % (Math.PI * 2);
          this.bumpedWant = null;
          return false;
        }

        // Sounds on impact, and again whenever the player turns into a
        // different wall while still stuck.
        if (!wasBlocked || this.bumpedWant !== this.want) {
          this.bumpedWant = this.want;
          return true;
        }
        return false;
      },

      tile: function () {
        return { col: Math.floor(this.x / TILE), row: Math.floor(this.y / TILE) };
      }
    };
    pac.reset();
    return pac;
  };

  var GHOST_DEFS = [
    { name: 'blinky', color: '#ff3c3c', spawn: 'blinky', scatter: { col: 25, row: 0 },  release: 0 },
    { name: 'pinky',  color: '#ff9ede', spawn: 'pinky',  scatter: { col: 2,  row: 0 },  release: 0 },
    { name: 'inky',   color: '#42e8ff', spawn: 'inky',   scatter: { col: 27, row: 30 }, release: 20 },
    { name: 'clyde',  color: '#ffab42', spawn: 'clyde',  scatter: { col: 0,  row: 30 }, release: 60 }
  ];
  PV.GHOST_DEFS = GHOST_DEFS;

  var EXIT_X = PV.center(PV.SPAWN.outside.col);
  var EXIT_Y = PV.center(PV.SPAWN.outside.row);
  var HOUSE_Y = PV.center(PV.SPAWN.pinky.row);

  PV.createGhosts = function () {
    return GHOST_DEFS.map(function (def) {
      var spawn = PV.SPAWN[def.spawn];
      var g = {
        name: def.name,
        color: def.color,
        scatterTile: def.scatter,
        releaseAt: def.release,     // dots eaten before this one leaves

        x: 0, y: 0,
        dir: DIRS.left,
        state: 'house',             // house | leaving | out | eaten | entering
        frightened: false,
        homeY: 0,                   // centre of the idle bob
        releaseTimer: 0,
        wobble: 0,                  // bob + skirt animation phase

        baseSpeed: 5.0 * TILE,
        speedScale: 1,              // set per level by game.js

        reset: function () {
          this.x = PV.center(spawn.col);
          this.y = PV.center(spawn.row);
          this.homeY = this.y;
          // blinky starts on the board, the rest wait inside
          this.dir = def.name === 'blinky' ? DIRS.left : DIRS.up;
          this.state = def.name === 'blinky' ? 'out' : 'house';
          this.frightened = false;
          this.releaseTimer = 0;
          this.wobble = Math.random() * Math.PI * 2;
        },

        tile: function () {
          return { col: Math.floor(this.x / TILE), row: Math.floor(this.y / TILE) };
        },

        speed: function () {
          if (this.state === 'eaten' || this.state === 'entering') return 11 * TILE;
          var s = this.baseSpeed * this.speedScale;
          return this.frightened ? s * 0.55 : s;
        }
      };
      g.reset();
      return g;
    });
  };

  PV.updateGhost = function (g, dt, maze, target) {
    g.wobble += dt * 6;

    // The house states are scripted and ignore the maze.
    if (g.state === 'house') {
      g.y = g.homeY + Math.sin(g.wobble * 0.6) * 4;
      return;
    }
    if (g.state === 'leaving') {
      if (!approach(g, EXIT_X, g.y, 6 * TILE * dt)) return;     // slide under the door
      if (!approach(g, EXIT_X, EXIT_Y, 6 * TILE * dt)) return;  // then rise out
      g.state = 'out';
      g.dir = DIRS.left;
      return;
    }
    if (g.state === 'entering') {
      if (!approach(g, EXIT_X, HOUSE_Y, 11 * TILE * dt)) return;
      g.state = 'house';
      g.homeY = HOUSE_Y;        // everyone revives from the middle slot
      g.frightened = false;
      g.releaseTimer = 1.0;
      return;
    }

    var wandering = g.frightened && g.state !== 'eaten';

    /* Pathing treats the house door as solid (the `false`). Ghosts cross it only
     * in the scripted 'leaving' and 'entering' moves above, which ignore the
     * maze; an eaten ghost aims for the tile *above* the door and switches to
     * 'entering' there. */
    advance(g, g.speed() * dt, maze, false, function (col, row) {
      var back = reverseOf(g.dir);
      var opts = [];
      for (var i = 0; i < TURN_ORDER.length; i++) {
        var d = TURN_ORDER[i];
        if (d === back) continue;
        if (maze.passable(col + d.x, row + d.y, false)) opts.push(d);
      }
      if (!opts.length) return back;                             // dead end: about-face
      if (wandering) return opts[(Math.random() * opts.length) | 0];

      var best = opts[0], bestD = Infinity;
      for (var j = 0; j < opts.length; j++) {
        var dc = col + opts[j].x - target.col;
        var dr = row + opts[j].y - target.row;
        var dd = dc * dc + dr * dr;      // no sqrt needed to rank
        if (dd < bestD) { bestD = dd; best = opts[j]; }
      }
      return best;
    });

    // eyes back above the door: dive in
    if (g.state === 'eaten') {
      var t = g.tile();
      if (t.col === PV.SPAWN.outside.col && t.row === PV.SPAWN.outside.row) {
        g.state = 'entering';
      }
    }
  };

  /** Move straight toward a point. Returns true once it has arrived. */
  function approach(g, tx, ty, step) {
    var dx = tx - g.x, dy = ty - g.y;
    var d = Math.hypot(dx, dy);
    if (d <= step) { g.x = tx; g.y = ty; return true; }
    g.x += dx / d * step;
    g.y += dy / d * step;
    return false;
  }

  /** The classic targeting personalities, so the four don't pile onto one tile. */
  PV.ghostTarget = function (g, mode, pac, blinky) {
    if (g.state === 'eaten') return PV.SPAWN.outside;
    if (mode === 'scatter') return g.scatterTile;

    var pt = pac.tile();
    var pd = pac.dir;

    switch (g.name) {
      case 'pinky':                 // four tiles ahead of Pac-Man
        return { col: pt.col + pd.x * 4, row: pt.row + pd.y * 4 };

      case 'inky': {                // blinky reflected through a point two ahead
        var pivot = { col: pt.col + pd.x * 2, row: pt.row + pd.y * 2 };
        var bt = blinky.tile();
        return { col: pivot.col * 2 - bt.col, row: pivot.row * 2 - bt.row };
      }

      case 'clyde': {               // bold at range, shy up close
        var gt = g.tile();
        if (Math.hypot(gt.col - pt.col, gt.row - pt.row) <= 8) return g.scatterTile;
        break;
      }
    }
    return pt;                      // blinky heads straight for Pac-Man
  };

})(window.PV);
