#!/usr/bin/env bash
# Cut a release. Bumps PV.VERSION, commits, tags v<version> and pushes; the
# tag is what .github/workflows/deploy.yml watches to publish to itch.io.
#
#     ./tools/release.sh 1.6.0        prompts before pushing
#     ./tools/release.sh 1.6.0 -y     skips the prompt
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
# it, so habit cannot produce vv1.6.0.
version="${version#v}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a version: $version"
tag="v$version"
[ $# -le 2 ] || die "unexpected argument: $3"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "$release_branch" ] || die "releases are cut from $release_branch, not $branch"

# Untracked files don't count as dirty: the commit below is scoped to
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

# The suites report failures on stdout, so hold their output and show it only
# when one fails.
run_suite() {
  local suite="$1" output
  output="$(node "$suite" 2>&1)" || { printf '%s\n' "$output" >&2; die "$suite failed"; }
}

run_suite test/maze-test.js
run_suite test/opening-test.js
run_suite test/torch-test.js
run_suite test/attract-test.js
printf '  tests ....................... ok\n'

sed -i "s/^\( *PV\.VERSION = '\)[^']*\(';\)\$/\1$version\2/" "$strings"
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

message="blinkman: Bump version to $version"
git commit -q -m "$message" -- "$strings"
git tag -a "$tag" -m "$message"
# Branch before tag: a tag on origin without its commit gives the workflow a
# version assert that cannot pass.
git push -q origin "$branch" || die "branch push failed. The commit and $tag are local only. Undo with:
  git tag -d $tag && git reset --hard HEAD~1"
# The branch is on origin by this point, so undoing locally would strand the
# commit there. Only the tag is missing.
git push -q origin "$tag" || die "tag push failed, but $branch already reached origin. Retry with:
  git push origin $tag"

printf 'pushed %s\n' "$tag"
