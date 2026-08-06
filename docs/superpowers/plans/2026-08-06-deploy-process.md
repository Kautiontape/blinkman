# Deploy process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn publishing into `./tools/release.sh 1.4.0`, with a tag-triggered GitHub Actions workflow that tests, packages and pushes the build to itch.io.

**Architecture:** `PV.VERSION` in `js/strings.js` stays the source of truth and the author bumps it. `tools/release.sh` owns the local half — preflight, tests, bump, commit, tag, push — so the `v` prefix and the bump-then-tag ordering never have to be recalled. Pushing a `v*` tag triggers `.github/workflows/deploy.yml`, which re-asserts that the tag matches `PV.VERSION`, re-runs the tests, then packages and publishes. Both halves call the same `tools/itch-*.sh` scripts, so the local and automated pushes cannot drift.

**Tech Stack:** bash, GitHub Actions, [butler](https://itch.io/docs/butler/) from itch.io's broth CDN, `gh` (preinstalled on the runner), Node 22 (preinstalled on the runner) for the existing dependency-free test suites.

**Spec:** `docs/superpowers/specs/2026-08-06-deploy-process-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/release.sh` | new — the local half: preflight, tests, bump, commit, tag, push |
| `tools/itch-deploy.sh` | modify — optional user version argument passed to butler |
| `.github/workflows/deploy.yml` | new — the CI half: assert, test, package, push, release |
| `test/release-test.sh` | new — drives `release.sh` against a throwaway repo with a local origin |
| `test/itch-deploy-test.sh` | new — asserts the butler command line via a stub on `PATH` |
| `js/strings.js:13-15` | modify — the comment tells you to bump and tag by hand |
| `README.md:134-137` | modify — Publishing section |
| `docs/itch.md` | modify — releasing, and the one-time secret setup |

`release.sh` is the only new file with real branching, and its tests are the reason it gets one. The two test scripts are bash rather than the repo's usual Node, because what they exercise is bash. Both stay dependency-free and runnable by hand, which is the property the existing suites actually have.

Tasks 2-5 build `release.sh` incrementally. Each task leaves it runnable and its tests green; later tasks only add assertions, never rewrite earlier ones.

---

### Task 1: Test harness and the itch-deploy user version

**Files:**
- Create: `test/itch-deploy-test.sh`
- Modify: `tools/itch-deploy.sh`

- [ ] **Step 1: Write the failing test**

Create `test/itch-deploy-test.sh`:

```bash
#!/usr/bin/env bash
# Asserts the butler command line itch-deploy.sh builds, using a stub on PATH
# so nothing is uploaded.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0
fail=0

ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
no() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; printf '%s\n' "$2" | sed 's/^/         /'; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
cat > "$work/bin/butler" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$BUTLER_LOG"
STUB
chmod +x "$work/bin/butler"

# Runs itch-deploy.sh with butler stubbed. Sets $log to what butler received.
run() {
  : > "$work/log"
  PATH="$work/bin:$PATH" BUTLER_LOG="$work/log" "$root/tools/itch-deploy.sh" "$@" >/dev/null 2>&1
  log="$(cat "$work/log")"
}

expect() {
  local desc="$1" needle="$2"
  if [[ "$log" == *"$needle"* ]]; then ok "$desc"; else no "$desc" "$log"; fi
}

reject() {
  local desc="$1" needle="$2"
  if [[ "$log" != *"$needle"* ]]; then ok "$desc"; else no "$desc" "$log"; fi
}

run 1.4.0
expect 'labels the build with the version given' '--userversion 1.4.0'
expect 'pushes to the html channel' 'kautiontape/blink-man:html'

run
reject 'omits userversion when no version is given' '--userversion'
expect 'still pushes to the html channel' 'kautiontape/blink-man:html'

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
chmod +x test/itch-deploy-test.sh
bash test/itch-deploy-test.sh
```

Expected: FAIL on `labels the build with the version given` — the current script ignores arguments, so `--userversion` never reaches butler.

- [ ] **Step 3: Write minimal implementation**

Replace `tools/itch-deploy.sh` entirely:

```bash
#!/usr/bin/env bash
# Push the packaged build to itch.io. A version argument labels the build with
# it; without one, itch assigns an opaque build number.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
zipfile="$root/dist/blinkman-itch.zip"
channel='kautiontape/blink-man:html'

if [ -n "${1:-}" ]; then
  butler push "$zipfile" "$channel" --userversion "$1"
else
  butler push "$zipfile" "$channel"
fi

butler status "$channel"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash test/itch-deploy-test.sh
```

Expected: `4 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add test/itch-deploy-test.sh tools/itch-deploy.sh
git commit -m "deploy: Label itch builds with the version"
```

---

### Task 2: release.sh argument handling

**Files:**
- Create: `tools/release.sh`
- Create: `test/release-test.sh`

- [ ] **Step 1: Write the failing test**

Create `test/release-test.sh`:

```bash
#!/usr/bin/env bash
# Drives tools/release.sh against a throwaway repo whose origin is a local
# bare clone, so the commit, tag and push paths run for real without reaching
# GitHub. The game's suites are stubbed: what is under test is the release
# plumbing, not the maze generator.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0
fail=0
work=''
trap 'rm -rf "$work"' EXIT
out=''
code=0

ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
no() { fail=$((fail + 1)); printf '  FAIL %s\n' "$1"; printf '%s\n' "$2" | sed 's/^/         /'; }

# $1 is the exit code the stubbed suites return, so a test can drive the
# tests-fail path.
setup() {
  work="$(mktemp -d)"
  git init -q --bare "$work/origin.git"
  git init -q -b main "$work/repo"
  git -C "$work/repo" config user.email release-test@example.com
  git -C "$work/repo" config user.name 'release test'
  mkdir -p "$work/repo/tools" "$work/repo/js" "$work/repo/test"
  cp "$root/tools/release.sh" "$work/repo/tools/release.sh"
  printf "  PV.VERSION = '1.3.0';\n" > "$work/repo/js/strings.js"
  printf 'process.exit(%s);\n' "$1" > "$work/repo/test/maze-test.js"
  printf 'process.exit(%s);\n' "$1" > "$work/repo/test/opening-test.js"
  git -C "$work/repo" add -A
  git -C "$work/repo" commit -q -m init
  git -C "$work/repo" remote add origin "$work/origin.git"
  git -C "$work/repo" push -q -u origin main
}

teardown() { rm -rf "$work"; work=''; }

# $1 is fed to the prompt, the rest are release.sh arguments.
run() {
  local reply="$1"
  shift
  out="$(printf '%s\n' "$reply" | (cd "$work/repo" && ./tools/release.sh "$@") 2>&1)"
  code=$?
}

# $1 description, $2 expected exit status, $3 substring expected in output.
expect() {
  local desc="$1" want="$2" needle="$3"
  if [ "$code" = "$want" ] && [[ "$out" == *"$needle"* ]]; then
    ok "$desc"
  else
    no "$desc" "exit $code, want $want
$out"
  fi
}

setup 0
run '' nope
expect 'rejects an argument that is not a version' 1 'not a version: nope'
run '' 1.4
expect 'rejects a two-part version' 1 'not a version: 1.4'
run '' ''
expect 'rejects a missing argument' 1 'usage: tools/release.sh'
teardown

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
chmod +x test/release-test.sh
bash test/release-test.sh
```

Expected: all three FAIL — `tools/release.sh` does not exist, so `cp` errors and the script is not found.

- [ ] **Step 3: Write minimal implementation**

Create `tools/release.sh`:

```bash
#!/usr/bin/env bash
# Cut a release. Bumps PV.VERSION, commits, tags v<version> and pushes; the
# tag is what .github/workflows/deploy.yml watches to publish to itch.io.
#
#     ./tools/release.sh 1.4.0        prompts before pushing
#     ./tools/release.sh 1.4.0 -y     skips the prompt
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

strings='js/strings.js'
release_branch='main'
storefront='itch.io/kautiontape/blink-man'

die() { printf '%s\n' "$*" >&2; exit 1; }

version="${1:-}"
[ -n "$version" ] || die 'usage: tools/release.sh <version> [-y]'
# A leading v belongs to the tag, not the version string. Accept it and strip
# it, so habit cannot produce vv1.4.0.
version="${version#v}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a version: $version"
tag="v$version"

printf '%s\n' "$tag"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
chmod +x tools/release.sh
bash test/release-test.sh
```

Expected: `3 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/release.sh test/release-test.sh
git commit -m "deploy: Add release.sh version argument handling"
```

---

### Task 3: release.sh preflight checks

**Files:**
- Modify: `tools/release.sh`
- Modify: `test/release-test.sh`

- [ ] **Step 1: Write the failing test**

In `test/release-test.sh`, replace the block between `setup 0` / `teardown` and the trailing summary with this. The three Task 2 cases stay as they are; six new blocks follow them.

```bash
setup 0
run '' nope
expect 'rejects an argument that is not a version' 1 'not a version: nope'
run '' 1.4
expect 'rejects a two-part version' 1 'not a version: 1.4'
run '' ''
expect 'rejects a missing argument' 1 'usage: tools/release.sh'
teardown

setup 0
git -C "$work/repo" checkout -q -b feature
run '' 1.4.0
expect 'refuses to release off main' 1 'releases are cut from main, not feature'
teardown

setup 0
printf 'stray\n' >> "$work/repo/js/strings.js"
run '' 1.4.0
expect 'refuses a dirty working tree' 1 'working tree is dirty'
teardown

setup 0
run '' 1.3.0
expect 'refuses the version already in strings.js' 1 'already at 1.3.0'
teardown

setup 0
git -C "$work/repo" tag v1.4.0
run '' 1.4.0
expect 'refuses a tag that already exists' 1 'tag v1.4.0 already exists'
teardown

setup 0
git -C "$work/repo" tag v1.4.0
git -C "$work/repo" push -q origin v1.4.0
git -C "$work/repo" tag -d v1.4.0 >/dev/null
run '' 1.4.0
expect 'refuses a tag that already exists on origin' 1 'tag v1.4.0 already exists on origin'
teardown

setup 0
git -C "$work/repo" remote remove origin
run '' 1.4.0
expect 'aborts when origin cannot be checked' 1 'could not check origin for existing tags'
teardown
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash test/release-test.sh
```

Expected: the three Task 2 cases pass; the six new ones FAIL, because `release.sh` currently prints the tag and exits 0 regardless of repository state.

- [ ] **Step 3: Write minimal implementation**

In `tools/release.sh`, replace the final `printf '%s\n' "$tag"` line with:

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "$release_branch" ] || die "releases are cut from $release_branch, not $branch"

