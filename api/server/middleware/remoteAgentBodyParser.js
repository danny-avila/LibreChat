const express = require('express');

const remoteAgentJsonLimit = process.env.REMOTE_AGENT_API_JSON_LIMIT || '64mb';

const jsonParser = express.json({ limit: remoteAgentJsonLimit });

function remoteAgentJsonParser(req, res, next) {
  if (req.body !== undefined) {
    return next();
  }
  return jsonParser(req, res, next);
}

module.exports = {
  remoteAgentJsonLimit,
  remoteAgentJsonParser,
};
