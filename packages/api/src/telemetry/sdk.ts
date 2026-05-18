import { IncomingMessage } from 'node:http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import type { Span, Attributes } from '@opentelemetry/api';
import type { RequestOptions } from 'node:http';
import type { TelemetryConfig, TelemetryStatus } from './config';
import { getTelemetryConfig } from './config';

export interface TelemetryController {
  readonly enabled: boolean;
  readonly status: TelemetryStatus;
  shutdown: () => Promise<void>;
}

const WARNING_CODE = 'LIBRECHAT_OTEL';
const REDACTED_QUERY_VALUE = '[REDACTED]';
const SIGNAL_SHUTDOWN_TIMEOUT_MS = 5_000;

interface RegisteredSignal {
  signal: NodeJS.Signals;
  listener: NodeJS.SignalsListener;
}

interface RequestUrlParts {
  href?: string;
  search?: string;
  pathname?: string;
}

interface AgentProtocol {
  protocol?: string;
}

interface UndiciRequestInfo {
  path?: string;
  origin?: string;
}

let activeSdk: NodeSDK | undefined;
let pendingSdk: NodeSDK | undefined;
let startPromise: Promise<void> | undefined;
let shutdownPromise: Promise<void> | undefined;
let status: TelemetryStatus = 'stopped';
let registeredSignals: RegisteredSignal[] = [];
let requestSpans = new WeakMap<IncomingMessage, Span>();

function isBunRuntime(): boolean {
  return Reflect.get(globalThis, 'Bun') != null;
}

function shouldIgnoreIncomingRequest(request: IncomingMessage, healthPath: string): boolean {
  return request.url === healthPath || request.url?.startsWith(`${healthPath}?`) === true;
}

function getIncomingUrlInfo(request: IncomingMessage): { hasQuery: boolean; pathname: string } {
  const rawUrl = request.url ?? '/';

  try {
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    return {
      hasQuery: parsedUrl.search.length > 1,
      pathname: parsedUrl.pathname || '/',
    };
  } catch {
    const queryIndex = rawUrl.indexOf('?');
    return {
      hasQuery: queryIndex >= 0 && queryIndex < rawUrl.length - 1,
      pathname: queryIndex >= 0 ? rawUrl.slice(0, queryIndex) || '/' : rawUrl || '/',
    };
  }
}

function getLowCardinalityUrlPath(pathname: string, healthPath: string): string {
  if (pathname === healthPath) {
    return healthPath;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return '/api/*';
  }

  return 'spa_fallback';
}

function getSanitizedIncomingUrlAttributes(
  request: IncomingMessage,
  healthPath: string,
): Attributes {
  const { hasQuery, pathname } = getIncomingUrlInfo(request);
  const safePath = getLowCardinalityUrlPath(pathname, healthPath);
  const safeTarget = hasQuery ? `${safePath}?${REDACTED_QUERY_VALUE}` : safePath;
  const attributes: Attributes = {
    'http.target': safeTarget,
    'http.url': safeTarget,
    'url.full': safeTarget,
    'url.path': safePath,
  };

  if (hasQuery) {
    attributes['url.query'] = REDACTED_QUERY_VALUE;
  }

  return attributes;
}

function getStringValue(value: string | number | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  const stringValue = String(value).trim();
  return stringValue || undefined;
}

function getRedactedQuery(search: string): string | undefined {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) {
    return undefined;
  }

  return query
    .split('&')
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 0) {
        return REDACTED_QUERY_VALUE;
      }

      const key = part.slice(0, separatorIndex);
      if (!key) {
        return REDACTED_QUERY_VALUE;
      }

      return `${key}=${REDACTED_QUERY_VALUE}`;
    })
    .join('&');
}

function getSanitizedUrlAttributesFromParts(
  origin: string | undefined,
  pathname: string,
  search: string,
): Attributes {
  const path = pathname || '/';
  const redactedQuery = getRedactedQuery(search);
  const target = redactedQuery ? `${path}?${redactedQuery}` : path;
  const fullUrl = origin ? `${origin}${target}` : target;
  const attributes: Attributes = {
    'http.target': target,
    'http.url': fullUrl,
    'url.full': fullUrl,
    'url.path': path,
  };

  if (redactedQuery) {
    attributes['url.query'] = redactedQuery;
  }

  return attributes;
}