# Untracked files don't count as dirty: the commit in Task 5 is scoped to
# js/strings.js, not git add -A.
git diff-index --quiet HEAD -- || die 'working tree is dirty'

current="$(sed -n "s/^ *PV\.VERSION = '\([^']*\)';\$/\1/p" "$strings")"
[ -n "$current" ] || die "no PV.VERSION in $strings"
[ "$version" != "$current" ] || die "already at $version"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  die "tag $tag already exists"
fi
remote_tag="$(git ls-remote --tags origin "$tag")" || die 'could not check origin for existing tags'
[ -z "$remote_tag" ] || die "tag $tag already exists on origin"
```

The `if` form matters for the local-tag check. Under `set -e`, an `a && die ...` compound whose left side fails returns non-zero and takes the whole script down with it. The origin check instead assigns `remote_tag` as a plain statement so `||` sees git's real exit status — an `if` there would swallow a `git ls-remote` failure (no origin, no network, expired credentials) and let the script continue as though the tag were absent.

- [ ] **Step 4: Run test to verify it passes**

```bash
bash test/release-test.sh
```

Expected: `9 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/release.sh test/release-test.sh
git commit -m "deploy: Add release.sh preflight checks"
```

---

### Task 4: release.sh test gate, bump and confirmation

**Files:**
- Modify: `tools/release.sh`
- Modify: `test/release-test.sh`

- [ ] **Step 1: Write the failing test**

Append these four blocks to `test/release-test.sh`, immediately before the `printf '\n%s passed...'` summary. `version_in` reads the fixture's version back; define it next to the other helpers near the top of the file.

```bash
# Add beside ok/no/setup/teardown, above the test blocks:
version_in() {
  sed -n "s/^ *PV\.VERSION = '\([^']*\)';/\1/p" "$work/repo/js/strings.js"
}

