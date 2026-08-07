# Deploy process

## Problem

Publishing a version is four steps held entirely in the author's head, in an
order that only matters after it has gone wrong:

1. Edit `PV.VERSION` in `js/strings.js` and commit.
2. Tag, remembering that the tag carries a `v` prefix the version string does
   not.
3. Run `./tools/itch-package.sh`.
4. Run `./tools/itch-deploy.sh`, which needs a local `butler login`.

Nothing enforces the order and nothing checks the result. Tagging before the
bump ships a build whose in-game version is stale. Forgetting steps 3 and 4
leaves a tag that never reached itch.io. Neither failure is visible from the
repository afterwards. The tests are not part of any of it, so a broken maze
generator reaches the storefront as readily as a working one.

## Definitions

- **Version string**: `PV.VERSION` in `js/strings.js`, the single source of
  truth. Currently `1.3.0`.
- **Tag**: an annotated git tag naming a version, always `v` + version string.
- **Channel**: the itch.io upload slot, `kautiontape/blink-man:html`.
- **User version**: butler's `--userversion`, which labels a build on itch
  with the version string instead of an opaque incrementing build number.

## Design

The version string is the source of truth and the author bumps it. The tag
follows from it, and CI verifies the two agree before publishing anything.

Tagging drives the deploy. `tools/release.sh` produces correct tags so the
`v` prefix and the bump-then-tag ordering never have to be recalled, and
`.github/workflows/deploy.yml` consumes them. A tag pushed by hand still
deploys; it just gets its errors from CI rather than from the script.

```
./tools/release.sh 1.4.0
  preflight -> tests -> bump -> confirm -> commit -> tag v1.4.0 -> push
                                                                     |
                                                                     v
.github/workflows/deploy.yml  (on: push tags 'v*')
  assert tag == PV.VERSION -> tests -> package -> butler push -> gh release
```

Both halves run the tests. The script runs them for fast local feedback
before anything is committed; the workflow runs them because a hand-rolled
tag skips the script entirely. Neither is redundant with the other.

## Scope

### 1. `tools/release.sh`

Takes one argument, the new version. Accepts `1.4.0` or `v1.4.0` and
normalises away a leading `v`, so habit cannot produce `vv1.4.0`.

Preflight, all fatal:

| Check | Failure |
|---|---|
| Argument matches `N.N.N` | `not a version: <arg>` |
| Working tree clean | `working tree is dirty` |
| Current branch is `main` | `releases are cut from main, not <branch>` |
| Tag does not already exist locally or on origin | `tag v1.4.0 already exists` |
| New version differs from current `PV.VERSION` | `already at 1.4.0` |

Then `node test/maze-test.js` and `node test/opening-test.js`. A failure
aborts before the working tree is touched.

Then rewrite `PV.VERSION`, print the plan, and wait for confirmation:

```
  tests ....................... ok
  js/strings.js  1.3.0 -> 1.4.0

  will commit, tag v1.4.0, and push to origin
  this publishes to itch.io/kautiontape/blink-man

Proceed? [y/N]
```

Anything but `y` or `Y` reverts the edit to `js/strings.js` and exits
non-zero, leaving the tree as it was found. `-y` as a second argument skips
the prompt.

On confirmation: commit as `blinkman: Bump version to 1.4.0`, tag `v1.4.0`
annotated with the same message, push the branch, push the tag.

The branch push precedes the tag push. A tag reaching origin without its
commit gives the workflow a version assert that cannot pass.

### 2. `.github/workflows/deploy.yml`

Triggered by `push` on tags matching `v*`. One `ubuntu-latest` job with
`permissions: contents: write`, required by the release step. One secret,
`BUTLER_API_KEY`, read by butler directly from the environment — no
`butler login` step.

| Step | Detail |
|---|---|
| Checkout | `actions/checkout@v4` |
| Assert version | `sed -n "s/^ *PV\.VERSION = '\([^']*\)';/\1/p" js/strings.js` compared against `${GITHUB_REF_NAME#v}` |
| Tests | `node test/maze-test.js`, `node test/opening-test.js` |
| Install butler | curl the `linux-amd64/LATEST` archive from `broth.itch.zone`, unzip onto the PATH |
| Package | `./tools/itch-package.sh` |
| Push | `./tools/itch-deploy.sh "${GITHUB_REF_NAME#v}"` |
| Release | `gh release create "$GITHUB_REF_NAME" dist/blinkman-itch.zip --generate-notes` |

The assert runs first so a mismatch costs nothing and publishes nothing. Its
message names the fix:

```
tag v1.4.0 does not match PV.VERSION 1.3.0 — use ./tools/release.sh
```

No `actions/setup-node`. The runner image ships Node, the two suites are
plain scripts with no dependencies and no `package.json`, and pinning a
version would add a bump to maintain for no gain.

butler is installed from itch.io's own CDN rather than a marketplace action.
The URL ends in `LATEST`, so there is no version to track, and the publish
key stays out of third-party code.

### 3. `tools/itch-deploy.sh`

Gains an optional first argument, the user version:

    ./tools/itch-deploy.sh 1.4.0

When given, it is passed through as `butler push --userversion 1.4.0`, so the
build is labelled on itch with the version the player sees in game. When
omitted the script behaves exactly as it does now, which keeps the manual
path for pushing a build without cutting a version.

CI calls this script rather than inlining butler in YAML, so the local push
and the automated push cannot drift apart.

### 4. Documentation

`README.md` Publishing section leads with the one command and keeps the
manual scripts below it as the no-version path.

`docs/itch.md` gains the one-time setup: generate a key at
itch.io/user/settings/api-keys, add it as the repository secret
`BUTLER_API_KEY`. The store page section is unchanged and stays manual.

## Out of scope

- **Store page copy.** Title, description, tags and screenshots have no API.
  butler updates the playable build and nothing else. `docs/itch.md` remains
  the checklist.
- **Tests on push or pull request.** That is CI, not deploy, and belongs in
  its own workflow file.
- **Writing `js/strings.js` from CI.** A tag is an immutable pointer, so a
  bump committed after the tag exists produces a tag whose tree disagrees
  with the build shipped from it.

## Files

| File | Change |
|---|---|
| `.github/workflows/deploy.yml` | new |
| `tools/release.sh` | new |
| `tools/itch-deploy.sh` | optional user version argument |
| `README.md` | Publishing section |
| `docs/itch.md` | secret setup |
