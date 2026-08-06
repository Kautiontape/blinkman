# BLINK-MAN

A maze chase drawn one layer at a time.

Dots, ghosts, walls and you are four separate layers, and only one of them is
on screen. You choose which with a key press, then wait out a cooldown before
you can switch again. Everything else is black.

Most player-facing wording lives in `js/strings.js`, including `description`,
the plain line above that feeds the meta tag, and `splashes`, the pool of
Minecraft-style one-liners the menu picks from at random. Add to the pool
freely. A few strings stay in the markup because no JavaScript runs to fill
them or because they're attributes: the `<title>`, the `<noscript>` line, the
aria-labels and the button tooltips.

The name of the arcade game this descends from appears in this README and in
code comments, where it's the clearest way to explain a design decision, but
never in anything a player or a storefront sees.

![The board showing only the walls layer](docs/screenshot.png)

## Running it

Any static server works:

    python3 -m http.server 8000

Opening `index.html` directly works too. There's no build step and nothing to
install. High scores are the only thing a server buys you, since Chrome blocks
`localStorage` on `file://`.

Desktop and keyboard only. The board grows to fill the window.

## Controls

| | |
|---|---|
| Arrows or `WASD` | Move |
| `1` `2` `3` `4` or `H` `J` `K` `L` | Show dots / ghosts / walls / you |
| `P` `R` `M` `F` | Pause, restart, mute, fullscreen |
| `Esc` | Menu |

The badge on the right shows the layer you're on, ringed by its cooldown. Full
blue ring means you can switch. A shrinking red arc means wait.

## Modes

| | What you see | Cooldown |
|---|---|---|
| Easy | You and your last two picks | 1s |
| Normal | You and your last pick | 1s |
| Hard | One of four, and you can go dark | 3s |
| Blink | Nothing. A press flashes one layer, which fades over 2s. | 1s |

Death is the one exception to all of this. Get caught and the ghosts light up
for 0.6s before the death animation, with a red ring on whichever one got you,
so a death always has a visible cause.

A round opens the same way in every mode. The dots blink three times and then
obey the layer, ghosts leave the house one at a time over the first several
seconds, and a ghost inside the house is visible whatever the layer says,
fading out as it crosses the door.

## Mazes

Every level builds a new maze, so you can't coast on memory. It isn't a random
generator though. A fixed skeleton holds the parts that make it feel like
Pac-Man: the border, the tunnel row, the ghost house, the perimeter corridors
and the spine at column 6. Only the wall blocks between them change, drawn from
four top pieces and four bottom pieces. Sixteen combinations, mirrored left to
right like the original. The HUD shows which pair you got.

![Four of the sixteen mazes side by side](docs/mazes.png)

Mazes only change between levels, so dying never costs you pellet progress.

To add pieces, edit `TOP_PIECES` and `BOTTOM_PIECES` in `js/maze.js`. Three
rules apply, and the test enforces all three:

1. Everything must be reachable from Pac-Man's spawn.
2. No 2x2 block of open floor. Real Pac-Man mazes have none, and a two-wide
   corridor lets a ghost slide past you in the same passage. In practice a
   two-row band between fixed corridors can only hold vertical corridors, and
   corridor columns can't sit next to each other.
3. No dead-ends. Every open tile needs at least one walkable neighbour beyond
   the one it's reached from; the two tunnel mouths are the only exception.

    node test/maze-test.js
    node test/opening-test.js

One more guideline, not test-enforced: when closing a dead-end into a
corridor, leave at least 2 straight tiles before the next turn.

`PV.createMaze(seed)` is deterministic, so any maze can be reproduced from its
seed. At runtime a piece that leaves something unreachable gets logged and
falls back to the arcade layout rather than shipping a broken level. The
two-wide and dead-end checks are test-only, so run the test after editing pieces.

## Code

Plain scripts hanging off a `window.PV` global. No modules, no bundler, which
is what lets `file://` work.

    js/strings.js   every player-facing word
    js/maze.js      maze pieces, assembly, pellets, passability
    js/entities.js  grid movement, ghost targeting
    js/vision.js    the layer and cooldown state machine
    js/game.js      rounds, scoring, collisions, ghost release
    js/render.js    canvas drawing
    js/hud.js       score, badge, cooldown ring
    js/audio.js     synthesised sound, no audio files
    js/main.js      input, frame loop, layout

`maze.js` has to load before `entities.js`, `render.js` and `game.js`, which
read `PV.TILE` and the spawn table at load time. `main.js` has to load last.
Everything else in the script order is slack.

The game always draws into a fixed 560x620 space and a canvas transform maps
that onto whatever size the board actually is. Nothing in the game logic knows
the screen size, and the maze stays sharp instead of being a stretched bitmap.
`PV.game` is exposed for poking at state from the console.

Editing a file and seeing nothing change usually means the browser cached the
old one. Hard reload with Ctrl-Shift-R.

## Publishing

`docs/itch.md` covers the itch.io upload. `./tools/itch-package.sh` builds the
zip and `./tools/itch-deploy.sh` pushes it with butler.

## License

MIT. See `LICENSE`.

The licence covers this code, not the arcade game it takes after. If you build
on it, keep someone else's trademark out of anything a player or a storefront
sees, the way this does.

## Not done

- No bonus fruit, no attract mode.
- Ghosts do scatter/chase with the four classic personalities, but skip the
  arcade's speed tables and exact house dot counters.
- Collision is a radius check rather than the arcade's tile test, so it's a
  little more forgiving.
- The synthesised sound has never been checked on real speakers.
