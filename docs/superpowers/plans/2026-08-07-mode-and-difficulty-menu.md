# Mode and Difficulty Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat five-button menu with three modes — Stare, Torch, Flash — each offering Easy, Normal and Hard, reached through a two-step keyboard-operable picker.

**Architecture:** `PV.MODES` is authored nested and flattened at load time into `PV.DIFFICULTIES`, keyed by composite ids like `torch-hard`. That keeps `PV.createGame(id)`, `PV.DIFFICULTIES[id]` and `'pv-best-' + id` unchanged in shape, so the change stays in the config, the copy and the menu rather than spreading through the game. The menu itself moves out of static markup into a new `js/menu.js` that builds and drives the list, because the rows now expand and collapse.

**Tech Stack:** Plain ES5 scripts hanging off a `window.PV` global. No modules, no bundler, no dependencies — `file://` has to keep working. Tests are bare `node` scripts that stub `global.window` and require the same files the page loads.

**Spec:** `docs/superpowers/specs/2026-08-07-mode-and-difficulty-menu-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `js/strings.js` | Every player-facing word | Modes rekeyed by mode with nested levels |
| `js/vision.js` | Mode rules, the flattened table, name accessors | `PV.MODES`, `PV.DIFFICULTIES` generation, `PV.levelName` |
| `js/render.js` | Canvas drawing | Torch's three constants read from rules |
| `js/game.js` | Rounds, scoring, best scores | Best-score key migration |
| `js/menu.js` | **New.** The two-step picker: markup, cursor, keys, clicks | Created |
| `js/hud.js` | Score, badge, chips, nudge | Badge shows mode and level |
| `js/main.js` | Input, frame loop, overlays | Menu keys delegate to `js/menu.js` |
| `index.html` | Markup | Five static buttons become one empty container plus the new script tag |
| `css/style.css` | Styling | `.diffs`/`.diff` become `.modes`/`.mrow`, plus collapsed and open states |
| `test/modes-test.js` | **New.** The nine cells and the carried-across guarantee | Created |
| `test/opening-test.js` | Opening cues and the layer nudge | Ids and the nudge map grow to nine |
| `test/torch-test.js` | Torch's ping | Ids |
| `test/attract-test.js` | The menu demo | Ids |

---

### Task 1: The nine cells

The id rename touches the config, the copy, three consumers and three test suites at once — nothing in between is green, so it lands as one commit.

**Files:**
- Modify: `js/vision.js:60-119`
- Modify: `js/strings.js:73-115`
- Modify: `js/attract.js:23`, `js/hud.js:113`
- Modify: `test/opening-test.js:37,190,199,203,215-229`, `test/torch-test.js:27,34,108,109`, `test/attract-test.js:51,57,165`
- Test: `test/modes-test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/modes-test.js`:

```js
/* Mode and difficulty table test — run with:  node test/modes-test.js
 *
 * The guarantee this whole grid rests on is that every mode's Normal is what
 * that mode shipped as before it had a ladder, so the carried cells are pinned
 * literally here rather than compared against the table under test.
 */
global.window = {};
var path = require('path');
['strings.js', 'maze.js', 'entities.js', 'vision.js', 'game.js'].forEach(function (f) {
  require(path.join(__dirname, '..', 'js', f));
});
var PV = global.window.PV;

var failures = 0;

function check(label, ok, detail) {
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label +
    (ok || detail === undefined ? '' : '   got ' + detail));
  if (!ok) failures++;
}

console.log('');
console.log('the grid');

var IDS = ['stare-easy', 'stare-normal', 'stare-hard',
           'torch-easy', 'torch-normal', 'torch-hard',
           'flash-easy', 'flash-normal', 'flash-hard'];

check('nine cells', Object.keys(PV.DIFFICULTIES).length === 9,
  Object.keys(PV.DIFFICULTIES).length);

IDS.forEach(function (id) {
  var r = PV.DIFFICULTIES[id];
  check(id + ' exists', !!r);
  if (!r) return;
  check(id + ' knows its own id', r.id === id, r.id);
  check(id + ' splits into mode and level',
    id === r.mode + '-' + r.level, r.mode + ' / ' + r.level);
});

console.log('');
console.log('every cell plays');

IDS.forEach(function (id) {
  var g = PV.createGame(id, { persist: false });
  g.startRound();
  g.update(1 / 60);
  check(id + ' builds a round', g.state === 'ready' || g.state === 'playing', g.state);
});

console.log('');
console.log('carried across unchanged');

/* Pinned literally: these five are what shipped before the grid existed. */
var CARRIED = {
  'stare-easy': {
    pool: 'dots,ghosts,walls', keep: 2, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.80, initial: 'walls,dots'
  },
  'stare-normal': {
    pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.92, initial: 'walls'
  },
  'stare-hard': {
    pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
    cooldown: 3, ghostSpeed: 1.00, initial: 'walls'
  },
  'torch-normal': {
    pool: 'dots,ghosts,walls', keep: 1, freeSelf: true,
    cooldown: 1, ghostSpeed: 0.90, initial: 'walls', hold: 0.25, fade: 1.1
  },
  'flash-normal': {
    pool: 'dots,ghosts,walls,pacman', keep: 1, freeSelf: false,
    cooldown: 1, ghostSpeed: 0.86, initial: 'walls', hold: 0.4, fade: 2.0
  }
};

