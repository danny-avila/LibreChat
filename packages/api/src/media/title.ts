import { initializeModel, Providers } from '@librechat/agents';
import { deriveMediaThreadTitle } from '@librechat/data-schemas';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaOperation, TEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
import type { EndpointDbMethods, InitializeResultBase, OpenAIConfiguration } from '~/types';
import type { RecordUsageDeps } from '~/agents/usage';
import type { MediaContext } from './context';
import { getBalanceConfig, getCustomEndpointConfig, getTransactionsConfig } from '~/app/config';
import { DEFAULT_TITLE_FALLBACK, sanitizeTitle } from '~/utils/sanitizeTitle';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveConversationTitle } from '~/protection/title';
import { resolveConfigHeaders } from '~/utils/headers';
import { recordCollectedUsage } from '~/agents/usage';
import { omitTitleOptions } from '~/agents/client';
import { createSafeUser } from '~/utils/env';

export interface MediaTitleTarget {
  endpoint: string;
  model: string;
  prompt?: string;
  timeoutMs: number;
}

type EndpointBlocks = Record<string, Partial<TEndpoint> | undefined>;

const unsetCurrentModel = (model?: string): string | undefined =>
  model === Constants.CURRENT_MODEL ? undefined : model;

function endpointTitleModel(appConfig: AppConfig, endpoint: string): string | undefined {
  const blocks = appConfig.endpoints as EndpointBlocks | undefined;
  const named = unsetCurrentModel(blocks?.[endpoint]?.titleModel);
  if (named) {
    return named;
  }
  try {
    return unsetCurrentModel(getCustomEndpointConfig({ endpoint, appConfig })?.titleModel);
  } catch {
    return undefined;
  }
}

/**
 * Resolves the text model that names new Studio threads. The endpoint comes from
 * `media.titles.endpoint`, then `endpoints.all.titleEndpoint`; the model from `media.titles.model`,
 * `endpoints.all.titleModel`, then the resolved endpoint's own `titleModel`, treating
 * `current_model` as unset because Studio has no running chat model to fall back to.
 */
export function resolveMediaTitleTarget(
  context: Pick<MediaContext, 'config' | 'appConfig'>,
): MediaTitleTarget | undefined {
  const { titles } = context.config;
  if (!titles.enabled) {
    return undefined;
  }
  const all = context.appConfig.endpoints?.all;
  const endpoint = titles.endpoint ?? all?.titleEndpoint;
  if (!endpoint) {
    return undefined;
  }
  const model =
    unsetCurrentModel(titles.model) ??
    unsetCurrentModel(all?.titleModel) ??
    endpointTitleModel(context.appConfig, endpoint);
  if (!model) {
    return undefined;
  }
  return { endpoint, model, prompt: titles.prompt, timeoutMs: titles.timeoutMs };
}

const PROMPT_PLACEHOLDER = '{prompt}';
const titleSubjects: Record<MediaOperation, string> = {
  'image.generate': 'an image generation request',
  'image.edit': 'an image editing request',
  'video.generate': 'a video generation request',
};

export function buildMediaTitlePrompt(input: {
  prompt: string;
  operation: MediaOperation;
  template?: string;
}): string {
  if (input.template) {
    return input.template.includes(PROMPT_PLACEHOLDER)
      ? input.template.split(PROMPT_PLACEHOLDER).join(input.prompt)
      : `${input.template}\n\n${input.prompt}`;
  }
  return [
    `Write a concise title of 5 words or less for ${titleSubjects[input.operation]}.`,
    'Use title case. Do not use quotes or punctuation. Respond with the title only.',
    '',
    input.prompt,
  ].join('\n');
}

export interface MediaTitleModel {
  provider: string;
  clientOptions: ClientOptions;
}

export type MediaTitleModelResolver = (input: {
  context: MediaContext;
  target: MediaTitleTarget;
}) => Promise<MediaTitleModel | undefined>;

/** Azure exposes an instance name only when the resolved config really targets Azure. */
type TitleClientOptions = ClientOptions & {
  azureOpenAIApiInstanceName?: string;
  configuration?: OpenAIConfiguration;
  maxTokens?: number;
  modelKwargs?: Record<string, unknown>;
  clientOptions?: { defaultHeaders?: unknown };
};

function resolveTitleProvider(
  endpoint: string,
  options: InitializeResultBase,
  overrideProvider: string,
): string {
  const provider = options.provider ?? overrideProvider;
  if (endpoint !== EModelEndpoint.azureOpenAI) {
    return provider;
  }
  const llmConfig = options.llmConfig as TitleClientOptions | undefined;
  return llmConfig?.azureOpenAIApiInstanceName == null ? Providers.OPENAI : Providers.AZURE;
}

/**
 * Mirrors the chat title path: primary-generation caps and thinking/streaming carriers are
 * dropped, while the Anthropic `clientOptions` carrier is restored by reference so proxy headers
 * and SSRF-guarded fetch options still reach the request.
 */
function sanitizeTitleClientOptions(options: InitializeResultBase): TitleClientOptions {
  const raw = { ...(options.llmConfig ?? {}) } as TitleClientOptions;
  delete raw.maxTokens;
  if (raw.modelKwargs != null) {
    const modelKwargs = { ...raw.modelKwargs };
    delete modelKwargs.max_completion_tokens;
    delete modelKwargs.max_output_tokens;
    raw.modelKwargs = modelKwargs;
  }
  const carrier = raw.clientOptions;
  const clientOptions = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !omitTitleOptions.has(key)),
  ) as TitleClientOptions;
  if (carrier != null && clientOptions.clientOptions == null) {
    clientOptions.clientOptions = carrier;
  }
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions;
  }
  return clientOptions;
}

