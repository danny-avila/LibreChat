import { Run, Providers, Constants } from '@librechat/agents';
import { providerEndpointMap, KnownEndpoints } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  MultiAgentGraphConfig,
  OpenAIClientOptions,
  StandardGraphConfig,
  LCToolRegistry,
  AgentInputs,
  GenericTool,
  RunConfig,
  IState,
  LCTool,
} from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { Agent } from 'librechat-data-provider';
import type * as t from '~/types';
import { resolveHeaders, createSafeUser } from '~/utils/env';

/** Expected shape of JSON tool search results */
interface ToolSearchJsonResult {
  found?: number;
  tools?: Array<{ name: string }>;
}

/**
 * Parses tool names from JSON-formatted tool_search output.
 * Format: { "found": N, "tools": [{ "name": "tool_name", ... }], ... }
 *
 * @param content - The JSON string content
 * @param discoveredTools - Set to add discovered tool names to
 * @returns true if parsing succeeded, false otherwise
 */
function parseToolSearchJson(content: string, discoveredTools: Set<string>): boolean {
  try {
    const parsed = JSON.parse(content) as ToolSearchJsonResult;
    if (!parsed.tools || !Array.isArray(parsed.tools)) {
      return false;
    }
    for (const tool of parsed.tools) {
      if (tool.name && typeof tool.name === 'string') {
        discoveredTools.add(tool.name);
      }
    }
    return parsed.tools.length > 0;
  } catch {
    return false;
  }
}

/**
 * Parses tool names from legacy text-formatted tool_search output.
 * Format: "- tool_name (score: X.XX)"
 *
 * @param content - The text content
 * @param discoveredTools - Set to add discovered tool names to
 */
function parseToolSearchLegacy(content: string, discoveredTools: Set<string>): void {
  const toolNameRegex = /^- ([^\s(]+)\s*\(score:/gm;
  let match: RegExpExecArray | null;
  while ((match = toolNameRegex.exec(content)) !== null) {
    const toolName = match[1];
    if (toolName) {
      discoveredTools.add(toolName);
    }
  }
}

/**
 * Extracts discovered tool names from message history by parsing tool_search results.
 * When the LLM calls tool_search, the result contains tool names that were discovered.
 * These tools should have defer_loading overridden to false on subsequent turns.
 *
 * Supports both:
 * - New JSON format: { "tools": [{ "name": "tool_name" }] }
 * - Legacy text format: "- tool_name (score: X.XX)"
 *
 * @param messages - The conversation message history
 * @returns Set of tool names that were discovered via tool_search
 */
export function extractDiscoveredToolsFromHistory(messages: BaseMessage[]): Set<string> {
  const discoveredTools = new Set<string>();

  for (const message of messages) {
    const msgType = message._getType?.() ?? message.constructor?.name ?? '';
    if (msgType !== 'tool') {
      continue;
    }

    const name = (message as { name?: string }).name;
    if (name !== Constants.TOOL_SEARCH) {
      continue;
    }

    const content = message.content;
    if (typeof content !== 'string') {
      continue;
    }

    /** Try JSON format first (new), fall back to regex (legacy) */
    if (!parseToolSearchJson(content, discoveredTools)) {
      parseToolSearchLegacy(content, discoveredTools);
    }
  }

  return discoveredTools;
}

/**
 * Overrides defer_loading to false for tools that were already discovered via tool_search.
 * This prevents the LLM from having to re-discover tools on every turn.
 *
 * @param toolRegistry - The tool registry to modify (mutated in place)
 * @param discoveredTools - Set of tool names that were previously discovered
 * @returns Number of tools that had defer_loading overridden
 */
export function overrideDeferLoadingForDiscoveredTools(
  toolRegistry: LCToolRegistry,
  discoveredTools: Set<string>,
): number {
  let overrideCount = 0;
  for (const toolName of discoveredTools) {
    const toolDef = toolRegistry.get(toolName);
    if (toolDef && toolDef.defer_loading === true) {
      toolDef.defer_loading = false;
      overrideCount++;
    }
  }
  return overrideCount;
}

const customProviders = new Set([
  Providers.XAI,
  Providers.DEEPSEEK,
  Providers.MOONSHOT,
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

type RunAgent = Omit<Agent, 'tools'> & {
  tools?: GenericTool[];
  maxContextTokens?: number;
  useLegacyContent?: boolean;
  toolContextMap?: Record<string, string>;
  toolRegistry?: LCToolRegistry;
  /** Serializable tool definitions for event-driven execution */
  toolDefinitions?: LCTool[];
  /** Precomputed flag indicating if any tools have defer_loading enabled */
  hasDeferredTools?: boolean;
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
 * @param options.messages - Optional message history to extract discovered tools from.
 *   When provided, tools that were previously discovered via tool_search will have
 *   their defer_loading overridden to false, preventing redundant re-discovery.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
export async function createRun({
  runId,
  signal,
  agents,
  messages,
  requestBody,
  user,
  tokenCounter,
  customHandlers,
  indexTokenCountMap,
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
  /** Message history for extracting previously discovered tools */
  messages?: BaseMessage[];
} & Pick<RunConfig, 'tokenCounter' | 'customHandlers' | 'indexTokenCountMap'>): Promise<
  Run<IState>
> {
  /**
   * Only extract discovered tools if:
   * 1. We have message history to parse
   * 2. At least one agent has deferred tools (using precomputed flag)
   *
   * This optimization avoids iterating through messages in the ~95% of cases
   * where no agent uses deferred tool loading.
   */
  const hasAnyDeferredTools = agents.some((agent) => agent.hasDeferredTools === true);

  const discoveredTools =
    hasAnyDeferredTools && messages?.length
      ? extractDiscoveredToolsFromHistory(messages)
      : new Set<string>();

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
      (agent.provider === Providers.OPENAI && agent.endpoint !== agent.provider)
    ) {
      llmConfig.streamUsage = false;
      llmConfig.usage = true;
    }

    /**
     * Override defer_loading for tools that were discovered in previous turns.
     * This prevents the LLM from having to re-discover tools via tool_search.
     * Also add the discovered tools' definitions so the LLM has their schemas.
     */
    let toolDefinitions = agent.toolDefinitions ?? [];
    if (discoveredTools.size > 0 && agent.toolRegistry) {
      overrideDeferLoadingForDiscoveredTools(agent.toolRegistry, discoveredTools);

      /** Add discovered tools' definitions so the LLM can see their schemas */
      const existingToolNames = new Set(toolDefinitions.map((d) => d.name));
      for (const toolName of discoveredTools) {
        if (existingToolNames.has(toolName)) {
          continue;
        }
        const toolDef = agent.toolRegistry.get(toolName);
        if (toolDef) {
          toolDefinitions = [...toolDefinitions, toolDef];
        }
      }
    }

    const reasoningKey = getReasoningKey(provider, llmConfig, agent.endpoint);
    const agentInput: AgentInputs = {
      provider,
      reasoningKey,
      toolDefinitions,
      agentId: agent.id,
      tools: agent.tools,
      clientOptions: llmConfig,
      instructions: systemContent,
      name: agent.name ?? undefined,
      toolRegistry: agent.toolRegistry,
      maxContextTokens: agent.maxContextTokens,
      useLegacyContent: agent.useLegacyContent ?? false,
      discoveredTools: discoveredTools.size > 0 ? Array.from(discoveredTools) : undefined,
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
