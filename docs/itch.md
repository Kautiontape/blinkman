# Publishing to itch.io

## Releasing

    ./tools/release.sh 1.6.0

Bumps the version, tags it and pushes. The tag triggers
`.github/workflows/deploy.yml`, which packages the zip, pushes it to the `html`
channel and creates a GitHub release.

The workflow needs one secret. Generate a key at
<https://itch.io/user/settings/api-keys> and add it to the repository as
`BUTLER_API_KEY`, under Settings → Secrets and variables → Actions.

butler updates the playable build and nothing else. Everything below — title,
description, tags, screenshots — has no API and stays manual.

### When a release run fails

If the workflow fails before the itch.io push, fix the cause and re-run the
job. The tag is already pushed, so don't re-tag.

If `./tools/release.sh` itself fails at a push, it prints what to run next. A
failed branch push leaves nothing on origin, so it gives you an undo. A failed
tag push means the commit already landed, so it gives you the retry instead.

If the GitHub release step fails after the itch.io push has already
succeeded, a draft release can be left behind. Delete it before re-running the
job, or the retry fails.

## Building by hand

    ./tools/itch-package.sh

That writes `dist/blinkman-itch.zip` (~34 KB) with `index.html` at the archive
root, which is what itch looks for.

Push it to the `html` channel with [butler](https://itch.io/docs/butler/),
which needs `butler login` once:

    ./tools/itch-deploy.sh

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
| `docs/banner.png` | Page banner | 1860x465 |

Upload order matters a little: itch shows them in the order given, and the
first one does the most work. `screenshot.png` then `hard-mode.png` reads best,
because the first shows a game and the second shows what's wrong with it.

Blink mode photographs as a black rectangle, which is honest but a poor sales
pitch, so there's no screenshot of it.

## Press art

`press/` holds the art that gets uploaded to somewhere other than itch —
storefront forms, link cards, anywhere asking for a logo.

| File | Use | Size |
|---|---|---|
| `press/social.png` | `og:image`. The 1.91:1 card Twitter, Facebook, Slack and Discord crop to | 1200x630 |
| `press/cover-wide.png` | 16:9 key image | 1920x1080 |
| `press/logo.png` | Transparent horizontal logo, one file for any background | 1900x340 |
| `press/favicon.svg` | Source for every raster icon beside it | 24x24 |
| `press/favicon.ico` | Bundles 16, 32 and 48 | — |
| `press/favicon-32.png`, `-180`, `-192`, `-512`, `apple-touch-icon.png` | Whatever size a form demands | — |

The icons are upload assets and nothing serves them: the icon browsers show is
the data URI inlined in `index.html`, which is what keeps it working inside the
itch zip. Change one and change the other — `press/favicon.svg` carries the same
geometry so they can't drift silently.

`social.png` is the only one anything links to, via an absolute `og:image` onto
the Pages deploy. Moving or renaming it breaks every link card.

The logo is one file rather than a light and a dark variant, because the forms
asking for it overlay it on backgrounds they choose and accept a single upload.
Its wordmark is `#7183e4`: 3.46:1 on white and 6.07:1 on black, lopsided on
purpose toward the darker backgrounds it usually lands on, and above the 3:1
that large type needs on both. No colour beats 4.58:1 on both sides at once, so
a mark that looks its best on black is a mark that fails on white — the near
white the banner uses manages 1.17:1 there. The disc keeps the full brand yellow
and takes a keyline instead, since a shape survives low contrast where a word
does not. `test/banner-layout-test.js` holds all of this.

Regenerate the four rendered files by opening `tools/promo.html` in Chrome and
clicking through the download buttons. Chrome specifically: the wordmark needs
canvas `letterSpacing`, and the page throws rather than quietly drawing
untracked type. `tools/banner.html` does the same for `docs/banner.png`. Both
draw the board with the real maze and the real renderer, so a change to either
shows up in the art — which is the point, and the reason the art is generated
rather than exported from a design tool.
