const { Tools, Constants } = require('librechat-data-provider');
const { SerpAPI } = require('@langchain/community/tools/serpapi');
const { Calculator } = require('@langchain/community/tools/calculator');
const { createCodeExecutionTool, EnvVar } = require('@librechat/agents');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const {
  availableTools,
  // Basic Tools
  GoogleSearchAPI,
  // Structured Tools
  DALLE3,
  StructuredSD,
  StructuredACS,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  OpenWeather,
} = require('../');
const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
const { createFileSearchTool, primeFiles: primeSearchFiles } = require('./fileSearch');
const { createMCPTool } = require('~/server/services/MCP');
const { loadSpecs } = require('./loadSpecs');
const { logger } = require('~/config');

const mcpToolPattern = new RegExp(`^.+${Constants.mcp_delimiter}.+$`);

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
    throw new Error('There was a problem validating tools');
  }
};

const loadAuthValues = async ({ userId, authFields, throwError = true }) => {
  let authValues = {};

  /**
   * Finds the first non-empty value for the given authentication field, supporting alternate fields.
   * @param {string[]} fields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
   * @returns {Promise<{ authField: string, authValue: string} | null>} An object containing the authentication field and value, or null if not found.
   */
  const findAuthValue = async (fields) => {
    for (const field of fields) {
      let value = process.env[field];
      if (value) {
        return { authField: field, authValue: value };
      }
      try {
        value = await getUserPluginAuthValue(userId, field, throwError);
      } catch (err) {
        if (field === fields[fields.length - 1] && !value) {
          throw err;
        }
      }
      if (value) {
        return { authField: field, authValue: value };
      }
    }
    return null;
  };

  for (let authField of authFields) {
    const fields = authField.split('||');
    const result = await findAuthValue(fields);
    if (result) {
      authValues[result.authField] = result.authValue;
    }
  }

  return authValues;
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
 *
 * @param {object} object
 * @param {string} object.user
 * @param {Agent} [object.agent]
 * @param {string} [object.model]
 * @param {EModelEndpoint} [object.endpoint]
 * @param {LoadToolOptions} [object.options]
 * @param {boolean} [object.useSpecs]
 * @param {Array<string>} object.tools
 * @param {boolean} [object.functions]
 * @param {boolean} [object.returnMap]
 * @returns {Promise<{ loadedTools: Tool[], toolContextMap: Object<string, any> } | Record<string,Tool>>}
 */
const loadTools = async ({
  user,
  agent,
  model,
  endpoint,
  useSpecs,
  tools = [],
  options = {},
  functions = true,
  returnMap = false,
}) => {
  const toolConstructors = {
    calculator: Calculator,
    google: GoogleSearchAPI,
    wolfram: StructuredWolfram,
    'stable-diffusion': StructuredSD,
    'azure-ai-search': StructuredACS,
    traversaal_search: TraversaalSearch,
    tavily_search_results_json: TavilySearchResults,
    OpenWeather: OpenWeather,
  };

  const customConstructors = {
    serpapi: async () => {
      let apiKey = process.env.SERPAPI_API_KEY;
      if (!apiKey) {
        apiKey = await getUserPluginAuthValue(user, 'SERPAPI_API_KEY');
      }
      return new SerpAPI(apiKey, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
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
    fileStrategy: options.fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    serpapi: { location: 'Austin,Texas,United States', hl: 'en', gl: 'us' },
    dalle: imageGenOptions,
    'stable-diffusion': imageGenOptions,
  };

  const toolAuthFields = {};

  availableTools.forEach((tool) => {
    if (customConstructors[tool.pluginKey]) {
      return;
    }

    toolAuthFields[tool.pluginKey] = tool.authConfig.map((auth) => auth.authField);
  });

  const toolContextMap = {};
  const remainingTools = [];
  const appTools = options.req?.app?.locals?.availableTools ?? {};

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      requestedTools[tool] = async () => {
        const authValues = await loadAuthValues({
          userId: user,
          authFields: [EnvVar.CODE_API_KEY],
        });
        const codeApiKey = authValues[EnvVar.CODE_API_KEY];
        const { files, toolContext } = await primeCodeFiles(options, codeApiKey);
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
        const { files, toolContext } = await primeSearchFiles(options);
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        return createFileSearchTool({ req: options.req, files, entity_id: agent?.id });
      };
      continue;
    } else if (tool && appTools[tool] && mcpToolPattern.test(tool)) {
      requestedTools[tool] = async () =>
        createMCPTool({
          req: options.req,
          toolKey: tool,
          model: agent?.model ?? model,
          provider: agent?.provider ?? endpoint,
        });
      continue;
    }

    if (customConstructors[tool]) {
      requestedTools[tool] = customConstructors[tool];
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = loadToolWithAuth(
        user,
        toolAuthFields[tool],
        toolConstructors[tool],
        options,
      );
      requestedTools[tool] = toolInstance;
      continue;
    }

    if (functions === true) {
      remainingTools.push(tool);
    }
  }

  let specs = null;
  if (useSpecs === true && functions === true && remainingTools.length > 0) {
    specs = await loadSpecs({
      llm: model,
      user,
      message: options.message,
      memory: options.memory,
      signal: options.signal,
      tools: remainingTools,
      map: true,
      verbose: false,
    });
  }

  for (const tool of remainingTools) {
    if (specs && specs[tool]) {
      requestedTools[tool] = specs[tool];
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
  return { loadedTools, toolContextMap };
};

module.exports = {
  loadToolWithAuth,
  loadAuthValues,
  validateTools,
  loadTools,
};
