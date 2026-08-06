/* Banner layout regression test — run with:  node test/banner-layout-test.js
 *
 * Guards the arithmetic behind docs/banner.png. Every check here corresponds to
 * a mistake that renders as a subtly wrong image rather than an error.
 */
global.window = {};
require(require('path').join(__dirname, '..', 'tools', 'banner-layout.js'));
var PV = global.window.PV;

var failures = 0;
function check(label, pass, detail) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label +
    (detail ? '   ' + detail : ''));
  if (!pass) failures++;
}

console.log('band geometry');

var band = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 4
});

check('scale is banner width over board width', band.scale === 1860 / 560,
  'scale=' + band.scale);
check('band is a whole number of tile rows', band.bandRows === 7,
  'rows=' + band.bandRows);
check('the chosen band fits inside the board', band.fits === true,
  'fits=' + band.fits);

var offBottom = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 28
});
check('a band running off the bottom is reported', offBottom.fits === false,
  'topRow=28 rows=' + offBottom.bandRows);

var negative = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: -1
});
check('a negative top row is reported', negative.fits === false,
  'topRow=-1');

var flush = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 24
});
check('a band flush with the bottom edge still fits', flush.fits === true,
  'topRow=24 rows=' + flush.bandRows);
check('source y is an integer so the blit does not resample',
  Number.isInteger(band.srcY), 'srcY=' + band.srcY);
check('source y is within half a pixel of the true band top',
  Math.abs(band.srcY - 4 * 20 * band.scale) <= 0.5,
  'srcY=' + band.srcY + ' true=' + (4 * 20 * band.scale));
check('offscreen is tall enough for the whole board',
  band.offscreenH >= 620 * band.scale,
  'offscreenH=' + band.offscreenH);

var bad = PV.bannerBand({
  bannerW: 1860, bannerH: 500, boardW: 560, boardH: 620, tile: 20, topRow: 4
});
check('a non-integral band is reported rather than rounded away',
  bad.exact === false, 'exact=' + bad.exact);

console.log('');
console.log('ghost dome');

var dome = PV.bannerGhost();

check('dome apex sits inside the box', dome.apexY >= 0, 'apexY=' + dome.apexY);
check('dome apex is not wastefully far inside', dome.apexY <= 2,
  'apexY=' + dome.apexY);
var skirtLow = 0;
dome.skirt.forEach(function (p) { if (p[1] > skirtLow) skirtLow = p[1]; });
check('skirt valleys reach the ghost floor', skirtLow === dome.bottomY,
  'skirtLow=' + skirtLow + ' bottomY=' + dome.bottomY);
var symmetric = dome.skirt.every(function (p) {
  return dome.skirt.some(function (q) {
    return Math.abs(q[0] - (dome.boxW - p[0])) < 1e-9 && q[1] === p[1];
  });
});
check('skirt is symmetric about the box centre', symmetric,
  'skirt=' + JSON.stringify(dome.skirt));
check('skirt peaks share one height',
  dome.skirt[0][1] === dome.skirt[2][1] &&
  dome.skirt[2][1] === dome.skirt[4][1],
  'peaks=' + dome.skirt[0][1] + ',' + dome.skirt[2][1] + ',' + dome.skirt[4][1]);
check('centre skirt point sits on the axis of symmetry',
  dome.skirt[2][0] === dome.boxW / 2, 'x=' + dome.skirt[2][0]);
check('ghost floor sits inside the box', dome.bottomY <= dome.boxH,
  'bottomY=' + dome.bottomY + ' boxH=' + dome.boxH);
check('eyes are ovals, taller than wide', dome.eyeRy > dome.eyeRx,
  'rx=' + dome.eyeRx + ' ry=' + dome.eyeRy);
check('pupils sit left of eye centre so both ghosts look at the player',
  dome.pupils[0].x < dome.eyes[0].x && dome.pupils[1].x < dome.eyes[1].x);
