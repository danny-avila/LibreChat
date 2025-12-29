const { logger } = require('@librechat/data-schemas');
const { initializeAgent, validateAgentModel } = require('@librechat/api');
const { loadAddedAgent, setGetAgent, ADDED_AGENT_ID } = require('~/models/loadAddedAgent');
const { getConvoFiles } = require('~/models/Conversation');
const { getAgent } = require('~/models/Agent');
const db = require('~/models');

// Initialize the getAgent dependency
setGetAgent(getAgent);

/**
 * Process addedConvo for parallel agent execution.
 * Creates a parallel agent config from an added conversation.
 *
 * When an added agent has no incoming edges, it becomes a start node
 * and runs in parallel with the primary agent automatically.
 *
 * Edge cases handled:
 * - Primary agent has edges (handoffs): Added agent runs in parallel with primary,
 *   but doesn't participate in the primary's handoff graph
 * - Primary agent has agent_ids (legacy chain): Added agent runs in parallel with primary,
 *   but doesn't participate in the chain
 * - Primary agent has both: Added agent is independent, runs parallel from start
 *
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {import('express').Response} params.res
 * @param {Object} params.endpointOption - The endpoint option containing addedConvo
 * @param {Object} params.modelsConfig - The models configuration
 * @param {Function} params.logViolation - Function to log violations
 * @param {Function} params.loadTools - Function to load agent tools
 * @param {Array} params.requestFiles - Request files
 * @param {string} params.conversationId - The conversation ID
 * @param {Set} params.allowedProviders - Set of allowed providers
 * @param {Map} params.agentConfigs - Map of agent configs to add to
 * @param {string} params.primaryAgentId - The primary agent ID
 * @param {Object|undefined} params.userMCPAuthMap - User MCP auth map to merge into
 * @returns {Promise<{userMCPAuthMap: Object|undefined}>} The updated userMCPAuthMap
 */
const processAddedConvo = async ({
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
  primaryAgentId,
  primaryAgent,
  userMCPAuthMap,
}) => {
  const addedConvo = endpointOption.addedConvo;
  logger.debug('[processAddedConvo] Called with addedConvo:', {
    hasAddedConvo: addedConvo != null,
    addedConvoEndpoint: addedConvo?.endpoint,
    addedConvoModel: addedConvo?.model,
    addedConvoAgentId: addedConvo?.agent_id,
  });
  if (addedConvo == null) {
    return { userMCPAuthMap };
  }

  try {
    const addedAgent = await loadAddedAgent({ req, conversation: addedConvo, primaryAgent });
    if (!addedAgent) {
      return { userMCPAuthMap };
    }

    const addedValidation = await validateAgentModel({
      req,
      res,
      modelsConfig,
      logViolation,
      agent: addedAgent,
    });

    if (!addedValidation.isValid) {
      logger.warn(
        `[processAddedConvo] Added agent validation failed: ${addedValidation.error?.message}`,
      );
      return { userMCPAuthMap };
    }

    const addedConfig = await initializeAgent(
      {
        req,
        res,
        loadTools,
        requestFiles,
        conversationId,
        agent: addedAgent,
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
      Object.assign(userMCPAuthMap, addedConfig.userMCPAuthMap ?? {});
    } else {
      userMCPAuthMap = addedConfig.userMCPAuthMap;
    }

    const addedAgentId = addedConfig.id || ADDED_AGENT_ID;
    agentConfigs.set(addedAgentId, addedConfig);

    // No edges needed - agent without incoming edges becomes a start node
    // and runs in parallel with the primary agent automatically.
    // This is independent of any edges/agent_ids the primary agent has.

    logger.debug(
      `[processAddedConvo] Added parallel agent: ${addedAgentId} (primary: ${primaryAgentId}, ` +
        `primary has edges: ${!!endpointOption.edges}, primary has agent_ids: ${!!endpointOption.agent_ids})`,
    );

    return { userMCPAuthMap };
  } catch (err) {
    logger.error('[processAddedConvo] Error processing addedConvo for parallel agent', err);
    return { userMCPAuthMap };
  }
};

module.exports = {
  processAddedConvo,
  ADDED_AGENT_ID,
};
