const fs = require('fs');
const path = require('path');
const { StructuredTool } = require('langchain/tools');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { Calculator } = require('langchain/tools/calculator');
const { ContentTypes, imageGenTools } = require('librechat-data-provider');
const { TavilySearchResults } = require('@langchain/community/tools/tavily_search');
const { loadTools } = require('~/app/clients/tools/util');
const { sleep } = require('./Runs/handle');
const { logger } = require('~/config');

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
        logger.error(`[loadAndFormatTools] Error loading tool from ${filePath}:`, error);
        continue;
      }

      if (!ToolClass) {
        continue;
      }

      if (ToolClass.prototype instanceof StructuredTool) {
        /** @type {StructuredTool | null} */
        let toolInstance = null;
        try {
          toolInstance = new ToolClass({ override: true });
        } catch (error) {
          logger.error(
            `[loadAndFormatTools] Error initializing \`${file}\` tool; if it requires authentication, is the \`override\` field configured?`,
            error,
          );
          continue;
        }

        if (!toolInstance) {
          continue;
        }

        const formattedTool = formatToOpenAIAssistantTool(toolInstance);
        tools.push(formattedTool);
      }
    }
  }

  /**
   * Basic Tools; schema: { input: string }
   */

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
 * @param {RequiredAction[]} actions - The actions to submit outputs for.
 * @returns {Promise<ToolOutputs>} The outputs of the tools.
 *
 */
async function processRequiredActions(openai, actions) {
  logger.debug(
    `[required actions] user: ${openai.req.user.id} | thread_id: ${actions[0].thread_id} | run_id: ${actions[0].run_id}`,
    actions,
  );
  const tools = actions.map((action) => action.tool);
  const loadedTools = await loadTools({
    user: openai.req.user.id,
    model: openai.req.body.model ?? 'gpt-3.5-turbo-1106',
    tools,
    functions: true,
    options: {
      openAIApiKey: openai.apiKey,
      fileStrategy: openai.req.app.locals.fileStrategy,
      returnMetadata: true,
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
      const promise = tool._call(action.toolInput).then(async (output) => {
        actions[i].output = output;

        /** @type {FunctionToolCall & PartMetadata} */
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

        const toolCallIndex = openai.mappedOrder.get(toolCall.id);

        if (imageGenTools.has(action.tool)) {
          const imageOutput = output;
          toolCall.function.output = `${action.tool} displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.`;

          // Streams the "Finished" state of the tool call in the UI
          openai.addContentData({
            [ContentTypes.TOOL_CALL]: toolCall,
            index: toolCallIndex,
            type: ContentTypes.TOOL_CALL,
          });

          await sleep(500);

          /** @type {ImageFile} */
          const imageDetails = {
            ...imageOutput,
            ...action.toolInput,
          };

          const image_file = {
            [ContentTypes.IMAGE_FILE]: imageDetails,
            type: ContentTypes.IMAGE_FILE,
            // Replace the tool call output with Image file
            index: toolCallIndex,
          };

          openai.addContentData(image_file);

          // Update the stored tool call
          openai.seenToolCalls.set(toolCall.id, toolCall);

          return {
            tool_call_id: action.toolCallId,
            output: toolCall.function.output,
          };
        }

        openai.seenToolCalls.set(toolCall.id, toolCall);
        openai.addContentData({
          [ContentTypes.TOOL_CALL]: toolCall,
          index: toolCallIndex,
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
      logger.error(
        `tool_call_id: ${action.toolCallId} | Error processing tool ${action.tool}`,
        error,
      );
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
  processRequiredActions,
};
