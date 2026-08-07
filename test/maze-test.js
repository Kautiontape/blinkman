/* Maze regression test — run with:  node test/maze-test.js
 *
 * Checks every top x bottom combination of every tier of every board in
 * PV.BOARDS. Run this after editing a piece pool in js/maze.js; it catches the
 * mistakes that are easy to make by hand and invisible until you play the
 * level: an unreachable pocket, a two-wide corridor, and a dead end.
 *
 * Requiring the file instead exports the rule checks and runs nothing.
 */
global.window = {};
require(require('path').join(__dirname, '..', 'js', 'maze.js'));
var PV = global.window.PV;

function openAt(board, layout, c, r) {
  if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
  var ch = layout[r][c];
  return ch !== '#' && ch !== '-';
}

/* A 2x2 block of open tiles is a two-wide corridor. Real Pac-Man mazes have
 * none, and it would let a ghost slide past Pac-Man in the same passage.
 * The ghost-house block is the one legitimate exception. */
function wideSpots(board, layout) {
  var hits = [];
  var h = board.house;
  for (var r = 0; r < board.rows - 1; r++) {
    for (var c = 0; c < board.cols - 1; c++) {
      if (c >= h.c0 && c <= h.c1 && r >= h.r0 && r <= h.r1) continue;
      if (openAt(board, layout, c, r) && openAt(board, layout, c + 1, r) &&
          openAt(board, layout, c, r + 1) && openAt(board, layout, c + 1, r + 1)) {
        hits.push('(c' + c + ',r' + r + ')');
      }
    }
  }
  return hits;
}

/* An open tile with only one walkable neighbour is a dead end. The two tunnel
 * mouths are the one exception — they wrap to each other rather than stopping. */
function deadEnds(board, layout) {
  var hits = [];
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var r = 0; r < board.rows; r++) {
    for (var c = 0; c < board.cols; c++) {
      if (!openAt(board, layout, c, r)) continue;
      if (r === board.tunnelRow && (c === 0 || c === board.cols - 1)) continue;
      var deg = 0;
      DIRS.forEach(function (d) {
        var nc = c + d[0], nr = r + d[1];
        if (r === board.tunnelRow) {
          if (nc < 0) nc = board.cols - 1;
          else if (nc >= board.cols) nc = 0;
        }
        if (openAt(board, layout, nc, nr)) deg++;
      });
      if (deg <= 1) hits.push('(c' + c + ',r' + r + ')');
    }
  }
  return hits;
}

