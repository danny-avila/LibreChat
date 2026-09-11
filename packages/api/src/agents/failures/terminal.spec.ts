import { createTerminalRunErrorObserver, getUpstreamModelErrorMetadata } from './terminal';

describe('terminal agent-run error logging', () => {
  it('logs stable upstream metadata and deterministic trace correlation', () => {
    const logger = { error: jest.fn() };
    const privateValue = 'PRIVATE-PROVIDER-CONTENT';
    const providerError = Object.assign(new Error(`Provider echoed ${privateValue}`), {
      name: 'InternalServerException',
      code: 'InternalServerException',
      response: {
        status: 500,
        headers: { authorization: privateValue },
        data: { prompt: privateValue },
      },
    });
    const observer = createTerminalRunErrorObserver({
      logger,
      responseMessageId: '78847296-b174-4127-a342-78efa427d4a5',
      source: '[Agent API]',
    });
    observer.modelCallback.handleLLMError(providerError);

    observer.log(new Error('graph failed', { cause: providerError }));

    expect(
      observer.getUserFacingError(new Error('graph failed', { cause: providerError }), 'fallback'),
    ).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({ type: 'upstream_model_error', status: 500 }),
    );

    expect(logger.error).toHaveBeenCalledWith('[Agent API] Upstream model error', {
      type: 'Error',
      status: 500,
      errorCode: 'UPSTREAM_MODEL_ERROR',
      errorOrigin: 'model_provider',
      errorType: '500',
      traceId: '3a90048362ec9a2e717c6b77769b9a54',
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(privateValue);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('InternalServerException');
  });

  it('keeps unrelated terminal failures on the generic safe path', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({
      logger,
      responseMessageId: 'response-123',
      source: '[Agent API]',
    });
    observer.modelCallback.handleLLMError(new Error('recovered model attempt'));

    observer.log(new Error('checkpoint failed'));

    expect(observer.getUserFacingError(new Error('checkpoint failed'), 'fallback')).toBe(
      'fallback',
    );

    expect(logger.error).toHaveBeenCalledWith('[Agent API] Error:', { type: 'Error' });
  });

  it('does not log a tracked client cancellation as an upstream failure', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({ logger, source: '[Agent API]' });
    const controller = new AbortController();
    const abortError = Object.assign(new Error('request aborted'), { name: 'AbortError' });
    observer.modelCallback.handleLLMError(abortError);
    controller.abort();

    observer.log(abortError, controller.signal);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps provider AbortErrors observable while the run signal is live', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({ logger, source: '[Agent API]' });
    const abortError = Object.assign(new Error('provider aborted'), { name: 'AbortError' });
    observer.modelCallback.handleLLMError(abortError);

    observer.log(abortError, new AbortController().signal);

    expect(logger.error).toHaveBeenCalledWith(
      '[Agent API] Upstream model error',
      expect.objectContaining({ errorCode: 'UPSTREAM_MODEL_ERROR' }),
    );
  });

  it('keeps real provider failures observable when Stop wins the same-tick race', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({ logger, source: '[Agent API]' });
    const controller = new AbortController();
    const providerError = new Error('provider failed');
    observer.modelCallback.handleLLMError(providerError);
    controller.abort();

    observer.log(providerError, controller.signal);

    expect(logger.error).toHaveBeenCalledWith(
      '[Agent API] Upstream model error',
      expect.objectContaining({ errorCode: 'UPSTREAM_MODEL_ERROR' }),
    );
  });

  it('preserves a more specific localized model classification', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
    });
    const providerError = new Error('provider failed');
    const terminalError = Object.assign(new Error('rate limited', { cause: providerError }), {
      lc_error_code: 'MODEL_RATE_LIMIT',
    });
    observer.modelCallback.handleLLMError(providerError);

    expect(observer.getUserFacingError(terminalError, 'fallback')).toBe(
      JSON.stringify({ type: 'model_rate_limit' }),
    );
  });

  it('contains hostile provider accessors while building the safe fallback', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
    });
    const providerError = Object.create(null, {
      lc_error_code: {
        get() {
          throw new Error('hostile code getter');
        },
      },
      message: {
        get() {
          throw new Error('hostile message getter');
        },
      },
    });
    observer.modelCallback.handleLLMError(providerError);

    expect(observer.getUserFacingError(providerError, 'fallback')).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({ type: 'upstream_model_error' }),
    );
  });

  it('uses a bounded fallback type and omits unavailable trace correlation', () => {
    expect(getUpstreamModelErrorMetadata(new Error('provider failed'))).toEqual({
      type: 'Error',
      errorCode: 'UPSTREAM_MODEL_ERROR',
      errorOrigin: 'model_provider',
      errorType: '_OTHER',
    });
  });
});
