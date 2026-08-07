/* Torch-mode regression test — run with:  node test/torch-test.js
 *
 * Covers the sonar ping: its distance-delayed fade curve, its frozen origin,
 * its expiry, and the ghost blips. All of it is timing- and geometry-sensitive
 * and none of it is visible to a layout check.
 */
global.window = {};
var path = require('path');
// Mirrors index.html's relative script order, so a module-scope capture from
// game.js would go red here exactly as it would silently break in the browser.
['maze.js', 'vision.js', 'entities.js', 'render.js', 'game.js'].forEach(function (f) {
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
var RULES = PV.DIFFICULTIES['torch-normal'];
var SPEED = PV.PULSE_SPEED;

/* The same seam opening-test.js uses: pellets frozen so nothing under test
 * depends on what Pac-Man wanders into, and invuln held so a ghost can't end
 * the round mid-measurement. steer() is what moves a round out of 'ready'. */
function playing() {
  var g = PV.createGame('torch-normal');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  return g;
}

/* The ping a check just fired, or null. The newest one rather than the first,
 * because a round opens on a free ping that is still running here. */
function livePulse(g) {
  var live = g.vision.pulses();
  return live[live.length - 1] || null;
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
  var p = livePulse(g);
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
  check('a ping is alive well before its life is up', livePulse(g) !== null);

  for (var i = 0, n = Math.ceil((life + 0.1) / STEP); i < n; i++) g.update(STEP);
  check('the ping expires once the last element has faded',
    livePulse(g) === null, livePulse(g));

  check('flash has no ping', PV.createGame('flash-normal').vision.pulses().length === 0);
  check('stare has no ping', PV.createGame('stare-normal').vision.pulses().length === 0);
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
  check('the ping is running', livePulse(g) !== null);
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

  var p = livePulse(g);
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
  check('the contact records the distance the ring found it at',
    near(p.blips[0].dist,
      Math.hypot(frozen.x - p.x, frozen.y - p.y), 0.001), p.blips[0].dist);
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
    livePulse(h).blips.length === 0, livePulse(h).blips.length);
})();

console.log('');
console.log('tracked blips');

(function () {
  var g = PV.createGame('torch-easy');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  for (var i = 0; i < 100; i++) g.update(STEP);
  check('a ghost ping opens', g.selectVision('ghosts') === 'ok');

  var p = livePulse(g);
  var ghost = g.ghosts[0];
  for (var f = 0; f < 60 && !p.blips[0]; f++) g.update(STEP);
  check('the ring reaches it', !!p.blips[0]);

  var dist = p.blips[0].dist;
  check('the contact distance is recorded', dist > 0, dist);

  var at = { x: p.blips[0].x, y: p.blips[0].y };
  for (var k = 0; k < 20; k++) g.update(STEP);

  check('the ghost moved on', Math.hypot(ghost.x - at.x, ghost.y - at.y) > 4,
    Math.hypot(ghost.x - at.x, ghost.y - at.y).toFixed(1));
  check('the blip followed it',
    near(p.blips[0].x, ghost.x, 0.001) && near(p.blips[0].y, ghost.y, 0.001),
    p.blips[0].x + ',' + p.blips[0].y);
  check('the blip keeps waddling', p.blips[0].wobble === ghost.wobble,
    p.blips[0].wobble);
  check('the fade still runs off the contact distance',
    p.blips[0].dist === dist, p.blips[0].dist);

  // Normal and Hard leave a contact where they found it.
  check('normal does not track', !PV.DIFFICULTIES['torch-normal'].pingTracks);
  check('hard does not track', !PV.DIFFICULTIES['torch-hard'].pingTracks);
  check('easy tracks', PV.DIFFICULTIES['torch-easy'].pingTracks === true);
})();

console.log('');
console.log('two pings at once');

/* Picks stack, so two ghosts pings run together. Each carries its own
 * contacts: they fired from different places, so the same ghost sits a
 * different distance from each and their fades run on separate clocks. */
