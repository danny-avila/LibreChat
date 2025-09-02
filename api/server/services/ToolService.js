const fs = require('fs');
const path = require('path');
const { sleep } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { Calculator } = require('@langchain/community/tools/calculator');
const { tool: toolFn, Tool, DynamicStructuredTool } = require('@langchain/core/tools');
const {
  Tools,
  Constants,
  ErrorTypes,
  ContentTypes,
  imageGenTools,
  EToolResources,
  EModelEndpoint,
  actionDelimiter,
  ImageVisionTool,
  openapiToFunction,
  AgentCapabilities,
  defaultAgentCapabilities,
  validateAndParseOpenAPISpec,
} = require('librechat-data-provider');
const {
  createActionTool,
  decryptMetadata,
  loadActionSets,
  domainParser,
} = require('./ActionService');
const {
  createOpenAIImageTools,
  createYouTubeTools,
  manifestToolMap,
  toolkits,
} = require('~/app/clients/tools');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const { getEndpointsConfig, getCachedTools } = require('~/server/services/Config');
const { createOnSearchResults } = require('~/server/services/Tools/search');
const { isActionDomainAllowed } = require('~/server/services/domains');
const { recordUsage } = require('~/server/services/Threads');
const { loadTools } = require('~/app/clients/tools/util');
const { redactMessage } = require('~/config/parsers');

/**
 * @param {string} toolName
 * @returns {string | undefined} toolKey
 */
function getToolkitKey(toolName) {
  /** @type {string|undefined} */
  let toolkitKey;
  for (const toolkit of toolkits) {
    if (toolName.startsWith(EToolResources.image_edit)) {
      const splitMatches = toolkit.pluginKey.split('_');
      const suffix = splitMatches[splitMatches.length - 1];
      if (toolName.endsWith(suffix)) {
        toolkitKey = toolkit.pluginKey;
        break;
      }
    }
    if (toolName.startsWith(toolkit.pluginKey)) {
      toolkitKey = toolkit.pluginKey;
      break;
    }
  }
  return toolkitKey;
}

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
 * @param {Array<string>} [params.adminFilter=[]] - Array of admin-defined tool keys to exclude from loading.
 * @param {Array<string>} [params.adminIncluded=[]] - Array of admin-defined tool keys to include from loading.
 * @returns {Record<string, FunctionTool>} An object mapping each tool's plugin key to its instance.
 */
function loadAndFormatTools({ directory, adminFilter = [], adminIncluded = [] }) {
  const filter = new Set([...adminFilter]);
  const included = new Set(adminIncluded);
  const tools = [];
  /* Structured Tools Directory */
  const files = fs.readdirSync(directory);

  if (included.size > 0 && adminFilter.length > 0) {
    logger.warn(
      'Both `includedTools` and `filteredTools` are defined; `filteredTools` will be ignored.',
    );
  }

  for (const file of files) {
    const filePath = path.join(directory, file);
    if (!file.endsWith('.js') || (filter.has(file) && included.size === 0)) {
      continue;
    }

    let ToolClass = null;
    try {
      ToolClass = require(filePath);
    } catch (error) {
      logger.error(`[loadAndFormatTools] Error loading tool from ${filePath}:`, error);
      continue;
    }

    if (!ToolClass || !(ToolClass.prototype instanceof Tool)) {
      continue;
    }

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

    if (filter.has(toolInstance.name) && included.size === 0) {
      continue;
    }

    if (included.size > 0 && !included.has(file) && !included.has(toolInstance.name)) {
      continue;
    }

    const formattedTool = formatToOpenAIAssistantTool(toolInstance);
    tools.push(formattedTool);
  }

  /** Basic Tools & Toolkits; schema: { input: string } */
  const basicToolInstances = [
    new Calculator(),
    ...createOpenAIImageTools({ override: true }),
    ...createYouTubeTools({ override: true }),
  ];
  for (const toolInstance of basicToolInstances) {
    const formattedTool = formatToOpenAIAssistantTool(toolInstance);
    let toolName = formattedTool[Tools.function].name;
    toolName = getToolkitKey(toolName) ?? toolName;
    if (filter.has(toolName) && included.size === 0) {
      continue;
    }

    if (included.size > 0 && !included.has(toolName)) {
      continue;
    }
    tools.push(formattedTool);
  }

  tools.push(ImageVisionTool);

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
    type: Tools.function,
    [Tools.function]: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  };
}

