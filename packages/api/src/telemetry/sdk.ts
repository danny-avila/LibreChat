import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { IncomingMessage } from 'node:http';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import type { Attributes } from '@opentelemetry/api';
import type { TelemetryConfig, TelemetryStatus } from './config';
import { getTelemetryConfig } from './config';

export interface TelemetryController {
  enabled: boolean;
  readonly status: TelemetryStatus;
  shutdown: () => Promise<void>;
}

interface RegisteredSignal {
  signal: NodeJS.Signals;
  listener: NodeJS.SignalsListener;
}

let activeSdk: NodeSDK | undefined;
let pendingSdk: NodeSDK | undefined;
let startPromise: Promise<void> | undefined;
let status: TelemetryStatus = 'stopped';
let registeredSignals: RegisteredSignal[] = [];

function isBunRuntime(): boolean {
  return Reflect.get(globalThis, 'Bun') != null;
}

function shouldIgnoreIncomingRequest(request: IncomingMessage, healthPath: string): boolean {
  return request.url === healthPath || request.url?.startsWith(`${healthPath}?`) === true;
}

function getResourceAttributes(config: TelemetryConfig): Attributes {
  const attributes: Attributes = {
    [ATTR_SERVICE_NAME]: config.serviceName,
  };

  if (config.serviceVersion) {
    attributes[ATTR_SERVICE_VERSION] = config.serviceVersion;
  }

  return attributes;
}

function createSdk(config: TelemetryConfig): NodeSDK {
  const sdkConfig: Partial<NodeSDKConfiguration> = {
    resource: resourceFromAttributes(getResourceAttributes(config)),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-bunyan': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-graphql': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-http': {
          headersToSpanAttributes: {
            client: { requestHeaders: [], responseHeaders: [] },
            server: { requestHeaders: [], responseHeaders: [] },
          },
          ignoreIncomingRequestHook: (request: IncomingMessage) =>
            shouldIgnoreIncomingRequest(request, config.healthPath),
        },
        '@opentelemetry/instrumentation-openai': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-pino': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-runtime-node': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-winston': {
          enabled: false,
        },
      }),
    ],
  };

  return new NodeSDK(sdkConfig);
}

function startSdk(sdk: NodeSDK): void | Promise<void> {
  return (sdk as NodeSDK & { start: () => void | Promise<void> }).start();
}

function emitWarning(message: string): void {
  process.emitWarning(message, { code: 'LIBRECHAT_OTEL' });
}

function makeController(enabled: boolean): TelemetryController {
  return {
    enabled,
    get status() {
      return status;
    },
    shutdown: shutdownTelemetry,
  };
}

function unregisterShutdownHandlers(): void {
  for (const { signal, listener } of registeredSignals) {
    process.removeListener(signal, listener);
  }
  registeredSignals = [];
}

function registerShutdownHandlers(): void {
  if (registeredSignals.length > 0) {
    return;
  }

  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  registeredSignals = signals.map((signal) => {
    const listener: NodeJS.SignalsListener = () => {
      shutdownTelemetry()
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          emitWarning(`OpenTelemetry shutdown failed: ${message}`);
        })
        .finally(() => process.exit(0));
    };
    process.once(signal, listener);
    return { signal, listener };
  });
}

export function initializeTelemetry(env: NodeJS.ProcessEnv = process.env): TelemetryController {
  if (activeSdk || pendingSdk) {
    return makeController(true);
  }

  const config = getTelemetryConfig(env);
  if (!config.enabled || isBunRuntime()) {
    status = 'disabled';
    return makeController(false);
  }

  try {
    const sdk = createSdk(config);
    const result = startSdk(sdk);
    if (result) {
      pendingSdk = sdk;
      status = 'starting';
      const pendingStart = result
        .then(() => {
          if (pendingSdk === sdk) {
            pendingSdk = undefined;
            activeSdk = sdk;
            status = 'started';
            registerShutdownHandlers();
          }
        })
        .catch((error) => {
          if (pendingSdk === sdk) {
            pendingSdk = undefined;
            status = 'failed';
            const message = error instanceof Error ? error.message : String(error);
            emitWarning(`OpenTelemetry initialization failed: ${message}`);
          }
        });
      startPromise = pendingStart;
      void pendingStart.finally(() => {
        if (startPromise === pendingStart) {
          startPromise = undefined;
        }
      });
      return makeController(true);
    }

    activeSdk = sdk;
    status = 'started';
    registerShutdownHandlers();
    return makeController(true);
  } catch (error) {
    status = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    emitWarning(`OpenTelemetry initialization failed: ${message}`);
    return makeController(false);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (startPromise) {
    await startPromise;
  }

  if (!activeSdk) {
    status = status === 'started' ? 'stopped' : status;
    return;
  }

  const sdk = activeSdk;
  try {
    await sdk.shutdown();
    activeSdk = undefined;
    status = 'stopped';
    unregisterShutdownHandlers();
  } catch (error) {
    status = 'started';
    throw error;
  }
}

export function resetTelemetryForTests(): void {
  activeSdk = undefined;
  pendingSdk = undefined;
  startPromise = undefined;
  status = 'stopped';
  unregisterShutdownHandlers();
}
