const { getUserPluginAuthValue } = require('../../../../server/services/PluginService');
const { availableTools } = require('../');

const loadToolSuite = async ({ pluginKey, tools, user, model, openAIApiKey, options }) => {
  const authConfig = availableTools.find((tool) => tool.pluginKey === pluginKey).authConfig;
  const suite = [];
  const authValues = {};

  for (const auth of authConfig) {
    let authValue = process.env[auth.authField];
    if (!authValue) {
      authValue = await getUserPluginAuthValue(user, auth.authField);
    }
    authValues[auth.authField] = authValue;
  }

  for (const tool of tools) {
    suite.push(
      new tool({
        ...authValues,
        ...options,
        model,
        openAIApiKey,
      }),
    );
  }

  return suite;
};

module.exports = {
  loadToolSuite,
};
