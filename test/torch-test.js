/* Torch-mode regression test — run with:  node test/torch-test.js
 *
 * Covers the sonar ping: its distance-delayed fade curve, its frozen origin,
 * its expiry, and the ghost blips. All of it is timing- and geometry-sensitive
 * and none of it is visible to a layout check.
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

function near(actual, expected, tol) {
  return Math.abs(actual - expected) <= (tol === undefined ? 0.02 : tol);
}

var STEP = 1 / 60;
var RULES = PV.DIFFICULTIES.torch;
var SPEED = PV.PULSE_SPEED;

/* The same seam opening-test.js uses: pellets frozen so nothing under test
 * depends on what Pac-Man wanders into, and invuln held so a ghost can't end
 * the round mid-measurement. steer() is what moves a round out of 'ready'. */
function playing() {
  var g = PV.createGame('torch');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  return g;
}

console.log('');
console.log('ping fade curve');

(function () {
  var d = 350;                   // half a board away
  var arrival = d / SPEED;       // 0.5s at 700 px/s

  check('dark before the ring arrives',
    PV.pulseAlpha(d, arrival - 0.05, RULES) === 0);
  check('full the moment it arrives',
    PV.pulseAlpha(d, arrival, RULES) === 1);
  check('still full through the hold',
    PV.pulseAlpha(d, arrival + RULES.hold - 0.01, RULES) === 1);

  var mid = PV.pulseAlpha(d, arrival + RULES.hold + RULES.fade / 2, RULES);
  check('eased at the fade midpoint', near(mid, 0.25, 0.001), mid);

  check('spent once the fade is done',
    PV.pulseAlpha(d, arrival + RULES.hold + RULES.fade, RULES) === 0);

  // The whole point of the mode: one age, two distances, two brightnesses.
  var age = 0.9;
  var nearA = PV.pulseAlpha(100, age, RULES);
  var farA = PV.pulseAlpha(500, age, RULES);
  check('near dims while far is still lighting up', nearA < farA,
    nearA.toFixed(3) + ' vs ' + farA.toFixed(3));
  check('beyond the ring is still dark',
    PV.pulseAlpha(age * SPEED + 20, age, RULES) === 0);
})();

console.log('');
console.log('ping origin');

(function () {
  var g = playing();
  g.update(STEP);
  var start = { x: g.pacman.x, y: g.pacman.y };

  check('a press opens a ping', g.selectVision('walls') === 'ok');
  var p = g.vision.pulse();
  check('the ping records where it was fired',
    p && near(p.x, start.x, 0.001) && near(p.y, start.y, 0.001),
    p && p.x + ',' + p.y);

  // Storing a reference to pacman rather than a copy is the regression here.
  g.pacman.x = start.x + 140;
  g.pacman.y = start.y + 60;
  check('the origin does not follow him',
    near(p.x, start.x, 0.001) && near(p.y, start.y, 0.001), p.x + ',' + p.y);
})();

console.log('');
console.log('ping lifetime');

(function () {
  var g = playing();
  g.update(STEP);
  g.selectVision('walls');

  var life = Math.hypot(PV.WIDTH, PV.HEIGHT) / SPEED + RULES.hold + RULES.fade;
  check('a ping is alive well before its life is up', g.vision.pulse() !== null);

  for (var i = 0, n = Math.ceil((life + 0.1) / STEP); i < n; i++) g.update(STEP);
  check('the ping expires once the last element has faded',
    g.vision.pulse() === null, g.vision.pulse());

  check('blink has no ping', PV.createGame('blink').vision.pulse() === null);
  check('normal has no ping', PV.createGame('normal').vision.pulse() === null);
})();

console.log('');
console.log('layer alpha stays dark');

(function () {
  var g = playing();
  // 100 steps clears the 1.35s dots intro, which is a floor in every mode.
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a press lands after the intro', g.selectVision('walls') === 'ok');
  for (var j = 0; j < 12; j++) g.update(STEP);

  var a = g.vision.alpha;
  check('the ping is running', g.vision.pulse() !== null);
  check('dots dark', a.dots === 0, a.dots);
  check('ghosts dark', a.ghosts === 0, a.ghosts);
  check('walls dark through a live ping', a.walls === 0, a.walls);
  check('you are always lit', a.pacman === 1, a.pacman);
  check('the badge names the pinged layer', g.vision.current() === 'walls',
    g.vision.current());
})();

console.log('');
console.log(failures === 0 ? 'ALL TORCH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
