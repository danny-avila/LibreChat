const { Constants, convertJsonSchemaToZod } = require('librechat-data-provider');
const { tool } = require('@langchain/core/tools');
const { logger, getMCPManager } = require('~/config');

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {ServerRequest} params.req - The name of the tool.
 * @param {string} params.toolKey - The toolKey for the tool.
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createMCPTool({ req, toolKey }) {
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
      const result = await mcpManager.callTool(serverName, toolName, toolInput);
      return (
        (result?.isError ? 'Error:\n' : '') +
          result?.content
            .map((item) => {
              if (item.type === 'text') {
                return item.text;
              }
              if (item.type === 'resource') {
                const { blob: _b, ...rest } = item.resource;
                return JSON.stringify(rest, null, 2);
              }
              return '';
            })
            .filter(Boolean)
            .join('\n\n') || '(No response)'
      );
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
