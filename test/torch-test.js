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
console.log(failures === 0 ? 'ALL TORCH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
