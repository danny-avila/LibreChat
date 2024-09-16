const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { availableTools } = require('../');
const { logger } = require('~/config');

/**
 * Loads a suite of tools with authentication values for a given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {Object} params Parameters for loading the tool suite.
 * @param {string} params.pluginKey Key identifying the plugin whose tools are to be loaded.
 * @param {Array<Function>} params.tools Array of tool constructor functions.
 * @param {Object} params.user User object for whom the tools are being loaded.
 * @param {Object} [params.options={}] Optional parameters to be passed to each tool constructor.
 * @returns {Promise<Array>} A promise that resolves to an array of instantiated tools.
 */
const loadToolSuite = async ({ pluginKey, tools, user, options = {} }) => {
  const authConfig = availableTools.find((tool) => tool.pluginKey === pluginKey).authConfig;
  const suite = [];
  const authValues = {};

  const findAuthValue = async (authField) => {
    const fields = authField.split('||');
    for (const field of fields) {
      let value = process.env[field];
      if (value) {
        return value;
      }
      try {
        value = await getUserPluginAuthValue(user, field);
        if (value) {
          return value;
        }
      } catch (err) {
        logger.error(`Error fetching plugin auth value for ${field}: ${err.message}`);
      }
    }
    return null;
  };

  for (const auth of authConfig) {
    const authValue = await findAuthValue(auth.authField);
    if (authValue !== null) {
      authValues[auth.authField] = authValue;
    } else {
      logger.warn(`[loadToolSuite] No auth value found for ${auth.authField}`);
    }
  }

  for (const tool of tools) {
    suite.push(
      new tool({
        ...authValues,
        ...options,
      }),
    );
  }

  return suite;
};

module.exports = {
  loadToolSuite,
};
