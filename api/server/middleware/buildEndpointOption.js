const { handleError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  EndpointURLs,
  EModelEndpoint,
  Constants,
  isAgentsEndpoint,
  parseCompactConvo,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const anthropic = require('~/server/services/Endpoints/anthropic');
const bedrock = require('~/server/services/Endpoints/bedrock');
const openAI = require('~/server/services/Endpoints/openAI');
const agents = require('~/server/services/Endpoints/agents');
const custom = require('~/server/services/Endpoints/custom');
const google = require('~/server/services/Endpoints/google');
const {
  getCodeCanModel,
  getCodeCanFileId,
  getJurisdiction,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_MAX_NUM_RESULTS,
} = require('~/server/services/prompts/codeCan');

const buildFunction = {
  [EModelEndpoint.openAI]: openAI.buildOptions,
  [EModelEndpoint.google]: google.buildOptions,
  [EModelEndpoint.custom]: custom.buildOptions,
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.bedrock]: bedrock.buildOptions,
  [EModelEndpoint.azureOpenAI]: openAI.buildOptions,
  [EModelEndpoint.anthropic]: anthropic.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

async function buildEndpointOption(req, res, next) {
  // Resolve jurisdiction in request-priority order. The handler may override again with the
  // value locked onto the conversation document.
  const requestedJurisdictionId =
    req.body?.jurisdiction ||
    req.body?.conversation?.jurisdiction ||
    req.user?.personalization?.jurisdiction ||
    DEFAULT_JURISDICTION_ID;
  const jurisdiction = getJurisdiction(requestedJurisdictionId);
  const codeCanPrompt = jurisdiction.systemPrompt;
  const codeCanModel = getCodeCanModel();
  req.body.endpoint = EModelEndpoint.openAI;
  req.body.endpointType = EModelEndpoint.openAI;
  req.body.agent_id = Constants.EPHEMERAL_AGENT_ID;
  req.body.model = codeCanModel;
  req.body.promptPrefix = codeCanPrompt;
  // Stash so the handler can persist on conversation create and reuse without re-resolving.
  req.body.resolvedJurisdictionId = jurisdiction.id;
  logger.info('[CodeCan] Config', {
    model: codeCanModel,
    fileId: getCodeCanFileId(),
    jurisdictionId: jurisdiction.id,
    vectorStoreIds: jurisdiction.vectorStoreIds,
  });

  const { endpoint, endpointType } = req.body;
  if (endpoint !== EModelEndpoint.openAI || endpointType !== EModelEndpoint.openAI) {
    return handleError(res, { text: 'Only CodeCan OpenAI endpoint is allowed' });
  }

  let parsedBody;
  try {
    parsedBody = parseCompactConvo({ endpoint, endpointType, conversation: req.body });
  } catch (error) {
    logger.warn(
      `Error parsing conversation for endpoint ${endpoint}${error?.message ? `: ${error.message}` : ''}`,
    );
    return handleError(res, { text: 'Error parsing conversation' });
  }

  const appConfig = req.config;
  if (appConfig.modelSpecs?.list && appConfig.modelSpecs?.enforce) {
    /** @type {{ list: TModelSpec[] }}*/
    const { list } = appConfig.modelSpecs;
    const { spec } = parsedBody;

    if (!spec) {
      return handleError(res, { text: 'No model spec selected' });
    }

    const currentModelSpec = list.find((s) => s.name === spec);
    if (!currentModelSpec) {
      return handleError(res, { text: 'Invalid model spec' });
    }

    if (endpoint !== currentModelSpec.preset.endpoint) {
      return handleError(res, { text: 'Model spec mismatch' });
    }

    try {
      currentModelSpec.preset.spec = spec;
      if (currentModelSpec.iconURL != null && currentModelSpec.iconURL !== '') {
        currentModelSpec.preset.iconURL = currentModelSpec.iconURL;
      }
      parsedBody = parseCompactConvo({
        endpoint,
        endpointType,
        conversation: currentModelSpec.preset,
      });
    } catch (error) {
      logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
      return handleError(res, { text: 'Error parsing model spec' });
    }
  }

  const fileSearchTool = [
    {
      type: 'file_search',
      vector_store_ids: jurisdiction.vectorStoreIds,
      max_num_results: DEFAULT_MAX_NUM_RESULTS,
    },
  ];
  const fileSearchResources = {
    file_search: { vector_store_ids: jurisdiction.vectorStoreIds },
  };

  parsedBody.promptPrefix = codeCanPrompt;
  parsedBody.model = codeCanModel;
  parsedBody.model_parameters = Object.assign({}, parsedBody.model_parameters, {
    model: codeCanModel,
    useResponsesApi: true,
    instructions: codeCanPrompt,
    tools: fileSearchTool,
    // tool_choice is decided per-turn inside codeCanDirect.js so follow-ups don't re-search.
    tool_resources: fileSearchResources,
    modelKwargs: Object.assign({}, parsedBody.model_parameters?.modelKwargs),
  });
  parsedBody.useResponsesApi = true;
  parsedBody.agent_id = Constants.EPHEMERAL_AGENT_ID;

  // Lock down user-provided overrides and unsupported tools/features
  delete parsedBody.tools;
  delete parsedBody.plugins;
  delete parsedBody.functions;
  delete parsedBody.mcpServers;
  delete parsedBody.files;
  delete req.body.files;

  try {
    const isAgents =
      isAgentsEndpoint(endpoint) || req.baseUrl.startsWith(EndpointURLs[EModelEndpoint.agents]);
    const builder = isAgents
      ? (...args) => buildFunction[EModelEndpoint.agents](req, ...args)
      : buildFunction[endpointType ?? endpoint];

    // TODO: use object params
    req.body.endpointOption = await builder(endpoint, parsedBody, endpointType);
    if (!req.body.endpointOption.modelOptions) {
      req.body.endpointOption.modelOptions = {};
    }
    req.body.endpointOption.modelOptions.model = codeCanModel;
    req.body.endpointOption.modelOptions.useResponsesApi = true;
    req.body.endpointOption.modelOptions.instructions = codeCanPrompt;
    req.body.endpointOption.modelOptions.tools = fileSearchTool;
    req.body.endpointOption.modelOptions.tool_resources = fileSearchResources;
    // Surface the resolved jurisdiction so the handler can persist + lock it on the conversation.
    req.body.endpointOption.jurisdictionId = jurisdiction.id;
    req.body.endpointOption.modelOptions.modelKwargs = Object.assign(
      {},
      req.body.endpointOption.modelOptions?.modelKwargs,
    );
    // User-provided attachments/uploads are not supported in the CodeCan-locked experience.
    req.body.endpointOption.attachments = [];

    console.log('[CodeCan] endpointOption', JSON.stringify(req.body.endpointOption, null, 2));

    next();
  } catch (error) {
    logger.error(
      `Error building endpoint option for endpoint ${endpoint} with type ${endpointType}`,
      error,
    );
    return handleError(res, { text: 'Error building endpoint option' });
  }
}

module.exports = buildEndpointOption;
