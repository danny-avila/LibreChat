#!/usr/bin/env bash
# Behavior test for the librechat HTTPRoute (Gateway API) template.
#
# Renders templates/httproute.yaml under several value combinations and asserts
# the opt-in contract: disabled by default, attaches to the configured
# Gateway(s), defaults its rule match, and honors overrides. This is pure
# `helm template` rendering, so no cluster and no Gateway API CRDs are required.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RELEASE="librechat"

if ! command -v helm >/dev/null 2>&1; then
  echo "FAIL: helm not on PATH" >&2
  exit 1
fi

fail() {
  echo "FAIL: $1" >&2
  shift || true
  if [[ $# -gt 0 ]]; then
    echo "----- rendered -----" >&2
    printf '%s\n' "$@" >&2
  fi
  exit 1
}

# render_full renders the whole chart (used to assert the HTTPRoute is absent).
render_full() {
  helm template "${RELEASE}" "${CHART_DIR}" 2>/dev/null
}

# render_route renders only templates/httproute.yaml with the route enabled.
render_route() {
  helm template "${RELEASE}" "${CHART_DIR}" \
    --show-only templates/httproute.yaml \
    --set httpRoute.enabled=true \
    "$@" 2>/dev/null
}

# 1. Disabled by default: no HTTPRoute is rendered.
if render_full | grep -q "kind: HTTPRoute"; then
  fail "HTTPRoute rendered even though httpRoute.enabled defaults to false"
fi
echo "PASS: HTTPRoute is not rendered by default"

# 2. Enabled with a parentRef: the route attaches to the Gateway, matches the
#    configured hostname, and points at the librechat Service.
OUT="$(render_route \
  --set 'httpRoute.parentRefs[0].name=example-gateway' \
  --set 'httpRoute.hostnames[0]=chat.example.com')"

for needle in \
  "kind: HTTPRoute" \
  "apiVersion: gateway.networking.k8s.io/v1" \
  "name: ${RELEASE}-${RELEASE}" \
  "name: example-gateway" \
  "- chat.example.com"; do
  printf '%s\n' "${OUT}" | grep -qF -- "${needle}" \
    || fail "expected '${needle}' in rendered HTTPRoute" "${OUT}"
done
printf '%s\n' "${OUT}" | grep -qE "port: [0-9]+" \
  || fail "expected a backendRef port in rendered HTTPRoute" "${OUT}"
echo "PASS: HTTPRoute attaches to the Gateway and routes to the librechat Service"

# 3. Default rule match is PathPrefix '/' when httpRoute.matches is empty.
if ! printf '%s\n' "${OUT}" | grep -qE "type: PathPrefix" \
  || ! printf '%s\n' "${OUT}" | grep -qE "value: /$"; then
  fail "expected a default PathPrefix '/' match" "${OUT}"
fi
echo "PASS: default rule uses a PathPrefix '/' match"

# 4. httpRoute.matches overrides the generated default match.
OUT2="$(render_route \
  --set 'httpRoute.parentRefs[0].name=example-gateway' \
  --set 'httpRoute.matches[0].path.type=PathPrefix' \
  --set 'httpRoute.matches[0].path.value=/api')"
printf '%s\n' "${OUT2}" | grep -qE "value: /api$" \
  || fail "expected the overridden match value '/api'" "${OUT2}"
echo "PASS: httpRoute.matches overrides the default match"

echo "PASS: librechat HTTPRoute template renders correctly across all cases"
