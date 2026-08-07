/* Torch-mode regression test — run with:  node test/torch-test.js
 *
 * Covers the sonar ping: its distance-delayed fade curve, its frozen origin,
 * its expiry, and the ghost blips. All of it is timing- and geometry-sensitive
 * and none of it is visible to a layout check.
 */
global.window = {};
var path = require('path');
['maze.js', 'entities.js', 'vision.js', 'game.js', 'render.js'].forEach(function (f) {
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
console.log('ghost blips');

(function () {
  var g = playing();
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a ghost ping opens', g.selectVision('ghosts') === 'ok');

  var p = g.vision.pulse();
  var ghost = g.ghosts[0];       // blinky, out of the house by now
  check('no blip on the frame it is fired', p.blips[0] === undefined, p.blips[0]);

  // Step until the ring reaches it, remembering where it was each frame.
  var at = null;
  for (var f = 0; f < 60 && !at; f++) {
    g.update(STEP);
    if (p.blips[0]) at = { x: ghost.x, y: ghost.y };
  }
  check('the ring eventually reaches it', at !== null);
  check('the blip is where the ghost stood when the ring arrived',
    near(p.blips[0].x, at.x, 0.001) && near(p.blips[0].y, at.y, 0.001),
    p.blips[0].x + ',' + p.blips[0].y);

  var frozen = { x: p.blips[0].x, y: p.blips[0].y, wobble: p.blips[0].wobble };
  check('the blip freezes the waddle too, so the outline holds still',
    frozen.wobble === ghost.wobble, frozen.wobble);

  for (var k = 0; k < 20; k++) g.update(STEP);
  check('the ghost moved on',
    Math.hypot(ghost.x - frozen.x, ghost.y - frozen.y) > 4,
    Math.hypot(ghost.x - frozen.x, ghost.y - frozen.y).toFixed(1));
  check('the ghost kept waddling', ghost.wobble > frozen.wobble, ghost.wobble);
  check('the blip stayed where the ring found it',
    p.blips[0].x === frozen.x && p.blips[0].y === frozen.y &&
    p.blips[0].wobble === frozen.wobble);

  // A walls ping must not leave ghost blips behind.
  var h = playing();
  for (var m = 0; m < 100; m++) h.update(STEP);
  h.selectVision('walls');
  for (var n = 0; n < 40; n++) h.update(STEP);
  check('a walls ping records no blips',
    h.vision.pulse().blips.length === 0, h.vision.pulse().blips.length);
})();

console.log('');
console.log('line of sight');

(function () {
  // A single wall tile at (col 1, row 1); everything else in this 3x3
  // patch is open. isWall is the only method PV.canSee calls on a maze.
  function fakeMaze(wallTiles) {
    return {
      isWall: function (c, r) { return wallTiles.indexOf(c + ',' + r) !== -1; }
    };
  }

  var maze = fakeMaze(['1,1']);

  check('a straight line with nothing on it sees through',
    PV.canSee(PV.center(0), PV.center(0), PV.center(0), PV.center(2), maze));

  check('a wall directly on the line blocks it',
    !PV.canSee(PV.center(0), PV.center(1), PV.center(2), PV.center(1), maze));

  check('a line that goes around the wall still sees',
    PV.canSee(PV.center(0), PV.center(0), PV.center(2), PV.center(0), maze));

  check('a point can always see itself',
    PV.canSee(PV.center(5), PV.center(5), PV.center(5), PV.center(5), maze));

  // A near-tangent line that clips only a thin sliver of the wall tile's
  // corner — genuinely blocked, but close enough to the corner that a fixed
  // sampling interval can step clean over the sliver without ever landing a
  // sample inside it. Walking every tile the segment passes through, rather
  // than sampling points along it, is what catches this.
  check('a line grazing just a corner of the wall still counts as blocked',
    !PV.canSee(42.324, 10.044, 37.576, 69.856, maze));

  // The two corner-adjacent checks the tie branch makes, pinned down with a
  // wall on only one side at a time. (0,0)-(9,9) is an exact 45deg line, so
  // tMaxC and tMaxR tie at every crossing with no float drift — this isolates
  // the branch's own logic from the drift case below.
  var aboveMaze = fakeMaze(['5,4']);
  check('a corner tie checks the row-neighbour side',
    !PV.canSee(PV.center(0), PV.center(0), PV.center(9), PV.center(9), aboveMaze));

  var leftMaze = fakeMaze(['4,5']);
  check('a corner tie checks the column-neighbour side',
    !PV.canSee(PV.center(0), PV.center(0), PV.center(9), PV.center(9), leftMaze));

  // A non-45deg ray through several tile crossings does drift tMaxC and
  // tMaxR apart by a float epsilon, unlike the exact-diagonal case above —
  // this is what a strict === tie test misses. (0,0) to (100,300) crosses
  // the corner shared by (1,5)/(2,5)/(1,6)/(2,6) with tMaxC and tMaxR one
  // float apart by the time it gets there; a wall at (2,5) is only caught
  // if the tie logic still recognizes the near-tie.
  var driftMaze = fakeMaze(['2,5']);
  check('a corner tie several crossings out still catches a wall despite float drift',
    !PV.canSee(0, 0, 100, 300, driftMaze));
})();

console.log('');
console.log(failures === 0 ? 'ALL TORCH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