export function createMediaTitleModelResolver({
  db,
}: {
  db: EndpointDbMethods;
}): MediaTitleModelResolver {
  return async ({ context, target }) => {
    const { user, appConfig } = context;
    if (!user) {
      return undefined;
    }
    const providerConfig = getProviderConfig({ provider: target.endpoint, appConfig });
    const options = await providerConfig.getOptions({
      runtime: { appConfig, user, requestBody: {} },
      endpoint: target.endpoint,
      model_parameters: { model: target.model },
      db,
    });
    const clientOptions = sanitizeTitleClientOptions(options);
    resolveConfigHeaders({
      llmConfig: clientOptions,
      user: createSafeUser(user),
      tenantId: context.scope.tenantId ?? undefined,
      body: {},
    });
    return {
      provider: resolveTitleProvider(target.endpoint, options, providerConfig.overrideProvider),
      clientOptions,
    };
  };
}

export interface MediaTitleUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface MediaTitleInvocation {
  text: string;
  usage?: MediaTitleUsage;
}

export type MediaTitleInvoker = (
  model: MediaTitleModel,
  prompt: string,
  signal: AbortSignal,
) => Promise<MediaTitleInvocation>;

type TitleContentBlock = string | { type?: string; text?: string };
interface TitleResponse {
  content?: string | TitleContentBlock[];
  usage_metadata?: MediaTitleUsage;
}

function extractText(content: TitleResponse['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content.map((block) => (typeof block === 'string' ? block : (block.text ?? ''))).join('');
}

const invokeTitleModel: MediaTitleInvoker = async (model, prompt, signal) => {
  const response: TitleResponse = await initializeModel({
    provider: model.provider as Providers,
    clientOptions: { ...model.clientOptions, streaming: false } as ClientOptions,
  }).invoke(prompt, { signal });
  return { text: extractText(response.content), usage: response.usage_metadata };
};

const quotePairs: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
];

function stripWrappingQuotes(title: string): string {
  const wrapped = quotePairs.some(
    ([open, close]) => title.length > 1 && title.startsWith(open) && title.endsWith(close),
  );
  return wrapped ? title.slice(1, -1).trim() : title;
}

function cleanMediaTitle(
  raw: string,
  appConfig: AppConfig,
  maxTitleChars: number,
): string | undefined {
  if (!raw.trim()) {
    return undefined;
  }
  const sanitized = sanitizeTitle(raw);
  if (sanitized === DEFAULT_TITLE_FALLBACK) {
    return undefined;
  }
  const candidate = stripWrappingQuotes(sanitized).replace(/\.$/, '').trim();
  const allowed = resolveConversationTitle({
    filters: appConfig.filters,
    candidate,
    fallback: null,
  });
  if (!allowed) {
    return undefined;
  }
  return deriveMediaThreadTitle(allowed, maxTitleChars).trimEnd() || undefined;
}

export interface MediaTitleRequest {
  context: MediaContext;
  threadId: string;
  prompt: string;
  operation: MediaOperation;
  currentTitle: string;
}

export type MediaTitleGenerator = (input: MediaTitleRequest) => Promise<string | undefined>;

export interface MediaTitleGeneratorDependencies {
  repository: Pick<MediaMethods, 'replaceMediaThreadTitle'>;
  resolveModel: MediaTitleModelResolver;
  usage?: RecordUsageDeps;
  /** Defaults to a real model call; tests substitute a fake to exercise the surrounding logic. */
  invoke?: MediaTitleInvoker;
  withScope<T>(scope: MediaOwnerScope, operation: () => Promise<T>): Promise<T>;
  log(error: Error): void;
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Names a freshly created Studio thread with a text model. Best effort by design: every failure is
 * logged and swallowed, and the write is conditional on the prompt-derived title still being in
 * place so a user rename in the meantime always wins.
 */
export function createMediaTitleGenerator(
  deps: MediaTitleGeneratorDependencies,
): MediaTitleGenerator {
  const invoke = deps.invoke ?? invokeTitleModel;

  async function recordUsage(
    input: MediaTitleRequest,
    target: MediaTitleTarget,
    usage: MediaTitleUsage | undefined,
  ): Promise<void> {
    if (!deps.usage || !usage) {
      return;
    }
    const { appConfig, scope } = input.context;
    try {
      await recordCollectedUsage(deps.usage, {
        user: scope.ownerId,
        conversationId: input.threadId,
        context: 'title',
        model: target.model,
        collectedUsage: [
          {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            model: target.model,
          },
        ],
        balance: getBalanceConfig(appConfig),
        transactions: getTransactionsConfig(appConfig),
      });
    } catch (error) {
      deps.log(toError(error));
    }
  }

  return async (input) => {
    try {
      const target = resolveMediaTitleTarget(input.context);
      if (!target) {
        return undefined;
      }
      const model = await deps.resolveModel({ context: input.context, target });
      if (!model) {
        return undefined;
      }
      const result = await invoke(
        model,
        buildMediaTitlePrompt({
          prompt: input.prompt,
          operation: input.operation,
          template: target.prompt,
        }),
        AbortSignal.timeout(target.timeoutMs),
      );
      const { scope, appConfig, config } = input.context;
      const title = cleanMediaTitle(result.text, appConfig, config.limits.maxTitleChars);
      const applied =
        title !== undefined && title !== input.currentTitle
          ? await deps.withScope(scope, () =>
              deps.repository.replaceMediaThreadTitle({
                scope,
                threadId: input.threadId,
                expectedTitle: input.currentTitle,
                title,
              }),
            )
          : false;
      await recordUsage(input, target, result.usage);
      return applied ? title : undefined;
    } catch (error) {
      deps.log(toError(error));
      return undefined;
    }
  };
}
