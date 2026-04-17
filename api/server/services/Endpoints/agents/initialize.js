const { logger } = require('@librechat/data-schemas');
const { EnvVar, createContentAggregator } = require('@librechat/agents');
const {
  scopeSkillIds,
  loadSkillStates,
  initializeAgent,
  primeInvokedSkills,
  validateAgentModel,
  createEdgeCollector,
  filterOrphanedEdges,
  GenerationJobManager,
  getCustomEndpointConfig,
  createSequentialChainEdges,
} = require('@librechat/api');
const {
  ResourceType,
  PermissionBits,
  EModelEndpoint,
  isAgentsEndpoint,
  getResponseSender,
  AgentCapabilities,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const {
  createToolEndCallback,
  getDefaultHandlers,
} = require('~/server/controllers/agents/callbacks');
const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getSkillToolDeps, enrichWithSkillConfigurable } = require('./skillDeps');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { checkPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const AgentClient = require('~/server/controllers/agents/client');
const { processAddedConvo } = require('./addedConvo');
const { logViolation } = require('~/cache');
const db = require('~/models');

/**
 * Creates a tool loader function for the agent.
 * @param {AbortSignal} signal - The abort signal
 * @param {string | null} [streamId] - The stream ID for resumable mode
 * @param {boolean} [definitionsOnly=false] - When true, returns only serializable
 *   tool definitions without creating full tool instances (for event-driven mode)
 */
function createToolLoader(signal, streamId = null, definitionsOnly = false) {
  /**
   * @param {object} params
   * @param {ServerRequest} params.req
   * @param {ServerResponse} params.res
   * @param {string} params.agentId
   * @param {string[]} params.tools
   * @param {string} params.provider
   * @param {string} params.model
   * @param {AgentToolResources} params.tool_resources
   * @returns {Promise<{
   *   tools?: StructuredTool[],
   *   toolContextMap: Record<string, unknown>,
   *   toolDefinitions?: import('@librechat/agents').LCTool[],
   *   userMCPAuthMap?: Record<string, Record<string, string>>,
   *   toolRegistry?: import('@librechat/agents').LCToolRegistry
   * } | undefined>}
   */
  return async function loadTools({
    req,
    res,
    tools,
    model,
    agentId,
    provider,
    tool_options,
    tool_resources,
  }) {
    const agent = { id: agentId, tools, provider, model, tool_options };
    try {
      return await loadAgentTools({
        req,
        res,
        agent,
        signal,
        streamId,
        tool_resources,
        definitionsOnly,
      });
    } catch (error) {
      logger.error('Error loading tools for agent ' + agentId, error);
    }
  };
}

/**
 * Initializes the AgentClient for a given request/response cycle.
 * @param {Object} params
 * @param {Express.Request} params.req
 * @param {Express.Response} params.res
 * @param {AbortSignal} params.signal
 * @param {Object} params.endpointOption
 */
const initializeClient = async ({ req, res, signal, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }
  const appConfig = req.config;

  /** @type {string | null} */
  const streamId = req._resumableStreamId || null;

  /** @type {Array<UsageMetadata>} */
  const collectedUsage = [];
  /** @type {ArtifactPromises} */
  const artifactPromises = [];
  const { contentParts, aggregateContent } = createContentAggregator();
  const toolEndCallback = createToolEndCallback({ req, res, artifactPromises, streamId });

  /** Query accessible skill IDs once per run (shared across all agents).
   *  Skills activate when the admin capability is enabled AND either:
   *  - the per-conversation toggle is on (ephemeral), OR
   *  - the agent has stored skills (scoped by scopeSkillIds later). */
  const enabledCapabilities = new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.capabilities);
  const skillsCapabilityEnabled = enabledCapabilities.has(AgentCapabilities.skills);
  const ephemeralSkillsToggle = req.body?.ephemeralAgent?.skills === true;

  const accessibleSkillIds = skillsCapabilityEnabled
    ? await findAccessibleResources({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.SKILL,
        requiredPermissions: PermissionBits.VIEW,
      })
    : [];

  const { skillStates, defaultActiveOnShare } = await loadSkillStates({
    userId: req.user.id,
    appConfig,
    getUserById: db.getUserById,
    accessibleSkillIds,
  });

  // Resolve code API key once for the entire run (shared by primeInvokedSkills
  // and enrichWithSkillConfigurable) to avoid redundant auth lookups.
  let codeApiKey;
  if (skillsCapabilityEnabled && enabledCapabilities.has(AgentCapabilities.execute_code)) {
    try {
      const authValues = await loadAuthValues({
        userId: req.user.id,
        authFields: [EnvVar.CODE_API_KEY],
      });
      codeApiKey = authValues[EnvVar.CODE_API_KEY];
    } catch {
      // non-fatal — primeInvokedSkills and enrichWithSkillConfigurable will work without it
    }
  }

  /**
   * Agent context store - populated after initialization, accessed by callback via closure.
   * Maps agentId -> { userMCPAuthMap, agent, tool_resources, toolRegistry, openAIApiKey }
   * @type {Map<string, {
   *   userMCPAuthMap?: Record<string, Record<string, string>>,
   *   agent?: object,
   *   tool_resources?: object,
   *   toolRegistry?: import('@librechat/agents').LCToolRegistry,
   *   openAIApiKey?: string
   * }>}
   */
  const agentToolContexts = new Map();

  const toolExecuteOptions = {
    loadTools: async (toolNames, agentId) => {
      const ctx = agentToolContexts.get(agentId) ?? {};
      logger.debug(`[ON_TOOL_EXECUTE] ctx found: ${!!ctx.userMCPAuthMap}, agent: ${ctx.agent?.id}`);
      logger.debug(`[ON_TOOL_EXECUTE] toolRegistry size: ${ctx.toolRegistry?.size ?? 'undefined'}`);

      const result = await loadToolsForExecution({
        req,
        res,
        signal,
        streamId,
        toolNames,
        agent: ctx.agent,
        toolRegistry: ctx.toolRegistry,
        userMCPAuthMap: ctx.userMCPAuthMap,
        tool_resources: ctx.tool_resources,
        actionsEnabled: ctx.actionsEnabled,
      });

      logger.debug(`[ON_TOOL_EXECUTE] loaded ${result.loadedTools?.length ?? 0} tools`);
      return enrichWithSkillConfigurable(result, req, ctx.accessibleSkillIds, codeApiKey);
    },
    toolEndCallback,
    ...getSkillToolDeps(),
  };

  const summarizationOptions =
    appConfig?.summarization?.enabled === false ? { enabled: false } : { enabled: true };

  const eventHandlers = getDefaultHandlers({
    res,
    toolExecuteOptions,
    summarizationOptions,
    aggregateContent,
    toolEndCallback,
    collectedUsage,
    streamId,
  });

  if (!endpointOption.agent) {
    throw new Error('No agent promise provided');
  }

  const primaryAgent = await endpointOption.agent;
  delete endpointOption.agent;
  if (!primaryAgent) {
    throw new Error('Agent not found');
  }

  const modelsConfig = await getModelsConfig(req);
  const validationResult = await validateAgentModel({
    req,
    res,
    modelsConfig,
    logViolation,
    agent: primaryAgent,
  });

  if (!validationResult.isValid) {
    throw new Error(validationResult.error?.message);
  }

  const agentConfigs = new Map();
  const allowedProviders = new Set(appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders);

  /** Event-driven mode: only load tool definitions, not full instances */
  const loadTools = createToolLoader(signal, streamId, true);
  /** @type {Array<MongoFile>} */
  const requestFiles = req.body.files ?? [];
  /** @type {string} */
  const conversationId = req.body.conversationId;
  /** @type {string | undefined} */
  const parentMessageId = req.body.parentMessageId;

  const primaryConfig = await initializeAgent(
    {
      req,
      res,
      loadTools,
      requestFiles,
      conversationId,
      parentMessageId,
      agent: primaryAgent,
      endpointOption,
      allowedProviders,
      isInitialAgent: true,
      accessibleSkillIds: scopeSkillIds(
        accessibleSkillIds,
        ephemeralSkillsToggle ? undefined : primaryAgent.skills,
      ),
      codeEnvAvailable: enabledCapabilities.has(AgentCapabilities.execute_code),
      skillStates,
      defaultActiveOnShare,
    },
    {
      getFiles: db.getFiles,
      getUserKey: db.getUserKey,
      getMessages: db.getMessages,
      getConvoFiles: db.getConvoFiles,
      updateFilesUsage: db.updateFilesUsage,
      getUserKeyValues: db.getUserKeyValues,
      getUserCodeFiles: db.getUserCodeFiles,
      getToolFilesByIds: db.getToolFilesByIds,
      getCodeGeneratedFiles: db.getCodeGeneratedFiles,
      filterFilesByAgentAccess,
      listSkillsByAccess: db.listSkillsByAccess,
    },
  );

  logger.debug(
    `[initializeClient] Storing tool context for ${primaryConfig.id}: ${primaryConfig.toolDefinitions?.length ?? 0} tools, registry size: ${primaryConfig.toolRegistry?.size ?? '0'}`,
  );
  agentToolContexts.set(primaryConfig.id, {
    agent: primaryAgent,
    toolRegistry: primaryConfig.toolRegistry,
    userMCPAuthMap: primaryConfig.userMCPAuthMap,
    tool_resources: primaryConfig.tool_resources,
    actionsEnabled: primaryConfig.actionsEnabled,
    accessibleSkillIds: primaryConfig.accessibleSkillIds,
  });

  const agent_ids = primaryConfig.agent_ids;
  let userMCPAuthMap = primaryConfig.userMCPAuthMap;

  /** @type {Set<string>} Track agents that failed to load (orphaned references) */
  const skippedAgentIds = new Set();

  async function processAgent(agentId) {
    const agent = await db.getAgent({ id: agentId });
    if (!agent) {
      logger.warn(
        `[processAgent] Handoff agent ${agentId} not found, skipping (orphaned reference)`,
      );
      skippedAgentIds.add(agentId);
      return null;
    }

    const hasAccess = await checkPermission({
      userId: req.user.id,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });

    if (!hasAccess) {
      logger.warn(
        `[processAgent] User ${req.user.id} lacks VIEW access to handoff agent ${agentId}, skipping`,
      );
      skippedAgentIds.add(agentId);
      return null;
    }

    const validationResult = await validateAgentModel({
      req,
      res,
      agent,
      modelsConfig,
      logViolation,
    });

    if (!validationResult.isValid) {
      throw new Error(validationResult.error?.message);
    }

    const config = await initializeAgent(
      {
        req,
        res,
        agent,
        loadTools,
        requestFiles,
        conversationId,
        parentMessageId,
        endpointOption,
        allowedProviders,
        accessibleSkillIds: scopeSkillIds(
          accessibleSkillIds,
          ephemeralSkillsToggle ? undefined : agent.skills,
        ),
        skillStates,
        defaultActiveOnShare,
      },
      {
        getFiles: db.getFiles,
        getUserKey: db.getUserKey,
        getMessages: db.getMessages,
        getConvoFiles: db.getConvoFiles,
        updateFilesUsage: db.updateFilesUsage,
        getUserKeyValues: db.getUserKeyValues,
        getUserCodeFiles: db.getUserCodeFiles,
        getToolFilesByIds: db.getToolFilesByIds,
        getCodeGeneratedFiles: db.getCodeGeneratedFiles,
        filterFilesByAgentAccess,
        listSkillsByAccess: db.listSkillsByAccess,
      },
    );

    if (userMCPAuthMap != null) {
      Object.assign(userMCPAuthMap, config.userMCPAuthMap ?? {});
    } else {
      userMCPAuthMap = config.userMCPAuthMap;
    }

    /** Store handoff agent's tool context for ON_TOOL_EXECUTE callback */
    agentToolContexts.set(agentId, {
      agent,
      toolRegistry: config.toolRegistry,
      userMCPAuthMap: config.userMCPAuthMap,
      tool_resources: config.tool_resources,
      actionsEnabled: config.actionsEnabled,
      accessibleSkillIds: config.accessibleSkillIds,
    });

    agentConfigs.set(agentId, config);
    return agent;
  }

  const checkAgentInit = (agentId) => agentId === primaryConfig.id || agentConfigs.has(agentId);

  // Graph topology discovery for recursive agent handoffs (BFS)
  const { edgeMap, agentsToProcess, collectEdges } = createEdgeCollector(
    checkAgentInit,
    skippedAgentIds,
  );

  // Seed with primary agent's edges
  collectEdges(primaryConfig.edges);

  // BFS to load and merge all connected agents (enables transitive handoffs: A->B->C)
  while (agentsToProcess.size > 0) {
    const agentId = agentsToProcess.values().next().value;
    agentsToProcess.delete(agentId);
    try {
      const agent = await processAgent(agentId);
      if (agent?.edges?.length) {
        collectEdges(agent.edges);
      }
    } catch (err) {
      logger.error(`[initializeClient] Error processing agent ${agentId}:`, err);
      skippedAgentIds.add(agentId);
    }
  }

  /** @deprecated Agent Chain */
  if (agent_ids?.length) {
    for (const agentId of agent_ids) {
      if (checkAgentInit(agentId)) {
        continue;
      }
      try {
        await processAgent(agentId);
      } catch (err) {
        logger.error(`[initializeClient] Error processing chain agent ${agentId}:`, err);
        skippedAgentIds.add(agentId);
      }
    }
    const chain = await createSequentialChainEdges([primaryConfig.id].concat(agent_ids), '{convo}');
    collectEdges(chain);
  }

  let edges = Array.from(edgeMap.values());

  /** Multi-Convo: Process addedConvo for parallel agent execution */
  const { userMCPAuthMap: updatedMCPAuthMap } = await processAddedConvo({
    req,
    res,
    loadTools,
    logViolation,
    modelsConfig,
    requestFiles,
    agentConfigs,
    primaryAgent,
    endpointOption,
    userMCPAuthMap,
    conversationId,
    parentMessageId,
    allowedProviders,
    primaryAgentId: primaryConfig.id,
  });

  if (updatedMCPAuthMap) {
    userMCPAuthMap = updatedMCPAuthMap;
  }

  for (const [agentId, config] of agentConfigs) {
    if (agentToolContexts.has(agentId)) {
      continue;
    }
    agentToolContexts.set(agentId, {
      agent: config,
      toolRegistry: config.toolRegistry,
      userMCPAuthMap: config.userMCPAuthMap,
      tool_resources: config.tool_resources,
      actionsEnabled: config.actionsEnabled,
    });
  }

  // Ensure edges is an array when we have multiple agents (multi-agent mode)
  // MultiAgentGraph.categorizeEdges requires edges to be iterable
  if (agentConfigs.size > 0 && !edges) {
    edges = [];
  }

  // Filter out edges referencing non-existent agents (orphaned references)
  edges = filterOrphanedEdges(edges, skippedAgentIds);

  primaryConfig.edges = edges;

  // Subagents: load any explicit subagent configs. Subagents run in isolated
  // context windows and are invoked via a dedicated spawn tool (not handoff
  // edges). An agent that is ONLY referenced as a subagent is dropped from
  // `agentConfigs` so the LangGraph pipeline doesn't treat it as a
  // parallel/handoff node, but it is KEPT in `agentToolContexts` — the child's
  // `ON_TOOL_EXECUTE` dispatches resolve tool execution context (agent,
  // tool_resources, skill ACLs, ...) from that map, so removing it would leave
  // action tools skipped and resource-scoped tools running without their
  // configured resources.
  const subagentsCapabilityEnabled = enabledCapabilities.has(AgentCapabilities.subagents);
  const subagentsConfig = primaryConfig.subagents;
  /** @type {Array<Object>} Loaded subagent configs (AgentConfig objects for each subagent) */
  const subagentAgentConfigs = [];
  /** Subagents are currently primary-only: child agents reached via handoff edges
   *  do not get their own `subagentAgentConfigs` loaded here. Self-spawn still
   *  works for them (no DB lookup needed), but explicit sub-subagents would be
   *  silently dropped. See TODO below if that surface is needed later. */

  if (subagentsCapabilityEnabled && subagentsConfig?.enabled) {
    /** Dedupe and filter in one pass — a crafted payload could legitimately
     *  include the same ID twice; the backend shouldn't create duplicate
     *  SubagentConfig entries for the LLM to see as separate spawn targets. */
    const explicitSubagentIds = Array.from(
      new Set(
        Array.isArray(subagentsConfig.agent_ids)
          ? subagentsConfig.agent_ids.filter(
              (id) => typeof id === 'string' && id && id !== primaryConfig.id,
            )
          : [],
      ),
    );

    const edgeAgentIds = new Set([primaryConfig.id]);
    for (const edge of edges ?? []) {
      const sources = Array.isArray(edge.from) ? edge.from : [edge.from];
      const targets = Array.isArray(edge.to) ? edge.to : [edge.to];
      for (const id of sources) {
        if (typeof id === 'string') edgeAgentIds.add(id);
      }
      for (const id of targets) {
        if (typeof id === 'string') edgeAgentIds.add(id);
      }
    }

    for (const subagentId of explicitSubagentIds) {
      if (skippedAgentIds.has(subagentId)) {
        continue;
      }

      let subagentConfig = agentConfigs.get(subagentId);
      if (!subagentConfig) {
        try {
          await processAgent(subagentId);
          subagentConfig = agentConfigs.get(subagentId);
        } catch (err) {
          logger.error(`[initializeClient] Error processing subagent ${subagentId}:`, err);
          skippedAgentIds.add(subagentId);
        }
      }

      if (!subagentConfig) {
        continue;
      }

      subagentAgentConfigs.push(subagentConfig);

      /** If this agent is exclusively a subagent (not referenced in any edge),
       *  drop it from `agentConfigs` so the LangGraph pipeline doesn't treat
       *  it as a parallel/handoff node. KEEP it in `agentToolContexts` — the
       *  child's ON_TOOL_EXECUTE handler needs the tool-execution context
       *  (agent, tool_resources, skill ACLs) to run the child's tools with
       *  the right scoping. */
      if (!edgeAgentIds.has(subagentId)) {
        agentConfigs.delete(subagentId);
      }
    }
  }

  primaryConfig.subagentAgentConfigs = subagentAgentConfigs;
  primaryConfig.subagents = subagentsCapabilityEnabled ? subagentsConfig : undefined;

  let endpointConfig = appConfig.endpoints?.[primaryConfig.endpoint];
  if (!isAgentsEndpoint(primaryConfig.endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({
        endpoint: primaryConfig.endpoint,
        appConfig,
      });
    } catch (err) {
      logger.error(
        '[api/server/controllers/agents/client.js #titleConvo] Error getting custom endpoint config',
        err,
      );
    }
  }

  const sender =
    primaryAgent.name ??
    getResponseSender({
      ...endpointOption,
      model: endpointOption.model_parameters.model,
      modelDisplayLabel: endpointConfig?.modelDisplayLabel,
      modelLabel: endpointOption.model_parameters.modelLabel,
    });

  /** primeInvokedSkills reconstructs bodies of skills invoked in prior turns so
   *  formatAgentMessages can rebuild HumanMessages and re-prime code-env files.
   *  Unlike catalog injection and runtime invocation (both scoped per-agent),
   *  history priming must use the user's full ACL-accessible set: historical
   *  skill calls can reference skills no longer in any active agent's scope
   *  (agent.skills edited, ephemeral toggle flipped), and scoping those out
   *  would drop prior skill context and break file references in follow-up
   *  turns. The ACL check remains the security gate; handleSkillToolCall is
   *  where per-agent scoping prevents NEW invocations. */
  const handlePrimeInvokedSkills = skillsCapabilityEnabled
    ? (payload) =>
        primeInvokedSkills({
          req,
          payload,
          accessibleSkillIds,
          codeApiKey,
          loadAuthValues,
          ...getSkillToolDeps(),
        })
    : undefined;

  const client = new AgentClient({
    req,
    res,
    sender,
    contentParts,
    agentConfigs,
    eventHandlers,
    collectedUsage,
    aggregateContent,
    artifactPromises,
    primeInvokedSkills: handlePrimeInvokedSkills,
    agent: primaryConfig,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    attachments: primaryConfig.attachments,
    endpointType: endpointOption.endpointType,
    resendFiles: primaryConfig.resendFiles ?? true,
    maxContextTokens: primaryConfig.maxContextTokens,
    endpoint: isEphemeralAgentId(primaryConfig.id) ? primaryConfig.endpoint : EModelEndpoint.agents,
  });

  if (streamId) {
    GenerationJobManager.setCollectedUsage(streamId, collectedUsage);
  }

  return { client, userMCPAuthMap };
};

module.exports = { initializeClient };
