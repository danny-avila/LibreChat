const { createContentAggregator } = require('@librechat/agents');
const {
  EModelEndpoint,
  providerEndpointMap,
  getResponseSender,
} = require('librechat-data-provider');
const { getDefaultHandlers } = require('~/server/controllers/agents/callbacks');
// const { loadAgentTools } = require('~/server/services/ToolService');
const getOptions = require('~/server/services/Endpoints/bedrock/options');
const AgentClient = require('~/server/controllers/agents/client');
const { getModelMaxTokens } = require('~/utils');

const initializeClient = async ({ req, res, endpointOption }) => {
  if (!endpointOption) {
    throw new Error('Endpoint option not provided');
  }

  /** @type {Array<UsageMetadata>} */
  const collectedUsage = [];
  const { contentParts, aggregateContent } = createContentAggregator();
  const eventHandlers = getDefaultHandlers({ res, aggregateContent, collectedUsage });

  // const tools = [createTavilySearchTool()];

  /** @type {Agent} */
  const agent = {
    id: EModelEndpoint.bedrock,
    name: endpointOption.name,
    instructions: endpointOption.promptPrefix,
    provider: EModelEndpoint.bedrock,
    model: endpointOption.model_parameters.model,
    model_parameters: endpointOption.model_parameters,
  };

  if (typeof endpointOption.artifactsPrompt === 'string' && endpointOption.artifactsPrompt) {
    agent.instructions = `${agent.instructions ?? ''}\n${endpointOption.artifactsPrompt}`.trim();
  }

  let modelOptions = { model: agent.model };

  // TODO: pass-in override settings that are specific to current run
  const options = await getOptions({
    req,
    res,
    endpointOption,
  });

  modelOptions = Object.assign(modelOptions, options.llmConfig);
  const maxContextTokens =
    agent.max_context_tokens ??
    getModelMaxTokens(modelOptions.model, providerEndpointMap[agent.provider]);

  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.model_parameters.model,
  });

  const client = new AgentClient({
    req,
    agent,
    sender,
    // tools,
    modelOptions,
    contentParts,
    eventHandlers,
    collectedUsage,
    maxContextTokens,
    endpoint: EModelEndpoint.bedrock,
    configOptions: options.configOptions,
    attachments: endpointOption.attachments,
  });
  return { client };
};

module.exports = { initializeClient };