check('eyes fit inside the dome width',
  dome.eyes[0].x - dome.eyeRx >= 0 && dome.eyes[1].x + dome.eyeRx <= dome.boxW);

console.log('');
console.log('player placement');

/* A stub wall grid: everything solid except a known pocket, so the search has
 * exactly one correct answer and cannot pass by accident. */
function stubMaze(openTiles) {
  var walls = [];
  for (var r = 0; r < 31; r++) {
    walls[r] = [];
    for (var c = 0; c < 28; c++) walls[r][c] = true;
  }
  openTiles.forEach(function (t) { walls[t[1]][t[0]] = false; });
  return { walls: walls, rows: 31, cols: 28 };
}

var spot = PV.bannerPlayerSpot(stubMaze([[6, 7]]), 3, 7, 4, 10);
check('snaps to the only open tile', spot.col === 6 && spot.row === 7,
  'got c' + spot.col + ',r' + spot.row);

/* Two tiles equidistant from the target. The function has no randomness, so it
 * is deterministic either way — what these pin down is which of two equally
 * valid tiles wins, which bannerPlayerSpot documents as a contract. */
var tie = PV.bannerPlayerSpot(stubMaze([[2, 7], [8, 7]]), 5, 7, 4, 10);
check('breaks ties by scan order, as documented', tie.col === 2 && tie.row === 7,
  'got c' + tie.col + ',r' + tie.row);

/* Same idea, but tied across rows rather than columns, to check the other
 * half of the documented rule. Target is (5,7). Tile [8,5] is dc=3, dr=-2,
 * dist=9+4=13. Tile [2,9] is dc=-3, dr=2, dist=9+4=13 — an equal tie, but
 * [2,9] has the lower column while [8,5] has the lower row. Scan order visits
 * row 5 before row 9 regardless of column, so [8,5] must win. */
var tieRow = PV.bannerPlayerSpot(stubMaze([[8, 5], [2, 9]]), 5, 7, 4, 10);
check('breaks ties by scan order, lowest row wins even over a higher column',
  tieRow.col === 8 && tieRow.row === 5, 'got c' + tieRow.col + ',r' + tieRow.row);

/* The only open tile outside the band sits closer to the target than the only
 * one inside it, so an unclamped search would take the outside tile. */
var clamped = PV.bannerPlayerSpot(stubMaze([[5, 3], [27, 4]]), 5, 7, 4, 10);
check('never leaves the visible band',
  clamped.col === 27 && clamped.row === 4,
  'got c' + clamped.col + ',r' + clamped.row);

var none = PV.bannerPlayerSpot(stubMaze([]), 3, 7, 4, 10);
check('reports failure rather than returning a wall tile', none === null,
  'got ' + JSON.stringify(none));

console.log('');
console.log('wordmark fitting');

/* Canvas text width is very close to linear in font size, so a linear stub is
 * a fair stand-in for ctx.measureText and lets the search be tested offline. */
function linearMeasure(perPx) {
  return function (size) { return size * perPx; };
}

var fit = PV.bannerFitFont(linearMeasure(8), 880, 10, 400);
check('hits the target width', Math.abs(fit.width - 880) <= 1,
  'width=' + fit.width.toFixed(2));
/* A non-linear measure: the search has to genuinely converge, rather than
 * return a size alongside a width computed from that same size. */
function quadraticMeasure(size) { return size * size / 10; }

var curved = PV.bannerFitFont(quadraticMeasure, 1000, 10, 400);
check('converges on a non-linear measure', Math.abs(curved.size - 100) < 0.01,
  'size=' + curved.size.toFixed(4));

var tiny = PV.bannerFitFont(linearMeasure(8), 5, 10, 400);
check('clamps to the minimum when the target is unreachably small',
  tiny.size === 10, 'size=' + tiny.size);

var huge = PV.bannerFitFont(linearMeasure(8), 99999, 10, 400);
check('clamps to the maximum when the target is unreachably large',
  huge.size === 400, 'size=' + huge.size);

console.log('');
console.log(failures === 0 ? 'BANNER LAYOUT OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
