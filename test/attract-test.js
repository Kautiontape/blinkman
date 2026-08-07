/* Attract-mode regression test — run with:  node test/attract-test.js
 *
 * Covers the demo that plays behind the menu: that the autopilot only ever
 * steers somewhere legal, that it clears dots at a reasonable rate, that the
 * rotation reaches every layer in order, and that a demo round cannot
 * overwrite a stored best score.
 */
global.window = {};
var path = require('path');

/* game.js reaches localStorage through a try/catch, so in node the write it
 * guards is invisible. The stub is what makes it observable, and so what makes
 * the persist option testable at all. */
var writes = [];
global.localStorage = {
  getItem: function () { return null; },
  setItem: function (k, v) { writes.push(k + '=' + v); }
};

// Mirrors index.html's relative script order, so a module-scope capture from
// game.js would go red here exactly as it would silently break in the browser.
['maze.js', 'vision.js', 'entities.js', 'game.js', 'attract.js'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f));
});
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

var STEP = 1 / 60;

console.log('score persistence');

/* Steering in a circle rather than in one direction: it eats regardless of
 * which way the spawn happens to open, and the spawn tile itself is bare. */
function driveByHand(game, seconds) {
  var turns = [PV.DIRS.left, PV.DIRS.up, PV.DIRS.right, PV.DIRS.down];
  game.startRound();
  game.invuln = Infinity;
  for (var i = 0; i < 60 * seconds; i++) {
    if (i % 30 === 0) game.steer(turns[(i / 30) % turns.length]);
    game.update(STEP);
  }
}

(function () {
  writes.length = 0;
  var demo = PV.createGame('stare-normal', { persist: false });
  driveByHand(demo, 6);
  check('a persist:false game scores', demo.score > 0, demo.score);
  check('a persist:false game writes nothing', writes.length === 0, writes.join(' '));

  writes.length = 0;
  var real = PV.createGame('stare-normal');
  driveByHand(real, 6);
  check('a default game still writes', real.score > 0 && writes.length > 0,
    real.score + ' / ' + writes.length + ' writes');
})();

console.log('');
console.log('autopilot steering');

/* The invariant: on every frame the autopilot steers, the direction it hands
 * over is passable from the tile Pac-Man is standing in. It only steers in
 * 'ready' and 'playing', so the other states are filtered out — `want` there is
 * whatever pacman.reset() left behind.
 *
 * `want` is read after the step because game.update() does not touch it, and
 * the tile is read before, because that is the tile the route was rooted at. */
(function () {
  var illegal = 0, samples = 0, blocked = 0, first = '';

  for (var run = 0; run < 5; run++) {
    var a = PV.createAttract();
    for (var i = 0; i < 60 * 20; i++) {
      var p = a.game.pacman;
      var maze = a.game.maze;
      var was = p.tile();
      var state = a.game.state;
      a.update(STEP);

      if (a.game.maze !== maze) continue;      // a level clear rolled a new maze
      if (state !== 'ready' && state !== 'playing') continue;
      samples++;
      if (p.blocked) blocked++;
      if (!maze.passable(was.col + p.want.x, was.row + p.want.y, false)) {
        illegal++;
        if (!first) first = p.want.name + ' from ' + was.col + ',' + was.row;
      }
    }
  }

  check('steered enough frames to mean something', samples > 3000, samples);
  check('never steers into a wall', illegal === 0, illegal + ' of ' + samples + '  ' + first);
  check('never walks into one either', blocked === 0, blocked);
})();

console.log('');
console.log('tunnel routing');

/* The one place the column wrap carries weight. Pac-Man stands on the left
 * mouth with the board's only pellet two steps west through the tunnel and 26
 * steps east the long way round, so reaching it the short way means wrapping.
 * The tunnel row carries no pellets of its own, which is why ordinary play
 * never exercises this. */
(function () {
  var a = PV.createAttract();
  var m = a.game.maze;
  for (var r = 0; r < m.rows; r++) {
    for (var c = 0; c < m.cols; c++) m.pellets[r][c] = 0;
  }
  m.pellets[m.tunnelRow][m.cols - 2] = 1;

  a.game.pacman.x = PV.center(0);
  a.game.pacman.y = PV.center(m.tunnelRow);
  a.game.pacman.dir = PV.DIRS.right;
  a.update(STEP);

  // Facing east, so the fallback that picks any open direction answers
  // 'right'. Only a wrapped search answers 'left'.
  check('routes through the tunnel', a.game.pacman.want === PV.DIRS.left,
    a.game.pacman.want.name);
})();

