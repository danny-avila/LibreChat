require('dotenv').config();
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { LoggerProvider, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const OpenTelemetryTransport = require('./otelLoggingIntegration');
const os = require('os');
const { propagation } = require('@opentelemetry/api');
const {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} = require('@opentelemetry/core');

const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
} = require('@opentelemetry/semantic-conventions');
const { logger } = require('../../config/index');
const { OTEL_ENDPOINT, OTEL_API_KEY, NODE_ENV, DEBUG_LOGGING = true } = process.env;
const pkg = require('../../package.json');
const { name, version, dependencies } = pkg;

function getHostname() {
  const envHostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  if (envHostname) {
    return envHostname;
  }
  return os.hostname();
}

function initializeBackendOtel() {
  //
  const otelEnabled = !!process.env.OTEL_ENDPOINT && !!process.env.OTEL_API_KEY;

  if (!otelEnabled) {
    logger.info('Open Telemetry is not enabled');
    return;
  }

  if (!OTEL_ENDPOINT || OTEL_ENDPOINT.trim() === '') {
    logger.info('Open Telemetry End Point is not set: Open Telemetry will be turned off');
    return;
  }

  if (!OTEL_API_KEY || OTEL_API_KEY.trim() === '') {
    logger.info('Open Telemetry Api Key is not set: Open Telemetry will be turned off.');
    return;
  }

  logger.debug('Open Telemetry Backend is active!');

  const configTraces = {
    url: OTEL_ENDPOINT,
    key: OTEL_API_KEY,
  };
  const compositePropagator = new CompositePropagator({
    propagators: [new W3CBaggagePropagator(), new W3CTraceContextPropagator()],
  });

  const attributes = {
    [ATTR_SERVICE_NAME]: name,
    [ATTR_SERVICE_VERSION]: version,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
    [ATTR_TELEMETRY_SDK_NAME]: 'opentelemetry',
    [ATTR_TELEMETRY_SDK_VERSION]: `${dependencies['@opentelemetry/api']}`,
    hostname: getHostname(),
    username: os.userInfo().username,
  };

  const headers = {
    'api-key': configTraces.key,
  };

  const resourceBuilder = resourceFromAttributes(attributes);
  const processors = new SimpleLogRecordProcessor(
    new OTLPLogExporter({
      url: `${configTraces.url}/logs`,
      headers: headers,
    }),
  );

  const loggerProvider = new LoggerProvider({
    resource: resourceBuilder,
    processors: [processors],
  });

  const level = () => {
    const env = NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
  };

  let envLevel = level();

  const useDebugLogging =
    (typeof DEBUG_LOGGING === 'string' && DEBUG_LOGGING?.toLowerCase() === 'true') ||
    DEBUG_LOGGING === true;

  if (useDebugLogging) {
    envLevel = 'debug';
  }

  logger.add(
    new OpenTelemetryTransport({
      level: envLevel,
      loggerProvider: loggerProvider,
      loggerName: 'otel-logger',
    }),
  );

  const sdk = new NodeSDK({
    resource: resourceBuilder,
    traceExporter: new OTLPTraceExporter({
      url: `${configTraces.url}/traces`,
      headers: headers,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${configTraces.url}/metrics`,
        headers: headers,
      }),
    }),
    logRecordProcessor: processors,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  propagation.setGlobalPropagator(compositePropagator);

  sdk.start();
}

module.exports = initializeBackendOtel;
