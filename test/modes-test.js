/* Mode and difficulty table test — run with:  node test/modes-test.js
 *
 * The guarantee this whole grid rests on is that every mode's Normal is what
 * that mode shipped as before it had a ladder, so the carried cells are pinned
 * literally here rather than compared against the table under test.
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
  var r = PV.DIFFICULTIES[id];
  check(id + ' exists', !!r);
  if (!r) return;
  check(id + ' knows its own id', r.id === id, r.id);
  check(id + ' splits into mode and level',
    id === r.mode + '-' + r.level, r.mode + ' / ' + r.level);
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

/* Pinned literally: these five are what shipped before the grid existed. */
var CARRIED = {
  'stare-easy': {
    pool: 'dots,ghosts,walls', keep: 2, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.80, initial: 'walls,dots'
  },
  'stare-normal': {
    pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.92, initial: 'walls'
  },
  'stare-hard': {
    pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
    cooldown: 3, ghostSpeed: 1.00, initial: 'walls'
  },
  'torch-normal': {
    pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.90, initial: 'walls', hold: 0.25, fade: 1.1
  },
  'flash-normal': {
    pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
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
  check(id + ' names its mode', /^[A-Z]+$/.test(PV.modeName(id)), PV.modeName(id));
  check(id + ' names its level', /^[A-Z]+$/.test(PV.levelName(id)), PV.levelName(id));
  check(id + ' has a blurb', (PV.modeBlurb(id) || '').length > 0, PV.modeBlurb(id));
});

console.log('');
console.log(failures === 0 ? 'ALL GRID CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