Object.keys(CARRIED).forEach(function (id) {
  var want = CARRIED[id];
  var got = PV.DIFFICULTIES[id];
  Object.keys(want).forEach(function (field) {
    var actual = got[field];
    if (Array.isArray(actual)) actual = actual.join(',');
    check(id + ' ' + field, actual === want[field], actual);
  });
});

console.log('');
console.log('the copy covers the grid');

IDS.forEach(function (id) {
  check(id + ' names its mode', /^[A-Z]+$/.test(PV.modeName(id)), PV.modeName(id));
  check(id + ' names its level', /^[A-Z]+$/.test(PV.levelName(id)), PV.levelName(id));
  check(id + ' has a blurb', (PV.modeBlurb(id) || '').length > 0, PV.modeBlurb(id));
});

console.log('');
console.log(failures === 0 ? 'ALL GRID CHECKS OK' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node test/modes-test.js`
Expected: FAIL — `nine cells` reports 5, and every `stare-easy exists` style check fails.

- [ ] **Step 3: Replace the rules table in `js/vision.js`**

Replace lines 60-107 (the comment block through the close of `PV.DIFFICULTIES` and the two accessors that follow) with:

```js
  /* Behaviour only — every word the player reads lives in strings.js.
   *
   * style 'persist' — your last `keep` picks stay lit until you pick again.
   * style 'blink'   — a pick flashes at full alpha, holds, then fades out.
   * style 'torch'   — a lit circle and a forward cone travel with you, and a
   *                   pick pings outward from you; render.js paints all three
   *                   in board space, so the layer alphas stay dark.
   * freeSelf        — your own layer is always drawn and costs no pick.
   *
   * `base` is what a mode's three levels share; a level merges over it. */
  PV.MODES = {
    stare: {
      base: {
        style: 'persist', pool: ['dots', 'ghosts', 'walls'],
        freeSelf: true, initial: ['walls']
      },
      levels: {
        easy:   { keep: 2, cooldown: 1.0, ghostSpeed: 0.80, initial: ['walls', 'dots'] },
        normal: { keep: 1, cooldown: 1.0, ghostSpeed: 0.92 },
        hard:   { keep: 1, cooldown: 3.0, ghostSpeed: 1.00, pool: LAYERS, freeSelf: false }
      }
    },
    torch: {
      base: {
        style: 'torch', pool: ['dots', 'ghosts', 'walls'],
        freeSelf: true, keep: 1, initial: ['walls']
      },
      levels: {
        easy: {
          torchRadius: 60, coneLen: 150, coneHalf: Math.PI / 3,
          hold: 0.35, fade: 1.8, cooldown: 1.0, ghostSpeed: 0.78
        },
        normal: {
          torchRadius: 46, coneLen: 120, coneHalf: Math.PI / 4,
          hold: 0.25, fade: 1.1, cooldown: 1.0, ghostSpeed: 0.90
        },
        hard: {
          torchRadius: 32, coneLen: 96, coneHalf: Math.PI / 6,
          hold: 0.15, fade: 0.7, cooldown: 2.0, ghostSpeed: 1.00
        }
      }
    },
    flash: {
      base: { style: 'blink', pool: LAYERS, freeSelf: false, keep: 1, initial: ['walls'] },
      levels: {
        // Easy draws you always, so a flash is only ever spent on the board.
        easy:   { pool: ['dots', 'ghosts', 'walls'], freeSelf: true,
                  hold: 0.6, fade: 3.5, cooldown: 1.0, ghostSpeed: 0.74 },
        normal: { hold: 0.4, fade: 2.0, cooldown: 1.0, ghostSpeed: 0.86 },
        hard:   { hold: 0.25, fade: 1.0, cooldown: 2.0, ghostSpeed: 0.96 }
      }
    }
  };

  var LEVELS = ['easy', 'normal', 'hard'];
  PV.LEVELS = LEVELS;
  PV.MODE_IDS = ['stare', 'torch', 'flash'];

  /* One flat table keyed 'mode-level'. createGame, the best-score key and the
   * menu all address a cell by that id, so the nesting above stays authoring
   * convenience and never reaches a consumer. */
  PV.DIFFICULTIES = {};
  PV.MODE_IDS.forEach(function (mode) {
    LEVELS.forEach(function (level) {
      var rules = { id: mode + '-' + level, mode: mode, level: level };
      [PV.MODES[mode].base, PV.MODES[mode].levels[level]].forEach(function (part) {
        Object.keys(part).forEach(function (k) { rules[k] = part[k]; });
      });
      PV.DIFFICULTIES[rules.id] = rules;
    });
  });

  /** Display name for a cell's mode, its level, and the level's one-liner. */
  PV.modeName = function (id) {
    return PV.TEXT.modes[PV.DIFFICULTIES[id].mode].name.toUpperCase();
  };
  PV.levelName = function (id) {
    return PV.TEXT.levels[PV.DIFFICULTIES[id].level].toUpperCase();
  };
  PV.levelBlurb = function (id) {
    var r = PV.DIFFICULTIES[id];
    return PV.TEXT.modes[r.mode].levels[r.level].blurb;
  };
```

- [ ] **Step 4: Replace the copy in `js/strings.js`**

Replace the `modes: { … }` block (lines 73-99) with:

```js
    /* Written once and shared, so a level is spelled the same everywhere. */
    levels: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },

    /* One bold run per menu line, and it is always the phrase saying how much
     * you can see. `blurb` is the plain version the READY overlay uses. */
    modes: {
      stare: {
        name: 'Stare',
        menu: 'The layer you pick <b>stays lit</b>',
        levels: {
          easy: {
            blurb: 'You and your last two picks',
            menu: 'You and your last <b>two picks</b> &middot; 1s cooldown'
          },
          normal: {
            blurb: 'You and your last pick',
            menu: 'You and your <b>last pick</b> &middot; 1s cooldown'
          },
          hard: {
            blurb: 'One of four, and you can go dark',
            menu: '<b>One of four</b>, and you can go dark &middot; 3s cooldown'
          }
        }
      },
      torch: {
        name: 'Torch',
        menu: 'A circle and a cone, and a <b>ping that sweeps</b>',
        levels: {
          easy: {
            blurb: 'A wide cone, and it reaches',
            menu: 'A <b>wide</b> cone, and it reaches &middot; 1s cooldown'
          },
          normal: {
            blurb: 'A pool of light, and a ping that sweeps',
            menu: 'A <b>6-tile</b> cone, and a ping &middot; 1s cooldown'
          },
          hard: {
            blurb: 'A narrow cone, quick to fade',
            menu: 'A <b>narrow</b> cone, quick to fade &middot; 2s cooldown'
          }
        }
      },
      flash: {
        name: 'Flash',
        menu: 'Dark. <b>Flash one layer</b>, then it fades',
        levels: {
          easy: {
            blurb: 'You stay lit, and a flash lingers',
            menu: '<b>You stay lit.</b> A flash fades over 3.5s &middot; 1s cooldown'
          },
          normal: {
            blurb: 'Flash one layer and remember it',
            menu: 'Dark. A flash <b>fades over 2s</b> &middot; 1s cooldown'
          },
          hard: {
            blurb: 'Flash one layer, and it is gone',
            menu: 'Dark. A flash <b>fades over 1s</b> &middot; 2s cooldown'
          }
        }
      }
    },