/**
 * Processes the required actions by calling the appropriate tools and returning the outputs.
 * @param {OpenAIClient} client - OpenAI or StreamRunManager Client.
 * @param {RequiredAction} requiredActions - The current required action.
 * @returns {Promise<ToolOutput>} The outputs of the tools.
 */
const processVisionRequest = async (client, currentAction) => {
  if (!client.visionPromise) {
    return {
      tool_call_id: currentAction.toolCallId,
      output: 'No image details found.',
    };
  }

  /** @type {ChatCompletion | undefined} */
  const completion = await client.visionPromise;
  if (completion && completion.usage) {
    recordUsage({
      user: client.req.user.id,
      model: client.req.body.model,
      conversationId: (client.responseMessage ?? client.finalMessage).conversationId,
      ...completion.usage,
    });
  }
  const output = completion?.choices?.[0]?.message?.content ?? 'No image details found.';
  return {
    tool_call_id: currentAction.toolCallId,
    output,
  };
};

/**
 * Processes return required actions from run.
 * @param {OpenAIClient | StreamRunManager} client - OpenAI (legacy) or StreamRunManager Client.
 * @param {RequiredAction[]} requiredActions - The required actions to submit outputs for.
 * @returns {Promise<ToolOutputs>} The outputs of the tools.
 */
