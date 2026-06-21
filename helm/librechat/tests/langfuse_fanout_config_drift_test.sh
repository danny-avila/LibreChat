#!/usr/bin/env bash
# Regression test for Langfuse fanout collector config drift.
#
# Compose mounts otel/langfuse-fanout/otelcol.yaml directly. Helm renders the
# same collector topology into a ConfigMap from templates/langfuse-fanout-configmap.yaml.
# This test renders Helm with the default tenant destinations and compares the
# semantic collector topology, not raw YAML formatting.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CHART_DIR}/../.." && pwd)"
STATIC_CONFIG="${REPO_ROOT}/otel/langfuse-fanout/otelcol.yaml"
RENDER_CHART_DIR="$(mktemp -d -t librechat-fanout-chart.XXXXXX)"
RENDERED_FILE="$(mktemp -t librechat-fanout-config-render.XXXXXX)"
STATIC_SUMMARY="$(mktemp -t librechat-fanout-static-summary.XXXXXX)"
HELM_SUMMARY="$(mktemp -t librechat-fanout-helm-summary.XXXXXX)"
trap 'rm -rf "${RENDER_CHART_DIR}"; rm -f "${RENDERED_FILE}" "${STATIC_SUMMARY}" "${HELM_SUMMARY}"' EXIT

if ! command -v helm >/dev/null 2>&1; then
  echo "FAIL: helm not on PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node not on PATH" >&2
  exit 1
fi

mkdir -p "${RENDER_CHART_DIR}/templates"
awk '/^dependencies:/{ exit } { print }' "${CHART_DIR}/Chart.yaml" > "${RENDER_CHART_DIR}/Chart.yaml"
cp "${CHART_DIR}/values.yaml" "${RENDER_CHART_DIR}/values.yaml"
cp "${CHART_DIR}/templates/_helpers.tpl" "${RENDER_CHART_DIR}/templates/_helpers.tpl"
cp "${CHART_DIR}/templates/langfuse-fanout-configmap.yaml" \
  "${RENDER_CHART_DIR}/templates/langfuse-fanout-configmap.yaml"

helm template librechat "${RENDER_CHART_DIR}" \
  --set langfuseFanout.enabled=true \
  --set langfuseFanout.central.authHeaderSecret.name=langfuse-central \
  --show-only templates/langfuse-fanout-configmap.yaml \
  > "${RENDERED_FILE}"

NODE_PATH="${REPO_ROOT}/node_modules${NODE_PATH:+:${NODE_PATH}}" \
STATIC_CONFIG="${STATIC_CONFIG}" \
RENDERED_FILE="${RENDERED_FILE}" \
STATIC_SUMMARY="${STATIC_SUMMARY}" \
HELM_SUMMARY="${HELM_SUMMARY}" \
node <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');

const DEFAULT_DESTINATIONS = ['eu', 'hipaa', 'jp', 'us'];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function requireObject(value, path) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value;
}

function sorted(value) {
  return [...(value ?? [])].sort();
}

function extractHelmCollectorConfig(renderedFile) {
  const docs = yaml.loadAll(fs.readFileSync(renderedFile, 'utf8')).filter(Boolean);
  const configMap = docs.find(
    (doc) =>
      doc.kind === 'ConfigMap' &&
      doc.metadata?.name === 'librechat-librechat-langfuse-fanout-config',
  );
  if (!configMap) {
    fail('missing rendered Langfuse fanout ConfigMap');
  }
  const body = configMap.data?.['otelcol.yaml'];
  if (typeof body !== 'string' || body.trim() === '') {
    fail('rendered ConfigMap is missing data.otelcol.yaml');
  }
  return yaml.load(body);
}