```

- [ ] **Step 5: Point the two in-game consumers at the new ids**

`js/attract.js:23`:

```js
    var game = PV.createGame('stare-normal', { persist: false });
```

`js/hud.js:113`:

```js
        buildChips(PV.createVision(PV.DIFFICULTIES['stare-normal']), false);
```

- [ ] **Step 6: Move the test call sites**

`test/torch-test.js:27` → `var RULES = PV.DIFFICULTIES['torch-normal'];`
`test/torch-test.js:34` → `var g = PV.createGame('torch-normal');`
`test/torch-test.js:108` → `check('flash has no ping', PV.createGame('flash-normal').vision.pulse() === null);`
`test/torch-test.js:109` → `check('stare has no ping', PV.createGame('stare-normal').vision.pulse() === null);`
`test/opening-test.js:37` → `var g = PV.createGame(difficulty || 'stare-normal');`
`test/opening-test.js:199` → `var normal = dotsAfter('stare-normal', 1.6);`
`test/opening-test.js:203` → `var easy = dotsAfter('stare-easy', 1.6);`
`test/attract-test.js:51` → `var demo = PV.createGame('stare-normal', { persist: false });`
`test/attract-test.js:57` → `var real = PV.createGame('stare-normal');`
`test/attract-test.js:165` → `var pool = PV.DIFFICULTIES['stare-normal'].pool.slice().sort().join(',');`

- [ ] **Step 7: Grow the layer-nudge map**

Replace the `EXPECTED` literal in `test/opening-test.js:215-221` with:

```js
  var EXPECTED = {
    'stare-easy': 'Press 1/2/3 to change layer',
    'stare-normal': 'Press 1/2/3 to change layer',
    'stare-hard': 'Press 1/2/3/4 to change layer',
    'torch-easy': 'Press 1/2/3 to scan',
    'torch-normal': 'Press 1/2/3 to scan',
    'torch-hard': 'Press 1/2/3 to scan',
    // Easy draws you always, so it is the one Flash cell with no 4 to offer.
    'flash-easy': 'Press 1/2/3 to flash',
    'flash-normal': 'Press 1/2/3/4 to flash',
    'flash-hard': 'Press 1/2/3/4 to flash'
  };
```

- [ ] **Step 8: Run every suite**

Run: `node test/modes-test.js && node test/opening-test.js && node test/torch-test.js && node test/attract-test.js && node test/maze-test.js`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add js/vision.js js/strings.js js/attract.js js/hud.js test/
git commit -m "modes: Split the menu's one axis into mode and difficulty"
```

---

### Task 2: `rules.style` becomes `rules.mode`

One style per mode means the two fields hold the same string. `style` goes.

**Files:**
- Modify: `js/vision.js` (7 sites), `js/render.js:152`, `js/game.js:157`
- Modify: `js/strings.js` (the `hint` keys)

- [ ] **Step 1: Rename the hint verb keys in `js/strings.js`**

The `hint` block becomes:

```js
    hint: {
      press: 'Press %KEYS% %VERB%',
      stare: 'to change layer',
      torch: 'to scan',
      flash: 'to flash'
    },
```

