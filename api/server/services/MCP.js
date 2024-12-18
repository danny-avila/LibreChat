const { tool } = require('@langchain/core/tools');
const { Constants: AgentConstants } = require('@librechat/agents');
const {
  Constants,
  convertJsonSchemaToZod,
  isAssistantsEndpoint,
} = require('librechat-data-provider');
const { logger, getMCPManager } = require('~/config');

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {ServerRequest} params.req - The name of the tool.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @param {import('@librechat/agents').Providers | EModelEndpoint} params.provider - The provider for the tool.
 * @param {string} params.model - The model for the tool.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({ req, toolKey, provider }) {
  const toolDefinition = req.app.locals.availableTools[toolKey]?.function;
  if (!toolDefinition) {
    logger.error(`Tool ${toolKey} not found in available tools`);
    return null;
  }
  /** @type {LCTool} */
  const { description, parameters } = toolDefinition;
  const schema = convertJsonSchemaToZod(parameters);
  const [toolName, serverName] = toolKey.split(Constants.mcp_delimiter);
  /** @type {(toolInput: Object | string) => Promise<unknown>} */
  const _call = async (toolInput) => {
    try {
      const mcpManager = await getMCPManager();
      const result = await mcpManager.callTool(serverName, toolName, provider, toolInput);
      if (isAssistantsEndpoint(provider) && Array.isArray(result)) {
        return result[0];
      }
      return result;
    } catch (error) {
      logger.error(`${toolName} MCP server tool call failed`, error);
      return `${toolName} MCP server tool call failed.`;
    }
  };

  const toolInstance = tool(_call, {
    schema,
    name: toolKey,
    description: description || '',
    responseFormat: AgentConstants.CONTENT_AND_ARTIFACT,
  });
  toolInstance.mcp = true;
  return toolInstance;
}

module.exports = {
  createMCPTool,
};
