import {
  EModelEndpoint,
  ReasoningParameterFormat,
  removeNullishValues,
  supportsAdaptiveThinking,
} from 'librechat-data-provider';
import type { BindToolsInput } from '@librechat/agents/langchain/language_models/chat_models';
import type { AzureOpenAIInput } from '@librechat/agents/langchain/openai';
import type { SettingDefinition } from 'librechat-data-provider';
import type { OpenAI } from 'openai';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

type OpenAILLMConfig = Omit<Partial<t.OAIClientOptions>, 'verbosity'> &
  Omit<Partial<t.OpenAIParameters>, 'verbosity'> &
  Omit<Partial<AzureOpenAIInput>, 'verbosity'> & {
    verbosity?: string | null;
  };

export const knownOpenAIParams: Set<string> = new Set([
  // Constructor/Instance Parameters
  'model',
  'modelName',
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
  'n',
  'logitBias',
  'stop',
  'stopSequences',
  'user',
  'timeout',
  'stream',
  'maxTokens',
  'maxCompletionTokens',
  'logprobs',
  'topLogprobs',
  'apiKey',
  'organization',
  'audio',
  'modalities',
  'reasoning',
  'zdrEnabled',
  'service_tier',
  'supportsStrictToolCalling',
  'useResponsesApi',
  'configuration',
  // Call-time Options
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'response_format',
  'seed',
  'stream_options',
  'parallel_tool_calls',
  'strict',
  'prediction',
  'promptIndex',
  // Responses API specific
  'text',
  'truncation',
  'include',
  'previous_response_id',
  // LangChain specific
  '__includeRawResponse',
  'maxConcurrency',
  'maxRetries',
  'verbose',
  'streaming',
  'streamUsage',
  'disableStreaming',
]);

function hasReasoningParams({
  reasoning_effort,
  reasoning_summary,
}: {
  reasoning_effort?: string | null;
  reasoning_summary?: string | null;
}): boolean {
  return (
    (reasoning_effort != null && reasoning_effort !== '') ||
    (reasoning_summary != null && reasoning_summary !== '')
  );
}

function getReasoningObject({
  reasoningEffort,
  reasoningSummary,
}: {
  reasoningEffort?: OpenAILLMConfig['reasoning_effort'];
  reasoningSummary?: OpenAILLMConfig['reasoning_summary'];
}): OpenAI.Reasoning {
  return removeNullishValues(
    {
      effort: reasoningEffort,
      summary: reasoningSummary,
    },
    true,
  ) as OpenAI.Reasoning;
}

function isOpenAIEndpoint(endpoint?: EModelEndpoint | string | null): boolean {
  return endpoint === EModelEndpoint.openAI || endpoint === EModelEndpoint.azureOpenAI;
}

function removeReasoningSummary(target: Record<string, unknown>) {
  const { reasoning } = target;
  if (reasoning == null || typeof reasoning !== 'object' || Array.isArray(reasoning)) {
    return;
  }

  const rest = { ...(reasoning as Record<string, unknown>) };
  delete rest.summary;
  if (Object.keys(rest).length === 0) {
    delete target.reasoning;
    return;
  }

  target.reasoning = rest;
}

function removeReasoningPayload(target: Record<string, unknown>) {
  delete target.reasoning;
  delete target.reasoning_effort;
}

function deleteConfigParam({
  param,
  llmConfig,
  modelKwargs,
}: {
  param: string;
  llmConfig: OpenAILLMConfig;
  modelKwargs: Record<string, unknown>;
}) {
  if (param === 'reasoning_effort') {
    removeReasoningPayload(llmConfig as Record<string, unknown>);
    removeReasoningPayload(modelKwargs);
    return;
  }

  if (param === 'reasoning_summary') {
    delete (llmConfig as Record<string, unknown>).reasoning_summary;
    delete modelKwargs.reasoning_summary;
    removeReasoningSummary(llmConfig as Record<string, unknown>);
    removeReasoningSummary(modelKwargs);
    return;
  }

  if (param in llmConfig) {
    delete llmConfig[param as keyof t.OAIClientOptions];
  }
  if (param in modelKwargs) {
    delete modelKwargs[param];
  }
}

const openRouterAnthropicVerbosityByEffort: Record<
  string,
  NonNullable<OpenAILLMConfig['verbosity']>
> = {
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
};

