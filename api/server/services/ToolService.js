const { zodToJsonSchema } = require('zod-to-json-schema');
const { loadTools } = require('~/app/clients/tools/util');

/**
 * Formats a `StructuredTool` instance into a format that is compatible
 * with OpenAI's ChatCompletionFunctions. It uses the `zodToJsonSchema`
 * function to convert the schema of the `StructuredTool` into a JSON
 * schema, which is then used as the parameters for the OpenAI function.
 *
 * @param {StructuredTool} tool - The StructuredTool to format.
 * @returns {FunctionTool} The OpenAI Assistant Tool.
 */
function formatToOpenAIAssistantTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  };
}

/**
 * Processes return required actions from run.
 *
 * @param {Express.Request} req - The Express Request object.
 * @param {Action[]} actions - The actions to submit outputs for.
 * @returns {Promise<ToolOutputs>} The outputs of the tools.
 *
 */
async function processActions(req, actions) {
  console.dir(actions, { depth: null });
  const tools = actions.map((action) => action.tool);
  const loadedTools = await loadTools({
    user: req.user.id,
    model: req.body.model ?? 'gpt-3.5-turbo-1106',
    tools,
    functions: true,
    options: {
      openAIApiKey: process.env.OPENAI_API_KEY,
    },
  });

  const ToolMap = loadedTools.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {});

  const promises = [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const tool = ToolMap[action.tool];
    if (!tool) {
      throw new Error(`Tool ${action.tool} not found.`);
    }

    try {
      const promise = tool._call(action.toolInput).then((output) => {
        actions[i].output = output;
        return {
          tool_call_id: action.toolCallId,
          output,
        };
      });
      promises.push(promise);
    } catch (error) {
      console.error(error);
      promises.push(
        Promise.resolve({
          tool_call_id: action.toolCallId,
          error: error.message,
        }),
      );
    }
  }

  return {
    tool_outputs: await Promise.all(promises),
  };
}

module.exports = {
  formatToOpenAIAssistantTool,
  processActions,
};
