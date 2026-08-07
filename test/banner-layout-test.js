/* Banner layout regression test — run with:  node test/banner-layout-test.js
 *
 * Guards the arithmetic behind docs/banner.png. Every check here corresponds to
 * a mistake that renders as a subtly wrong image rather than an error.
 */
global.window = {};
var join = require('path').join;
require(join(__dirname, '..', 'tools', 'banner-layout.js'));
/* js/maze.js for the full board's real dimensions and ghost-house row, and
 * tools/banner-draw.js for the presets themselves — both only touch `document`
 * from inside a draw call, so requiring them outside a browser is safe and
 * beats restating their numbers here where they could drift. */
require(join(__dirname, '..', 'js', 'maze.js'));
require(join(__dirname, '..', 'tools', 'banner-draw.js'));
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

check('an unzoomed band spans the whole board width', band.bandCols === 28,
  'cols=' + band.bandCols);
check('an unzoomed offscreen is exactly the target width',
  band.offscreenW === 1860, 'offscreenW=' + band.offscreenW);

console.log('');
console.log('zoomed band');

/* press/cover-wide.png. Zoom is the only reason a preset shows fewer than all
 * 28 columns, so these pin the crop rather than the fit. */
var zoomed = PV.bannerBand({
  bannerW: 1920, bannerH: 1080, boardW: 560, boardH: 620, tile: 20,
  topRow: 3, zoom: 1.5
});

check('zoom multiplies the scale', zoomed.scale === (1920 * 1.5) / 560,
  'scale=' + zoomed.scale);
check('zooming in shows fewer rows', Math.abs(zoomed.bandRows - 10.5) < 1e-9,
  'rows=' + zoomed.bandRows);
check('zooming in crops columns away', zoomed.bandCols < 28,
  'cols=' + zoomed.bandCols.toFixed(2));
check('the offscreen is wide enough to crop from',
  zoomed.offscreenW >= 1920, 'offscreenW=' + zoomed.offscreenW);
check('the zoomed band still fits the board', zoomed.fits === true,
  'topRow=3 rows=' + zoomed.bandRows);
check('source x is an integer so the blit does not resample',
  Number.isInteger(zoomed.srcX), 'srcX=' + zoomed.srcX);

/* press/social.png, from the real preset rather than a copy of its numbers.
 *
 * The ghost house door is the one piece of board that reads as a defect in a
 * link card: a short red bar landing near the tagline. The social crop is
 * chosen to stop above it, and nothing about the image says so — this is the
 * only thing standing between a retuned zoom and a red smear on every card.
 *
 * The promo art is fixed marketing rather than a level, so it draws on the full
 * board at every size: these dimensions come from that template, not a maze. */
var full = PV.BOARDS.full;
var social = PV.PRESETS.social;
var socialBand = PV.bannerBand({
  bannerW: social.w, bannerH: social.h,
  boardW: full.cols * PV.TILE, boardH: full.rows * PV.TILE,
  tile: PV.TILE, topRow: social.topRow, zoom: social.zoom
});

check('the social crop is a whole number of tile rows', socialBand.exact === true,
  'rows=' + socialBand.bandRows);
check('the social preset demands that exactness of itself',
  social.exactRows === true, 'exactRows=' + social.exactRows);
check('the social crop stops above the ghost house door',
  social.topRow + socialBand.bandRows <= full.spawn.door.row,
  'lastRow=' + (social.topRow + socialBand.bandRows) +
  ' doorRow=' + full.spawn.door.row);
check('the social crop still fits the board', socialBand.fits === true,
  'fits=' + socialBand.fits);

/* Omitting zoom has to behave exactly like zoom 1, or docs/banner.png moves. */
var implicit = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 4
});
var explicit = PV.bannerBand({
  bannerW: 1860, bannerH: 465, boardW: 560, boardH: 620, tile: 20, topRow: 4,
  zoom: 1
});
check('an absent zoom is exactly zoom 1',
  implicit.scale === explicit.scale && implicit.srcY === explicit.srcY &&
  implicit.offscreenW === explicit.offscreenW &&
  implicit.bandRows === explicit.bandRows,
  'srcY=' + implicit.srcY + '/' + explicit.srcY);

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

/* The same trap as the row clamp, on the axis a zoomed preset crops. Tile
 * [24,7] is nearer the target than [1,7], so an unclamped search takes it —
 * and it sits outside the 18 columns cover-wide.png actually shows. */
var cropped = PV.bannerPlayerSpot(stubMaze([[1, 7], [24, 7]]), 20, 7, 4, 10, 17);
check('never leaves the visible columns',
  cropped.col === 1 && cropped.row === 7,
  'got c' + cropped.col + ',r' + cropped.row);