- [ ] **Step 2: Drop `style` from the three `base` blocks in `js/vision.js`**

Delete `style: 'persist', ` from `stare.base`, `style: 'torch', ` from `torch.base`, and `style: 'blink', ` from `flash.base`.

- [ ] **Step 3: Switch the nine read sites**

`js/vision.js:118` → `PV.TEXT.hint[rules.mode]`
`js/vision.js:148` → `if (rules.mode === 'stare') return stack[0] || null;`
`js/vision.js:162` → `pulse: function () { return rules.mode === 'torch' ? flash : null; },`
`js/vision.js:173` → `if (rules.mode === 'stare') {`
`js/vision.js:195` → `if (rules.mode === 'torch') {`
`js/vision.js:202` → `} else if (rules.mode === 'flash') {`
`js/vision.js:232` → `flash = rules.mode !== 'stare' && rules.initial`
`js/render.js:152` → `if (game.rules.mode === 'torch') {`
`js/game.js:157` → `game.onEvent(rules.mode === 'stare' ? 'visionSwitch' : 'blink');`

Also update the doc comment above `PV.MODES` so it reads `mode 'stare'`, `mode 'flash'`, `mode 'torch'` rather than `style`.

- [ ] **Step 4: Confirm nothing still reads `style`**

Run: `grep -rn "rules\.style" js/ test/`
Expected: no output.

- [ ] **Step 5: Run every suite**

Run: `node test/modes-test.js && node test/opening-test.js && node test/torch-test.js && node test/attract-test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/ 
git commit -m "modes: Replace rules.style with rules.mode"
```

---

### Task 3: Torch's reach becomes a difficulty knob

**Files:**
- Modify: `js/render.js:19-27`, `js/render.js:152-160`
- Test: `test/torch-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/torch-test.js`, before its final summary lines:

```js
console.log('');
console.log('the torch ladder');

(function () {
  var easy = PV.DIFFICULTIES['torch-easy'];
  var normal = PV.DIFFICULTIES['torch-normal'];
  var hard = PV.DIFFICULTIES['torch-hard'];

  // The reach is a per-cell knob now, so render.js must not still be holding
  // one value for every difficulty.
  check('the reach is no longer a module constant',
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
  var offAxis = { dx: 40, dy: 60 };   // ~56 deg off axis, 72px out
  function lit(rules) {
    return PV.torchAlpha(offAxis.dx, offAxis.dy, right, {
      radius: rules.torchRadius, coneLen: rules.coneLen,
      coneHalf: rules.coneHalf, soft: PV.TORCH_SOFT
    });
  }
  check('a wide cone reaches what a narrow one misses',
    lit(easy) > 0 && lit(hard) === 0, lit(easy) + ' / ' + lit(hard));
})();
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node test/torch-test.js`
Expected: FAIL on `the reach is no longer a module constant` — `render.js` still
exports `PV.TORCH_R`, `PV.TORCH_CONE_LEN` and `PV.TORCH_CONE_HALF`, so one reach
serves all three difficulties.

The ladder checks below it already pass, because Task 1 put the numbers in the
config. They are here to keep the ordering from drifting, and the constant check
is what makes this task's change observable from a test.

- [ ] **Step 3: Read the three values from rules**

In `js/render.js`, delete these three lines from the constant block at 19-22:

```js
  var TORCH_R = 46;                    // 2.3 tiles
  var TORCH_CONE_HALF = Math.PI / 4;   // 45 deg either side of facing — 90 deg FOV
  var TORCH_CONE_LEN = 120;            // 6 tiles
```

and their three exports at 24-27, keeping `TORCH_SOFT` and `PV.TORCH_SOFT`.

`torchRadius(time)` takes the base radius as an argument:

```js
  /* The circle breathes, so a still screen never looks frozen. */
  function torchRadius(base, time) {
    if (PV.wantsCalm()) return base;
    return base * (1 + 0.045 * Math.sin(time * 11.3) + 0.028 * Math.sin(time * 23.7));
  }
```

And the torch object at 152-160:

```js
        if (game.rules.mode === 'torch') {
          var r = torchRadius(game.rules.torchRadius, game.time);
          torch = {
            x: game.pacman.x, y: game.pacman.y,
            radius: r,
            // flickers in step with the circle
            coneLen: game.rules.coneLen * (r / game.rules.torchRadius),
            coneHalf: game.rules.coneHalf,
            soft: TORCH_SOFT
          };
```

- [ ] **Step 4: Confirm the constants are gone**

Run: `grep -n "TORCH_R\b\|TORCH_CONE" js/ -r`
Expected: no output.

- [ ] **Step 5: Run every suite**

Run: `node test/torch-test.js && node test/modes-test.js && node test/opening-test.js && node test/attract-test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/render.js test/torch-test.js
git commit -m "torch: Make the circle and cone difficulty knobs"
```

---

### Task 4: Carry the old best scores forward

**Files:**
- Modify: `js/game.js:39-44`
- Test: `test/modes-test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/modes-test.js`, before its final summary lines:

