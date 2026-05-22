'use strict';

const INGEST_URL = (
  process.env.OPSAAS_INGEST_URL ||
  process.env.SUPERLOG_ENDPOINT ||
  'https://api.20.123.2.194.nip.io'
).replace(/\/$/, '');
const INGEST_KEY = process.env.OPSAAS_API_KEY || process.env.SUPERLOG_API_KEY || '';

if (!INGEST_KEY) {
  console.warn('[otel] OPSAAS_API_KEY not set — telemetry export disabled');
  module.exports = { sdk: null };
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require('@opentelemetry/semantic-conventions');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');

const otlpHeaders = { authorization: `Bearer ${INGEST_KEY}` };

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OPSAAS_SERVICE_NAME || 'billechat-api',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.8.5',
  'deployment.environment.name': process.env.NODE_ENV || 'development',
  'vcs.repository.url.full': 'https://github.com/michalszymanski-ai/LibreChat',
  'vcs.ref.head.revision':
    process.env.GITHUB_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT ||
    'unknown',
});

const traceExporter = new OTLPTraceExporter({
  url: `${INGEST_URL}/v1/traces`,
  headers: otlpHeaders,
});

const metricExporter = new OTLPMetricExporter({
  url: `${INGEST_URL}/v1/metrics`,
  headers: otlpHeaders,
});

const logExporter = new OTLPLogExporter({
  url: `${INGEST_URL}/v1/logs`,
  headers: otlpHeaders,
});

const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30_000,
  }),
  logRecordProcessor,
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
  ],
});

sdk.start();
console.info(`[otel] exporting to ${INGEST_URL} as ${resource.attributes[ATTR_SERVICE_NAME]}`);

// Flush telemetry on shutdown
const shutdown = async () => {
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error('OTel shutdown error:', err);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Bridge Winston logs → OTel
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const otelLogger = logs.getLogger('billechat-api');

const WINSTON_TO_OTEL_SEVERITY = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.DEBUG,
  verbose: SeverityNumber.DEBUG2,
  debug: SeverityNumber.DEBUG3,
  activity: SeverityNumber.DEBUG4,
  silly: SeverityNumber.TRACE,
};

// Patch Winston to also emit OTel log records
try {
  const winston = require('winston');
  const Transport = require('winston-transport');

  class OTelTransport extends Transport {
    log(info, callback) {
      const { level, message, timestamp, ...rest } = info;
      const severityNumber =
        WINSTON_TO_OTEL_SEVERITY[level] || SeverityNumber.UNSPECIFIED;
      const severityText = level.toUpperCase();

      const attributes = {};
      for (const [k, v] of Object.entries(rest)) {
        if (k === 'splat' || k === 'Symbol(splat)') continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          attributes[k] = v;
        }
      }

      otelLogger.emit({
        severityNumber,
        severityText,
        body: message,
        attributes,
      });

      callback();
    }
  }

  // Add OTel transport to the default winston logger once it's created
  // We do this after a tick to let the app create its logger first
  setImmediate(() => {
    try {
      const { logger } = require('@librechat/data-schemas');
      if (logger && typeof logger.add === 'function') {
        logger.add(new OTelTransport({ level: 'debug' }));
      }
    } catch {
      // Logger not yet available; app will still work fine
    }
  });
} catch {
  // Winston not available; skip log bridging
}

module.exports = { sdk };
