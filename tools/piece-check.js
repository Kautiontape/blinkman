/* piece-check.js — the acceptance gate for candidate maze pieces.
 *
 *   node tools/piece-check.js <boardId> <tierId> <pieces.json>
 *
 * The JSON is { "top": [{ "id": "T1", "rows": [...] }, ...], "bottom": [...] },
 * rows authored at half width exactly as they appear in js/maze.js. Every
 * top x bottom combination is assembled against the board template and put
 * through the rules test/maze-test.js applies to the shipped pools, plus the
 * tier's score and pellet bands. Nothing is pasted into js/maze.js until this
 * exits 0.
 *
 * Exit 0 all combinations pass, 1 any rejection, 2 bad usage.
 *
 * The two geometry rules are required from test/maze-test.js rather than
 * reimplemented, so the gate and the regression test cannot drift apart.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var rules = require(path.join(__dirname, '..', 'test', 'maze-test.js'));
var PV = global.window.PV;

/* The score and pellet range a tier's pieces must land in. `classic` is the
 * shipped full-board pool's own measured range, so this tool can be pointed at
 * real data and is expected to pass. A tier absent here is a usage error: the
 * bands are what makes a run mean anything, so checking a tier without one
 * would report success while enforcing nothing. */
var BANDS = {
  classic: { score: [64, 84],   pellets: [242, 282] },
  gentle:  { score: [42, 52],   pellets: [150, 175] },
  medium:  { score: [54, 62],   pellets: [185, 215] },
  dense:   { score: [88, 104],  pellets: [250, 300] },
  densest: { score: [106, 130], pellets: [250, 310] }
};

var LEGAL = '#.o ';        // '-' is the house door and lives in the middle band
var MAX_HITS = 8;          // per problem, before the list is summarised

function usage(msg) {
  console.error('piece-check: ' + msg);
  console.error('usage: node tools/piece-check.js <boardId> <tierId> <pieces.json>');
  process.exit(2);
}

function list(hits) {
  if (hits.length <= MAX_HITS) return hits.join(' ');
  return hits.slice(0, MAX_HITS).join(' ') + ' (+' + (hits.length - MAX_HITS) + ' more)';
}

// Read and shape-check the pool file. Anything wrong here is a usage error:
// the file does not describe pieces at all.
function loadPool(file) {
  var text, pool;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    usage('cannot read ' + file + ': ' + e.message);
  }
  try {
    pool = JSON.parse(text);
  } catch (e) {
    usage('malformed JSON in ' + file + ': ' + e.message);
  }
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) {
    usage(file + ' must be an object with "top" and "bottom" arrays');
  }
  ['top', 'bottom'].forEach(function (side) {
    if (!Array.isArray(pool[side])) usage(file + ': "' + side + '" must be an array');
    pool[side].forEach(function (piece, i) {
      var where = file + ': ' + side + '[' + i + ']';
      if (!piece || typeof piece !== 'object' || Array.isArray(piece)) {
        usage(where + ' must be an object with "id" and "rows"');
      }
      if (typeof piece.id !== 'string' || !piece.id) usage(where + ' needs a non-empty string "id"');
      if (!Array.isArray(piece.rows)) usage(where + ' (' + piece.id + ') needs a "rows" array');
      piece.rows.forEach(function (row, r) {
        if (typeof row !== 'string') usage(where + ' (' + piece.id + ') row ' + r + ' is not a string');
      });
    });
  });
  return pool;
}

/* Everything checkable from a piece alone. `blocking` marks the problems that
 * make the assembled layout meaningless — a short piece or a mis-width row
 * shifts every tile below it, so the geometry checks would report noise
 * instead of the actual mistake. */
function checkPiece(board, piece, side) {
  var want = side === 'top' ? board.topRows : board.bottomRows;
  var half = board.cols / 2;
  var problems = [];
  var blocking = false;
  var doorHits = [], badHits = [], power = 0;
  var label = side + ' ' + piece.id;

  if (piece.rows.length !== want) {
    problems.push(label + ': ' + piece.rows.length + ' rows, expected ' + want);
    blocking = true;
  }

  piece.rows.forEach(function (row, r) {
    if (row.length !== half) {
      problems.push(label + ' row ' + r + ': ' + row.length + ' chars, expected ' + half);
      blocking = true;
    }
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === 'o') power++;
      if (ch === '-') doorHits.push('(c' + c + ',r' + r + ')');
      else if (LEGAL.indexOf(ch) < 0) badHits.push('"' + ch + '" at (c' + c + ',r' + r + ')');
    }
  });

  if (doorHits.length) {
    problems.push(label + ": '-' is the house door and belongs only to the board's " +
      'middle band — at ' + list(doorHits));
    blocking = true;
  }
  if (badHits.length) {
    problems.push(label + ': illegal character ' + list(badHits) +
      " — legal are '#' '.' 'o' and space");
    blocking = true;
  }
  if (power !== 1) {
    problems.push(label + ': ' + power + " 'o', expected exactly 1 — it mirrors to 2 " +
      'and the board needs 4');
  }

  return { problems: problems, blocking: blocking };
}