# $1 description, $2 expected version in the fixture's strings.js.
expect_version() {
  local desc="$1" want="$2"
  if [ "$(version_in)" = "$want" ]; then
    ok "$desc"
  else
    no "$desc" "version is $(version_in)"
  fi
}
```

```bash
setup 1
run y 1.4.0
expect 'aborts when a suite fails' 1 'test/maze-test.js failed'
expect_version 'leaves strings.js alone when a suite fails' '1.3.0'
teardown

setup 0
run n 1.4.0
expect 'aborts when the prompt is declined' 1 'aborted'
expect_version 'reverts the bump when the prompt is declined' '1.3.0'
teardown

setup 0
run y 1.4.0
expect 'shows the bump before asking' 0 '1.3.0 -> 1.4.0'
expect_version 'bumps strings.js when accepted' '1.4.0'
teardown

setup 0
run '' 1.4.0 -y
expect 'skips the prompt with -y' 0 '1.3.0 -> 1.4.0'
teardown

setup 0
out="$(cd "$work/repo" && ./tools/release.sh 1.4.0 </dev/null 2>&1)"
code=$?
expect 'declines safely when stdin is closed' 1 'aborted'
expect_version 'reverts the bump when stdin is closed' '1.3.0'
teardown

setup 1
printf 'console.log("BROKEN: quadrant 3"); process.exit(1);\n' > "$work/repo/test/maze-test.js"
git -C "$work/repo" commit -q -am 'stub with console.log'
run y 1.4.0
expect 'surfaces the failing suite output' 1 'BROKEN: quadrant 3'
teardown

