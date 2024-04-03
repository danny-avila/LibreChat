const { parseConvo, EModelEndpoint } = require('librechat-data-provider');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const assistants = require('~/server/services/Endpoints/assistants');
const gptPlugins = require('~/server/services/Endpoints/gptPlugins');
const { processFiles } = require('~/server/services/Files/process');
const anthropic = require('~/server/services/Endpoints/anthropic');
const openAI = require('~/server/services/Endpoints/openAI');
const custom = require('~/server/services/Endpoints/custom');
const google = require('~/server/services/Endpoints/google');

const buildFunction = {
  [EModelEndpoint.openAI]: openAI.buildOptions,
  [EModelEndpoint.google]: google.buildOptions,
  [EModelEndpoint.custom]: custom.buildOptions,
  [EModelEndpoint.azureOpenAI]: openAI.buildOptions,
  [EModelEndpoint.anthropic]: anthropic.buildOptions,
  [EModelEndpoint.gptPlugins]: gptPlugins.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
};

async function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;
  const parsedBody = parseConvo({ endpoint, endpointType, conversation: req.body });
  req.body.endpointOption = buildFunction[endpointType ?? endpoint](
    endpoint,
    parsedBody,
    endpointType,
  );

  const modelsConfig = await getModelsConfig(req);
  req.body.endpointOption.modelsConfig = modelsConfig;

  if (req.body.files) {
    // hold the promise
    req.body.endpointOption.attachments = processFiles(req.body.files);
  }
  next();
}

module.exports = buildEndpointOption;
