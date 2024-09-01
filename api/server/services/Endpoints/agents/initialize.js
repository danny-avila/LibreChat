// const {
//   ErrorTypes,
//   EModelEndpoint,
//   resolveHeaders,
//   mapModelToAzureConfig,
// } = require('librechat-data-provider');
// const { getUserKeyValues, checkUserKeyExpiry } = require('~/server/services/UserService');
// const { isEnabled, isUserProvided } = require('~/server/utils');
// const { getAzureCredentials } = require('~/utils');
// const { OpenAIClient } = require('~/app');

const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { EModelEndpoint, providerEndpointMap } = require('librechat-data-provider');
const { getDefaultHandlers } = require('~/server/controllers/agents/callbacks');
// for testing purposes
// const createTavilySearchTool = require('~/app/clients/tools/structured/TavilySearch');
const initAnthropic = require('~/server/services/Endpoints/anthropic/initializeClient');
const initOpenAI = require('~/server/services/Endpoints/openAI/initializeClient');
const { loadAgentTools } = require('~/server/services/ToolService');
const AgentClient = require('~/server/controllers/agents/client');
const { getModelMaxTokens } = require('~/utils');

/* For testing errors */
const _getWeather = tool(
  async ({ location }) => {
    if (location === 'SAN FRANCISCO') {
      return 'It\'s 60 degrees and foggy';
    } else if (location.toLowerCase() === 'san francisco') {
      throw new Error('Input queries must be all capitals');
    } else {
      throw new Error('Invalid input.');
    }
  },
  {
    name: 'get_weather',
    description: 'Call to get the current weather',
    schema: z.object({
      location: z.string(),
    }),
  },
);

const providerConfigMap = {
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
};

const initializeClient = async ({ req, res, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }

  // TODO: use endpointOption to determine options/modelOptions
  const eventHandlers = getDefaultHandlers({ res });

  // const tools = [createTavilySearchTool()];
  // const tools = [_getWeather];
  // const tool_calls = [{ name: 'getPeople_action_swapi---dev' }];
  // const tool_calls = [{ name: 'dalle' }];
  // const tool_calls = [{ name: 'getItmOptions_action_YWlhcGkzLn' }];
  // const tool_calls = [{ name: 'tavily_search_results_json' }];
  // const tool_calls = [
  //   { name: 'searchListings_action_emlsbG93NT' },
  //   { name: 'searchAddress_action_emlsbG93NT' },
  //   { name: 'searchMLS_action_emlsbG93NT' },
  //   { name: 'searchCoordinates_action_emlsbG93NT' },
  //   { name: 'searchUrl_action_emlsbG93NT' },
  //   { name: 'getPropertyDetails_action_emlsbG93NT' },
  // ];

  if (!endpointOption.agent) {
    throw new Error('No agent promise provided');
  }

  /** @type {Agent} */
  const agent = await endpointOption.agent;
  const { tools, toolMap } = await loadAgentTools({
    req,
    tools: agent.tools,
    agent_id: agent.id,
    // openAIApiKey: process.env.OPENAI_API_KEY,
  });

  let modelOptions = { model: agent.model };
  const getOptions = providerConfigMap[agent.provider];
  if (!getOptions) {
    throw new Error(`Provider ${agent.provider} not supported`);
  }

  // TODO: pass-in override settings that are specific to current run
  endpointOption.modelOptions.model = agent.model;
  const options = await getOptions({
    req,
    res,
    endpointOption,
    optionsOnly: true,
    overrideEndpoint: agent.provider,
    overrideModel: agent.model,
  });
  modelOptions = Object.assign(modelOptions, options.llmConfig);

  const client = new AgentClient({
    req,
    agent,
    tools,
    toolMap,
    modelOptions,
    eventHandlers,
    endpoint: EModelEndpoint.agents,
    configOptions: options.configOptions,
    maxContextTokens:
      agent.max_context_tokens ??
      getModelMaxTokens(modelOptions.model, providerEndpointMap[agent.provider]),
  });
  return { client };
};

module.exports = { initializeClient };