function extractRouteDestinations(config) {
  const routes = config.connectors?.['routing/langfuse_tenant_destination']?.table;
  if (!Array.isArray(routes)) {
    fail('routing/langfuse_tenant_destination.table must be an array');
  }

  return Object.fromEntries(
    routes.map((route) => {
      const condition = route.condition;
      const match = /attributes\["librechat\.langfuse\.destination"\]\s*==\s*"([^"]+)"/.exec(
        condition,
      );
      if (!match) {
        fail(`unsupported routing condition: ${condition}`);
      }
      return [
        match[1],
        {
          context: route.context,
          pipelines: sorted(route.pipelines),
        },
      ];
    }).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summarize(config) {
  requireObject(config, 'collector config');
  const processors = requireObject(config.processors, 'processors');
  const exporters = requireObject(config.exporters, 'exporters');
  const pipelines = requireObject(config.service?.pipelines, 'service.pipelines');

  const destinations = Object.keys(extractRouteDestinations(config)).sort();
  const tenantExporters = Object.fromEntries(
    destinations.map((destination) => {
      const exporter = exporters[`otlphttp/tenant_${destination}`];
      return [
        destination,
        {
          endpoint: exporter?.endpoint,
          authenticator: exporter?.auth?.authenticator,
          headers: exporter?.headers ?? {},
        },
      ];
    }),
  );
  const tenantPipelines = Object.fromEntries(
    destinations.map((destination) => {
      const pipeline = pipelines[`traces/tenant_${destination}`];
      return [
        destination,
        {
          receivers: sorted(pipeline?.receivers),
          processors: sorted(pipeline?.processors),
          exporters: sorted(pipeline?.exporters),
        },
      ];
    }),
  );
  const tenantBatches = Object.fromEntries(
    destinations.map((destination) => {
      const batch = processors[`batch/by_auth_${destination}`];
      return [
        destination,
        {
          timeout: batch?.timeout,
          sendBatchSize: batch?.send_batch_size,
          metadataKeys: sorted(batch?.metadata_keys),
          metadataCardinalityLimit: batch?.metadata_cardinality_limit,
        },
      ];
    }),
  );

  return {
    destinations,
    extensions: config.service?.extensions ?? [],
    headersSetter: config.extensions?.['headers_setter/tenant_passthrough'] ?? {},
    receiver: config.receivers?.otlp?.protocols?.http ?? {},
    routes: extractRouteDestinations(config),
    tenantExportFilter: processors['filter/tenant_export']?.traces?.span ?? [],
    dropRoutingAttributes: processors['attributes/drop_librechat_routing']?.actions ?? [],
    centralExporter: exporters['otlphttp/central'] ?? {},
    centralBatch: {
      timeout: processors['batch/central']?.timeout,
      sendBatchSize: processors['batch/central']?.send_batch_size,
    },
    centralPipeline: pipelines['traces/central'] ?? {},
    tenantRouterPipeline: pipelines['traces/tenant'] ?? {},
    tenantExporters,
    tenantPipelines,
    tenantBatches,
  };
}

const staticConfig = yaml.load(fs.readFileSync(process.env.STATIC_CONFIG, 'utf8'));
const helmConfig = extractHelmCollectorConfig(process.env.RENDERED_FILE);
const staticSummary = summarize(staticConfig);
const helmSummary = summarize(helmConfig);

if (JSON.stringify(staticSummary.destinations) !== JSON.stringify(DEFAULT_DESTINATIONS)) {
  fail(
    `static collector destinations changed from default set: ${JSON.stringify(
      staticSummary.destinations,
    )}`,
  );
}
if (JSON.stringify(helmSummary.destinations) !== JSON.stringify(DEFAULT_DESTINATIONS)) {
  fail(
    `Helm default collector destinations changed from default set: ${JSON.stringify(
      helmSummary.destinations,
    )}`,
  );
}

fs.writeFileSync(process.env.STATIC_SUMMARY, `${JSON.stringify(staticSummary, null, 2)}\n`);
fs.writeFileSync(process.env.HELM_SUMMARY, `${JSON.stringify(helmSummary, null, 2)}\n`);
NODE

if ! diff -u "${STATIC_SUMMARY}" "${HELM_SUMMARY}"; then
  echo "FAIL: static Compose collector config and Helm-rendered collector config drifted" >&2
  exit 1
fi

echo "PASS: Langfuse fanout Compose and Helm collector configs match for default destinations"
