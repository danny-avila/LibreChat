const { logger } = require('@librechat/data-schemas');
const {
  EnvVar,
  Calculator,
  createSearchTool,
  createCodeExecutionTool,
} = require('@librechat/agents');
const {
  checkAccess,
  createSafeUser,
  mcpToolPattern,
  loadWebSearchAuth,
} = require('@librechat/api');
const { getMCPServersRegistry } = require('~/config');
const {
  Tools,
  Constants,
  Permissions,
  EToolResources,
  PermissionTypes,
  replaceSpecialVars,
} = require('librechat-data-provider');
const {
  availableTools,
  manifestToolMap,
  // Basic Tools
  GoogleSearchAPI,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  TraversaalSearch,
  StructuredWolfram,
  createYouTubeTools,
  TavilySearchResults,
  createOpenAIImageTools,
} = require('../');
const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
const { createFileSearchTool, primeFiles: primeSearchFiles } = require('./fileSearch');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { createMCPTool, createMCPTools } = require('~/server/services/MCP');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getMCPServerTools } = require('~/server/services/Config');
const { getRoleByName } = require('~/models/Role');

/**
 * Validates the availability and authentication of tools for a user based on environment variables or user-specific plugin authentication values.
 * Tools without required authentication or with valid authentication are considered valid.
 *
 * @param {Object} user The user object for whom to validate tool access.
 * @param {Array<string>} tools An array of tool identifiers to validate. Defaults to an empty array.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of valid tool identifiers.
 */
const validateTools = async (user, tools = []) => {
  try {
    const validToolsSet = new Set(tools);
    const availableToolsToValidate = availableTools.filter((tool) =>
      validToolsSet.has(tool.pluginKey),
    );

    /**
     * Validates the credentials for a given auth field or set of alternate auth fields for a tool.
     * If valid admin or user authentication is found, the function returns early. Otherwise, it removes the tool from the set of valid tools.
     *
     * @param {string} authField The authentication field or fields (separated by "||" for alternates) to validate.
     * @param {string} toolName The identifier of the tool being validated.
     */
    const validateCredentials = async (authField, toolName) => {
      const fields = authField.split('||');
      for (const field of fields) {
        const adminAuth = process.env[field];
        if (adminAuth && adminAuth.length > 0) {
          return;
        }

        let userAuth = null;
        try {
          userAuth = await getUserPluginAuthValue(user, field);
        } catch (err) {
          if (field === fields[fields.length - 1] && !userAuth) {
            throw err;
          }
        }
        if (userAuth && userAuth.length > 0) {
          return;
        }
      }

      validToolsSet.delete(toolName);
    };

    for (const tool of availableToolsToValidate) {
      if (!tool.authConfig || tool.authConfig.length === 0) {
        continue;
      }

      for (const auth of tool.authConfig) {
        await validateCredentials(auth.authField, tool.pluginKey);
      }
    }

    return Array.from(validToolsSet.values());
  } catch (err) {
    logger.error('[validateTools] There was a problem validating tools', err);
    throw new Error(err);
  }
};

/** @typedef {typeof import('@langchain/core/tools').Tool} ToolConstructor */
/** @typedef {import('@langchain/core/tools').Tool} Tool */

/**
 * Initializes a tool with authentication values for the given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {string} userId The user ID for which the tool is being loaded.
 * @param {Array<string>} authFields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
 * @param {ToolConstructor} ToolConstructor The constructor function for the tool to be initialized.
 * @param {Object} options Optional parameters to be passed to the tool constructor alongside authentication values.
 * @returns {() => Promise<Tool>} An Async function that, when called, asynchronously initializes and returns an instance of the tool with authentication.
 */
const loadToolWithAuth = (userId, authFields, ToolConstructor, options = {}) => {
  return async function () {
    const authValues = await loadAuthValues({ userId, authFields });
    return new ToolConstructor({ ...options, ...authValues, userId });
  };
};

/**
 * @param {string} toolKey
 * @returns {Array<string>}
 */
const getAuthFields = (toolKey) => {
  return manifestToolMap[toolKey]?.authConfig.map((auth) => auth.authField) ?? [];
};

/**
 *
 * @param {object} params
 * @param {string} params.user
 * @param {Record<string, Record<string, string>>} [object.userMCPAuthMap]
 * @param {AbortSignal} [object.signal]
 * @param {Pick<Agent, 'id' | 'provider' | 'model'>} [params.agent]
 * @param {string} [params.model]
 * @param {EModelEndpoint} [params.endpoint]
 * @param {LoadToolOptions} [params.options]
 * @param {boolean} [params.useSpecs]
 * @param {Array<string>} params.tools
 * @param {boolean} [params.functions]
 * @param {boolean} [params.returnMap]
 * @param {AppConfig['webSearch']} [params.webSearch]
 * @param {AppConfig['fileStrategy']} [params.fileStrategy]
 * @param {AppConfig['imageOutputType']} [params.imageOutputType]
 * @returns {Promise<{ loadedTools: Tool[], toolContextMap: Object<string, any> } | Record<string,Tool>>}
 */
