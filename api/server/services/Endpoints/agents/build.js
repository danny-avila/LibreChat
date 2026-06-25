const { logger } = require('@librechat/data-schemas');
const { loadAgent: loadAgentFn } = require('@librechat/api');
const { isAgentsEndpoint, removeNullishValues, Constants } = require('librechat-data-provider');
const { getMCPServerTools } = require('~/server/services/Config');
const db = require('~/models');

const loadAgent = (params) => loadAgentFn(params, { getAgent: db.getAgent, getMCPServerTools });

const buildOptions = (req, endpoint, parsedBody, endpointType) => {
  const { spec, iconURL, agent_id, ...model_parameters } = parsedBody;
  const agentPromise = loadAgent({
    req,
    spec,
    // On the agents endpoint an empty agent_id means an ephemeral (model-spec)
    // run — a new chat's first message carries no concrete agent id — so default
    // to EPHEMERAL_AGENT_ID. Without this, loadAgent treats '' as a saved-agent
    // lookup and throws "Agent not found". Non-agents endpoints always ephemeral.
    agent_id: isAgentsEndpoint(endpoint) && agent_id ? agent_id : Constants.EPHEMERAL_AGENT_ID,
    endpoint,
    model_parameters,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  /** @type {import('librechat-data-provider').TConversation | undefined} */
  const addedConvo = req.body?.addedConvo;

  return removeNullishValues({
    spec,
    iconURL,
    endpoint,
    agent_id,
    endpointType,
    model_parameters,
    agent: agentPromise,
    addedConvo,
  });
};

module.exports = { buildOptions };
