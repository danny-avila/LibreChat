const { logger } = require('@librechat/data-schemas');
const { getUserMCPAuthMap } = require('@librechat/api');

/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {GenericTool[]} [params.tools]
 * @param {import('@librechat/data-schemas').PluginAuthMethods['findPluginAuthsByKeys']} params.findPluginAuthsByKeys
 * @returns {Promise<Record<string, Record<string, string>> | undefined>}
 */
async function getMCPAuthMap({ userId, tools, findPluginAuthsByKeys }) {
  try {
    if (!tools || tools.length === 0) {
      return;
    }
    return await getUserMCPAuthMap({
      tools,
      userId,
      findPluginAuthsByKeys,
    });
  } catch (err) {
    logger.error(
      `[api/server/controllers/agents/client.js #chatCompletion] Error getting custom user vars for agent`,
      err,
    );
  }
}

module.exports = {
  getMCPAuthMap,
};
