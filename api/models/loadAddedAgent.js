const { logger } = require('@librechat/data-schemas');
const { getCustomEndpointConfig } = require('@librechat/api');
const {
  Tools,
  Constants,
  isAgentsEndpoint,
  isEphemeralAgentId,
  appendAgentIdSuffix,
  encodeEphemeralAgentId,
} = require('librechat-data-provider');
const { getMCPServerTools } = require('~/server/services/Config');

const { mcp_all, mcp_delimiter } = Constants;

/**
 * Constant for added conversation agent ID
 */
const ADDED_AGENT_ID = 'added_agent';

const runtimeToolOverrides = [
  { ephemeralKey: 'execute_code', modelSpecKey: 'executeCode', tool: Tools.execute_code },
  { ephemeralKey: 'file_search', modelSpecKey: 'fileSearch', tool: Tools.file_search },
  { ephemeralKey: 'web_search', modelSpecKey: 'webSearch', tool: Tools.web_search },
];

const extractMCPServerNames = (tools) => {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }

  const serverNames = new Set();
  for (const tool of tools) {
    if (!tool || !tool.includes(mcp_delimiter)) {
      continue;
    }
    const parts = tool.split(mcp_delimiter);
    if (parts.length >= 2) {
      serverNames.add(parts[parts.length - 1]);
    }
  }

  return Array.from(serverNames);
};

async function buildRuntimeTools({
  baseTools = [],
  userId,
  ephemeralAgent,
  modelSpec,
}) {
  const tools = new Set(baseTools ?? []);

  for (const { ephemeralKey, modelSpecKey, tool } of runtimeToolOverrides) {
    const overrideValue = ephemeralAgent?.[ephemeralKey];
    if (overrideValue === false) {
      tools.delete(tool);
      continue;
    }
    if (overrideValue === true || modelSpec?.[modelSpecKey] === true) {
      tools.add(tool);
    }
  }

  const hasMCPOverride = Array.isArray(ephemeralAgent?.mcp);
  const mcpServers = hasMCPOverride
    ? new Set(ephemeralAgent.mcp)
    : new Set(extractMCPServerNames(baseTools));

  if (modelSpec?.mcpServers) {
    for (const mcpServer of modelSpec.mcpServers) {
      mcpServers.add(mcpServer);
    }
  }

  if (hasMCPOverride) {
    for (const tool of Array.from(tools)) {
      if (tool.includes(mcp_delimiter)) {
        tools.delete(tool);
      }
    }
  }

  const addedServers = new Set();
  for (const mcpServer of mcpServers) {
    if (addedServers.has(mcpServer)) {
      continue;
    }
    const serverTools = await getMCPServerTools(userId, mcpServer);
    if (!serverTools) {
      tools.add(`${mcp_all}${mcp_delimiter}${mcpServer}`);
      addedServers.add(mcpServer);
      continue;
    }
    for (const toolName of Object.keys(serverTools)) {
      tools.add(toolName);
    }
    addedServers.add(mcpServer);
  }

  return Array.from(tools);
}

/**
 * Get an agent document based on the provided ID.
 * @param {Object} searchParameter - The search parameters to find the agent.
 * @param {string} searchParameter.id - The ID of the agent.
 * @returns {Promise<import('librechat-data-provider').Agent|null>}
 */
let getAgent;

/**
 * Set the getAgent function (dependency injection to avoid circular imports)
 * @param {Function} fn
 */
const setGetAgent = (fn) => {
  getAgent = fn;
};

/**
 * Load an agent from an added conversation (TConversation).
 * Used for multi-convo parallel agent execution.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {import('librechat-data-provider').TConversation} params.conversation - The added conversation
 * @param {import('librechat-data-provider').Agent} [params.primaryAgent] - The primary agent (used to duplicate tools when both are ephemeral)
 * @returns {Promise<import('librechat-data-provider').Agent|null>} The agent config as a plain object, or null if invalid.
 */
