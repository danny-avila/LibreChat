import type { AgentModelParameters, EModelEndpoint } from 'librechat-data-provider';
import type { OpenAIConfiguration } from './openai';

export type RunLLMConfig = {
  provider: EModelEndpoint;
  streaming: boolean;
  streamUsage: boolean;
  usage?: boolean;
  configuration?: OpenAIConfiguration;
} & AgentModelParameters;
