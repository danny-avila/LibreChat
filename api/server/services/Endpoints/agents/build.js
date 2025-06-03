const { isAgentsEndpoint, Constants } = require('librechat-data-provider');
const { loadAgent } = require('~/models/Agent');
const { logger } = require('~/config');

const buildOptions = (req, endpoint, parsedBody, endpointType) => {
  const { spec, iconURL, agent_id, instructions, maxContextTokens, ...model_parameters } =
    parsedBody;
  const agentPromise = loadAgent({
    req,
    agent_id: isAgentsEndpoint(endpoint) ? agent_id : Constants.EPHEMERAL_AGENT_ID,
    endpoint,
    model_parameters,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  const endpointOption = {
    spec,
    iconURL,
    endpoint,
    agent_id,
    endpointType,
    instructions,
    maxContextTokens,
    model_parameters,
    agent: agentPromise,
  };

  return endpointOption;
};

module.exports = { buildOptions };
