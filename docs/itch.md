# Publishing to itch.io

Build the upload:

    ./tools/package-itch.sh

That writes `dist/blinkman-itch.zip` (~30 KB) with `index.html` at the archive
root, which is what itch looks for.

## Project settings

| Field | Value |
|---|---|
| Kind of project | HTML |
| Upload | `blinkman-itch.zip`, tick **This file will be played in the browser** |
| Viewport | 1280 x 800 |
| Fullscreen button | on |
| Mobile friendly | off |
| Genre | Action |
| Tags | `arcade`, `maze`, `minimalist`, `singleplayer`, `keyboard`, `difficult`, `experimental` |

Do not add a `pacman` tag, and keep the name out of the title and description.
It's a Bandai Namco trademark, and a trademark sitting in store metadata is
exactly what a takedown search finds. `arcade` and `maze` already carry the
discovery.

The board scales to whatever space it gets, so the viewport size is a starting
point rather than a constraint. Leave the fullscreen button on: itch adds
`allowfullscreen` to the iframe when you do, which is what the in-game `F` key
needs to work.

Players have to click the game once before the keyboard reaches it. That is
normal for itch embeds and worth a line in the description if people ask.

## Copy

Tagline — use `PV.TEXT.description` from `js/strings.js` so there's one source
of truth. Don't use one of the splash lines: they're jokes that rotate on every
load and read as noise with no context.

> A maze chase drawn one layer at a time.

Description:

> You memorise the corridor, switch to the ghosts, and one is already on top
> of you.
>
> Only one layer of the board is drawn at a time. The dots, the ghosts, the
> walls, or you. A key press picks which, and everything else is black until
> the cooldown lets you switch.
>
> Four difficulties. Blink is the last one: the board stays dark and a press
> flashes one layer, which then fades out over two seconds. Every level
> generates a new maze, so the corridor you just learned is gone.
>
> Arrows or WASD to move. 1-4 or HJKL to choose what you can see. Click the
> board once to give it the keyboard.

## Assets

| File | Use | Size |
|---|---|---|
| `cover.png` (repo root) | Cover image, already the size itch wants | 630x500 |
| `docs/screenshot.png` | A live round with the walls layer up | 1600x1000 |
| `docs/hard-mode.png` | Hard mode: four ghosts in a void, and the YOU chip is unlit because you can't see yourself either | 1600x1000 |
| `docs/mazes.png` | Four of the sixteen mazes side by side | 1314x393 |
| `docs/menu.png` | The mode select | 1600x1000 |

Upload order matters a little: itch shows them in the order given, and the
first one does the most work. `screenshot.png` then `hard-mode.png` reads best,
because the first shows a game and the second shows what's wrong with it.

Blink mode photographs as a black rectangle, which is honest but a poor sales
pitch, so there's no screenshot of it.
