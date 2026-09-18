import { FileSources, resolveMediaConfig } from 'librechat-data-provider';
import type { AppConfig, IUser, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaConfigInput } from 'librechat-data-provider';
import type { MediaTitleGeneratorDependencies, MediaTitleInvoker, MediaTitleModel } from './title';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaContext } from './context';
import {
  buildMediaTitlePrompt,
  createMediaTitleGenerator,
  createMediaTitleModelResolver,
  resolveMediaTitleTarget,
} from './title';

const scope: MediaOwnerScope = { ownerId: 'owner-1', tenantId: null };
const user = { id: 'owner-1' } as IUser;
const model: MediaTitleModel = { provider: 'openAI', clientOptions: { model: 'gpt-4o-mini' } };

function context(media?: MediaConfigInput, appConfig: Partial<AppConfig> = {}): MediaContext {
  return {
    scope,
    appConfig: { config: {}, fileStrategy: FileSources.local, ...appConfig } as AppConfig,
    config: resolveMediaConfig(media),
    canUse: true,
    canCreate: true,
    user,
  };
}

const configured = (extra: MediaConfigInput = {}): MediaConfigInput => ({
  titles: { endpoint: 'openAI', model: 'gpt-4o-mini' },
  ...extra,
});

describe('resolveMediaTitleTarget', () => {
  it('returns nothing when titles are disabled', () => {
    expect(
      resolveMediaTitleTarget(
        context({ titles: { enabled: false, endpoint: 'openAI', model: 'gpt-4o-mini' } }),
      ),
    ).toBeUndefined();
  });

  it('returns nothing without an endpoint anywhere so unconfigured deployments keep prompt titles', () => {
    expect(resolveMediaTitleTarget(context())).toBeUndefined();
    expect(resolveMediaTitleTarget(context({ titles: { model: 'gpt-4o-mini' } }))).toBeUndefined();
  });

  it('uses the explicit media endpoint, model, prompt and timeout', () => {
    expect(
      resolveMediaTitleTarget(
        context({
          titles: {
            endpoint: 'openAI',
            model: 'gpt-4o-mini',
            prompt: 'Name {prompt}',
            timeoutMs: 5,
          },
        }),
      ),
    ).toEqual({ endpoint: 'openAI', model: 'gpt-4o-mini', prompt: 'Name {prompt}', timeoutMs: 5 });
  });

  it('falls back to the global chat title endpoint and model', () => {
    expect(
      resolveMediaTitleTarget(
        context(
          {},
          {
            endpoints: { all: { titleEndpoint: 'anthropic', titleModel: 'claude-3-5-haiku' } },
          },
        ),
      ),
    ).toMatchObject({ endpoint: 'anthropic', model: 'claude-3-5-haiku' });
  });

  it('ignores current_model and reads the named or custom endpoint titleModel instead', () => {
    expect(
      resolveMediaTitleTarget(
        context(
          { titles: { endpoint: 'openAI', model: 'current_model' } },
          {
            endpoints: {
              all: { titleModel: 'current_model' },
              openAI: { titleModel: 'gpt-4o-mini' },
            },
          },
        ),
      ),
    ).toMatchObject({ endpoint: 'openAI', model: 'gpt-4o-mini' });
    expect(
      resolveMediaTitleTarget(
        context({ titles: { endpoint: 'Fixture' } }, {
          endpoints: {
            custom: [
              {
                name: 'Fixture',
                apiKey: 'secret',
                baseURL: 'http://127.0.0.1:9/v1',
                titleModel: 'fixture-mini',
              },
            ],
          },
        } as Partial<AppConfig>),
      ),
    ).toMatchObject({ endpoint: 'Fixture', model: 'fixture-mini' });
    expect(
      resolveMediaTitleTarget(
        context(
          { titles: { endpoint: 'openAI' } },
          { endpoints: { all: { titleModel: 'current_model' } } },
        ),
      ),
    ).toBeUndefined();
  });
});

