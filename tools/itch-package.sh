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
# cover.png and press/ stay out. itch hosts its own cover, and og:image is an
# absolute URL onto the Pages deploy, so the card resolves from inside the zip
# without the image being in it.
zip -r -q "$zipfile" index.html css js

echo "$zipfile"
unzip -l "$zipfile" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
