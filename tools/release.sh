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
