const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');

function getApiKey(envVar, override) {
  const key = getEnvironmentVariable(envVar);
  if (!key && !override) {
    throw new Error(`Missing ${envVar} environment variable.`);
  }
  return key;
}

module.exports = {
  getApiKey,
};
