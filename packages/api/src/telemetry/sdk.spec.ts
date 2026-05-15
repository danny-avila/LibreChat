import { Socket } from 'node:net';
import { IncomingMessage } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { Span } from '@opentelemetry/api';
import type { RequestOptions } from 'node:http';

interface HttpInstrumentationOptions {
  requestHook?: (span: Span, request: object) => void;
  startIncomingSpanHook?: (request: IncomingMessage) => Record<string, string>;
  startOutgoingSpanHook?: (request: RequestOptions) => Record<string, string>;
}

interface UndiciInstrumentationOptions {
  startSpanHook?: (request: { origin?: string; path?: string }) => Record<string, string>;
}

const mockStart = jest.fn();
const mockShutdown = jest.fn();
const mockNodeSDK = jest.fn(() => ({
  start: mockStart,
  shutdown: mockShutdown,
}));
const mockExpressInstrumentation = jest.fn(() => ({ name: 'express' }));
const mockHttpInstrumentation = jest.fn((options?: HttpInstrumentationOptions) => ({
  name: 'http',
  options,
}));
const mockIORedisInstrumentation = jest.fn(() => ({ name: 'ioredis' }));
const mockMongoDBInstrumentation = jest.fn(() => ({ name: 'mongodb' }));
const mockMongooseInstrumentation = jest.fn(() => ({ name: 'mongoose' }));
const mockUndiciInstrumentation = jest.fn((options?: UndiciInstrumentationOptions) => ({
  name: 'undici',
  options,
}));
const mockResourceFromAttributes = jest.fn((attributes: object) => ({ attributes }));

