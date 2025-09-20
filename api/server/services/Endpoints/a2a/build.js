const { removeNullishValues } = require('librechat-data-provider');

/**
 * Build options for A2A (Agent-to-Agent) protocol endpoints
 * A2A is for external agent communication, not LibreChat's internal agents
 */
const buildOptions = (endpoint, parsedBody, endpointType) => {
  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    fileTokenLimit,
    resendFiles = false,
    iconURL,
    greeting,
    spec,
    agent_id,        // A2A agent identifier
    instructions,
    ...modelOptions
  } = parsedBody;

  return removeNullishValues({
    endpoint,
    endpointType,
    modelLabel,
    promptPrefix,
    resendFiles,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    fileTokenLimit,
    agent_id,
    instructions,
    modelOptions,
  });
};

module.exports = buildOptions;