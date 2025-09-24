/**
 * Patches the @librechat/agents package to use our custom ChatOpenRouter
 * This ensures agents use our implementation with auto-router detection
 */
const { logger } = require('~/config');

function patchAgentsPackage() {
  try {
    // Get the @librechat/agents module
    const agentsModule = require.cache[require.resolve('@librechat/agents')];
    if (!agentsModule) {
      logger.warn('[OpenRouter Patch] @librechat/agents module not found in cache');
      return;
    }

    // Get our custom ChatOpenRouter
    const CustomChatOpenRouter = require('~/app/clients/llm/ChatOpenRouter');

    // Find and replace the ChatOpenRouter export
    if (agentsModule.exports.ChatOpenRouter) {
      logger.info('[OpenRouter Patch] Replacing @librechat/agents ChatOpenRouter with custom implementation');
      agentsModule.exports.ChatOpenRouter = CustomChatOpenRouter;
    }

    // Also patch any nested modules that might have it
    const agentsPath = require.resolve('@librechat/agents');
    const agentsDir = agentsPath.substring(0, agentsPath.lastIndexOf('/'));

    // Look for the specific OpenRouter module in the agents package
    try {
      const openrouterModulePath = require.resolve('@librechat/agents/dist/cjs/llm/openrouter');
      const openrouterModule = require.cache[openrouterModulePath];
      if (openrouterModule && openrouterModule.exports.ChatOpenRouter) {
        logger.info('[OpenRouter Patch] Replacing nested ChatOpenRouter in agents/llm/openrouter');
        openrouterModule.exports.ChatOpenRouter = CustomChatOpenRouter;
      }
    } catch (e) {
      // Module might not exist in this structure
    }

    logger.info('[OpenRouter Patch] Successfully patched @librechat/agents to use custom ChatOpenRouter');
  } catch (error) {
    logger.error('[OpenRouter Patch] Failed to patch @librechat/agents:', error);
  }
}

module.exports = { patchAgentsPackage };