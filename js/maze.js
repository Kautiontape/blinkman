/* maze.js — level geometry, pellets, passability.
 *
 * Mazes are assembled, not hard-coded: a fixed skeleton (border, tunnel row,
 * ghost house, perimeter and spine corridors) plus one hand-authored piece for
 * the top half and one for the bottom. Only the left 14 columns are authored;
 * each row is mirrored to 28, like the original.
 */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  var COLS = 28, ROWS = 31, TILE = 20;
  var TUNNEL_ROW = 14;

  // Layout legend:  # wall   . pellet   o power pellet   - house door   ' ' floor
  var BORDER = '##############';

  // Rows 9-19: ghost house, tunnel, and their flanking corridors.
  var MIDDLE = [
    '######.##### #',
    '######.##### #',
    '######.##     ',
    '######.## ###-',   // row 12 — the '-' pair mirrors into the house door
    '######.## #   ',
    '          #   ',   // row 14 — tunnel
    '######.## #   ',
    '######.## ####',
    '######.##     ',
    '######.## ####',
    '######.## ####'
  ];

  /* Rows 1-8. Every variant leaves rows 1, 5 and 8 plus columns 1 and 6 open.
   *
   * Authoring rules, enforced by test/maze-test.js: a two-row band (6-7) may
   * hold vertical corridors only — a horizontal one would sit flush against the
   * fixed corridor above or below and open a two-wide passage that lets ghosts
   * pass abreast. The three-row band (2-4) can afford one down its middle.
   * Corridor columns must never be adjacent. No open tile may dead-end; the
   * two tunnel mouths are the only exception. When closing a dead end into a
   * corridor, leave at least 2 straight tiles before the next turn — not
   * test-enforced, check by eye. */
  var TOP_PIECES = [
    { id: 'T1', rows: [                 // the original arcade layout
      '#............#',
      '#.####.#####.#',
      '#o####.#####.#',
      '#.####.#####.#',
      '#.............',
      '#.####.##.####',
      '#.####.##.####',
      '#......##....#'
    ]},
    { id: 'T2', rows: [
      '#............#',
      '#.#.##.###.#.#',
      '#o#.##.###.#.#',
      '#.#.##.###.#.#',
      '#.............',
      '#.####.##.#.##',
      '#.####.##.#.##',
      '#......##....#'
    ]},
    { id: 'T3', rows: [
      '#............#',
      '#.####.#####.#',
      '#o............',
      '#.####.#######',
      '#.............',
      '#.####.##.##.#',
      '#.####.##.##.#',
      '#......##....#'
    ]},
    { id: 'T4', rows: [
      '#............#',
      '#.##.#.##.##.#',
      '#o##.#.##.##.#',
      '#.##.#.##.##.#',
      '#.............',
      '#.##.#.###.###',
      '#.##.#.###.###',
      '#............#'
    ]}
  ];

  /* Rows 20-29. Rows 20, 23 (Pac-Man's shelf), 26 and 29 are fixed corridors;
   * all three bands between them are two rows tall, so vertical corridors only. */
  var BOTTOM_PIECES = [
    { id: 'B1', rows: [                 // the original arcade layout
      '#............#',
      '#.####.#####.#',
      '#.####.#####.#',
      '#o..##....... ',
      '###.##.##.####',
      '###.##.##.####',
      '#......##....#',
      '#.##########.#',
      '#.##########.#',
      '#.............'
    ]},
    { id: 'B2', rows: [
      '#............#',
      '#.#.##.###.#.#',
      '#.#.##.###.#.#',
      '#o..##....... ',
      '#.####.####.##',
      '#.####.####.##',
      '#......##....#',
      '#.#######.##.#',
      '#.#######.##.#',
      '#.............'
    ]},
    { id: 'B3', rows: [
      '#............#',
      '#.####.##.##.#',
      '#.####.##.##.#',
      '#o..##....... ',
      '#.#.#####.####',
      '#.#.#####.####',
      '#......##....#',
      '#.####.#####.#',
      '#.####.#####.#',
      '#.............'
    ]},
    { id: 'B4', rows: [
      '#.............',
      '#.#.##.####.##',
      '#.#.##.####.##',
      '#o..##....... ',
      '###.##.###.###',
      '###.##.###.###',
      '#............#',
      '#.#.######.#.#',
      '#.#.######.#.#',
      '#.............'
    ]}
  ];

  var SPAWN = {
    pacman:  { col: 13, row: 23 },
    door:    { col: 13, row: 12 },
    outside: { col: 13, row: 11 },
    blinky:  { col: 13, row: 11 },
    pinky:   { col: 13, row: 14 },
    inky:    { col: 11, row: 14 },
    clyde:   { col: 15, row: 14 }
  };

  var GHOST_NAMES = ['blinky', 'pinky', 'inky', 'clyde'];

  PV.TILE = TILE;
  PV.COLS = COLS;
  PV.ROWS = ROWS;
  PV.TUNNEL_ROW = TUNNEL_ROW;
  PV.SPAWN = SPAWN;
  PV.WIDTH = COLS * TILE;
  PV.HEIGHT = ROWS * TILE;
  PV.TOP_PIECES = TOP_PIECES;
  PV.BOTTOM_PIECES = BOTTOM_PIECES;

  PV.center = function (tile) { return tile * TILE + TILE / 2; };
  PV.tileOf = function (px) { return Math.floor(px / TILE); };

  // Deterministic PRNG so a maze can be reproduced from its seed.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function mirror(half) {
    return half + half.split('').reverse().join('');
  }

  // The sealed interior of the ghost house.
  function inGhostHouse(c, r) {
    return r >= 13 && r <= 15 && c >= 11 && c <= 16;
  }

  PV.assembleLayout = function (topPiece, bottomPiece) {
    return [BORDER]
      .concat(topPiece.rows)
      .concat(MIDDLE)
      .concat(bottomPiece.rows)
      .concat([BORDER])
      .map(mirror);
  };

  var NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /** Validate an assembled layout. Returns a list of problems; empty means ok. */
  PV.checkLayout = function (layout) {
    var problems = [];

    if (layout.length !== ROWS) problems.push('expected ' + ROWS + ' rows, got ' + layout.length);
    layout.forEach(function (row, i) {
      if (row.length !== COLS) problems.push('row ' + i + ' is ' + row.length + ' wide');
    });
    if (problems.length) return problems;

    function open(c, r) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      var ch = layout[r][c];
      return ch !== '#' && ch !== '-';
    }

    var start = SPAWN.pacman;
    if (!open(start.col, start.row)) return ['Pac-Man spawns inside a wall'];

    var seen = {};
    var queue = [[start.col, start.row]];
    seen[start.col + ',' + start.row] = true;

    while (queue.length) {
      var cur = queue.pop();
      for (var i = 0; i < NEIGHBOURS.length; i++) {
        var nc = cur[0] + NEIGHBOURS[i][0], nr = cur[1] + NEIGHBOURS[i][1];
        if (nr === TUNNEL_ROW) {                 // the tunnel joins the two edges
          if (nc < 0) nc = COLS - 1;
          else if (nc >= COLS) nc = 0;
        }
        if (!open(nc, nr)) continue;
        var key = nc + ',' + nr;
        if (seen[key]) continue;
        seen[key] = true;
        queue.push([nc, nr]);
      }
    }

    // Walkable tiles the fill missed make the level unwinnable; the house
    // interior is meant to be sealed off, so it is exempt.
    var strayFloor = 0, strayPellets = 0, power = 0, pellets = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var ch = layout[r][c];
        if (ch === 'o') power++;
        if (ch === 'o' || ch === '.') pellets++;
        if (!open(c, r) || seen[c + ',' + r] || inGhostHouse(c, r)) continue;
        if (ch === '.' || ch === 'o') strayPellets++; else strayFloor++;
      }
    }
    if (strayPellets) problems.push(strayPellets + ' unreachable pellet(s)');
    if (strayFloor) problems.push(strayFloor + ' unreachable floor tile(s)');
    if (power !== 4) problems.push('expected 4 power pellets, got ' + power);
    if (pellets < 150) problems.push('only ' + pellets + ' pellets — too sparse');

    GHOST_NAMES.forEach(function (n) {
      if (layout[SPAWN[n].row][SPAWN[n].col] === '#') problems.push(n + ' spawns inside a wall');
    });
    if (layout[SPAWN.door.row][SPAWN.door.col] !== '-') problems.push('house door missing');

    return problems;
  };

  var warned = {};   // so a bad piece complains once, not once per level

  /** Build a fresh, mutable level. The same seed always yields the same maze. */
  PV.createMaze = function (seed) {
    if (seed == null) seed = (Math.random() * 0xffffffff) >>> 0;
    var rand = mulberry32(seed);

    var top = TOP_PIECES[Math.floor(rand() * TOP_PIECES.length)];
    var bottom = BOTTOM_PIECES[Math.floor(rand() * BOTTOM_PIECES.length)];
    var layout = PV.assembleLayout(top, bottom);

    // test/maze-test.js covers every shipped combination; this is the net for
    // an edit that hasn't been run through it.
    var problems = PV.checkLayout(layout);
    if (problems.length) {
      var key = top.id + '/' + bottom.id;
      if (!warned[key]) {
        warned[key] = true;
        console.error('maze: layout ' + key + ' rejected (' + problems.join('; ') +
          ') — falling back to the classic layout. Run test/maze-test.js.');
      }
      top = TOP_PIECES[0];
      bottom = BOTTOM_PIECES[0];
      layout = PV.assembleLayout(top, bottom);
    }

    var walls = [], doors = [], pellets = [];
    var pelletsLeft = 0;

    for (var r = 0; r < ROWS; r++) {
      walls[r] = []; doors[r] = []; pellets[r] = [];
      for (var c = 0; c < COLS; c++) {
        var ch = layout[r][c];
        walls[r][c] = ch === '#';
        doors[r][c] = ch === '-';
        pellets[r][c] = ch === '.' ? 1 : (ch === 'o' ? 2 : 0);
        if (pellets[r][c]) pelletsLeft++;
      }
    }

    function isWall(c, r) {
      if (r < 0 || r >= ROWS) return true;
      if (c < 0 || c >= COLS) return r !== TUNNEL_ROW;   // the tunnel runs off both edges
      return walls[r][c];
    }

    function isDoor(c, r) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      return doors[r][c];
    }

    function pelletAt(c, r) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
      return pellets[r][c];
    }

    var maze = {
      cols: COLS, rows: ROWS, tile: TILE,
      walls: walls, doors: doors, pellets: pellets,
      totalPellets: pelletsLeft,
      seed: seed,
      recipe: top.id + '/' + bottom.id,

      get pelletsLeft() { return pelletsLeft; },

      isWall: isWall,
      isDoor: isDoor,
      pelletAt: pelletAt,

      /* throughDoor: whether the ghost-house door counts as floor. Every caller
       * passes false — ghosts cross the door only in the scripted 'leaving' and
       * 'entering' moves in entities.js, which ignore the maze entirely. */
      passable: function (c, r, throughDoor) {
        if (isWall(c, r)) return false;
        if (isDoor(c, r) && !throughDoor) return false;
        return true;
      },

      eatPellet: function (c, r) {
        var v = pelletAt(c, r);
        if (v) { pellets[r][c] = 0; pelletsLeft--; }
        return v;
      }
    };

    maze.edges = buildEdges(isWall);
    return maze;
  };

  // One segment per wall face that touches open space, precomputed so the
  // renderer can stroke the whole outline as a single path.
  function buildEdges(isWall) {
    var segs = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!isWall(c, r)) continue;
        var x = c * TILE, y = r * TILE;
        if (!isWall(c, r - 1)) segs.push([x, y, x + TILE, y]);
        if (!isWall(c, r + 1)) segs.push([x, y + TILE, x + TILE, y + TILE]);
        if (!isWall(c - 1, r)) segs.push([x, y, x, y + TILE]);
        if (!isWall(c + 1, r)) segs.push([x + TILE, y, x + TILE, y + TILE]);
      }
    }
    return segs;
  }

})(window.PV);