console.log('');
console.log('autopilot progress');

/* invuln frozen at Infinity is the seam opening-test.js uses to keep a ghost
 * from ending a round mid-measurement. Without it a death resets the board and
 * the count measures luck. */
(function () {
  var worst = Infinity;
  for (var run = 0; run < 5; run++) {
    var a = PV.createAttract();
    a.game.invuln = Infinity;
    for (var i = 0; i < 60 * 20; i++) a.update(STEP);
    worst = Math.min(worst, a.game.dotsEaten);
  }
  // An autopilot that skipped the search and walked any open direction clears
  // 40-44 in this window. The search clears 71 or more.
  check('clears dots at a sane rate', worst >= 60, worst);
})();

console.log('');
console.log('layer rotation');

/* One cycle is 12s, so 13s covers a full lap and the start of the next.
 * invuln is frozen because a death resets the vision to `walls` mid-lap. */
(function () {
  var a = PV.createAttract();
  a.game.invuln = Infinity;

  var order = [], seen = {};
  for (var i = 0; i < 60 * 13; i++) {
    a.update(STEP);
    var cur = a.game.vision.current();
    if (!cur) continue;
    seen[cur] = true;
    if (order[order.length - 1] !== cur) order.push(cur);
  }

  var pool = PV.DIFFICULTIES['stare-normal'].pool.slice().sort().join(',');
  check('reaches every layer in the pool', Object.keys(seen).sort().join(',') === pool,
    Object.keys(seen).sort().join(','));
  check('walks walls -> dots -> ghosts, then repeats',
    order.join(' ') === 'walls dots ghosts walls', order.join(' '));
})();

console.log('');
console.log('rotation across a round reset');

/* What reading the next layer off the lit one buys. A death puts the vision
 * back on `walls` mid-lap while the hold timer keeps its phase. A counter would
 * call for the layer already lit, get `same` back, and stall there for a second
 * hold. */
(function () {
  var a = PV.createAttract();
  a.game.invuln = Infinity;

  // Two swaps in, so the lit layer is the last of the three.
  for (var i = 0; i < 60 * 9; i++) a.update(STEP);
  check('lit layer is ghosts at 9s', a.game.vision.current() === 'ghosts',
    a.game.vision.current());

  // startRound() is where a death lands, and it is what resets the vision.
  // resetActors() puts invuln back to 1.2, so it needs freezing again.
  a.game.startRound();
  a.game.invuln = Infinity;
  check('the reset puts the vision back on walls', a.game.vision.current() === 'walls',
    a.game.vision.current());

  for (var j = 0; j < 60 * 5; j++) a.update(STEP);
  check('the lap resumes from the reset layer', a.game.vision.current() === 'dots',
    a.game.vision.current());
})();

console.log('');
console.log('recovery from game over');

/* `levelclear` advances itself and `dying` restarts the round, so `gameover` is
 * the one state the demo has to climb out of by hand. Left in it, `game.update`
 * returns immediately every frame and the board freezes for as long as the menu
 * is open. Three lives at Normal speed puts it within a few minutes. */
(function () {
  var a = PV.createAttract();
  a.game.state = 'gameover';
  a.update(STEP);
  check('leaves game over on the next frame', a.game.state !== 'gameover', a.game.state);

  // The whole way there: a death on the last life, then back to a fresh round.
  var b = PV.createAttract();
  b.game.lives = 0;
  b.game.state = 'dying';
  b.game.stateTime = 0;

  var seen = {};
  for (var i = 0; i < 60 * 4; i++) {
    b.update(STEP);
    seen[b.game.state] = true;
  }
  check('a last death passes through game over', seen.gameover === true,
    Object.keys(seen).join(','));
  check('and comes out on a fresh round', b.game.state === 'playing' && b.game.lives === 3,
    b.game.state + ' with ' + b.game.lives + ' lives');
})();

console.log('');
console.log('a board that is not 28x31');

/* A board no template produces, so the sizes the autopilot derives from its
 * maze cannot be right by coincidence of matching a shipped one.
 *
 * The shape is a lattice: a wall pillar on every even row and column, a sealed
 * house astride the tunnel row, and a pellet on the rest. The house, the
 * tunnel and Pac-Man's spawn sit on odd rows and columns, which is where the
 * corridors run. */
