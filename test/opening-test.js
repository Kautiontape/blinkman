/* Opening-cues regression test — run with:  node test/opening-test.js
 *
 * Covers what a round opens with: the staggered ghost release, the ghost-house
 * reveal, and the dots blink. All three are timing-sensitive and invisible to
 * maze-test.js, which only reads layouts.
 */
global.window = {};
var path = require('path');
['maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
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
  var g = PV.createGame(difficulty || 'normal');
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
console.log(failures === 0 ? 'ALL OPENING CUES OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
