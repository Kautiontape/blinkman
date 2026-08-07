/* attract.js — the demo that plays behind the menu: an autopilot Pac-Man and a
 * timed rotation through the layers. It makes no sound and never touches the
 * HUD, which stays on its idle reading while this runs. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  // The layers the rotation walks, and how long each one holds.
  var ROTATION = ['walls', 'dots', 'ghosts'];
  var HOLD = 4;

  // Tiles this close to a loose ghost are routed around.
  var DANGER = 2;

  var STEPS = [PV.DIRS.up, PV.DIRS.left, PV.DIRS.down, PV.DIRS.right];

  PV.createAttract = function () {
    // persist:false — a demo round scores like any other, and the write would
    // land on the player's own Stare Normal best.
    var game = PV.createGame('stare-normal', { persist: false });

    /* Reused across frames so the searches allocate nothing. The `seen` arrays
     * hold a generation number rather than a flag, which saves clearing them. */
    var cols = 0, rows = 0;
    var dangerSeen, dangerDist, routeSeen, routeFirst, queue;
    var dangerGen = 0;
    var routeGen = 0;
    var rotateTimer = 0;

    // The board the searches run on. A board of a different shape gets buffers
    // of its own.
    function sizeTo(maze) {
      if (maze.cols === cols && maze.rows === rows) return;
      cols = maze.cols; rows = maze.rows;
      var cells = cols * rows;
      dangerSeen = new Int32Array(cells);
      dangerDist = new Int16Array(cells);
      routeSeen = new Int32Array(cells);
      routeFirst = new Int8Array(cells);
      queue = new Int32Array(cells);
    }

    sizeTo(game.maze);

    function idx(col, row) { return row * cols + col; }

    /* A column outside the board maps to the opposite edge, which makes the
     * tunnel an ordinary search edge. Off-board tiles are floor only on the
     * tunnel row, so anywhere else this resolves to the border wall. */
    function wrapCol(col) {
      return col < 0 ? col + cols : col >= cols ? col - cols : col;
    }

    function walkable(col, row) {
      return row >= 0 && row < rows && game.maze.passable(col, row, false);
    }

    /** Step distance from each tile to the nearest loose, unfrightened ghost. */
    function buildDanger() {
      dangerGen++;
      var head = 0, tail = 0;

      for (var i = 0; i < game.ghosts.length; i++) {
        var g = game.ghosts[i];
        if (g.state !== 'out' || g.frightened) continue;
        var t = g.tile();
        var seed = idx(wrapCol(t.col), t.row);
        if (dangerSeen[seed] === dangerGen) continue;
        dangerSeen[seed] = dangerGen;
        dangerDist[seed] = 0;
        queue[tail++] = seed;
      }

      while (head < tail) {
        var cur = queue[head++];
        var d = dangerDist[cur];
        if (d >= DANGER) continue;        // nothing past the buffer is consulted
        var col = cur % cols, row = (cur / cols) | 0;
        for (var k = 0; k < STEPS.length; k++) {
          var nc = wrapCol(col + STEPS[k].x), nr = row + STEPS[k].y;
          if (!walkable(nc, nr)) continue;
          var n = idx(nc, nr);
          if (dangerSeen[n] === dangerGen) continue;
          dangerSeen[n] = dangerGen;
          dangerDist[n] = d + 1;
          queue[tail++] = n;
        }
      }
    }

    function dangerous(i) {
      return dangerSeen[i] === dangerGen && dangerDist[i] <= DANGER;
    }

    /** A pellet, or a ghost worth eating while one is edible. */
    function isTarget(col, row) {
      if (game.maze.pelletAt(col, row)) return true;
      if (game.frightTimer <= 0) return false;
      for (var i = 0; i < game.ghosts.length; i++) {
        var g = game.ghosts[i];
        if (!g.frightened || g.state !== 'out') continue;
        var t = g.tile();
        if (t.col === col && t.row === row) return true;
      }
      return false;
    }

    /* Breadth-first to the nearest target. Each tile records the step out of
     * Pac-Man's own tile that reached it, so arriving at a target hands back
     * the first move of the route with no path to walk back. */
    function routeStep(avoid) {
      routeGen++;
      var pac = game.pacman.tile();
      var root = idx(wrapCol(pac.col), pac.row);
      var head = 0, tail = 0;

      routeSeen[root] = routeGen;
      routeFirst[root] = -1;
      queue[tail++] = root;

      while (head < tail) {
        var cur = queue[head++];
        var col = cur % cols, row = (cur / cols) | 0;

        // The root is skipped: it has no first step to report, and Pac-Man is
        // already on his way across it.
        if (routeFirst[cur] !== -1 && isTarget(col, row)) return STEPS[routeFirst[cur]];

        for (var k = 0; k < STEPS.length; k++) {
          var nc = wrapCol(col + STEPS[k].x), nr = row + STEPS[k].y;
          if (!walkable(nc, nr)) continue;
          var n = idx(nc, nr);
          if (routeSeen[n] === routeGen) continue;
          if (avoid && dangerous(n)) continue;
          routeSeen[n] = routeGen;
          routeFirst[n] = routeFirst[cur] === -1 ? k : routeFirst[cur];
          queue[tail++] = n;
        }
      }
      return null;
    }

    /* Last resort, so the direction handed over is always a legal one. Only
     * reachable in the frame between the last pellet and `levelclear`. */
    function anyOpenStep() {
      var t = game.pacman.tile();
      var back = PV.reverseOf(game.pacman.dir);
      var reverse = null;
      for (var k = 0; k < STEPS.length; k++) {
        if (!walkable(wrapCol(t.col + STEPS[k].x), t.row + STEPS[k].y)) continue;
        if (STEPS[k] === back) { reverse = STEPS[k]; continue; }
        return STEPS[k];
      }
      return reverse || game.pacman.dir;
    }

    function steer() {
      buildDanger();
      // Boxed in by ghosts, walk out through them rather than stall on screen.
      game.steer(routeStep(true) || routeStep(false) || anyOpenStep());
    }

    /* The next layer is read off the one that is lit rather than kept in a
     * counter, so a round reset — which puts the vision back to `walls` —
     * resumes the cycle instead of skipping a layer. An unrecognised or absent
     * layer indexes to -1 and so starts the lap over. */
    function rotate(dt) {
      rotateTimer += dt;
      if (rotateTimer < HOLD) return;
      rotateTimer -= HOLD;
      var at = ROTATION.indexOf(game.vision.current());
      game.selectVision(ROTATION[(at + 1) % ROTATION.length]);
    }

    return {
      game: game,

      update: function (dt) {
        // 'levelclear' advances itself and 'dying' restarts the round; only
        // 'gameover' is terminal.
        if (game.state === 'gameover') game.restart();
        // After the restart, which may have laid out a board of another shape.
        sizeTo(game.maze);
        if (game.state === 'ready' || game.state === 'playing') steer();
        // Held outside 'playing': selectVision() refuses there, and a death
        // would otherwise burn cycle time behind a frozen board.
        if (game.state === 'playing') rotate(dt);
        game.update(dt);
      }
    };
  };

})(window.PV);
