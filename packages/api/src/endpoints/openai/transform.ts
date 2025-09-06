import type { ClientOptions } from '@librechat/agents';
import type * as t from '~/types';
import { knownOpenAIParams } from './llm';

/**
 * Transforms an Non-OpenAI LLM config to an OpenAI-conformant config.
 * Non-OpenAI parameters are moved to modelKwargs.
 */
export function transformToOpenAIConfig(llmConfig: ClientOptions): t.OAIClientOptions {
  const openAIConfig: Partial<t.OAIClientOptions> = {};
  const modelKwargs: Record<string, unknown> = {};
  let hasModelKwargs = false;

  for (const [key, value] of Object.entries(llmConfig)) {
    if (value === undefined || value === null) {
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

  return openAIConfig;
}
