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

Three ways of seeing, each with three difficulties. The mode decides what a
press does; the difficulty decides how much it gives you.

| | What a press does |
|---|---|
| Stare | Lights one layer, and it stays lit until you pick another. |
| Torch | A lit circle travels with you, and on Easy and Normal a forward cone too, both stopping at walls. A press pings one layer outward from where you stood, through walls. |
| Flash | The board is black. A press flashes one layer, which then fades. |

| | Easy | Normal | Hard |
|---|---|---|---|
| Stare | Your last two picks, 1s | Your last pick, 1s | One of four and you can go dark, 3s |
| Torch | A wide cone, and pings that follow, 1s | A 6-tile cone, 1s | No cone, just the light you stand in, 2s |
| Flash | You stay lit, a 3.5s fade, 1s | A 2s fade, 1s | A 1s fade, 2s |

Your own layer is free in every cell except Stare Hard, Flash Normal and Flash
Hard, which is what makes those three the ones where you can lose yourself.

Death is the one exception to all of this. Get caught and the ghosts light up
for 0.6s before the death animation, with a red ring on whichever one got you,
so a death always has a visible cause.

A power pellet lights the board's edge white, breathing while it lasts and
blinking faster as it runs out, then closing on one yellow pulse. A life lost
turns the same edge red.

The menu runs a demo behind it: a Stare Normal round on autopilot, with the lit
layer rotating every four seconds. `prefers-reduced-motion` turns it off.

A round opens the same way in every mode. The dots blink three times and then
obey the layer, and all four ghosts start in the house and file out one at a
time over the first several seconds. Pac-Man starts Blinky outside the house;
keeping all four in makes the count readable, which matters more here than the
pedigree. The round holds on READY until you move, with the maze up dimly in
every mode — the one chance to study it.

Five seconds into a round, a player who hasn't pressed a number key gets a line
low on the board naming the ones that mode answers to — `Press 1/2/3 to scan`
in Torch, `Press 1/2/3/4 to flash` in Flash. Flash Easy is the exception at
`Press 1/2/3`, since it draws you always and never spends a flash on you. It
fades after ten seconds and returns each round until a pick is made, then stays
gone for the rest of the game.

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
    js/changelog.js the release notes, and the modal's markup
    js/maze.js      maze pieces, assembly, pellets, passability
    js/entities.js  grid movement, ghost targeting
    js/vision.js    the layer and cooldown state machine
    js/game.js      rounds, scoring, collisions, ghost release
    js/attract.js   the autopilot demo behind the menu
    js/render.js    canvas drawing
    js/aura.js      board-edge glow for fright, its end, life lost
    js/hud.js       score, badge, cooldown ring, the layer nudge
    js/menu.js      the mode and difficulty picker on the title screen
    js/audio.js     synthesised sound, no audio files
    js/main.js      input, frame loop, layout

`maze.js` has to load before `vision.js`, `entities.js`, `render.js` and
`game.js`, which read `PV.TILE`, the board size and the spawn table at load
time. `attract.js` reads `PV.DIRS` and the grid size, so it comes after
`entities.js` too. `aura.js` reads `PV.wantsCalm`, so it comes after
`render.js`, which defines it. `main.js` has to load last. Everything else in
the script order is slack.

Ten test suites, eight node and two bash, none of them needing anything
installed. The second covers the ghost release ladder, the dots blink and the
wording of the layer nudge; the third covers Torch — its
ping's fade curve and frozen origin, the ghost blips it leaves behind, and the
line-of-sight and circle/cone math behind what the light itself reaches; the
fourth covers the menu demo, whose autopilot has to steer only into open tiles,
eat at a reasonable rate, and reach every layer as it rotates; the fifth pins
the shape of all nine cells and the exact tuning each mode's Normal is
balanced around, so a change to it has to be deliberate; the sixth covers what
a pick leaves behind — picks stack rather than replace, each fades on its own
clock, and what a round opens with; the seventh covers the board aura's
schedule and its absence from the menu demo; the eighth regenerates
`CHANGELOG.md` in memory and fails if the checked-in file has drifted from
`js/changelog.js`. None of that is visible to a layout check. The last two are
bash because what they exercise is bash; `release-test.sh` drives
`tools/release.sh` against a throwaway repo, so nothing it does reaches GitHub.

    node test/maze-test.js
    node test/opening-test.js
    node test/torch-test.js
    node test/attract-test.js
    node test/modes-test.js
    node test/flash-test.js
    node test/aura-test.js
    node test/changelog-test.js
    bash test/release-test.sh
    bash test/itch-deploy-test.sh

