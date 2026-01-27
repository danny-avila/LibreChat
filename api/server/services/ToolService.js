const { sleep } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const { tool: toolFn, DynamicStructuredTool } = require('@langchain/core/tools');
const {
  getToolkitKey,
  hasCustomUserVars,
  getUserMCPAuthMap,
  loadToolDefinitions,
  isActionDomainAllowed,
  buildToolClassification,
} = require('@librechat/api');
const {
  Tools,
  ErrorTypes,
  ContentTypes,
  imageGenTools,
  EModelEndpoint,
  actionDelimiter,
  ImageVisionTool,
  openapiToFunction,
  AgentCapabilities,
  isEphemeralAgentId,
  validateActionDomain,
  actionDomainSeparator,
  defaultAgentCapabilities,
  validateAndParseOpenAPISpec,
} = require('librechat-data-provider');

const domainSeparatorRegex = new RegExp(actionDomainSeparator, 'g');
const {
  createActionTool,
  decryptMetadata,
  loadActionSets,
  domainParser,
} = require('./ActionService');
const { processFileURL, uploadImageBuffer } = require('~/server/services/Files/process');
const {
  getEndpointsConfig,
  getCachedTools,
  getMCPServerTools,
} = require('~/server/services/Config');
const { manifestToolMap, toolkits } = require('~/app/clients/tools/manifest');
const { createOnSearchResults } = require('~/server/services/Tools/search');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { recordUsage } = require('~/server/services/Threads');
const { loadTools } = require('~/app/clients/tools/util');
const { redactMessage } = require('~/config/parsers');
const { findPluginAuthsByKeys } = require('~/models');
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
  const appConfig = client.req.config;
  const toolDefinitions = (await getCachedTools()) ?? {};
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
      returnMetadata: true,
    },
    webSearch: appConfig.webSearch,
    fileStrategy: appConfig.fileStrategy,
    imageOutputType: appConfig.imageOutputType,
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

          const isDomainAllowed = await isActionDomainAllowed(
            action.metadata.domain,
            appConfig?.actions?.allowedDomains,
          );
          if (!isDomainAllowed) {
            continue;
          }

          // Validate and parse OpenAPI spec
          const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
          if (!validationResult.spec || !validationResult.serverUrl) {
            throw new Error(
              `Invalid spec: user: ${client.req.user.id} | thread_id: ${requiredActions[0].thread_id} | run_id: ${requiredActions[0].run_id}`,
            );
          }

          // SECURITY: Validate the domain from the spec matches the stored domain
          // This is defense-in-depth to prevent any stored malicious actions
          const domainValidation = validateActionDomain(
            action.metadata.domain,
            validationResult.serverUrl,
          );
          if (!domainValidation.isValid) {
            logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
              userId: client.req.user.id,
              action_id: action.action_id,
            });
            continue; // Skip this action rather than failing the entire request
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
 * @param {AbortSignal} params.signal
 * @param {Pick<Agent, 'id' | 'provider' | 'model' | 'tools'} params.agent - The agent to load tools for.
 * @param {string | undefined} [params.openAIApiKey] - The OpenAI API key.
 * @returns {Promise<{
 *   tools?: StructuredTool[];
 *   toolContextMap?: Record<string, unknown>;
 *   userMCPAuthMap?: Record<string, Record<string, string>>;
 *   toolRegistry?: Map<string, import('~/utils/toolClassification').LCTool>;
 *   hasDeferredTools?: boolean;
 * }>} The agent tools and registry.
 */
/** Checks if a tool name is a known built-in tool */
const isBuiltInTool = (toolName) =>
  Boolean(manifestToolMap[toolName] || toolkits.some((t) => t.pluginKey === toolName));

/**
 * Loads only tool definitions without creating tool instances.
 * This is the efficient path for event-driven mode where tools are loaded on-demand.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {Object} params.agent - The agent configuration
 * @returns {Promise<{
 *   toolDefinitions?: import('@librechat/api').LCTool[];
 *   toolRegistry?: Map<string, import('@librechat/api').LCTool>;
 *   userMCPAuthMap?: Record<string, Record<string, string>>;
 *   hasDeferredTools?: boolean;
 * }>}
 */
