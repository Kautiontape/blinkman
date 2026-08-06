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

var failures = 0;
var combos = 0;

PV.TOP_PIECES.forEach(function (top) {
  PV.BOTTOM_PIECES.forEach(function (bottom) {
    combos++;
    var id = top.id + '/' + bottom.id;
    var layout = PV.assembleLayout(top, bottom);
    var problems = PV.checkLayout(layout);
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

var ok = failures === 0 && reproducible && distinct === combos;
console.log('');
console.log(ok ? 'ALL ' + combos + ' MAZE COMBINATIONS VALID'
               : failures + ' COMBINATION(S) REJECTED');
process.exit(ok ? 0 : 1);
