const mockStart = jest.fn();
const mockShutdown = jest.fn();
const mockNodeSDK = jest.fn(() => ({
  start: mockStart,
  shutdown: mockShutdown,
}));
const mockGetNodeAutoInstrumentations = jest.fn(() => ['instrumentation']);
const mockResourceFromAttributes = jest.fn((attributes: object) => ({ attributes }));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mockNodeSDK,
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: mockGetNodeAutoInstrumentations,
}));

jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: mockResourceFromAttributes,
}));

describe('telemetry SDK lifecycle', () => {
  let emitWarningSpy: jest.SpyInstance;
  let initializeTelemetry: (typeof import('./sdk'))['initializeTelemetry'];
  let resetTelemetryForTests: (typeof import('./sdk'))['resetTelemetryForTests'];
  let shutdownTelemetry: (typeof import('./sdk'))['shutdownTelemetry'];

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ initializeTelemetry, resetTelemetryForTests, shutdownTelemetry } = await import('./sdk'));
    resetTelemetryForTests();
    Reflect.deleteProperty(globalThis, 'Bun');
    emitWarningSpy = jest.spyOn(process, 'emitWarning').mockImplementation(() => true);
  });

  afterEach(() => {
    resetTelemetryForTests();
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
    expect(mockGetNodeAutoInstrumentations).toHaveBeenCalledWith(
      expect.objectContaining({
        '@opentelemetry/instrumentation-bunyan': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-graphql': { enabled: false },
        '@opentelemetry/instrumentation-http': expect.objectContaining({
          headersToSpanAttributes: {
            client: { requestHeaders: [], responseHeaders: [] },
            server: { requestHeaders: [], responseHeaders: [] },
          },
        }),
        '@opentelemetry/instrumentation-openai': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-runtime-node': { enabled: false },
        '@opentelemetry/instrumentation-winston': { enabled: false },
      }),
    );
  });

  it('reflects lifecycle status from the controller getter', async () => {
    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.status).toBe('started');
    await controller.shutdown();
    expect(controller.status).toBe('stopped');
  });

  it('handles async SDK start failures without throwing', async () => {
    mockStart.mockRejectedValueOnce(new Error('async start failed'));

    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    expect(controller.enabled).toBe(true);
    expect(controller.status).toBe('starting');
    await controller.shutdown();
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

  it('keeps the active SDK available when shutdown fails', async () => {
    mockShutdown.mockRejectedValueOnce(new Error('shutdown failed'));
    const controller = initializeTelemetry({ OTEL_TRACING_ENABLED: 'true' });

    await expect(shutdownTelemetry()).rejects.toThrow('shutdown failed');
    expect(controller.status).toBe('started');

    await shutdownTelemetry();
    expect(mockShutdown).toHaveBeenCalledTimes(2);
    expect(controller.status).toBe('stopped');
  });
});