function getFallbackUrlParts(rawUrl: string): { pathname: string; search: string } {
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex < 0) {
    return { pathname: rawUrl || '/', search: '' };
  }

  return {
    pathname: rawUrl.slice(0, queryIndex) || '/',
    search: rawUrl.slice(queryIndex),
  };
}

function getSanitizedOutgoingUrlAttributes(rawUrl: string, origin?: string): Attributes {
  const hasOrigin = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawUrl);

  try {
    const parsedUrl = new URL(rawUrl, origin ?? 'http://localhost');
    const safeOrigin = hasOrigin || origin ? parsedUrl.origin : undefined;
    return getSanitizedUrlAttributesFromParts(safeOrigin, parsedUrl.pathname, parsedUrl.search);
  } catch {
    const { pathname, search } = getFallbackUrlParts(rawUrl);
    return getSanitizedUrlAttributesFromParts(origin, pathname, search);
  }
}

function normalizeProtocol(protocol: string): string {
  return protocol.endsWith(':') ? protocol : `${protocol}:`;
}

function getRequestAgentProtocol(request: RequestOptions): string | undefined {
  const { agent } = request;
  if (!agent || typeof agent === 'boolean') {
    return undefined;
  }

  return getStringValue((agent as AgentProtocol).protocol);
}

function getOutgoingHttpProtocol(request: RequestOptions): string {
  const protocol = getStringValue(request.protocol) ?? getRequestAgentProtocol(request);
  if (!protocol) {
    return 'http:';
  }

  return normalizeProtocol(protocol);
}

function getUrlAuthorityHost(host: string): string {
  try {
    const parsedHost = new URL(`http://${host}`);
    return parsedHost.host;
  } catch {
    if (host.includes(':') && !host.startsWith('[')) {
      return `[${host}]`;
    }
  }

  return host;
}

function getHostWithPort(host: string, port: string | undefined): string {
  const authorityHost = getUrlAuthorityHost(host);
  if (!port) {
    return authorityHost;
  }

  try {
    const parsedHost = new URL(`http://${authorityHost}`);
    if (parsedHost.port) {
      return authorityHost;
    }
  } catch {
    return authorityHost;
  }

  return `${authorityHost}:${port}`;
}

function getOutgoingHttpOrigin(request: RequestOptions): string | undefined {
  const protocol = getOutgoingHttpProtocol(request);
  const host = getStringValue(request.host);
  const port = getStringValue(request.port);
  if (host) {
    return `${protocol}//${getHostWithPort(host, port)}`;
  }

  const hostname = getStringValue(request.hostname);
  const resolvedHostname = hostname ?? 'localhost';
  return `${protocol}//${getHostWithPort(resolvedHostname, port)}`;
}

function getOutgoingHttpUrl(request: RequestOptions & RequestUrlParts): string {
  if (request.path) {
    return request.path;
  }

  if (request.href) {
    return request.href;
  }

  const pathname = request.pathname || '/';
  if (!request.search) {
    return pathname;
  }

  const search = request.search.startsWith('?') ? request.search : `?${request.search}`;
  return `${pathname}${search}`;
}

function getSanitizedOutgoingHttpUrlAttributes(request: RequestOptions): Attributes {
  const requestWithUrlParts = request as RequestOptions & RequestUrlParts;
  return getSanitizedOutgoingUrlAttributes(
    getOutgoingHttpUrl(requestWithUrlParts),
    getOutgoingHttpOrigin(request),
  );
}

