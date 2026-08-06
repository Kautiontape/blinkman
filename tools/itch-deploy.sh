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
