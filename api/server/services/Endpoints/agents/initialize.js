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
const initGoogle = require('~/server/services/Endpoints/google/initialize');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const { getCustomEndpointConfig } = require('~/server/services/Config');
const { loadAgentTools } = require('~/server/services/ToolService');
const AgentClient = require('~/server/controllers/agents/client');
const { getModelMaxTokens } = require('~/utils');
const { getAgent } = require('~/models/Agent');
const { logger } = require('~/config');

const providerConfigMap = {
  [Providers.OLLAMA]: initCustom,
  [Providers.DEEPSEEK]: initCustom,
  [Providers.OPENROUTER]: initCustom,
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.google]: initGoogle,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
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

/**
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Agent} params.agent
 * @param {object} [params.endpointOption]
 * @param {AgentToolResources} [params.tool_resources]
 * @param {boolean} [params.isInitialAgent]
 * @returns {Promise<Agent>}
 */
const initializeAgentOptions = async ({
  req,
  res,
  agent,
  endpointOption,
  tool_resources,
  isInitialAgent = false,
}) => {
  const { tools, toolContextMap } = await loadAgentTools({
    req,
    res,
    agent,
    tool_resources,
  });

  const provider = agent.provider;
  agent.endpoint = provider;
  let getOptions = providerConfigMap[provider];
  if (!getOptions && providerConfigMap[provider.toLowerCase()] != null) {
    agent.provider = provider.toLowerCase();
    getOptions = providerConfigMap[agent.provider];
  } else if (!getOptions) {
    const customEndpointConfig = await getCustomEndpointConfig(provider);
    if (!customEndpointConfig) {
      throw new Error(`Provider ${provider} not supported`);
    }
    getOptions = initCustom;
    agent.provider = Providers.OPENAI;
  }
  const model_parameters = Object.assign(
    {},
    agent.model_parameters ?? { model: agent.model },
    isInitialAgent === true ? endpointOption?.model_parameters : {},
  );
  const _endpointOption =
    isInitialAgent === true
      ? Object.assign({}, endpointOption, { model_parameters })
      : { model_parameters };

  const options = await getOptions({
    req,
    res,
    optionsOnly: true,
    overrideEndpoint: provider,
    overrideModel: agent.model,
    endpointOption: _endpointOption,
  });

  if (options.provider != null) {
    agent.provider = options.provider;
  }

  agent.model_parameters = Object.assign(model_parameters, options.llmConfig);
  if (options.configOptions) {
    agent.model_parameters.configuration = options.configOptions;
  }

  if (!agent.model_parameters.model) {
    agent.model_parameters.model = agent.model;
  }

  if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
    agent.additional_instructions = generateArtifactsPrompt({
      endpoint: agent.provider,
      artifacts: agent.artifacts,
    });
  }

  const tokensModel =
    agent.provider === EModelEndpoint.azureOpenAI ? agent.model : agent.model_parameters.model;

  return {
    ...agent,
    tools,
    toolContextMap,
    maxContextTokens:
      agent.max_context_tokens ??
      getModelMaxTokens(tokensModel, providerEndpointMap[provider]) ??
      4000,
  };
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

  // Initialize primary agent
  const primaryAgent = await endpointOption.agent;
  if (!primaryAgent) {
    throw new Error('Agent not found');
  }

  const { attachments, tool_resources } = await primeResources(
    endpointOption.attachments,
    primaryAgent.tool_resources,
  );

  const agentConfigs = new Map();

  // Handle primary agent
  const primaryConfig = await initializeAgentOptions({
    req,
    res,
    agent: primaryAgent,
    endpointOption,
    tool_resources,
    isInitialAgent: true,
  });

  const agent_ids = primaryConfig.agent_ids;
  if (agent_ids?.length) {
    for (const agentId of agent_ids) {
      const agent = await getAgent({ id: agentId });
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }
      const config = await initializeAgentOptions({
        req,
        res,
        agent,
        endpointOption,
      });
      agentConfigs.set(agentId, config);
    }
  }

  const sender =
    primaryAgent.name ??
    getResponseSender({
      ...endpointOption,
      model: endpointOption.model_parameters.model,
    });

  const client = new AgentClient({
    req,
    agent: primaryConfig,
    sender,
    attachments,
    contentParts,
    eventHandlers,
    collectedUsage,
    artifactPromises,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    agentConfigs,
    endpoint: EModelEndpoint.agents,
    maxContextTokens: primaryConfig.maxContextTokens,
  });

  return { client };
};

module.exports = { initializeClient };
