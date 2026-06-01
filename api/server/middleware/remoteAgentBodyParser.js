const express = require('express');

const remoteAgentJsonLimit = process.env.REMOTE_AGENT_API_JSON_LIMIT || '64mb';
const jsonParsers = new Map();

function getRemoteAgentJsonLimit(req) {
  return req.config?.endpoints?.agents?.remoteApi?.requestBodyLimit || remoteAgentJsonLimit;
}

function remoteAgentJsonParser(req, res, next) {
  if (req.body !== undefined) {
    return next();
  }

  const limit = getRemoteAgentJsonLimit(req);
  if (!jsonParsers.has(limit)) {
    jsonParsers.set(limit, express.json({ limit }));
  }

  const jsonParser = jsonParsers.get(limit);
  return jsonParser(req, res, next);
}

module.exports = {
  getRemoteAgentJsonLimit,
  remoteAgentJsonLimit,
  remoteAgentJsonParser,
};