// Ids must be unique per side, and neither side may be empty.
function checkPool(pool) {
  var problems = [];
  ['top', 'bottom'].forEach(function (side) {
    if (!pool[side].length) problems.push('the ' + side + ' pool is empty — need at least one piece');
    var at = {};
    pool[side].forEach(function (piece, i) {
      if (at[piece.id] === undefined) at[piece.id] = i;
      else problems.push('duplicate ' + side + ' id "' + piece.id + '" at ' +
        side + '[' + at[piece.id] + '] and ' + side + '[' + i + ']');
    });
  });
  return problems;
}

function inBand(value, band) { return value >= band[0] && value <= band[1]; }

function bandProblem(name, value, band) {
  if (inBand(value, band)) return null;
  return name + ' ' + value + ' is ' + (value < band[0] ? 'below' : 'above') +
    ' the band ' + band[0] + '-' + band[1];
}

function main(argv) {
  if (argv.length !== 3) usage('expected 3 arguments, got ' + argv.length);

  var boardId = argv[0], tierId = argv[1], file = argv[2];
  var board = PV.BOARDS[boardId];
  if (!board) usage('unknown board "' + boardId + '" — known: ' + Object.keys(PV.BOARDS).join(' '));
  var band = BANDS[tierId];
  if (!band) usage('unknown tier "' + tierId + '" — known: ' + Object.keys(BANDS).join(' '));

  var pool = loadPool(file);
  var failures = 0, combos = 0;

  console.log(boardId + '/' + tierId + '  ' + board.cols + 'x' + board.rows +
    '  ' + pool.top.length + ' top x ' + pool.bottom.length + ' bottom  ' +
    'score ' + band.score[0] + '-' + band.score[1] +
    '  pellets ' + band.pellets[0] + '-' + band.pellets[1]);

  var poolProblems = checkPool(pool);
  poolProblems.forEach(function (p) { console.log('  POOL FAIL: ' + p); });

  var checked = { top: {}, bottom: {} };
  ['top', 'bottom'].forEach(function (side) {
    pool[side].forEach(function (piece, i) {
      checked[side][i] = checkPiece(board, piece, side);
    });
  });

  pool.top.forEach(function (top, ti) {
    pool.bottom.forEach(function (bottom, bi) {
      combos++;
      var id = top.id + '/' + bottom.id;
      var problems = checked.top[ti].problems.concat(checked.bottom[bi].problems);
      var pellets = null, score = null;

      if (checked.top[ti].blocking || checked.bottom[bi].blocking) {
        problems.push('geometry checks skipped until the rows are fixed');
      } else {
        var layout = PV.assembleLayout(board, top, bottom);

        PV.checkLayout(board, layout).forEach(function (p) { problems.push('layout: ' + p); });

        var wide = rules.wideSpots(board, layout);
        if (wide.length) problems.push('2x2 open block at ' + list(wide));

        var dead = rules.deadEnds(board, layout);
        if (dead.length) problems.push('dead end at ' + list(dead));

        var sc = PV.scoreLayout(board, layout);
        score = sc.score;
        pellets = sc.pellets;
        var s = bandProblem('score', score, band.score);
        if (s) problems.push(s);
        var p = bandProblem('pellets', pellets, band.pellets);
        if (p) problems.push(p);
      }

      if (problems.length) {
        failures++;
        console.log('  ' + id + '  FAIL: ' + problems.join('; '));
      } else {
        console.log('  ' + id + '  ok    pellets=' + pellets + ' score=' + score);
      }
    });
  });

  var ok = failures === 0 && poolProblems.length === 0;
  console.log('');
  console.log(ok ? combos + ' COMBINATION(S) ACCEPTED'
                 : 'REJECTED: ' + poolProblems.length + ' pool problem(s), ' +
                   failures + '/' + combos + ' combination(s) rejected');
  process.exit(ok ? 0 : 1);
}

main(process.argv.slice(2));
