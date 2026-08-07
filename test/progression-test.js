/* Difficulty progression test — run with:  node test/progression-test.js
 *
 * test/maze-test.js proves every individual maze is playable. It cannot see
 * whether the game gets harder: a piece authored into the wrong tier, or a
 * board whose pieces out-score a later level's, is valid in isolation and
 * silently flattens the curve. This checks the ladder as a ladder.
 *
 * A level's difficulty is a range, not a number — the seed picks the pieces —
 * so every rung is measured at its extremes, across every top x bottom
 * combination in its pool. The curve has to hold at the worst draw.
 */
global.window = {};
require(require('path').join(__dirname, '..', 'js', 'maze.js'));
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   ' + detail));
  if (!ok) failures++;
}

function note(label) {
  console.log('  --    ' + label);
}

/* The least and most cut-up maze, and the fewest and most pellets, a level can
 * deal. Every combination is enumerated rather than sampled — the pools are
 * small and a range that misses its own extreme is worse than no range.
 *
 * A board whose dimensions contradict its pieces makes scoring meaningless, so
 * the rung is marked broken and reported rather than measured; the
 * well-formedness section below names the field that is wrong. */
function extremesFor(level) {
  var plan = PV.planFor(level);
  var board = PV.BOARDS[plan.board];
  var pool = board.tiers[plan.tier];
  var r = {
    level: level, board: board.id, tier: plan.tier,
    cols: board.cols, rows: board.rows, combos: 0, broken: null,
    minScore: Infinity, maxScore: -Infinity,
    minPellets: Infinity, maxPellets: -Infinity
  };

  pool.top.forEach(function (top) {
    pool.bottom.forEach(function (bottom) {
      var layout = PV.assembleLayout(board, top, bottom);
      r.combos++;
      if (layout.length !== board.rows) {
        r.broken = 'the ' + board.id + ' board says ' + board.rows +
          ' rows but ' + top.id + '/' + bottom.id + ' assembles to ' + layout.length;
        return;
      }
      for (var y = 0; y < layout.length; y++) {
        if (layout[y].length === board.cols) continue;
        r.broken = 'the ' + board.id + ' board is ' + board.cols + ' wide but ' +
          top.id + '/' + bottom.id + ' assembles row ' + y + ' at ' + layout[y].length;
        return;
      }
      var sc = PV.scoreLayout(board, layout);
      if (sc.score < r.minScore) r.minScore = sc.score;
      if (sc.score > r.maxScore) r.maxScore = sc.score;
      if (sc.pellets < r.minPellets) r.minPellets = sc.pellets;
      if (sc.pellets > r.maxPellets) r.maxPellets = sc.pellets;
    });
  });
  return r;
}

// One level per rung. 5-6, 7-8 and 9-up each draw from a single pool.
var RUNGS = [1, 2, 3, 4, 5, 7, 9].map(extremesFor);

/* The ladder, printed whether or not it passes. When a rung stops climbing
 * this table is what shows where, and by how much. */
function pad(s, w) {
  s = String(s);
  while (s.length < w) s += ' ';
  return s;
}
function padLeft(s, w) {
  s = String(s);
  while (s.length < w) s = ' ' + s;
  return s;
}

console.log('');
console.log('the ladder');
console.log('  ' + pad('level', 6) + pad('board', 7) + pad('size', 8) +
  pad('tier', 10) + pad('maps', 6) + pad('pellets', 12) + 'score');
RUNGS.forEach(function (r) {
  console.log('  ' + pad(r.level, 6) + pad(r.board, 7) +
    pad(r.cols + 'x' + r.rows, 8) + pad(r.tier, 10) + pad(r.combos, 6) +
    (r.broken ? 'UNMEASURABLE — ' + r.broken
              : pad(r.minPellets + '-' + r.maxPellets, 12) +
                r.minScore + '-' + r.maxScore));
});

/* Rule one: every rung is more cut-up than the one below it. The ceiling has
 * to rise and the floor must never drop — but not "the floor clears the
 * previous ceiling". Level 4 is the arcade map and levels 5-6 draw from a pool
 * that contains it, so those two legitimately touch at 64. */
console.log('');
console.log('score climbs the whole way');
var i;
for (i = 1; i < RUNGS.length; i++) {
  var a = RUNGS[i - 1], b = RUNGS[i];
  var pair = 'L' + a.level + '->L' + b.level;
  if (a.broken || b.broken) {
    check(pair + ' score is comparable', false, (a.broken || b.broken));
    continue;
  }
  check(pair + ' score ceiling rises', b.maxScore > a.maxScore,
    'L' + a.level + ' tops out at ' + a.maxScore + ', L' + b.level +
    ' at ' + b.maxScore + ' — the harder level is no more cut-up than the easier one');
  check(pair + ' score floor never drops', b.minScore >= a.minScore,
    'L' + a.level + ' bottoms out at ' + a.minScore + ', L' + b.level +
    ' at ' + b.minScore + ' — L' + b.level + ' can deal a maze simpler than any L' + a.level);
}

/* Rule two: a level is longer than the one below it only while the board is
 * still growing. From level 4 the board is fixed at 28x31 and the escalation
 * is density alone — stretching the later levels out as well would compound
 * two difficulty axes on top of each other. */