async function processRequiredActions(client, requiredActions) {
  logger.debug(
    `[required actions] user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id}`,
    requiredActions,
  );
  const toolDefinitions = await getCachedTools({ includeGlobal: true });
  const seenToolkits = new Set();
  const tools = requiredActions
    .map((action) => {
      const toolName = action.tool;
      const toolDef = toolDefinitions[toolName];
      if (toolDef && !manifestToolMap[toolName]) {
        for (const toolkit of toolkits) {
          if (seenToolkits.has(toolkit.pluginKey)) {
            return;
          } else if (toolName.startsWith(`${toolkit.pluginKey}_`)) {
            seenToolkits.add(toolkit.pluginKey);
            return toolkit.pluginKey;
          }
        }
      }
      return toolName;
    })
    .filter((toolName) => !!toolName);

  const { loadedTools } = await loadTools({
    user: client.req.user.id,
    model: client.req.body.model ?? 'gpt-4o-mini',
    tools,
    functions: true,
    endpoint: client.req.body.endpoint,
    options: {
      processFileURL,
      req: client.req,
      uploadImageBuffer,
      openAIApiKey: client.apiKey,
      fileStrategy: client.req.app.locals.fileStrategy,
      returnMetadata: true,
    },
  });

  const ToolMap = loadedTools.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {});

  const promises = [];

  /** @type {Action[]} */
  let actionSets = [];
  let isActionTool = false;
  const ActionToolMap = {};
  const ActionBuildersMap = {};

  for (let i = 0; i < requiredActions.length; i++) {
    const currentAction = requiredActions[i];
    if (currentAction.tool === ImageVisionTool.function.name) {
      promises.push(processVisionRequest(client, currentAction));
      continue;
    }
    let tool = ToolMap[currentAction.tool] ?? ActionToolMap[currentAction.tool];

    const handleToolOutput = async (output) => {
      requiredActions[i].output = output;

      /** @type {FunctionToolCall & PartMetadata} */
      const toolCall = {
        function: {
          name: currentAction.tool,
          arguments: JSON.stringify(currentAction.toolInput),
          output,
        },
        id: currentAction.toolCallId,
        type: 'function',
        progress: 1,
        action: isActionTool,
      };

      const toolCallIndex = client.mappedOrder.get(toolCall.id);

      if (imageGenTools.has(currentAction.tool)) {
        const imageOutput = output;
        toolCall.function.output = `${currentAction.tool} displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.`;

        // Streams the "Finished" state of the tool call in the UI
        client.addContentData({
          [ContentTypes.TOOL_CALL]: toolCall,
          index: toolCallIndex,
          type: ContentTypes.TOOL_CALL,
        });

        await sleep(500);

        /** @type {ImageFile} */
        const imageDetails = {
          ...imageOutput,
          ...currentAction.toolInput,
        };

        const image_file = {
          [ContentTypes.IMAGE_FILE]: imageDetails,
          type: ContentTypes.IMAGE_FILE,
          // Replace the tool call output with Image file
          index: toolCallIndex,
        };

        client.addContentData(image_file);

        // Update the stored tool call
        client.seenToolCalls && client.seenToolCalls.set(toolCall.id, toolCall);

        return {
          tool_call_id: currentAction.toolCallId,
          output: toolCall.function.output,
        };
      }

      client.seenToolCalls && client.seenToolCalls.set(toolCall.id, toolCall);
      client.addContentData({
        [ContentTypes.TOOL_CALL]: toolCall,
        index: toolCallIndex,
        type: ContentTypes.TOOL_CALL,
        // TODO: to append tool properties to stream, pass metadata rest to addContentData
        // result: tool.result,
      });

      return {
        tool_call_id: currentAction.toolCallId,
        output,
      };
    };

    if (!tool) {
      // throw new Error(`Tool ${currentAction.tool} not found.`);

      // Load all action sets once if not already loaded
      if (!actionSets.length) {
        actionSets =
          (await loadActionSets({
            assistant_id: client.req.body.assistant_id,
          })) ?? [];

        // Process all action sets once
        // Map domains to their processed action sets
        const processedDomains = new Map();
        const domainMap = new Map();

        for (const action of actionSets) {
          const domain = await domainParser(action.metadata.domain, true);
          domainMap.set(domain, action);

          // Check if domain is allowed
          const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain);
          if (!isDomainAllowed) {
            continue;
          }

          // Validate and parse OpenAPI spec
          const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
          if (!validationResult.spec) {
            throw new Error(
              `Invalid spec: user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id}`,
            );
          }

          // Process the OpenAPI spec
          const { requestBuilders } = openapiToFunction(validationResult.spec);

          // Store encrypted values for OAuth flow
          const encrypted = {
            oauth_client_id: action.metadata.oauth_client_id,
            oauth_client_secret: action.metadata.oauth_client_secret,
          };

          // Decrypt metadata
          const decryptedAction = { ...action };
          decryptedAction.metadata = await decryptMetadata(action.metadata);

          processedDomains.set(domain, {
            action: decryptedAction,
            requestBuilders,
            encrypted,
          });

          // Store builders for reuse
          ActionBuildersMap[action.metadata.domain] = requestBuilders;
        }

        // Update actionSets reference to use the domain map
        actionSets = { domainMap, processedDomains };
      }

      // Find the matching domain for this tool
      let currentDomain = '';
      for (const domain of actionSets.domainMap.keys()) {
        if (currentAction.tool.includes(domain)) {
          currentDomain = domain;
          break;
        }
      }

      if (!currentDomain || !actionSets.processedDomains.has(currentDomain)) {
        // TODO: try `function` if no action set is found
        // throw new Error(`Tool ${currentAction.tool} not found.`);
        continue;
      }

      const { action, requestBuilders, encrypted } = actionSets.processedDomains.get(currentDomain);
      const functionName = currentAction.tool.replace(`${actionDelimiter}${currentDomain}`, '');
      const requestBuilder = requestBuilders[functionName];

      if (!requestBuilder) {
        // throw new Error(`Tool ${currentAction.tool} not found.`);
        continue;
      }

      // We've already decrypted the metadata, so we can pass it directly
      tool = await createActionTool({
        userId: client.req.user.id,
        res: client.res,
        action,
        requestBuilder,
        // Note: intentionally not passing zodSchema, name, and description for assistants API
        encrypted, // Pass the encrypted values for OAuth flow
      });
      if (!tool) {
        logger.warn(
          `Invalid action: user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id} | toolName: ${currentAction.tool}`,
        );
        throw new Error(`{"type":"${ErrorTypes.INVALID_ACTION}"}`);
      }
      isActionTool = !!tool;
      ActionToolMap[currentAction.tool] = tool;
    }

    if (currentAction.tool === 'calculator') {
      currentAction.toolInput = currentAction.toolInput.input;
    }

    const handleToolError = (error) => {
      logger.error(
        `tool_call_id: ${currentAction.toolCallId} | Error processing tool ${currentAction.tool}`,
        error,
      );
      return {
        tool_call_id: currentAction.toolCallId,
        output: `Error processing tool ${currentAction.tool}: ${redactMessage(error.message, 256)}`,
      };
    };

    try {
      const promise = tool
        ._call(currentAction.toolInput)
        .then(handleToolOutput)
        .catch(handleToolError);
      promises.push(promise);
    } catch (error) {
      const toolOutputError = handleToolError(error);
      promises.push(Promise.resolve(toolOutputError));
    }
  }

  return {
    tool_outputs: await Promise.all(promises),
  };
}

