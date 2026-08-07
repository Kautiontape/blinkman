# Maps: a board that grows with the level

## Problem

Level 1 is as hard as level 12. Every level assembles a maze from the same
pool — four top pieces, four bottom pieces, sixteen combinations on one fixed
28x31 board — and `PV.createMaze()` picks from it with a random seed that knows
nothing about the level. A first-time player can draw `T2/B2` and spend their
first three lives on the busiest maze the game ships.

Piece choice cannot fix this. Measured across all sixteen combinations:

| | pellets | junctions | corners | open tiles |
|---|---|---|---|---|
| `T1/B1` (arcade) | 242 | 48 | 34 | 318 |
| `T1/B4` | 260 | 62 | 26 | 336 |
| `T2/B2` (busiest) | 270 | 72 | 30 | 346 |

242 to 282 pellets across the whole set — a 16% spread, which is noise rather
than a difficulty curve. The floor is structural: the fixed skeleton (border,
spine at column 6, perimeter corridors, ghost house) guarantees roughly 318
open tiles on a 28x31 board whatever pieces drop into it. There is no arrangement
of wall blocks that makes a 28x31 board a gentle first level.

The board itself is the difficulty. A player is memorising 242 dots across 318
tiles while unable to see more than one layer at a time.

## Goal

The board grows with the level. Level 1 is a small, open, hand-tuned map that a
new player can build a mental model of. Level 4 is the arcade map at full size,
a landmark. Past that, complexity ramps within 28x31.

Two properties carry the ramp, and they are separable: **size** (how many dots,
how long a level lasts, how much there is to hold in your head) and **density**
(junctions and corners per tile — the cuts and divets). Size does the work up
to level 4 and is then fixed; density takes over.

## The ladder

| Level | Board | Dots | Pieces |
|---|---|---|---|
| 1 | 20x23 | ~130 | one fixed hand-tuned map |
| 2 | 22x25 | ~155 | 4 top x 4 bottom, gentle tier |
| 3 | 24x27 | ~185 | 4 top x 4 bottom, medium tier |
| 4 | 28x31 | 242 | `T1`/`B1`, the arcade map, fixed |
| 5-6 | 28x31 | 242-282 | the existing sixteen combinations |
| 7-8 | 28x31 | — | dense tier, new pieces |
| 9+ | 28x31 | — | densest tier, new pieces, repeats |

The dimensions are chosen so the board's aspect ratio barely moves — 0.870,
0.880, 0.889, 0.903. The stage keeps its proportions and only changes scale, so
growth reads as a zoom rather than a reshaping. Rows budget as
`1 border + N top + 7 middle + N bottom + 1 border` at every small size, and
stay at the arcade's `1 + 8 + 11 + 10 + 1` at full size.

Levels 1 and 4 are the same map every game. That is the point of them: level 1
is an on-ramp a player can learn, and level 4 is a landmark they can recognise.
Every other level draws from its tier.

## The ghost house does not shrink

The house is the full 8x5 block with a 6x3 interior at every board size, so all
four ghosts still start abreast and the opening house-reveal cue works
unchanged. One house geometry, one spawn-offset rule, no per-tier variants.

The concern is footprint. On 28x31 the block is 4.6% of the board; on 20x23 it
is 8.7%. And the block understates it — in the arcade the house sits inside a
one-tile moat corridor (columns 9-18, rows 11-17), so the apparatus is really
10x7, which is 8.1% of the full board and 15.2% of a small one.

Small boards buy that back by making the moat's top and bottom rows double as
the band's main horizontal corridors rather than dedicated buffer. This 20x21 board
proves the skeleton — two rows tighter than the ladder's level 1, so the
ladder has room to spare:

```
####################        pellets     120
#........##........#        open tiles  164
#.######.##.######.#        junctions    28
#o######.##.######o#        corners      10
#........~~........#
#.####.######.####.#        2x2 blocks     none
#.####.######.####.#        dead ends      none
#....~~~~~~~~~~....#        unreachable    none
#.###~###--###~###.#
#.###~#~~~~~~#~###.#        power pellets  4
~~~~~~#~~~~~~#~~~~~~
#.###~#~~~~~~#~###.#
#.###~########~###.#
#....~~~~~~~~~~....#
#.####.######.####.#
#.####.######.####.#
#o.......~~.......o#
#.######.##.######.#
#.######.##.######.#
#........##........#
####################
```

The cost is that the house band leaves only four to six authorable columns per
side on a small board, so the middle band is fixed per template. All variety at
levels 2 and 3 comes from the top and bottom pieces. This matches how the full
board already works — `MIDDLE` in `js/maze.js` is a constant.

