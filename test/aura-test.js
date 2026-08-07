/* Board-aura regression test — run with:  node test/aura-test.js
 *
 * Covers the glow at the board edge: the white breath while a fright runs, the
 * blink that quickens as it ends, the yellow pulse that closes it, and the red
 * a lost life overrides both with. The schedule is timing-sensitive and
 * invisible to a layout check. draw() needs a canvas and is not covered here.
 */
global.window = {};
var path = require('path');
['maze.js', 'entities.js', 'vision.js', 'game.js', 'render.js', 'aura.js']
  .forEach(function (f) { require(path.join(__dirname, '..', 'js', f)); });
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

var STEP = 1 / 60;
var TINTS = PV.AURA_TINTS;

/* The aura reads four fields off a round and nothing else, so a plain object
 * drives it more directly than a real game would. */
function round(over) {
  var g = { state: 'playing', frightTimer: 0, time: 0, stateTime: 0 };
  Object.keys(over || {}).forEach(function (k) { g[k] = over[k]; });
  return g;
}

console.log('');
console.log('nothing to report');

(function () {
  var a = PV.createAura();
  a.update(round(), STEP);
  check('a quiet round draws no aura', a.tint === null, a.tint);
  check('and sits at zero', a.level === 0, a.level);
})();

console.log('');
console.log('a fright running');

(function () {
  var a = PV.createAura();
  var g = round({ frightTimer: 7 });
  var seen = [];
  for (var i = 0; i < 120; i++) {
    g.time += STEP;
    a.update(g, STEP);
    seen.push(a.level);
  }
  check('the aura is white', a.tint === TINTS.white, a.tint);

  // 2s covers 2.4 cycles of the breath, so both extremes are sampled closely.
  var low = Math.min.apply(null, seen), high = Math.max.apply(null, seen);
  check('it sinks to its floor without going dark', low > 0.34 && low < 0.36, low);
  check('it breathes rather than holding still', high - low > 0.2,
    (high - low).toFixed(3));
  check('it rises to its ceiling without reaching full',
    high > 0.74 && high < 0.76, high);
})();

console.log('');
console.log('a fright ending');

/* Counts how many times the level changes over a window — the blink quickening
 * means more changes in the second half than the first. */
function transitions(from, to) {
  var a = PV.createAura();
  var g = round({ frightTimer: from, time: 0 });
  var last = null, count = 0;
  while (g.frightTimer > to) {
    g.frightTimer -= STEP;
    g.time += STEP;
    a.update(g, STEP);
    if (last !== null && a.level !== last) count++;
    last = a.level;
  }
  return count;
}

(function () {
  var a = PV.createAura();
  a.update(round({ frightTimer: 1.5 }), STEP);
  check('the aura is still white as it ends', a.tint === TINTS.white, a.tint);

  var early = transitions(2, 1);
  var late = transitions(1, 0.05);
  check('the blink quickens as the time runs out', late > early,
    early + ' then ' + late);
  check('the early half blinks at all', early > 0, early);
})();

console.log('');
console.log('the closing pulse');

(function () {
  var a = PV.createAura();
  var g = round({ frightTimer: STEP / 2 });
  a.update(g, STEP);
  g.frightTimer = 0;
  a.update(g, STEP);

  check('a spent fright closes on yellow', a.tint === TINTS.yellow, a.tint);
  check('the pulse opens near full', a.level > 0.8, a.level);

  var first = a.level;
  for (var i = 0; i < 10; i++) a.update(g, STEP);
  check('and decays', a.level < first, a.level);

  // Eased away rather than linear: half the time gone, a quarter of the level.
  var eased = PV.createAura();
  var e = round({ frightTimer: STEP / 2 });
  eased.update(e, STEP);
  e.frightTimer = 0;
  eased.update(e, STEP);
  for (var m = 0; m < 15; m++) eased.update(e, STEP);   // 0.25s of 0.5s
  check('the pulse eases away rather than ramping',
    eased.level > 0.2 && eased.level < 0.3, eased.level);

  for (var j = 0; j < 60; j++) a.update(g, STEP);
  check('until there is nothing left', a.tint === null && a.level === 0,
    a.tint + ' / ' + a.level);
})();

console.log('');
console.log('a round reset is not a spent fright');

(function () {
  // resetActors() zeroes frightTimer, but never while the state is 'playing'.
  var a = PV.createAura();
  var g = round({ frightTimer: 7 });
  a.update(g, STEP);
  g.frightTimer = 0;
  g.state = 'ready';
  a.update(g, STEP);
  check('no pulse fires on a reset', a.tint === null, a.tint);
})();

console.log('');
console.log('a board cleared mid-fright');

(function () {
  /* game.js decrements frightTimer inside the 'playing' branch alone, so
   * 'levelclear' leaves it frozen positive for the whole 2s pause. */
  var a = PV.createAura();
  var g = round({ frightTimer: 7 });
  a.update(g, STEP);
  g.state = 'levelclear';
  a.update(g, STEP);
  check('the breath stops with the round', a.tint === null, a.tint);

  var lit = null;
  for (var i = 0; i < 120; i++) {
    g.time += STEP;
    a.update(g, STEP);
    if (a.tint !== null) lit = a.tint;
  }
  check('and nothing lights over the pause', lit === null, lit);

  // The next round opens owing nothing for the fright it cut short.
  g.state = 'ready';
  g.frightTimer = 0;
  a.update(g, STEP);
  g.state = 'playing';
  a.update(g, STEP);
  check('the next round opens dark', a.tint === null, a.tint);
})();

console.log('');
console.log('a life lost');

(function () {
  var a = PV.createAura();
  // Caught mid-fright: red takes over and the closing pulse never fires.
  var g = round({ frightTimer: 7 });
  a.update(g, STEP);
  g.frightTimer = 0;
  g.state = 'dying';
  g.stateTime = 0;
  a.update(g, STEP);

  check('the aura turns red', a.tint === TINTS.red, a.tint);
  check('and opens full', a.level === 1, a.level);

  // Held through the reveal beat, then fading with the death animation.
  g.stateTime = PV.DEATH_REVEAL;
  a.update(g, STEP);
  check('still full at the end of the reveal', a.level === 1, a.level);

  // The frame the fade opens carries on from that full rather than jumping:
  // the wobble is phased off the fade, so it starts at its own peak.
  g.stateTime = PV.DEATH_REVEAL + 0.01;
  a.update(g, STEP);
  check('and picks up from it rather than popping', a.level > 0.9, a.level);

  g.stateTime = PV.DEATH_REVEAL + PV.DEATH_ANIM / 2;
  a.update(g, STEP);
  check('half gone halfway through the animation', a.level > 0 && a.level < 1, a.level);

  g.stateTime = PV.DEATH_REVEAL + PV.DEATH_ANIM;
  a.update(g, STEP);
  check('spent when the animation is', a.level === 0, a.level);

  // Back on the board, with no yellow owed from the fright it interrupted.
  g.state = 'playing';
  a.update(g, STEP);
  check('no pulse is owed afterwards', a.tint === null, a.tint);
})();

console.log('');
console.log(failures === 0 ? 'ALL AURA CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