setup 0
run '' 1.4.0 -y extra
expect 'rejects a stray argument' 1 'unexpected argument: extra'
teardown
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash test/release-test.sh
```

Expected: the nine earlier cases pass; the seven new ones FAIL, because `release.sh` exits after preflight without running the suites, editing `js/strings.js` or prompting.

- [ ] **Step 3: Write minimal implementation**

Append to `tools/release.sh`, and add the stray-argument guard right after the version is parsed:

```bash
tag="v$version"
[ $# -le 2 ] || die "unexpected argument: $3"
```

```bash
# The suites report failures on stdout, so hold their output and show it only
# when one fails.
run_suite() {
  local suite="$1" output
  output="$(node "$suite" 2>&1)" || { printf '%s\n' "$output" >&2; die "$suite failed"; }
}

run_suite test/maze-test.js
run_suite test/opening-test.js
printf '  tests ....................... ok\n'

sed -i "s/^\( *PV\.VERSION = '\)[^']*\(';\)/\1$version\2/" "$strings"
printf '  %s  %s -> %s\n\n' "$strings" "$current" "$version"
printf '  will commit, tag %s, and push to origin\n' "$tag"
printf '  this publishes to %s\n\n' "$storefront"

if [ "${2:-}" != '-y' ]; then
  reply=''
  read -r -p 'Proceed? [y/N] ' reply || true
  case "$reply" in
    y | Y) printf '\n' ;;
    *) git checkout -- "$strings"; die 'aborted' ;;
  esac
fi
```

`read` gets `|| true` because `set -e` would otherwise exit on EOF before the revert runs, leaving a bumped file behind. `run_suite` captures each suite's output instead of discarding it, so a failure prints the suite's diagnostics before `die` exits.

- [ ] **Step 4: Run test to verify it passes**

```bash
bash test/release-test.sh
```

Expected: `20 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/release.sh test/release-test.sh
git commit -m "deploy: Add release.sh test gate and confirmation"
```

---

### Task 5: release.sh commit, tag and push

**Files:**
- Modify: `tools/release.sh`
- Modify: `test/release-test.sh`

- [ ] **Step 1: Write the failing test**

Append these two blocks before the summary in `test/release-test.sh`:

```bash
setup 0
run y 1.4.0
expect 'reports the pushed tag' 0 'pushed v1.4.0'
if [ "$(git -C "$work/repo" log -1 --pretty=%s)" = 'blinkman: Bump version to 1.4.0' ]; then
  ok 'commits in the project style'
