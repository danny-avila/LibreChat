const { getEndpointsConfig } = require('~/server/services/Config');

async function endpointController(req, res) {
  const endpointsConfig = await getEndpointsConfig(req);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
