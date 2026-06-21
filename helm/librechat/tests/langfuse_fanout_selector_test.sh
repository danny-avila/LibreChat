#!/usr/bin/env bash
# Regression test for Langfuse fanout Helm selectors.
#
# The fanout collector must not share the main LibreChat app selector labels.
# Otherwise the main Service can route HTTP traffic to the OTEL collector pod.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CHART_DIR}/../.." && pwd)"
RENDERED_FILE="$(mktemp -t librechat-fanout-render.XXXXXX)"
trap 'rm -f "${RENDERED_FILE}"' EXIT

if ! command -v helm >/dev/null 2>&1; then
  echo "FAIL: helm not on PATH" >&2
  exit 1
fi

helm template librechat "${CHART_DIR}" \
  --set langfuseFanout.enabled=true \
  --set langfuseFanout.central.authHeaderSecret.name=langfuse-central \
  --show-only templates/service.yaml \
  --show-only templates/langfuse-fanout-service.yaml \
  --show-only templates/langfuse-fanout-deployment.yaml \
  --show-only templates/langfuse-fanout-configmap.yaml \
  > "${RENDERED_FILE}"

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node not on PATH" >&2
  exit 1
fi

NODE_PATH="${REPO_ROOT}/node_modules${NODE_PATH:+:${NODE_PATH}}" \
RENDERED_FILE="${RENDERED_FILE}" node <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');

const docs = yaml
  .loadAll(fs.readFileSync(process.env.RENDERED_FILE, 'utf8'))
  .filter(Boolean);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function find(kind, name) {
  const doc = docs.find((candidate) => candidate.kind === kind && candidate.metadata?.name === name);
  if (!doc) {
    fail(`missing ${kind}/${name}`);
  }
  return doc;
}

function isSubset(subset, labels) {
  return Object.entries(subset ?? {}).every(([key, value]) => labels?.[key] === value);
}

const mainService = find('Service', 'librechat-librechat');
const fanoutService = find('Service', 'librechat-librechat-langfuse-fanout');
const fanoutDeployment = find('Deployment', 'librechat-librechat-langfuse-fanout');
const fanoutConfigMap = find('ConfigMap', 'librechat-librechat-langfuse-fanout-config');

const mainSelector = mainService.spec?.selector ?? {};
const fanoutSelector = fanoutService.spec?.selector ?? {};
const fanoutMatchLabels = fanoutDeployment.spec?.selector?.matchLabels ?? {};
const fanoutPodLabels = fanoutDeployment.spec?.template?.metadata?.labels ?? {};
const fanoutMetadataLabels = fanoutDeployment.metadata?.labels ?? {};
const fanoutConfigLabels = fanoutConfigMap.metadata?.labels ?? {};

if (isSubset(mainSelector, fanoutPodLabels)) {
  fail('main Service selector matches fanout pod labels');
}
if (!isSubset(fanoutSelector, fanoutPodLabels)) {
  fail('fanout Service selector does not match fanout pod labels');
}
if (!isSubset(fanoutMatchLabels, fanoutPodLabels)) {
  fail('fanout Deployment selector is not a subset of pod labels');
}
if (mainSelector['app.kubernetes.io/name'] === fanoutSelector['app.kubernetes.io/name']) {
  fail('main and fanout Services share app.kubernetes.io/name selectors');
}
if (fanoutMetadataLabels['app.kubernetes.io/name'] !== fanoutSelector['app.kubernetes.io/name']) {
  fail('fanout Deployment metadata labels do not use fanout app name');
}
if (fanoutConfigLabels['app.kubernetes.io/name'] !== fanoutSelector['app.kubernetes.io/name']) {
  fail('fanout ConfigMap labels do not use fanout app name');
}

console.log('PASS: Langfuse fanout selectors are isolated from the main LibreChat Service');
NODE
