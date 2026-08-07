#!/usr/bin/env bash
# Cut a release. Bumps PV.VERSION, stamps the changelog's Unreleased heading
# with the version and today's date, commits, tags v<version> and pushes; the
# tag is what .github/workflows/deploy.yml watches to publish to itch.io.
#
#     ./tools/release.sh 1.6.0        prompts before pushing
#     ./tools/release.sh 1.6.0 -y     skips the prompt
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

strings='js/strings.js'
changelog='js/changelog.js'
changelog_md='CHANGELOG.md'
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

# A release with nothing written about it is a mistake, not a shortcut: the
# notes ship in the build and on the store page. Checked here, before the
# suites, so the answer comes back straight away.
grep -q "^ *version: 'Unreleased',\$" "$changelog" ||
  die "no Unreleased section in $changelog. Add one and run: node tools/changelog.js"

# And that the two agree, before the stamp below makes the array newer than the
# Markdown by construction — past this point nothing could tell a hand edit in
# CHANGELOG.md apart from the stamp, and the regeneration would erase it.
node tools/changelog.js --check || die 'reconcile the changelog before releasing'

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

# The same node suites .github/workflows/deploy.yml runs, so a release that
# passes here is one the tag's workflow will not reject. test/release-test.sh
# drives this script, so running it from in here would recurse; it and
# test/itch-deploy-test.sh are run by hand.
run_suite test/maze-test.js
run_suite test/progression-test.js
run_suite test/opening-test.js
run_suite test/torch-test.js
run_suite test/attract-test.js
run_suite test/modes-test.js
run_suite test/flash-test.js
run_suite test/aura-test.js
run_suite test/banner-layout-test.js
run_suite test/changelog-test.js
printf '  tests ....................... ok\n'

sed -i "s/^\( *PV\.VERSION = '\)[^']*\(';\)\$/\1$version\2/" "$strings"
printf '  %s  %s -> %s\n' "$strings" "$current" "$version"

# The heading and its date are one entry, so both seds have exactly one line to
# hit. CHANGELOG.md is regenerated rather than edited: js/changelog.js is the
# source and the suite above compares the two.
today="$(date +%F)"
sed -i "s/^\( *version: '\)Unreleased\(',\)\$/\1$version\2/" "$changelog"
sed -i "s/^\( *date: '\)\(',\)\$/\1$today\2/" "$changelog"
node tools/changelog.js --force >/dev/null || {
  git checkout -- "$strings" "$changelog" "$changelog_md"
  die "could not regenerate $changelog_md"
}
printf '  %s   Unreleased -> %s, %s\n\n' "$changelog" "$version" "$today"
printf '  will commit, tag %s, and push to origin\n' "$tag"
printf '  this publishes to %s\n\n' "$storefront"

if [ "${2:-}" != '-y' ]; then
  reply=''
  read -r -p 'Proceed? [y/N] ' reply || true
  case "$reply" in
    y | Y) printf '\n' ;;
    *) git checkout -- "$strings" "$changelog" "$changelog_md"; die 'aborted' ;;
  esac
fi

message="blinkman: Bump version to $version"
git commit -q -m "$message" -- "$strings" "$changelog" "$changelog_md"
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
