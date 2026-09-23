import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import {
  Tools,
  Constants,
  isAgentsEndpoint,
  isEphemeralAgentId,
  encodeEphemeralAgentId,
} from 'librechat-data-provider';
import type {
  AgentModelParameters,
  TEphemeralAgent,
  TModelSpec,
  Agent,
} from 'librechat-data-provider';
import { getCustomEndpointConfig } from '~/app/config';
import { resolveResponseAppInstructions } from './generatedResponsePrompts';

const { mcp_all, mcp_delimiter } = Constants;
type ModelParametersWithPromptPrefix = AgentModelParameters & { promptPrefix?: string | null };

export interface LoadAgentDeps {
  getAgent: (searchParameter: { id: string }) => Promise<Agent | null>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
  ) => Promise<Record<string, unknown> | null>;
}

export interface LoadAgentParams {
  req: {
    user?: { id?: string };
    config?: AppConfig;
    body?: {
      appId?: string | number;
      promptPrefix?: string;
      instructions?: string;
      ephemeralAgent?: TEphemeralAgent;
    };
  };
  spec?: string;
  agent_id: string;
  endpoint: string;
  model_parameters?: AgentModelParameters & { model?: string };
}

async function buildRuntimeTools({
  ephemeralAgent,
  userId,
  deps,
}: {
  ephemeralAgent?: TEphemeralAgent;
  userId: string;
  deps: LoadAgentDeps;
}): Promise<string[]> {
  const tools: string[] = [];
  if (ephemeralAgent?.execute_code === true) {
    tools.push(Tools.execute_code);
  }
  if (ephemeralAgent?.file_search === true) {
    tools.push(Tools.file_search);
  }
  if (ephemeralAgent?.web_search === true) {
    tools.push(Tools.web_search);
  }

  const mcpServers = new Set<string>(ephemeralAgent?.mcp);
  const addedServers = new Set<string>();
  for (const mcpServer of mcpServers) {
    if (addedServers.has(mcpServer)) {
      continue;
    }
    const serverTools = await deps.getMCPServerTools(userId, mcpServer);
    if (!serverTools) {
      tools.push(`${mcp_all}${mcp_delimiter}${mcpServer}`);
      addedServers.add(mcpServer);
      continue;
    }
    tools.push(...Object.keys(serverTools));
    addedServers.add(mcpServer);
  }

  return tools;
}

/**
 * Load an ephemeral agent based on the request parameters.
 */
export async function loadEphemeralAgent(
  { req, spec, endpoint, model_parameters: _m }: Omit<LoadAgentParams, 'agent_id'>,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { model, ...model_parameters } = _m ?? ({} as unknown as AgentModelParameters);
  const modelSpecs = req.config?.modelSpecs as { list?: TModelSpec[] } | undefined;
  let modelSpec: TModelSpec | null = null;
  if (spec != null && spec !== '') {
    modelSpec = modelSpecs?.list?.find((s) => s.name === spec) ?? null;
  }
  const ephemeralAgent: TEphemeralAgent | undefined = req.body?.ephemeralAgent;
  const userId = req.user?.id ?? '';
  const mergedEphemeralAgent: TEphemeralAgent = {
    ...ephemeralAgent,
    mcp: [...new Set([...(ephemeralAgent?.mcp ?? []), ...(modelSpec?.mcpServers ?? [])])],
    execute_code: ephemeralAgent?.execute_code === true || modelSpec?.executeCode === true,
    file_search: ephemeralAgent?.file_search === true || modelSpec?.fileSearch === true,
    web_search: ephemeralAgent?.web_search === true || modelSpec?.webSearch === true,
  };
  const tools = await buildRuntimeTools({
    ephemeralAgent: mergedEphemeralAgent,
    userId,
    deps,
  });

  const requestPromptPrefix = req.body?.promptPrefix;
  const { promptPrefix: modelPromptPrefix, ...safeModelParameters } =
    model_parameters as ModelParametersWithPromptPrefix;
  const requestInstructions =
    typeof req.body?.instructions === 'string'
      ? req.body.instructions
      : typeof modelPromptPrefix === 'string'
        ? modelPromptPrefix
        : requestPromptPrefix;
  const appInstructions = await resolveResponseAppInstructions(req.body?.appId);
  const requestTaskInstructions = appInstructions && requestInstructions === appInstructions
    ? ''
    : appInstructions && requestInstructions?.startsWith(`${appInstructions}\n\n`)
      ? requestInstructions.slice(appInstructions.length).replace(/^\s+/, '')
    : requestInstructions;
  const instructions = appInstructions || requestInstructions;

  // Get endpoint config for modelDisplayLabel fallback
  const appConfig = req.config;
  const endpoints = appConfig?.endpoints;
  let endpointConfig = endpoints?.[endpoint as keyof typeof endpoints];
  if (!isAgentsEndpoint(endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
    } catch (err) {
      logger.error('[loadEphemeralAgent] Error getting custom endpoint config', err);
    }
  }

  // For ephemeral agents, use modelLabel if provided, then model spec's label,
  // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
  const sender =
    (model_parameters as AgentModelParameters & { modelLabel?: string })?.modelLabel ??
    modelSpec?.label ??
    (endpointConfig as { modelDisplayLabel?: string } | undefined)?.modelDisplayLabel ??
    '';

  // Encode ephemeral agent ID with endpoint, model, and computed sender for display
  const ephemeralId = encodeEphemeralAgentId({
    endpoint,
    model: model as string,
    sender: sender as string,
  });

  const result: Partial<Agent> = {
    id: ephemeralId,
    instructions,
    additional_instructions: appInstructions ? requestTaskInstructions : undefined,
    provider: endpoint,
    model_parameters: safeModelParameters as AgentModelParameters,
    model,
    tools,
  };

  if (mergedEphemeralAgent.artifacts) {
    result.artifacts = mergedEphemeralAgent.artifacts;
  }
  return result as Agent;
}

