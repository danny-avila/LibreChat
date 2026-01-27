import { Run, Providers } from '@librechat/agents';
import {
  providerEndpointMap,
  KnownEndpoints,
  type TSpecsConfig,
  validateVisionModel,
} from 'librechat-data-provider';
import type {
  MultiAgentGraphConfig,
  OpenAIClientOptions,
  StandardGraphConfig,
  AgentInputs,
  GenericTool,
  RunConfig,
  IState,
} from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { Agent } from 'librechat-data-provider';
import type * as t from '~/types';
import { resolveHeaders, createSafeUser } from '~/utils/env';

const customProviders = new Set([
  Providers.XAI,
  Providers.DEEPSEEK,
  Providers.OPENROUTER,
  KnownEndpoints.ollama,
]);

export function getReasoningKey(
  provider: Providers,
  llmConfig: t.RunLLMConfig,
  agentEndpoint?: string | null,
): 'reasoning_content' | 'reasoning' {
  let reasoningKey: 'reasoning_content' | 'reasoning' = 'reasoning_content';
  
  if (provider === Providers.GOOGLE) {
    reasoningKey = 'reasoning';
  } else if (
    llmConfig.configuration?.baseURL?.includes(KnownEndpoints.openrouter) ||
    (agentEndpoint && agentEndpoint.toLowerCase().includes(KnownEndpoints.openrouter))
  ) {
    reasoningKey = 'reasoning';
  } else if (
    (llmConfig as OpenAIClientOptions).useResponsesApi === true &&
    (provider === Providers.OPENAI || provider === Providers.AZURE)
  ) {
    reasoningKey = 'reasoning';
  }
  
  return reasoningKey;
}

/**
 * Determines vision capability for an agent.
 * 
 * Priority:
 * 1. Explicit override (`agent.vision`) takes precedence
 * 2. Auto-detection from model using `validateVisionModel()`
 * 
 * Model is resolved from `agent.model_parameters?.model` or `agent.model`.
 * 
 * @param agent - The agent to check for vision capability
 * @param modelSpecs - Optional modelSpecs configuration from librechat.yaml
 * @param availableModels - Not used (kept for backwards compatibility)
 * @returns true if the agent supports vision, false otherwise
 */
function determineVisionCapability(
  agent: RunAgent,
  modelSpecs?: TSpecsConfig,
  availableModels?: string[]
): boolean {
  if (agent.vision !== undefined) {
    return agent.vision;
  }
  
  const agentModel = (agent.model_parameters as { model?: string })?.model ?? agent.model;
  if (!agentModel) {
    return false;
  }
  
  return validateVisionModel({
    model: agentModel,
    modelSpecs,
  });
}

type RunAgent = Omit<Agent, 'tools'> & {
  tools?: GenericTool[];
  maxContextTokens?: number;
  useLegacyContent?: boolean;
  toolContextMap?: Record<string, string>;
};

/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param options - The options for creating the Run instance.
 * @param options.agents - The agents for this run.
 * @param options.signal - The signal for this run.
 * @param options.runId - Optional run ID; otherwise, a new run ID will be generated.
 * @param options.customHandlers - Custom event handlers.
 * @param options.streaming - Whether to use streaming.
 * @param options.streamUsage - Whether to stream usage information.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
export async function createRun({
  runId,
  signal,
  agents,
  requestBody,
  user,
  tokenCounter,
  customHandlers,
  indexTokenCountMap,
  modelSpecs,
  availableModels,
  streaming = true,
  streamUsage = true,
}: {
  agents: RunAgent[];
  signal: AbortSignal;
  runId?: string;
  streaming?: boolean;
  streamUsage?: boolean;
  requestBody?: t.RequestBody;
  user?: IUser;
  modelSpecs?: TSpecsConfig;
  availableModels?: string[];
} & Pick<RunConfig, 'tokenCounter' | 'customHandlers' | 'indexTokenCountMap'>): Promise<
  Run<IState>
> {
  const agentInputs: AgentInputs[] = [];
  const buildAgentContext = (agent: RunAgent) => {
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

    const systemMessage = Object.values(agent.toolContextMap ?? {})
      .join('\n')
      .trim();

    const systemContent = [
      systemMessage,
      agent.instructions ?? '',
      agent.additional_instructions ?? '',
    ]
      .join('\n')
      .trim();

    /**
     * Resolve request-based headers for Custom Endpoints. Note: if this is added to
     *  non-custom endpoints, needs consideration of varying provider header configs.
     *  This is done at this step because the request body may contain dynamic values
     *  that need to be resolved after agent initialization.
     */
    if (llmConfig?.configuration?.defaultHeaders != null) {
      llmConfig.configuration.defaultHeaders = resolveHeaders({
        headers: llmConfig.configuration.defaultHeaders as Record<string, string>,
        user: createSafeUser(user),
        body: requestBody,
      });
    }

    /** Resolves issues with new OpenAI usage field */
    if (
      customProviders.has(agent.provider) ||
      (agent.provider === Providers.OPENAI &&
        agent.endpoint != null &&
        agent.endpoint !== agent.provider &&
        agent.endpoint !== Providers.OPENAI)
    ) {
      llmConfig.streamUsage = false;
      llmConfig.usage = true;
    }

    const reasoningKey = getReasoningKey(provider, llmConfig, agent.endpoint);
    const visionCapability = determineVisionCapability(agent, modelSpecs, availableModels);

    const agentInput: AgentInputs = {
      provider,
      reasoningKey,
      agentId: agent.id,
      name: agent.name ?? undefined,
      tools: agent.tools,
      clientOptions: llmConfig,
      instructions: systemContent,
      maxContextTokens: agent.maxContextTokens,
      useLegacyContent: agent.useLegacyContent ?? false,
      vision: visionCapability,
    };
    
    agentInputs.push(agentInput);
  };

  for (const agent of agents) {
    buildAgentContext(agent);
  }

  const graphConfig: RunConfig['graphConfig'] = {
    signal,
    agents: agentInputs,
    edges: agents[0].edges,
  };

  if (agentInputs.length > 1 || ((graphConfig as MultiAgentGraphConfig).edges?.length ?? 0) > 0) {
    (graphConfig as unknown as MultiAgentGraphConfig).type = 'multi-agent';
  } else {
    (graphConfig as StandardGraphConfig).type = 'standard';
  }

  return Run.create({
    runId,
    graphConfig,
    tokenCounter,
    customHandlers,
    indexTokenCountMap,
  });
}
