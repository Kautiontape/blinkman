/* Flash-mode regression test — run with:  node test/flash-test.js
 *
 * Covers what a pick leaves behind: picks stack rather than replace, each one
 * fades on its own clock, and a round opens with the layers `initial` names.
 * All of it is timing-sensitive and invisible to a layout check.
 */
global.window = {};
var path = require('path');
// Mirrors index.html's relative script order, so a module-scope capture from
// game.js would go red here exactly as it would silently break in the browser.
['strings.js', 'maze.js', 'vision.js', 'entities.js', 'render.js',
  'game.js'].forEach(function (f) {
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

/* A round moved out of 'ready', with pellets frozen so nothing under test
 * depends on what Pac-Man wanders into and invuln held so a ghost cannot end
 * the round mid-measurement. */
function playing(difficulty) {
  var g = PV.createGame(difficulty || 'flash-normal', { persist: false });
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  return g;
}

/* Steps past the opening flashes and the 1.35s dots intro, so a pick under
 * test is the only thing lighting anything. */
function settled(difficulty) {
  var g = playing(difficulty);
  for (var i = 0; i < 400; i++) g.update(STEP);
  return g;
}

console.log('');
console.log('the flash curve');

(function () {
  var RULES = PV.DIFFICULTIES['flash-normal'];
  check('full through the hold', PV.flashAlpha(RULES.hold - 0.01, RULES) === 1);
  var mid = PV.flashAlpha(RULES.hold + RULES.fade / 2, RULES);
  check('eased at the fade midpoint', near(mid, 0.25, 0.001), mid);
  check('spent once the fade is done',
    PV.flashAlpha(RULES.hold + RULES.fade, RULES) === 0);
})();

console.log('');
console.log('picks stack');

(function () {
  var g = settled();
  check('the board is dark to start with',
    g.vision.alpha.walls === 0 && g.vision.alpha.dots === 0,
    g.vision.alpha.walls + ' / ' + g.vision.alpha.dots);

  check('a first pick lands', g.selectVision('walls') === 'ok');
  // Past the 1s cooldown, so a second pick is allowed while the first fades.
  for (var i = 0; i < 66; i++) g.update(STEP);

  var before = g.vision.alpha.walls;
  check('the first pick is still fading', before > 0 && before < 1, before);

  check('a second pick lands', g.selectVision('dots') === 'ok');
  g.update(STEP);

  check('the second pick does not kill the first',
    g.vision.alpha.walls > 0, g.vision.alpha.walls);
  check('the second pick lights its own layer',
    g.vision.alpha.dots === 1, g.vision.alpha.dots);
  check('the badge names the newest pick',
    g.vision.current() === 'dots', g.vision.current());
})();

console.log('');
console.log('each pick keeps its own clock');

/* Two different layers, so each pick has an observable of its own — one layer
 * alpha is the max over every live pick, and a shared layer would let the
 * newer pick stand in for the older one. */
(function () {
  var g = settled();
  var RULES = PV.DIFFICULTIES['flash-normal'];
  var LIFE = RULES.hold + RULES.fade;

  g.selectVision('walls');
  for (var i = 0; i < 66; i++) g.update(STEP);   // 1.1s, past the cooldown
  g.selectVision('dots');
  g.update(STEP);
  check('both are lit while the older still has time to run',
    g.vision.alpha.walls > 0 && g.vision.alpha.dots > 0,
    g.vision.alpha.walls + ' / ' + g.vision.alpha.dots);

  // Past where the older expires on its own, and well short of the newer's
  // own expiry — it started the 67 frames stepped above later.
  var n = Math.ceil(LIFE / STEP) + 2 - 67;
  for (var j = 0; j < n; j++) g.update(STEP);
  check('the older pick expires while the newer one still burns',
    g.vision.alpha.walls === 0 && g.vision.alpha.dots > 0,
    g.vision.alpha.walls + ' / ' + g.vision.alpha.dots);

  for (var k = 0; k < Math.ceil(LIFE / STEP); k++) g.update(STEP);
  check('the newer pick expires too', g.vision.alpha.dots === 0, g.vision.alpha.dots);
})();

console.log('');
console.log('pings stack');

(function () {
  var g = settled('torch-normal');
  check('a first ping lands', g.selectVision('walls') === 'ok');
  for (var i = 0; i < 66; i++) g.update(STEP);
  check('a second ping lands', g.selectVision('dots') === 'ok');
  g.update(STEP);

  var live = g.vision.pulses();
  check('both pings are running', live.length === 2, live.length);
  check('they are oldest first', live[0].age > live[1].age,
    live[0].age + ' / ' + live[1].age);
  check('each remembers its own layer',
    live[0].layer === 'walls' && live[1].layer === 'dots',
    live[0].layer + ' / ' + live[1].layer);

  check('flash reports no pings', PV.createGame('flash-normal').vision.pulses().length === 0);
  check('stare reports no pings', PV.createGame('stare-normal').vision.pulses().length === 0);
})();

console.log('');
console.log('the opening reveal');

(function () {
  ['flash-normal', 'flash-hard'].forEach(function (id) {
    var g = PV.createGame(id, { persist: false });
    g.startRound();
    var a = g.vision.alpha;
    check(id + ' opens with the walls lit', a.walls === 1, a.walls);
    check(id + ' opens with you lit', a.pacman === 1, a.pacman);
    check(id + ' opens with the badge on the board layer',
      g.vision.current() === 'walls', g.vision.current());
  });

  // Easy draws you always, so the seeded pick changes nothing there.
  var easy = PV.createGame('flash-easy', { persist: false });
  easy.startRound();
  check('flash-easy still draws you', easy.vision.alpha.pacman === 1,
    easy.vision.alpha.pacman);
  check('flash-easy opens with the badge on the board layer',
    easy.vision.current() === 'walls', easy.vision.current());

  // The opening reveal fades out like any other pick.
  var g = PV.createGame('flash-normal', { persist: false });
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  var RULES = PV.DIFFICULTIES['flash-normal'];
  for (var i = 0, n = Math.ceil((RULES.hold + RULES.fade) / STEP) + 2; i < n; i++) {
    g.update(STEP);
  }
  check('the opening reveal fades out', g.vision.alpha.pacman === 0,
    g.vision.alpha.pacman);
})();

console.log('');
console.log('the house reveal against the board');

/* A ghost in the house shows through a dark ghosts layer, but only as far as
 * the board around it is lit: the reveal is a floor multiplied by the brighter
 * of the dots and walls layers. Flash has no torch, so those two and the
 * ghosts layer are the whole of the decision here. */
(function () {
  // Layer alphas in the shape visibleAlpha() hands the renderer.
  function layers(o) {
    return {
      dots: o.dots || 0, walls: o.walls || 0,
      ghosts: o.ghosts || 0, pacman: o.pacman || 0
    };
  }

  var g = settled('flash-normal');
  var housed = g.ghosts.filter(function (gh) { return gh.state === 'house'; });
  check('someone is still in the house', housed.length > 0, housed.length);
  check('the ghosts layer is dark', g.vision.alpha.ghosts === 0, g.vision.alpha.ghosts);
  check('the board is dark too',
    g.vision.alpha.walls === 0 && g.vision.alpha.dots === 0,
    g.vision.alpha.walls + '/' + g.vision.alpha.dots);

  var ghost = housed[0];
  check('a dark board leaves the house dark',
    PV.ghostDrawAlpha(ghost, g.visibleAlpha(), null, g.maze) === 0,
    PV.ghostDrawAlpha(ghost, g.visibleAlpha(), null, g.maze));
  check('lit walls show the house in full',
    PV.ghostDrawAlpha(ghost, layers({ walls: 1 }), null, g.maze) === 1,
    PV.ghostDrawAlpha(ghost, layers({ walls: 1 }), null, g.maze));
  check('lit dots show the house too',
    PV.ghostDrawAlpha(ghost, layers({ dots: 1 }), null, g.maze) === 1,
    PV.ghostDrawAlpha(ghost, layers({ dots: 1 }), null, g.maze));

  // The middle of the range, which a threshold would get wrong: half-lit walls
  // draw the house at half.
  check('a half-lit board shows the house at half',
    near(PV.ghostDrawAlpha(ghost, layers({ walls: 0.5 }), null, g.maze), 0.5, 0.001),
    PV.ghostDrawAlpha(ghost, layers({ walls: 0.5 }), null, g.maze));
  check('the brighter of the two board layers wins',
    near(PV.ghostDrawAlpha(ghost, layers({ dots: 0.8, walls: 0.3 }), null, g.maze),
      0.8, 0.001),
    PV.ghostDrawAlpha(ghost, layers({ dots: 0.8, walls: 0.3 }), null, g.maze));

  /* Both terms of the product, at once: a ghost halfway out the door on a
   * half-lit board draws at a quarter. Nothing but the multiply lands here. */
  var doorway = {
    state: 'leaving',
    y: (PV.center(PV.SPAWN.door.row) + PV.center(PV.SPAWN.outside.row)) / 2
  };
  check('the reveal and the board multiply',
    near(PV.ghostDrawAlpha(doorway, layers({ walls: 0.5 }), null, g.maze), 0.25, 0.001),
    PV.ghostDrawAlpha(doorway, layers({ walls: 0.5 }), null, g.maze));

  /* Your own layer is not the board: being drawn yourself says nothing about
   * what is waiting in the house. */
  check('a lit pacman layer leaves the house dark',
    PV.ghostDrawAlpha(ghost, layers({ pacman: 1 }), null, g.maze) === 0,
    PV.ghostDrawAlpha(ghost, layers({ pacman: 1 }), null, g.maze));

  // A ghost out on the board has no reveal at all, however lit the board is.
  var out = { state: 'out', y: PV.center(PV.SPAWN.pinky.row) };
  check('a ghost loose on a lit board is left to its layer',
    PV.ghostDrawAlpha(out, layers({ walls: 1 }), null, g.maze) === 0,
    PV.ghostDrawAlpha(out, layers({ walls: 1 }), null, g.maze));
  check('a lit ghosts layer draws them wherever they are',
    PV.ghostDrawAlpha(out, layers({ ghosts: 1 }), null, g.maze) === 1,
    PV.ghostDrawAlpha(out, layers({ ghosts: 1 }), null, g.maze));
})();

console.log('');
console.log('the house on READY');

/* READY holds the dots blink on its first frame and floors the walls, so the
 * board is lit in every mode and the house reads with it — a round opens
 * showing who is waiting, wherever you are, and loses them as the board goes.
 * Torch is no exception here: the mode only stops lighting layers once you
 * move. */
(function () {
  ['flash-hard', 'torch-hard', 'stare-hard'].forEach(function (id) {
    var g = PV.createGame(id, { persist: false });
    g.startRound();
    g.update(STEP);
    check(id + ' is still on READY', g.state === 'ready', g.state);
    var housed = g.ghosts.filter(function (gh) { return gh.state === 'house'; });
    var a = PV.ghostDrawAlpha(housed[0], g.visibleAlpha(), null, g.maze);
    check(id + ' shows the house on READY', a === 1, a);
  });
})();

console.log('');
console.log('the maze on READY');

(function () {
  // The one moment to study the maze, so every mode shows it dimly.
  ['stare-hard', 'torch-hard', 'flash-hard'].forEach(function (id) {
    var g = PV.createGame(id, { persist: false });
    g.startRound();
    g.update(STEP);
    check(id + ' shows the walls on ready', g.visibleAlpha().walls >= 0.55,
      g.visibleAlpha().walls);
  });

  // And it drops back to the mode's own rules the moment you move.
  var g = PV.createGame('torch-hard', { persist: false });
  g.startRound();
  g.steer(PV.DIRS.left);
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  for (var i = 0; i < 400; i++) g.update(STEP);
  check('torch-hard goes dark once you move', g.visibleAlpha().walls === 0,
    g.visibleAlpha().walls);

  // A pick brighter than the floor is not dimmed by it.
  var s = PV.createGame('stare-normal', { persist: false });
  s.startRound();
  s.update(STEP);
  check('a lit layer is not dimmed to the floor', s.visibleAlpha().walls === 1,
    s.visibleAlpha().walls);
})();

console.log('');
console.log(failures === 0 ? 'ALL FLASH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