else
  no 'commits in the project style' "$(git -C "$work/repo" log -1 --pretty=%s)"
fi
if [ -n "$(git -C "$work/origin.git" tag -l v1.4.0)" ]; then
  ok 'pushes the tag to origin'
else
  no 'pushes the tag to origin' "$(git -C "$work/origin.git" tag -l)"
fi
if [ "$(git -C "$work/origin.git" rev-parse main)" = "$(git -C "$work/repo" rev-parse main)" ]; then
  ok 'pushes the branch to origin'
else
  no 'pushes the branch to origin' 'origin main is behind'
fi
teardown

setup 0
run y v1.4.0
expect 'accepts a v-prefixed argument' 0 'pushed v1.4.0'
if [ -z "$(git -C "$work/origin.git" tag -l vv1.4.0)" ]; then
  ok 'does not double the v prefix'
else
  no 'does not double the v prefix' "$(git -C "$work/origin.git" tag -l)"
fi
teardown

setup 0
git clone -q "$work/origin.git" "$work/other"
git -C "$work/other" config user.email release-test@example.com
git -C "$work/other" config user.name 'release test'
printf 'diverged\n' > "$work/other/README"
git -C "$work/other" add -A
git -C "$work/other" commit -q -m diverge
git -C "$work/other" push -q origin main
run y 1.4.0
expect 'stops when the branch push is rejected' 1 'rejected'
if [ -z "$(git -C "$work/origin.git" tag -l v1.4.0)" ]; then
  ok 'leaves origin untagged when the branch push fails'
else
  no 'leaves origin untagged when the branch push fails' "$(git -C "$work/origin.git" tag -l)"
fi
teardown
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash test/release-test.sh
```

Expected: the twenty earlier cases pass; the six new ones FAIL — `release.sh` exits after the prompt without committing, tagging or pushing.

- [ ] **Step 3: Write minimal implementation**

Append to `tools/release.sh`:

```bash
message="blinkman: Bump version to $version"
git commit -q -m "$message" -- "$strings"
git tag -a "$tag" -m "$message"
# Branch before tag: a tag on origin without its commit gives the workflow a
# version assert that cannot pass.
git push -q origin "$branch"
git push -q origin "$tag"

printf 'pushed %s\n' "$tag"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash test/release-test.sh
```

Expected: `28 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/release.sh test/release-test.sh
git commit -m "deploy: Add release.sh commit, tag and push"
```

---

### Task 6: The deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

There is no unit test for a workflow file. Verification is the YAML parsing check in Step 2 plus the version-assert logic exercised directly in Step 3, which is the only part with branching.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # First, so a mismatch costs nothing and publishes nothing.
      - name: Check the tag against PV.VERSION
        run: |
          version="${GITHUB_REF_NAME#v}"
          source="$(sed -n "s/^ *PV\.VERSION = '\([^']*\)';/\1/p" js/strings.js)"
          if [ "$version" != "$source" ]; then
            echo "tag $GITHUB_REF_NAME does not match PV.VERSION $source — use ./tools/release.sh" >&2
            exit 1
          fi

      # The runner ships Node and the suites have no dependencies, so there is
      # no setup-node step and no version to keep bumping.
      - name: Test
        run: |
          node test/maze-test.js
          node test/opening-test.js

      # itch.io's own CDN. The URL ends in LATEST, so there is nothing to pin
      # and nothing to track, and the publish key stays out of third-party code.
      - name: Install butler
        run: |
          curl -sSL -o butler.zip https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default
          mkdir -p "$HOME/.local/bin"
          unzip -q butler.zip -d "$HOME/.local/bin"
          chmod +x "$HOME/.local/bin/butler"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      - name: Package
        run: ./tools/itch-package.sh

      - name: Push to itch.io
        env:
          BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
        run: ./tools/itch-deploy.sh "${GITHUB_REF_NAME#v}"

      - name: Create the GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" dist/blinkman-itch.zip --generate-notes
```

butler reads `BUTLER_API_KEY` from the environment, so there is no `butler login` step.

- [ ] **Step 2: Verify the YAML parses**

