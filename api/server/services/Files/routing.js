const {
  EToolResources,
  mergeFileConfig,
  resolveDefaultLLMDeliveryPath,
  getEndpointFileConfig,
} = require('librechat-data-provider');
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

const resolveDefaultUploadLLMDeliveryPath = ({ file, endpointConfig, fileConfig, endpoint }) => {
  const isLegacyFileUploadUX = endpointConfig?.legacyFileUploadUX === true;
  if (isLegacyFileUploadUX) {
    return 'provider';
  }

  return resolveDefaultLLMDeliveryPath(
    file.mimetype,
    endpointConfig?.defaultLLMDeliveryPath,
    fileConfig?.defaultLLMDeliveryPath,
    endpoint,
  );
};

const resolveUploadLLMDeliveryPath = ({
  tool_resource,
  file,
  endpointConfig,
  fileConfig,
  endpoint,
}) => {
  if (tool_resource === EToolResources.context || tool_resource === EToolResources.ocr) {
    return 'text';
  }

  if (
    tool_resource === EToolResources.file_search ||
    tool_resource === EToolResources.execute_code
  ) {
    return 'none';
  }

  return resolveDefaultUploadLLMDeliveryPath({ file, endpointConfig, fileConfig, endpoint });
};

/**
 * Whether an image upload with no explicit tool resource is routed to text delivery.
 * The image pipeline stores pixels and never extracts text, so such an upload has to
 * take the agent upload path or it reaches neither the model nor a text context.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {Object} params.metadata
 * @returns {Promise<boolean>}
 */
const resolvesToTextDelivery = async ({ req, metadata }) => {
  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  const endpoint = await resolveUploadEndpoint({
    endpoint: metadata.endpoint,
    agent_id: metadata.agent_id,
    req,
  });
  const endpointConfig = getEndpointFileConfig({ fileConfig, endpoint });
  return (
    resolveUploadLLMDeliveryPath({
      tool_resource: metadata.tool_resource,
      file: req.file,
      endpointConfig,
      fileConfig,
      endpoint,
    }) === 'text'
  );
};

/**
 * The destination this upload will actually be processed under. Unified uploads carry no
 * tool resource but are promoted to a text context when routing sends them there, and the
 * content preflight has to judge the same destination the processing path will use.
 *
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {object} params.metadata
 * @returns {Promise<string | undefined>}
 */
async function resolveEffectiveToolResource({ req, metadata }) {
  if (metadata.tool_resource === EToolResources.ocr) {
    return EToolResources.context;
  }
  if (metadata.tool_resource) {
    return metadata.tool_resource;
  }
  return (await resolvesToTextDelivery({ req, metadata })) ? EToolResources.context : undefined;
}

module.exports = {
  resolveUploadAgent,
  resolveUploadEndpoint,
  resolveUploadLLMDeliveryPath,
  resolveEffectiveToolResource,
  resolvesToTextDelivery,
};
