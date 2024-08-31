const { getAgent } = require('~/models/Agent');
const { logger } = require('~/config');

const buildOptions = (req, endpoint, parsedBody) => {
  const { agent_id, instructions, spec, ...rest } = parsedBody;

  const agentPromise = getAgent({
    id: agent_id,
    // TODO: better author handling
    author: req.user.id,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  const endpointOption = {
    agent: agentPromise,
    endpoint,
    agent_id,
    instructions,
    spec,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = { buildOptions };
