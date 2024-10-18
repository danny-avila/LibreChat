const { Tools } = require('librechat-data-provider');
const { ZapierToolKit } = require('langchain/agents');
const { Calculator } = require('langchain/tools/calculator');
const { SerpAPI, ZapierNLAWrapper } = require('langchain/tools');
const { createCodeExecutionTool, EnvVar } = require('@librechat/agents');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const {
  availableTools,
  // Basic Tools
  CodeBrew,
  AzureAISearch,
  GoogleSearchAPI,
  WolframAlphaAPI,
  OpenAICreateImage,
  StableDiffusionAPI,
  // Structured Tools
  DALLE3,
  E2BTools,
  CodeSherpa,
  StructuredSD,
  StructuredACS,
  CodeSherpaTools,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
} = require('../');
const createFileSearchTool = require('./createFileSearchTool');
const { loadToolSuite } = require('./loadToolSuite');
const primeCodeFiles = require('./primeCodeFiles');
const { loadSpecs } = require('./loadSpecs');
const { logger } = require('~/config');

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

const loadAuthValues = async ({ userId, authFields }) => {
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
        value = await getUserPluginAuthValue(userId, field);
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

/**
 * Initializes a tool with authentication values for the given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {string} userId The user ID for which the tool is being loaded.
 * @param {Array<string>} authFields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
 * @param {typeof import('langchain/tools').Tool} ToolConstructor The constructor function for the tool to be initialized.
 * @param {Object} options Optional parameters to be passed to the tool constructor alongside authentication values.
 * @returns {Function} An Async function that, when called, asynchronously initializes and returns an instance of the tool with authentication.
 */
const loadToolWithAuth = (userId, authFields, ToolConstructor, options = {}) => {
  return async function () {
    const authValues = await loadAuthValues({ userId, authFields });
    return new ToolConstructor({ ...options, ...authValues, userId });
  };
};

const loadTools = async ({
  user,
  model,
  functions = null,
  returnMap = false,
  tools = [],
  options = {},
  skipSpecs = false,
}) => {
  const toolConstructors = {
    tavily_search_results_json: TavilySearchResults,
    calculator: Calculator,
    google: GoogleSearchAPI,
    wolfram: functions ? StructuredWolfram : WolframAlphaAPI,
    'dall-e': OpenAICreateImage,
    'stable-diffusion': functions ? StructuredSD : StableDiffusionAPI,
    'azure-ai-search': functions ? StructuredACS : AzureAISearch,
    CodeBrew: CodeBrew,
    traversaal_search: TraversaalSearch,
  };

  const customConstructors = {
    e2b_code_interpreter: async () => {
      if (!functions) {
        return null;
      }

      return await loadToolSuite({
        pluginKey: 'e2b_code_interpreter',
        tools: E2BTools,
        user,
        options: {
          model,
          ...options,
        },
      });
    },
    codesherpa_tools: async () => {
      if (!functions) {
        return null;
      }

      return await loadToolSuite({
        pluginKey: 'codesherpa_tools',
        tools: CodeSherpaTools,
        user,
        options,
      });
    },
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
    zapier: async () => {
      let apiKey = process.env.ZAPIER_NLA_API_KEY;
      if (!apiKey) {
        apiKey = await getUserPluginAuthValue(user, 'ZAPIER_NLA_API_KEY');
      }
      const zapier = new ZapierNLAWrapper({ apiKey });
      return ZapierToolKit.fromZapierNLAWrapper(zapier);
    },
  };

  const requestedTools = {};

  if (functions) {
    toolConstructors.dalle = DALLE3;
    toolConstructors.codesherpa = CodeSherpa;
  }

  const imageGenOptions = {
    req: options.req,
    fileStrategy: options.fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    serpapi: { location: 'Austin,Texas,United States', hl: 'en', gl: 'us' },
    dalle: imageGenOptions,
    'dall-e': imageGenOptions,
    'stable-diffusion': imageGenOptions,
  };

  const toolAuthFields = {};

  availableTools.forEach((tool) => {
    if (customConstructors[tool.pluginKey]) {
      return;
    }

    toolAuthFields[tool.pluginKey] = tool.authConfig.map((auth) => auth.authField);
  });

  const remainingTools = [];

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      const authValues = await loadAuthValues({
        userId: user.id,
        authFields: [EnvVar.CODE_API_KEY],
      });
      const files = await primeCodeFiles(options);
      requestedTools[tool] = () =>
        createCodeExecutionTool({
          user_id: user.id,
          files,
          ...authValues,
        });
      continue;
    } else if (tool === Tools.file_search) {
      requestedTools[tool] = () => createFileSearchTool(options);
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

    if (functions) {
      remainingTools.push(tool);
    }
  }

  let specs = null;
  if (functions && remainingTools.length > 0 && skipSpecs !== true) {
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

  // load tools
  let result = [];
  for (const tool of tools) {
    const validTool = requestedTools[tool];
    if (!validTool) {
      continue;
    }
    const plugin = await validTool();

    if (Array.isArray(plugin)) {
      result = [...result, ...plugin];
    } else if (plugin) {
      result.push(plugin);
    }
  }

  return result;
};

module.exports = {
  loadToolWithAuth,
  loadAuthValues,
  validateTools,
  loadTools,
};
