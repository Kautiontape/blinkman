/* Mode and difficulty table test — run with:  node test/modes-test.js
 *
 * Each mode's Normal is the tuning that mode is balanced around, pinned
 * literally here so a change to the table has to be deliberate.
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

console.log('');
console.log('the grid');

var IDS = ['stare-easy', 'stare-normal', 'stare-hard',
           'torch-easy', 'torch-normal', 'torch-hard',
           'flash-easy', 'flash-normal', 'flash-hard'];

check('nine cells', Object.keys(PV.DIFFICULTIES).length === 9,
  Object.keys(PV.DIFFICULTIES).length);

IDS.forEach(function (id) {
  check(id + ' exists', !!PV.DIFFICULTIES[id]);
});

console.log('');
console.log('every cell is complete');

/* A field silently missing from one cell is worse than a wrong value: nothing
 * short of a full field list catches it, since a NaN or undefined still lets
 * a round build and play. */
var REQUIRED = ['mode', 'pool', 'keep', 'freeSelf', 'cooldown', 'ghostSpeed', 'initial'];
IDS.forEach(function (id) {
  var r = PV.DIFFICULTIES[id];
  var missing = REQUIRED.filter(function (k) { return r[k] === undefined; });
  check(id + ' is complete', missing.length === 0, missing.join(','));
  check(id + ' has usable numbers', r.cooldown >= 0 && r.ghostSpeed > 0,
    r.cooldown + ' / ' + r.ghostSpeed);
});

PV.MODE_IDS.forEach(function (mode) {
  var speeds = PV.LEVELS.map(function (lv) { return PV.DIFFICULTIES[mode + '-' + lv].ghostSpeed; });
  check(mode + ' ghosts speed up down the ladder',
    speeds[0] < speeds[1] && speeds[1] < speeds[2], speeds.join(' '));
});

console.log('');
console.log('every cell plays');

IDS.forEach(function (id) {
  var g = PV.createGame(id, { persist: false });
  g.startRound();
  g.update(1 / 60);
  check(id + ' builds a round', g.state === 'ready' || g.state === 'playing', g.state);
});

console.log('');
console.log('carried across unchanged');

/* Each mode's Normal, plus Stare's Easy and Hard — the tuning pinned
 * literally so a change to the table has to be deliberate. */
var CARRIED = {
  'stare-easy': {
    mode: 'stare', pool: 'dots,ghosts,walls', keep: 2, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.80, initial: 'walls,dots'
  },
  'stare-normal': {
    mode: 'stare', pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.92, initial: 'walls'
  },
  'stare-hard': {
    mode: 'stare', pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
    cooldown: 3, ghostSpeed: 1.00, initial: 'walls'
  },
  'torch-normal': {
    mode: 'torch', pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.90, initial: 'walls', hold: 0.25, fade: 1.1
  },
  'flash-normal': {
    mode: 'flash', pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
    cooldown: 1, ghostSpeed: 0.86, initial: 'walls', hold: 0.4, fade: 2.0
  }
};

Object.keys(CARRIED).forEach(function (id) {
  var want = CARRIED[id];
  var got = PV.DIFFICULTIES[id];
  Object.keys(want).forEach(function (field) {
    var actual = got[field];
    if (Array.isArray(actual)) actual = actual.join(',');
    check(id + ' ' + field, actual === want[field], actual);
  });
});

console.log('');
console.log('the copy covers the grid');

IDS.forEach(function (id) {
  var r = PV.DIFFICULTIES[id];
  check(id + ' names its mode', /^[A-Z]+$/.test(PV.modeName(id)), PV.modeName(id));
  check(id + ' names its level', /^[A-Z]+$/.test(PV.levelName(id)), PV.levelName(id));
  check(id + ' has a blurb', (PV.levelBlurb(id) || '').length > 0, PV.levelBlurb(id));

  var copy = PV.TEXT.modes[r.mode].levels[r.level];
  check(id + ' has a menu line', !!copy && (copy.menu || '').length > 0, copy && copy.menu);
  check(id + ' menu has one bold run', (copy.menu.match(/<b>/g) || []).length === 1, copy.menu);
});

PV.MODE_IDS.forEach(function (mode) {
  var copy = PV.TEXT.modes[mode];
  check(mode + ' has a menu line', !!copy && (copy.menu || '').length > 0, copy && copy.menu);
  check(mode + ' menu has one bold run', (copy.menu.match(/<b>/g) || []).length === 1, copy.menu);
});

console.log('');
console.log(failures === 0 ? 'ALL GRID CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