async function loadToolDefinitionsWrapper({ req, agent }) {
  if (!agent.tools || agent.tools.length === 0) {
    return { toolDefinitions: [] };
  }

  if (
    agent.tools.length === 1 &&
    (agent.tools[0] === AgentCapabilities.context || agent.tools[0] === AgentCapabilities.ocr)
  ) {
    return { toolDefinitions: [] };
  }

  const appConfig = req.config;
  const endpointsConfig = await getEndpointsConfig(req);
  let enabledCapabilities = new Set(endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? []);

  if (enabledCapabilities.size === 0 && isEphemeralAgentId(agent.id)) {
    enabledCapabilities = new Set(
      appConfig.endpoints?.[EModelEndpoint.agents]?.capabilities ?? defaultAgentCapabilities,
    );
  }

  const checkCapability = (capability) => enabledCapabilities.has(capability);
  const areToolsEnabled = checkCapability(AgentCapabilities.tools);
  const deferredToolsEnabled = checkCapability(AgentCapabilities.deferred_tools);

  const filteredTools = agent.tools?.filter((tool) => {
    if (tool === Tools.file_search) {
      return checkCapability(AgentCapabilities.file_search);
    }
    if (tool === Tools.execute_code) {
      return checkCapability(AgentCapabilities.execute_code);
    }
    if (tool === Tools.web_search) {
      return checkCapability(AgentCapabilities.web_search);
    }
    if (!areToolsEnabled && !tool.includes(actionDelimiter)) {
      return false;
    }
    return true;
  });

  if (!filteredTools || filteredTools.length === 0) {
    return { toolDefinitions: [] };
  }

  /** @type {Record<string, Record<string, string>>} */
  let userMCPAuthMap;
  if (hasCustomUserVars(req.config)) {
    userMCPAuthMap = await getUserMCPAuthMap({
      tools: agent.tools,
      userId: req.user.id,
      findPluginAuthsByKeys,
    });
  }

  const getOrFetchMCPServerTools = async (userId, serverName) => {
    const cached = await getMCPServerTools(userId, serverName);
    if (cached) {
      return cached;
    }

    const result = await reinitMCPServer({
      user: req.user,
      serverName,
      userMCPAuthMap,
    });

    return result?.availableTools || null;
  };

  const getActionToolDefinitions = async (agentId, actionToolNames) => {
    const actionSets = (await loadActionSets({ agent_id: agentId })) ?? [];
    if (actionSets.length === 0) {
      return [];
    }

    const definitions = [];
    const allowedDomains = appConfig?.actions?.allowedDomains;

    for (const action of actionSets) {
      const domain = await domainParser(action.metadata.domain, true);
      const normalizedDomain = domain.replace(domainSeparatorRegex, '_');

      const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain, allowedDomains);
      if (!isDomainAllowed) {
        logger.warn(
          `[Actions] Domain "${action.metadata.domain}" not in allowedDomains. ` +
            `Add it to librechat.yaml actions.allowedDomains to enable this action.`,
        );
        continue;
      }

      const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
      if (!validationResult.spec || !validationResult.serverUrl) {
        logger.warn(`[Actions] Invalid OpenAPI spec for domain: ${domain}`);
        continue;
      }

      const { functionSignatures } = openapiToFunction(validationResult.spec, true);

      for (const sig of functionSignatures) {
        const toolName = `${sig.name}${actionDelimiter}${normalizedDomain}`;
        if (!actionToolNames.some((name) => name.replace(domainSeparatorRegex, '_') === toolName)) {
          continue;
        }

        definitions.push({
          name: toolName,
          description: sig.description,
          parameters: sig.parameters,
        });
      }
    }

    return definitions;
  };

  const { toolDefinitions, toolRegistry, hasDeferredTools } = await loadToolDefinitions(
    {
      userId: req.user.id,
      agentId: agent.id,
      tools: filteredTools,
      toolOptions: agent.tool_options,
      deferredToolsEnabled,
    },
    {
      isBuiltInTool,
      loadAuthValues,
      getOrFetchMCPServerTools,
      getActionToolDefinitions,
    },
  );

  return {
    toolRegistry,
    userMCPAuthMap,
    toolDefinitions,
    hasDeferredTools,
  };
}