const loadAddedAgent = async ({ req, conversation, primaryAgent }) => {
  if (!conversation) {
    return null;
  }

  const spec = conversation.spec;

  // If there's an agent_id, load the existing agent
  if (conversation.agent_id && !isEphemeralAgentId(conversation.agent_id)) {
    if (!getAgent) {
      throw new Error('getAgent not initialized - call setGetAgent first');
    }
    const agent = await getAgent({
      id: conversation.agent_id,
    });

    if (!agent) {
      logger.warn(`[loadAddedAgent] Agent ${conversation.agent_id} not found`);
      return null;
    }

    agent.version = agent.versions ? agent.versions.length : 0;
    const ephemeralAgent = conversation.ephemeralAgent;
    const modelSpecs = req.config?.modelSpecs?.list;
    const modelSpec =
      spec != null && spec !== '' ? modelSpecs?.find((modelSpec) => modelSpec.name === spec) : null;

    agent.tools = await buildRuntimeTools({
      modelSpec,
      ephemeralAgent,
      userId: req.user?.id,
      baseTools: agent.tools ?? [],
    });

    if (ephemeralAgent?.artifacts !== undefined) {
      if (ephemeralAgent.artifacts) {
        agent.artifacts = ephemeralAgent.artifacts;
      } else {
        delete agent.artifacts;
      }
    }

    // Append suffix to distinguish from primary agent (matches ephemeral format)
    // This is needed when both agents have the same ID or for consistent parallel content attribution
    agent.id = appendAgentIdSuffix(agent.id, 1);
    return agent;
  }

  // Otherwise, create an ephemeral agent config from the conversation
  const { model, endpoint, promptPrefix, ...rest } = conversation;

  if (!endpoint || !model) {
    logger.warn('[loadAddedAgent] Missing required endpoint or model for ephemeral agent');
    return null;
  }

  // If both primary and added agents are ephemeral, duplicate tools from primary agent
  const primaryIsEphemeral = primaryAgent && isEphemeralAgentId(primaryAgent.id);
  if (primaryIsEphemeral && Array.isArray(primaryAgent.tools)) {
    // Get endpoint config and model spec for display name fallbacks
    const appConfig = req.config;
    let endpointConfig = appConfig?.endpoints?.[endpoint];
    if (!isAgentsEndpoint(endpoint) && !endpointConfig) {
      try {
        endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
      } catch (err) {
        logger.error('[loadAddedAgent] Error getting custom endpoint config', err);
      }
    }

    // Look up model spec for label fallback
    const modelSpecs = appConfig?.modelSpecs?.list;
    const modelSpec = spec != null && spec !== '' ? modelSpecs?.find((s) => s.name === spec) : null;

    // For ephemeral agents, use modelLabel if provided, then model spec's label,
    // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
    const sender = rest.modelLabel ?? modelSpec?.label ?? endpointConfig?.modelDisplayLabel ?? '';

    const ephemeralId = encodeEphemeralAgentId({ endpoint, model, sender, index: 1 });

    return {
      id: ephemeralId,
      instructions: promptPrefix || '',
      provider: endpoint,
      model_parameters: {},
      model,
      tools: [...primaryAgent.tools],
    };
  }

  // Extract ephemeral agent options from conversation if present
  const ephemeralAgent = rest.ephemeralAgent;
  const userId = req.user?.id;

  // Check model spec for MCP servers
  const modelSpecs = req.config?.modelSpecs?.list;
  let modelSpec = null;
  if (spec != null && spec !== '') {
    modelSpec = modelSpecs?.find((s) => s.name === spec) || null;
  }
  const tools = await buildRuntimeTools({
    userId,
    modelSpec,
    ephemeralAgent,
    baseTools: [],
  });

  // Build model_parameters from conversation fields
  const model_parameters = {};
  const paramKeys = [
    'temperature',
    'top_p',
    'topP',
    'topK',
    'presence_penalty',
    'frequency_penalty',
    'maxOutputTokens',
    'maxTokens',
    'max_tokens',
  ];

  for (const key of paramKeys) {
    if (rest[key] != null) {
      model_parameters[key] = rest[key];
    }
  }

  // Get endpoint config for modelDisplayLabel fallback
  const appConfig = req.config;
  let endpointConfig = appConfig?.endpoints?.[endpoint];
  if (!isAgentsEndpoint(endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
    } catch (err) {
      logger.error('[loadAddedAgent] Error getting custom endpoint config', err);
    }
  }

  // For ephemeral agents, use modelLabel if provided, then model spec's label,
  // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
  const sender = rest.modelLabel ?? modelSpec?.label ?? endpointConfig?.modelDisplayLabel ?? '';

  /** Encoded ephemeral agent ID with endpoint, model, sender, and index=1 to distinguish from primary */
  const ephemeralId = encodeEphemeralAgentId({ endpoint, model, sender, index: 1 });

  const result = {
    id: ephemeralId,
    instructions: promptPrefix || '',
    provider: endpoint,
    model_parameters,
    model,
    tools,
  };

  if (ephemeralAgent?.artifacts != null && ephemeralAgent.artifacts) {
    result.artifacts = ephemeralAgent.artifacts;
  }

  return result;
};

module.exports = {
  ADDED_AGENT_ID,
  loadAddedAgent,
  setGetAgent,
};