The game always draws into a fixed 560x620 space and a canvas transform maps
that onto whatever size the board actually is. Nothing in the game logic knows
the screen size, and the maze stays sharp instead of being a stretched bitmap.
`PV.game` is exposed for poking at state from the console.

Editing a file and seeing nothing change usually means the browser cached the
old one. Hard reload with Ctrl-Shift-R.

## Changelog

`CHANGELOG.md` is generated. The notes live in `js/changelog.js`, because the
game reads them there too — the version marker in the menu's bottom corner is a
button, and it opens them in a modal. Add to the `Unreleased` entry as you go.

`tools/changelog.html` is the easy way. Serve the project and open it:

    python3 -m http.server 8000
    # then 127.0.0.1:8000/tools/changelog.html

Reach it as `127.0.0.1` or `localhost`, **not** `0.0.0.0`. Writing to disk needs
a trustworthy origin and only those two names are; `0.0.0.0` is the address the
server binds, which is what it prints on startup, and following that into the
address bar leaves the page unable to save. The page says so and offers the
link if it happens.

One box per note, released versions folded away, and a live preview of both the
modal and the Markdown. **Save to project** writes `js/changelog.js` and
`CHANGELOG.md` in place — it asks for the project root once per visit, since
that permission is the only way a page may write to disk. Without a server it
still edits and previews, but cannot save; **Download both** and **Copy this
tab** are the way out of that.

It tidies as you go — line breaks flattened, `'` to `’`, `--` to `—` — and
greys out Save until every note passes the same checks the suite runs, so a
save can't turn the tests red. It only ever rewrites the array, leaving the
rest of `js/changelog.js` untouched. If `CHANGELOG.md` says something the array
doesn't, it says so on arrival and offers to load it.

By hand, either file works. The array is the one that ships, so that is the
default direction:

    node tools/changelog.js             CHANGELOG.md from js/changelog.js
    node tools/changelog.js --from-md   js/changelog.js from CHANGELOG.md
    node tools/changelog.js --check     exit 1 if the two disagree
    node tools/changelog.js --force     write the Markdown anyway

Editing `CHANGELOG.md` is the more natural thing to reach for, so the default
direction refuses when that is what happened — a Markdown file newer than the
array and saying something different is holding the only copy of that work.
`--from-md` reads it back, taking wrapped bullets, `*` bullets and a plain
hyphen before the date. `release.sh` checks the two agree before it stamps
anything, since past that point the array is newer whatever you did.

`test/changelog-test.js` fails if the checked-in Markdown has drifted from the
array, pins the array's layout so a save from the editor produces no incidental
diff, and holds the parse to being the exact inverse of the render.

## Publishing

    ./tools/release.sh 1.6.0

Bumps `PV.VERSION`, stamps the changelog's `Unreleased` heading with `1.6.0`
and today's date, regenerates `CHANGELOG.md`, commits, tags `v1.6.0` and
pushes. A release with no `Unreleased` entry to stamp is refused. The tag
triggers
`.github/workflows/deploy.yml`, which checks the tag against `PV.VERSION`, runs
the game suites, packages the zip, pushes it to itch.io and creates a GitHub
release.

To ship a build without cutting a version, `./tools/itch-package.sh` builds the
zip and `./tools/itch-deploy.sh` pushes it. `docs/itch.md` covers the store
page, which stays manual.

## License

MIT. See `LICENSE`.

The licence covers this code, not the arcade game it takes after. If you build
on it, keep someone else's trademark out of anything a player or a storefront
sees, the way this does.

## Not done

- No bonus fruit.
- Ghosts do scatter/chase with the four classic personalities, but skip the
  arcade's speed tables and exact house dot counters.
- Collision is a radius check rather than the arcade's tile test, so it's a
  little more forgiving.
- The synthesised sound has never been checked on real speakers.
