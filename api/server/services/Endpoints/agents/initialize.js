const { createContentAggregator, Providers } = require('@librechat/agents');
const {
  Constants,
  ErrorTypes,
  EModelEndpoint,
  EToolResources,
  getResponseSender,
  AgentCapabilities,
  replaceSpecialVars,
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
const { processFiles } = require('~/server/services/Files/process');
const { loadAgentTools } = require('~/server/services/ToolService');
const AgentClient = require('~/server/controllers/agents/client');
const { getConvoFiles } = require('~/models/Conversation');
const { getToolFilesByIds } = require('~/models/File');
const { getModelMaxTokens } = require('~/utils');
const { getAgent } = require('~/models/Agent');
const { getFiles } = require('~/models/File');
const { logger } = require('~/config');

const providerConfigMap = {
  [Providers.XAI]: initCustom,
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
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {Promise<Array<MongoFile | null>> | undefined} [params.attachments]
 * @param {Set<string>} params.requestFileSet
 * @param {AgentToolResources | undefined} [params.tool_resources]
 * @returns {Promise<{ attachments: Array<MongoFile | undefined> | undefined, tool_resources: AgentToolResources | undefined }>}
 */
const primeResources = async ({
  req,
  attachments: _attachments,
  tool_resources: _tool_resources,
  requestFileSet,
}) => {
  try {
    /** @type {Array<MongoFile | undefined> | undefined} */
    let attachments;
    const tool_resources = _tool_resources ?? {};
    const isOCREnabled = (req.app.locals?.[EModelEndpoint.agents]?.capabilities ?? []).includes(
      AgentCapabilities.ocr,
    );
    if (tool_resources[EToolResources.ocr]?.file_ids && isOCREnabled) {
      const context = await getFiles(
        {
          file_id: { $in: tool_resources.ocr.file_ids },
        },
        {},
        {},
      );
      attachments = (attachments ?? []).concat(context);
    }
    if (!_attachments) {
      return { attachments, tool_resources };
    }
    /** @type {Array<MongoFile | undefined> | undefined} */
    const files = await _attachments;
    if (!attachments) {
      /** @type {Array<MongoFile | undefined>} */
      attachments = [];
    }

    for (const file of files) {
      if (!file) {
        continue;
      }
      if (file.metadata?.fileIdentifier) {
        const execute_code = tool_resources[EToolResources.execute_code] ?? {};
        if (!execute_code.files) {
          tool_resources[EToolResources.execute_code] = { ...execute_code, files: [] };
        }
        tool_resources[EToolResources.execute_code].files.push(file);
      } else if (file.embedded === true) {
        const file_search = tool_resources[EToolResources.file_search] ?? {};
        if (!file_search.files) {
          tool_resources[EToolResources.file_search] = { ...file_search, files: [] };
        }
        tool_resources[EToolResources.file_search].files.push(file);
      } else if (
        requestFileSet.has(file.file_id) &&
        file.type.startsWith('image') &&
        file.height &&
        file.width
      ) {
        const image_edit = tool_resources[EToolResources.image_edit] ?? {};
        if (!image_edit.files) {
          tool_resources[EToolResources.image_edit] = { ...image_edit, files: [] };
        }
        tool_resources[EToolResources.image_edit].files.push(file);
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
 * @param  {...string | number} values
 * @returns {string | number | undefined}
 */
function optionalChainWithEmptyCheck(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return values[values.length - 1];
}

/**
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Agent} params.agent
 * @param {Set<string>} [params.allowedProviders]
 * @param {object} [params.endpointOption]
 * @param {boolean} [params.isInitialAgent]
 * @returns {Promise<Agent>}
 */
const initializeAgentOptions = async ({
  req,
  res,
  agent,
  endpointOption,
  allowedProviders,
  isInitialAgent = false,
}) => {
  if (allowedProviders.size > 0 && !allowedProviders.has(agent.provider)) {
    throw new Error(
      `{ "type": "${ErrorTypes.INVALID_AGENT_PROVIDER}", "info": "${agent.provider}" }`,
    );
  }
  let currentFiles;
  /** @type {Array<MongoFile>} */
  const requestFiles = req.body.files ?? [];
  if (
    isInitialAgent &&
    req.body.conversationId != null &&
    (agent.model_parameters?.resendFiles ?? true) === true
  ) {
    const fileIds = (await getConvoFiles(req.body.conversationId)) ?? [];
    /** @type {Set<EToolResources>} */
    const toolResourceSet = new Set();
    for (const tool of agent.tools) {
      if (EToolResources[tool]) {
        toolResourceSet.add(EToolResources[tool]);
      }
    }
    const toolFiles = await getToolFilesByIds(fileIds, toolResourceSet);
    if (requestFiles.length || toolFiles.length) {
      currentFiles = await processFiles(requestFiles.concat(toolFiles));
    }
  } else if (isInitialAgent && requestFiles.length) {
    currentFiles = await processFiles(requestFiles);
  }

  const { attachments, tool_resources } = await primeResources({
    req,
    attachments: currentFiles,
    tool_resources: agent.tool_resources,
    requestFileSet: new Set(requestFiles.map((file) => file.file_id)),
  });

  const provider = agent.provider;
  const { tools, toolContextMap } = await loadAgentTools({
    req,
    res,
    agent: {
      id: agent.id,
      tools: agent.tools,
      provider,
      model: agent.model,
    },
    tool_resources,
  });

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

  if (
    agent.endpoint === EModelEndpoint.azureOpenAI &&
    options.llmConfig?.azureOpenAIApiInstanceName == null
  ) {
    agent.provider = Providers.OPENAI;
  }

  if (options.provider != null) {
    agent.provider = options.provider;
  }

  /** @type {import('@librechat/agents').ClientOptions} */
  agent.model_parameters = Object.assign(model_parameters, options.llmConfig);
  if (options.configOptions) {
    agent.model_parameters.configuration = options.configOptions;
  }

  if (!agent.model_parameters.model) {
    agent.model_parameters.model = agent.model;
  }

  if (agent.instructions && agent.instructions !== '') {
    agent.instructions = replaceSpecialVars({
      text: agent.instructions,
      user: req.user,
    });
  }

  if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
    agent.additional_instructions = generateArtifactsPrompt({
      endpoint: agent.provider,
      artifacts: agent.artifacts,
    });
  }

  const tokensModel =
    agent.provider === EModelEndpoint.azureOpenAI ? agent.model : agent.model_parameters.model;
  const maxTokens = optionalChainWithEmptyCheck(
    agent.model_parameters.maxOutputTokens,
    agent.model_parameters.maxTokens,
    0,
  );
  const maxContextTokens = optionalChainWithEmptyCheck(
    agent.model_parameters.maxContextTokens,
    agent.max_context_tokens,
    getModelMaxTokens(tokensModel, providerEndpointMap[provider]),
    4096,
  );
  return {
    ...agent,
    tools,
    attachments,
    toolContextMap,
    maxContextTokens: (maxContextTokens - maxTokens) * 0.9,
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

  const agentConfigs = new Map();
  /** @type {Set<string>} */
  const allowedProviders = new Set(req?.app?.locals?.[EModelEndpoint.agents]?.allowedProviders);

  // Handle primary agent
  const primaryConfig = await initializeAgentOptions({
    req,
    res,
    agent: primaryAgent,
    endpointOption,
    allowedProviders,
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
        allowedProviders,
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
    res,
    sender,
    contentParts,
    agentConfigs,
    eventHandlers,
    collectedUsage,
    aggregateContent,
    artifactPromises,
    agent: primaryConfig,
    spec: endpointOption.spec,
    iconURL: endpointOption.iconURL,
    attachments: primaryConfig.attachments,
    endpointType: endpointOption.endpointType,
    maxContextTokens: primaryConfig.maxContextTokens,
    resendFiles: primaryConfig.model_parameters?.resendFiles ?? true,
    endpoint:
      primaryConfig.id === Constants.EPHEMERAL_AGENT_ID
        ? primaryConfig.endpoint
        : EModelEndpoint.agents,
  });

  return { client };
};

module.exports = { initializeClient };
