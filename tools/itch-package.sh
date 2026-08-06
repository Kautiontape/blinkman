#!/usr/bin/env bash
# Build the itch.io upload. Produces dist/blinkman-itch.zip with index.html at
# the root of the archive, which is what itch expects for an HTML5 game.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/dist"
zipfile="$out/blinkman-itch.zip"

mkdir -p "$out"
rm -f "$zipfile"

cd "$root"
# cover.png stays out: it exists for og:image on the web deploy, and itch hosts
# its own cover. The og:image tag 404s inside the zip; harmless.
zip -r -q "$zipfile" index.html css js

echo "$zipfile"
unzip -l "$zipfile" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
