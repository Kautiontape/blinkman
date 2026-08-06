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