function buildStandIn(cols, rows) {
  var tunnelRow = ((rows / 2) | 0) | 1;
  var houseCol = (((cols / 2) | 0) - 1) | 1;
  var house = { c0: houseCol - 3, c1: houseCol + 3, r0: tunnelRow - 2, r1: tunnelRow + 1 };
  var spawn = {
    pacman:  { col: houseCol,     row: house.r1 + 5 },
    door:    { col: houseCol,     row: house.r0 },
    outside: { col: houseCol,     row: house.r0 - 1 },
    blinky:  { col: houseCol,     row: house.r0 + 1 },
    pinky:   { col: houseCol,     row: tunnelRow },
    inky:    { col: houseCol - 2, row: tunnelRow },
    clyde:   { col: houseCol + 2, row: tunnelRow }
  };

  var walls = [], doors = [], pellets = [], left = 0;
  for (var r = 0; r < rows; r++) {
    walls[r] = []; doors[r] = []; pellets[r] = [];
    for (var c = 0; c < cols; c++) {
      var border = r === 0 || r === rows - 1 ||
        ((c === 0 || c === cols - 1) && r !== tunnelRow);
      var pillar = r % 2 === 0 && c % 2 === 0;
      var onHouse = r >= house.r0 && r <= house.r1 && c >= house.c0 && c <= house.c1;
      var inHouse = r > house.r0 && r < house.r1 && c > house.c0 && c < house.c1;
      var isDoorTile = r === spawn.door.row && c === spawn.door.col;

      doors[r][c] = isDoorTile;
      walls[r][c] = isDoorTile ? false : onHouse ? !inHouse : border || pillar;
      var bare = walls[r][c] || isDoorTile || inHouse ||
        (r === spawn.pacman.row && c === spawn.pacman.col);
      pellets[r][c] = bare ? 0 : 1;
      if (pellets[r][c]) left++;
    }
  }

  function isWall(c, r) {
    if (r < 0 || r >= rows) return true;
    if (c < 0 || c >= cols) return r !== tunnelRow;
    return walls[r][c];
  }

  function inside(c, r) { return r >= 0 && r < rows && c >= 0 && c < cols; }

  function isDoor(c, r) { return inside(c, r) && doors[r][c]; }

  function pelletAt(c, r) { return inside(c, r) ? pellets[r][c] : 0; }

  return {
    cols: cols, rows: rows,
    width: cols * PV.TILE, height: rows * PV.TILE,
    tunnelRow: tunnelRow,
    spawn: spawn,
    scatter: PV.scatterCorners({ cols: cols, rows: rows }),
    house: house,
    walls: walls, doors: doors, pellets: pellets,

    get pelletsLeft() { return left; },

    isWall: isWall,
    isDoor: isDoor,
    pelletAt: pelletAt,
    passable: function (c, r, throughDoor) {
      if (isWall(c, r)) return false;
      if (isDoor(c, r) && !throughDoor) return false;
      return true;
    },
    eatPellet: function (c, r) {
      var v = pelletAt(c, r);
      if (v) { pellets[r][c] = 0; left--; }
      return v;
    }
  };
}

/* Runs `fn` with PV.createMaze handing out the given shapes in order, the last
 * one repeating. That is the seam a demo board arrives through: createGame
 * calls it once at construction and again on every restart. */
function onStandIn(shapes, fn) {
  var real = PV.createMaze;
  var made = 0;
  PV.createMaze = function () {
    var s = shapes[Math.min(made++, shapes.length - 1)];
    return buildStandIn(s[0], s[1]);
  };
  try { fn(); } finally { PV.createMaze = real; }
}

/* The buffers are private to the demo, so their lengths are read where they
 * are made: the typed-array constructors, wrapped for what they are handed.
 * attract.js is the only file that allocates one. */
function allocsDuring(fn) {
  var names = ['Int32Array', 'Int16Array', 'Int8Array'];
  var reals = {}, lengths = [];
  names.forEach(function (n) {
    var real = global[n];
    reals[n] = real;
    global[n] = function (len) { lengths.push(len); return new real(len); };
  });
  try { fn(); } finally {
    names.forEach(function (n) { global[n] = reals[n]; });
  }
  return lengths;
}

