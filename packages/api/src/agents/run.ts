import { Run, Providers } from '@librechat/agents';
import { providerEndpointMap, KnownEndpoints } from 'librechat-data-provider';
import type {
  OpenAIClientOptions,
  StandardGraphConfig,
  EventHandler,
  GenericTool,
  GraphEvents,
  IState,
} from '@librechat/agents';
import type { Agent } from 'librechat-data-provider';
import type * as t from '~/types';

const customProviders = new Set([
  Providers.XAI,
  Providers.OLLAMA,
  Providers.DEEPSEEK,
  Providers.OPENROUTER,
]);

/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param options - The options for creating the Run instance.
 * @param options.agent - The agent for this run.
 * @param options.signal - The signal for this run.
 * @param options.req - The server request.
 * @param options.runId - Optional run ID; otherwise, a new run ID will be generated.
 * @param options.customHandlers - Custom event handlers.
 * @param options.streaming - Whether to use streaming.
 * @param options.streamUsage - Whether to stream usage information.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
export async function createRun({
  runId,
  agent,
  signal,
  customHandlers,
  streaming = true,
  streamUsage = true,
}: {
  agent: Omit<Agent, 'tools'> & { tools?: GenericTool[] };
  signal: AbortSignal;
  runId?: string;
  streaming?: boolean;
  streamUsage?: boolean;
  customHandlers?: Record<GraphEvents, EventHandler>;
}): Promise<Run<IState>> {
  const provider =
    (providerEndpointMap[
      agent.provider as keyof typeof providerEndpointMap
    ] as unknown as Providers) ?? agent.provider;

  const llmConfig: t.RunLLMConfig = Object.assign(
    {
      provider,
      streaming,
      streamUsage,
    },
    agent.model_parameters,
  );

  /** Resolves issues with new OpenAI usage field */
  if (
    customProviders.has(agent.provider) ||
    (agent.provider === Providers.OPENAI && agent.endpoint !== agent.provider)
  ) {
    llmConfig.streamUsage = false;
    llmConfig.usage = true;
  }

  let reasoningKey: 'reasoning_content' | 'reasoning' | undefined;
  if (provider === Providers.GOOGLE) {
    reasoningKey = 'reasoning';
  } else if (
    llmConfig.configuration?.baseURL?.includes(KnownEndpoints.openrouter) ||
    (agent.endpoint && agent.endpoint.toLowerCase().includes(KnownEndpoints.openrouter))
  ) {
    reasoningKey = 'reasoning';
  } else if (
    (llmConfig as OpenAIClientOptions).useResponsesApi === true &&
    (provider === Providers.OPENAI || provider === Providers.AZURE)
  ) {
    reasoningKey = 'reasoning';
  }

  const graphConfig: StandardGraphConfig = {
    signal,
    llmConfig,
    reasoningKey,
    tools: agent.tools,
    instructions: agent.instructions,
    additional_instructions: agent.additional_instructions,
    // toolEnd: agent.end_after_tools,
  };

  // TEMPORARY FOR TESTING
  if (agent.provider === Providers.ANTHROPIC || agent.provider === Providers.BEDROCK) {
    graphConfig.streamBuffer = 2000;
  }

  return Run.create({
    runId,
    graphConfig,
    customHandlers,
  });
}