/* Requiring the file hands the rule checks to another harness; running it
 * directly sweeps every board and tier. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { wideSpots: wideSpots, deadEnds: deadEnds, openAt: openAt };
}

if (require.main === module) {
  /* Board templates. The full board must describe exactly what the module
   * constants used to hardcode, so migrating consumers onto it is a no-op. */
  var templateFailures = 0;
  var expect = function (label, got, want) {
    if (got === want) return;
    templateFailures++;
    console.log('  TEMPLATE  ' + label + ': got ' + got + ', want ' + want);
  };

  var full = PV.BOARDS.full;
  expect('full.cols', full.cols, 28);
  expect('full.rows', full.rows, 31);
  expect('full.tunnelRow', full.tunnelRow, 14);
  expect('full.house.c0', full.house.c0, 10);
  expect('full.house.c1', full.house.c1, 17);
  expect('full.house.r0', full.house.r0, 12);
  expect('full.house.r1', full.house.r1, 16);
  expect('full.spawn.pacman.col', full.spawn.pacman.col, 13);
  expect('full.spawn.pacman.row', full.spawn.pacman.row, 23);
  expect('full.spawn.outside.row', full.spawn.outside.row, 11);
  expect('full.spawn.inky.col', full.spawn.inky.col, 11);
  expect('full.spawn.clyde.col', full.spawn.clyde.col, 15);

  // A maze carries its own board, so nothing needs the module constants.
  var m = PV.createMaze(4, 9);
  expect('maze.cols', m.cols, 28);
  expect('maze.rows', m.rows, 31);
  expect('maze.width', m.width, 560);
  expect('maze.height', m.height, 620);
  expect('maze.tunnelRow', m.tunnelRow, 14);
  expect('maze.spawn.pacman.col', m.spawn.pacman.col, 13);
  expect('maze.board', m.board, 'full');

  /* The complexity score the tier bands are expressed in. Pinned to the arcade
   * layout so a change to the metric has to be deliberate. */
  var arcade = PV.assembleLayout(PV.BOARDS.full, PV.TOP_PIECES[0], PV.BOTTOM_PIECES[0]);
  var sc = PV.scoreLayout(PV.BOARDS.full, arcade);
  expect('arcade junctions', sc.junctions, 34);
  expect('arcade corners', sc.corners, 30);
  expect('arcade score', sc.score, 64);
  expect('arcade pellets', sc.pellets, 242);

  /* Level 1: the on-ramp. Small, open, and the same every game. */
  var small = PV.BOARDS.small;
  var l1Layout = PV.assembleLayout(small, small.tiers.fixed.top[0], small.tiers.fixed.bottom[0]);
  var l1Score = PV.scoreLayout(small, l1Layout);
  expect('L1 pellets', l1Score.pellets, 128);
  expect('L1 score', l1Score.score, 36);
  expect('L1 junctions', l1Score.junctions, 28);
  expect('L1 corners', l1Score.corners, 8);

  var l1Problems = PV.checkLayout(small, l1Layout);
  expect('L1 valid', l1Problems.join('; '), '');

  /* The ladder: which board and pool each level draws from. Levels 5-6, 7-8
   * and 9-up share a rung, so both ends of each are checked. */
  [[1, 'small', 'fixed'],
   [2, 'mid',   'gentle'],
   [3, 'large', 'medium'],
   [4, 'full',  'fixed'],
   [5, 'full',  'classic'],
   [6, 'full',  'classic'],
   [7, 'full',  'dense'],
   [8, 'full',  'dense'],
   [9, 'full',  'densest']].forEach(function (rung) {
    var plan = PV.planFor(rung[0]);
    expect('L' + rung[0] + ' board', plan.board, rung[1]);
    expect('L' + rung[0] + ' tier', plan.tier, rung[2]);
    expect('L' + rung[0] + ' maze is on that board', PV.createMaze(rung[0], 3).board, rung[1]);
  });

  // The last rung runs forever.
  expect('L10 stays on densest', PV.planFor(10).tier, 'densest');
  expect('L500 stays on densest', PV.planFor(500).tier, 'densest');

  // Below the ladder, and off it: the first rung, never a fall-through.
  expect('L0 falls to the first rung', PV.planFor(0).board, 'small');
  expect('a negative level falls to the first rung', PV.planFor(-3).tier, 'fixed');
  expect('a missing level falls to the first rung', PV.planFor().board, 'small');
  expect('a non-number falls to the first rung', PV.planFor('4').board, 'small');

  /* Levels 1 and 4 are one-map pools, so the seed has nothing to choose and
   * every game plays the same board. */
  var l1Fixed = true, l4Arcade = true;
  for (var sd = 0; sd < 200; sd++) {
    var l1Maze = PV.createMaze(1, sd);
    if (l1Maze.recipe !== 'S1/S1' || l1Maze.totalPellets !== 128) l1Fixed = false;
    if (PV.createMaze(4, sd).recipe !== 'T1/B1') l4Arcade = false;
  }
  expect('L1 is the same map at every seed', l1Fixed, true);
  expect('L4 is the arcade map at every seed', l4Arcade, true);

  /* A tier whose pieces the RNG cannot reach is a silent bug — the level would
   * ship with pieces nobody ever sees. One level is swept per pool. */
  [2, 3, 5, 7, 9].forEach(function (level) {
    var plan = PV.planFor(level);
    var pool = PV.BOARDS[plan.board].tiers[plan.tier];
    var reached = {}, count = 0;
    for (var s = 0; s < 1000; s++) {
      var rec = PV.createMaze(level, s).recipe;
      if (!reached[rec]) { reached[rec] = true; count++; }
    }
    expect('L' + level + ' reaches every ' + plan.tier + ' combination',
      count, pool.top.length * pool.bottom.length);
  });

  // Deterministic in both arguments: level and seed together fix the maze.
  var fixedByArgs = true;
  [1, 2, 3, 4, 5, 7, 9].forEach(function (level) {
    [0, 1, 12345].forEach(function (s) {
      var x = PV.createMaze(level, s), y = PV.createMaze(level, s);
      if (x.board !== y.board || x.recipe !== y.recipe ||
          x.totalPellets !== y.totalPellets) fixedByArgs = false;
    });
  });
  expect('level and seed fix the maze', fixedByArgs, true);

  // Geometry invariants every template shares — these catch a typo in the data.
  Object.keys(PV.BOARDS).forEach(function (id) {
    var b = PV.BOARDS[id];
    expect(id + ' mirrors evenly', b.cols % 2, 0);
    expect(id + ' rows add up', 1 + b.topRows + b.middle.length + b.bottomRows + 1, b.rows);
    expect(id + ' house interior is 6 wide', b.house.c1 - b.house.c0 - 1, 6);
    expect(id + ' house interior is 3 tall', b.house.r1 - b.house.r0 - 1, 3);
    expect(id + ' tunnel runs through the house',
      b.tunnelRow > b.house.r0 && b.tunnelRow < b.house.r1, true);
    expect(id + ' middle band is authored half-width', b.middle[0].length, b.cols / 2);
    expect(id + ' has a pellet floor', typeof b.minPellets, 'number');
    var corners = PV.scatterCorners(b);
    Object.keys(corners).forEach(function (n) {
      var t = corners[n];
      expect(id + ' ' + n + ' scatters onto the board',
        t.col >= 0 && t.col < b.cols && t.row >= 0 && t.row < b.rows, true);
    });
  });

  /* A recipe is top.id + '/' + bottom.id and the HUD shows it, so an id has to
   * name one piece across every board and tier — tools/piece-check.js only sees
   * a single pool and cannot catch a clash between two of them. The two sides
   * are separate namespaces, since a recipe's position says which is which:
   * level 1 is 'S1/S1'. Sharing one piece object across tiers is legitimate —
   * full.tiers.fixed holds the first classic pair — so pieces are compared by
   * identity rather than by id. */
  ['top', 'bottom'].forEach(function (side) {
    var owner = {};
    Object.keys(PV.BOARDS).forEach(function (boardId) {
      var board = PV.BOARDS[boardId];
      Object.keys(board.tiers).forEach(function (tierId) {
        board.tiers[tierId][side].forEach(function (piece) {
          var where = boardId + '/' + tierId;
          var prev = owner[piece.id];
          if (!prev) { owner[piece.id] = { piece: piece, where: where }; return; }
          if (prev.piece === piece) return;
          templateFailures++;
          console.log('  TEMPLATE  ' + side + ' id "' + piece.id + '" names two ' +
            'different pieces: ' + prev.where + ' and ' + where);
        });
      });
    });
  });

  var failures = 0;
  var combos = 0;

  Object.keys(PV.BOARDS).forEach(function (boardId) {
    var board = PV.BOARDS[boardId];
    console.log(boardId + '  ' + board.cols + 'x' + board.rows);
    Object.keys(board.tiers).forEach(function (tierId) {
      var pool = board.tiers[tierId];
      pool.top.forEach(function (top) {
        pool.bottom.forEach(function (bottom) {
          combos++;
          var id = boardId + '/' + tierId + '  ' + top.id + '/' + bottom.id;
          var layout = PV.assembleLayout(board, top, bottom);
          var problems = PV.checkLayout(board, layout);
          var wide = wideSpots(board, layout);
          var dead = deadEnds(board, layout);
          var sc = PV.scoreLayout(board, layout);

          if (problems.length || wide.length || dead.length) {
            failures++;
            if (problems.length) console.log('  ' + id + '  BROKEN: ' + problems.join('; '));
            if (wide.length) {
              console.log('  ' + id + '  TWO-WIDE CORRIDOR at ' + wide.slice(0, 8).join(' ') +
                (wide.length > 8 ? ' (+' + (wide.length - 8) + ' more)' : ''));
            }
            if (dead.length) {
              console.log('  ' + id + '  DEAD END at ' + dead.slice(0, 8).join(' ') +
                (dead.length > 8 ? ' (+' + (dead.length - 8) + ' more)' : ''));
            }
          } else {
            console.log('  ' + id + '  ok    pellets=' + sc.pellets + ' score=' + sc.score);
          }
        });
      });
    });
  });

  /* Determinism, and confirm no combination is unreachable by the RNG. A level
   * draws from one pool, so reachability is per level; 5 is the classic rung. */
  var classicCombos = PV.BOARDS.full.tiers.classic.top.length *
                      PV.BOARDS.full.tiers.classic.bottom.length;
  var a = PV.createMaze(5, 12345), b = PV.createMaze(5, 12345);
  var reproducible = a.recipe === b.recipe && a.totalPellets === b.totalPellets;
  var seen = {};
  var distinct = 0;
  for (var s = 0; s < 2000; s++) {
    var rec = PV.createMaze(5, s).recipe;
    if (!seen[rec]) { seen[rec] = true; distinct++; }
  }

  console.log('');
  console.log('seed reproducible:        ' + (reproducible ? 'PASS' : 'FAIL'));
  console.log('combinations reachable:   ' + distinct + '/' + classicCombos +
    ' ' + (distinct === classicCombos ? 'PASS' : 'FAIL'));

  var ok = failures === 0 && reproducible && distinct === classicCombos &&
           templateFailures === 0;
  console.log('');
  console.log('board templates:          ' + (templateFailures === 0 ? 'PASS' : 'FAIL'));
  console.log(ok ? 'ALL ' + combos + ' MAZE COMBINATIONS VALID'
                 : failures + ' COMBINATION(S) REJECTED');
  process.exit(ok ? 0 : 1);
}
