const {
  handleError,
  applyModelSpecPreset,
  findModelSpecByName,
  isModelSpecEndpointMatch,
  resolveModelSpecPromptPrefixVariables,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  EndpointURLs,
  EModelEndpoint,
  isAgentsEndpoint,
  parseCompactConvo,
  getDefaultParamsEndpoint,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const { getEndpointsConfig } = require('~/server/services/Config');
const agents = require('~/server/services/Endpoints/agents');
const { updateFilesUsage } = require('~/models');

const buildFunction = {
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

async function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;
  const isAgents =
    isAgentsEndpoint(endpoint) || req.baseUrl.startsWith(EndpointURLs[EModelEndpoint.agents]);

  let endpointsConfig;
  try {
    endpointsConfig = await getEndpointsConfig(req);
  } catch (error) {
    logger.error('Error fetching endpoints config in buildEndpointOption', error);
  }

  const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, endpoint);

  let parsedBody;
  try {
    parsedBody = parseCompactConvo({
      endpoint,
      endpointType,
      conversation: req.body,
      defaultParamsEndpoint,
    });
  } catch (error) {
    logger.error(`Error parsing compact conversation for endpoint ${endpoint}`, error);
    logger.debug({
      'Error parsing compact conversation': { endpoint, endpointType, conversation: req.body },
    });
    return handleError(res, { text: 'Error parsing conversation' });
  }

  const appConfig = req.config;
  let appliedModelSpecPrivateFields = new Set();
  /** Provider endpoint for ephemeral agents — may differ from `req.body.endpoint`
   *  when a conversation still carries a stale endpoint (e.g. OpenRouter) after a
   *  model-spec migration to a native provider (e.g. anthropic). */
  let providerEndpoint = endpoint;
  let providerEndpointType = endpointType;
  /**
   * On the agents endpoint a tool-enabled spec runs as an ephemeral agent: the
   * request `endpoint` is `agents` while the spec's `preset.endpoint` is the
   * underlying provider (e.g. `anthropic`). We still APPLY the spec preset here
   * (it populates `model`, instructions, and params — without it the ephemeral
   * agent has no model and fails validation with MISSING_MODEL), but we skip the
   * strict `isModelSpecEndpointMatch` rejection, which would otherwise falsely
   * fail the agents/provider mismatch.
   */
  if (appConfig.modelSpecs?.list?.length && appConfig.modelSpecs?.enforce) {
    /** @type {{ list: TModelSpec[] }}*/
    const { list } = appConfig.modelSpecs;
    const { spec } = parsedBody;

    if (!spec) {
      return handleError(res, { text: 'No model spec selected' });
    }

    const currentModelSpec = findModelSpecByName({ list }, spec);
    if (!currentModelSpec) {
      return handleError(res, { text: 'Invalid model spec' });
    }

    if (!isAgents && !isModelSpecEndpointMatch(currentModelSpec, endpoint)) {
      return handleError(res, { text: 'Model spec mismatch' });
    }

    providerEndpoint = currentModelSpec.preset?.endpoint ?? endpoint;
    providerEndpointType =
      providerEndpoint !== endpoint
        ? (currentModelSpec.preset?.endpointType ?? undefined)
        : endpointType;

    try {
      const result = applyModelSpecPreset({
        modelSpec: currentModelSpec,
        parsedBody: currentModelSpec.preset,
        endpoint: providerEndpoint,
        endpointType: providerEndpointType,
        defaultParamsEndpoint: getDefaultParamsEndpoint(endpointsConfig, providerEndpoint),
        includePresetDefaults: true,
      });
      parsedBody = result.parsedBody;
      appliedModelSpecPrivateFields = result.appliedPrivateFields;
    } catch (error) {
      logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
      return handleError(res, { text: 'Error parsing model spec' });
    }
  } else if (parsedBody.spec && appConfig.modelSpecs?.list) {
    const modelSpec = findModelSpecByName(appConfig.modelSpecs, parsedBody.spec);
    if (modelSpec) {
      if (!isAgents && !isModelSpecEndpointMatch(modelSpec, endpoint)) {
        return handleError(res, { text: 'Model spec mismatch' });
      }

      providerEndpoint = modelSpec.preset?.endpoint ?? endpoint;
      providerEndpointType =
        providerEndpoint !== endpoint
          ? (modelSpec.preset?.endpointType ?? undefined)
          : endpointType;

      try {
        const result = applyModelSpecPreset({
          modelSpec,
          parsedBody,
          endpoint: providerEndpoint,
          endpointType: providerEndpointType,
          defaultParamsEndpoint: getDefaultParamsEndpoint(endpointsConfig, providerEndpoint),
        });
        parsedBody = result.parsedBody;
        appliedModelSpecPrivateFields = result.appliedPrivateFields;
      } catch (error) {
        logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
        return handleError(res, { text: 'Error parsing model spec' });
      }
    }
  }

  if (!isAgents && appliedModelSpecPrivateFields.has('promptPrefix')) {
    parsedBody = resolveModelSpecPromptPrefixVariables(
      parsedBody,
      req.user,
      req.body.clientTimestamp,
    );
  }

  try {
    const builder = isAgents
      ? (...args) => buildFunction[EModelEndpoint.agents](req, ...args)
      : buildFunction[endpointType ?? endpoint];

    // TODO: use object params
    req.body = req.body || {}; // Express 5: ensure req.body exists
    req.body.endpointOption = await builder(providerEndpoint, parsedBody, providerEndpointType);

    if (req.body.files && !isAgents) {
      req.body.endpointOption.attachments = updateFilesUsage(req.body.files);
    }

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
