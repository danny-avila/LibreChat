const db = require('~/models');

/**
 * Reads the upload's agent once per request. Routing, authorization and processing each
 * need it, and this runs before any bytes are handled, so repeating the read adds a
 * round trip to every upload.
 *
 * @param {ServerRequest} req
 * @param {string} [agent_id]
 * @returns {Promise<object | null>}
 */
function resolveUploadAgent(req, agent_id) {
  if (!agent_id) {
    return Promise.resolve(null);
  }
  if (!req._uploadAgentCache) {
    req._uploadAgentCache = new Map();
  }
  if (!req._uploadAgentCache.has(agent_id)) {
    req._uploadAgentCache.set(agent_id, db.getAgent({ id: agent_id }));
  }
  return req._uploadAgentCache.get(agent_id);
}

/** Agent uploads carry endpoint=agents; the agent's own provider governs both the file
 *  configuration used for validation and the delivery-path routing. */
async function resolveUploadEndpoint({ endpoint, agent_id, req }) {
  if (!agent_id) {
    return endpoint;
  }
  const uploadAgent = req
    ? await resolveUploadAgent(req, agent_id)
    : await db.getAgent({ id: agent_id });
  return uploadAgent?.provider || endpoint;
}

module.exports = { resolveUploadAgent, resolveUploadEndpoint };
