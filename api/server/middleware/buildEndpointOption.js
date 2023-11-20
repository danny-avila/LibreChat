const openAI = require('~/server/routes/endpoints/openAI');
const gptPlugins = require('~/server/routes/endpoints/gptPlugins');
const anthropic = require('~/server/routes/endpoints/anthropic');
const { parseConvo, EModelEndpoint } = require('~/server/routes/endpoints/schemas');
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
