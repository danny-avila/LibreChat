import { metrics, propagation } from '@opentelemetry/api';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  MeterProviderOptions,
} from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
} from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

import { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import packageJson from '../../package.json';
import { dataService } from 'librechat-data-provider';
import OpenTelemetryConsoleLogger from './otelLoggingIntegration';
import * as os from 'os';
import {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} from '@opentelemetry/core';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

export async function initializeFrontendOtel() {
  const configs = await dataService.getStartupConfig();
  if (!configs.otel?.enabled) {
    console.info('Open Telemetry is not enabled');
    return;
  }
  const user = await dataService.getUser();

  if (!configs.otel?.otelEndpoint || configs.otel?.otelEndpoint.trim() === '') {
    console.info('Open Telemetry End Point is not set: Open Telemetry will be turned off.');
    return;
  }

  if (!configs.otel?.otelApiKey || configs.otel?.otelApiKey.trim() === '') {
    console.info('Open Telemetry Api Key is not set: Open Telemetry will be turned off.');
    return;
  }

  const attributes = {
    [ATTR_SERVICE_NAME]: `${packageJson.name}`,
    [ATTR_SERVICE_VERSION]: packageJson.version,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
    [ATTR_TELEMETRY_SDK_NAME]: 'opentelemetry',
    [ATTR_TELEMETRY_SDK_VERSION]: `${packageJson.dependencies['@opentelemetry/api']}`,
    hostname: os.hostname(),
    username: user.username?.trim() || user.name,
    email: user.email,
  };

  const configTraces = {
    url: configs.otel?.otelEndpoint,
    key: configs.otel?.otelApiKey,
  };

  const headers = {
    'api-key': configTraces.key,
  };

  const resourceBuilder = resourceFromAttributes(attributes);

  const traceConfigs = {
    url: `${configTraces.url}/traces`,
    headers: headers,
  } as OTLPExporterNodeConfigBase;

  const logConfigs = {
    url: `${configTraces.url}/logs`,
    headers: headers,
  } as OTLPExporterNodeConfigBase;

  const metricsConfigs = {
    url: `${configTraces.url}/metrics`,
    headers: headers,
  } as OTLPExporterNodeConfigBase;

  const traceExporterProcessor = new SimpleSpanProcessor(new OTLPTraceExporter(traceConfigs));
  const logExporterProcessor = new SimpleLogRecordProcessor(new OTLPLogExporter(logConfigs));
  const metricExporter = new OTLPMetricExporter(metricsConfigs);

  const provider = new WebTracerProvider({
    resource: resourceBuilder,
    spanProcessors: [traceExporterProcessor],
  });

  const loggerProvider = new LoggerProvider({
    resource: resourceBuilder,
    processors: [logExporterProcessor],
  });

  const periodicReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 1000,
  });

  const option: MeterProviderOptions = {
    resource: resourceBuilder,
    readers: [periodicReader],
  };

  const compositePropagator = new CompositePropagator({
    propagators: [new W3CBaggagePropagator(), new W3CTraceContextPropagator()],
  });

  const meterProvider = new MeterProvider(option);
  metrics.setGlobalMeterProvider(meterProvider);
  propagation.setGlobalPropagator(compositePropagator);

  const logger = new OpenTelemetryConsoleLogger({
    loggerProvider: loggerProvider,
    loggerName: 'otel-frontend-logger',
  });

  (window as any).otelLogger = logger;
  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: compositePropagator,
  });
  registerInstrumentations({
    tracerProvider: provider,
    loggerProvider: loggerProvider,
    meterProvider: meterProvider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation(),
      new XMLHttpRequestInstrumentation(),
    ],
  });
}
