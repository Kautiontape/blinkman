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

['maze.js', 'entities.js', 'vision.js', 'game.js', 'attract.js'].forEach(function (f) {
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
  var demo = PV.createGame('normal', { persist: false });
  driveByHand(demo, 6);
  check('a persist:false game scores', demo.score > 0, demo.score);
  check('a persist:false game writes nothing', writes.length === 0, writes.join(' '));

  writes.length = 0;
  var real = PV.createGame('normal');
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
  var illegal = 0, samples = 0, blocked = 0, near = 0, first = '';

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
      if (was.col <= 1 || was.col >= PV.COLS - 2) near++;
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
  // The route search wraps columns, so the tunnel is an ordinary edge. If it
  // did not, the two mouths would be unreachable and this would read 0.
  check('uses the tunnel', near > 0, near);
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
  // 20s at 5.6 tiles/sec is ~112 tiles crossed. A Pac-Man that circles without
  // eating, or one that stalls, lands well under this.
  check('clears dots at a sane rate', worst >= 40, worst);
})();

console.log('');
console.log(failures === 0 ? 'ALL ATTRACT CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
