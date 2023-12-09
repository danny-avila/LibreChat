const openAI = require('~/server/services/Endpoints/openAI');
const anthropic = require('~/server/services/Endpoints/anthropic');
const gptPlugins = require('~/server/services/Endpoints/gptPlugins');
const { parseConvo, EModelEndpoint } = require('~/server/services/Endpoints/schemas');
const { processFiles } = require('~/server/services/Files');

const buildFunction = {
  [EModelEndpoint.openAI]: openAI.buildOptions,
  [EModelEndpoint.azureOpenAI]: openAI.buildOptions,
  [EModelEndpoint.gptPlugins]: gptPlugins.buildOptions,
  [EModelEndpoint.anthropic]: anthropic.buildOptions,
};

function buildEndpointOption(req, res, next) {
  const { endpoint } = req.body;
  const parsedBody = parseConvo(endpoint, req.body);
  req.body.endpointOption = buildFunction[endpoint](endpoint, parsedBody);
  if (req.body.files) {
    // hold the promise
    req.body.endpointOption.attachments = processFiles(req.body.files);
  }
  next();
}

module.exports = buildEndpointOption;
