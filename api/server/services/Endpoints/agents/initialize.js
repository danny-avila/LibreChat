const { logger } = require('@librechat/data-schemas');
const { EnvVar, createContentAggregator } = require('@librechat/agents');
const {
  scopeSkillIds,
  loadSkillStates,
  initializeAgent,
  primeInvokedSkills,
  validateAgentModel,
  extractManualSkills,
  GenerationJobManager,
  getCustomEndpointConfig,
  discoverConnectedAgents,
} = require('@librechat/api');
const {
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
  /**
   * Skill names the user invoked via the `$` popover for this turn. Only flows
   * to the primary agent — handoff agents are follow-up turns that don't see
   * the user's per-submission `$` selections. `extractManualSkills` also
   * drops non-string / empty elements so a crafted payload can't reach the
   * `getSkillByName` DB query with nonsense values.
   * @type {string[] | undefined}
   */
  const manualSkills = extractManualSkills(req.body);

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
      manualSkills,
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
      getSkillByName: db.getSkillByName,
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

  const {
    agentConfigs: discoveredConfigs,
    edges: discoveredEdges,
    userMCPAuthMap: discoveredMCPAuthMap,
  } = await discoverConnectedAgents(
    {
      req,
      res,
      primaryConfig,
      agent_ids: primaryConfig.agent_ids,
      endpointOption,
      allowedProviders,
      modelsConfig,
      loadTools,
      requestFiles,
      conversationId,
      parentMessageId,
      computeAccessibleSkillIds: (agent) =>
        scopeSkillIds(accessibleSkillIds, ephemeralSkillsToggle ? undefined : agent.skills),
      skillStates,
      defaultActiveOnShare,
    },
    {
      getAgent: db.getAgent,
      checkPermission,
      logViolation,
      db: {
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
        getSkillByName: db.getSkillByName,
      },
      // The callback fires during BFS, before the helper prunes agents
      // whose edges end up filtered. Don't populate `agentConfigs` here —
      // `discoveredConfigs` (returned below) is the authoritative pruned
      // set. The per-agent tool context map is OK to keep populated even
      // for pruned ids: it's only read by closure in ON_TOOL_EXECUTE,
      // stale entries are unreachable at runtime.
      onAgentInitialized: (agentId, agent, config) => {
        agentToolContexts.set(agentId, {
          agent,
          toolRegistry: config.toolRegistry,
          userMCPAuthMap: config.userMCPAuthMap,
          tool_resources: config.tool_resources,
          actionsEnabled: config.actionsEnabled,
          accessibleSkillIds: config.accessibleSkillIds,
        });
      },
      // Pass through the `@librechat/api` exports so that tests which
      // `jest.mock('@librechat/api')` can override the initializer/validator.
      initializeAgent,
      validateAgentModel,
    },
  );

  // Copy the pruned discovery result into the outer map. Anything the
  // helper dropped (skipped or unreachable after edge filtering) is
  // intentionally absent. `processAddedConvo` below may still add more
  // entries for parallel multi-convo execution.
  for (const [agentId, config] of discoveredConfigs) {
    agentConfigs.set(agentId, config);
  }

  let userMCPAuthMap = discoveredMCPAuthMap;
  let edges = discoveredEdges;

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
      accessibleSkillIds: config.accessibleSkillIds,
    });
  }

  // `discoverConnectedAgents` always returns a concrete array, so no
  // further normalization is needed before handing this to `createRun`.
  primaryConfig.edges = edges;

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
