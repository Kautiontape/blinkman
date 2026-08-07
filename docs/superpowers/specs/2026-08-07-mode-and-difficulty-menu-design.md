# Menu: three modes, each with its own three difficulties

## Problem

The menu offers five buttons — Easy, Normal, Hard, Torch, Blink — as one flat
list, but they are not five of the same thing. The first three are one way of
seeing at three difficulties; Torch and Blink are two other ways of seeing,
each pinned to a single difficulty nobody chose. A player who wants Torch has
no way to ask for an easier or harder Torch, and the three that do ladder have
no name for what they have in common.

Two further problems fall out of the flat list:

- The family of Easy/Normal/Hard has no name. `Layers` and `Vision` are both
  taken — they are live HUD labels (`PV.TEXT.hud.layers`, `PV.TEXT.hud.vision`)
  and `js/vision.js` treats "vision" as the umbrella over all three ways of
  seeing.
- `Blink` is both a mode and the word in the game's title, so the HUD badge can
  read `BLINK` inside `BLINK-MAN` and imply that mode is the canonical one when
  it is the hardest one.

## Goal

Split the one axis into two: three modes, each with an Easy, a Normal and a
Hard. Nine combinations, reached through a two-step menu that is fully
operable from the keyboard.

Every mode's **Normal** is bit-for-bit what that mode ships as today, so no
existing round changes. Stare's Easy and Hard are today's Easy and Hard
unchanged. Five of the nine cells are therefore carried across untouched, and
four are new: Torch and Flash's Easy and Hard.

## Naming

The three modes are **Stare**, **Torch** and **Flash**.

They sit on one axis — how long the light lasts. Stare holds it indefinitely,
Torch carries it, Flash spends it in an instant.

`Stare` names the family that had no name: an eye held open on one thing, which
is what the mode does. It beat `Focus` (implies sharpness, not duration, and is
a loaded CSS/accessibility term), `Hold` and `Watch` (both read as control
instructions), and `Persist` (already means "write the score to localStorage"
in `js/game.js`).

`Blink` becomes `Flash`, freeing the title's word. This is less a rename than
the mode's name catching up to copy already shipping: its blurb is
`Flash one layer and remember it`, its menu line is
`Dark. Flash one layer, then it fades`, and its hint verb is `to flash`. The
word "blink" appears nowhere in that mode's own description.

`Torch` and `Flash` are both flashlight words, which is accepted deliberately.
The overlap is on-axis — both modes are "you brought a light" — and the menu
lines disambiguate before a player has to think about it.

**Photosensitivity.** WCAG 2.3.1 is titled "Three Flashes or Below Threshold",
so naming a mode after a full-brightness burst invites the question. The 1s
cooldown caps the player near 1Hz, well under the 3Hz general flash threshold,
so the mechanic is already in bounds; the name is what draws attention to it.
The luminance delta and lit area want a deliberate look before release.

## The nine cells

Difficulty is a per-mode ladder, not a shared row of numbers. Each mode's
ladder moves the knob that mode is actually about, because that is what the
existing Easy/Normal/Hard already do — Stare's difficulty is mostly `keep` and
`freeSelf`, not ghost speed.

Ghost speed keeps its per-mode offset. Torch and Flash already run slower
ghosts than Stare Normal (0.90 and 0.86 against 0.92) because those modes are
inherently harder, and each row keeps its own offset rather than snapping to a
shared ladder.

Values marked *(today)* are carried across unchanged.

### Stare — knob: how much stays lit

| | pool | keep | freeSelf | cooldown | ghostSpeed | initial |
|---|---|---|---|---|---|---|
| Easy | 3 | 2 | yes | 1.0 | 0.80 | walls, dots |
| Normal | 3 | 1 | yes | 1.0 | 0.92 | walls |
| Hard | 4 | 1 | no | 3.0 | 1.00 | walls |

All three are today's `easy`, `normal` and `hard` exactly.

### Torch — knob: how much of the dark the light covers

| | torchRadius | coneLen | coneHalf | hold | fade | cooldown | ghostSpeed |
|---|---|---|---|---|---|---|---|
| Easy | 60 | 150 | 60° | 0.35 | 1.8 | 1.0 | 0.78 |
| Normal | 46 | 120 | 45° | 0.25 | 1.1 | 1.0 | 0.90 *(today)* |
| Hard | 32 | 96 | 30° | 0.15 | 0.7 | 2.0 | 1.00 |

`coneHalf` is the half-angle, so the fields of view are 120°, 90° and 60°.
Pool is 3 and `freeSelf` is true on all three rows.

