/* Board-aura regression test — run with:  node test/aura-test.js
 *
 * Covers the glow at the board edge: the white breath while a fright runs, the
 * blink that quickens as it ends, the yellow pulse that closes it, and the red
 * a lost life overrides both with. The schedule is timing-sensitive and
 * invisible to a layout check. draw() needs a canvas and is not covered here.
 */
global.window = {};
var path = require('path');
// Mirrors index.html's relative script order, so aura.js loads before game.js
// here too — a module-scope capture of something game.js exports would go
// red in this suite exactly as it would silently break in the browser.
['maze.js', 'vision.js', 'entities.js', 'render.js', 'aura.js', 'game.js']
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

  // The fade opens from that same full: its wobble is phased off the fade, so
  // it starts at its own peak.
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
console.log('the ending window is shared');

/* The ghosts flash white and the aura starts blinking over the same stretch
 * of a fright, so both read the one constant. */
(function () {
  check('the window is exported', PV.FRIGHT_ENDING === 2, PV.FRIGHT_ENDING);

  var a = PV.createAura();
  // Just inside the window: the blink is on, so the level is one of its two
  // levels rather than a point on the breath's sine.
  var inside = round({ frightTimer: PV.FRIGHT_ENDING - 0.01, time: 0 });
  a.update(inside, STEP);
  var atEdge = a.level;

  var b = PV.createAura();
  var outside = round({ frightTimer: PV.FRIGHT_ENDING + 0.5, time: 0 });
  b.update(outside, STEP);

  check('inside the window the aura blinks', atEdge === 0.75 || atEdge === 0.14,
    atEdge);
  check('outside it breathes', b.level !== 0.14, b.level);
})();

console.log('');
console.log('the board and the aura are separate asks');

/* One renderer draws both the live round and the demo behind the menu, so the
 * aura is a second call rather than part of drawing the board. A recording
 * context tells them apart under node: aura.js is the only thing in the
 * renderer that paints with a gradient. */
function recorder() {
  var seen = { gradients: 0, paths: [] };
  var ctx = {
    createLinearGradient: function () {
      seen.gradients++;
      return { addColorStop: function () {} };
    }
  };
  ['save', 'restore', 'setTransform', 'translate', 'rotate', 'clip',
    'closePath', 'quadraticCurveTo', 'arc',
    'ellipse', 'fill', 'stroke', 'fillRect', 'fillText'
  ].forEach(function (name) { ctx[name] = function () {}; });

  // The points of each path, so the aura's four bands can be measured.
  var path = null;
  ctx.beginPath = function () { path = []; seen.paths.push(path); };
  ctx.moveTo = ctx.lineTo = function (x, y) { path.push([x, y]); };
  ctx.canvas = { width: PV.WIDTH, height: PV.HEIGHT, getContext: function () { return ctx; } };
  ctx.seen = seen;
  return ctx;
}

function frightRound() {
  var g = PV.createGame('stare-normal', { persist: false });
  g.startRound();
  g.state = 'playing';
  g.frightTimer = 7;
  return g;
}

(function () {
  var ctx = recorder();
  var renderer = PV.createRenderer(ctx.canvas);
  renderer.setScale(1);
  var g = frightRound();

  renderer.draw(g, STEP);
  check('drawing the board paints no aura', ctx.seen.gradients === 0,
    ctx.seen.gradients);

  renderer.drawAura(g, STEP);
  check('asking for the aura paints one', ctx.seen.gradients === 4,
    ctx.seen.gradients);
})();

/* Esc back to the menu, and then a fresh round. Both of the aura's carried
 * values have to go: the fright it was mid-way through and the pulse a spent
 * one leaves running. */
(function () {
  var ctx = recorder();
  var renderer = PV.createRenderer(ctx.canvas);
  renderer.setScale(1);
  var g = frightRound();

  renderer.drawAura(g, STEP);
  renderer.resetAura();

  g.frightTimer = 0;
  renderer.drawAura(g, STEP);
  check('a round left mid-fright owes no closing pulse',
    ctx.seen.gradients === 4, ctx.seen.gradients);
})();

(function () {
  var ctx = recorder();
  var renderer = PV.createRenderer(ctx.canvas);
  renderer.setScale(1);
  var g = frightRound();

  // Spent on the second frame, which opens the yellow.
  renderer.drawAura(g, STEP);
  g.frightTimer = 0;
  renderer.drawAura(g, STEP);
  check('a spent fright is painting', ctx.seen.gradients === 8,
    ctx.seen.gradients);

  renderer.resetAura();
  renderer.drawAura(g, STEP);
  check('and the pulse does not survive the menu', ctx.seen.gradients === 8,
    ctx.seen.gradients);
})();

console.log('');
console.log('the four bands mitre into a frame');

/* Corners are where this goes wrong: a gap between two bands is a dark hairline
 * on the diagonal and an overlap is a bright one. Both are a question about the
 * geometry alone, which the recording context hands over. */
(function () {
  var ctx = recorder();
  var renderer = PV.createRenderer(ctx.canvas);
  renderer.setScale(1);

  renderer.drawAura(frightRound(), STEP);
  var bands = ctx.seen.paths;
  check('one band per edge', bands.length === 4, bands.length);
  check('each is a quad', bands.every(function (p) { return p.length === 4; }),
    bands.map(function (p) { return p.length; }).join(','));

  /* Drawn clockwise as rim start, rim end, inner end, inner start — so each
   * band's second half is its neighbour's first, point for point. */
  var met = bands.every(function (p, i) {
    var next = bands[(i + 1) % bands.length];
    return p[1][0] === next[0][0] && p[1][1] === next[0][1] &&
      p[2][0] === next[3][0] && p[2][1] === next[3][1];
  });
  check('neighbours share their mitre exactly', met);

  var area = bands.reduce(function (sum, p) {
    var a = 0;
    for (var i = 0; i < p.length; i++) {
      var q = p[(i + 1) % p.length];
      a += p[i][0] * q[1] - q[0] * p[i][1];
    }
    return sum + Math.abs(a) / 2;
  }, 0);
  /* The board less the rectangle left unlit in the middle. How far the bands
   * reach in is read off the top one's inner corner; the mitre check above
   * already ties the other three to it. */
  var b = bands[0][3][0];
  var frame = PV.WIDTH * PV.HEIGHT - (PV.WIDTH - 2 * b) * (PV.HEIGHT - 2 * b);
  check('and together cover the frame once', area === frame,
    area + ' of ' + frame);
})();

console.log('');
console.log(failures === 0 ? 'ALL AURA CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
