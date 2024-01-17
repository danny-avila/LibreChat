const fs = require('fs');
const path = require('path');
const { StructuredTool } = require('langchain/tools');
const { ContentTypes } = require('librechat-data-provider');
const { Calculator } = require('langchain/tools/calculator');
const { TavilySearchResults } = require('@langchain/community/tools/tavily_search');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { loadTools } = require('~/app/clients/tools/util');

/**
 * Loads and formats tools from the specified tool directory.
 *
 * The directory is scanned for JavaScript files, excluding any files in the filter set.
 * For each file, it attempts to load the file as a module and instantiate a class, if it's a subclass of `StructuredTool`.
 * Each tool instance is then formatted to be compatible with the OpenAI Assistant.
 * Additionally, instances of LangChain Tools are included in the result.
 *
 * @param {object} params - The parameters for the function.
 * @param {string} params.directory - The directory path where the tools are located.
 * @param {Set<string>} [params.filter=new Set()] - A set of filenames to exclude from loading.
 * @returns {Record<string, FunctionTool>} An object mapping each tool's plugin key to its instance.
 */
function loadAndFormatTools({ directory, filter = new Set() }) {
  const tools = [];
  /* Structured Tools Directory */
  const files = fs.readdirSync(directory);

  for (const file of files) {
    if (file.endsWith('.js') && !filter.has(file)) {
      const filePath = path.join(directory, file);
      let ToolClass = null;
      try {
        ToolClass = require(filePath);
      } catch (error) {
        console.error(`Error loading tool from ${filePath}:`, error);
        continue;
      }

      if (!ToolClass) {
        continue;
      }

      if (ToolClass.prototype instanceof StructuredTool) {
        const toolInstance = new ToolClass({ override: true });
        const formattedTool = formatToOpenAIAssistantTool(toolInstance);
        tools.push(formattedTool);
      }
    }
  }

  const basicToolInstances = [new Calculator()];

  if (process.env.TAVILY_API_KEY) {
    basicToolInstances.push(new TavilySearchResults());
  }

  for (const toolInstance of basicToolInstances) {
    const formattedTool = formatToOpenAIAssistantTool(toolInstance);
    tools.push(formattedTool);
  }

  return tools.reduce((map, tool) => {
    map[tool.function.name] = tool;
    return map;
  }, {});
}

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
 * @param {OpenAIClient} openai - OpenAI Client.
 * @param {Action[]} actions - The actions to submit outputs for.
 * @returns {Promise<ToolOutputs>} The outputs of the tools.
 *
 */
async function processActions(openai, actions) {
  console.log('Processing actions...');
  console.dir(actions, { depth: null });
  const tools = actions.map((action) => action.tool);
  const loadedTools = await loadTools({
    user: openai.req.user.id,
    model: openai.req.body.model ?? 'gpt-3.5-turbo-1106',
    tools,
    functions: true,
    options: {
      openAIApiKey: openai.apiKey,
      fileStrategy: openai.req.app.locals.fileStrategy,
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
        const toolCall = {
          function: {
            name: action.tool,
            arguments: JSON.stringify(action.toolInput),
            output,
          },
          id: action.toolCallId,
          type: 'function',
          progress: 1,
        };
        openai.seenToolCalls.set(toolCall.id, toolCall);
        openai.addContentData({
          [ContentTypes.TOOL_CALL]: toolCall,
          index: openai.mappedOrder.get(action.toolCallId),
          type: ContentTypes.TOOL_CALL,
          // TODO: to append tool properties to stream, pass metadata rest to addContentData
          // result: tool.result,
        });
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
  loadAndFormatTools,
  processActions,
};