### Flash — knob: how long the flash lingers

| | pool | freeSelf | hold | fade | cooldown | ghostSpeed |
|---|---|---|---|---|---|---|
| Easy | 3 | yes | 0.6 | 3.5 | 1.0 | 0.74 |
| Normal | 4 | no | 0.4 | 2.0 | 1.0 | 0.86 *(today)* |
| Hard | 4 | no | 0.25 | 1.0 | 2.0 | 0.96 |

Flash Easy draws the player always. Flash is the hardest mode, and always
knowing where you are — spending flashes only on dots, ghosts and walls — is
the largest single concession available. It also makes Flash Easy's pool 3,
matching how `freeSelf` and pool already move together everywhere else.

Every number in Torch and Flash's Easy and Hard rows is a starting point for
playtesting, not a considered balance.

## Config shape

`PV.MODES` is authored nested; `PV.DIFFICULTIES` is generated flat from it at
load time and keeps its current role as the single lookup every consumer
already uses.

```js
PV.MODES = {
  stare: { base: { /* shared by the row */ }, levels: { easy: {…}, normal: {…}, hard: {…} } },
  torch: { … },
  flash: { … }
};
```

Flattening merges `base` under each level and stamps three fields:

- `id` — `'torch-hard'`, the composite key
- `mode` — `'torch'`
- `level` — `'hard'`

`PV.DIFFICULTIES['torch-hard']` then answers exactly as `PV.DIFFICULTIES.torch`
does today, so `PV.createGame(id)`, `PV.DIFFICULTIES[id]` and
`'pv-best-' + id` need no change in shape.

### `style` is replaced by `mode`

`rules.style` currently holds `'persist' | 'torch' | 'blink'` and is switched on
at nine sites — seven in `js/vision.js`, one in `js/render.js:152`, one in
`js/game.js:157`. With one style per mode the two fields would hold the same
string, so `style` goes and those sites read `rules.mode`, whose values are
`'stare' | 'torch' | 'flash'`.

`PV.TEXT.hint` is keyed by the same values, so `PV.modeHint` continues to read
`PV.TEXT.hint[rules.mode]` for its verb.

### Torch's three constants move onto rules

`TORCH_R`, `TORCH_CONE_LEN` and `TORCH_CONE_HALF` (`js/render.js:19-22`) are
module constants read where the torch object is built (`js/render.js:152-160`).
They become `rules.torchRadius`, `rules.coneLen` and `rules.coneHalf`, with
today's 46 / 120 / 45° as Torch Normal. The flicker multiplier
`coneLen * (r / TORCH_R)` reads the rules radius instead of the constant.

`TORCH_SOFT` stays a module constant — edge softness is a look, not a
difficulty. `PV.torchAlpha`'s `{radius, coneLen, coneHalf, soft}` params
contract does not change.

## Strings

`PV.TEXT.modes` becomes keyed by mode, with a `levels` map inside each:

```js
modes: {
  stare: {
    name: 'Stare',
    menu: 'The layer you pick <b>stays lit</b>',
    levels: {
      easy: { name: 'Easy', blurb: '…', menu: 'You and your last <b>two picks</b> · 1s' },
      …
    }
  },
  …
}
```

The house rule holds: one bold run per menu line, and it is the phrase saying
how much you can see.

Three accessors, replacing two:

- `PV.modeName(id)` → `'TORCH'`
- `PV.levelName(id)` → `'HARD'` *(new)*
- `PV.modeBlurb(id)` → the level's blurb

`js/hud.js:132` and `js/main.js:159` both compose mode and level themselves.
`.badge-mode` in the HUD sidebar is narrow enough that `TORCH · HARD` may wrap;
it is allowed to wrap to two lines rather than being truncated.

## Menu layout

One panel, two steps, and the mode list never leaves the screen.

**Step 1 — modes.** Three cards, each with an icon, the mode name in accent, a
one-line description and a digit badge.

**Step 2 — difficulties.** The chosen mode stays exactly where it is and keeps
its icon and description, becoming a header rather than an option. Its three
difficulties open directly beneath it, indented. The other two modes collapse
in place to a thin dimmed label: name only, icon shrunk and desaturated, no
description.

Collapsing in place rather than hiding means the list never reflows under the
pointer, and changing your mind is one click on a row that has not moved.

**Digits belong to exactly one list.** When a mode is open, the collapsed rows
*and* the open header drop their digit badges, so 1/2/3 unambiguously address
the difficulties. This is the reason the open mode is styled as a header: it is
no longer a thing the number keys can select.

## Keyboard

