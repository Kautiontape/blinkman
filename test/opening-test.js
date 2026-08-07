/* Opening-cues regression test — run with:  node test/opening-test.js
 *
 * Covers what a round opens with: the staggered ghost release, the ghost-house
 * reveal, the dots blink, and the layer nudge. All of it is timing-sensitive
 * or mode-dependent, and invisible to maze-test.js, which only reads layouts.
 *
 * strings.js is here for the nudge's wording; nothing else needs it.
 */
global.window = {};
var path = require('path');
['strings.js', 'maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f));
});
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

/* Timings accumulate in floating point over hundreds of steps, so every
 * comparison against an expected second-value is a tolerance check. */
function near(actual, expected, tol) {
  return Math.abs(actual - expected) <= (tol === undefined ? 0.02 : tol);
}

var STEP = 1 / 60;

/* A game that can be stepped for as long as a test needs. eatPellet is frozen
 * so the release ladder's timers are what is under test rather than whatever
 * Pac-Man happens to wander into, and invuln never expires so a ghost can't
 * end the round mid-measurement. */
function newGame(difficulty) {
  var g = PV.createGame(difficulty || 'stare-normal');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  return g;
}

console.log('');
console.log('stateTime baseline');

(function () {
  var g = newGame();
  for (var i = 0; i < 60 * 5 && g.state === 'ready'; i++) g.update(STEP);
  check('zero on the frame ready expires',
    g.state === 'playing' && g.stateTime === 0, g.state + '/' + g.stateTime);

  var h = newGame();
  h.update(STEP);
  h.update(STEP);
  h.steer(PV.DIRS.left);
  check('zero when steering out of ready',
    h.state === 'playing' && h.stateTime === 0, h.state + '/' + h.stateTime);
})();

console.log('');
console.log('ghost release ladder');

/* Steps until every ghost has left the house, recording the stateTime each one
 * went. 'leaving' is the moment of release; reaching 'out' takes another
 * half-second of scripted movement that isn't part of the schedule. */
function releaseTimes(g) {
  var times = {};
  for (var i = 0; i < 60 * 40; i++) {
    g.update(STEP);
    if (g.state !== 'playing') continue;
    for (var j = 0; j < g.ghosts.length; j++) {
      var gh = g.ghosts[j];
      if (times[gh.name] === undefined && gh.state !== 'house') {
        times[gh.name] = g.stateTime;
      }
    }
    if (Object.keys(times).length === g.ghosts.length) break;
  }
  return times;
}

(function () {
  // All four wait inside, so the round opens on a countable house.
  var start = newGame();
  var housed = start.ghosts.filter(function (g) { return g.state === 'house'; });
  check('all four start in the house', housed.length === 4,
    start.ghosts.map(function (g) { return g.name + ':' + g.state; }).join(' '));

  var slow = releaseTimes(start);
  check('blinky leads at 0s', near(slow.blinky, 0, 0.05), slow.blinky);
  check('pinky leaves at 2s', near(slow.pinky, 2), slow.pinky);
  check('inky waits out latest at 9s', near(slow.inky, 9), slow.inky);
  check('clyde waits out latest at 14s', near(slow.clyde, 14), slow.clyde);

  // The mid-level respawn case: the dot counts are long since met, so only the
  // earliest floors are holding the exits apart.
  var g = newGame();
  g.dotsEaten = 999;
  var fast = releaseTimes(g);
  check('blinky floor at 0s', near(fast.blinky, 0, 0.05), fast.blinky);
  check('pinky floor at 2s', near(fast.pinky, 2), fast.pinky);
  check('inky floor at 5s', near(fast.inky, 5), fast.inky);
  check('clyde floor at 8s', near(fast.clyde, 8), fast.clyde);

  var order = ['blinky', 'pinky', 'inky', 'clyde'];
  [slow, fast].forEach(function (t, n) {
    var gaps = [];
    for (var i = 1; i < order.length; i++) gaps.push(t[order[i]] - t[order[i - 1]]);
    check('exits stay 2s apart (' + (n === 0 ? 'no dots' : 'dots met') + ')',
      gaps.every(function (d) { return d >= 2 - 0.05; }), gaps.join(' / '));
  });
})();

console.log('');
console.log('respawn through the house');

/* Every ghost passes through the house after being eaten, Blinky included, so
 * every ghost needs a release rule — not just the three that start there. */
(function () {
  var g = newGame();
  for (var i = 0; i < 60 * 5 && g.state === 'ready'; i++) g.update(STEP);

  var blinky = g.ghosts[0];
  blinky.state = 'entering';
  blinky.x = PV.center(PV.SPAWN.outside.col);
  blinky.y = PV.center(PV.SPAWN.outside.row);
  for (var j = 0; j < 200 && blinky.state === 'entering'; j++) {
    PV.updateGhost(blinky, STEP, g.maze, PV.SPAWN.outside);
  }
  check('an eaten blinky lands in the house', blinky.state === 'house', blinky.state);

  var threw = null;
  try {
    for (var k = 0; k < 60 * 5; k++) g.update(STEP);
  } catch (e) {
    threw = e.message;
  }
  check('stepping past the dwell does not throw', threw === null, threw);
  check('blinky leaves the house again', blinky.state !== 'house', blinky.state);
})();

