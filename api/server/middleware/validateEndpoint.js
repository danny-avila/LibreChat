const { handleError } = require('../utils');

function validateEndpoint(req, res, next) {
  const { endpoint: _endpoint, endpointType } = req.body;
  const endpoint = endpointType ?? _endpoint;

  if (!req.body.text || req.body.text.length === 0) {
    return handleError(res, { text: 'Prompt empty or too short' });
  }

  const pathEndpoint = req.baseUrl.split('/')[3];

  if (endpoint !== pathEndpoint) {
    return handleError(res, { text: 'Illegal request: Endpoint mismatch' });
  }

  next();
}

module.exports = validateEndpoint;
