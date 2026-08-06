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
