const openAI = require('../routes/endpoints/openAI');
const gptPlugins = require('../routes/endpoints/gptPlugins');
const anthropic = require('../routes/endpoints/anthropic');
const { parseConvo } = require('../routes/endpoints/schemas');

const buildFunction = {
  openAI: openAI.buildOptions,
  azureOpenAI: openAI.buildOptions,
  gptPlugins: gptPlugins.buildOptions,
  anthropic: anthropic.buildOptions,
};

function buildEndpointOption(req, res, next) {
  const { endpoint } = req.body;
  const parsedBody = parseConvo(endpoint, req.body);
  req.body.endpointOption = buildFunction[endpoint](endpoint, parsedBody);
  next();
}

module.exports = buildEndpointOption;
