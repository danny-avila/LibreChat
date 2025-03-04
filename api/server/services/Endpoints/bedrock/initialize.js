const { createContentAggregator } = require('@librechat/agents');
const {
  EModelEndpoint,
  providerEndpointMap,
  getResponseSender,
} = require('librechat-data-provider');
const { getDefaultHandlers } = require('~/server/controllers/agents/callbacks');
const getOptions = require('~/server/services/Endpoints/bedrock/options');
const BedrockAgentClient = require('~/server/services/Endpoints/bedrock/agent');
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

  /** @type {Agent} */
  const agent = {
    id: EModelEndpoint.bedrock,
    name: 'Bedrock Agent',
    instructions: endpointOption.promptPrefix,
    provider: EModelEndpoint.bedrock,
    model: undefined,
    model_parameters: {
      ...endpointOption.model_parameters,
      model: undefined,
      agentId: process.env.BEDROCK_AGENT_ID,
      agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID,
    },
  };

  if (typeof endpointOption.artifactsPrompt === 'string' && endpointOption.artifactsPrompt) {
    agent.instructions = `${agent.instructions ?? ''}\n${endpointOption.artifactsPrompt}`.trim();
  }

  // TODO: pass-in override settings that are specific to current run
  const options = await getOptions({
    req,
    res,
    endpointOption,
  });

  agent.model_parameters = Object.assign(agent.model_parameters, options.llmConfig);
  if (options.configOptions) {
    agent.model_parameters.configuration = options.configOptions;
  }

  const sender =
    agent.name ??
    getResponseSender({
      ...endpointOption,
      model: endpointOption.model_parameters.model,
    });

  const bedrockClient = new BedrockAgentClient({
    region: options.llmConfig.region,
    credentials: options.llmConfig.credentials,
  });

  const client = new AgentClient({
    req,
    agent,
    sender,
    bedrockClient,
    contentParts,
    eventHandlers,
    collectedUsage,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    endpoint: EModelEndpoint.bedrock,
    resendFiles: endpointOption.resendFiles,
    maxContextTokens:
      endpointOption.maxContextTokens ??
      agent.max_context_tokens ??
      getModelMaxTokens(agent.model_parameters.model, providerEndpointMap[agent.provider]) ??
      4000,
    attachments: endpointOption.attachments,
  });
  return { client };
};

module.exports = { initializeClient };