## Board templates

`js/maze.js` gains a board template: the shape that a pair of pieces drops into.

```
{ cols, rows, tunnelRow, middle, house, spawn, tiers }
```

Four templates. `house` carries the block bounds and `spawn` the seven entity
positions, both derived from the board's centre rather than hardcoded. `tiers`
names which piece pools this template serves.

`PV.createMaze(level, seed)` replaces `PV.createMaze(seed)`: the level picks the
template and the tier, the seed picks the pieces within it. It stays
deterministic — the same level and seed always yield the same maze.

## What stops being a load-time constant

`PV.TILE` stays 20. The design space becomes `cols * 20` by `rows * 20`, and
`main.js` already fits that to the window with
`Math.min(availW / PV.WIDTH, availH / PV.HEIGHT)`. A 400x460 board fits where a
560x620 board fits, so a level-1 tile draws about 40% larger on screen. Nothing
scrolls and nothing crops; the board occupies the same physical space and the
tiles resize. A game about not being able to see gets its most generous view on
its first level for free.

These move from `PV` onto the maze object:

- `PV.COLS`, `PV.ROWS`, `PV.WIDTH`, `PV.HEIGHT` → `maze.cols`, `maze.rows`,
  `maze.width`, `maze.height`
- `PV.SPAWN` → `maze.spawn`

Consumers that currently read them once at load and must read them per maze:

- `js/main.js:41-53` — `layout()` runs on level change as well as on resize
- `js/render.js:7` (`var TILE = PV.TILE`), `:165`, `:167` (the transform and the
  clear rect), `:415` (the torch's vector to board centre)
- `js/attract.js:8` (`var COLS = PV.COLS, ROWS = PV.ROWS`)
- `js/entities.js` and `js/game.js` — `PV.SPAWN` lookups

## Authoring the pieces

Four new tiers need four top and four bottom pieces each — 32 pieces. The
existing four and four serve levels 5-6 unchanged. One new fixed map, for level
1; level 4's already ships as `T1`/`B1`.

Pieces are written by parallel agents, one per tier, each given its board
template and a target band. The score is `junctions + corners`, measured over
the assembled layout excluding the house interior. The existing pool spans 82
(`T1/B1`) to 102 (`T2/B2`) and anchors the middle of the scale:

| Tier | Band |
|---|---|
| gentle (L2) | 45-60 |
| medium (L3) | 65-80 |
| existing (L5-6) | 82-102 |
| dense (L7-8) | 105-125 |
| densest (L9+) | 125+ |

Agents do not self-assess. Every returned piece runs through the validator, and
anything failing reachability, the no-2x2 rule, the no-dead-ends rule, or its
score band goes back to the agent that wrote it. A fan-out that trusts its own
output produces plausible-looking broken mazes.

The three authoring rules are unchanged from the README, and apply at every
board size:

1. Everything reachable from Pac-Man's spawn.
2. No 2x2 block of open floor.
3. No dead ends, the two tunnel mouths excepted.

## Testing

`test/maze-test.js` generalises over board templates instead of closing over
`PV.ROWS`, `PV.COLS` and the hardcoded house bounds in `wideSpots`. Same three
rules, run against every template's full combination set.

A new `test/progression-test.js` asserts the ramp ramps:

- dots and score both strictly increase across tiers
- level 1 resolves to the fixed small map, level 4 to `T1`/`B1`
- `PV.createMaze(level, seed)` is deterministic for a given pair
- every template's spawn positions land on open floor, and its door on a `-`

## Risks

**Torch scales with tiles, not with the board.** Its cone and radius are in tile
units, so a 6-tile cone covers proportionally about 40% more of a 20x23 board
than a 28x31 one. That helps level 1, but it means Torch's difficulty climbs
with board size on top of the maze getting denser — a steeper curve than Stare
or Flash. Ship it tile-based and watch it; tying the cone to the board diagonal
is the fix if it reads wrong.

**No prior art.** Ms. Pac-Man varies topology across four mazes at a constant
28x31. Jr. Pac-Man varies maze size but pays for it with a scrolling viewport,
and is remembered as the punishing one largely because of it. A fixed viewport
with a variable tile count and resizing tiles is not something a popular
Pac-Man descendant does. It follows from this game's own premise rather than
from the pedigree.

**Re-learning the scale.** A board that resizes every level resets any feel for
distance and timing. This is acceptable here because the maze already changes
every level, so there is no distance memory to protect.

## README

The maze section describes the ladder and the two fixed levels. The line
"Every level builds a new maze" becomes "Every level after level 1", which is
close enough and shorter than the truth.
