const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { Constants: AgentConstants } = require('@librechat/agents');
const { Constants, ContentTypes } = require('librechat-data-provider');
const { normalizeServerName, convertWithResolvedRefs } = require('@librechat/api');
const OpenAPIParser = require('./OpenAPIParser');
const APIToolExecutor = require('./APIToolExecutor');
const { getMCPServersRegistry } = require('~/config');

/**
 * Create API-based tools for a given API Registry server
 * @param {Object} params
 * @param {string} params.serverName - API Registry server name
 * @param {string} params.userId - User ID
 * @param {Object} [params.userMCPAuthMap] - User authentication map
 * @returns {Promise<Array>} Array of tool instances
 */
async function createAPITools({ serverName, userId, userMCPAuthMap }) {
  try {
    logger.info(`[APIRegistry] Creating tools for server: ${serverName}`);

    const registry = getMCPServersRegistry();
    const config = await registry.getServerConfig(serverName, userId);

    if (!config || !config.apiConfig) {
      logger.warn(`[APIRegistry] Server ${serverName} is not an API registry`);
      return [];
    }

    const tools = [];
    const { apiConfig } = config;

    // Generate a tool for each selected endpoint
    for (const [endpointKey, endpoint] of Object.entries(apiConfig.endpoints || {})) {
      const toolDef = OpenAPIParser.endpointToToolDefinition(serverName, endpointKey, endpoint);
      
      const toolInstance = createAPIToolInstance({
        serverName,
        toolDef,
        userId,
        userMCPAuthMap,
      });

      if (toolInstance) {
        tools.push(toolInstance);
      }
    }

    logger.info(`[APIRegistry] Created ${tools.length} tools for ${serverName}`);
    return tools;
  } catch (error) {
    logger.error(`[APIRegistry] Error creating tools for ${serverName}:`, error);
    return [];
  }
}

/**
 * Create a single API tool instance
 * @param {Object} params
 * @param {string} params.serverName - API Registry server name
 * @param {Object} params.toolDef - Tool definition
 * @param {string} params.userId - User ID
 * @param {Object} [params.userMCPAuthMap] - User authentication map
 * @returns {Object} Tool instance
 */
function createAPIToolInstance({ serverName, toolDef, userId, userMCPAuthMap }) {
  try {
    // Convert tool input schema to Zod schema
    let schema;
    try {
      schema = convertWithResolvedRefs(toolDef.inputSchema, {
        allowEmptyObject: true,
        transformOneOfAnyOf: true,
      });
    } catch (error) {
      logger.warn(`[APIRegistry] Failed to convert schema for ${toolDef.name}, using fallback`);
      schema = z.object({ input: z.string().optional() });
    }

    const normalizedToolKey = `${toolDef.name}${Constants.mcp_delimiter}${normalizeServerName(serverName)}`;

    /**
     * Tool execution function
     * @param {Object} toolArguments - Tool input arguments
     * @param {Object} config - Runtime configuration
     * @returns {Promise<any>} Tool execution result
     */
    const _call = async (toolArguments, config) => {
      const runtimeUserId = config?.configurable?.user?.id || config?.configurable?.user_id || userId;
      
      try {
        logger.debug(`[APIRegistry] Executing tool: ${toolDef.name}`);

        // Get custom user vars from config
        const customUserVars =
          config?.configurable?.userMCPAuthMap?.[`${Constants.api_registry_prefix}${serverName}`] ||
          userMCPAuthMap?.[`${Constants.api_registry_prefix}${serverName}`];

        // Execute the API call
        const result = await APIToolExecutor.executeTool({
          serverName,
          toolName: toolDef.name,
          toolArguments,
          userId: runtimeUserId,
          customUserVars,
        });

        // Format result based on content type
        if (typeof result === 'object') {
          return JSON.stringify(result, null, 2);
        }
        
        return result;
      } catch (error) {
        logger.error(`[APIRegistry] Error executing tool ${toolDef.name}:`, error);
        throw new Error(
          `[API][${serverName}][${toolDef.name}] API call failed${error?.message ? `: ${error?.message}` : '.'}`,
        );
      }
    };

    // Create the tool instance
    const toolInstance = tool(_call, {
      schema,
      name: normalizedToolKey,
      description: toolDef.description || '',
      responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
    });

    // Mark as API-based tool
    toolInstance.api = true;
    toolInstance.apiServerName = serverName;
    toolInstance.apiMetadata = toolDef.metadata;

    return toolInstance;
  } catch (error) {
    logger.error(`[APIRegistry] Error creating tool instance for ${toolDef.name}:`, error);
    return null;
  }
}

/**
 * Check if a server is an API Registry server
 * @param {Object} config - Server configuration
 * @returns {boolean}
 */
function isAPIRegistryServer(config) {
  return !!(config && config.apiConfig);
}

/**
 * Get all API tools for a user
 * @param {string} userId - User ID
 * @param {Object} [userMCPAuthMap] - User authentication map
 * @returns {Promise<Object>} Map of tool key to tool instance
 */
async function getAllAPITools(userId, userMCPAuthMap) {
  try {
    const registry = getMCPServersRegistry();
    const allConfigs = await registry.getAllServerConfigs(userId);

    const allTools = {};

    for (const [serverName, config] of Object.entries(allConfigs || {})) {
      if (isAPIRegistryServer(config)) {
        const tools = await createAPITools({
          serverName,
          userId,
          userMCPAuthMap,
        });

        for (const tool of tools) {
          allTools[tool.name] = tool;
        }
      }
    }

    return allTools;
  } catch (error) {
    logger.error('[APIRegistry] Error getting all API tools:', error);
    return {};
  }
}

module.exports = {
  createAPITools,
  createAPIToolInstance,
  isAPIRegistryServer,
  getAllAPITools,
  OpenAPIParser,
  APIToolExecutor,
};