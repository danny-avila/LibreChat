const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');

/**
 * Core OpenTelemetry SDK Configuration for LibreChat
 *
 * This file sets up the OpenTelemetry Node SDK with:
 * - Automatic instrumentation for HTTP, MongoDB, Redis, etc.
 * - OTLP HTTP exporter for sending traces
 * - Console exporter for development debugging
 * - Resource attributes for service identification
 */

// Service configuration
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

// Set service name and version via environment variables if not already set
if (!process.env.OTEL_SERVICE_NAME) {
  process.env.OTEL_SERVICE_NAME = 'librechat';
}
if (!process.env.OTEL_SERVICE_VERSION) {
  process.env.OTEL_SERVICE_VERSION = '0.8.0';
}

// Configure trace exporter
const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

// Add console exporter for development
const spanProcessors = [new BatchSpanProcessor(traceExporter)];
if (process.env.NODE_ENV === 'development') {
  spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
}

// Configure instrumentations
const instrumentations = [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false, // Disable file system instrumentation (too noisy)
    },
    '@opentelemetry/instrumentation-http': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-express': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-mongoose': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-redis': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-mongodb': {
      enabled: true,
    },
  }),
];

// Initialize the SDK
const sdk = new NodeSDK({
  spanProcessors,
  instrumentations,
});

// Start the SDK
try {
  sdk.start();
  console.log('🚀 OpenTelemetry SDK started successfully');
} catch (error) {
  console.error('❌ Failed to start OpenTelemetry SDK:', error);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('✅ OpenTelemetry SDK terminated'))
    .catch((error) => console.error('❌ Error terminating OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

module.exports = sdk;
