const openAI = require('../routes/endpoints/openAI');
const gptPlugins = require('../routes/endpoints/gptPlugins');
const anthropic = require('../routes/endpoints/anthropic');

const buildFunction = {
  openAI: openAI.buildOptions,
  gptPlugins: gptPlugins.buildOptions,
  anthropic: anthropic.buildOptions,
};

function buildEndpointOption(req, res, next) {
  const { endpoint } = req.body;
  req.body.endpointOption = buildFunction[endpoint](req);
  next();
}

module.exports = buildEndpointOption;
