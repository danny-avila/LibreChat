const { logger } = require('@librechat/data-schemas');
const { preflightCodeOutputBatch: runCodeOutputBatchPreflight } = require('@librechat/api');
const {
  EModelEndpoint,
  mergeFileConfig,
  getEndpointFileConfig,
} = require('librechat-data-provider');
const { prepareCodeOutputForInspection } = require('./process');

const preflightCodeOutputBatch = async ({ req, artifact }) => {
  const mergedFileConfig = mergeFileConfig(req.config?.fileConfig);
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mergedFileConfig,
    endpoint: EModelEndpoint.agents,
  });
  return await runCodeOutputBatchPreflight({
    filters: req.config?.filters,
    artifact,
    limits: {
      fileLimit: endpointFileConfig.fileLimit,
      fileSizeLimit: endpointFileConfig.fileSizeLimit ?? mergedFileConfig.serverFileSizeLimit,
      totalSizeLimit:
        endpointFileConfig.totalSizeLimit ??
        endpointFileConfig.fileSizeLimit ??
        mergedFileConfig.serverFileSizeLimit,
    },
    prepare: ({ file, sessionId, maxBytes, inspectContent }) =>
      prepareCodeOutputForInspection({
        req,
        id: file.id,
        name: file.name,
        session_id: sessionId,
        maxBytes,
        inspectContent,
      }),
    onInspectionUnavailable: (index) => {
      logger.warn(
        `[preflightCodeOutputBatch] Generated artifact ${index + 1} could not be inspected`,
      );
    },
  });
};

module.exports = {
  preflightCodeOutputBatch,
};
