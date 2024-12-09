const { loadAgent } = require('~/models/Agent');
const { logger } = require('~/config');

const buildOptions = (req, endpoint, parsedBody) => {
  const {
    agent_id,
    instructions,
    spec,
    maxContextTokens,
    resendFiles = true,
    ...model_parameters
  } = parsedBody;
  const agentPromise = loadAgent({
    req,
    agent_id,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  const endpointOption = {
    spec,
    endpoint,
    agent_id,
    resendFiles,
    instructions,
    maxContextTokens,
    model_parameters,
    agent: agentPromise,
  };

  return endpointOption;
};

module.exports = { buildOptions };
