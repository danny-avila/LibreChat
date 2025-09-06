import { EModelEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
import type * as t from '~/types';
import { knownOpenAIParams } from './llm';

const anthropicExcludeParams = new Set(['anthropicApiUrl']);

/**
 * Transforms a Non-OpenAI LLM config to an OpenAI-conformant config.
 * Non-OpenAI parameters are moved to modelKwargs.
 * Also extracts configuration options that belong in configOptions.
 */
export function transformToOpenAIConfig({
  llmConfig,
  fromEndpoint,
}: {
  llmConfig: ClientOptions;
  fromEndpoint: string;
}): {
  llmConfig: t.OAIClientOptions;
  configOptions: Partial<t.OpenAIConfiguration>;
} {
  const openAIConfig: Partial<t.OAIClientOptions> = {};
  let configOptions: Partial<t.OpenAIConfiguration> = {};
  let modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;

  const isAnthropic = fromEndpoint === EModelEndpoint.anthropic;
  const excludeParams = isAnthropic ? anthropicExcludeParams : new Set();

  for (const [key, value] of Object.entries(llmConfig)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (excludeParams.has(key)) {
      continue;
    }

    if (isAnthropic && key === 'clientOptions') {
      configOptions = Object.assign({}, configOptions, value as Partial<t.OpenAIConfiguration>);
      continue;
    } else if (isAnthropic && key === 'invocationKwargs') {
      modelKwargs = Object.assign({}, modelKwargs, value as Record<string, unknown>);
      hasModelKwargs = true;
      continue;
    }

    if (knownOpenAIParams.has(key)) {
      (openAIConfig as Record<string, unknown>)[key] = value;
    } else {
      modelKwargs[key] = value;
      hasModelKwargs = true;
    }
  }

  if (hasModelKwargs) {
    openAIConfig.modelKwargs = modelKwargs;
  }

  return {
    llmConfig: openAIConfig as t.OAIClientOptions,
    configOptions,
  };
}