const loadTools = async ({
  user,
  agent,
  model,
  signal,
  endpoint,
  userMCPAuthMap,
  tools = [],
  options = {},
  functions = true,
  returnMap = false,
  webSearch,
  fileStrategy,
  imageOutputType,
}) => {
  const toolConstructors = {
    flux: FluxAPI,
    calculator: Calculator,
    google: GoogleSearchAPI,
    open_weather: OpenWeather,
    wolfram: StructuredWolfram,
    'stable-diffusion': StructuredSD,
    'azure-ai-search': StructuredACS,
    traversaal_search: TraversaalSearch,
    tavily_search_results_json: TavilySearchResults,
  };

  const customConstructors = {
    youtube: async (_toolContextMap) => {
      const authFields = getAuthFields('youtube');
      const authValues = await loadAuthValues({ userId: user, authFields });
      return createYouTubeTools(authValues);
    },
    image_gen_oai: async (toolContextMap) => {
      const authFields = getAuthFields('image_gen_oai');
      const authValues = await loadAuthValues({ userId: user, authFields });
      const imageFiles = options.tool_resources?.[EToolResources.image_edit]?.files ?? [];
      let toolContext = '';
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file) {
          continue;
        }
        if (i === 0) {
          toolContext =
            'Image files provided in this request (their image IDs listed in order of appearance) available for image editing:';
        }
        toolContext += `\n\t- ${file.file_id}`;
        if (i === imageFiles.length - 1) {
          toolContext += `\n\nInclude any you need in the \`image_ids\` array when calling \`${EToolResources.image_edit}_oai\`. You may also include previously referenced or generated image IDs.`;
        }
      }
      if (toolContext) {
        toolContextMap.image_edit_oai = toolContext;
      }
      return createOpenAIImageTools({
        ...authValues,
        isAgent: !!agent,
        req: options.req,
        imageOutputType,
        fileStrategy,
        imageFiles,
      });
    },
  };

  const requestedTools = {};

  if (functions === true) {
    toolConstructors.dalle = DALLE3;
  }

  /** @type {ImageGenOptions} */
  const imageGenOptions = {
    isAgent: !!agent,
    req: options.req,
    fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    flux: imageGenOptions,
    dalle: imageGenOptions,
    'stable-diffusion': imageGenOptions,
  };

  /** @type {Record<string, string>} */
  const toolContextMap = {};
  const requestedMCPTools = {};

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      requestedTools[tool] = async () => {
        const authValues = await loadAuthValues({
          userId: user,
          authFields: [EnvVar.CODE_API_KEY],
        });
        const codeApiKey = authValues[EnvVar.CODE_API_KEY];
        const { files, toolContext } = await primeCodeFiles(
          {
            ...options,
            agentId: agent?.id,
          },
          codeApiKey,
        );
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        const CodeExecutionTool = createCodeExecutionTool({
          user_id: user,
          files,
          ...authValues,
        });
        CodeExecutionTool.apiKey = codeApiKey;
        return CodeExecutionTool;
      };
      continue;
    } else if (tool === Tools.file_search) {
      requestedTools[tool] = async () => {
        const { files, toolContext } = await primeSearchFiles({
          ...options,
          agentId: agent?.id,
        });
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }

        /** @type {boolean | undefined} Check if user has FILE_CITATIONS permission */
        let fileCitations;
        if (fileCitations == null && options.req?.user != null) {
          try {
            fileCitations = await checkAccess({
              user: options.req.user,
              permissionType: PermissionTypes.FILE_CITATIONS,
              permissions: [Permissions.USE],
              getRoleByName,
            });
          } catch (error) {
            logger.error('[handleTools] FILE_CITATIONS permission check failed:', error);
            fileCitations = false;
          }
        }

        return createFileSearchTool({
          userId: user,
          files,
          entity_id: agent?.id,
          fileCitations,
        });
      };
      continue;
    } else if (tool === Tools.web_search) {
      const result = await loadWebSearchAuth({
        userId: user,
        loadAuthValues,
        webSearchConfig: webSearch,
      });
      const { onSearchResults, onGetHighlights } = options?.[Tools.web_search] ?? {};
      requestedTools[tool] = async () => {
        toolContextMap[tool] = `# \`${tool}\`:
Current Date & Time: ${replaceSpecialVars({ text: '{{iso_datetime}}' })}

**Execute immediately without preface.** After search, provide a brief summary addressing the query directly, then structure your response with clear Markdown formatting (## headers, lists, tables). Cite sources properly, tailor tone to query type, and provide comprehensive details.

**CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**
Use these EXACT escape sequences (copy verbatim): \\ue202 (before each anchor), \\ue200 (group start), \\ue201 (group end), \\ue203 (highlight start), \\ue204 (highlight end)

Anchor pattern: \\ue202turn{N}{type}{index} where N=turn number, type=search|news|image|ref, index=0,1,2...

**Examples (copy these exactly):**
- Single: "Statement.\\ue202turn0search0"
- Multiple: "Statement.\\ue202turn0search0\\ue202turn0news1"
- Group: "Statement. \\ue200\\ue202turn0search0\\ue202turn0news1\\ue201"
- Highlight: "\\ue203Cited text.\\ue204\\ue202turn0search0"
- Image: "See photo\\ue202turn0image0."

**CRITICAL:** Output escape sequences EXACTLY as shown. Do NOT substitute with † or other symbols. Place anchors AFTER punctuation. Cite every non-obvious fact/quote. NEVER use markdown links, [1], footnotes, or HTML tags.`.trim();
        return createSearchTool({
          ...result.authResult,
          onSearchResults,
          onGetHighlights,
          logger,
        });
      };
      continue;
    } else if (tool && mcpToolPattern.test(tool)) {
      const [toolName, serverName] = tool.split(Constants.mcp_delimiter);
      if (toolName === Constants.mcp_server) {
        /** Placeholder used for UI purposes */
        continue;
      }
      const serverConfig = serverName
        ? await getMCPServersRegistry().getServerConfig(serverName, user)
        : null;
      if (!serverConfig) {
        logger.warn(
          `MCP server "${serverName}" for "${toolName}" tool is not configured${agent?.id != null && agent.id ? ` but attached to "${agent.id}"` : ''}`,
        );
        continue;
      }
      if (toolName === Constants.mcp_all) {
        requestedMCPTools[serverName] = [
          {
            type: 'all',
            serverName,
            config: serverConfig,
          },
        ];
        continue;
      }

      requestedMCPTools[serverName] = requestedMCPTools[serverName] || [];
      requestedMCPTools[serverName].push({
        type: 'single',
        toolKey: tool,
        serverName,
        config: serverConfig,
      });
      continue;
    }

    if (customConstructors[tool]) {
      requestedTools[tool] = async () => customConstructors[tool](toolContextMap);
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = loadToolWithAuth(
        user,
        getAuthFields(tool),
        toolConstructors[tool],
        options,
      );
      requestedTools[tool] = toolInstance;
      continue;
    }
  }

  if (returnMap) {
    return requestedTools;
  }

  const toolPromises = [];
  for (const tool of tools) {
    const validTool = requestedTools[tool];
    if (validTool) {
      toolPromises.push(
        validTool().catch((error) => {
          logger.error(`Error loading tool ${tool}:`, error);
          return null;
        }),
      );
    }
  }

  const loadedTools = (await Promise.all(toolPromises)).flatMap((plugin) => plugin || []);
  const mcpToolPromises = [];
  /** MCP server tools are initialized sequentially by server */
  let index = -1;
  const failedMCPServers = new Set();
  const safeUser = createSafeUser(options.req?.user);
  for (const [serverName, toolConfigs] of Object.entries(requestedMCPTools)) {
    index++;
    /** @type {LCAvailableTools} */
    let availableTools;
    for (const config of toolConfigs) {
      try {
        if (failedMCPServers.has(serverName)) {
          continue;
        }
        const mcpParams = {
          index,
          signal,
          user: safeUser,
          userMCPAuthMap,
          res: options.res,
          model: agent?.model ?? model,
          serverName: config.serverName,
          provider: agent?.provider ?? endpoint,
          config: config.config,
        };

        if (config.type === 'all' && toolConfigs.length === 1) {
          /** Handle async loading for single 'all' tool config */
          mcpToolPromises.push(
            createMCPTools(mcpParams).catch((error) => {
              logger.error(`Error loading ${serverName} tools:`, error);
              return null;
            }),
          );
          continue;
        }
        if (!availableTools) {
          try {
            availableTools = await getMCPServerTools(safeUser.id, serverName);
          } catch (error) {
            logger.error(`Error fetching available tools for MCP server ${serverName}:`, error);
          }
        }

        /** Handle synchronous loading */
        const mcpTool =
          config.type === 'all'
            ? await createMCPTools(mcpParams)
            : await createMCPTool({
                ...mcpParams,
                availableTools,
                toolKey: config.toolKey,
              });

        if (Array.isArray(mcpTool)) {
          loadedTools.push(...mcpTool);
        } else if (mcpTool) {
          loadedTools.push(mcpTool);
        } else {
          failedMCPServers.add(serverName);
          logger.warn(
            `MCP tool creation failed for "${config.toolKey}", server may be unavailable or unauthenticated.`,
          );
        }
      } catch (error) {
        logger.error(`Error loading MCP tool for server ${serverName}:`, error);
      }
    }
  }
  loadedTools.push(...(await Promise.all(mcpToolPromises)).flatMap((plugin) => plugin || []));
  return { loadedTools, toolContextMap };
};

module.exports = {
  loadToolWithAuth,
  validateTools,
  loadTools,
};