```js
console.log('');
console.log('best-score migration');

(function () {
  var OLD = {
    'pv-best-easy': 'pv-best-stare-easy',
    'pv-best-normal': 'pv-best-stare-normal',
    'pv-best-hard': 'pv-best-stare-hard',
    'pv-best-torch': 'pv-best-torch-normal',
    'pv-best-blink': 'pv-best-flash-normal'
  };

  // A stand-in for the browser's localStorage, seeded with the five old keys
  // and one new key that already holds a better score.
  var mem = { 'pv-best-flash-normal': '900' };
  Object.keys(OLD).forEach(function (k) { mem[k] = '100'; });

  var store = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); }
  };

  PV.migrateBests(store);

  Object.keys(OLD).forEach(function (from) {
    var to = OLD[from];
    if (to === 'pv-best-flash-normal') return;
    check(from + ' reaches ' + to, mem[to] === '100', mem[to]);
  });

  check('an existing best is never overwritten', mem['pv-best-flash-normal'] === '900',
    mem['pv-best-flash-normal']);

  // Running twice must be a no-op, not a second chance to clobber.
  mem['pv-best-stare-normal'] = '5000';
  PV.migrateBests(store);
  check('re-running loses nothing', mem['pv-best-stare-normal'] === '5000',
    mem['pv-best-stare-normal']);
})();
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node test/modes-test.js`
Expected: FAIL — `TypeError: PV.migrateBests is not a function`.

- [ ] **Step 3: Write the migration**

In `js/game.js`, after `readBest` (line 44), add:

```js
  /* The ids gained a mode prefix when the menu split into mode and difficulty.
   * Copies each old key to its new one, skipping any the player has already
   * scored under, so running it twice can never cost a score. */
  var OLD_BEST_KEYS = {
    'pv-best-easy': 'pv-best-stare-easy',
    'pv-best-normal': 'pv-best-stare-normal',
    'pv-best-hard': 'pv-best-stare-hard',
    'pv-best-torch': 'pv-best-torch-normal',
    'pv-best-blink': 'pv-best-flash-normal'
  };

  PV.migrateBests = function (target) {
    var s = target || store;
    Object.keys(OLD_BEST_KEYS).forEach(function (from) {
      var to = OLD_BEST_KEYS[from];
      var carried = s.getItem(from);
      if (carried !== null && s.getItem(to) === null) s.setItem(to, carried);
    });
  };
```

`store` wraps `localStorage` in a try/catch, so the parameterless call is what
the page uses and the parameter is the seam this test needs.

- [ ] **Step 4: Run it at startup**

In `js/main.js`, immediately before the `showMenu();` call at the end of the IIFE:

```js
  PV.migrateBests();
  showMenu();
```

- [ ] **Step 5: Run every suite**

Run: `node test/modes-test.js && node test/opening-test.js && node test/torch-test.js && node test/attract-test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/game.js js/main.js test/modes-test.js
git commit -m "scores: Carry old bests onto the prefixed ids"
```

---

### Task 5: The menu module

The rows expand and collapse, so the list is built in JS rather than pinned in
markup — the same way `js/hud.js` builds its layer chips.

**Files:**
- Create: `js/menu.js`
- Modify: `index.html:52-73`, `index.html:138-147`

- [ ] **Step 1: Create `js/menu.js`**