(function () {
  onStandIn([[20, 23]], function () {
    var a;
    var lengths = allocsDuring(function () {
      a = PV.createAttract();
      a.update(STEP);
    });
    check('the demo is steering on the stand-in board',
      a.game.maze.cols === 20 && a.game.maze.rows === 23,
      a.game.maze.cols + 'x' + a.game.maze.rows);
    check('five buffers, each of the board\'s own cols * rows',
      lengths.join(',') === '460,460,460,460,460', lengths.join(','));
  });

  /* A restart is where a demo board is replaced. Each shape below differs from
   * the one before in one span only, so buffers cut for either are the wrong
   * size for the board that follows — and the last is the one before it turned
   * on its side, which holds the same number of tiles in rows of another
   * length. */
  onStandIn([[20, 23], [24, 23], [24, 27], [27, 24]], function () {
    var a = PV.createAttract();
    a.update(STEP);

    function afterRestart() {
      return allocsDuring(function () {
        a.game.state = 'gameover';
        a.update(STEP);
      }).join(',');
    }

    var wider = afterRestart();
    check('a wider board gets buffers of its own',
      wider === '552,552,552,552,552', wider);

    var taller = afterRestart();
    check('a taller board gets buffers of its own',
      taller === '648,648,648,648,648', taller);

    var turned = afterRestart();
    check('so does a board of the same tile count in another shape',
      turned === '648,648,648,648,648', turned);

    check('the demo is steering on the last board',
      a.game.maze.cols === 27 && a.game.maze.rows === 24,
      a.game.maze.cols + 'x' + a.game.maze.rows);

    var again = allocsDuring(function () { a.update(STEP); });
    check('a board it is already sized to allocates nothing',
      again.length === 0, again.join(','));
  });
})();

/* The steering invariant of the run above, on a board whose width the module
 * constants do not describe. `col` may be one outside the board and `row` may
 * not: the tunnel is the only edge that leads anywhere. */
onStandIn([[20, 23]], function () {
  var a = PV.createAttract();
  a.game.invuln = Infinity;
  var m = a.game.maze;
  var illegal = 0, offBoard = 0, samples = 0, blocked = 0, first = '';

  for (var i = 0; i < 60 * 20; i++) {
    var p = a.game.pacman;
    var was = p.tile();
    var state = a.game.state;
    a.update(STEP);

    if (state !== 'ready' && state !== 'playing') continue;
    samples++;
    if (p.blocked) blocked++;
    var col = was.col + p.want.x, row = was.row + p.want.y;
    if (row < 0 || row >= m.rows || col < -1 || col > m.cols) offBoard++;
    if (!m.passable(col, row, false)) {
      illegal++;
      if (!first) first = p.want.name + ' from ' + was.col + ',' + was.row;
    }
  }

  check('20x23: steered enough frames to mean something', samples > 1000, samples);
  check('20x23: never steers into a wall', illegal === 0,
    illegal + ' of ' + samples + '  ' + first);
  check('20x23: never steers off the board', offBoard === 0, offBoard);
  check('20x23: never walks into a wall either', blocked === 0, blocked);
});

/* Strips the board down to a single pellet, so the direction the demo hands
 * over names the route to one known tile. */
function onlyPellet(maze, col, row) {
  for (var r = 0; r < maze.rows; r++) {
    for (var c = 0; c < maze.cols; c++) maze.pellets[r][c] = 0;
  }
  maze.pellets[row][col] = 1;
}

/* Blinky, loose and unfrightened on a tile. That is the only state the danger
 * fill seeds from; the other three stay in the house, which it skips. */
function looseGhost(game, col, row) {
  var g = game.ghosts[0];
  g.state = 'out';
  g.frightened = false;
  g.x = PV.center(col);
  g.y = PV.center(row);
}

/* Pac-Man on a tunnel mouth with the board's only pellet at `pellet`, facing
 * the way the search should not send him — the fallback that picks any open
 * direction answers with the mouth's other side, so only the search can
 * produce the direction each check below expects. */
function mouthStep(startCol, facing, pellet) {
  var a = PV.createAttract();
  var m = a.game.maze;
  onlyPellet(m, pellet.col, pellet.row);

  a.game.pacman.x = PV.center(startCol);
  a.game.pacman.y = PV.center(m.tunnelRow);
  a.game.pacman.dir = facing;
  a.update(STEP);
  return a.game.pacman.want.name;
}

/* The tunnel check again, from both mouths of a board 20 wide: a wrap using
 * the module's 28 would land eight columns past the far edge, on a tile this
 * board does not have. The pellet is two steps through the mouth and sixteen
 * the long way round. */