function isStringVerbosity(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function applyVerbosityParam({
  value,
  override,
  llmConfig,
  modelKwargs,
  useOpenRouter,
}: {
  value: unknown;
  override: boolean;
  llmConfig: OpenAILLMConfig;
  modelKwargs: Record<string, unknown>;
  useOpenRouter?: boolean;
}): boolean {
  if (!isStringVerbosity(value)) {
    return false;
  }

  if (useOpenRouter && (override || llmConfig.verbosity === undefined)) {
    llmConfig.verbosity = value;
    return false;
  }

  if (useOpenRouter) {
    return false;
  }

  if (!override && modelKwargs.verbosity !== undefined) {
    return true;
  }

  modelKwargs.verbosity = value;
  return true;
}

function isOpenRouterAnthropicAdaptiveModel(model?: string | null): boolean {
  if (typeof model !== 'string') {
    return false;
  }
  const normalizedModel = normalizeOpenRouterModel(model);
  return normalizedModel.startsWith('anthropic/') && supportsAdaptiveThinking(model);
}

function normalizeOpenRouterModel(model: string): string {
  return model.toLowerCase().replace(/^~/, '');
}

function isOpenRouterClaude46Model(model: string): boolean {
  const normalizedModel = normalizeOpenRouterModel(model);
  return (
    /claude[-.](?:opus|sonnet)[-.]4[-.]6/.test(normalizedModel) ||
    /claude[-.]4[-.]6[-.](?:opus|sonnet)/.test(normalizedModel)
  );
}

function getOpenRouterAnthropicVerbosity(
  reasoningEffort?: string | null,
  model?: string | null,
): OpenAILLMConfig['verbosity'] | undefined {
  if (!reasoningEffort) {
    return undefined;
  }
  const verbosity = openRouterAnthropicVerbosityByEffort[reasoningEffort];
  if (verbosity !== 'xhigh' || typeof model !== 'string') {
    return verbosity;
  }
  return isOpenRouterClaude46Model(model) ? 'max' : 'xhigh';
}

function applyOpenRouterReasoningConfig({
  model,
  llmConfig,
  modelKwargs,
  reasoningEffort,
}: {
  model?: string | null;
  llmConfig: OpenAILLMConfig;
  modelKwargs: Record<string, unknown>;
  reasoningEffort?: string | null;
}): boolean {
  if (!hasReasoningParams({ reasoning_effort: reasoningEffort })) {
    llmConfig.include_reasoning = true;
    return false;
  }

  if (!isOpenRouterAnthropicAdaptiveModel(model)) {
    modelKwargs.reasoning = { effort: reasoningEffort };
    return true;
  }

  const adaptiveVerbosity = getOpenRouterAnthropicVerbosity(reasoningEffort, model);
  if (adaptiveVerbosity != null && llmConfig.verbosity == null) {
    llmConfig.verbosity = adaptiveVerbosity;
  }

  if (reasoningEffort === 'none') {
    llmConfig.include_reasoning = false;
    return false;
  }

  modelKwargs.reasoning = { enabled: true };
  return true;
}

function applyReasoningConfig({
  endpoint,
  llmConfig,
  modelKwargs,
  reasoningEffort,
  reasoningFormat,
  reasoningSummary,
}: {
  endpoint?: EModelEndpoint | string | null;
  llmConfig: OpenAILLMConfig;
  modelKwargs: Record<string, unknown>;
  reasoningEffort?: OpenAILLMConfig['reasoning_effort'];
  reasoningFormat?: ReasoningParameterFormat;
  reasoningSummary?: OpenAILLMConfig['reasoning_summary'];
}): boolean {
  if (
    !hasReasoningParams({
      reasoning_effort: reasoningEffort,
      reasoning_summary: reasoningSummary,
    })
  ) {
    return false;
  }

  const reasoning = getReasoningObject({ reasoningEffort, reasoningSummary });
  if (reasoningFormat === ReasoningParameterFormat.disabled) {
    return false;
  }

  if (isOpenAIEndpoint(endpoint)) {
    if (llmConfig.useResponsesApi === true) {
      llmConfig.reasoning = reasoning;
      return false;
    }
    if (reasoningEffort) {
      llmConfig.reasoning_effort = reasoningEffort;
    }
    return false;
  }

  if (llmConfig.useResponsesApi === true) {
    modelKwargs.reasoning = reasoning;
    return true;
  }

  if (reasoningFormat === ReasoningParameterFormat.reasoningObject) {
    modelKwargs.reasoning = reasoning;
    return true;
  }

  if (reasoningEffort) {
    modelKwargs.reasoning_effort = reasoningEffort;
    return true;
  }

  return false;
}

function getModelKwargsText(modelKwargs: Record<string, unknown>): Record<string, unknown> {
  const { text } = modelKwargs;
  if (text == null || typeof text !== 'object' || Array.isArray(text)) {
    return {};
  }
  return text as Record<string, unknown>;
}

function applyResponsesVerbosity({
  llmConfig,
  modelKwargs,
  useOpenRouter,
}: {
  llmConfig: OpenAILLMConfig;
  modelKwargs: Record<string, unknown>;
  useOpenRouter?: boolean;
}): boolean {
  if (llmConfig.useResponsesApi !== true) {
    return false;
  }

  if (useOpenRouter && llmConfig.verbosity) {
    modelKwargs.text = {
      ...getModelKwargsText(modelKwargs),
      verbosity: llmConfig.verbosity,
    };
    delete llmConfig.verbosity;
    return true;
  }

  if (!useOpenRouter && modelKwargs.verbosity) {
    modelKwargs.text = {
      ...getModelKwargsText(modelKwargs),
      verbosity: modelKwargs.verbosity,
    };
    delete modelKwargs.verbosity;
    return true;
  }

  return false;
}

/**
 * Extracts default parameters from customParams.paramDefinitions
 * @param paramDefinitions - Array of parameter definitions with key and default values
 * @returns Record of default parameters
 */
export function extractDefaultParams(
  paramDefinitions?: Partial<SettingDefinition>[],
): Record<string, unknown> | undefined {
  if (!paramDefinitions || !Array.isArray(paramDefinitions)) {
    return undefined;
  }

  const defaults: Record<string, unknown> = {};
  for (let i = 0; i < paramDefinitions.length; i++) {
    const param = paramDefinitions[i];
    if (param.key !== undefined && param.default !== undefined) {
      defaults[param.key] = param.default;
    }
  }
  return defaults;
}

/**
 * Applies default parameters to the target object only if the field is undefined
 * @param target - The target object to apply defaults to
 * @param defaults - Record of default parameter values
 */
export function applyDefaultParams(
  target: Record<string, unknown>,
  defaults: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(defaults)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

export function getOpenAILLMConfig({
  azure,
  apiKey,
  baseURL,
  endpoint,
  streaming,
  addParams,
  dropParams,
  defaultParams,
  useOpenRouter,
  reasoningFormat = ReasoningParameterFormat.reasoningEffort,
  modelOptions: _modelOptions,
}: {
  apiKey: string;
  streaming: boolean;
  baseURL?: string | null;
  endpoint?: EModelEndpoint | string | null;
  modelOptions: Partial<t.OpenAIParameters>;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
  defaultParams?: Record<string, unknown>;
  useOpenRouter?: boolean;
  reasoningFormat?: ReasoningParameterFormat;
  azure?: false | t.AzureOptions;
}): Pick<t.LLMConfigResult, 'llmConfig' | 'tools'> & {
  azure?: t.AzureOptions;
} {
  /** Clean empty strings from model options (e.g., temperature: "" should be removed) */
  const cleanedModelOptions = removeNullishValues(
    _modelOptions,
    true,
  ) as Partial<t.OpenAIParameters>;

  const {
    reasoning_effort,
    reasoning_summary,
    verbosity,
    web_search,
    promptCache,
    promptCacheTtl,
    frequency_penalty,
    presence_penalty,
    ...modelOptions
  } = cleanedModelOptions as Partial<
    t.OpenAIParameters & { promptCache?: boolean; promptCacheTtl?: '5m' | '1h' }
  >;

  const llmConfig = Object.assign(
    {
      streaming,
      model: modelOptions.model ?? '',
    },
    modelOptions,
  ) as OpenAILLMConfig;

  if (frequency_penalty != null) {
    llmConfig.frequencyPenalty = frequency_penalty;
  }
  if (presence_penalty != null) {
    llmConfig.presencePenalty = presence_penalty;
  }

  const modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;
  let reasoningEffort = reasoning_effort;
  let reasoningSummary = reasoning_summary;

  if (verbosity != null && verbosity !== '' && useOpenRouter) {
    llmConfig.verbosity = verbosity;
  } else if (verbosity != null && verbosity !== '') {
    modelKwargs.verbosity = verbosity;
    hasModelKwargs = true;
  }

  let enableWebSearch = web_search;
  let enablePromptCache = promptCache;
  let promptCacheTtlValue = promptCacheTtl;

  /** Apply defaultParams first - only if fields are undefined */
  if (defaultParams && typeof defaultParams === 'object') {
    for (const [key, value] of Object.entries(defaultParams)) {
      if (key === 'web_search') {
        if (enableWebSearch === undefined && typeof value === 'boolean') {
          enableWebSearch = value;
        }
        continue;
      }
      if (key === 'promptCache') {
        if (enablePromptCache === undefined && typeof value === 'boolean') {
          enablePromptCache = value;
        }
        continue;
      }
      if (key === 'promptCacheTtl') {
        if (promptCacheTtlValue === undefined && (value === '5m' || value === '1h')) {
          promptCacheTtlValue = value;
        }
        continue;
      }
      if (key === 'reasoning_effort') {
        if (!reasoningEffort && typeof value === 'string') {
          reasoningEffort = value as OpenAILLMConfig['reasoning_effort'];
        }
        continue;
      }
      if (key === 'reasoning_summary') {
        if (!reasoningSummary && typeof value === 'string') {
          reasoningSummary = value as OpenAILLMConfig['reasoning_summary'];
        }
        continue;
      }
      if (key === 'verbosity') {
        hasModelKwargs =
          applyVerbosityParam({
            value,
            override: false,
            llmConfig,
            modelKwargs,
            useOpenRouter,
          }) || hasModelKwargs;
        continue;
      }

      if (knownOpenAIParams.has(key)) {
        applyDefaultParams(llmConfig as Record<string, unknown>, { [key]: value });
      } else {
        /** Apply to modelKwargs if not a known param */
        if (modelKwargs[key] === undefined) {
          modelKwargs[key] = value;
          hasModelKwargs = true;
        }
      }
    }
  }

  /** Apply addParams - can override defaultParams */
  if (addParams && typeof addParams === 'object') {
    for (const [key, value] of Object.entries(addParams)) {
      if (key === 'web_search') {
        if (typeof value === 'boolean') {
          enableWebSearch = value;
        }
        continue;
      }
      if (key === 'promptCache') {
        if (typeof value === 'boolean') {
          enablePromptCache = value;
        }
        continue;
      }
      if (key === 'promptCacheTtl') {
        if (value === '5m' || value === '1h') {
          promptCacheTtlValue = value;
        }
        continue;
      }
      if (key === 'reasoning_effort') {
        if (typeof value === 'string' || value == null) {
          reasoningEffort = value as OpenAILLMConfig['reasoning_effort'];
        }
        continue;
      }
      if (key === 'reasoning_summary') {
        if (typeof value === 'string' || value == null) {
          reasoningSummary = value as OpenAILLMConfig['reasoning_summary'];
        }
        continue;
      }
      if (key === 'verbosity') {
        hasModelKwargs =
          applyVerbosityParam({
            value,
            override: true,
            llmConfig,
            modelKwargs,
            useOpenRouter,
          }) || hasModelKwargs;
        continue;
      }
      if (knownOpenAIParams.has(key)) {
        (llmConfig as Record<string, unknown>)[key] = value;
      } else {
        hasModelKwargs = true;
        modelKwargs[key] = value;
      }
    }
  }

  if (useOpenRouter) {
    /**
     * OpenRouter uses a `reasoning` object — `summary` is not supported.
     * ChatOpenRouter treats `reasoning` and `include_reasoning` as mutually exclusive:
     * `include_reasoning` is legacy compat that maps to `{ enabled: true }` only when
     * no `reasoning` object is present, so we intentionally omit it here.
     */
    hasModelKwargs =
      applyOpenRouterReasoningConfig({
        reasoningEffort,
        model: modelOptions.model,
        modelKwargs,
        llmConfig,
      }) || hasModelKwargs;
  }

  if (llmConfig.max_tokens != null) {
    llmConfig.maxTokens = llmConfig.max_tokens;
    delete llmConfig.max_tokens;
  }

  const tools: BindToolsInput[] = [];

  /** Check if web_search should be disabled via dropParams */
  if (dropParams && dropParams.includes('web_search')) {
    enableWebSearch = false;
  }
  if (dropParams && dropParams.includes('promptCache')) {
    enablePromptCache = false;
  }
  if (dropParams && dropParams.includes('promptCacheTtl')) {
    promptCacheTtlValue = undefined;
  }

  if (useOpenRouter && enableWebSearch) {
    /** OpenRouter expects web search as a plugins parameter */
    modelKwargs.plugins = [{ id: 'web' }];
    hasModelKwargs = true;
  } else if (enableWebSearch) {
    /** Standard OpenAI web search uses tools API */
    llmConfig.useResponsesApi = true;
    tools.push({ type: 'web_search' });
  }
  if (useOpenRouter && enablePromptCache === true) {
    llmConfig.promptCache = true;
    /** Pass an explicit TTL when configured; otherwise the agents SDK defaults to 1h */
    if (promptCacheTtlValue != null) {
      llmConfig.promptCacheTtl = promptCacheTtlValue;
    }
  }

  if (!useOpenRouter) {
    hasModelKwargs =
      applyReasoningConfig({
        endpoint,
        llmConfig,
        modelKwargs,
        reasoningFormat,
        reasoningEffort,
        reasoningSummary,
      }) || hasModelKwargs;
  }

  /** DeepSeek thinking-mode requires `reasoning_content` replay on tool turns (#13366). */
  if (
    typeof modelOptions.model === 'string' &&
    /^deepseek(?:[-/]|$)/i.test(modelOptions.model.replace(/^~/, ''))
  ) {
    llmConfig.includeReasoningContent = true;
  }

  /**
   * Note: OpenAI reasoning models (o1/o3/gpt-5) do not support temperature and other sampling parameters
   * Exception: gpt-5-chat and versioned models like gpt-5.1 DO support these parameters
   */
  if (
    modelOptions.model &&
    /\b(o[13]|gpt-5)(?!\.|-chat)(?:-|$)/.test(modelOptions.model as string)
  ) {
    const reasoningExcludeParams = [
      'frequencyPenalty',
      'presencePenalty',
      'temperature',
      'topP',
      'logitBias',
      'n',
      'logprobs',
    ];

    const updatedDropParams = dropParams || [];
    const combinedDropParams = [...new Set([...updatedDropParams, ...reasoningExcludeParams])];

    combinedDropParams.forEach((param) => deleteConfigParam({ param, llmConfig, modelKwargs }));
  } else if (modelOptions.model && /gpt-4o.*search/.test(modelOptions.model as string)) {
    /**
     * Note: OpenAI Web Search models do not support any known parameters besides `max_tokens`
     */
    const searchExcludeParams = [
      'frequency_penalty',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'temperature',
      'top_p',
      'top_k',
      'stop',
      'logit_bias',
      'seed',
      'response_format',
      'n',
      'logprobs',
      'user',
    ];

    const updatedDropParams = dropParams || [];
    const combinedDropParams = [...new Set([...updatedDropParams, ...searchExcludeParams])];

    combinedDropParams.forEach((param) => deleteConfigParam({ param, llmConfig, modelKwargs }));
  } else if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => deleteConfigParam({ param, llmConfig, modelKwargs }));
  }

  hasModelKwargs =
    applyResponsesVerbosity({
      llmConfig,
      modelKwargs,
      useOpenRouter,
    }) || hasModelKwargs;

  if (
    llmConfig.model &&
    /\bgpt-[5-9](?:\.\d+)?\b/i.test(llmConfig.model) &&
    llmConfig.maxTokens != null
  ) {
    const paramName =
      llmConfig.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
    modelKwargs[paramName] = llmConfig.maxTokens;
    delete llmConfig.maxTokens;
    hasModelKwargs = true;
  }

  if (hasModelKwargs && Object.keys(modelKwargs).length > 0) {
    llmConfig.modelKwargs = modelKwargs;
  }

  if (!azure) {
    llmConfig.apiKey = apiKey;
    return { llmConfig, tools };
  }

  const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);
  const updatedAzure = { ...azure };
  updatedAzure.azureOpenAIApiDeploymentName = useModelName
    ? sanitizeModelName(llmConfig.model || '')
    : azure.azureOpenAIApiDeploymentName;

  if (process.env.AZURE_OPENAI_DEFAULT_MODEL) {
    llmConfig.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
  }

  const constructAzureOpenAIBasePath = () => {
    if (!baseURL) {
      return;
    }
    const azureURL = constructAzureURL({
      baseURL,
      azureOptions: updatedAzure,
    });
    updatedAzure.azureOpenAIBasePath = azureURL.split(
      `/${updatedAzure.azureOpenAIApiDeploymentName}`,
    )[0];
  };

  constructAzureOpenAIBasePath();
  Object.assign(llmConfig, updatedAzure);

  const constructAzureResponsesApi = () => {
    if (!llmConfig.useResponsesApi) {
      return;
    }

    delete llmConfig.azureOpenAIApiDeploymentName;
    delete llmConfig.azureOpenAIApiInstanceName;
    delete llmConfig.azureOpenAIApiVersion;
    delete llmConfig.azureOpenAIBasePath;
    delete llmConfig.azureOpenAIApiKey;
    llmConfig.apiKey = apiKey;
  };

  constructAzureResponsesApi();

  llmConfig.model = updatedAzure.azureOpenAIApiDeploymentName;
  return { llmConfig, tools, azure: updatedAzure };
}