```js
/* menu.js — the mode and difficulty picker on the title screen.
 *
 * Two steps in one list. The mode rows hold their place throughout: opening one
 * strips the other two to labels and takes every digit badge off the modes, so
 * 1/2/3 only ever address the list they are drawn on. */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  /* The logo's eye in three states, drawn the same way as the mark in the h1 —
   * 24x24, stroke 1.9, round caps, colour inherited so CSS can tint them. */
  var ICONS = {
    stare:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M2.8 12C6.4 5.4 17.6 5.4 21.2 12"/>' +
      '<path d="M2.8 12C6.4 18.6 17.6 18.6 21.2 12"/>' +
      '<circle cx="12" cy="12" r="2.9" fill="currentColor" stroke="none"/></svg>',
    torch:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M1.4 12C4.2 7.4 10.6 7.4 13.4 12"/>' +
      '<path d="M1.4 12C4.2 16.6 10.6 16.6 13.4 12"/>' +
      '<circle cx="7.4" cy="12" r="1.6" fill="currentColor" stroke="none"/>' +
      '<path d="M15.33 6.24a9.8 9.8 0 0 1 0 11.52"/>' +
      '<path d="M19.26 6.21a13.2 13.2 0 0 1 0 11.58"/></svg>',
    flash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<path d="M3.4 12.8h17.2"/>' +
      '<path d="M3.4 12.8C7.4 18.8 16.6 18.8 20.6 12.8"/>' +
      '<path d="M7.6 10.4 5.5 6.9M12 10V6.2M16.4 10.4 18.5 6.9"/></svg>'
  };

  var MOVE = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 };
  var DIGIT = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

  /**
   * @param root   the container the list is drawn into
   * @param onStart called with a cell id, e.g. 'torch-hard'
   */
  PV.createMenu = function (root, onStart) {
    var open = false;    // is a mode showing its difficulties
    var mode = 0;
    var level = 1;       // Normal

    function modeId() { return PV.MODE_IDS[mode]; }
    function cellId() { return modeId() + '-' + PV.LEVELS[level]; }

    /* `num` is omitted for rows the number keys do not address — a collapsed
     * mode, or the open one, which is a heading rather than a choice. */
    function row(o) {
      return '<button class="mrow' + (o.cls ? ' ' + o.cls : '') + '" type="button"' +
        ' tabindex="-1" data-act="' + o.act + '" data-i="' + o.i + '">' +
        (o.icon ? '<span class="mico">' + o.icon + '</span>' : '') +
        '<span class="mbody"><span class="mname">' + o.name + '</span>' +
        (o.desc ? '<span class="mdesc">' + o.desc + '</span>' : '') + '</span>' +
        (o.num ? '<span class="mnum">' + (o.i + 1) + '</span>' : '') +
        '</button>';
    }

    function levelRows() {
      var copy = PV.TEXT.modes[modeId()].levels;
      return '<div class="mlevels">' + PV.LEVELS.map(function (lv, i) {
        return row({
          act: 'level', i: i, name: PV.TEXT.levels[lv], desc: copy[lv].menu,
          num: true, cls: level === i ? 'is-cursor' : ''
        });
      }).join('') + '</div>';
    }

    function render() {
      root.innerHTML = PV.MODE_IDS.map(function (id, i) {
        var copy = PV.TEXT.modes[id];
        if (!open) {
          return row({
            act: 'mode', i: i, name: copy.name, desc: copy.menu, icon: ICONS[id],
            num: true, cls: mode === i ? 'is-cursor' : ''
          });
        }
        if (i === mode) {
          return row({
            act: 'mode', i: i, name: copy.name, desc: copy.menu,
            icon: ICONS[id], cls: 'is-open'
          }) + levelRows();
        }
        return row({ act: 'mode', i: i, name: copy.name, icon: ICONS[id], cls: 'is-collapsed' });
      }).join('');
    }

    var menu = {
      /** Back to the mode list, cursor on Stare · Normal. */
      reset: function () {
        open = false;
        mode = 0;
        level = 1;
        render();
      },

      /** @returns true if the key was the menu's to handle */
      handleKey: function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;

        if (MOVE[e.code] !== undefined) {
          if (open) level = (level + MOVE[e.code] + 3) % 3;
          else mode = (mode + MOVE[e.code] + 3) % 3;
          render();
          return true;
        }

        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { menu.back(); return true; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD' ||
            e.code === 'Enter' || e.code === 'Space') {
          menu.take(null);
          return true;
        }
        if (e.code === 'Escape') { menu.back(); return true; }

        if (DIGIT[e.code] !== undefined) { menu.take(DIGIT[e.code]); return true; }
        return false;
      },

      /** Take the row under the cursor, or the numbered one. */
      take: function (i) {
        if (open) {
          if (i !== null) level = i;
          onStart(cellId());
        } else {
          if (i !== null) mode = i;
          open = true;
          render();
        }
      },

      back: function () {
        if (!open) return;
        open = false;
        render();
      }
    };

    /* Clicking a collapsed mode opens it instead — the change-of-mind path —
     * and clicking the open one folds it back up. */
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.mrow');
      if (!btn) return;
      var i = Number(btn.dataset.i);
      if (btn.dataset.act === 'level') { level = i; onStart(cellId()); return; }
      if (open && i === mode) { menu.back(); return; }
      mode = i;
      open = true;
      render();
    });

    /* Hover and the keyboard share one cursor, so there is a single "here" on
     * screen. Mode rows are exempt while a mode is open: the cursor belongs to
     * the difficulties then, and sliding past a collapsed label must not drag
     * it out of the list 1/2/3 address. */
    root.addEventListener('mouseover', function (e) {
      var btn = e.target.closest('.mrow');
      if (!btn) return;
      var i = Number(btn.dataset.i);
      if (btn.dataset.act === 'level') { level = i; render(); return; }
      if (open) return;
      mode = i;
      render();
    });

    menu.reset();
    return menu;
  };

})(window.PV);
```

- [ ] **Step 2: Swap the markup in `index.html`**

Replace lines 52-73 (the whole `<div class="diffs" …>` block and its five buttons) with:

```html
        <!-- built in js/menu.js: the rows expand and collapse, so they are not
             pinned here the way the five fixed buttons were -->
        <div class="modes" id="modes" role="group" aria-label="Mode and difficulty"></div>
```

- [ ] **Step 3: Load the new script**

In the script block at the end of `index.html`, add `menu.js` after `hud.js` and before `game.js`:

```html
<script src="js/hud.js"></script>
<script src="js/menu.js"></script>
<script src="js/game.js"></script>
```

`menu.js` reads `PV.TEXT`, `PV.MODE_IDS` and `PV.LEVELS`, all of which exist by then, and it defines a factory rather than running at load, so anywhere after `vision.js` and before `main.js` would do.

- [ ] **Step 4: Commit**

```bash
git add js/menu.js index.html
git commit -m "menu: Add the mode and difficulty picker"
```

---

### Task 6: Style the two-step list

**Files:**
- Modify: `css/style.css:141-183`

- [ ] **Step 1: Replace the `.diffs` and `.diff` rules**

Replace lines 141-183 with:

