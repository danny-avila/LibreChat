import { FileSources, resolveMediaConfig } from 'librechat-data-provider';
import type { MediaModelTraceInput } from './tracing';
import { createMediaModelTracer } from './tracing';

const input: MediaModelTraceInput = {
  jobId: 'job',
  threadId: 'thread',
  kind: 'title',
  provider: 'openai',
  model: 'text-model',
  context: {
    scope: { ownerId: 'user', tenantId: 'tenant-a' },
    user: { id: 'user' },
    appConfig: { config: {}, fileStrategy: FileSources.local, imageOutputType: 'png' },
    config: resolveMediaConfig(),
    canCreate: true,
    canUse: true,
  },
};
const response = {
  text: 'private generated title',
  usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
};

function fixture() {
  const callback = {
    handleLLMStart: jest.fn(async () => undefined),
    handleLLMEnd: jest.fn(async () => undefined),
    handleLLMError: jest.fn(async () => undefined),
  };
  type HandlerFactory = NonNullable<
    NonNullable<Parameters<typeof createMediaModelTracer>[0]>['handler']
  >;
  const handler = jest.fn<ReturnType<HandlerFactory>, Parameters<HandlerFactory>>(() => callback);
  const config = jest.fn(() => ({ enabled: true }));
  const dispose = jest.fn(async () => undefined);
  const initialize = jest.fn(() => undefined);
  const tracer = createMediaModelTracer({
    handler,
    config,
    dispose,
    initialize,
    attributes: (_params, work) => work(),
  });
  return { tracer, callback, handler, config, dispose, initialize };
}

it('routes through existing tenant policy and records usage with content omitted', async () => {
  const { tracer, callback, config, handler, initialize } = fixture();
  await expect(
    tracer.run(
      input,
      async () => response,
      (result) => result.usage,
    ),
  ).resolves.toBe(response);
  expect(config).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId: 'tenant-a',
      appConfig: input.context.appConfig,
      user: input.context.user,
    }),
  );
  expect(initialize).toHaveBeenCalledWith({ enabled: true });
  expect(callback.handleLLMEnd).toHaveBeenCalledWith(
    expect.objectContaining({
      generations: [
        [
          expect.objectContaining({
            message: expect.objectContaining({ usage_metadata: response.usage }),
          }),
        ],
      ],
    }),
    expect.any(String),
  );
  expect(JSON.stringify(callback.handleLLMStart.mock.calls)).not.toContain('private');
  expect(JSON.stringify(callback.handleLLMEnd.mock.calls)).not.toContain(response.text);
  const firstSeed = handler.mock.calls[0][0].traceIdSeed;
  await tracer.run(
    { ...input, context: { ...input.context, scope: { ownerId: 'user', tenantId: 'tenant-b' } } },
    async () => response,
    (result) => result.usage,
  );
  expect(handler.mock.calls[1][0].traceIdSeed).not.toBe(firstSeed);
});

it('preserves successful paid results when callbacks or usage projection fail', async () => {
  const { tracer, callback } = fixture();
  callback.handleLLMStart.mockRejectedValue(new Error('offline'));
  callback.handleLLMEnd.mockRejectedValue(new Error('offline'));
  const work = jest.fn(async () => response);
  await expect(tracer.run(input, work, (result) => result.usage)).resolves.toBe(response);
  await expect(
    tracer.run(input, work, () => {
      throw new Error('projection failed');
    }),
  ).resolves.toBe(response);
  expect(work).toHaveBeenCalledTimes(2);
});

it('preserves provider failure without exporting its sensitive message', async () => {
  const { tracer, callback } = fixture();
  const error = new Error('provider-secret-and-prompt');
  await expect(
    tracer.run(
      input,
      async () => {
        throw error;
      },
      () => undefined,
    ),
  ).rejects.toBe(error);
  expect(callback.handleLLMError).toHaveBeenCalledWith(
    new Error('Media model call failed.'),
    expect.any(String),
  );
  expect(callback.handleLLMEnd).not.toHaveBeenCalled();
});

it('does not deny inference when tracing is disabled or configuration is unavailable', async () => {
  const work = jest.fn(async () => response);
  const disabled = createMediaModelTracer({
    config: () => ({ enabled: false }),
    handler: () => undefined,
  });
  await expect(disabled.run(input, work, (result) => result.usage)).resolves.toBe(response);
  const failed = createMediaModelTracer({
    config: () => {
      throw new Error('unavailable');
    },
  });
  await expect(failed.run(input, work, (result) => result.usage)).resolves.toBe(response);
  expect(work).toHaveBeenCalledTimes(2);
});

it('initializes the first tenant-only destination before constructing its SDK handler', async () => {
  const keys = [
    'CREDS_KEY',
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
    'LANGFUSE_TRACING_ENABLED',
    'LANGFUSE_SAMPLE_RATE',
    'TENANT_ISOLATION_STRICT',
    'LANGFUSE_FANOUT_ENABLED',
  ];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const initialize = jest.fn(() => undefined);
    const handler = jest.fn(() => undefined);
    await jest.isolateModulesAsync(async () => {
      const { encryptV3 } = await import('@librechat/data-schemas');
      const { createMediaModelTracer: isolatedFactory } = await import('./tracing');
      const tracer = isolatedFactory({ initialize, handler });
      const tenantInput: MediaModelTraceInput = {
        ...input,
        context: {
          ...input.context,
          appConfig: {
            ...input.context.appConfig,
            langfuse: {
              enabled: true,
              publicKey: 'pk-tenant',
              secretKey: encryptV3('sk-tenant'),
              destination: 'us',
            },
          },
        },
      };
      await expect(
        tracer.run(
          tenantInput,
          async () => response,
          (result) => result.usage,
        ),
      ).resolves.toBe(response);
    });
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: 'pk-tenant',
        secretKey: 'sk-tenant',
        baseUrl: 'https://us.cloud.langfuse.com',
        metadata: { 'librechat.tenant.id': 'tenant-a' },
      }),
    );
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(
      handler.mock.invocationCallOrder[0],
    );
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
