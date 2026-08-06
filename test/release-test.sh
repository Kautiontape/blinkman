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
