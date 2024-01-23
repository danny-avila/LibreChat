const { parseConvo, EModelEndpoint } = require('librechat-data-provider');
const { processFiles } = require('~/server/services/Files/process');
const gptPlugins = require('~/server/services/Endpoints/gptPlugins');
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
};

function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;
  const parsedBody = parseConvo({ endpoint, endpointType, conversation: req.body });
  req.body.endpointOption = buildFunction[endpointType ?? endpoint](
    endpoint,
    parsedBody,
    endpointType,
  );
  if (req.body.files) {
    // hold the promise
    req.body.endpointOption.attachments = processFiles(req.body.files);
  }
  next();
}

module.exports = buildEndpointOption;
