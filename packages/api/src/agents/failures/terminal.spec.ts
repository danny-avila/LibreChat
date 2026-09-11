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

    expect(logger.error).toHaveBeenCalledWith('[Agent API] Error:', { type: 'Error' });
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