describe('buildMediaTitlePrompt', () => {
  it('words the default prompt per operation and ends with the request', () => {
    const image = buildMediaTitlePrompt({ prompt: 'A lake at dawn', operation: 'image.generate' });
    expect(image).toContain('5 words or less for an image generation request');
    expect(image.endsWith('\nA lake at dawn')).toBe(true);
    expect(buildMediaTitlePrompt({ prompt: 'x', operation: 'image.edit' })).toContain(
      'an image editing request',
    );
    expect(buildMediaTitlePrompt({ prompt: 'x', operation: 'video.generate' })).toContain(
      'a video generation request',
    );
  });

  it('substitutes every placeholder literally and appends the prompt when a template has none', () => {
    expect(
      buildMediaTitlePrompt({
        prompt: 'Costs $& more',
        operation: 'image.generate',
        template: 'Title for {prompt} ({prompt})',
      }),
    ).toBe('Title for Costs $& more (Costs $& more)');
    expect(
      buildMediaTitlePrompt({ prompt: 'A lake', operation: 'video.generate', template: 'Name it' }),
    ).toBe('Name it\n\nA lake');
  });
});

describe('createMediaTitleModelResolver', () => {
  const db = {
    getUserKey: async () => {
      throw new Error('unexpected user key lookup');
    },
    getUserKeyValues: async () => {
      throw new Error('unexpected user key lookup');
    },
  };

  it('returns nothing without a request user', async () => {
    const resolve = createMediaTitleModelResolver({ db });
    expect(
      await resolve({
        context: { ...context(configured()), user: undefined },
        target: { endpoint: 'openAI', model: 'gpt-4o-mini', timeoutMs: 1_000 },
      }),
    ).toBeUndefined();
  });

  it('resolves a configured custom endpoint into sanitized, non-streaming client options', async () => {
    const resolve = createMediaTitleModelResolver({ db });
    const resolved = await resolve({
      context: context({ titles: { endpoint: 'Fixture', model: 'fixture-mini' } }, {
        endpoints: {
          custom: [{ name: 'Fixture', apiKey: 'secret', baseURL: 'http://127.0.0.1:9/v1' }],
        },
      } as Partial<AppConfig>),
      target: { endpoint: 'Fixture', model: 'fixture-mini', timeoutMs: 1_000 },
    });
    expect(resolved?.provider).toBe('openAI');
    expect(resolved?.clientOptions).toMatchObject({ model: 'fixture-mini' });
    expect(resolved?.clientOptions).not.toHaveProperty('streaming');
    expect(resolved?.clientOptions).not.toHaveProperty('maxTokens');
  });
});