(function () {
  var g = PV.createGame('torch-easy');
  g.startRound();
  g.maze.eatPellet = function () { return 0; };
  g.invuln = Infinity;
  g.steer(PV.DIRS.left);
  for (var i = 0; i < 100; i++) g.update(STEP);

  check('the first ghost ping opens', g.selectVision('ghosts') === 'ok');
  var first = livePulse(g);
  for (var f = 0; f < 60 && !first.blips[0]; f++) g.update(STEP);
  check('the first ping has a contact', !!first.blips[0]);

  // He is against a wall by now, so turn him up the corridor: the second ping
  // has to fire from somewhere the first did not. 70 frames clears the 1s
  // cooldown and leaves the first ping well inside its life.
  g.steer(PV.DIRS.up);
  for (var c = 0; c < 70; c++) g.update(STEP);
  check('the second ghost ping opens', g.selectVision('ghosts') === 'ok');
  var second = livePulse(g);
  check('the two pings fired from different places',
    Math.hypot(second.x - first.x, second.y - first.y) > 4,
    Math.hypot(second.x - first.x, second.y - first.y).toFixed(1));

  for (var s = 0; s < 60 && !second.blips[0]; s++) g.update(STEP);
  check('the second ping has a contact too', !!second.blips[0]);

  var live = g.vision.pulses();
  check('both pings are still running',
    live.indexOf(first) !== -1 && live.indexOf(second) !== -1, live.length);
  check('each ping owns its own contacts', first.blips !== second.blips);
  check('one ghost, two rings, two contacts',
    first.blips[0] !== second.blips[0]);
  check('the same ghost is a different distance from each ring',
    Math.abs(first.blips[0].dist - second.blips[0].dist) > 1,
    first.blips[0].dist + ' vs ' + second.blips[0].dist);
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
console.log('cone + circle shape');

(function () {
  var P = { radius: 46, coneLen: 120, coneHalf: Math.PI / 4, soft: 12 };
  var right = PV.DIRS.right;

  check('your own position is always fully lit',
    PV.torchAlpha(0, 0, right, P) === 1);

  check('far away in every sense is dark',
    PV.torchAlpha(200, 200, right, P) === 0);

  check('close behind you is lit by the circle',
    PV.torchAlpha(-20, 0, right, P) === 1);

  check('straight ahead beyond the circle is lit by the cone',
    PV.torchAlpha(80, 0, right, P) === 1);

  var off = PV.torchAlpha(40, 69.28, right, P);   // 60 deg off-axis, within coneLen
  check('outside the cone angle stays dark even in range', off === 0, off);

  var circleEdge = PV.torchAlpha(-40, 0, right, P);   // dist 40, between 34 and 46
  check('the circle rim fades rather than snapping off',
    near(circleEdge, (46 - 40) / 12, 0.001), circleEdge);

  var coneTip = PV.torchAlpha(115, 0, right, P);      // dist 115, between 108 and 120
  check('the cone tip fades the same way',
    near(coneTip, (120 - 115) / 12, 0.001), coneTip);

  var coneSide = PV.torchAlpha(46.5, 37.9, right, P); // ~39 deg off-axis, dist 60
  check('the cone side edge is a fade, not a hard line',
    coneSide > 0 && coneSide < 1, coneSide);
})();

console.log('');
console.log('the torch ladder');

(function () {
  var easy = PV.DIFFICULTIES['torch-easy'];
  var normal = PV.DIFFICULTIES['torch-normal'];
  var hard = PV.DIFFICULTIES['torch-hard'];

  // The reach is a per-cell knob, so render.js holds no single value for it.
  check('the reach is not a module constant',
    PV.TORCH_R === undefined && PV.TORCH_CONE_LEN === undefined &&
    PV.TORCH_CONE_HALF === undefined,
    [PV.TORCH_R, PV.TORCH_CONE_LEN, PV.TORCH_CONE_HALF].join(' '));

  check('normal keeps the shipped reach',
    normal.torchRadius === 46 && normal.coneLen === 120 &&
    near(normal.coneHalf, Math.PI / 4, 1e-9),
    normal.torchRadius + ' / ' + normal.coneLen + ' / ' + normal.coneHalf);

  check('the circle shrinks down the ladder',
    easy.torchRadius > normal.torchRadius && normal.torchRadius > hard.torchRadius,
    [easy.torchRadius, normal.torchRadius, hard.torchRadius].join(' '));

  check('the cone shortens down the ladder',
    easy.coneLen > normal.coneLen && normal.coneLen > hard.coneLen,
    [easy.coneLen, normal.coneLen, hard.coneLen].join(' '));

  check('the cone narrows down the ladder',
    easy.coneHalf > normal.coneHalf && normal.coneHalf > hard.coneHalf,
    [easy.coneHalf, normal.coneHalf, hard.coneHalf].join(' '));

  // A wider cone must light a spot a narrower one cannot, or the knob is inert.
  var right = PV.DIRS.right;
  function lit(rules) {
    return PV.torchAlpha(40, 60, right, {
      radius: rules.torchRadius, coneLen: rules.coneLen,
      coneHalf: rules.coneHalf, soft: PV.TORCH_SOFT
    });
  }
  check('a wide cone reaches what a narrow one misses',
    lit(easy) > 0 && lit(hard) === 0, lit(easy) + ' / ' + lit(hard));

  // Hard is a bare pool of light: no cone, so nothing reaches past the disc.
  check('hard has no cone at all',
    hard.coneLen === 0 && hard.coneHalf === 0,
    hard.coneLen + ' / ' + hard.coneHalf);

  var P = {
    radius: hard.torchRadius, coneLen: hard.coneLen,
    coneHalf: hard.coneHalf, soft: PV.TORCH_SOFT
  };
  check('hard lights every direction the same',
    PV.torchAlpha(hard.torchRadius - 20, 0, PV.DIRS.right, P) ===
    PV.torchAlpha(-(hard.torchRadius - 20), 0, PV.DIRS.right, P));
  check('hard lights nothing past its own radius',
    PV.torchAlpha(hard.torchRadius + 1, 0, PV.DIRS.right, P) === 0,
    PV.torchAlpha(hard.torchRadius + 1, 0, PV.DIRS.right, P));
})();

var OPEN_MAZE = { isWall: function () { return false; } };
var SPILL = 700;   // px/s the lit edge travels — render.js's TORCH_SPILL

/** The shortest and longest ray in a reach array. */
function span(reach) {
  var min = Infinity, max = 0;
  for (var i = 0; i < reach.length; i++) {
    if (reach[i] < min) min = reach[i];
    if (reach[i] > max) max = reach[i];
  }
  return { min: min, max: max, text: min + ' .. ' + max };
}

/** A torch standing at the board's centre, shaped by a difficulty's reach. */
function torchOf(id) {
  var rules = PV.DIFFICULTIES[id];
  return {
    x: PV.center(14), y: PV.center(23),
    radius: rules.torchRadius, coneLen: rules.coneLen, coneHalf: rules.coneHalf,
    soft: PV.TORCH_SOFT, dir: PV.DIRS.right
  };
}

console.log('');
console.log('a coneless torch still reaches');

/* Hard has no cone at all, which is the case the ray code can silently lose:
 * torchEase caps every ray at the furthest the light can go, and reads an
 * on-axis ray as cone-lit. Either one collapses a coneless torch to nothing
 * unless it falls back to the disc, and neither is visible to torchAlpha.
 *
 * A mem carrying no rays yet has nothing to ease from, so this frame is the
 * bare geometry with the easing standing aside — which is why the fixture
 * below asserts the mem really is empty before measuring anything. The second
 * frame is here so the reading cannot be a first-frame artifact: the disc is
 * where the easing settles, not just where it starts. */
(function () {
  var hard = PV.DIFFICULTIES['torch-hard'];
  var torch = torchOf('torch-hard');
  var mem = { facing: null, reach: null, x: 0, y: 0 };
  check('the fixture has no rays to ease from', mem.reach === null, mem.reach);

  var first = span(PV.torchEase(mem, torch, OPEN_MAZE, STEP));
  check('every ray reaches the disc edge in open space',
    near(first.min, hard.torchRadius, 0.001) &&
    near(first.max, hard.torchRadius, 0.001), first.text);

  var again = span(PV.torchEase(mem, torch, OPEN_MAZE, STEP));
  check('and a settled frame reads the same disc',
    near(again.min, hard.torchRadius, 0.001) &&
    near(again.max, hard.torchRadius, 0.001), again.text);
})();

console.log('');
console.log('the lit edge eases');

/* Ray lengths are carried between frames, so a corridor runs down rather than
 * arriving whole the instant he clears the corner. */
(function () {
  var hard = PV.DIFFICULTIES['torch-hard'];
  var torch = torchOf('torch-hard');
  var mem = { facing: null, reach: null, x: 0, y: 0 };

  PV.torchEase(mem, torch, OPEN_MAZE, STEP);   // settles every ray on the disc
  check('it remembers where it measured from',
    mem.x === torch.x && mem.y === torch.y, mem.x + ',' + mem.y);

  // Open the reach right up without moving him: the light runs out at its own
  // speed instead of snapping to the new shape.
  torch.radius = 400;
  var second = span(PV.torchEase(mem, torch, OPEN_MAZE, STEP));
  var want = hard.torchRadius + SPILL * STEP;
  check('a way opening is eased into, not snapped to',
    near(second.min, want, 0.001) && near(second.max, want, 0.001), second.text);
})();

console.log('');
console.log('the light dies back down the corridor');

/* The easing runs both ways: a ray the beam has swung off shortens at the same
 * speed it lengthened. Holding each ray to the wall in front of it rather than
 * to the shape it now wants is what leaves it room to lag — clamping to the
 * shape would snap every trailing ray home in one frame. */
(function () {
  var torch = torchOf('torch-normal');
  var mem = { facing: null, reach: null, x: 0, y: 0 };

  // Ray 0 points along +x, which is straight down the cone to start with.
  var first = PV.torchEase(mem, torch, OPEN_MAZE, STEP);
  check('the ray down the cone runs the cone\'s whole length',
    near(first[0], torch.coneLen, 0.001), first[0]);

  torch.dir = PV.DIRS.left;
  var second = PV.torchEase(mem, torch, OPEN_MAZE, STEP);
  check('the beam swinging away leaves the ray to shorten a step at a time',
    near(second[0], torch.coneLen - SPILL * STEP, 0.001), second[0]);
})();

console.log('');
console.log('a contact fades on the distance it was found at');

/* A contact is drawn where it now sits — following its ghost under
 * pingTracks — but both its brightness and whether it reads as the ring's
 * leading edge are clocked off `dist`, where the ring found it. Recomputing
 * either from the contact's current position would relight a contact the ring
 * has since caught up with. */
(function () {
  var origin = { x: 0, y: 0, age: 0.5 };   // the ring is 350px out

  var carried = PV.blipDraw({ x: 700, y: 0, dist: 350 }, origin, RULES);
  check('a contact carried out past the ring is still lit',
    carried.alpha === 1, carried.alpha);

  var fresh = PV.blipDraw({ x: 0, y: 0, dist: 350 }, origin, RULES);
  check('a contact the ring has just reached is drawn as its edge',
    fresh.edge === true, fresh.edge);

  var passed = PV.blipDraw({ x: 350, y: 0, dist: 210 }, origin, RULES);
  check('a contact the ring passed 0.2s ago is no longer its edge',
    passed.edge === false, passed.edge);

  var spent = PV.blipDraw({ x: 0, y: 0, dist: 350 }, { x: 0, y: 0, age: 3 }, RULES);
  check('a contact past its fade is gone', spent.alpha === 0, spent.alpha);
})();

console.log('');
console.log('what a ghost draws at');

/* Ghosts are never clipped to the lit region — they take the brighter of the
 * layer's own alpha and the torch's, so one straddling the edge shows whole
 * rather than sliced. Those two are the whole decision. */
(function () {
  var torch = torchOf('torch-normal');
  // Well down the cone, so there are whole tiles between him and it for the
  // line-of-sight check below to find something in.
  var inBeam = { x: torch.x + 100, y: torch.y };
  var away = { x: torch.x - 400, y: torch.y };

  check('the beam draws a ghost a dark layer would not',
    PV.ghostDrawAlpha(inBeam, 0, torch, OPEN_MAZE) === 1,
    PV.ghostDrawAlpha(inBeam, 0, torch, OPEN_MAZE));
  check('a ghost the beam misses is left to its layer',
    PV.ghostDrawAlpha(away, 0, torch, OPEN_MAZE) === 0,
    PV.ghostDrawAlpha(away, 0, torch, OPEN_MAZE));
  check('the layer wins wherever it is the brighter of the two',
    PV.ghostDrawAlpha(away, 0.35, torch, OPEN_MAZE) === 0.35,
    PV.ghostDrawAlpha(away, 0.35, torch, OPEN_MAZE));
  check('a wall between you and a ghost keeps it dark',
    PV.ghostDrawAlpha(inBeam, 0, torch,
      { isWall: function () { return true; } }) === 0);
  check('outside torch mode the layer is all there is',
    PV.ghostDrawAlpha(inBeam, 0.35, null, OPEN_MAZE) === 0.35,
    PV.ghostDrawAlpha(inBeam, 0.35, null, OPEN_MAZE));
})();

console.log('');
console.log(failures === 0 ? 'ALL TORCH CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
