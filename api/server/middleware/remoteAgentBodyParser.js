const express = require('express');

const remoteAgentJsonLimit = process.env.REMOTE_AGENT_API_JSON_LIMIT || '64mb';

const remoteAgentJsonParser = express.json({ limit: remoteAgentJsonLimit });

module.exports = {
  remoteAgentJsonLimit,
  remoteAgentJsonParser,
};
