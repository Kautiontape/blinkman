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
  # The stubs are the suites release.sh actually names, read out of the script
  # under test, so adding one there cannot leave this fixture short a file.
  for suite in $(sed -n 's|^run_suite test/||p' "$root/tools/release.sh"); do
    printf 'process.exit(%s);\n' "$1" > "$work/repo/test/$suite"
  done
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

version_in() {
  sed -n "s/^ *PV\.VERSION = '\([^']*\)';\$/\1/p" "$work/repo/js/strings.js"
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
expect 'names the undo when the push fails' 1 'git tag -d v1.4.0 && git reset --hard HEAD~1'
if [ -z "$(git -C "$work/origin.git" tag -l v1.4.0)" ]; then
  ok 'leaves origin untagged when the branch push fails'
else
  no 'leaves origin untagged when the branch push fails' "$(git -C "$work/origin.git" tag -l)"
fi
teardown

setup 0
cat > "$work/origin.git/hooks/pre-receive" <<'HOOK'
#!/bin/sh
while read -r _ _ ref; do
  case "$ref" in refs/tags/*) exit 1 ;; esac
done
exit 0
HOOK
chmod +x "$work/origin.git/hooks/pre-receive"
run y 1.4.0
expect 'says the branch landed when only the tag push fails' 1 'already reached origin'
if [ "$(git -C "$work/origin.git" rev-parse main)" = "$(git -C "$work/repo" rev-parse main)" ]; then
  ok 'does not claim the commit is local when it reached origin'
else
  no 'does not claim the commit is local when it reached origin' 'origin main is behind'
fi
teardown

# Not a fixture case: this checks the real repo's files, not the throwaway
# one setup() builds, so it needs no setup/teardown. tools/release.sh's
# run_suite calls and .github/workflows/deploy.yml's Test step run the same
# suites in the same order; nothing else checks that, so a suite added to one
# and forgotten in the other would run in CI forever with no signal.
release_suites="$(grep -oE 'run_suite test/[a-z]+-test\.js' "$root/tools/release.sh" |
  sed -E 's#run_suite test/([a-z]+)-test\.js#\1#')"
deploy_suites="$(grep -oE 'node test/[a-z]+-test\.js' "$root/.github/workflows/deploy.yml" |
  sed -E 's#node test/([a-z]+)-test\.js#\1#')"
suite_diff="$(diff <(printf '%s\n' "$release_suites") <(printf '%s\n' "$deploy_suites"))"
if [ -z "$suite_diff" ]; then
  ok 'release.sh and deploy.yml run the same suites in the same order'
else
  no 'release.sh and deploy.yml run the same suites in the same order' \
    "tools/release.sh (<) vs .github/workflows/deploy.yml (>):
$suite_diff"
fi

# Same shape again: several test/*-test.js suites require() a subset of js/
# and are hand-ordered to mirror index.html's <script> order, because a
# module that captures a PV value at load time needs its dependency required
# first — same as it needs that dependency's <script> tag first in the
# browser. Nothing enforces the mirroring, so this checks each suite's
# require list is a subsequence of index.html's script order (not
# contiguous: a suite legitimately skips modules it doesn't need). Every
# <script src="js/...\"> tag in index.html is on its own line and none are
# commented out or conditional, so grepping the file directly is safe.
require_order() {
  perl -0777 -ne '
    s/^\s*\/\/.*$//mg;
    if (/\[([^\]]*)\]\s*\.forEach\(function\s*\(\w+\)\s*\{/) {
      my @mods = $1 =~ /'\''([a-z0-9-]+)\.js'\''/g;
      print join("\n", @mods), "\n";
    }
  ' "$1"
}

html_order="$(grep -oE '<script[^>]*\bsrc="js/[a-z]+\.js"' "$root/index.html" |
  grep -oE 'js/[a-z]+\.js' | sed -E 's#js/([a-z]+)\.js#\1#')"

# $1 suite name (matches test/$1-test.js).
check_require_order() {
  local suite="$1" file="$root/test/$1-test.js" sub mod pos
  local prev_pos=-1 prev_name='' offending=''
  sub="$(require_order "$file")"
  if [ -z "$sub" ]; then
    no "$suite-test.js's require order mirrors index.html" \
      "could not find a require array to check in $file"
    return
  fi
  while IFS= read -r mod; do
    [ -z "$mod" ] && continue
    pos="$(printf '%s\n' "$html_order" | grep -nx "$mod" | head -1 | cut -d: -f1)"
    if [ -z "$pos" ]; then
      no "$suite-test.js's require order mirrors index.html" \
        "requires '$mod.js', which index.html never loads"
      return
    fi
    if [ "$pos" -le "$prev_pos" ]; then
      offending="requires $prev_name.js before $mod.js, but index.html loads $mod.js before (or same as) $prev_name.js"
      break
    fi
    prev_pos="$pos"
    prev_name="$mod"
  done <<< "$sub"
  if [ -z "$offending" ]; then
    ok "$suite-test.js's require order mirrors index.html"
  else
    no "$suite-test.js's require order mirrors index.html" \
      "$offending
$suite-test.js: $(printf '%s' "$sub" | tr '\n' ' ')
index.html:     $(printf '%s' "$html_order" | tr '\n' ' ')"
  fi
}

for suite in aura torch flash opening modes attract; do
  check_require_order "$suite"
done

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
