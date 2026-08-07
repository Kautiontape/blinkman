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

  // Rows 9-19: ghost house, tunnel, and their flanking corridors.
  var MIDDLE_FULL = [
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

  /* Rows 8-14 of the small board. The house is the full 8x5 block with a 6x3
   * interior at every size; what shrinks is the playfield beside it. The band's
   * top and bottom rows double as the maze's horizontal corridors rather than
   * being a dedicated moat, which is what makes a full house fit. */
  var MIDDLE_SMALL = [
    '#....     ',
    '#.### ###-',
    '#.### #   ',
    '      #   ',   // tunnel
    '#.### #   ',
    '#.### ####',
    '#....     '
  ];

  // Rows 9-15 of the mid board.
  var MIDDLE_MID = [
    '#.....     ',
    '#.##.# ###-',
    '#.##.# #   ',
    '       #   ',   // tunnel
    '#.##.# #   ',
    '#.##.# ####',
    '#.....     '
  ];

  // Rows 10-16 of the large board.
  var MIDDLE_LARGE = [
    '#.....      ',
    '#.###.# ###-',
    '#.###.# #   ',
    '        #   ',   // tunnel
    '#.###.# #   ',
    '#.###.# ####',
    '#.....      '
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

  /* The level 1 map. Deliberately the same every game — it is the one board a
   * new player can build a mental model of, which is what makes a game about
   * not being able to see learnable at all. */
  var SMALL_FIXED_TOP = { id: 'S1', rows: [
    '#........#',
    '#.######.#',
    '#o######.#',
    '#........ ',
    '#.####.###',
    '#.####.###',
    '#.####.###'
  ]};

  var SMALL_FIXED_BOTTOM = { id: 'S1', rows: [
    '#.####.###',
    '#.####.###',
    '#o....... ',
    '#.######.#',
    '#.######.#',
    '#.######.#',
    '#........#'
  ]};

  /* Level 2. Big wall blocks and long runs — the gentlest maze the game deals. */
  var MID_GENTLE_TOP = [
    { id: 'GT1', rows: [
      '#..........',
      '#.####.####',
      '#o####.####',
      '#.####.####',
      '#..........',
      '#.######.##',
      '#.######.##',
      '#.######.##'
    ]},
    { id: 'GT2', rows: [
      '#..........',
      '#.######.##',
      '#o######.##',
      '#.######.##',
      '#..........',
      '#.###.#####',
      '#.###.#####',
      '#.###.#####'
    ]},
    { id: 'GT3', rows: [
      '#..........',
      '#.#####.###',
      '#o#####.###',
      '#.#####.###',
      '#....##....',
      '#.##.######',
      '#....######',
      '#.##.######'
    ]},
    { id: 'GT4', rows: [
      '#..........',
      '#.##.##.###',
      '#o##.##.###',
      '#.##.##.###',
      '#....##....',
      '#.#####.###',
      '#.#####.###',
      '#.#####.###'
    ]}
  ];

  var MID_GENTLE_BOTTOM = [
    { id: 'GB1', rows: [
      '#.####.####',
      '#.####.####',
      '#.####.####',
      '#o........ ',
      '#.##.##.###',
      '#.##.##.###',
      '#.##.##.###',
      '#....##....'
    ]},
    { id: 'GB2', rows: [
      '#.###.##.##',
      '#.###.##.##',
      '#.###.##.##',
      '#o###..... ',
      '#.####.####',
      '#.####.####',
      '#.####.####',
      '#..........'
    ]},
    { id: 'GB3', rows: [
      '#.#####.###',
      '#.#####.###',
      '#.#####.###',
      '#o...##... ',
      '#.##.##.###',
      '#.##.##.###',
      '#.##.##.###',
      '#....##....'
    ]},
    { id: 'GB4', rows: [
      '#.######.##',
      '#.######.##',
      '#.######.##',
      '#o...##... ',
      '#.##.##.###',
      '#.##.##.###',
      '#.##.##.###',
      '#..........'
    ]}
  ];

  /* Level 3. Thinner corridors break up the blocks — a step past gentle, still
   * short of the arcade. */
  var LARGE_MEDIUM_TOP = [
    { id: 'MT1', rows: [
      '#..........#',
      '#.###.####.#',
      '#o###..###.#',
      '#.####.###.#',
      '#...........',
      '#.####.###.#',
      '#.###..###.#',
      '#.###.####.#',
      '#.###.####.#'
    ]},
    { id: 'MT2', rows: [
      '#..........#',
      '#.###.####.#',
      '#o....####.#',
      '#.###.####.#',
      '#..........#',
      '#.###.####.#',
      '#.###.###..#',
      '#.###.###.##',
      '#.###.###.##'
    ]},
    { id: 'MT3', rows: [
      '#..........#',
      '#.###.####.#',
      '#o###.####.#',
      '#.###.####.#',
      '#..........#',
      '#.##.###.#.#',
      '#.##.###.#.#',
      '#.##.###.#.#',
      '#.##.###.#.#'
    ]},
    { id: 'MT4', rows: [
      '#..........#',
      '#.##.##.##.#',
      '#o##.##.##.#',
      '#.##.##.##.#',
      '#..........#',
      '#.####.###.#',
      '#.####.###.#',
      '#.####.###.#',
      '#.####.###.#'
    ]}
  ];

  var LARGE_MEDIUM_BOTTOM = [
    { id: 'MB1', rows: [
      '#.###.####.#',
      '#.###.####.#',
      '#.###.####.#',
      '#o###...... ',
      '#.####.###.#',
      '#......###.#',
      '#.####.###.#',
      '#.####.###.#',
      '#..........#'
    ]},
    { id: 'MB2', rows: [
      '#.###.####.#',
      '#.###.####.#',
      '#.###.####.#',
      '#o###...... ',
      '#.#####.##.#',
      '#.#####.##.#',
      '#.####..##.#',
      '#.####.###.#',
      '#..........#'
    ]},
    { id: 'MB3', rows: [
      '#.###.####.#',
      '#.###.####.#',
      '#.###.####.#',
      '#o###...... ',
      '#.####.##.##',
      '#.####.##.##',
      '#.####.##.##',
      '#.####.##.##',
      '#.........##'
    ]},
    { id: 'MB4', rows: [
      '#.###.####.#',
      '#.###..###.#',
      '#.####.###.#',
      '#o####..... ',
      '#.####.###.#',
      '#.####.###.#',
      '#.###..###.#',
      '#.###.####.#',
      '#..........#'
    ]}
  ];

  /* Levels 7-8. The arcade board cut finer: more junctions and more dots than
   * the classic pool on the same 28x31. */
  var FULL_DENSE_TOP = [
    { id: 'DT1', rows: [
      '#......###...#',
      '#.##.#.###.#.#',
      '#o##.#..##.#.#',
      '#.##.##.##.#.#',
      '#.......#.....',
      '#.##.#.##.#.##',
      '#.##.#.##.#.##',
      '#......##....#'
    ]},
    { id: 'DT2', rows: [
      '#............#',
      '#.##.##.##.#.#',
      '#o.#.##.#..#.#',
      '##.#.##.#.##.#',
      '#.....#...##..',
      '#.###.###.##.#',
      '#.###.###.##.#',
      '#......##....#'
    ]},
    { id: 'DT3', rows: [
      '#............#',
      '#.###.##.###.#',
      '#o.##.##.##..#',
      '##.##.##.##.##',
      '#..#...#..#...',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#......##....#'
    ]},
    { id: 'DT4', rows: [
      '#............#',
      '#.##.####.##.#',
      '#o##......##.#',
      '#.###.##.###.#',
      '#.##..........',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#......##....#'
    ]}
  ];

  var FULL_DENSE_BOTTOM = [
    { id: 'DB1', rows: [
      '#......##....#',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#o.....##.... ',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#..#....#..#.#',
      '##.##.#.##.#.#',
      '##.##.#.##.#.#',
      '##............'
    ]},
    { id: 'DB2', rows: [
      '#.......#....#',
      '#.##.##.##.#.#',
      '#.##.##.##.#.#',
      '#o...##...... ',
      '#.##.##.##.#.#',
      '#.##.##.##.#.#',
      '#....##......#',
      '#.##.##.##.###',
      '#.##.##.##.###',
      '#.............'
    ]},
    { id: 'DB3', rows: [
      '#......##....#',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#o...#....##. ',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#..#...#..##.#',
      '##.##.##.###.#',
      '##.##.##.###.#',
      '##............'
    ]},
    { id: 'DB4', rows: [
      '#......#.....#',
      '#.###.##.###.#',
      '#.###.##.###.#',
      '#o.##....##.. ',
      '##.##.##.##.##',
      '##.##.##.##.##',
      '#.....##.....#',
      '#.###.##.###.#',
      '#.###.##.###.#',
      '#.............'
    ]}
  ];

  /* Level 9 and up. The last pool — every level from here draws from it. */
  var FULL_DENSEST_TOP = [
    { id: 'XT1', rows: [
      '#............#',
      '#.#.#.#.##.#.#',
      '#.....#.......',
      '#.###.###.##.#',
      '#o.....##....#',
      '#.##.#.##.##.#',
      '#.##.#.##.##.#',
      '#......##....#'
    ]},
    { id: 'XT2', rows: [
      '#...........##',
      '#.#.##.####.##',
      '#...#.....#...',
      '#####.###.##.#',
      '#o......#....#',
      '#.##.##.#.#.##',
      '#....#....#...',
      '######.#####.#'
    ]},
    { id: 'XT3', rows: [
      '#............#',
      '#.#.#.##.#.#.#',
      '#.#.#.##.#.#.#',
      '#...#....#....',
      '#o###.#####.##',
      '#.....#...#..#',
      '#.##.##.#.##.#',
      '#.......#....#'
    ]},
    { id: 'XT4', rows: [
      '#............#',
      '#.#.#.##.#.#.#',
      '#......#.....#',
      '##.###.#.###.#',
      '#o.....#.###.#',
      '#.#.#.##.###.#',
      '#......#.....#',
      '######.#####.#'
    ]}
  ];

  var FULL_DENSEST_BOTTOM = [
    { id: 'XB1', rows: [
      '#............#',
      '#.####.##.##.#',
      '#o####.##.##.#',
      '#...#......   ',
      '###.#.##.##.##',
      '#.....#...#..#',
      '#.#####.#.##.#',
      '#.......#....#',
      '#.##.#.###.###',
      '#.............'
    ]},
    { id: 'XB2', rows: [
      '######.##.####',
      '#...........##',
      '#.####.##.#.##',
      '#o.........   ',
      '##.###.##.#.##',
      '#......#.....#',
      '#.#.#.##.###.#',
      '#......#.###.#',
      '#.#.##.#.###.#',
      '#......#.....#'
    ]},
    { id: 'XB3', rows: [
      '#...........##',
      '#.####.#.##.##',
      '#.####.#.##.##',
      '#o.........   ',
      '##.#.#.###.###',
      '#.......#....#',
      '#.#####.#.##.#',
      '#...#...#....#',
      '#.#.#.######.#',
      '#............#'
    ]},
    { id: 'XB4', rows: [
      '######.##.####',
      '#............#',
      '#.##.#.##.##.#',
      '#o.........   ',
      '#####.##.##.##',
      '#...#....#...#',
      '#.#.######.#.#',
      '#.....##.....#',
      '#.###.##.###.#',
      '#.............'
    ]}
  ];

  /* A board template is the shape a pair of pieces drops into: dimensions, the
   * tunnel row, the fixed middle band, the ghost-house block, and where the
   * seven actors start. `house` is the block including its walls; the sealed
   * interior is that shrunk by one on every side.
   *
   * Scatter corners are derived from the board rather than stored — see
   * PV.scatterCorners below. */
  var BOARDS = {
    small: {
      id: 'small',
      cols: 20, rows: 23, tunnelRow: 11,
      middle: MIDDLE_SMALL,
      topRows: 7, bottomRows: 7,
      house: { c0: 6, c1: 13, r0: 9, r1: 13 },
      minPellets: 110,
      tiers: { fixed: { top: [SMALL_FIXED_TOP], bottom: [SMALL_FIXED_BOTTOM] } },
      spawn: {
        pacman:  { col: 9, row: 17 },
        door:    { col: 9, row: 9 },
        outside: { col: 9, row: 8 },
        blinky:  { col: 9, row: 10 },
        pinky:   { col: 9, row: 11 },
        inky:    { col: 7, row: 11 },
        clyde:   { col: 11, row: 11 }
      }
    },
    mid: {
      id: 'mid',
      cols: 22, rows: 25, tunnelRow: 12,
      middle: MIDDLE_MID,
      topRows: 8, bottomRows: 8,
      house: { c0: 7, c1: 14, r0: 10, r1: 14 },
      minPellets: 130,
      tiers: { gentle: { top: MID_GENTLE_TOP, bottom: MID_GENTLE_BOTTOM } },
      spawn: {
        pacman:  { col: 10, row: 19 },
        door:    { col: 10, row: 10 },
        outside: { col: 10, row: 9 },
        blinky:  { col: 10, row: 11 },
        pinky:   { col: 10, row: 12 },
        inky:    { col: 8, row: 12 },
        clyde:   { col: 12, row: 12 }
      }
    },
    large: {
      id: 'large',
      cols: 24, rows: 27, tunnelRow: 13,
      middle: MIDDLE_LARGE,
      topRows: 9, bottomRows: 9,
      house: { c0: 8, c1: 15, r0: 11, r1: 15 },
      minPellets: 160,
      tiers: { medium: { top: LARGE_MEDIUM_TOP, bottom: LARGE_MEDIUM_BOTTOM } },
      spawn: {
        pacman:  { col: 11, row: 20 },
        door:    { col: 11, row: 11 },
        outside: { col: 11, row: 10 },
        blinky:  { col: 11, row: 12 },
        pinky:   { col: 11, row: 13 },
        inky:    { col: 9, row: 13 },
        clyde:   { col: 13, row: 13 }
      }
    },
    full: {
      id: 'full',
      cols: 28, rows: 31, tunnelRow: 14,
      middle: MIDDLE_FULL,
      topRows: 8, bottomRows: 10,
      house: { c0: 10, c1: 17, r0: 12, r1: 16 },
      minPellets: 230,
      tiers: {
        fixed:   { top: [TOP_PIECES[0]], bottom: [BOTTOM_PIECES[0]] },
        classic: { top: TOP_PIECES,       bottom: BOTTOM_PIECES },
        dense:   { top: FULL_DENSE_TOP,   bottom: FULL_DENSE_BOTTOM },
        densest: { top: FULL_DENSEST_TOP, bottom: FULL_DENSEST_BOTTOM }
      },
      spawn: {
        pacman:  { col: 13, row: 23 },
        door:    { col: 13, row: 12 },
        outside: { col: 13, row: 11 },
        blinky:  { col: 13, row: 13 },
        pinky:   { col: 13, row: 14 },
        inky:    { col: 11, row: 14 },
        clyde:   { col: 15, row: 14 }
      }
    }
  };

  PV.BOARDS = BOARDS;

  /* The four corners a ghost retreats to in scatter, as offsets from the board
   * rather than fixed tiles, so they land inside every template. The two-in
   * inset on the top pair is the arcade's. */
  PV.scatterCorners = function (board) {
    return {
      blinky: { col: board.cols - 3, row: 0 },
      pinky:  { col: 2,              row: 0 },
      inky:   { col: board.cols - 1, row: board.rows - 1 },
      clyde:  { col: 0,              row: board.rows - 1 }
    };
  };

  var GHOST_NAMES = ['blinky', 'pinky', 'inky', 'clyde'];

  PV.TILE = TILE;

  /* The full board's shape, for callers that read it from the module rather
   * than from the maze they were handed. */
  PV.COLS = COLS;
  PV.ROWS = ROWS;
  PV.TUNNEL_ROW = TUNNEL_ROW;
  PV.SPAWN = BOARDS.full.spawn;
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

  // The sealed interior of the ghost house: the block minus its walls.
  function inGhostHouse(board, c, r) {
    var h = board.house;
    return r > h.r0 && r < h.r1 && c > h.c0 && c < h.c1;
  }

  PV.assembleLayout = function (board, topPiece, bottomPiece) {
    var border = new Array(board.cols / 2 + 1).join('#');
    return [border]
      .concat(topPiece.rows)
      .concat(board.middle)
      .concat(bottomPiece.rows)
      .concat([border])
      .map(mirror);
  };

  var NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /** Validate an assembled layout. Returns a list of problems; empty means ok. */
  PV.checkLayout = function (board, layout) {
    var problems = [];

    if (layout.length !== board.rows) {
      problems.push('expected ' + board.rows + ' rows, got ' + layout.length);
    }
    layout.forEach(function (row, i) {
      if (row.length !== board.cols) problems.push('row ' + i + ' is ' + row.length + ' wide');
    });
    if (problems.length) return problems;

    function open(c, r) {
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
      var ch = layout[r][c];
      return ch !== '#' && ch !== '-';
    }

    var start = board.spawn.pacman;
    if (!open(start.col, start.row)) return ['Pac-Man spawns inside a wall'];

    var seen = {};
    var queue = [[start.col, start.row]];
    seen[start.col + ',' + start.row] = true;

    while (queue.length) {
      var cur = queue.pop();
      for (var i = 0; i < NEIGHBOURS.length; i++) {
        var nc = cur[0] + NEIGHBOURS[i][0], nr = cur[1] + NEIGHBOURS[i][1];
        if (nr === board.tunnelRow) {             // the tunnel joins the two edges
          if (nc < 0) nc = board.cols - 1;
          else if (nc >= board.cols) nc = 0;
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
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        var ch = layout[r][c];
        if (ch === 'o') power++;
        if (ch === 'o' || ch === '.') pellets++;
        if (!open(c, r) || seen[c + ',' + r] || inGhostHouse(board, c, r)) continue;
        if (ch === '.' || ch === 'o') strayPellets++; else strayFloor++;
      }
    }
    if (strayPellets) problems.push(strayPellets + ' unreachable pellet(s)');
    if (strayFloor) problems.push(strayFloor + ' unreachable floor tile(s)');
    if (power !== 4) problems.push('expected 4 power pellets, got ' + power);
    if (pellets < board.minPellets) {
      problems.push('only ' + pellets + ' pellets — below this board\'s floor of ' + board.minPellets);
    }

    GHOST_NAMES.forEach(function (n) {
      var s = board.spawn[n];
      if (layout[s.row][s.col] === '#') problems.push(n + ' spawns inside a wall');
    });
    var door = board.spawn.door;
    if (layout[door.row][door.col] !== '-') problems.push('house door missing');

    return problems;
  };

  /* How cut-up a layout is. Junctions are tiles with three or more walkable
   * neighbours, corners are two-neighbour tiles where the two do not face each
   * other. Their sum is the score the tier bands are drawn against; the house
   * interior is excluded because it is the same at every size. */
  PV.scoreLayout = function (board, layout) {
    var junctions = 0, corners = 0, pellets = 0;

    /* The tunnel row wraps, so a mouth reads as the straight corridor it is
     * rather than as a corner. Wrapping here covers both the neighbour count
     * and the facing test below. */
    function isOpen(c, r) {
      if (r === board.tunnelRow) {
        if (c < 0) c = board.cols - 1;
        else if (c >= board.cols) c = 0;
      }
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
      var ch = layout[r][c];
      return ch !== '#' && ch !== '-';
    }

    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        var ch = layout[r][c];
        if (ch === '.' || ch === 'o') pellets++;
        if (!isOpen(c, r) || inGhostHouse(board, c, r)) continue;

        var u = isOpen(c, r - 1), d = isOpen(c, r + 1);
        var l = isOpen(c - 1, r), rt = isOpen(c + 1, r);
        var deg = (u ? 1 : 0) + (d ? 1 : 0) + (l ? 1 : 0) + (rt ? 1 : 0);

        if (deg >= 3) junctions++;
        else if (deg === 2 && !((u && d) || (l && rt))) corners++;
      }
    }
    return { junctions: junctions, corners: corners, score: junctions + corners,
             pellets: pellets };
  };

  var warned = {};   // so a bad piece complains once, not once per level

  /** Build a fresh, mutable level. The same seed always yields the same maze. */
  PV.createMaze = function (seed) {
    if (seed == null) seed = (Math.random() * 0xffffffff) >>> 0;
    var rand = mulberry32(seed);
    var board = BOARDS.full;

    var top = TOP_PIECES[Math.floor(rand() * TOP_PIECES.length)];
    var bottom = BOTTOM_PIECES[Math.floor(rand() * BOTTOM_PIECES.length)];
    var layout = PV.assembleLayout(board, top, bottom);

    // test/maze-test.js covers every shipped combination; this is the net for
    // an edit that hasn't been run through it.
    var problems = PV.checkLayout(board, layout);
    if (problems.length) {
      var key = board.id + ' ' + top.id + '/' + bottom.id;
      if (!warned[key]) {
        warned[key] = true;
        console.error('maze: layout ' + key + ' rejected (' + problems.join('; ') +
          ') — falling back to the classic layout. Run test/maze-test.js.');
      }
      top = TOP_PIECES[0];
      bottom = BOTTOM_PIECES[0];
      layout = PV.assembleLayout(board, top, bottom);
    }

    return buildMaze(board, layout, seed, top.id + '/' + bottom.id);
  };

  // Turn a validated layout into the mutable level the game plays on.
  function buildMaze(board, layout, seed, recipe) {
    var walls = [], doors = [], pellets = [];
    var pelletsLeft = 0;

    for (var r = 0; r < board.rows; r++) {
      walls[r] = []; doors[r] = []; pellets[r] = [];
      for (var c = 0; c < board.cols; c++) {
        var ch = layout[r][c];
        walls[r][c] = ch === '#';
        doors[r][c] = ch === '-';
        pellets[r][c] = ch === '.' ? 1 : (ch === 'o' ? 2 : 0);
        if (pellets[r][c]) pelletsLeft++;
      }
    }

    function isWall(c, r) {
      if (r < 0 || r >= board.rows) return true;
      // the tunnel runs off both edges
      if (c < 0 || c >= board.cols) return r !== board.tunnelRow;
      return walls[r][c];
    }

    function isDoor(c, r) {
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
      return doors[r][c];
    }

    function pelletAt(c, r) {
      if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return 0;
      return pellets[r][c];
    }

    var maze = {
      board: board.id,
      cols: board.cols, rows: board.rows, tile: TILE,
      width: board.cols * TILE, height: board.rows * TILE,
      tunnelRow: board.tunnelRow,
      spawn: board.spawn,
      scatter: PV.scatterCorners(board),
      house: board.house,
      walls: walls, doors: doors, pellets: pellets,
      totalPellets: pelletsLeft,
      seed: seed,
      recipe: recipe,

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

    maze.edges = buildEdges(board, isWall);
    return maze;
  }

  // One segment per wall face that touches open space, precomputed so the
  // renderer can stroke the whole outline as a single path.
  function buildEdges(board, isWall) {
    var segs = [];
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
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
