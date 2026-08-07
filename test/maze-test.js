/* Maze regression test — run with:  node test/maze-test.js
 *
 * Checks every top x bottom quadrant combination. Run this after editing
 * TOP_PIECES or BOTTOM_PIECES in js/maze.js; it catches the mistakes that
 * are easy to make by hand and invisible until you play the level:
 * an unreachable pocket, a two-wide corridor, and a dead end.
 */
global.window = {};
require(require('path').join(__dirname, '..', 'js', 'maze.js'));
var PV = global.window.PV;

/* A 2x2 block of open tiles is a two-wide corridor. Real Pac-Man mazes have
 * none, and it would let a ghost slide past Pac-Man in the same passage.
 * The sealed ghost-house interior is the one legitimate exception. */
function wideSpots(layout) {
  var hits = [];
  function open(c, r) {
    if (r < 0 || r >= PV.ROWS || c < 0 || c >= PV.COLS) return false;
    var ch = layout[r][c];
    return ch !== '#' && ch !== '-';
  }
  for (var r = 0; r < PV.ROWS - 1; r++) {
    for (var c = 0; c < PV.COLS - 1; c++) {
      var inHouse = c >= 10 && c <= 16 && r >= 12 && r <= 15;
      if (inHouse) continue;
      if (open(c, r) && open(c + 1, r) && open(c, r + 1) && open(c + 1, r + 1)) {
        hits.push('(c' + c + ',r' + r + ')');
      }
    }
  }
  return hits;
}

/* An open tile with only one walkable neighbour is a dead end. The two
 * tunnel mouths (row 14, columns 0 and 27) are the one exception — they
 * wrap to each other rather than stopping. */
function deadEnds(layout) {
  var hits = [];
  function open(c, r) {
    if (r < 0 || r >= PV.ROWS || c < 0 || c >= PV.COLS) return false;
    var ch = layout[r][c];
    return ch !== '#' && ch !== '-';
  }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var r = 0; r < PV.ROWS; r++) {
    for (var c = 0; c < PV.COLS; c++) {
      if (!open(c, r)) continue;
      var deg = 0;
      DIRS.forEach(function (d) {
        var nc = c + d[0], nr = r + d[1];
        if (r === PV.TUNNEL_ROW) {
          if (nc < 0) nc = PV.COLS - 1;
          else if (nc >= PV.COLS) nc = 0;
        }
        if (open(nc, nr)) deg++;
      });
      if (deg <= 1) hits.push('(c' + c + ',r' + r + ')');
    }
  }
  return hits;
}

/* Board templates. The full board must describe exactly what the module
 * constants used to hardcode, so migrating consumers onto it is a no-op. */
var templateFailures = 0;
function expect(label, got, want) {
  if (got === want) return;
  templateFailures++;
  console.log('  TEMPLATE  ' + label + ': got ' + got + ', want ' + want);
}

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
var m = PV.createMaze(9);
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

var failures = 0;
var combos = 0;

PV.TOP_PIECES.forEach(function (top) {
  PV.BOTTOM_PIECES.forEach(function (bottom) {
    combos++;
    var id = top.id + '/' + bottom.id;
    var layout = PV.assembleLayout(full, top, bottom);
    var problems = PV.checkLayout(full, layout);
    var wide = wideSpots(layout);
    var dead = deadEnds(layout);

    var pellets = 0;
    for (var r = 0; r < PV.ROWS; r++) {
      for (var c = 0; c < PV.COLS; c++) {
        if (layout[r][c] === '.' || layout[r][c] === 'o') pellets++;
      }
    }

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
      console.log('  ' + id + '  ok    pellets=' + pellets);
    }
  });
});

// Determinism, and confirm no combination is unreachable by the RNG.
var a = PV.createMaze(12345), b = PV.createMaze(12345);
var reproducible = a.recipe === b.recipe && a.totalPellets === b.totalPellets;
var seen = {};
var distinct = 0;
for (var s = 0; s < 2000; s++) {
  var rec = PV.createMaze(s).recipe;
  if (!seen[rec]) { seen[rec] = true; distinct++; }
}

console.log('');
console.log('seed reproducible:        ' + (reproducible ? 'PASS' : 'FAIL'));
console.log('combinations reachable:   ' + distinct + '/' + combos +
  ' ' + (distinct === combos ? 'PASS' : 'FAIL'));

var ok = failures === 0 && reproducible && distinct === combos && templateFailures === 0;
console.log('');
console.log('board templates:          ' + (templateFailures === 0 ? 'PASS' : 'FAIL'));
console.log(ok ? 'ALL ' + combos + ' MAZE COMBINATIONS VALID'
               : failures + ' COMBINATION(S) REJECTED');
process.exit(ok ? 0 : 1);
