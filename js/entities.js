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

  function wrapTunnel(e, maze) {
    var col = Math.floor(e.x / TILE);
    if (col < 0) e.x += maze.width;
    else if (col >= maze.cols) e.x -= maze.width;
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
      wrapTunnel(e, maze);
    }
    return blocked;
  }

  PV.advance = advance;

  PV.createPacman = function (maze) {
    var pac = {
      x: 0, y: 0,
      dir: DIRS.left,
      want: DIRS.left,        // queued turn, applied at the next centre that allows it
      speed: 5.6 * TILE,      // tiles/sec -> px/sec
      mouth: 0,               // chew phase in radians, 0..2pi
      blocked: false,
      bumpedWant: null,       // the direction the last bump was reported for

      reset: function () {
        this.x = PV.center(maze.spawn.pacman.col);
        this.y = PV.center(maze.spawn.pacman.row);
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

  /* `release` gates the trip out of the house: a ghost goes once `earliest`
   * has passed and either the dot count is met or `latest` has passed too.
   * The floors are what keep the exits one at a time — dot counts alone send
   * Inky and Clyde out together on a mid-level respawn, where dotsEaten is
   * already well past both. Blinky's is all zeroes: it leads the file-out and
   * goes the moment play starts. */
  var GHOST_DEFS = [
    { name: 'blinky', color: '#ff3c3c', spawn: 'blinky',
      release: { dots: 0, earliest: 0, latest: 0 } },
    { name: 'pinky',  color: '#ff9ede', spawn: 'pinky',
      release: { dots: 0,  earliest: 2, latest: 2 } },
    { name: 'inky',   color: '#42e8ff', spawn: 'inky',
      release: { dots: 20, earliest: 5, latest: 9 } },
    { name: 'clyde',  color: '#ffab42', spawn: 'clyde',
      release: { dots: 60, earliest: 8, latest: 14 } }
  ];
  PV.GHOST_DEFS = GHOST_DEFS;

  // The states in which a ghost is inside the house or crossing its door.
  var IN_HOUSE = { house: 1, leaving: 1, entering: 1 };

  /* How strongly a ghost shows through a dark ghosts layer. Full anywhere at or
   * below the door line, zero on the tile it emerges onto, linear across the
   * doorway between them, so leaving the house is what turns a ghost invisible
   * and re-entering is what brings it back. Position alone drives it — no timer
   * to keep in step. The state list is load-bearing: a ghost loose on the lower
   * board is below the door line too, and would otherwise read as fully lit. */
  PV.ghostReveal = function (g, maze) {
    if (!IN_HOUSE[g.state]) return 0;
    var exitY = PV.center(maze.spawn.outside.row);
    var doorY = PV.center(maze.spawn.door.row);
    var t = (g.y - exitY) / (doorY - exitY);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };

  PV.createGhosts = function (maze) {
    var scatter = maze.scatter;
    return GHOST_DEFS.map(function (def) {
      var spawn = maze.spawn[def.spawn];
      var g = {
        name: def.name,
        color: def.color,
        scatterTile: scatter[def.name],
        release: def.release,       // when this one may leave the house

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
          // all four wait inside, facing the door, and file out on the ladder
          this.dir = DIRS.up;
          this.state = 'house';
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
    var outside = maze.spawn.outside;
    var exitX = PV.center(outside.col);
    var exitY = PV.center(outside.row);
    var houseY = PV.center(maze.spawn.pinky.row);

    g.wobble += dt * 6;

    // The house states are scripted and ignore the maze.
    if (g.state === 'house') {
      g.y = g.homeY + Math.sin(g.wobble * 0.6) * 4;
      return;
    }
    if (g.state === 'leaving') {
      if (!approach(g, exitX, g.y, 6 * TILE * dt)) return;     // slide under the door
      if (!approach(g, exitX, exitY, 6 * TILE * dt)) return;   // then rise out
      g.state = 'out';
      g.dir = DIRS.left;
      return;
    }
    if (g.state === 'entering') {
      if (!approach(g, exitX, houseY, 11 * TILE * dt)) return;
      g.state = 'house';
      g.homeY = houseY;         // everyone revives from the middle slot
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
      if (t.col === outside.col && t.row === outside.row) {
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
  PV.ghostTarget = function (g, mode, pac, blinky, maze) {
    if (g.state === 'eaten') return maze.spawn.outside;
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
