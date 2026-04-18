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
  ResourceType,
  EModelEndpoint,
  PermissionBits,
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
const {
  getSkillToolDeps,
  enrichWithSkillConfigurable,
  buildSkillPrimedIdsByName,
} = require('./skillDeps');
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
      return enrichWithSkillConfigurable(
        result,
        req,
        ctx.accessibleSkillIds,
        codeApiKey,
        ctx.skillPrimedIdsByName,
      );
    },
    toolEndCallback,
    ...getSkillToolDeps(),
  };

  const summarizationOptions =
    appConfig?.summarization?.enabled === false ? { enabled: false } : { enabled: true };

  /**
   * Per-request map of per-subagent `createContentAggregator` instances
   * keyed by the parent's `tool_call_id`. The handler in `callbacks.js`
   * lazily creates an aggregator for each distinct `parentToolCallId`
   * and folds every `ON_SUBAGENT_UPDATE` event into it as they stream
   * in. `AgentClient` pulls each aggregator's `contentParts` at message
   * save time and attaches them to the matching `subagent` tool_call so
   * the child's reasoning / tool calls / final text survive a page
   * refresh — the client-side Recoil atom is best-effort live-only.
   */
  const subagentAggregatorsByToolCallId = new Map();

  const eventHandlers = getDefaultHandlers({
    res,
    toolExecuteOptions,
    summarizationOptions,
    aggregateContent,
    toolEndCallback,
    collectedUsage,
    streamId,
    subagentAggregatorsByToolCallId,
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
      listAlwaysApplySkills: db.listAlwaysApplySkills,
      getSkillByName: db.getSkillByName,
    },
  );

  logger.debug(
    `[initializeClient] Storing tool context for ${primaryConfig.id}: ${primaryConfig.toolDefinitions?.length ?? 0} tools, registry size: ${primaryConfig.toolRegistry?.size ?? '0'}`,
  );
  /** Maps each primed skill name (manual `$` or always-apply) to the
   *  `_id` of the exact doc that was primed. Plumbed to
   *  `enrichWithSkillConfigurable` so the read_file handler can pin
   *  same-name collision lookups to the resolver's chosen doc AND relax
   *  the disable-model-invocation gate for skills whose body is already
   *  in this turn's context. */
  const skillPrimedIdsByName = buildSkillPrimedIdsByName(
    primaryConfig.manualSkillPrimes,
    primaryConfig.alwaysApplySkillPrimes,
  );
  agentToolContexts.set(primaryConfig.id, {
    agent: primaryAgent,
    toolRegistry: primaryConfig.toolRegistry,
    userMCPAuthMap: primaryConfig.userMCPAuthMap,
    tool_resources: primaryConfig.tool_resources,
    actionsEnabled: primaryConfig.actionsEnabled,
    accessibleSkillIds: primaryConfig.accessibleSkillIds,
    skillPrimedIdsByName,
  });

  const {
    agentConfigs: discoveredConfigs,
    edges: discoveredEdges,
    userMCPAuthMap: discoveredMCPAuthMap,
    skippedAgentIds: discoveredSkippedIds,
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
        listAlwaysApplySkills: db.listAlwaysApplySkills,
        getSkillByName: db.getSkillByName,
      },
      // The callback fires during BFS, before the helper prunes agents
      // whose edges end up filtered. Don't populate `agentConfigs` here —
      // `discoveredConfigs` (returned below) is the authoritative pruned
      // set. The per-agent tool context map is OK to keep populated even
      // for pruned ids: it's only read by closure in ON_TOOL_EXECUTE,
      // stale entries are unreachable at runtime.
      //
      // Handoff agents get the same `skillPrimedIdsByName` plumbing as the
      // primary so `read_file` can pin same-name collisions to the exact
      // primed doc AND relax the `disable-model-invocation: true` gate for
      // skills whose body is already in this turn's context — matters for
      // handoff agents that have their own always-apply skills bound or
      // that the user `$`-invokes within the handoff flow.
      onAgentInitialized: (agentId, agent, config) => {
        agentToolContexts.set(agentId, {
          agent,
          toolRegistry: config.toolRegistry,
          userMCPAuthMap: config.userMCPAuthMap,
          tool_resources: config.tool_resources,
          actionsEnabled: config.actionsEnabled,
          accessibleSkillIds: config.accessibleSkillIds,
          skillPrimedIdsByName: buildSkillPrimedIdsByName(
            config.manualSkillPrimes,
            config.alwaysApplySkillPrimes,
          ),
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
  /** Track skipped ids locally so repeated failures short-circuit within
   *  the subagent loading loop. Seeded from the discovery helper's skip
   *  list so agents that already failed handoff loading don't get retried. */
  const skippedAgentIds = new Set(discoveredSkippedIds ?? []);

  /** All agent ids referenced on any edge (source OR target). Used by
   *  `loadSubagentsFor` to decide whether an agent that's only a subagent
   *  can be safely dropped from `agentConfigs` — LangGraph doesn't treat
   *  pure subagents as parallel/handoff nodes. */
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

  /** Lazy per-id agent loader used for subagents that weren't reachable
   *  via the handoff edge graph (so `discoverConnectedAgents` didn't
   *  initialize them). Mirrors the helper's internal `processAgent`:
   *  DB lookup + VIEW check + `initializeAgent`, then inserts into
   *  `agentConfigs` and `agentToolContexts`. Returns `null` on any
   *  failure so the caller can skip gracefully. */
  const loadAgentById = async (agentId) => {
    if (skippedAgentIds.has(agentId)) return null;
    const existing = agentConfigs.get(agentId);
    if (existing) return existing;

    try {
      const agent = await db.getAgent({ id: agentId });
      if (!agent) {
        skippedAgentIds.add(agentId);
        return null;
      }
      const userId = req.user?.id;
      if (!userId) {
        skippedAgentIds.add(agentId);
        return null;
      }
      const hasAccess = await checkPermission({
        userId,
        role: req.user?.role,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        requiredPermission: PermissionBits.VIEW,
      });
      if (!hasAccess) {
        logger.warn(
          `[processAgent] User ${userId} lacks VIEW access to subagent ${agentId}, skipping`,
        );
        skippedAgentIds.add(agentId);
        return null;
      }
      const validation = await validateAgentModel({
        req,
        res,
        agent,
        modelsConfig,
        logViolation,
      });
      if (!validation.isValid) {
        logger.warn(
          `[processAgent] Subagent ${agentId} failed model validation: ${validation.error?.message}`,
        );
        skippedAgentIds.add(agentId);
        return null;
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
          endpointOption: { ...endpointOption, endpoint: EModelEndpoint.agents },
          allowedProviders,
          accessibleSkillIds: scopeSkillIds(
            accessibleSkillIds,
            ephemeralSkillsToggle ? undefined : agent.skills,
          ),
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
            listAlwaysApplySkills: db.listAlwaysApplySkills,
            getSkillByName: db.getSkillByName,
          },
        },
      );
      agentConfigs.set(agentId, config);
      agentToolContexts.set(agentId, {
        agent,
        toolRegistry: config.toolRegistry,
        userMCPAuthMap: config.userMCPAuthMap,
        tool_resources: config.tool_resources,
        actionsEnabled: config.actionsEnabled,
        accessibleSkillIds: config.accessibleSkillIds,
        skillPrimedIdsByName: buildSkillPrimedIdsByName(
          config.manualSkillPrimes,
          config.alwaysApplySkillPrimes,
        ),
      });
      return config;
    } catch (err) {
      logger.error(`[processAgent] Error processing subagent ${agentId}:`, err);
      skippedAgentIds.add(agentId);
      return null;
    }
  };

  /** Collected during resolution; applied to `agentConfigs` only after
   *  every config has had its subagents resolved. Eager pruning would
   *  hide pure-subagent ids from the subsequent `loadSubagentsFor`
   *  loop, which would leave *their* `subagentAgentConfigs` empty and
   *  silently break nested delegation like A → B → C where B is only
   *  a subagent of A. */
  const pureSubagentIds = new Set();

  /**
   * Loads `subagentAgentConfigs` for a single agent config. Shared
   * between the primary agent and handoff-target agents (and pure
   * subagents, transitively) so an agent used via handoff or
   * nested-subagent that has its own explicit `subagents.agent_ids`
   * gets them honored at runtime. Self-spawn works regardless (no DB
   * lookup needed). Pruning decisions are deferred to `pureSubagentIds`.
   */
  const loadSubagentsFor = async (config) => {
    const sub = config.subagents;
    if (!subagentsCapabilityEnabled || !sub?.enabled) {
      config.subagentAgentConfigs = [];
      return;
    }

    const explicitSubagentIds = Array.from(
      new Set(
        Array.isArray(sub.agent_ids)
          ? sub.agent_ids.filter((id) => typeof id === 'string' && id && id !== config.id)
          : [],
      ),
    );

    /** @type {Array<Object>} */
    const resolved = [];
    for (const subagentId of explicitSubagentIds) {
      if (skippedAgentIds.has(subagentId)) continue;

      /** Cycle guard: a configuration like A ↔ B (B lists A as its
       *  subagent) would otherwise trigger `loadAgentById` on the
       *  primary — inserting a second config for the same primary id,
       *  which downstream duplicates in the agent array. Reuse the
       *  existing primary config when a subagent ref points back at it. */
      if (subagentId === primaryConfig.id) {
        resolved.push(primaryConfig);
        continue;
      }

      const subagentConfig = await loadAgentById(subagentId);
      if (!subagentConfig) continue;

      resolved.push(subagentConfig);

      if (!edgeAgentIds.has(subagentId)) {
        pureSubagentIds.add(subagentId);
      }
    }

    config.subagentAgentConfigs = resolved;
  };

  /** BFS across the primary's subagent tree so nested chains like
   *  A → B → C get resolved before any pruning. Each config is
   *  visited once. */
  const visitedConfigIds = new Set();
  const pending = [primaryConfig];
  while (pending.length > 0) {
    const cfg = pending.shift();
    if (!cfg || visitedConfigIds.has(cfg.id)) continue;
    visitedConfigIds.add(cfg.id);
    await loadSubagentsFor(cfg);
    for (const child of cfg.subagentAgentConfigs ?? []) {
      if (child?.id && !visitedConfigIds.has(child.id)) {
        pending.push(child);
      }
    }
  }
  /** Handoff targets still in the map that weren't visited via the
   *  primary's subagent tree also need their subagents resolved. */
  for (const [id, cfg] of agentConfigs.entries()) {
    if (id === primaryConfig.id || visitedConfigIds.has(id)) continue;
    visitedConfigIds.add(id);
    await loadSubagentsFor(cfg);
    for (const child of cfg.subagentAgentConfigs ?? []) {
      if (child?.id && !visitedConfigIds.has(child.id)) {
        visitedConfigIds.add(child.id);
        await loadSubagentsFor(child);
      }
    }
  }

  /** Drop pure-subagent entries now that every reachable config has
   *  had its subagents resolved. They stay in `agentToolContexts` so
   *  their tools still execute with the right scoping. */
  for (const id of pureSubagentIds) {
    agentConfigs.delete(id);
  }

  primaryConfig.subagents = subagentsCapabilityEnabled ? primaryConfig.subagents : undefined;

  /** If the capability is off at the endpoint level, strip `subagents`
   *  on every loaded config — not just the primary — so handoff agents
   *  with `subagents.enabled: true` persisted on their document don't
   *  still expose self-spawn at runtime after an admin rollback. */
  if (!subagentsCapabilityEnabled) {
    for (const config of agentConfigs.values()) {
      config.subagents = undefined;
      config.subagentAgentConfigs = undefined;
    }
  }

  /** If the capability is off at the endpoint level, strip `subagents` on
   *  every loaded config — not just the primary. `run.ts` calls
   *  `buildSubagentConfigs` for every agent in the array, so a handoff
   *  agent with `subagents.enabled: true` persisted on its document would
   *  otherwise still expose self-spawn at runtime even though the admin
   *  has disabled the capability globally. */
  if (!subagentsCapabilityEnabled) {
    for (const config of agentConfigs.values()) {
      config.subagents = undefined;
      config.subagentAgentConfigs = undefined;
    }
  }

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
    subagentAggregatorsByToolCallId,
  });

  if (streamId) {
    GenerationJobManager.setCollectedUsage(streamId, collectedUsage);
  }

  return { client, userMCPAuthMap };
};

module.exports = { initializeClient };