/**
 * Loads agent tools for initialization or execution.
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {Object} params.agent - The agent configuration
 * @param {AbortSignal} [params.signal] - Abort signal
 * @param {Object} [params.tool_resources] - Tool resources
 * @param {string} [params.openAIApiKey] - OpenAI API key
 * @param {string|null} [params.streamId] - Stream ID for resumable mode
 * @param {boolean} [params.definitionsOnly=true] - When true, returns only serializable
 *   tool definitions without creating full tool instances. Use for event-driven mode
 *   where tools are loaded on-demand during execution.
 */
async function loadAgentTools({
  req,
  res,
  agent,
  signal,
  tool_resources,
  openAIApiKey,
  streamId = null,
  definitionsOnly = true,
}) {
  if (definitionsOnly) {
    return loadToolDefinitionsWrapper({ req, agent });
  }

  if (!agent.tools || agent.tools.length === 0) {
    return { toolDefinitions: [] };
  } else if (
    agent.tools &&
    agent.tools.length === 1 &&
    /** Legacy handling for `ocr` as may still exist in existing Agents */
    (agent.tools[0] === AgentCapabilities.context || agent.tools[0] === AgentCapabilities.ocr)
  ) {
    return { toolDefinitions: [] };
  }

  const appConfig = req.config;
  const endpointsConfig = await getEndpointsConfig(req);
  let enabledCapabilities = new Set(endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? []);
  /** Edge case: use defined/fallback capabilities when the "agents" endpoint is not enabled */
  if (enabledCapabilities.size === 0 && isEphemeralAgentId(agent.id)) {
    enabledCapabilities = new Set(
      appConfig.endpoints?.[EModelEndpoint.agents]?.capabilities ?? defaultAgentCapabilities,
    );
  }
  const checkCapability = (capability) => {
    const enabled = enabledCapabilities.has(capability);
    if (!enabled) {
      const isToolCapability = [
        AgentCapabilities.file_search,
        AgentCapabilities.execute_code,
        AgentCapabilities.web_search,
      ].includes(capability);
      const suffix = isToolCapability ? ' despite configured tool.' : '.';
      logger.warn(
        `Capability "${capability}" disabled${suffix} User: ${req.user.id} | Agent: ${agent.id}`,
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
  /** @type {ReturnType<typeof createOnSearchResults>} */
  let webSearchCallbacks;
  if (includesWebSearch) {
    webSearchCallbacks = createOnSearchResults(res, streamId);
  }

  /** @type {Record<string, Record<string, string>>} */
  let userMCPAuthMap;
  //TODO pass config from registry
  if (hasCustomUserVars(req.config)) {
    userMCPAuthMap = await getUserMCPAuthMap({
      tools: agent.tools,
      userId: req.user.id,
      findPluginAuthsByKeys,
    });
  }

  const { loadedTools, toolContextMap } = await loadTools({
    agent,
    signal,
    userMCPAuthMap,
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
      [Tools.web_search]: webSearchCallbacks,
    },
    webSearch: appConfig.webSearch,
    fileStrategy: appConfig.fileStrategy,
    imageOutputType: appConfig.imageOutputType,
  });

  /** Build tool registry from MCP tools and create PTC/tool search tools if configured */
  const deferredToolsEnabled = checkCapability(AgentCapabilities.deferred_tools);
  const { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools } =
    await buildToolClassification({
      loadedTools,
      userId: req.user.id,
      agentId: agent.id,
      agentToolOptions: agent.tool_options,
      deferredToolsEnabled,
      loadAuthValues,
    });

  /**
   * For event-driven mode (definitionsOnly=true), return only serializable data.
   * Tool instances will be created on-demand during ON_TOOL_EXECUTE events.
   */
  if (definitionsOnly) {
    return {
      toolRegistry,
      userMCPAuthMap,
      toolContextMap,
      toolDefinitions,
      hasDeferredTools,
    };
  }

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

  agentTools.push(...additionalTools);

  if (!checkCapability(AgentCapabilities.actions)) {
    return {
      toolRegistry,
      userMCPAuthMap,
      toolContextMap,
      toolDefinitions,
      hasDeferredTools,
      tools: agentTools,
    };
  }

  const actionSets = (await loadActionSets({ agent_id: agent.id })) ?? [];
  if (actionSets.length === 0) {
    if (_agentTools.length > 0 && agentTools.length === 0) {
      logger.warn(`No tools found for the specified tool calls: ${_agentTools.join(', ')}`);
    }
    return {
      toolRegistry,
      userMCPAuthMap,
      toolContextMap,
      toolDefinitions,
      hasDeferredTools,
      tools: agentTools,
    };
  }

  // Process each action set once (validate spec, decrypt metadata)
  const processedActionSets = new Map();
  const domainMap = new Map();

  for (const action of actionSets) {
    const domain = await domainParser(action.metadata.domain, true);
    domainMap.set(domain, action);

    // Check if domain is allowed (do this once per action set)
    const isDomainAllowed = await isActionDomainAllowed(
      action.metadata.domain,
      appConfig?.actions?.allowedDomains,
    );
    if (!isDomainAllowed) {
      continue;
    }

    // Validate and parse OpenAPI spec once per action set
    const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
    if (!validationResult.spec || !validationResult.serverUrl) {
      continue;
    }

    // SECURITY: Validate the domain from the spec matches the stored domain
    // This is defense-in-depth to prevent any stored malicious actions
    const domainValidation = validateActionDomain(
      action.metadata.domain,
      validationResult.serverUrl,
    );
    if (!domainValidation.isValid) {
      logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
        userId: req.user.id,
        agent_id: agent.id,
        action_id: action.action_id,
      });
      continue; // Skip this action rather than failing the entire request
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
        streamId,
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
    toolRegistry,
    toolContextMap,
    userMCPAuthMap,
    toolDefinitions,
    hasDeferredTools,
    tools: agentTools,
  };
}

/**
 * Loads tools for event-driven execution (ON_TOOL_EXECUTE handler).
 * This function encapsulates all dependencies needed for tool loading,
 * so callers don't need to import processFileURL, uploadImageBuffer, etc.
 *
 * Handles both regular tools (MCP, built-in) and action tools.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {AbortSignal} [params.signal] - Abort signal
 * @param {Object} params.agent - The agent object
 * @param {string[]} params.toolNames - Names of tools to load
 * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap] - User MCP auth map
 * @param {Object} [params.tool_resources] - Tool resources
 * @param {string|null} [params.streamId] - Stream ID for web search callbacks
 * @returns {Promise<{ loadedTools: Array, configurable: Object }>}
 */
async function loadToolsForExecution({
  req,
  res,
  signal,
  agent,
  toolNames,
  userMCPAuthMap,
  tool_resources,
  streamId = null,
}) {
  const appConfig = req.config;
  const allLoadedTools = [];

  const actionToolNames = toolNames.filter((name) => name.includes(actionDelimiter));
  const regularToolNames = toolNames.filter((name) => !name.includes(actionDelimiter));

  if (regularToolNames.length > 0) {
    const includesWebSearch = regularToolNames.includes(Tools.web_search);
    const webSearchCallbacks = includesWebSearch ? createOnSearchResults(res, streamId) : undefined;

    const { loadedTools } = await loadTools({
      agent,
      signal,
      userMCPAuthMap,
      functions: true,
      tools: regularToolNames,
      user: req.user.id,
      options: {
        req,
        res,
        processFileURL,
        uploadImageBuffer,
        returnMetadata: true,
        tool_resources,
        [Tools.web_search]: webSearchCallbacks,
      },
      webSearch: appConfig?.webSearch,
      fileStrategy: appConfig?.fileStrategy,
      imageOutputType: appConfig?.imageOutputType,
    });

    if (loadedTools) {
      allLoadedTools.push(...loadedTools);
    }
  }

  if (actionToolNames.length > 0 && agent) {
    const actionTools = await loadActionToolsForExecution({
      req,
      res,
      agent,
      appConfig,
      streamId,
      actionToolNames,
    });
    allLoadedTools.push(...actionTools);
  }

  return {
    loadedTools: allLoadedTools,
    configurable: { userMCPAuthMap },
  };
}

/**
 * Loads action tools for event-driven execution.
 * @param {Object} params
 * @param {ServerRequest} params.req - The request object
 * @param {ServerResponse} params.res - The response object
 * @param {Object} params.agent - The agent object
 * @param {Object} params.appConfig - App configuration
 * @param {string|null} params.streamId - Stream ID
 * @param {string[]} params.actionToolNames - Action tool names to load
 * @returns {Promise<Array>} Loaded action tools
 */
async function loadActionToolsForExecution({
  req,
  res,
  agent,
  appConfig,
  streamId,
  actionToolNames,
}) {
  const loadedActionTools = [];

  const actionSets = (await loadActionSets({ agent_id: agent.id })) ?? [];
  if (actionSets.length === 0) {
    return loadedActionTools;
  }

  const processedActionSets = new Map();
  const domainMap = new Map();
  const allowedDomains = appConfig?.actions?.allowedDomains;

  for (const action of actionSets) {
    const domain = await domainParser(action.metadata.domain, true);
    domainMap.set(domain, action);

    const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain, allowedDomains);
    if (!isDomainAllowed) {
      logger.warn(
        `[Actions] Domain "${action.metadata.domain}" not in allowedDomains. ` +
          `Add it to librechat.yaml actions.allowedDomains to enable this action.`,
      );
      continue;
    }

    const validationResult = validateAndParseOpenAPISpec(action.metadata.raw_spec);
    if (!validationResult.spec || !validationResult.serverUrl) {
      logger.warn(`[Actions] Invalid OpenAPI spec for domain: ${domain}`);
      continue;
    }

    const domainValidation = validateActionDomain(
      action.metadata.domain,
      validationResult.serverUrl,
    );
    if (!domainValidation.isValid) {
      logger.error(`Domain mismatch in stored action: ${domainValidation.message}`, {
        userId: req.user.id,
        agent_id: agent.id,
        action_id: action.action_id,
      });
      continue;
    }

    const encrypted = {
      oauth_client_id: action.metadata.oauth_client_id,
      oauth_client_secret: action.metadata.oauth_client_secret,
    };

    const decryptedAction = { ...action };
    decryptedAction.metadata = await decryptMetadata(action.metadata);

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

  for (const toolName of actionToolNames) {
    let currentDomain = '';
    for (const domain of domainMap.keys()) {
      const normalizedDomain = domain.replace(domainSeparatorRegex, '_');
      if (toolName.includes(normalizedDomain)) {
        currentDomain = domain;
        break;
      }
    }

    if (!currentDomain || !processedActionSets.has(currentDomain)) {
      continue;
    }

    const { action, encrypted, zodSchemas, requestBuilders, functionSignatures } =
      processedActionSets.get(currentDomain);
    const normalizedDomain = currentDomain.replace(domainSeparatorRegex, '_');
    const functionName = toolName.replace(`${actionDelimiter}${normalizedDomain}`, '');
    const functionSig = functionSignatures.find((sig) => sig.name === functionName);
    const requestBuilder = requestBuilders[functionName];
    const zodSchema = zodSchemas[functionName];

    if (!requestBuilder) {
      continue;
    }

    const tool = await createActionTool({
      userId: req.user.id,
      res,
      action,
      streamId,
      zodSchema,
      encrypted,
      requestBuilder,
      name: toolName,
      description: functionSig?.description ?? '',
    });

    if (!tool) {
      logger.warn(`[Actions] Failed to create action tool: ${toolName}`);
      continue;
    }

    loadedActionTools.push(tool);
  }

  return loadedActionTools;
}

module.exports = {
  loadTools,
  isBuiltInTool,
  getToolkitKey,
  loadAgentTools,
  loadToolsForExecution,
  processRequiredActions,
};