console.log('');
console.log('ghost-house reveal');

(function () {
  var HOUSE = PV.center(14), DOOR = PV.center(12);
  var MID = (DOOR + PV.center(11)) / 2, EXIT = PV.center(11);

  // Full below the door line, falling to zero across the doorway.
  ['house', 'leaving', 'entering'].forEach(function (st) {
    check(st + ' is lit in the house',
      PV.ghostReveal({ state: st, y: HOUSE }) === 1);
    check(st + ' is lit at the door line',
      PV.ghostReveal({ state: st, y: DOOR }) === 1);
    check(st + ' is half lit mid-doorway',
      near(PV.ghostReveal({ state: st, y: MID }), 0.5, 0.001));
    check(st + ' is dark at the exit',
      PV.ghostReveal({ state: st, y: EXIT }) === 0);
  });

  /* The state guard is load-bearing: a ghost loose on the lower board sits well
   * below the door line, and the position term alone would clamp it to 1. */
  ['out', 'eaten'].forEach(function (st) {
    [HOUSE, DOOR, MID, EXIT, PV.center(23)].forEach(function (y) {
      check(st + ' is dark at y=' + y, PV.ghostReveal({ state: st, y: y }) === 0);
    });
  });
})();

console.log('');
console.log('dots intro blink');

(function () {
  // Sampled away from the phase boundaries: the constants are sums of tenths
  // and land a few float ulps either side of them.
  [[0.05, 1], [0.24, 0], [0.35, 1], [0.54, 0], [0.65, 1], [0.84, 0]]
    .forEach(function (row) {
      check('blink phase at ' + row[0] + 's is ' + row[1],
        PV.introAlpha(row[0]) === row[1], PV.introAlpha(row[0]));
    });

  check('fade opens near full', near(PV.introAlpha(0.92), 0.91, 0.02), PV.introAlpha(0.92));
  check('fade is eased at the midpoint', near(PV.introAlpha(1.125), 0.25, 0.01), PV.introAlpha(1.125));
  check('fade is spent by 1.4s', PV.introAlpha(1.4) === 0, PV.introAlpha(1.4));

  /* Wired into the layer alphas as a floor, so it lifts the dots in the modes
   * that start them dark and settles back to whatever the mode itself shows. */
  function dotsAfter(difficulty, seconds) {
    var v = PV.createVision(PV.DIFFICULTIES[difficulty]);
    var peak = 0;
    for (var t = 0; t < seconds; t += 0.01) {
      v.update(0.01);
      if (v.alpha.dots > peak) peak = v.alpha.dots;
    }
    return { peak: peak, settled: v.alpha.dots };
  }

  var normal = dotsAfter('stare-normal', 1.6);
  check('normal blinks the dots to full', near(normal.peak, 1, 0.001), normal.peak);
  check('normal settles the dots dark', normal.settled === 0, normal.settled);

  var easy = dotsAfter('stare-easy', 1.6);
  check('easy blinks the dots to full', near(easy.peak, 1, 0.001), easy.peak);
  check('easy settles the dots to its own alpha', near(easy.settled, 0.55, 0.001), easy.settled);
})();

console.log('');
console.log('layer nudge');

/* Pinned per cell, because both halves are derived: the digits come from the
 * cell's pool, so a cell that never spends a pick on your own layer must not
 * offer a 4, and the verb comes from its mode. */
(function () {
  var EXPECTED = {
    'stare-easy': 'Press 1/2/3 to change layer',
    'stare-normal': 'Press 1/2/3 to change layer',
    'stare-hard': 'Press 1/2/3/4 to change layer',
    'torch-easy': 'Press 1/2/3 to scan',
    'torch-normal': 'Press 1/2/3 to scan',
    'torch-hard': 'Press 1/2/3 to scan',
    // Easy draws you always, so it is the one Flash cell with no 4 to offer.
    'flash-easy': 'Press 1/2/3 to flash',
    'flash-normal': 'Press 1/2/3/4 to flash',
    'flash-hard': 'Press 1/2/3/4 to flash'
  };

  Object.keys(PV.DIFFICULTIES).forEach(function (id) {
    check(id, PV.modeHint(id) === EXPECTED[id], PV.modeHint(id));
  });

  check('every cell is covered',
    Object.keys(EXPECTED).length === Object.keys(PV.DIFFICULTIES).length,
    Object.keys(PV.DIFFICULTIES).join(' '));
})();

console.log('');
console.log(failures === 0 ? 'ALL OPENING CUES OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