describe('createMediaTitleGenerator', () => {
  const threadId = 'thread-1';
  const prompt = 'A quiet observatory under the stars';
  const currentTitle = 'A quiet observatory under the stars';

  function repository(title = currentTitle) {
    const thread = { title, version: 1 };
    const calls: Array<{ expectedTitle: string; title: string }> = [];
    return {
      thread,
      calls,
      replaceMediaThreadTitle: async (input: {
        scope: MediaOwnerScope;
        threadId: string;
        expectedTitle: string;
        title: string;
      }) => {
        calls.push({ expectedTitle: input.expectedTitle, title: input.title });
        if (input.threadId !== threadId || thread.title !== input.expectedTitle) {
          return false;
        }
        thread.title = input.title;
        thread.version += 1;
        return true;
      },
    };
  }

  const reply =
    (text: string, usage?: { input_tokens?: number; output_tokens?: number }): MediaTitleInvoker =>
    async () => ({ text, usage });

  function generator(
    invoke: MediaTitleInvoker,
    overrides: Partial<MediaTitleGeneratorDependencies> = {},
  ) {
    const repo = repository();
    const scopes: MediaOwnerScope[] = [];
    const errors: Error[] = [];
    const resolved: MediaTitleModel[] = [];
    const generate = createMediaTitleGenerator({
      repository: repo,
      resolveModel: async () => {
        resolved.push(model);
        return model;
      },
      invoke,
      withScope: async (requested, operation) => {
        scopes.push(requested);
        return operation();
      },
      log: (error) => {
        errors.push(error);
      },
      ...overrides,
    });
    return { generate, repo, scopes, errors, resolved };
  }

  const request = (media: MediaConfigInput = configured(), appConfig?: Partial<AppConfig>) => ({
    context: context(media, appConfig),
    threadId,
    prompt,
    operation: 'image.generate' as const,
    currentTitle,
  });

  it('applies a cleaned title inside the owner scope', async () => {
    const { generate, repo, scopes, errors } = generator(
      reply('<think>naming...</think>\n “Quiet Observatory Sketch.” \n'),
    );
    await expect(generate(request())).resolves.toBe('Quiet Observatory Sketch');
    expect(repo.thread).toEqual({ title: 'Quiet Observatory Sketch', version: 2 });
    expect(repo.calls).toEqual([
      { expectedTitle: currentTitle, title: 'Quiet Observatory Sketch' },
    ]);
    expect(scopes).toEqual([scope]);
    expect(errors).toEqual([]);
  });

  it('bounds the generated title to the configured limit without splitting characters', async () => {
    const { generate, repo } = generator(reply('Quiet 🌲 Observatory'));
    await expect(generate(request(configured({ limits: { maxTitleChars: 8 } })))).resolves.toBe(
      'Quiet 🌲',
    );
    expect(repo.thread.title).toBe('Quiet 🌲');
    const { generate: split, repo: splitRepo } = generator(reply('Quiet 🌲 Observatory'));
    await expect(split(request(configured({ limits: { maxTitleChars: 7 } })))).resolves.toBe(
      'Quiet',
    );
    expect(splitRepo.thread.title).toBe('Quiet');
  });

  it('skips empty replies and titles equal to the prompt-derived one', async () => {
    const empty = generator(reply('  <think>nothing</think>  '));
    await expect(empty.generate(request())).resolves.toBeUndefined();
    expect(empty.repo.calls).toEqual([]);
    const same = generator(reply(`"${currentTitle}"`));
    await expect(same.generate(request())).resolves.toBeUndefined();
    expect(same.repo.calls).toEqual([]);
    expect([...empty.errors, ...same.errors]).toEqual([]);
  });

  it('leaves a thread alone once the user renamed it', async () => {
    const repo = repository('My observatory');
    const { generate } = generator(reply('Quiet Observatory'), { repository: repo });
    await expect(generate(request())).resolves.toBeUndefined();
    expect(repo.thread).toEqual({ title: 'My observatory', version: 1 });
  });

  it('does nothing without a resolvable target or model', async () => {
    let invoked = 0;
    const invoke: MediaTitleInvoker = async () => {
      invoked += 1;
      return { text: 'Never' };
    };
    const disabled = generator(invoke);
    await expect(
      disabled.generate(request({ titles: { enabled: false } })),
    ).resolves.toBeUndefined();
    expect(disabled.resolved).toEqual([]);
    const noModel = generator(invoke, { resolveModel: async () => undefined });
    await expect(noModel.generate(request())).resolves.toBeUndefined();
    expect(invoked).toBe(0);
    expect(noModel.repo.calls).toEqual([]);
  });

  it('logs and swallows invoker failures', async () => {
    const failure = new Error('provider unavailable');
    const { generate, repo, errors } = generator(async () => {
      throw failure;
    });
    await expect(generate(request())).resolves.toBeUndefined();
    expect(errors).toEqual([failure]);
    expect(repo.calls).toEqual([]);
  });

  it('aborts the model call at the configured timeout', async () => {
    const { generate, repo, errors } = generator(
      (_model, _prompt, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    await expect(
      generate(request({ titles: { endpoint: 'openAI', model: 'gpt-4o-mini', timeoutMs: 1 } })),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/timeout/i);
    expect(repo.calls).toEqual([]);
  });

  it('records title usage against the owner and thread when billing deps are supplied', async () => {
    const spendTokens = jest.fn(async () => undefined);
    const usage: RecordUsageDeps = { spendTokens, spendStructuredTokens: jest.fn() };
    const { generate } = generator(
      reply('Quiet Observatory', { input_tokens: 12, output_tokens: 4 }),
      { usage },
    );
    await expect(generate(request())).resolves.toBe('Quiet Observatory');
    expect(spendTokens).toHaveBeenCalledTimes(1);
    expect(spendTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'title',
        user: scope.ownerId,
        conversationId: threadId,
        model: 'gpt-4o-mini',
      }),
      { promptTokens: 12, completionTokens: 4 },
    );
    const skipped = generator(reply(currentTitle, { input_tokens: 9, output_tokens: 2 }), {
      usage,
    });
    await expect(skipped.generate(request())).resolves.toBeUndefined();
    expect(spendTokens).toHaveBeenCalledTimes(2);
    const unmetered = generator(reply('Quiet Observatory'), { usage });
    await expect(unmetered.generate(request())).resolves.toBe('Quiet Observatory');
    expect(spendTokens).toHaveBeenCalledTimes(2);
  });
});
