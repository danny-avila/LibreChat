const { Constants, convertJsonSchemaToZod } = require('librechat-data-provider');
const { tool } = require('@langchain/core/tools');
const { logger, getMCPManager } = require('~/config');

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {ServerRequest} params.req - The name of the tool.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @param {import('@librechat/agents').Providers} params.provider - The provider for the tool.
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
      return result;
    } catch (error) {
      logger.error(`${toolName} MCP server tool call failed`, error);
      return `${toolName} MCP server tool call failed.`;
    }
  };

  const toolInstance = tool(_call, {
    name: toolKey,
    description: description || '',
    schema,
  });
  toolInstance.mcp = true;
  return toolInstance;
}

module.exports = {
  createMCPTool,
};
