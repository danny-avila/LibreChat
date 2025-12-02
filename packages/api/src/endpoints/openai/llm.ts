import { EModelEndpoint, removeNullishValues } from 'librechat-data-provider';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { SettingDefinition } from 'librechat-data-provider';
import type { AzureOpenAIInput } from '@langchain/openai';
import type { OpenAI } from 'openai';
import type * as t from '~/types';
import { sanitizeModelName, constructAzureURL } from '~/utils/azure';
import { isEnabled } from '~/utils/common';

export const knownOpenAIParams = new Set([
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
) {
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
  azure?: false | t.AzureOptions;
}): Pick<t.LLMConfigResult, 'llmConfig' | 'tools'> & {
  azure?: t.AzureOptions;
} {
  const {
    reasoning_effort,
    reasoning_summary,
    verbosity,
    web_search,
    frequency_penalty,
    presence_penalty,
    ...modelOptions
  } = _modelOptions;

  const llmConfig = Object.assign(
    {
      streaming,
      model: modelOptions.model ?? '',
    },
    modelOptions,
  ) as Partial<t.OAIClientOptions> & Partial<t.OpenAIParameters> & Partial<AzureOpenAIInput>;

  if (frequency_penalty != null) {
    llmConfig.frequencyPenalty = frequency_penalty;
  }
  if (presence_penalty != null) {
    llmConfig.presencePenalty = presence_penalty;
  }

  const modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;

  if (verbosity != null && verbosity !== '') {
    modelKwargs.verbosity = verbosity;
    hasModelKwargs = true;
  }

  let enableWebSearch = web_search;

  /** Apply defaultParams first - only if fields are undefined */
  if (defaultParams && typeof defaultParams === 'object') {
    for (const [key, value] of Object.entries(defaultParams)) {
      /** Handle web_search separately - don't add to config */
      if (key === 'web_search') {
        if (enableWebSearch === undefined && typeof value === 'boolean') {
          enableWebSearch = value;
        }
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
      /** Handle web_search directly here instead of adding to modelKwargs or llmConfig */
      if (key === 'web_search') {
        if (typeof value === 'boolean') {
          enableWebSearch = value;
        }
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
    llmConfig.include_reasoning = true;
  }

  if (
    hasReasoningParams({ reasoning_effort, reasoning_summary }) &&
    (llmConfig.useResponsesApi === true ||
      (endpoint !== EModelEndpoint.openAI && endpoint !== EModelEndpoint.azureOpenAI))
  ) {
    llmConfig.reasoning = removeNullishValues(
      {
        effort: reasoning_effort,
        summary: reasoning_summary,
      },
      true,
    ) as OpenAI.Reasoning;
  } else if (hasReasoningParams({ reasoning_effort })) {
    llmConfig.reasoning_effort = reasoning_effort;
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

  if (useOpenRouter && enableWebSearch) {
    /** OpenRouter expects web search as a plugins parameter */
    modelKwargs.plugins = [{ id: 'web' }];
    hasModelKwargs = true;
  } else if (enableWebSearch) {
    /** Standard OpenAI web search uses tools API */
    llmConfig.useResponsesApi = true;
    tools.push({ type: 'web_search' });
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

    combinedDropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.OAIClientOptions];
      }
    });
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

    combinedDropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.OAIClientOptions];
      }
    });
  } else if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      if (param in llmConfig) {
        delete llmConfig[param as keyof t.OAIClientOptions];
      }
    });
  }

  if (modelKwargs.verbosity && llmConfig.useResponsesApi === true) {
    modelKwargs.text = { verbosity: modelKwargs.verbosity };
    delete modelKwargs.verbosity;
  }

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

  if (hasModelKwargs) {
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
