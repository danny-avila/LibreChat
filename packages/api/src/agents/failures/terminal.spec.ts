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
      protectionEnabled: true,
    });
    observer.modelCallback.handleLLMError(providerError);

    observer.log(new Error('graph failed', { cause: providerError }));

    expect(
      observer.getUserFacingError(
        new Error('graph failed', { cause: providerError }),
        () => 'fallback',
      ),
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

  /** The rejection a gateway or privacy proxy answers with is only stated in its own message. */
  it('carries the provider explanation for an unclassified upstream failure', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
      protectionEnabled: false,
    });
    const providerError = Object.assign(
      new Error('400 Request rejected: this prompt cannot be masked safely'),
      { status: 400 },
    );
    observer.modelCallback.handleLLMError(providerError);

    expect(
      observer.getUserFacingError(
        new Error('graph failed', { cause: providerError }),
        () => 'fallback',
      ),
    ).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({
          type: 'upstream_model_error',
          status: 400,
          message: '400 Request rejected: this prompt cannot be masked safely',
        }),
    );
  });

  /** A provider error rethrown without its own text: the terminal error carries the wording. */
  it('falls back to the terminal error wording when the tracked failure has none', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
      protectionEnabled: false,
    });
    const providerError = Object.assign(new Error(''), { status: 502 });
    observer.modelCallback.handleLLMError(providerError);

    expect(
      observer.getUserFacingError(
        new Error('Bad gateway from proxy', { cause: providerError }),
        () => 'fallback',
      ),
    ).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({
          type: 'upstream_model_error',
          status: 502,
          message: 'Bad gateway from proxy',
        }),
    );
  });

  it('withholds provider text while a content policy inspects the traffic', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
      protectionEnabled: true,
    });
    const privateValue = 'PRIVATE-SUBMITTED-CONTENT';
    const providerError = Object.assign(new Error(`400 rejected: ${privateValue}`), {
      status: 400,
    });
    observer.modelCallback.handleLLMError(providerError);

    const userFacingError = observer.getUserFacingError(
      new Error('graph failed', { cause: providerError }),
      () => 'fallback',
    );

    expect(userFacingError).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({ type: 'upstream_model_error', status: 400 }),
    );
    expect(userFacingError).not.toContain(privateValue);
  });

  it('keeps unrelated terminal failures on the generic safe path', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({
      logger,
      responseMessageId: 'response-123',
      source: '[Agent API]',
      protectionEnabled: false,
    });
    observer.modelCallback.handleLLMError(new Error('recovered model attempt'));

    observer.log(new Error('checkpoint failed'));

    const fallback = jest.fn(() => 'fallback');
    expect(observer.getUserFacingError(new Error('checkpoint failed'), fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);

    expect(logger.error).toHaveBeenCalledWith('[Agent API] Error:', { type: 'Error' });
  });

  it('does not log a tracked client cancellation as an upstream failure', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({
      logger,
      source: '[Agent API]',
      protectionEnabled: false,
    });
    const controller = new AbortController();
    const abortError = Object.assign(new Error('request aborted'), { name: 'AbortError' });
    observer.modelCallback.handleLLMError(abortError);
    controller.abort();

    observer.log(abortError, controller.signal);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps provider AbortErrors observable while the run signal is live', () => {
    const logger = { error: jest.fn() };
    const observer = createTerminalRunErrorObserver({
      logger,
      source: '[Agent API]',
      protectionEnabled: false,
    });
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
    const observer = createTerminalRunErrorObserver({
      logger,
      source: '[Agent API]',
      protectionEnabled: false,
    });
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
      protectionEnabled: false,
    });
    const providerError = new Error('provider failed');
    const terminalError = Object.assign(new Error('rate limited', { cause: providerError }), {
      lc_error_code: 'MODEL_RATE_LIMIT',
    });
    observer.modelCallback.handleLLMError(providerError);

    expect(observer.getUserFacingError(terminalError, () => 'fallback')).toBe(
      JSON.stringify({ type: 'model_rate_limit' }),
    );
  });

  it('contains hostile provider accessors while building the safe fallback', () => {
    const observer = createTerminalRunErrorObserver({
      logger: { error: jest.fn() },
      source: '[Agent API]',
      protectionEnabled: false,
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

    const fallback = jest.fn(() => {
      throw new Error('unsafe legacy fallback was evaluated');
    });

    expect(observer.getUserFacingError(providerError, fallback)).toBe(
      'The model provider could not complete this request.\n' +
        JSON.stringify({ type: 'upstream_model_error' }),
    );
    expect(fallback).not.toHaveBeenCalled();
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
