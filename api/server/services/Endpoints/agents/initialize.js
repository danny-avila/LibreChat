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
const { logger } = require('~/config');

const providerConfigMap = {
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
  [Providers.OLLAMA]: initCustom,
};

/**
 *
 * @param {Promise<Array<MongoFile | null>> | undefined} _attachments
 * @param {AgentToolResources | undefined} _tool_resources
 * @returns {Promise<{ attachments: Array<MongoFile | undefined> | undefined, tool_resources: AgentToolResources | undefined }>}
 */
const primeResources = async (_attachments, _tool_resources) => {
  try {
    if (!_attachments) {
      return { attachments: undefined, tool_resources: _tool_resources };
    }
    /** @type {Array<MongoFile | undefined> | undefined} */
    const files = await _attachments;
    const attachments = [];
    const tool_resources = _tool_resources ?? {};

    for (const file of files) {
      if (!file) {
        continue;
      }
      if (file.metadata?.fileIdentifier) {
        const execute_code = tool_resources.execute_code ?? {};
        if (!execute_code.files) {
          tool_resources.execute_code = { ...execute_code, files: [] };
        }
        tool_resources.execute_code.files.push(file);
      } else if (file.embedded === true) {
        const file_search = tool_resources.file_search ?? {};
        if (!file_search.files) {
          tool_resources.file_search = { ...file_search, files: [] };
        }
        tool_resources.file_search.files.push(file);
      }

      attachments.push(file);
    }
    return { attachments, tool_resources };
  } catch (error) {
    logger.error('Error priming resources', error);
    return { attachments: _attachments, tool_resources: _tool_resources };
  }
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

  const { attachments, tool_resources } = await primeResources(
    endpointOption.attachments,
    agent.tool_resources,
  );

  const { tools } = await loadAgentTools({
    req,
    tools: agent.tools,
    agent_id: agent.id,
    tool_resources,
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

  const sender =
    agent.name ??
    getResponseSender({
      ...endpointOption,
      model: endpointOption.model_parameters.model,
    });

  const client = new AgentClient({
    req,
    agent,
    tools,
    sender,
    attachments,
    contentParts,
    modelOptions,
    eventHandlers,
    collectedUsage,
    artifactPromises,
    spec: endpointOption.spec,
    endpoint: EModelEndpoint.agents,
    resendFiles: endpointOption.resendFiles,
    maxContextTokens:
      endpointOption.maxContextTokens ??
      agent.max_context_tokens ??
      getModelMaxTokens(modelOptions.model, providerEndpointMap[provider]) ??
      4000,
  });
  return { client };
};

module.exports = { initializeClient };