/**
 * Processes the runtime tool calls and returns the tool classes.
 * @param {Object} params - Run params containing user and request information.
 * @param {ServerRequest} params.req - The request object.
 * @param {ServerResponse} params.res - The request object.
 * @param {Pick<Agent, 'id' | 'provider' | 'model' | 'tools'} params.agent - The agent to load tools for.
 * @param {string | undefined} [params.openAIApiKey] - The OpenAI API key.
 * @returns {Promise<{ tools?: StructuredTool[] }>} The agent tools.
 */
async function loadAgentTools({ req, res, agent, tool_resources, openAIApiKey }) {
  if (!agent.tools || agent.tools.length === 0) {
    return {};
  } else if (agent.tools && agent.tools.length === 1 && agent.tools[0] === AgentCapabilities.ocr) {
    return {};
  }

  const endpointsConfig = await getEndpointsConfig(req);
  let enabledCapabilities = new Set(endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? []);
  /** Edge case: use defined/fallback capabilities when the "agents" endpoint is not enabled */
  if (enabledCapabilities.size === 0 && agent.id === Constants.EPHEMERAL_AGENT_ID) {
    enabledCapabilities = new Set(
      req.app?.locals?.[EModelEndpoint.agents]?.capabilities ?? defaultAgentCapabilities,
    );
  }
  const checkCapability = (capability) => {
    const enabled = enabledCapabilities.has(capability);
    if (!enabled) {
      logger.warn(
        `Capability "${capability}" disabled${capability === AgentCapabilities.tools ? '.' : ' despite configured tool.'} User: ${req.user.id} | Agent: ${agent.id}`,
      );
    }
    return enabled;
  };
  const areToolsEnabled = checkCapability(AgentCapabilities.tools);

  let includesWebSearch = false;
  const _agentTools = agent.tools?.filter((tool) => {
    if (tool === Tools.file_search) {
      return checkCapability(AgentCapabilities.file_search);
    } else if (tool === Tools.execute_code) {
      return checkCapability(AgentCapabilities.execute_code);
    } else if (tool === Tools.web_search) {
      includesWebSearch = checkCapability(AgentCapabilities.web_search);
      return includesWebSearch;
    } else if (!areToolsEnabled && !tool.includes(actionDelimiter)) {
      return false;
    }
    return true;
  });

  if (!_agentTools || _agentTools.length === 0) {
    return {};
  }
  /** @type {ReturnType<createOnSearchResults>} */
  let webSearchCallbacks;
  if (includesWebSearch) {
    webSearchCallbacks = createOnSearchResults(res);
  }
  const { loadedTools, toolContextMap } = await loadTools({
    agent,
    functions: true,
    user: req.user.id,
    tools: _agentTools,
    options: {
      req,
      res,
      openAIApiKey,
      tool_resources,
      processFileURL,
      uploadImageBuffer,
      returnMetadata: true,
      fileStrategy: req.app.locals.fileStrategy,
      [Tools.web_search]: webSearchCallbacks,
    },
  });

  const agentTools = [];
  for (let i = 0; i < loadedTools.length; i++) {
    const tool = loadedTools[i];
    if (tool.name && (tool.name === Tools.execute_code || tool.name === Tools.file_search)) {
      agentTools.push(tool);
      continue;
    }

    if (!areToolsEnabled) {
      continue;
    }

    if (tool.mcp === true) {
      agentTools.push(tool);
      continue;
    }

    if (tool instanceof DynamicStructuredTool) {
      agentTools.push(tool);
      continue;
    }

    const toolDefinition = {
      name: tool.name,
      schema: tool.schema,
      description: tool.description,
    };

    if (imageGenTools.has(tool.name)) {
      toolDefinition.responseFormat = 'content_and_artifact';
    }

    const toolInstance = toolFn(async (...args) => {
      return tool['_call'](...args);
    }, toolDefinition);

    agentTools.push(toolInstance);
  }

  const ToolMap = loadedTools.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {});

  if (!checkCapability(AgentCapabilities.actions)) {
    return {
      tools: agentTools,
      toolContextMap,
    };
  }

  const actionSets = (await loadActionSets({ agent_id: agent.id })) ?? [];
  if (actionSets.length === 0) {
    if (_agentTools.length > 0 && agentTools.length === 0) {
      logger.warn(`No tools found for the specified tool calls: ${_agentTools.join(', ')}`);
    }
    return {
      tools: agentTools,
      toolContextMap,
    };
  }

  // Process each action set once (validate spec, decrypt metadata)
  const processedActionSets = new Map();
  const domainMap = new Map();

  for (const action of actionSets) {
    const domain = await domainParser(action.metadata.domain, true);
    domainMap.set(domain, action);

    // Check if domain is allowed (do this once per action set)
    const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain);
    if (!isDomainAllowed) {
      continue;
    }

    // Validate and parse OpenAPI spec once per action set
    const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
    if (!validationResult.spec) {
      continue;
    }

    const encrypted = {
      oauth_client_id: action.metadata.oauth_client_id,
      oauth_client_secret: action.metadata.oauth_client_secret,
    };

    // Decrypt metadata once per action set
    const decryptedAction = { ...action };
    decryptedAction.metadata = await decryptMetadata(action.metadata);

    // Process the OpenAPI spec once per action set
    const { requestBuilders, functionSignatures, zodSchemas } = openapiToFunction(
      validationResult.spec,
      true,
    );

    processedActionSets.set(domain, {
      action: decryptedAction,
      requestBuilders,
      functionSignatures,
      zodSchemas,
      encrypted,
    });
  }

  // Now map tools to the processed action sets
  const ActionToolMap = {};

  for (const toolName of _agentTools) {
    if (ToolMap[toolName]) {
      continue;
    }

    // Find the matching domain for this tool
    let currentDomain = '';
    for (const domain of domainMap.keys()) {
      if (toolName.includes(domain)) {
        currentDomain = domain;
        break;
      }
    }

    if (!currentDomain || !processedActionSets.has(currentDomain)) {
      continue;
    }

    const { action, encrypted, zodSchemas, requestBuilders, functionSignatures } =
      processedActionSets.get(currentDomain);
    const functionName = toolName.replace(`${actionDelimiter}${currentDomain}`, '');
    const functionSig = functionSignatures.find((sig) => sig.name === functionName);
    const requestBuilder = requestBuilders[functionName];
    const zodSchema = zodSchemas[functionName];

    if (requestBuilder) {
      const tool = await createActionTool({
        userId: req.user.id,
        res,
        action,
        requestBuilder,
        zodSchema,
        encrypted,
        name: toolName,
        description: functionSig.description,
      });

      if (!tool) {
        logger.warn(
          `Invalid action: user: ${req.user.id} | agent_id: ${agent.id} | toolName: ${toolName}`,
        );
        throw new Error(`{"type":"${ErrorTypes.INVALID_ACTION}"}`);
      }

      agentTools.push(tool);
      ActionToolMap[toolName] = tool;
    }
  }

  if (_agentTools.length > 0 && agentTools.length === 0) {
    logger.warn(`No tools found for the specified tool calls: ${_agentTools.join(', ')}`);
    return {};
  }

  return {
    tools: agentTools,
    toolContextMap,
  };
}

module.exports = {
  getToolkitKey,
  loadAgentTools,
  loadAndFormatTools,
  processRequiredActions,
  formatToOpenAIAssistantTool,
};