var unclamped = PV.bannerPlayerSpot(stubMaze([[1, 7], [24, 7]]), 20, 7, 4, 10);
check('an absent column bound searches the full width',
  unclamped.col === 24, 'got c' + unclamped.col);

console.log('');
console.log('logo lockup');

var LOGO = { discFrac: 0.62, padFrac: 0.035, gapFrac: 0.045 };
var lock = PV.logoLockup(1900, 340, LOGO);

check('the disc is centred on its own diameter plus the pad',
  Math.abs(lock.discX - (0.035 * 1900 + lock.discR)) < 1e-9,
  'discX=' + lock.discX);
check('the text starts clear of the disc', lock.textLeft > lock.discX + lock.discR,
  'textLeft=' + lock.textLeft.toFixed(1));
check('the text ends a full pad short of the edge',
  Math.abs((lock.textLeft + lock.textWidth) - (1900 - 0.035 * 1900)) < 1e-9,
  'right=' + (lock.textLeft + lock.textWidth).toFixed(1));
check('the lockup fits', lock.fits === true,
  'textWidth=' + lock.textWidth.toFixed(1));

/* A canvas far taller than it is wide leaves the wordmark nowhere to go. */
var squeezed = PV.logoLockup(400, 2000, LOGO);
check('a degenerate lockup is reported rather than drawn',
  squeezed.fits === false, 'textWidth=' + squeezed.textWidth.toFixed(1));

/* JetBrains Mono 800 advances 0.6em, and drawLogo adds 0.34em of tracking to
 * every glyph but discounts the trailing one. Nine glyphs of that predicts the
 * size drawLogo's binary search lands on — 181.1px in Chrome at this canvas,
 * which is what makes the ratio below checkable without a browser. */
var predicted = lock.textWidth / (9 * (0.6 + 0.34) - 0.34);
var ratio = lock.discToCap(predicted);
check('disc and cap height read as one mark', ratio > 1.5 && ratio < 1.7,
  'predicted=' + predicted.toFixed(1) + 'px ratio=' + ratio.toFixed(2));

console.log('');
console.log('logo legibility');

/* press/logo.png is a single transparent file laid over backgrounds it does not
 * control, so the wordmark colour is load-bearing. These are the numbers that
 * stop it drifting back toward one that only works on the dark half. */
var onWhite = PV.contrastRatio(PV.LOGO_INK, '#ffffff');
var onBlack = PV.contrastRatio(PV.LOGO_INK, '#000000');

check('WCAG luminance matches the published figure for mid grey',
  Math.abs(PV.relativeLuminance('#777777') - 0.1845) < 0.001,
  'L=' + PV.relativeLuminance('#777777').toFixed(4));
check('a colour has no contrast with itself',
  PV.contrastRatio('#7183e4', '#7183e4') === 1);
check('white on black is the full 21:1',
  Math.abs(PV.contrastRatio('#ffffff', '#000000') - 21) < 1e-9);

check('the logo ink clears 3:1 on white', onWhite >= 3,
  PV.LOGO_INK + ' -> ' + onWhite.toFixed(2) + ':1');
check('the logo ink clears 3:1 on black', onBlack >= 3,
  PV.LOGO_INK + ' -> ' + onBlack.toFixed(2) + ':1');
check('the logo ink favours black, where the logo is usually placed',
  onBlack > onWhite, 'white=' + onWhite.toFixed(2) + ' black=' + onBlack.toFixed(2));

/* The banner's near-white and any dark ink each fail one side outright. Pinned
 * so the two-file approach cannot quietly come back. */
check('the banner ink would be illegible on white',
  PV.contrastRatio('#e8ecff', '#ffffff') < 1.5,
  'e8ecff -> ' + PV.contrastRatio('#e8ecff', '#ffffff').toFixed(2) + ':1');
check('a dark ink would be illegible on black',
  PV.contrastRatio('#12141c', '#000000') < 1.5,
  '12141c -> ' + PV.contrastRatio('#12141c', '#000000').toFixed(2) + ':1');

/* Contrast against white and black trade off exactly, so the best a single
 * colour can do on its worse side is the value where the two are equal:
 * (L+0.05)^2 = 0.0525, giving 4.58:1 at L=0.179. Stated because it is not
 * obvious, and because it is the reason the two sides above are lopsided
 * rather than both excellent. */
var ceiling = Math.sqrt(0.0525) / 0.05;
check('a single colour cannot beat 4.58:1 on both sides',
  Math.abs(ceiling - 4.58) < 0.01, 'ceiling=' + ceiling.toFixed(2) + ':1');
check('the ink does not claim to beat that ceiling',
  Math.min(onWhite, onBlack) <= ceiling,
  'worse side=' + Math.min(onWhite, onBlack).toFixed(2) + ':1');

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