jest.mock(
  '@opentelemetry/sdk-node',
  () => ({
    NodeSDK: mockNodeSDK,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-express',
  () => ({
    ExpressInstrumentation: mockExpressInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-http',
  () => ({
    HttpInstrumentation: mockHttpInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-ioredis',
  () => ({
    IORedisInstrumentation: mockIORedisInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-mongodb',
  () => ({
    MongoDBInstrumentation: mockMongoDBInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-mongoose',
  () => ({
    MongooseInstrumentation: mockMongooseInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/instrumentation-undici',
  () => ({
    UndiciInstrumentation: mockUndiciInstrumentation,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/resources',
  () => ({
    resourceFromAttributes: mockResourceFromAttributes,
  }),
  { virtual: true },
);

jest.mock(
  '@opentelemetry/semantic-conventions',
  () => ({
    ATTR_SERVICE_NAME: 'service.name',
    ATTR_SERVICE_VERSION: 'service.version',
  }),
  { virtual: true },
);

async function flushSignalShutdown(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('telemetry SDK lifecycle', () => {
  let emitWarningSpy: jest.SpyInstance;
  let getTelemetryRequestSpan: (typeof import('./sdk'))['getTelemetryRequestSpan'];
  let initializeTelemetry: (typeof import('./sdk'))['initializeTelemetry'];
  let resetTelemetryForTests: (typeof import('./sdk'))['resetTelemetryForTests'];
  let shutdownTelemetry: (typeof import('./sdk'))['shutdownTelemetry'];

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ getTelemetryRequestSpan, initializeTelemetry, resetTelemetryForTests, shutdownTelemetry } =
      await import('./sdk'));
    await resetTelemetryForTests();
    Reflect.deleteProperty(globalThis, 'Bun');
    emitWarningSpy = jest.spyOn(process, 'emitWarning').mockImplementation(() => true);
  });

  afterEach(async () => {
    await resetTelemetryForTests();
    emitWarningSpy.mockRestore();
    Reflect.deleteProperty(globalThis, 'Bun');
  });

  it('does not initialize when tracing is disabled by default', () => {
    const controller = initializeTelemetry({});

    expect(controller.enabled).toBe(false);
    expect(controller.status).toBe('disabled');
    expect(mockNodeSDK).not.toHaveBeenCalled();
  });

  it('does not initialize when OTEL_SDK_DISABLED is true', () => {
    const controller = initializeTelemetry({
      OTEL_SDK_DISABLED: 'true',
      OTEL_TRACING_ENABLED: 'true',
    });

    expect(controller.enabled).toBe(false);
    expect(controller.status).toBe('disabled');
    expect(mockNodeSDK).not.toHaveBeenCalled();
  });

  it('does not initialize under Bun runtime', () => {
    Object.defineProperty(globalThis, 'Bun', {
      configurable: true,
      value: {},
    });

    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.enabled).toBe(false);
    expect(controller.status).toBe('disabled');
    expect(mockNodeSDK).not.toHaveBeenCalled();
  });

  it('starts the Node SDK once when enabled', () => {
    const first = initializeTelemetry({
      OTEL_SERVICE_NAME: 'librechat-test',
      OTEL_TRACING_ENABLED: 'true',
    });
    const second = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(first.enabled).toBe(true);
    expect(first.status).toBe('started');
    expect(second.enabled).toBe(true);
    expect(mockNodeSDK).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockResourceFromAttributes).toHaveBeenCalledWith({
      'service.name': 'librechat-test',
    });
    expect(mockHttpInstrumentation).toHaveBeenCalledWith(
      expect.objectContaining({
        headersToSpanAttributes: {
          client: { requestHeaders: [], responseHeaders: [] },
          server: { requestHeaders: [], responseHeaders: [] },
        },
      }),
    );
    expect(mockExpressInstrumentation).toHaveBeenCalledTimes(1);
    expect(mockMongoDBInstrumentation).toHaveBeenCalledTimes(1);
    expect(mockMongooseInstrumentation).toHaveBeenCalledTimes(1);
    expect(mockIORedisInstrumentation).toHaveBeenCalledTimes(1);
    expect(mockUndiciInstrumentation).toHaveBeenCalledTimes(1);
  });

  it('tracks HTTP server request spans for completion updates', () => {
    const span = {} as Span;
    const request = new IncomingMessage(new Socket());
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const requestHook = instrumentationOptions?.requestHook;

    if (!requestHook) {
      throw new Error('HTTP instrumentation requestHook was not configured');
    }

    requestHook(span, request);

    expect(getTelemetryRequestSpan(request)).toBe(span);
  });

  it('redacts incoming URL attributes before HTTP spans are exported', () => {
    const request = new IncomingMessage(new Socket());
    request.url = '/oauth/callback?code=secret-code&state=secret-state';
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startIncomingSpanHook = instrumentationOptions?.startIncomingSpanHook;

    if (!startIncomingSpanHook) {
      throw new Error('HTTP instrumentation startIncomingSpanHook was not configured');
    }

    const attributes = startIncomingSpanHook(request);

    expect(attributes).toEqual({
      'http.target': 'spa_fallback?[REDACTED]',
      'http.url': 'spa_fallback?[REDACTED]',
      'url.full': 'spa_fallback?[REDACTED]',
      'url.path': 'spa_fallback',
      'url.query': '[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('secret-code');
    expect(JSON.stringify(attributes)).not.toContain('secret-state');
  });

  it('redacts outgoing HTTP URL query attributes before client spans are exported', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: 33169,
      path: '/custom-action?api_key=LC_ACTION_QUERY_SECRET_67890&user_text=sensitive+prompt+words',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?api_key=[REDACTED]&user_text=[REDACTED]',
      'http.url': 'http://127.0.0.1:33169/custom-action?api_key=[REDACTED]&user_text=[REDACTED]',
      'url.full': 'http://127.0.0.1:33169/custom-action?api_key=[REDACTED]&user_text=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': 'api_key=[REDACTED]&user_text=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
    expect(JSON.stringify(attributes)).not.toContain('sensitive+prompt+words');
  });

  it('redacts delimiter-less outgoing query segments and preserves separate HTTP ports', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      protocol: 'https:',
      host: 'api.example.com',
      port: 8443,
      path: '/custom-action?LC_ACTION_QUERY_SECRET_67890&user_text=sensitive+prompt+words',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?[REDACTED]&user_text=[REDACTED]',
      'http.url': 'https://api.example.com:8443/custom-action?[REDACTED]&user_text=[REDACTED]',
      'url.full': 'https://api.example.com:8443/custom-action?[REDACTED]&user_text=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': '[REDACTED]&user_text=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
    expect(JSON.stringify(attributes)).not.toContain('sensitive+prompt+words');
  });

  it('keeps outgoing HTTP URLs absolute when request options omit an origin', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      protocol: 'http:',
      path: '/custom-action?api_key=LC_ACTION_QUERY_SECRET_67890',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?api_key=[REDACTED]',
      'http.url': 'http://localhost/custom-action?api_key=[REDACTED]',
      'url.full': 'http://localhost/custom-action?api_key=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': 'api_key=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
  });

  it('uses the agent protocol for outgoing URL attributes when request protocol is absent', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      agent: new HttpsAgent(),
      hostname: 'api.example.com',
      path: '/custom-action?api_key=LC_ACTION_QUERY_SECRET_67890',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?api_key=[REDACTED]',
      'http.url': 'https://api.example.com/custom-action?api_key=[REDACTED]',
      'url.full': 'https://api.example.com/custom-action?api_key=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': 'api_key=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
  });

  it('does not infer HTTPS from port 443 without protocol context', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      hostname: 'api.example.com',
      port: 443,
      path: '/custom-action?api_key=LC_ACTION_QUERY_SECRET_67890',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?api_key=[REDACTED]',
      'http.url': 'http://api.example.com:443/custom-action?api_key=[REDACTED]',
      'url.full': 'http://api.example.com:443/custom-action?api_key=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': 'api_key=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
  });

  it('brackets IPv6 hostnames in outgoing HTTP URL attributes', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockHttpInstrumentation.mock.calls[0]?.[0];
    const startOutgoingSpanHook = instrumentationOptions?.startOutgoingSpanHook;

    if (!startOutgoingSpanHook) {
      throw new Error('HTTP instrumentation startOutgoingSpanHook was not configured');
    }

    const attributes = startOutgoingSpanHook({
      protocol: 'http:',
      hostname: '::1',
      port: 8080,
      path: '/custom-action?api_key=LC_ACTION_QUERY_SECRET_67890',
    });

    expect(attributes).toEqual({
      'http.target': '/custom-action?api_key=[REDACTED]',
      'http.url': 'http://[::1]:8080/custom-action?api_key=[REDACTED]',
      'url.full': 'http://[::1]:8080/custom-action?api_key=[REDACTED]',
      'url.path': '/custom-action',
      'url.query': 'api_key=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('LC_ACTION_QUERY_SECRET_67890');
  });

  it('redacts outgoing Undici URL query attributes before fetch spans are exported', () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    const instrumentationOptions = mockUndiciInstrumentation.mock.calls[0]?.[0];
    const startSpanHook = instrumentationOptions?.startSpanHook;

    if (!startSpanHook) {
      throw new Error('Undici instrumentation startSpanHook was not configured');
    }

    const attributes = startSpanHook({
      origin: 'https://api.openweathermap.org',
      path: '/data/3.0/onecall?appid=OPENWEATHER_SECRET_123&lat=40.71&lon=-74.01',
    });

    expect(attributes).toEqual({
      'http.target': '/data/3.0/onecall?appid=[REDACTED]&lat=[REDACTED]&lon=[REDACTED]',
      'http.url':
        'https://api.openweathermap.org/data/3.0/onecall?appid=[REDACTED]&lat=[REDACTED]&lon=[REDACTED]',
      'url.full':
        'https://api.openweathermap.org/data/3.0/onecall?appid=[REDACTED]&lat=[REDACTED]&lon=[REDACTED]',
      'url.path': '/data/3.0/onecall',
      'url.query': 'appid=[REDACTED]&lat=[REDACTED]&lon=[REDACTED]',
    });
    expect(JSON.stringify(attributes)).not.toContain('OPENWEATHER_SECRET_123');
    expect(JSON.stringify(attributes)).not.toContain('40.71');
    expect(JSON.stringify(attributes)).not.toContain('-74.01');
  });

  it('reflects lifecycle status from the controller getter', async () => {
    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.status).toBe('started');
    await controller.shutdown();
    expect(controller.status).toBe('stopped');
    expect(controller.enabled).toBe(false);
  });

  it('handles async SDK start failures without throwing', async () => {
    mockStart.mockRejectedValueOnce(new Error('async start failed'));

    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.enabled).toBe(true);
    expect(controller.status).toBe('starting');
    await controller.shutdown();
    expect(controller.enabled).toBe(false);
    expect(controller.status).toBe('failed');
    expect(emitWarningSpy).toHaveBeenCalledWith(
      'OpenTelemetry initialization failed: async start failed',
      { code: 'LIBRECHAT_OTEL' },
    );
  });

  it('returns failed status without throwing when SDK start fails', () => {
    mockStart.mockImplementationOnce(() => {
      throw new Error('start failed');
    });

    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.enabled).toBe(false);
    expect(controller.status).toBe('failed');
    expect(emitWarningSpy).toHaveBeenCalledWith(
      'OpenTelemetry initialization failed: start failed',
      { code: 'LIBRECHAT_OTEL' },
    );
  });

  it('shuts down the active SDK idempotently', async () => {
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
    await shutdownTelemetry();
    await shutdownTelemetry();

    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent shutdown calls', async () => {
    let resolveShutdown: () => void = () => undefined;
    mockShutdown.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveShutdown = resolve;
      }),
    );
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    const firstShutdown = shutdownTelemetry();
    const secondShutdown = shutdownTelemetry();
    expect(mockShutdown).toHaveBeenCalledTimes(1);

    resolveShutdown();
    await Promise.all([firstShutdown, secondShutdown]);
  });

  it('keeps the active SDK available when shutdown fails', async () => {
    mockShutdown.mockRejectedValueOnce(new Error('shutdown failed'));
    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    await expect(shutdownTelemetry()).rejects.toThrow('shutdown failed');
    expect(controller.status).toBe('started');

    await shutdownTelemetry();
    expect(mockShutdown).toHaveBeenCalledTimes(2);
    expect(controller.status).toBe('stopped');
  });

  it.each<NodeJS.Signals>(['SIGTERM', 'SIGINT'])(
    'does not force process exit when another %s handler is registered',
    async (signal) => {
      const otherHandler = jest.fn();
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
      initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });
      process.once(signal, otherHandler);

      process.emit(signal, signal);
      await flushSignalShutdown();

      expect(mockShutdown).toHaveBeenCalledTimes(1);
      expect(otherHandler).toHaveBeenCalledTimes(1);
      expect(killSpy).not.toHaveBeenCalled();

      killSpy.mockRestore();
    },
  );

  it.each<NodeJS.Signals>(['SIGTERM', 'SIGINT'])(
    'reraises the shutdown %s signal when telemetry is the only signal handler',
    async (signal) => {
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
      initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

      process.emit(signal, signal);
      await flushSignalShutdown();

      expect(mockShutdown).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(process.pid, signal);

      killSpy.mockRestore();
    },
  );

  it('warns and reraises the signal when shutdown rejects', async () => {
    mockShutdown.mockRejectedValueOnce(new Error('signal shutdown failed'));
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    process.emit('SIGTERM', 'SIGTERM');
    await flushSignalShutdown();

    expect(mockShutdown).toHaveBeenCalledTimes(1);
    expect(emitWarningSpy).toHaveBeenCalledWith(
      'OpenTelemetry shutdown failed: signal shutdown failed',
      { code: 'LIBRECHAT_OTEL' },
    );
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');

    killSpy.mockRestore();
  });
});
