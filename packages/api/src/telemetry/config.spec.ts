import { getTelemetryConfig } from './config';

describe('getTelemetryConfig', () => {
  it('defaults tracing off', () => {
    const config = getTelemetryConfig({});

    expect(config.enabled).toBe(false);
    expect(config.sdkDisabled).toBe(false);
    expect(config.serviceName).toBe('librechat');
    expect(config.healthPath).toBe('/health');
  });

  it('enables tracing only when OTEL_TRACING_ENABLED is true', () => {
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'true' }).enabled).toBe(true);
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'TRUE' }).enabled).toBe(true);
    expect(getTelemetryConfig({ OTEL_TRACING_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('lets OTEL_SDK_DISABLED override tracing enablement', () => {
    const config = getTelemetryConfig({
      OTEL_SDK_DISABLED: 'true',
      OTEL_TRACING_ENABLED: 'true',
    });

    expect(config.enabled).toBe(false);
    expect(config.sdkDisabled).toBe(true);
  });

  it('uses standard service env vars when provided', () => {
    const config = getTelemetryConfig({
      OTEL_SERVICE_NAME: ' librechat-api ',
      OTEL_SERVICE_VERSION: ' 1.2.3 ',
    });

    expect(config.serviceName).toBe('librechat-api');
    expect(config.serviceVersion).toBe('1.2.3');
  });

  it('falls back to npm package version when service version is absent', () => {
    const config = getTelemetryConfig({
      npm_package_version: '0.8.5',
    });

    expect(config.serviceVersion).toBe('0.8.5');
  });
});