```css
/* One column, and the mode rows keep their position through both steps: the
   list never reflows under the pointer, so changing your mind is one click on
   a row that has not moved. */
.modes {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--sc, 1));
  margin-bottom: calc(22px * var(--sc, 1));
}

.mrow {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: calc(12px * var(--sc, 1));
  width: 100%;
  padding: calc(11px * var(--sc, 1)) calc(14px * var(--sc, 1));
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: calc(3px * var(--sc, 1)) solid var(--line);
  border-radius: calc(7px * var(--sc, 1));
  color: var(--ink);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color .12s, background .12s, transform .08s, opacity .12s;
}

/* Keyboard cursor and mouse hover land on the same look, so there is exactly
   one "where am I" signal on screen whichever device put it there. */
.mrow.is-cursor {
  background: #131a30;
  border-color: var(--accent2);
  border-left-color: var(--accent);
  transform: translateX(2px);
}

.mico { display: block; width: calc(26px * var(--sc, 1)); height: calc(26px * var(--sc, 1)); color: var(--accent); }
.mico svg { display: block; width: 100%; height: 100%; }

.mbody { display: flex; flex-direction: column; gap: calc(3px * var(--sc, 1)); min-width: 0; }
.mname {
  text-transform: uppercase;   /* strings.js stores names in normal case */
  font-size: calc(14px * var(--sc, 1));
  letter-spacing: calc(3px * var(--sc, 1));
  color: var(--accent);
}
.mdesc { font-size: calc(11px * var(--sc, 1)); color: var(--dim); }
.mdesc b { color: var(--ink); font-weight: 600; }

.mnum {
  align-self: start;
  min-width: calc(16px * var(--sc, 1));
  padding: calc(2px * var(--sc, 1)) 0;
  text-align: center;
  font-size: calc(10px * var(--sc, 1));
  color: var(--dim);
  border: 1px solid var(--line);
  border-radius: calc(4px * var(--sc, 1));
}
.mrow.is-cursor .mnum { color: var(--accent); border-color: var(--accent); }

/* A mode that is not the open one shrinks to a label. It keeps its place and
   stays clickable, and it loses its digit: once a mode is open the digits
   belong to its difficulties, and a second numbered list would be ambiguous. */
.mrow.is-collapsed {
  grid-template-columns: auto 1fr;
  padding: calc(5px * var(--sc, 1)) calc(14px * var(--sc, 1));
  background: transparent;
  border-color: #151a2e;
  border-left-color: #151a2e;
  opacity: .5;
}
.mrow.is-collapsed .mico { width: calc(15px * var(--sc, 1)); height: calc(15px * var(--sc, 1)); color: var(--dim); }
.mrow.is-collapsed .mname { font-size: calc(11px * var(--sc, 1)); letter-spacing: calc(2px * var(--sc, 1)); color: var(--dim); }
.mrow.is-collapsed:hover { opacity: .9; border-color: var(--line); border-left-color: var(--accent2); }

/* The open mode is a heading, not a choice, so it has no digit either. */
.mrow.is-open {
  grid-template-columns: auto 1fr;
  background: #131a30;
  border-color: var(--line);
  border-left-color: var(--accent);
}

.mlevels {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--sc, 1));
  padding: calc(6px * var(--sc, 1)) 0 calc(2px * var(--sc, 1)) calc(30px * var(--sc, 1));
}
.mlevels .mrow { grid-template-columns: 1fr auto; padding: calc(8px * var(--sc, 1)) calc(14px * var(--sc, 1)); }
.mlevels .mname { font-size: calc(12px * var(--sc, 1)); letter-spacing: calc(2px * var(--sc, 1)); }

/* The HUD badge now carries a mode and a level, which is too long for one line
   in a sidebar this narrow. */
.badge-mode { text-wrap: balance; }
```

- [ ] **Step 2: Update the reduced-motion block**

Inside `@media (prefers-reduced-motion: reduce)`, this line:

```css
  .diff:hover, .diff:focus-visible { transform: none; }
```

becomes:

```css
  .mrow.is-cursor { transform: none; }
```

- [ ] **Step 3: Confirm the old selectors are gone**

Run: `grep -n "\.diffs\|\.diff\b\|\.dname\|\.ddesc" css/style.css index.html js/`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "menu: Style the mode rows and their difficulties"
```

---

### Task 7: Wire the menu into the page

**Files:**
- Modify: `js/main.js:7,108-126,197-199,223-226,253-256`
- Modify: `js/hud.js:132`, `js/main.js:159`

- [ ] **Step 1: Build the menu once**

In `js/main.js`, after `var hint = PV.createHint();` (line 22):

```js
  var menu = PV.createMenu(document.getElementById('modes'), startGame);
```

`startGame` is declared with `function`, so it is hoisted above this line.

- [ ] **Step 2: Reset it when the menu is shown**

In `showMenu()`, after `splashEl.textContent = PV.pickSplash();`:

```js
    menu.reset();
```

- [ ] **Step 3: Delete `MENU_KEYS` and delegate**

Remove the `MENU_KEYS` literal at lines 197-199, and replace the `!game` branch
at 223-226 with:

```js
    if (!game) {
      if (menu.handleKey(e)) e.preventDefault();
      return;
    }
```

- [ ] **Step 4: Delete the old click handler**

Remove lines 253-256 — the `document.getElementById('diffs')` listener. `js/menu.js` owns clicks on its own rows now.

- [ ] **Step 5: Show the level alongside the mode**

`js/hud.js:132`:

```js
        el.badgeMode.textContent = PV.modeName(game.difficulty) + ' · ' + PV.levelName(game.difficulty);
