const DEFAULT_SERVICE_NAME = 'librechat';
const DEFAULT_HEALTH_PATH = '/health';

export type TelemetryStatus = 'disabled' | 'failed' | 'started' | 'stopped';

export interface TelemetryConfig {
  enabled: boolean;
  healthPath: string;
  sdkDisabled: boolean;
  serviceName: string;
  serviceVersion?: string;
}

function isTruthy(value?: string | boolean | null): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getTelemetryConfig(env: NodeJS.ProcessEnv = process.env): TelemetryConfig {
  const sdkDisabled = isTruthy(env.OTEL_SDK_DISABLED);
  const enabled = isTruthy(env.OTEL_TRACING_ENABLED) && !sdkDisabled;
  const serviceName = clean(env.OTEL_SERVICE_NAME) ?? DEFAULT_SERVICE_NAME;
  const serviceVersion = clean(env.OTEL_SERVICE_VERSION) ?? clean(env.npm_package_version);

  return {
    enabled,
    serviceName,
    sdkDisabled,
    serviceVersion,
    healthPath: DEFAULT_HEALTH_PATH,
  };
}
