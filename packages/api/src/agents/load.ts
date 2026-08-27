import { logger } from '@librechat/data-schemas';
import {
  Constants,
  isAgentsEndpoint,
  isEphemeralAgentId,
  getEphemeralSender,
  resolveSpecArtifacts,
  resolveSpecMcpServers,
  encodeEphemeralAgentId,
  resolveSpecUserToggles,
  resolveSpecSkillsEnabled,
} from 'librechat-data-provider';
import type {
  AgentModelParameters,
  AgentToolOptions,
  TEphemeralAgent,
  TModelSpec,
  Agent,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ParsedServerConfig } from '~/mcp/types';
import { requiresEphemeralUserConnection, validateMCPServerConfig } from '~/mcp/utils';
import { synthesizeBackgroundToolOptions } from '~/agents/background';
import { mergeSynthesizedToolOptions } from '~/agents/selection';
import { synthesizeIntentToolOptions } from '~/agents/intent';
import { resolveEphemeralTools } from '~/agents/toggles';
import { getCustomEndpointConfig } from '~/app/config';

const { mcp_all, mcp_delimiter } = Constants;
type ModelParametersWithPromptPrefix = AgentModelParameters & { promptPrefix?: string | null };

export interface LoadAgentDeps {
  getAgent: (searchParameter: { id: string }) => Promise<Agent | null>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
    serverConfig?: ParsedServerConfig,
  ) => Promise<Record<string, unknown> | null>;
}

export interface LoadAgentParams {
  req: {
    user?: { id?: string };
    config?: AppConfig;
    body?: {
      promptPrefix?: string;
      ephemeralAgent?: TEphemeralAgent;
    };
  };
  spec?: string;
  agent_id: string;
  endpoint: string;
  model_parameters?: AgentModelParameters & { model?: string };
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
  /** A spec that hides the badge row makes its tool configuration
   *  unconditional — there is no control to express an override with, so a
   *  request toggle against one is dropped rather than obeyed. */
  const ephemeralAgent: TEphemeralAgent | undefined = resolveSpecUserToggles(
    req.body?.ephemeralAgent,
    modelSpec,
  );
  const userId = req.user?.id ?? '';
  const mcpServers = new Set<string>(
    resolveSpecMcpServers(ephemeralAgent?.mcp, modelSpec?.mcpServers),
  );
  /** Spec flags are defaults an explicit request toggle overrides. Same
   *  downstream gating as persisted agents still applies: `createRun` only
   *  equips `ask_user_question` when the request is HITL-capable, the agent is
   *  not a subagent, and the admin hasn't excluded it. */
  const tools: string[] = resolveEphemeralTools(ephemeralAgent, modelSpec);

  const addedServers = new Set<string>();
  if (mcpServers.size > 0) {
    for (const mcpServer of mcpServers) {
      if (addedServers.has(mcpServer)) {
        continue;
      }
      /** Address durable catalogs by the effective request overlay; request-scoped
       *  overlays still expand fresh through `mcp_all`. */
      const rawOverlayConfig = req.config?.mcpConfig?.[mcpServer];
      const overlayConfig = rawOverlayConfig
        ? validateMCPServerConfig(rawOverlayConfig)
        : undefined;
      const serverTools =
        overlayConfig && requiresEphemeralUserConnection(overlayConfig)
          ? null
          : await deps.getMCPServerTools(userId, mcpServer, overlayConfig);
      if (!serverTools) {
        tools.push(`${mcp_all}${mcp_delimiter}${mcpServer}`);
        addedServers.add(mcpServer);
        continue;
      }
      tools.push(...Object.keys(serverTools));
      addedServers.add(mcpServer);
    }
  }

  const requestPromptPrefix = req.body?.promptPrefix;
  const { promptPrefix: modelPromptPrefix, ...safeModelParameters } =
    model_parameters as ModelParametersWithPromptPrefix;
  const instructions =
    typeof modelPromptPrefix === 'string' ? modelPromptPrefix : requestPromptPrefix;

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

  const sender = getEphemeralSender({
    modelLabel: (model_parameters as AgentModelParameters & { modelLabel?: string })?.modelLabel,
    specLabel: modelSpec?.label,
    modelDisplayLabel: (endpointConfig as { modelDisplayLabel?: string } | undefined)
      ?.modelDisplayLabel,
  });

  // Encode ephemeral agent ID with endpoint, model, and computed sender for display
  const ephemeralId = encodeEphemeralAgentId({
    endpoint,
    model: model as string,
    sender,
  });

  const result: Partial<Agent> = {
    id: ephemeralId,
    instructions,
    provider: endpoint,
    model_parameters: safeModelParameters as AgentModelParameters,
    model,
    tools,
  };

  const backgroundToolOptions: AgentToolOptions | undefined = synthesizeBackgroundToolOptions({
    ephemeralAgent,
    modelSpec,
  });
  if (backgroundToolOptions) {
    result.tool_options = backgroundToolOptions;
  }
  const intentToolOptions: AgentToolOptions | undefined = synthesizeIntentToolOptions({
    ephemeralAgent,
    modelSpec,
  });
  if (intentToolOptions) {
    result.tool_options = mergeSynthesizedToolOptions(result.tool_options, intentToolOptions);
  }

  const artifacts = resolveSpecArtifacts(ephemeralAgent?.artifacts, modelSpec?.artifacts);
  if (artifacts != null) {
    result.artifacts = artifacts;
  }
  if (modelSpec?.subagents) {
    result.subagents = modelSpec.subagents;
  }
  if (modelSpec && Object.prototype.hasOwnProperty.call(modelSpec, 'skills')) {
    const skillsEnabled = resolveSpecSkillsEnabled(ephemeralAgent?.skills, modelSpec.skills);
    result.skills_enabled = skillsEnabled;
    if (!skillsEnabled || Array.isArray(modelSpec.skills)) {
      result.skills = [];
    }
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

  // Set version count from versions array length
  const agentWithVersion = agent as Agent & { versions?: unknown[]; version?: number };
  agentWithVersion.version = agentWithVersion.versions ? agentWithVersion.versions.length : 0;
  return agent;
}