| | |
|---|---|
| `↑` `↓` or `W` `S` | Move the cursor within the current list. Wraps. |
| `→` or `D` | Take the option under the cursor. |
| `←` or `A` | Back one step. |
| `1` `2` `3` | Select that entry of the list currently showing digits. |
| `Enter` / `Space` | Take the option under the cursor. |
| `Esc` | Back one step. Does nothing at the mode list. |

The cursor opens on Stare · Normal every time. The menu does not remember the
last combination played.

Left and right are bound rather than left inert, matching a game that already
accepts both arrows and `WASD` for movement.

Hover moves the keyboard cursor, so there is one highlight on screen whichever
device put it there — with one exception: while a mode is open, hovering a mode
row does not move the cursor. The cursor belongs to the difficulty list that
1/2/3 address, and sliding the pointer past a collapsed label must not drag it
out.

`Space` needs no new handling. `js/main.js` already exempts it from the
page-scroll guard when focus is on a button.

## Icons

One per mode, from the logo's eye in three states — the same construction as
the `.eye` mark in the `h1`: `viewBox="0 0 24 24"`, `stroke-width="1.9"`,
round caps, colour inherited through `currentColor`.

- **Stare** — eye wide open, pupil solid and centred.
- **Torch** — the eye pushed left, pupil small, two arcs sweeping off it.
- **Flash** — the lid down to the logo's half-shut lens, pupil gone, three rays
  escaping upward.

Two known weaknesses, accepted:

- Stare's glyph is the universal "visibility" icon and means *sustained* only
  by contrast with its two siblings. It is fine in a menu where all three sit
  together, weak in isolation.
- Flash's glyph is close to the wordmark's own eye and may read as the game's
  badge rather than as a mode. It also conveys the flash but not the fade;
  no fade treatment survived 40px without collapsing into the Torch glyph.

The set holds down to about 32px and no lower — below that the pupils close up
against the lids.

## High scores

Bests are keyed `pv-best-<id>`, so nine ids means nine bests. This is correct:
a Torch Hard score is not comparable to a Stare Easy one.

Existing players hold bests under five old keys. A one-time migration copies
them to their new ids on first load, then records that it ran so it never
overwrites a newer score:

| old | new |
|---|---|
| `pv-best-easy` | `pv-best-stare-easy` |
| `pv-best-normal` | `pv-best-stare-normal` |
| `pv-best-hard` | `pv-best-stare-hard` |
| `pv-best-torch` | `pv-best-torch-normal` |
| `pv-best-blink` | `pv-best-flash-normal` |

The migration writes only where the new key is absent, so re-running it can
never lose a score.

## Consumers to update

| site | change |
|---|---|
| `js/attract.js:23` | `createGame('normal', …)` → `'stare-normal'` |
| `js/hud.js:113` | `PV.DIFFICULTIES.normal` → `PV.DIFFICULTIES['stare-normal']` |
| `js/hud.js:132` | badge shows mode and level |
| `js/main.js:159` | READY body shows mode and level |
| `js/main.js:197` | `MENU_KEYS` digits 1-5 → the two-step handler |
| `js/main.js:253` | `.diff` click handler → routes mode and difficulty rows |
| `index.html:52-73` | the five `.diff` buttons → the two-step markup |

## Tests

Existing suites reference the old ids in nine places and must move with them:
`test/torch-test.js:27,34,108,109`, `test/opening-test.js:37,190,199,203`,
`test/attract-test.js:51,57,165`.

`test/opening-test.js:215-229` pins the layer nudge per mode and asserts its
`EXPECTED` map covers every key of `PV.DIFFICULTIES`. It grows to nine entries,
and it catches a real consequence of this design: Flash Easy has `freeSelf`
true and a pool of 3, so its nudge reads `Press 1/2/3 to flash` while Flash
Normal and Hard read `Press 1/2/3/4 to flash`.

New coverage worth having:

- Every one of the nine ids builds a playable `PV.createGame(id)`.
- Each mode's Normal row equals what that mode ships today, field by field —
  the guarantee this whole design rests on.
- The best-score migration maps all five old keys and does not overwrite an
  existing new key.

## Out of scope

- Rebalancing any carried-across value. The four new cells are playtest
  starting points; the five carried ones are not up for adjustment here.
- Per-mode or global leaderboards beyond the existing single best per id.
- `PV.VERSION`. The release process owns it.
- Torch Hard hiding the player (`freeSelf: false`) while the lit circle still
  surrounds them. A real idea, deliberately not taken now.
- The attract demo's autopilot, which keeps running Stare Normal behind the
  menu and is unaffected by the mode a player is hovering.
