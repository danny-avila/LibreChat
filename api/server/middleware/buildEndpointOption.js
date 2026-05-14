const { handleError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  EndpointURLs,
  EModelEndpoint,
  isAgentsEndpoint,
  parseCompactConvo,
  replaceSpecialVars,
  getDefaultParamsEndpoint,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const { getEndpointsConfig } = require('~/server/services/Config');
const agents = require('~/server/services/Endpoints/agents');
const { updateFilesUsage } = require('~/models');

const PRIVATE_MODEL_SPEC_PRESET_FIELDS = [
  'promptPrefix',
  'instructions',
  'additional_instructions',
  'system',
  'context',
  'examples',
];

const buildFunction = {
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

function hasValue(field, value) {
  if (value == null || value === '') {
    return false;
  }

  if (!Array.isArray(value)) {
    return true;
  }

  if (field === 'examples') {
    return value.some((example) => {
      const input = example?.input?.content;
      const output = example?.output?.content;
      return Boolean(input || output);
    });
  }

  return value.length > 0;
}

function mergeModelSpecPreset(modelSpec, parsedBody) {
  const preset = modelSpec?.preset;
  if (!preset || typeof preset !== 'object') {
    return parsedBody;
  }

  const merged = {
    ...preset,
    ...parsedBody,
    spec: modelSpec.name,
  };

  for (const field of PRIVATE_MODEL_SPEC_PRESET_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(preset, field) &&
      !hasValue(field, parsedBody[field])
    ) {
      merged[field] = preset[field];
    }
  }

  return merged;
}

function parseModelSpecPreset({
  modelSpec,
  parsedBody,
  endpoint,
  endpointType,
  defaultParamsEndpoint,
}) {
  const conversation = mergeModelSpecPreset(modelSpec, parsedBody);
  const reparsedBody = parseCompactConvo({
    endpoint,
    endpointType,
    conversation,
    defaultParamsEndpoint,
  });

  if (modelSpec.iconURL != null && modelSpec.iconURL !== '') {
    reparsedBody.iconURL = modelSpec.iconURL;
  }

  return reparsedBody;
}

function resolvePromptPrefixVariables(parsedBody, user, now) {
  if (typeof parsedBody.promptPrefix !== 'string') {
    return parsedBody;
  }

  return {
    ...parsedBody,
    promptPrefix: replaceSpecialVars({
      text: parsedBody.promptPrefix,
      user,
      now,
    }),
  };
}

async function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;

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
  if (appConfig.modelSpecs?.list?.length && appConfig.modelSpecs?.enforce) {
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
      parsedBody = parseModelSpecPreset({
        modelSpec: currentModelSpec,
        parsedBody: currentModelSpec.preset,
        endpoint,
        endpointType,
        defaultParamsEndpoint,
      });
    } catch (error) {
      logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
      return handleError(res, { text: 'Error parsing model spec' });
    }
  } else if (parsedBody.spec && appConfig.modelSpecs?.list) {
    const modelSpec = appConfig.modelSpecs.list.find((s) => s.name === parsedBody.spec);
    if (modelSpec) {
      try {
        parsedBody = parseModelSpecPreset({
          modelSpec,
          parsedBody,
          endpoint,
          endpointType,
          defaultParamsEndpoint,
        });
      } catch (error) {
        logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
        return handleError(res, { text: 'Error parsing model spec' });
      }
    }
  }

  parsedBody = resolvePromptPrefixVariables(parsedBody, req.user, req.body.clientTimestamp);

  try {
    const isAgents =
      isAgentsEndpoint(endpoint) || req.baseUrl.startsWith(EndpointURLs[EModelEndpoint.agents]);
    const builder = isAgents
      ? (...args) => buildFunction[EModelEndpoint.agents](req, ...args)
      : buildFunction[endpointType ?? endpoint];

    // TODO: use object params
    req.body = req.body || {}; // Express 5: ensure req.body exists
    req.body.endpointOption = await builder(endpoint, parsedBody, endpointType);

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