```

`js/main.js:159`:

```js
      body = PV.modeName(game.difficulty) + ' · ' + PV.levelName(game.difficulty) +
        '  ·  ' + PV.levelBlurb(game.difficulty);
```

- [ ] **Step 6: Run every suite**

Run: `node test/modes-test.js && node test/opening-test.js && node test/torch-test.js && node test/attract-test.js && node test/maze-test.js`
Expected: all PASS.

- [ ] **Step 7: Drive it by hand**

Run: `python3 -m http.server 8000` and open `http://localhost:8000`.

Confirm all of it:
- The menu opens with three mode rows and the cursor on Stare.
- `↓` `↓` moves to Flash; `Enter` opens it; Stare and Torch shrink to dim thin labels that keep their place, and their digit badges are gone.
- `1` `2` `3` pick Easy, Normal, Hard and start a round.
- `Esc` from the difficulty list returns to the three modes.
- Clicking a collapsed row opens that mode instead; clicking the open row folds it back up.
- The HUD badge reads e.g. `TORCH · HARD` and wraps rather than truncating.
- The READY overlay reads e.g. `FLASH · EASY  ·  You stay lit, and a flash lingers`.
- The demo still runs behind the menu.

- [ ] **Step 8: Commit**

```bash
git add js/main.js js/hud.js
git commit -m "menu: Drive the picker from the page"
```

---

### Task 8: Update the README

The README states current behaviour as fact, never the change that produced it.

**Files:**
- Modify: `README.md` — the intro, `## Controls`, `## Modes`, `## Code`

- [ ] **Step 1: Rewrite the Modes table**

```markdown
## Modes

Three ways of seeing, each with three difficulties. The mode decides what a
press does; the difficulty decides how much it gives you.

| | What a press does |
|---|---|
| Stare | Lights one layer, and it stays lit until you pick another. |
| Torch | A lit circle and a forward cone travel with you, both stopping at walls. A press pings one layer outward from where you stood, through walls. |
| Flash | The board is black. A press flashes one layer, which then fades. |

| | Easy | Normal | Hard |
|---|---|---|---|
| Stare | Your last two picks, 1s | Your last pick, 1s | One of four and you can go dark, 3s |
| Torch | A wide cone that reaches, 1s | A 6-tile cone, 1s | A narrow cone, quick to fade, 2s |
| Flash | You stay lit, a 3.5s fade, 1s | A 2s fade, 1s | A 1s fade, 2s |

Your own layer is free in every cell except Stare Hard, Flash Normal and Flash
Hard, which is what makes those three the ones where you can lose yourself.
```

- [ ] **Step 2: Add `menu.js` to the Code section**

In the file list, between `js/hud.js` and `js/audio.js`:

```
    js/menu.js      the mode and difficulty picker on the title screen
```

- [ ] **Step 3: Name the new suite**

`modes-test.js` goes last in the node list so the existing ordinals still point
at the suites they describe. Replace the paragraph beginning "Six test suites"
with:

```markdown
Seven test suites, five node and two bash, none of them needing anything
installed. The second covers the ghost release ladder, the house reveal, the
dots blink and the wording of the layer nudge; the third covers Torch — its
ping's fade curve and frozen origin, the ghost blips it leaves behind, and the
line-of-sight and circle/cone math behind what the light itself reaches; the
fourth covers the menu demo, whose autopilot has to steer only into open tiles,
eat at a reasonable rate, and reach every layer as it rotates; the fifth pins
the shape of all nine cells and the guarantee that each mode's Normal plays as
that mode did before it had a ladder. None of that is visible to a layout
check. The last two are bash because what they exercise is bash;
`release-test.sh` drives `tools/release.sh` against a throwaway repo, so
nothing it does reaches GitHub.
```

Add to the run list beneath it, after `node test/attract-test.js`:

```
    node test/modes-test.js
```

- [ ] **Step 4: Fix the stale mode name in the nudge paragraph**

Replace the paragraph beginning "Five seconds into a round" with:

```markdown
Five seconds into a round, a player who hasn't pressed a number key gets a line
low on the board naming the ones that mode answers to — `Press 1/2/3 to scan`
in Torch, `Press 1/2/3/4 to flash` in Flash. Flash Easy is the exception at
`Press 1/2/3`, since it draws you always and never spends a flash on you. It
fades after ten seconds and returns each round until a pick is made, then stays
gone for the rest of the game.
```

- [ ] **Step 5: Confirm no stale names remain**

Run: `grep -n "Blink\b" README.md`
Expected: only the title `BLINK-MAN` and the licence paragraph — no mode named Blink.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: Describe the mode and difficulty grid"
```

---

## Verification

- [ ] `node test/modes-test.js` — PASS
- [ ] `node test/maze-test.js` — PASS
- [ ] `node test/opening-test.js` — PASS
- [ ] `node test/torch-test.js` — PASS
- [ ] `node test/attract-test.js` — PASS
- [ ] `bash test/release-test.sh` — PASS
- [ ] `bash test/itch-deploy-test.sh` — PASS
- [ ] All nine cells played by hand for one round each
- [ ] `grep -rn "rules\.style\|PV.DIFFICULTIES\.\(easy\|normal\|hard\|torch\|blink\)\b" js/ test/` — no output

`PV.VERSION` is not touched. The release process owns it.
