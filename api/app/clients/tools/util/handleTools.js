const { getUserPluginAuthValue } = require('../../../../server/services/PluginService');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { ZapierToolKit } = require('langchain/agents');
const { SerpAPI, ZapierNLAWrapper } = require('langchain/tools');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { Calculator } = require('langchain/tools/calculator');
const { WebBrowser } = require('langchain/tools/webbrowser');
const {
  availableTools,
  CodeInterpreter,
  AIPluginTool,
  GoogleSearchAPI,
  WolframAlphaAPI,
  StructuredWolfram,
  HttpRequestTool,
  OpenAICreateImage,
  StableDiffusionAPI,
  StructuredSD,
  AzureCognitiveSearch,
  StructuredACS,
  E2BTools,
  CodeSherpa,
  CodeSherpaTools,
} = require('../');
const { loadSpecs } = require('./loadSpecs');
const { loadToolSuite } = require('./loadToolSuite');

const getOpenAIKey = async (options, user) => {
  let openAIApiKey = options.openAIApiKey ?? process.env.OPENAI_API_KEY;
  openAIApiKey = openAIApiKey === 'user_provided' ? null : openAIApiKey;
  return openAIApiKey || (await getUserPluginAuthValue(user, 'OPENAI_API_KEY'));
};

const validateTools = async (user, tools = []) => {
  try {
    const validToolsSet = new Set(tools);
    const availableToolsToValidate = availableTools.filter((tool) =>
      validToolsSet.has(tool.pluginKey),
    );

    const validateCredentials = async (authField, toolName) => {
      const adminAuth = process.env[authField];
      if (adminAuth && adminAuth.length > 0) {
        return;
      }

      const userAuth = await getUserPluginAuthValue(user, authField);
      if (userAuth && userAuth.length > 0) {
        return;
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
    console.log('There was a problem validating tools', err);
    throw new Error(err);
  }
};

const loadToolWithAuth = async (user, authFields, ToolConstructor, options = {}) => {
  return async function () {
    let authValues = {};

    for (const authField of authFields) {
      let authValue = process.env[authField];
      if (!authValue) {
        authValue = await getUserPluginAuthValue(user, authField);
      }
      authValues[authField] = authValue;
    }

    return new ToolConstructor({ ...options, ...authValues });
  };
};

const loadTools = async ({
  user,
  model,
  functions = null,
  returnMap = false,
  tools = [],
  options = {},
}) => {
  const toolConstructors = {
    calculator: Calculator,
    codeinterpreter: CodeInterpreter,
    google: GoogleSearchAPI,
    wolfram: functions ? StructuredWolfram : WolframAlphaAPI,
    'dall-e': OpenAICreateImage,
    'stable-diffusion': functions ? StructuredSD : StableDiffusionAPI,
    'azure-cognitive-search': functions ? StructuredACS : AzureCognitiveSearch,
  };

  const openAIApiKey = await getOpenAIKey(options, user);

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
          openAIApiKey,
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
    'web-browser': async () => {
      // let openAIApiKey = options.openAIApiKey ?? process.env.OPENAI_API_KEY;
      // openAIApiKey = openAIApiKey === 'user_provided' ? null : openAIApiKey;
      // openAIApiKey = openAIApiKey || (await getUserPluginAuthValue(user, 'OPENAI_API_KEY'));
      const browser = new WebBrowser({ model, embeddings: new OpenAIEmbeddings({ openAIApiKey }) });
      browser.description_for_model = browser.description;
      return browser;
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
    plugins: async () => {
      return [
        new HttpRequestTool(),
        await AIPluginTool.fromPluginUrl(
          'https://www.klarna.com/.well-known/ai-plugin.json',
          new ChatOpenAI({ openAIApiKey: options.openAIApiKey, temperature: 0 }),
        ),
      ];
    },
  };

  const requestedTools = {};

  if (functions) {
    toolConstructors.codesherpa = CodeSherpa;
  }

  const toolOptions = {
    serpapi: { location: 'Austin,Texas,United States', hl: 'en', gl: 'us' },
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
    if (customConstructors[tool]) {
      requestedTools[tool] = customConstructors[tool];
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = await loadToolWithAuth(
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
  if (functions && remainingTools.length > 0) {
    specs = await loadSpecs({
      llm: model,
      user,
      message: options.message,
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
  validateTools,
  loadTools,
};
