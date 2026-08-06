# itch.io banner — design

Wide banner for the top of the BLINK-MAN itch.io project page. On itch a banner
**replaces the page title**, so it has to carry the wordmark itself rather than
sit above one.

## Direction

"Into the dark": a single corridor, lit at the left edge and swallowed by black
toward the right. The lit end shows walls, pellets and the player. The dark end
shows two ghosts you can barely see — one you've half-caught sight of, one you
haven't.

The banner sells the dread rather than the ruleset. It is not a screenshot: the
brief was explicitly that the page shouldn't open with the game hanging at the
top.

## Dimensions

| | |
|---|---|
| Export | 1860 x 465 PNG |
| Display size | 930 x 233 (2x for retina) |
| Ratio | 4:1 |
| Output path | `docs/banner.png` |

itch publishes no banner spec — not dimensions, not crop behaviour. The only
hard number available is a **930px minimum width**, which is the default page
content column. The 4:1 ratio is a design choice, picked to stay short enough to
read as a header rather than a hero image.

630x500 is the **cover**, not the banner. That asset already exists at
`cover.png` and is unaffected by this work.

Do not add `banner.png` to `dist/blinkman-itch.zip`. It's a storefront asset,
and `tools/package-itch.sh:14-17` already documents why page imagery stays out
of the playable payload.

## Composition

Left to right, as a fraction of width:

| Zone | Content |
|---|---|
| 0–22% | Corridor fully lit: wall strokes and pellets at full opacity |
| 12% | Player, facing right |
| 22–62% | Light falls off to nothing; pellets fade out first, walls follow |
| ~50% | Wordmark, horizontally centred, vertically centred |
| 80.5% | Near ghost — eyes plus a body at 18% opacity, below the wordmark baseline |
| 91.5% | Far ghost — eyes only, no body, 55% opacity, above the wordmark baseline |
| 62–100% | Pure `#05060c`, nothing else |

The two ghosts are the point of the piece and must stay differentiated. The near
one is a ghost you've half-glimpsed; the far one is a ghost you haven't. That
gradient is the game's premise compressed into one image.

Both ghosts sit clear of the wordmark. An earlier revision placed the near pair
at 74%, which collided with the **N** of MAN.

## Palette

Straight from the code, no new colours:

| Element | Value | Source |
|---|---|---|
| Background | `#05060c` | `css/style.css:7` (`--bg`) |
| Wall strokes | `#4b6bff`, glow `rgba(75,107,255,.85)` | `js/render.js:77-80` |
| Pellets | `#ffe9a8` | `js/render.js:112` |
| Player | `#ffd23f` | `js/render.js:9` |
| Near ghost body | `#ff3c3c` at 18% | Blinky, `js/entities.js:135` |
| Ghost eye whites | `#ffffff` | `js/render.js:182` |
| Ghost pupils | `#1a2acc` | `js/render.js:185` |
| Wordmark | `#e8ecff` | `css/style.css:11` (`--ink`) |

## Ghost geometry

Body path, on a `0 0 34 28` viewBox:

    M2,27 L2,16 A15,15 0 0 1 32,16 L32,27 L27,23.6 L22,27 L17,23.6 L12,27 L7,23.6 Z

Eyes: ellipses at `cx=11` and `cx=24`, `cy=15`, `rx=5.6`, `ry=7.2`. Pupils:
circles at `cx=9.2` / `cx=22.2`, `cy=16.2`, `r=3` — offset left so both ghosts
look at the player.

Two constraints that produced this and will silently break if changed:

1. **The chord must sit at y=16, not y=12.** A radius-15 arc springing from y=12
   puts its apex at y=-3, outside the viewBox, and the dome renders sheared flat
   across the top.
2. **Both ghosts share one viewBox and identical eye coordinates**, even though
   only one has a body. Different boxes make the two eye pairs scale at
   different rates.

Eyes are ovals, taller than wide. Circles read as clunky at this size, and are
wrong for the source material.

## The 18% value

The near ghost's body sits at 18% opacity. This was chosen against a range of
12 / 18 / 26%.

18% is a floor, not a preference. Below roughly 15% on a black field the shape
disappears outright on a dim screen or a phone in daylight, and itch pages get
opened in both. The value was approved on a display that renders it brighter
than average, meaning most viewers will see it *fainter* than it was approved
at — so there is no headroom to trim.

**Verification required:** check the rendered PNG under a reduced-gamma
simulation before shipping. The near ghost's silhouette must still resolve. If
it doesn't, the value goes up, not down.

## Type

**JetBrains Mono ExtraBold (800)**, letter-spacing `0.34em`, colour `#e8ecff`,
set as `BLINK‑MAN` with a non-breaking hyphen.

Chosen because `css/style.css:15` already names JetBrains Mono in the game's
font stack. That stack resolves to whatever each visitor happens to have
installed; a baked PNG is the one place the intended font is guaranteed.

Legibility over the fade is handled with a dark scrim behind the glyphs rather
than a stroke or drop shadow, so the letterforms stay clean.

### Page font

Set the itch theme's page font to **JetBrains Mono** as well. It's on Google
Fonts, which itch offers in full. This is the only coupling between the banner
and the page: the banner's font is baked into pixels and itch cannot restyle it,
so if the page text disagrees, the top of the page reads as two different sites.

Theme colours are already decided separately and unaffected: BG `#05060c`,
BG2 `#0c0f1c`, Text `#e8ecff`, Link `#4fc3ff`, Buttons and Headers `#ffd23f`.

## Production

Render the lit half off the game's own canvas rather than reconstructing it.
`PV.createMaze(seed)` is deterministic, so the corridor geometry, pellet
placement and player shape come out as the real thing and the seed can be
recorded here for reproducibility. The fade, the ghosts and the wordmark are
composited over that.

All mockups to date are CSS approximations of the maze. They are good enough to
have settled composition, but they are not the shipping artwork.

## Out of scope

- Animated GIF banner. itch supports one; a static PNG is what's being built.
- Any arcade or pixel display face for the wordmark. It's the obvious move for
  the genre and it's the one `docs/itch.md:22-25` warns against — a pixel-arcade
  wordmark is a visual trademark cue in a way the `arcade` and `maze` tags are
  not.
- Profile banner. Different asset, different page.
