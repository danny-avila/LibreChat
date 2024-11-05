const { createContentAggregator, Providers } = require('@librechat/agents');
const {
  EModelEndpoint,
  getResponseSender,
  providerEndpointMap,
} = require('librechat-data-provider');
const {
  getDefaultHandlers,
  createToolEndCallback,
} = require('~/server/controllers/agents/callbacks');
const initAnthropic = require('~/server/services/Endpoints/anthropic/initialize');
const getBedrockOptions = require('~/server/services/Endpoints/bedrock/options');
const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
const initCustom = require('~/server/services/Endpoints/custom/initialize');
const { getCustomEndpointConfig } = require('~/server/services/Config');
const { loadAgentTools } = require('~/server/services/ToolService');
const AgentClient = require('~/server/controllers/agents/client');
const { getModelMaxTokens } = require('~/utils');

const providerConfigMap = {
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
  [Providers.OLLAMA]: initCustom,
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

  const { tools } = await loadAgentTools({
    req,
    tools: agent.tools,
    agent_id: agent.id,
    tool_resources: agent.tool_resources,
  });

  const provider = agent.provider;
  let modelOptions = { model: agent.model };
  let getOptions = providerConfigMap[provider];
  if (!getOptions) {
    const customEndpointConfig = await getCustomEndpointConfig(provider);
    if (!customEndpointConfig) {
      throw new Error(`Provider ${provider} not supported`);
    }
    getOptions = initCustom;
    agent.provider = Providers.OPENAI;
    agent.endpoint = provider.toLowerCase();
  }

  // TODO: pass-in override settings that are specific to current run
  endpointOption.model_parameters.model = agent.model;
  const options = await getOptions({
    req,
    res,
    endpointOption,
    optionsOnly: true,
    overrideEndpoint: provider,
    overrideModel: agent.model,
  });

  modelOptions = Object.assign(modelOptions, options.llmConfig);
  if (options.configOptions) {
    modelOptions.configuration = options.configOptions;
  }

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.model_parameters.model,
  });

  const client = new AgentClient({
    req,
    agent,
    tools,
    sender,
    contentParts,
    modelOptions,
    eventHandlers,
    collectedUsage,
    artifactPromises,
    endpoint: EModelEndpoint.agents,
    attachments: endpointOption.attachments,
    maxContextTokens:
      agent.max_context_tokens ??
      getModelMaxTokens(modelOptions.model, providerEndpointMap[provider]) ??
      4000,
  });
  return { client };
};

module.exports = { initializeClient };