function getSanitizedUndiciUrlAttributes(request: UndiciRequestInfo): Attributes {
  return getSanitizedOutgoingUrlAttributes(request.path ?? '/', request.origin);
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
      new HttpInstrumentation({
        headersToSpanAttributes: {
          client: { requestHeaders: [], responseHeaders: [] },
          server: { requestHeaders: [], responseHeaders: [] },
        },
        requestHook: (span: Span, request: object) => {
          if (request instanceof IncomingMessage) {
            requestSpans.set(request, span);
          }
        },
        startIncomingSpanHook: (request: IncomingMessage) =>
          getSanitizedIncomingUrlAttributes(request, config.healthPath),
        startOutgoingSpanHook: (request: RequestOptions) =>
          getSanitizedOutgoingHttpUrlAttributes(request),
        ignoreIncomingRequestHook: (request: IncomingMessage) =>
          shouldIgnoreIncomingRequest(request, config.healthPath),
      }),
      new ExpressInstrumentation(),
      new MongoDBInstrumentation(),
      new MongooseInstrumentation(),
      new IORedisInstrumentation(),
      new UndiciInstrumentation({
        startSpanHook: (request: UndiciRequestInfo) => getSanitizedUndiciUrlAttributes(request),
      }),
    ],
  };

  return new NodeSDK(sdkConfig);
}

export function getTelemetryRequestSpan(request: IncomingMessage): Span | undefined {
  return requestSpans.get(request);
}

/**
 * NodeSDK.start has been synchronous in some supported OpenTelemetry versions
 * and promise-returning in others, so the lifecycle wrapper accepts either form.
 */
function startSdk(sdk: NodeSDK): void | Promise<void> {
  return (sdk as NodeSDK & { start: () => void | Promise<void> }).start();
}

function emitWarning(message: string): void {
  process.emitWarning(message, { code: WARNING_CODE });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isControllerEnabled(): boolean {
  return status === 'starting' || status === 'started';
}

function makeController(): TelemetryController {
  return {
    get enabled() {
      return isControllerEnabled();
    },
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
      const shouldReraiseSignal = process.listenerCount(signal) === 0;
      withTimeout(shutdownTelemetry(), SIGNAL_SHUTDOWN_TIMEOUT_MS)
        .catch((error) => {
          emitWarning(`OpenTelemetry shutdown failed: ${getErrorMessage(error)}`);
        })
        .finally(() => {
          if (shouldReraiseSignal) {
            process.kill(process.pid, signal);
          }
        });
    };
    process.once(signal, listener);
    return { signal, listener };
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export function initializeTelemetry(env: NodeJS.ProcessEnv = process.env): TelemetryController {
  if (activeSdk || pendingSdk) {
    return makeController();
  }

  const config = getTelemetryConfig(env);
  if (!config.enabled || isBunRuntime()) {
    status = 'disabled';
    return makeController();
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
            emitWarning(`OpenTelemetry initialization failed: ${getErrorMessage(error)}`);
          }
        });
      startPromise = pendingStart;
      void pendingStart.finally(() => {
        if (startPromise === pendingStart) {
          startPromise = undefined;
        }
      });
      return makeController();
    }

    activeSdk = sdk;
    status = 'started';
    registerShutdownHandlers();
    return makeController();
  } catch (error) {
    status = 'failed';
    emitWarning(`OpenTelemetry initialization failed: ${getErrorMessage(error)}`);
    return makeController();
  }
}

async function performShutdownTelemetry(): Promise<void> {
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

export function shutdownTelemetry(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = performShutdownTelemetry().finally(() => {
      shutdownPromise = undefined;
    });
  }

  return shutdownPromise;
}

export async function resetTelemetryForTests(): Promise<void> {
  try {
    if (startPromise) {
      await startPromise.catch(() => undefined);
    }

    if (shutdownPromise) {
      await shutdownPromise.catch(() => undefined);
    } else if (activeSdk) {
      await Promise.resolve(activeSdk.shutdown()).catch(() => undefined);
    }
  } finally {
    activeSdk = undefined;
    pendingSdk = undefined;
    startPromise = undefined;
    shutdownPromise = undefined;
    status = 'stopped';
    requestSpans = new WeakMap<IncomingMessage, Span>();
    unregisterShutdownHandlers();
  }
}
