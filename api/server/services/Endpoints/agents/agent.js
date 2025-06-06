const { Providers } = require('@librechat/agents');
const { primeResources, optionalChainWithEmptyCheck } = require('@librechat/api');
const {
  ErrorTypes,
  EModelEndpoint,
  EToolResources,
  replaceSpecialVars,
  providerEndpointMap,
} = require('librechat-data-provider');
const initAnthropic = require('~/server/services/Endpoints/anthropic/initialize');
const getBedrockOptions = require('~/server/services/Endpoints/bedrock/options');
const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
const initCustom = require('~/server/services/Endpoints/custom/initialize');
const initGoogle = require('~/server/services/Endpoints/google/initialize');
const generateArtifactsPrompt = require('~/app/clients/prompts/artifacts');
const { getCustomEndpointConfig } = require('~/server/services/Config');
const { processFiles } = require('~/server/services/Files/process');
const { getConvoFiles } = require('~/models/Conversation');
const { getToolFilesByIds } = require('~/models/File');
const { getModelMaxTokens } = require('~/utils');
const { getFiles } = require('~/models/File');

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
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Agent} params.agent
 * @param {string | null} [params.conversationId]
 * @param {Array<IMongoFile>} [params.requestFiles]
 * @param {typeof import('~/server/services/ToolService').loadAgentTools | undefined} [params.loadTools]
 * @param {TEndpointOption} [params.endpointOption]
 * @param {Set<string>} [params.allowedProviders]
 * @param {boolean} [params.isInitialAgent]
 * @returns {Promise<Agent & { tools: StructuredTool[], attachments: Array<MongoFile>, toolContextMap: Record<string, unknown>, maxContextTokens: number }>}
 */
const initializeAgent = async ({
  req,
  res,
  agent,
  loadTools,
  requestFiles,
  conversationId,
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

  if (
    isInitialAgent &&
    conversationId != null &&
    (agent.model_parameters?.resendFiles ?? true) === true
  ) {
    const fileIds = (await getConvoFiles(conversationId)) ?? [];
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
    getFiles,
    attachments: currentFiles,
    tool_resources: agent.tool_resources,
    requestFileSet: new Set(requestFiles?.map((file) => file.file_id)),
  });

  const provider = agent.provider;
  const { tools, toolContextMap } =
    (await loadTools?.({
      req,
      res,
      provider,
      agentId: agent.id,
      tools: agent.tools,
      model: agent.model,
      tool_resources,
    })) ?? {};

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

module.exports = { initializeAgent };
