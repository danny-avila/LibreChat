#!/usr/bin/env bash
# Regression test for the replica-set MONGO_URI in templates/configmap-env.yaml.
#
# Background: the replicaset branch hardcoded "<mongodb.fullname>-headless" as
# the headless service hostname instead of calling the mongodb subchart's own
# "mongodb.service.nameOverride" helper (which the standalone branch already
# used correctly). Rendering with mongodb.service.nameOverride=custom-mongo-dns
# created a StatefulSet that used the custom service, while MONGO_URI still
# pointed at the nonexistent default "<fullname>-headless" service.
#
# This test renders the ConfigMap in replicaset mode, with and without a
# custom mongodb.service.nameOverride, and asserts MONGO_URI's hostname
# tracks the override instead of the hardcoded default.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RENDERED_FILE="$(mktemp -t librechat-mongo-uri-render.XXXXXX)"
trap 'rm -f "${RENDERED_FILE}"' EXIT

if ! command -v helm >/dev/null 2>&1; then
  echo "FAIL: helm not on PATH" >&2
  exit 1
fi

# librechat.configEnv must be non-empty for this chart version's values
# merge to treat .Values.librechat as a map rather than nil; unrelated to
# what this test actually verifies. librechat.mongoArchitectureAck must match
# mongodb.architecture or the chart's fail-fast guard aborts the render.
COMMON_ARGS=(
  --set "librechat.configEnv.PLACEHOLDER=1"
  --set mongodb.architecture=replicaset
  --set librechat.mongoArchitectureAck=replicaset
)

helm template librechat "${CHART_DIR}" \
  "${COMMON_ARGS[@]}" \
  --show-only templates/configmap-env.yaml > "${RENDERED_FILE}"

DEFAULT_URI="$(grep '^  MONGO_URI:' "${RENDERED_FILE}")"
if [[ "${DEFAULT_URI}" != *"-headless."* ]]; then
  echo "FAIL: default replicaset MONGO_URI should still reference the default headless service" >&2
  echo "  got: ${DEFAULT_URI}" >&2
  exit 1
fi

helm template librechat "${CHART_DIR}" \
  "${COMMON_ARGS[@]}" \
  --set mongodb.service.nameOverride=custom-mongo-dns \
  --show-only templates/configmap-env.yaml > "${RENDERED_FILE}"

OVERRIDE_URI="$(grep '^  MONGO_URI:' "${RENDERED_FILE}")"
if [[ "${OVERRIDE_URI}" != *".custom-mongo-dns."* ]]; then
  echo "FAIL: MONGO_URI did not honor mongodb.service.nameOverride=custom-mongo-dns" >&2
  echo "  got: ${OVERRIDE_URI}" >&2
  exit 1
fi
if [[ "${OVERRIDE_URI}" == *"-headless"* ]]; then
  echo "FAIL: MONGO_URI still references the default headless service name despite the override" >&2
  echo "  got: ${OVERRIDE_URI}" >&2
  exit 1
fi

echo "PASS: replica-set MONGO_URI honors mongodb.service.nameOverride"
