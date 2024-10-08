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
const { createContentAggregator } = require('@librechat/agents');
const {
  EModelEndpoint,
  getResponseSender,
  providerEndpointMap,
} = require('librechat-data-provider');
const {
  getDefaultHandlers,
  createToolEndCallback,
} = require('~/server/controllers/agents/callbacks');
const initAnthropic = require('server/services/Endpoints/anthropic/initialize');
const initOpenAI = require('server/services/Endpoints/openAI/initialize');
const getBedrockOptions = require('~/server/services/Endpoints/bedrock/options');
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
  [EModelEndpoint.bedrock]: getBedrockOptions,
};

const initializeClient = async ({ req, res, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }

  // TODO: use endpointOption to determine options/modelOptions
  /** @type {Array<UsageMetadata>} */
  const collectedUsage = [];
  /** @type {ArtifactPromises} */
  const artifactPromises = [];
  const { contentParts, aggregateContent } = createContentAggregator();
  const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
  const eventHandlers = getDefaultHandlers({
    res,
    aggregateContent,
    toolEndCallback,
    collectedUsage,
  });

  if (!endpointOption.agent) {
    throw new Error('No agent promise provided');
  }

  /** @type {Agent | null} */
  const agent = await endpointOption.agent;
  if (!agent) {
    throw new Error('Agent not found');
  }
  const { tools, toolMap } = await loadAgentTools({
    req,
    tools: agent.tools,
    agent_id: agent.id,
    tool_resources: agent.tool_resources,
    // openAIApiKey: process.env.OPENAI_API_KEY,
  });

  let modelOptions = { model: agent.model };
  const getOptions = providerConfigMap[agent.provider];
  if (!getOptions) {
    throw new Error(`Provider ${agent.provider} not supported`);
  }

  // TODO: pass-in override settings that are specific to current run
  endpointOption.model_parameters.model = agent.model;
  const options = await getOptions({
    req,
    res,
    endpointOption,
    optionsOnly: true,
    overrideEndpoint: agent.provider,
    overrideModel: agent.model,
  });
  modelOptions = Object.assign(modelOptions, options.llmConfig);

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.model_parameters.model,
  });

  const client = new AgentClient({
    req,
    agent,
    tools,
    sender,
    toolMap,
    contentParts,
    modelOptions,
    eventHandlers,
    collectedUsage,
    artifactPromises,
    endpoint: EModelEndpoint.agents,
    configOptions: options.configOptions,
    attachments: endpointOption.attachments,
    maxContextTokens:
      agent.max_context_tokens ??
      getModelMaxTokens(modelOptions.model, providerEndpointMap[agent.provider]),
  });
  return { client };
};

module.exports = { initializeClient };
