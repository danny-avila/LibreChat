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
  isEphemeralAgentId,
  parseCompactConvo,
  getDefaultParamsEndpoint,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const { getEndpointsConfig } = require('~/server/services/Config');
const agents = require('~/server/services/Endpoints/agents');
const { updateFilesUsage, getAgent } = require('~/models');

const buildFunction = {
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

const isSavedAgentRequest = (endpoint, parsedBody) =>
  isAgentsEndpoint(endpoint) && !isEphemeralAgentId(parsedBody?.agent_id);

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const agentMatchesEnforcedModelSpec = ({ agent, agent_id, list }) =>
  list.some((modelSpec) => {
    const preset = modelSpec?.preset;
    if (isAgentsEndpoint(preset?.endpoint) && preset?.agent_id === agent_id) {
      return true;
    }

    return preset?.endpoint === agent?.provider && preset?.model === agent?.model;
  });

const validateSavedAgentModelSpec = async ({ agent_id, list }) => {
  if (!agent_id || isEphemeralAgentId(agent_id)) {
    return { isSavedAgent: false };
  }

  const agent = await getAgent({ id: agent_id });
  if (!agent) {
    return { isSavedAgent: true, error: 'Invalid agent' };
  }

  if (!agentMatchesEnforcedModelSpec({ agent, agent_id, list })) {
    return { isSavedAgent: true, error: 'Model spec mismatch' };
  }

  return { isSavedAgent: true };
};

const enforceAddedConvoModelSpec = async ({ req, list, endpointsConfig }) => {
  const addedConvo = req.body?.addedConvo;
  if (!isObject(addedConvo)) {
    return null;
  }

  const savedAgentResult = await validateSavedAgentModelSpec({
    agent_id: addedConvo.agent_id,
    list,
  });
  if (savedAgentResult.error) {
    return savedAgentResult.error;
  }
  if (savedAgentResult.isSavedAgent) {
    return null;
  }

  const { endpoint, endpointType, spec } = addedConvo;
  if (!spec) {
    return 'No model spec selected';
  }

  const modelSpec = findModelSpecByName({ list }, spec);
  if (!modelSpec) {
    return 'Invalid model spec';
  }

  if (!isModelSpecEndpointMatch(modelSpec, endpoint)) {
    return 'Model spec mismatch';
  }

  try {
    const result = applyModelSpecPreset({
      modelSpec,
      parsedBody: addedConvo,
      endpoint,
      endpointType,
      defaultParamsEndpoint: getDefaultParamsEndpoint(endpointsConfig, endpoint),
      includePresetDefaults: true,
    });
    req.body.addedConvo = { ...addedConvo, ...result.parsedBody };
  } catch (error) {
    logger.error(`Error parsing added model spec for endpoint ${endpoint}`, error);
    return 'Error parsing model spec';
  }

  return null;
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
      'Error parsing compact conversation': {
        endpoint,
        endpointType,
        conversation: req.body,
      },
    });
    return handleError(res, { text: 'Error parsing conversation' });
  }

  const appConfig = req.config;
  let appliedModelSpecPrivateFields = new Set();
  if (appConfig.modelSpecs?.list?.length && appConfig.modelSpecs?.enforce) {
    /** @type {{ list: TModelSpec[] }}*/
    const { list } = appConfig.modelSpecs;
    const savedAgentResult = await validateSavedAgentModelSpec({
      agent_id: isSavedAgentRequest(endpoint, parsedBody) ? parsedBody.agent_id : undefined,
      list,
    });

    if (savedAgentResult.error) {
      return handleError(res, { text: savedAgentResult.error });
    }

    if (!savedAgentResult.isSavedAgent) {
      const { spec } = parsedBody;

      if (!spec) {
        return handleError(res, { text: 'No model spec selected' });
      }

      const currentModelSpec = findModelSpecByName({ list }, spec);
      if (!currentModelSpec) {
        return handleError(res, { text: 'Invalid model spec' });
      }

      if (!isModelSpecEndpointMatch(currentModelSpec, endpoint)) {
        return handleError(res, { text: 'Model spec mismatch' });
      }

      try {
        const result = applyModelSpecPreset({
          modelSpec: currentModelSpec,
          parsedBody,
          endpoint,
          endpointType,
          defaultParamsEndpoint,
          includePresetDefaults: true,
        });
        parsedBody = result.parsedBody;
        appliedModelSpecPrivateFields = result.appliedPrivateFields;
      } catch (error) {
        logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
        return handleError(res, { text: 'Error parsing model spec' });
      }
    }

    const addedConvoError = await enforceAddedConvoModelSpec({ req, list, endpointsConfig });
    if (addedConvoError) {
      return handleError(res, { text: addedConvoError });
    }
  } else if (parsedBody.spec && appConfig.modelSpecs?.list) {
    const modelSpec = findModelSpecByName(appConfig.modelSpecs, parsedBody.spec);
    if (modelSpec) {
      if (!isModelSpecEndpointMatch(modelSpec, endpoint)) {
        return handleError(res, { text: 'Model spec mismatch' });
      }

      try {
        const result = applyModelSpecPreset({
          modelSpec,
          parsedBody,
          endpoint,
          endpointType,
          defaultParamsEndpoint,
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
    req.body.endpointOption = await builder(endpoint, parsedBody, endpointType);

    if (req.body.files && !isAgents) {
      req.body.endpointOption.attachments = updateFilesUsage(req.body.files, undefined, {
        user: req.user.id,
      });
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
