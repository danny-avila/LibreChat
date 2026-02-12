import type { SummarizationConfig } from 'librechat-data-provider';

export type ResolvedSummarizationConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  parameters: Record<string, unknown>;
  prompt?: string;
  trigger?: { type: string; value: number };
};

export function resolveSummarizationLLMConfig({
  agentId,
  globalConfig,
  agentRuntimeConfig,
}: {
  agentId: string;
  globalConfig?: SummarizationConfig;
  agentRuntimeConfig?: { provider?: string; model?: string };
}): ResolvedSummarizationConfig {
  if (!globalConfig || typeof globalConfig !== 'object') {
    return {
      enabled: false,
      parameters: {},
    };
  }

  const agentOverride = globalConfig?.agents?.[agentId];
  const parameters = {
    ...globalConfig?.parameters,
    ...agentOverride?.parameters,
  };
  const prompt = agentOverride?.prompt ?? globalConfig?.prompt;
  const provider =
    agentOverride?.provider ?? globalConfig?.provider ?? agentRuntimeConfig?.provider;
  const model = agentOverride?.model ?? globalConfig?.model ?? agentRuntimeConfig?.model;
  const hasProvider = typeof provider === 'string' && provider.trim().length > 0;
  const hasModel = typeof model === 'string' && model.trim().length > 0;
  const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;

  if (agentOverride?.enabled === false) {
    return {
      enabled: false,
      provider,
      model,
      parameters,
      prompt,
    };
  }

  return {
    enabled: globalConfig?.enabled !== false && hasProvider && hasModel && hasPrompt,
    provider,
    model,
    parameters,
    prompt,
    trigger: globalConfig?.trigger as ResolvedSummarizationConfig['trigger'],
  };
}