onStandIn([[20, 23]], function () {
  var west = mouthStep(0, PV.DIRS.right, { col: 18, row: 11 });
  check('20x23: routes west through the tunnel', west === 'left', west);

  var east = mouthStep(19, PV.DIRS.left, { col: 1, row: 11 });
  check('20x23: routes east through the tunnel', east === 'right', east);
});

/* And that the wrap lands on the far column rather than merely somewhere: on a
 * board 24 wide the tile eight columns past the right edge is (3, 14), which
 * is where this pellet sits. It is four steps east of the left mouth and
 * twenty-two through the tunnel, so the route is east. */
onStandIn([[24, 27]], function () {
  var step = mouthStep(0, PV.DIRS.left, { col: 3, row: 14 });
  check('24x27: the tunnel is a wrap, not a shortcut', step === 'right', step);
});

/* What the flood fill is for. One pellet in the far corner from the spawn is
 * only reached by a search that indexes tiles the way the board is laid out —
 * a fill addressing 28-wide rows on a 20-wide board reaches nothing and the
 * demo falls back to walking whichever way is open. */
onStandIn([[20, 23]], function () {
  var a = PV.createAttract();
  a.game.invuln = Infinity;
  onlyPellet(a.game.maze, 1, 1);

  for (var i = 0; i < 60 * 15 && a.game.dotsEaten === 0; i++) a.update(STEP);
  check('20x23: walks to the only pellet on the board', a.game.dotsEaten === 1,
    a.game.dotsEaten + ' after ' + (i / 60).toFixed(1) + 's');
});

/* The danger fill, which nothing above reads. The ghost stands two columns off
 * the corridor Pac-Man is in, near enough that the buffer reaches across it
 * and seals (17, 17) — four tiles below him and three above the board's only
 * pellet. Sealing that tile takes the two steps out of the ghost's own, so a
 * fill that spread from anywhere but the ghost leaves the way down open.
 *
 * Rounding it means the long way about: six columns west, the eight rows of
 * column 11, then back east along row 21 and up onto the pellet. The border
 * seals the other side and columns 13 to 16 are inside the buffer at row 17,
 * so that detour is the only one there is. */
onStandIn([[20, 23]], function () {
  var a = PV.createAttract();
  onlyPellet(a.game.maze, 17, 20);
  looseGhost(a.game, 15, 17);

  a.game.pacman.x = PV.center(17);
  a.game.pacman.y = PV.center(13);
  a.game.pacman.dir = PV.DIRS.left;
  a.update(STEP);

  check('20x23: routes around a loose ghost', a.game.pacman.want.name === 'left',
    a.game.pacman.want.name);
});

/* The fill crosses the tunnel, and lands where the wrap does. A ghost on the
 * right mouth puts the left mouth one step away and the tile east of it two,
 * which is the whole buffer — so the pellet below that tile is reached by
 * going east, down two rows and back west, and the step west that would walk
 * under the ghost's nose is the one direction ruled out. */
onStandIn([[24, 27]], function () {
  var a = PV.createAttract();
  onlyPellet(a.game.maze, 1, 14);
  looseGhost(a.game, 23, 13);

  a.game.pacman.x = PV.center(2);
  a.game.pacman.y = PV.center(13);
  a.game.pacman.dir = PV.DIRS.left;
  a.update(STEP);

  check('24x27: the danger fill crosses the tunnel',
    a.game.pacman.want.name === 'right', a.game.pacman.want.name);
});

/* The tunnel the other way about, and what avoidance is worth: two pellets,
 * and the near one is the second tile east of a ghost standing on the left
 * mouth — which is to say inside the buffer, one step west of Pac-Man. He
 * passes it up for the one two steps east of him, so the step he takes is away
 * from the tunnel. A wrap that fell a row short of the mouth would put the
 * near pellet a step outside the buffer and he would take it. */
onStandIn([[24, 27]], function () {
  var a = PV.createAttract();
  var m = a.game.maze;
  onlyPellet(m, 22, 13);
  m.pellets[13][19] = 1;
  looseGhost(a.game, 0, 13);

  a.game.pacman.x = PV.center(21);
  a.game.pacman.y = PV.center(13);
  a.game.pacman.dir = PV.DIRS.right;
  a.update(STEP);

  check('24x27: passes up a pellet inside the buffer',
    a.game.pacman.want.name === 'left', a.game.pacman.want.name);
});

console.log('');
console.log(failures === 0 ? 'ALL ATTRACT CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