```bash
node -e "const s=require('fs').readFileSync('.github/workflows/deploy.yml','utf8'); if(!/^\s{6}- uses: actions\/checkout@v4$/m.test(s)) throw new Error('checkout step missing'); if(!/BUTLER_API_KEY/.test(s)) throw new Error('secret missing'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Verify the version assert against the real file**

Confirm the matching case passes and the mismatching case fails with the guiding message:

```bash
source="$(sed -n "s/^ *PV\.VERSION = '\([^']*\)';/\1/p" js/strings.js)"
[ "$source" = "1.3.0" ] && echo "match ok"
for ref in v1.3.0 v9.9.9; do
  version="${ref#v}"
  if [ "$version" != "$source" ]; then
    echo "$ref -> rejected: does not match PV.VERSION $source"
  else
    echo "$ref -> accepted"
  fi
done
```

Expected:

```
match ok
v1.3.0 -> accepted
v9.9.9 -> rejected: does not match PV.VERSION 1.3.0
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "deploy: Publish to itch.io on a version tag"
```

---

### Task 7: Documentation

**Files:**
- Modify: `js/strings.js:13-15`
- Modify: `README.md:134-137`
- Modify: `docs/itch.md:1-13`

- [ ] **Step 1: Update the version comment**

In `js/strings.js`, replace the comment above `PV.VERSION`:

```js
  /* Shown in the menu's bottom corner and logged to the console, so you can
   * tell at a glance which build a deploy is actually serving.
   * ./tools/release.sh bumps this, tags it and pushes. */
```

- [ ] **Step 2: Update the README Publishing section**

Replace lines 134-137 of `README.md`:

```markdown
## Publishing

    ./tools/release.sh 1.4.0

Bumps `PV.VERSION`, commits, tags `v1.4.0` and pushes. The tag triggers
`.github/workflows/deploy.yml`, which checks the tag against `PV.VERSION`, runs
both suites, packages the zip and pushes it to itch.io.

To ship a build without cutting a version, `./tools/itch-package.sh` builds the
zip and `./tools/itch-deploy.sh` pushes it. `docs/itch.md` covers the store
page, which stays manual.
```

- [ ] **Step 3: Update docs/itch.md**

Replace lines 1-13 of `docs/itch.md` (everything above `## Project settings`):

```markdown
# Publishing to itch.io

## Releasing

    ./tools/release.sh 1.4.0

Bumps the version, tags it and pushes. The tag triggers
`.github/workflows/deploy.yml`, which packages the zip and pushes it to the
`html` channel.

The workflow needs one secret. Generate a key at
<https://itch.io/user/settings/api-keys> and add it to the repository as
`BUTLER_API_KEY`, under Settings → Secrets and variables → Actions.

butler updates the playable build and nothing else. Everything below — title,
description, tags, screenshots — has no API and stays manual.

## Building by hand

    ./tools/itch-package.sh

That writes `dist/blinkman-itch.zip` (~30 KB) with `index.html` at the archive
root, which is what itch looks for.

Push it to the `html` channel with [butler](https://itch.io/docs/butler/),
which needs `butler login` once:

    ./tools/itch-deploy.sh
```

- [ ] **Step 4: Verify the docs match the code**

```bash
grep -n "release.sh" README.md docs/itch.md js/strings.js
node test/maze-test.js && node test/opening-test.js && echo "suites ok"
bash test/release-test.sh
bash test/itch-deploy-test.sh
```

Expected: `release.sh` appears in all three files, both game suites pass, and both new suites report `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add js/strings.js README.md docs/itch.md
git commit -m "deploy: Document the release command"
```

---

## After the plan

Two things remain that no task can do:

1. **Add the secret.** Generate a key at <https://itch.io/user/settings/api-keys> and add it as the repository secret `BUTLER_API_KEY`. Until then the workflow reaches the push step and fails there — after the tests and packaging have already passed, so the failure is unambiguous.
2. **Merge to `main`.** `release.sh` refuses to run off `main`, so the first real release has to follow the merge of this branch.

The first end-to-end run is `./tools/release.sh 1.4.0` from `main`. Watch the Actions tab; if the butler step fails, the tag is already pushed, so fix the secret and re-run the job rather than re-tagging.
