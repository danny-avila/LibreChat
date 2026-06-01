#!/usr/bin/env bash
set -euo pipefail

CHART_PATH="${CHART_PATH:-helm/librechat/Chart.yaml}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
BASE_REF="${BASE_REF:-refs/remotes/origin/${DEFAULT_BRANCH}}"
PUSH_TAGS="${PUSH_TAGS:-false}"
TAG_PREFIX="${TAG_PREFIX:-chart-}"
GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
DISPATCH_WORKFLOW="${DISPATCH_WORKFLOW:-}"
SEMVER_REGEX='^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(-[0-9A-Za-z-]+([.][0-9A-Za-z-]+)*)?([+][0-9A-Za-z-]+([.][0-9A-Za-z-]+)*)?$'

fail() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

git_with_auth() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    git -c "http.${GITHUB_SERVER_URL}/.extraheader=AUTHORIZATION: bearer ${GITHUB_TOKEN}" "$@"
    return
  fi

  git "$@"
}

dispatch_release() {
  tag="$1"

  if [ -z "$DISPATCH_WORKFLOW" ]; then
    return
  fi

  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    fail "GITHUB_REPOSITORY is required to dispatch ${DISPATCH_WORKFLOW}"
  fi

  if [[ ! "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    fail "Unexpected repository name: ${GITHUB_REPOSITORY}"
  fi

  if [[ ! "$DISPATCH_WORKFLOW" =~ ^[A-Za-z0-9_.-]+[.]ya?ml$ ]]; then
    fail "Unexpected workflow file: ${DISPATCH_WORKFLOW}"
  fi

  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [ -z "$token" ]; then
    fail "GH_TOKEN or GITHUB_TOKEN is required to dispatch ${DISPATCH_WORKFLOW}"
  fi

  command -v gh >/dev/null ||
    fail "GitHub CLI is required to dispatch ${DISPATCH_WORKFLOW}"

  GH_TOKEN="$token" gh workflow run "$DISPATCH_WORKFLOW" \
    --repo "$GITHUB_REPOSITORY" \
    --ref "$DEFAULT_BRANCH" \
    -f "chart_tag=${tag}"
}

chart_version_at() {
  git show "${1}:${CHART_PATH}" 2>/dev/null | awk '
    /^version:[[:space:]]*/ {
      value = $0
      sub(/^version:[[:space:]]*/, "", value)
      sub(/[[:space:]]*#.*/, "", value)
      gsub(/^[[:space:]"'\''"]+|[[:space:]"'\''"]+$/, "", value)
      print value
      exit
    }
  '
}

case "$PUSH_TAGS" in
  true | false) ;;
  *) fail "PUSH_TAGS must be true or false" ;;
esac

git rev-parse --verify "${BASE_REF}^{commit}" >/dev/null ||
  fail "Unable to resolve ${BASE_REF}; fetch ${DEFAULT_BRANCH} before running this script"

history_file="$(mktemp)"
versions_file="$(mktemp)"
seen_file="$(mktemp)"
missing_file="$(mktemp)"
cleanup() {
  rm -f "$history_file" "$versions_file" "$seen_file" "$missing_file"
}
trap cleanup EXIT

git log --first-parent --reverse --format=%H "$BASE_REF" -- "$CHART_PATH" >"$history_file"

if [ ! -s "$history_file" ]; then
  fail "No history found for ${CHART_PATH} on ${BASE_REF}"
fi

while IFS= read -r commit; do
  version="$(chart_version_at "$commit")"

  if [ -z "$version" ]; then
    continue
  fi

  if [[ ! "$version" =~ $SEMVER_REGEX ]]; then
    fail "${CHART_PATH} has invalid SemVer '${version}' at ${commit}"
  fi

  if grep -Fqx "$version" "$seen_file"; then
    continue
  fi

  printf '%s\n' "$version" >>"$seen_file"
  printf '%s\t%s\n' "$version" "$commit" >>"$versions_file"
done <"$history_file"

if [ ! -s "$versions_file" ]; then
  fail "No chart versions found in ${CHART_PATH}"
fi

release_started=false
if [ -z "$(git tag --list "${TAG_PREFIX}*")" ]; then
  release_started=true
fi

while IFS="$(printf '\t')" read -r version commit; do
  tag="${TAG_PREFIX}${version}"

  git check-ref-format "refs/tags/${tag}" >/dev/null ||
    fail "Refusing to create invalid tag ${tag}"

  if git rev-parse --quiet --verify "refs/tags/${tag}" >/dev/null; then
    release_started=true
    continue
  fi

  if [ "$release_started" != "true" ]; then
    printf 'Skipping %s because no earlier %s tag exists in chart history.\n' "$tag" "$TAG_PREFIX"
    continue
  fi

  printf '%s\t%s\n' "$tag" "$commit" >>"$missing_file"
done <"$versions_file"

if [ ! -s "$missing_file" ]; then
  printf 'All chart versions on %s already have %s tags.\n' "$BASE_REF" "$TAG_PREFIX"
  exit 0
fi

while IFS="$(printf '\t')" read -r tag commit; do
  short_commit="$(git rev-parse --short "$commit")"

  if [ "$PUSH_TAGS" != "true" ]; then
    printf 'Would create %s at %s.\n' "$tag" "$short_commit"
    continue
  fi

  if git_with_auth ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
    printf 'Remote tag %s already exists; skipping.\n' "$tag"
    continue
  fi

  git tag "$tag" "$commit"

  if git_with_auth push origin "refs/tags/${tag}"; then
    printf 'Created %s at %s.\n' "$tag" "$short_commit"
    dispatch_release "$tag"
    continue
  fi

  if git_with_auth ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
    printf 'Remote tag %s was created concurrently; continuing.\n' "$tag"
    continue
  fi

  fail "Failed to push ${tag}"
done <"$missing_file"
