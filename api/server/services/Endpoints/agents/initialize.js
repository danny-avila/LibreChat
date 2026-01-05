const { logger } = require('@librechat/data-schemas');
const { createContentAggregator } = require('@librechat/agents');
const {
  initializeAgent,
  validateAgentModel,
  getCustomEndpointConfig,
  createSequentialChainEdges,
  createEdgeCollector,
  filterOrphanedEdges,
} = require('@librechat/api');
const {
  EModelEndpoint,
  isAgentsEndpoint,
  getResponseSender,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const {
  createToolEndCallback,
  getDefaultHandlers,
} = require('~/server/controllers/agents/callbacks');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { loadAgentTools } = require('~/server/services/ToolService');
const AgentClient = require('~/server/controllers/agents/client');
const { getConvoFiles } = require('~/models/Conversation');
const { processAddedConvo } = require('./addedConvo');
const { getAgent } = require('~/models/Agent');
const { logViolation } = require('~/cache');
const db = require('~/models');

/**
 * Creates a tool loader function for the agent.
 * @param {AbortSignal} signal - The abort signal
 * @param {string | null} [streamId] - The stream ID for resumable mode
 */
function createToolLoader(signal, streamId = null) {
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
   * tools: StructuredTool[],
   * toolContextMap: Record<string, unknown>,
   * userMCPAuthMap?: Record<string, Record<string, string>>
   * } | undefined>}
   */
  return async function loadTools({ req, res, agentId, tools, provider, model, tool_resources }) {
    const agent = { id: agentId, tools, provider, model };
    try {
      return await loadAgentTools({
        req,
        res,
        agent,
        signal,
        tool_resources,
        streamId,
      });
    } catch (error) {
      logger.error('Error loading tools for agent ' + agentId, error);
    }
  };
}

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
  const eventHandlers = getDefaultHandlers({
    res,
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

  const loadTools = createToolLoader(signal, streamId);
  /** @type {Array<MongoFile>} */
  const requestFiles = req.body.files ?? [];
  /** @type {string} */
  const conversationId = req.body.conversationId;

  const primaryConfig = await initializeAgent(
    {
      req,
      res,
      loadTools,
      requestFiles,
      conversationId,
      agent: primaryAgent,
      endpointOption,
      allowedProviders,
      isInitialAgent: true,
    },
    {
      getConvoFiles,
      getFiles: db.getFiles,
      getUserKey: db.getUserKey,
      updateFilesUsage: db.updateFilesUsage,
      getUserKeyValues: db.getUserKeyValues,
      getToolFilesByIds: db.getToolFilesByIds,
    },
  );

  const agent_ids = primaryConfig.agent_ids;
  let userMCPAuthMap = primaryConfig.userMCPAuthMap;

  /** @type {Set<string>} Track agents that failed to load (orphaned references) */
  const skippedAgentIds = new Set();

  async function processAgent(agentId) {
    const agent = await getAgent({ id: agentId });
    if (!agent) {
      logger.warn(
        `[processAgent] Handoff agent ${agentId} not found, skipping (orphaned reference)`,
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
        endpointOption,
        allowedProviders,
      },
      {
        getConvoFiles,
        getFiles: db.getFiles,
        getUserKey: db.getUserKey,
        updateFilesUsage: db.updateFilesUsage,
        getUserKeyValues: db.getUserKeyValues,
        getToolFilesByIds: db.getToolFilesByIds,
      },
    );
    if (userMCPAuthMap != null) {
      Object.assign(userMCPAuthMap, config.userMCPAuthMap ?? {});
    } else {
      userMCPAuthMap = config.userMCPAuthMap;
    }
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
    }
  }

  /** @deprecated Agent Chain */
  if (agent_ids?.length) {
    for (const agentId of agent_ids) {
      if (checkAgentInit(agentId)) {
        continue;
      }
      await processAgent(agentId);
    }
    const chain = await createSequentialChainEdges([primaryConfig.id].concat(agent_ids), '{convo}');
    collectEdges(chain);
  }

  let edges = Array.from(edgeMap.values());

  /** Multi-Convo: Process addedConvo for parallel agent execution */
  const { userMCPAuthMap: updatedMCPAuthMap } = await processAddedConvo({
    req,
    res,
    endpointOption,
    modelsConfig,
    logViolation,
    loadTools,
    requestFiles,
    conversationId,
    allowedProviders,
    agentConfigs,
    primaryAgentId: primaryConfig.id,
    primaryAgent,
    userMCPAuthMap,
  });

  if (updatedMCPAuthMap) {
    userMCPAuthMap = updatedMCPAuthMap;
  }

  // Ensure edges is an array when we have multiple agents (multi-agent mode)
  // MultiAgentGraph.categorizeEdges requires edges to be iterable
  if (agentConfigs.size > 0 && !edges) {
    edges = [];
  }

  // Filter out edges referencing non-existent agents (orphaned references)
  edges = filterOrphanedEdges(edges, skippedAgentIds);

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
    agent: primaryConfig,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    attachments: primaryConfig.attachments,
    endpointType: endpointOption.endpointType,
    resendFiles: primaryConfig.resendFiles ?? true,
    maxContextTokens: primaryConfig.maxContextTokens,
    endpoint: isEphemeralAgentId(primaryConfig.id) ? primaryConfig.endpoint : EModelEndpoint.agents,
  });

  return { client, userMCPAuthMap };
};

module.exports = { initializeClient };