console.log('');
console.log('pellets climb while the board grows');
for (i = 1; i < RUNGS.length; i++) {
  var p = RUNGS[i - 1], q = RUNGS[i];
  var pq = 'L' + p.level + '->L' + q.level;
  if (p.broken || q.broken) {
    check(pq + ' pellet count is comparable', false, (p.broken || q.broken));
    continue;
  }
  if (p.board === q.board) {
    note(pq + ' shares the ' + p.board + ' board — density only, pellet count not checked');
    continue;
  }
  check(pq + ' pellet ceiling rises', q.maxPellets > p.maxPellets,
    'L' + p.level + ' tops out at ' + p.maxPellets + ' pellets, L' + q.level +
    ' at ' + q.maxPellets + ' — the bigger board is no longer than the smaller one');
  check(pq + ' pellet floor never drops', q.minPellets >= p.minPellets,
    'L' + p.level + ' bottoms out at ' + p.minPellets + ' pellets, L' + q.level +
    ' at ' + q.minPellets + ' — L' + q.level + ' can deal a shorter maze than any L' + p.level);
}

/* The two rungs a player is meant to recognise. Level 1 is the map they learn
 * the game on and level 4 is the arcade landmark, so neither may vary with the
 * seed. A one-map pool that quietly gained a second piece would still pass
 * every per-maze check. */
console.log('');
console.log('the landmarks are fixed');
var SEEDS = 400;
var l1Recipe = PV.createMaze(1, 0).recipe;
var l1Varies = null, l1OffBoard = null, l4NotArcade = null, l4OffBoard = null;
for (var s = 0; s < SEEDS; s++) {
  var m1 = PV.createMaze(1, s);
  if (m1.recipe !== l1Recipe && l1Varies === null) {
    l1Varies = 'seed 0 deals ' + l1Recipe + ', seed ' + s + ' deals ' + m1.recipe;
  }
  if (m1.board !== 'small' && l1OffBoard === null) {
    l1OffBoard = 'seed ' + s + ' is on the ' + m1.board + ' board';
  }
  var m4 = PV.createMaze(4, s);
  if (m4.recipe !== 'T1/B1' && l4NotArcade === null) {
    l4NotArcade = 'seed ' + s + ' deals ' + m4.recipe + ', not T1/B1';
  }
  if (m4.board !== 'full' && l4OffBoard === null) {
    l4OffBoard = 'seed ' + s + ' is on the ' + m4.board + ' board';
  }
}
check('L1 is the same maze across ' + SEEDS + ' seeds', l1Varies === null, l1Varies);
check('L1 is on the small board', l1OffBoard === null, l1OffBoard);
check('L4 is the arcade map across ' + SEEDS + ' seeds', l4NotArcade === null, l4NotArcade);
check('L4 is on the full board', l4OffBoard === null, l4OffBoard);

/* Geometry every template has to satisfy for the assembler to produce a legal
 * maze at all. A board that fails one of these deals a broken level at the
 * rung it sits on, whatever the pieces say. */
console.log('');
console.log('the boards are well-formed');
Object.keys(PV.BOARDS).forEach(function (id) {
  var b = PV.BOARDS[id];
  var budget = 1 + b.topRows + b.middle.length + b.bottomRows + 1;
  check(id + ' has an even column count', b.cols % 2 === 0,
    'cols is ' + b.cols + ' — a half-width row cannot mirror to an odd width');
  check(id + ' row budget adds up', budget === b.rows,
    '1 + ' + b.topRows + ' + ' + b.middle.length + ' + ' + b.bottomRows +
    ' + 1 = ' + budget + ', but rows is ' + b.rows);
  check(id + ' house interior is 6x3',
    b.house.c1 - b.house.c0 - 1 === 6 && b.house.r1 - b.house.r0 - 1 === 3,
    'interior is ' + (b.house.c1 - b.house.c0 - 1) + 'x' + (b.house.r1 - b.house.r0 - 1));
  check(id + ' tunnel row runs through the house',
    b.tunnelRow > b.house.r0 && b.tunnelRow < b.house.r1,
    'tunnel is row ' + b.tunnelRow + ', house spans rows ' + b.house.r0 + '-' + b.house.r1);

  var corners = PV.scatterCorners(b);
  Object.keys(corners).forEach(function (name) {
    var t = corners[name];
    check(id + ' ' + name + ' scatters onto the board',
      t.col >= 0 && t.col < b.cols && t.row >= 0 && t.row < b.rows,
      'corner is (c' + t.col + ',r' + t.row + ') on a ' + b.cols + 'x' + b.rows + ' board');
  });
});

/* The ranges above are only meaningful if a level and seed name one maze —
 * otherwise a player's actual difficulty is not the one measured here. */
console.log('');
console.log('determinism');
[1, 2, 3, 4, 5, 7, 9].forEach(function (level) {
  var drifted = null;
  [0, 1, 7, 12345, 999999].forEach(function (seed) {
    if (drifted) return;
    var x = PV.createMaze(level, seed), y = PV.createMaze(level, seed);
    if (x.board !== y.board || x.recipe !== y.recipe ||
        x.totalPellets !== y.totalPellets) {
      drifted = 'seed ' + seed + ' dealt ' + x.board + ' ' + x.recipe + '/' +
        x.totalPellets + ' then ' + y.board + ' ' + y.recipe + '/' + y.totalPellets;
    }
  });
  check('L' + level + ' reproduces from its seed', drifted === null, drifted);
});

console.log('');
console.log(failures === 0 ? 'THE LADDER CLIMBS'
                           : failures + ' PROGRESSION CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
