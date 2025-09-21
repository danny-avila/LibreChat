const { EModelEndpoint } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const discoveryService = require('../../A2ADiscoveryService');

/**
 * Initialize A2A agent for use with LibreChat's agents system
 * @param {Object} params
 * @param {Object} params.req - Request object
 * @param {Object} params.res - Response object  
 * @param {Object} params.endpointOption - Endpoint configuration
 * @returns {Object} A2A agent configuration
 */
const initializeA2AAgent = async ({ req, res, endpointOption }) => {
  const { model } = endpointOption;
  
  // Extract agent ID from the model field (A2A agents are represented as models)
  const agentId = model || 'a2a-mock-langchain-a2a-agent-57cd14df';
  
  // Get the A2A agent details
  const agent = discoveryService.getAgent(agentId);
  if (!agent) {
    throw new Error(`A2A agent not found: ${agentId}`);
  }
  
  // Check agent status
  if (agent.status !== 'online') {
    throw new Error(`A2A agent is not available. Status: ${agent.status}`);
  }
  
  // Get the A2A client
  const a2aClient = discoveryService.getClient(agentId);
  if (!a2aClient) {
    throw new Error(`A2A client not available for agent: ${agentId}`);
  }
  
  logger.info(`Initialized A2A agent: ${agent.name} (${agentId})`);
  
  // Return agent configuration compatible with LibreChat's agents system
  return {
    id: agentId,
    name: agent.name,
    description: agent.description,
    endpoint: EModelEndpoint.a2a,
    model: agentId,
    provider: 'a2a',
    a2aClient: a2aClient,
    a2aAgent: agent,
    // Agent capabilities
    tools: [],
    tool_resources: {},
    attachments: [],
    resendFiles: true,
    maxContextTokens: 100000, // Default context window
  };
};

module.exports = {
  initializeA2AAgent,
};