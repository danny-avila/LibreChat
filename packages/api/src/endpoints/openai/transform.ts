import { EModelEndpoint } from 'librechat-data-provider';
import type { ClientOptions } from '@librechat/agents';
import type * as t from '~/types';
import { knownOpenAIParams } from './llm';

const anthropicExcludeParams = new Set(['anthropicApiUrl']);

/**
 * Transforms a Non-OpenAI LLM config to an OpenAI-conformant config.
 * Non-OpenAI parameters are moved to modelKwargs.
 * Also extracts configuration options that belong in configOptions.
 * Handles addParams and dropParams for parameter customization.
 */
export function transformToOpenAIConfig({
  addParams,
  dropParams,
  llmConfig,
  fromEndpoint,
}: {
  addParams?: Record<string, unknown>;
  dropParams?: string[];
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

  if (addParams && typeof addParams === 'object') {
    for (const [key, value] of Object.entries(addParams)) {
      if (knownOpenAIParams.has(key)) {
        (openAIConfig as Record<string, unknown>)[key] = value;
      } else {
        modelKwargs[key] = value;
        hasModelKwargs = true;
      }
    }
  }

  if (hasModelKwargs) {
    openAIConfig.modelKwargs = modelKwargs;
  }

  if (dropParams && Array.isArray(dropParams)) {
    dropParams.forEach((param) => {
      if (param in openAIConfig) {
        delete openAIConfig[param as keyof t.OAIClientOptions];
      }
      if (openAIConfig.modelKwargs && param in openAIConfig.modelKwargs) {
        delete openAIConfig.modelKwargs[param];
        if (Object.keys(openAIConfig.modelKwargs).length === 0) {
          delete openAIConfig.modelKwargs;
        }
      }
    });
  }

  return {
    llmConfig: openAIConfig as t.OAIClientOptions,
    configOptions,
  };
}