/**
 * Load an agent based on the provided ID.
 * For ephemeral agents, builds a synthetic agent from request parameters.
 * For persistent agents, fetches from the database.
 */
export async function loadAgent(
  params: LoadAgentParams,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { req, spec, agent_id, endpoint, model_parameters } = params;
  if (!agent_id) {
    return null;
  }
  if (isEphemeralAgentId(agent_id)) {
    return loadEphemeralAgent({ req, spec, endpoint, model_parameters }, deps);
  }
  const agent = await deps.getAgent({ id: agent_id });

  if (!agent) {
    return null;
  }

  const runtimeAgent = req.body?.ephemeralAgent;
  if (runtimeAgent != null) {
    const runtimeTools = await buildRuntimeTools({
      ephemeralAgent: runtimeAgent,
      userId: req.user?.id ?? '',
      deps,
    });
    if (runtimeTools.length > 0) {
      agent.tools = [...new Set([...(agent.tools ?? []), ...runtimeTools])];
    }
    if (runtimeAgent.artifacts) {
      agent.artifacts = runtimeAgent.artifacts;
    }
  }

  /**
   * Per-run context from trusted API callers (e.g. the Django proxy sends case/tool
   * context as `instructions`). Persistent-agent runs otherwise discard request-level
   * instructions entirely, so case-scoped tools never learn the active caseId.
   * Appended to `additional_instructions`, the same dynamic system tail used for
   * memory/RAG context; the agent author's stored `instructions` stay untouched.
   */
  const requestInstructions =
    typeof req.body?.instructions === 'string' ? req.body.instructions.trim() : '';
  const appInstructions = await resolveResponseAppInstructions(req.body?.appId);
  const requestTaskInstructions = appInstructions && requestInstructions === appInstructions
    ? ''
    : appInstructions && requestInstructions.startsWith(`${appInstructions}\n\n`)
      ? requestInstructions.slice(appInstructions.length).replace(/^\s+/, '')
    : requestInstructions;

  if (appInstructions) {
    const storedInstructions = agent.instructions === appInstructions
      ? ''
      : agent.instructions?.startsWith(`${appInstructions}\n\n`)
        ? agent.instructions.slice(appInstructions.length).replace(/^\s+/, '')
        : agent.instructions;
    agent.instructions = appInstructions;
    agent.additional_instructions = [agent.additional_instructions, storedInstructions, requestTaskInstructions]
      .filter(Boolean)
      .join('\n\n');
  } else if (requestTaskInstructions) {
    agent.additional_instructions = [agent.additional_instructions, requestTaskInstructions]
      .filter(Boolean)
      .join('\n\n');
  }

  // Set version count from versions array length
  const agentWithVersion = agent as Agent & { versions?: unknown[]; version?: number };
  agentWithVersion.version = agentWithVersion.versions ? agentWithVersion.versions.length : 0;
  return agent;
}
