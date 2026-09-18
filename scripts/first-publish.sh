#!/usr/bin/env bash
# scripts/first-publish.sh
#
# One-time, by hand: publish the first version of every package this repository
# releases (the sets in scripts/release-sets.mjs), because npm only lets a
# trusted publisher be attached to a package that already exists. After this,
# register the trusted publishers it prints, and every later version publishes
# from GitHub Actions (.github/workflows/publish.yml) on a tag.
#
# Usage, from anywhere in the repository, after `npm login`:
#   scripts/first-publish.sh            build, check, pack and publish
#   scripts/first-publish.sh --dry-run  everything except the upload (npm publish --dry-run)
#
# It refuses to run from a working tree with uncommitted changes, publishes the
# tarballs that scripts/check-packed-manifests.mjs has checked (never
# `npm publish` inside a package directory, which would ship `workspace:`
# ranges), skips every version already on npm, and asks for your one-time
# password (OTP) once, only if npm asks for one. Safe to re-run.

set -euo pipefail

DRY_RUN=0
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=1 ;;
  -h | --help)
    sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "first-publish: unknown option $1 (use --dry-run or --help)" >&2
    exit 2
    ;;
esac

REPO_OWNER="marlinjai"
REPO_NAME="email-editor"
WORKFLOW_FILE="publish.yml"

root="$(git rev-parse --show-toplevel)"
cd "$root"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\nfirst-publish: %s\n' "$*" >&2
  exit 1
}

# --- Preconditions ------------------------------------------------------------

command -v pnpm >/dev/null || fail "pnpm is not installed."
command -v npm >/dev/null || fail "npm is not installed."
command -v node >/dev/null || fail "node is not installed."

if [ -n "$(git status --porcelain)" ]; then
  fail "the working tree has uncommitted changes. Publish from a clean checkout of main."
fi
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "Note: you are on '$branch', not main. The published code is this commit: $(git rev-parse --short HEAD)."
fi

if [ "$DRY_RUN" -eq 0 ]; then
  npm_user="$(npm whoami 2>/dev/null)" || fail "not logged in to npm. Run 'npm login' first, then run this again."
  echo "Publishing as npm user: $npm_user"
fi

# One line per package, in publish order: <set> <tag prefix> <dir> <npm name> <version>
table="$(node scripts/release-sets.mjs --table)"

# --- Build, check, pack ---------------------------------------------------------

say "Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

say "Typechecking, testing and building every published package"
node scripts/release-sets.mjs --all | sed 's/.*/--filter=&.../' | xargs pnpm turbo run lint test build

tarballs="$(mktemp -d "${TMPDIR:-/tmp}/first-publish.XXXXXX")"
trap 'rm -rf "$tarballs"' EXIT

say "Packing and checking the tarballs"
node scripts/check-packed-manifests.mjs --out "$tarballs"

# --- Publish ----------------------------------------------------------------------

otp=""
published=()
# npm reads from the terminal when it needs you (a login or approval prompt);
# the package loop's own input is the table, so hand npm the terminal instead.
if { : </dev/tty; } 2>/dev/null; then tty_in=/dev/tty; else tty_in=/dev/null; fi
skipped=()

# Publish one tarball. If npm asks for a one-time password, ask once and reuse
# it; ask again only if npm rejects it (a code expires after about 30 seconds).
publish_tarball() {
  local tarball="$1"
  local log
  log="$(mktemp "${TMPDIR:-/tmp}/first-publish-log.XXXXXX")"
  for _ in 1 2 3; do
    local args=(publish "$tarball" --access public --provenance=false)
    [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
    [ -n "$otp" ] && args+=(--otp "$otp")
    set +e
    npm "${args[@]}" <"$tty_in" 2>&1 | tee "$log"
    local status="${PIPESTATUS[0]}"
    set -e
    if [ "$status" -eq 0 ]; then
      rm -f "$log"
      return 0
    fi
    if grep -qiE 'EOTP|one-time password|one time password' "$log"; then
      if [ -n "$otp" ]; then
        echo "npm did not accept that one-time password (it may have expired)."
      fi
      [ "$tty_in" = /dev/tty ] || fail "npm asks for a one-time password, but there is no terminal to type it in. Run this from a terminal."
      read -r -s -p "npm one-time password: " otp </dev/tty
      echo
      continue
    fi
    rm -f "$log"
    return "$status"
  done
  rm -f "$log"
  fail "npm kept asking for a one-time password. Nothing after this package was published; re-run to continue."
}

current_set=""
while read -r set _tag dir pkg version; do
  if [ "$set" != "$current_set" ]; then
    say "Release set: $set"
    current_set="$set"
  fi
  tarball="$tarballs/$(echo "${pkg#@}" | tr '/' '-')-$version.tgz"
  [ -f "$tarball" ] || fail "expected tarball $tarball for packages/$dir is missing."

  if npm view "$pkg@$version" version >/dev/null 2>&1; then
    echo "skip    $pkg@$version (already on npm)"
    skipped+=("$pkg@$version")
    continue
  fi
  echo "publish $pkg@$version"
  publish_tarball "$tarball" || fail "publishing $pkg@$version failed (see npm's output above). Fix it and re-run: published versions are skipped."
  published+=("$pkg@$version")
done <<<"$table"

# --- What to register next ---------------------------------------------------------

if [ "$DRY_RUN" -eq 1 ]; then say "Done (dry run: nothing was uploaded)"; else say "Done"; fi
if [ "$DRY_RUN" -eq 1 ]; then done_label="would publish"; else done_label="published"; fi
if [ "${#published[@]}" -gt 0 ]; then printf "  $done_label: %s\n" "${published[@]}"; fi
if [ "${#skipped[@]}" -gt 0 ]; then printf '  already on npm: %s\n' "${skipped[@]}"; fi

say "Now register a trusted publisher for each package on npmjs.com"
echo "Open each link, choose 'GitHub Actions' under Trusted Publisher, and enter exactly:"
echo "  Organization or user:  $REPO_OWNER"
echo "  Repository:            $REPO_NAME"
echo "  Workflow filename:     $WORKFLOW_FILE"
echo "  Environment name:      (leave empty)"
echo
while read -r _set _tag _dir pkg _version; do
  echo "  $pkg"
  echo "    https://www.npmjs.com/package/$pkg/access"
done <<<"$table"

say "Then push the release tags, which the workflow turns into a check that the setup works"
# One tag per set: its prefix plus the version its packages share.
while read -r tag version; do
  echo "  git tag $tag$version && git push origin $tag$version"
done < <(awk '!seen[$1]++ { print $2, $5 }' <<<"$table")
echo
echo "The publish workflow skips versions already on npm, so these first tags only prove"
echo "the trusted publishers are registered; later tags publish with provenance."
