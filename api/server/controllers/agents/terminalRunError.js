const { logger } = require('@librechat/data-schemas');
const {
  createModelErrorTracker,
  getSafeErrorMetadata,
  traceIdForMessage,
} = require('@librechat/api');

const UPSTREAM_MODEL_ERROR_CODE = 'UPSTREAM_MODEL_ERROR';
const UPSTREAM_MODEL_ERROR_ORIGIN = 'model_provider';
const UNKNOWN_UPSTREAM_MODEL_ERROR_TYPE = '_OTHER';

function getUpstreamModelErrorMetadata(error, responseMessageId) {
  const safeMetadata = getSafeErrorMetadata(error);
  return {
    ...safeMetadata,
    errorCode: UPSTREAM_MODEL_ERROR_CODE,
    errorOrigin: UPSTREAM_MODEL_ERROR_ORIGIN,
    errorType:
      safeMetadata.status != null ? String(safeMetadata.status) : UNKNOWN_UPSTREAM_MODEL_ERROR_TYPE,
    ...(typeof responseMessageId === 'string' && responseMessageId !== ''
      ? { traceId: traceIdForMessage(responseMessageId) }
      : {}),
  };
}

/**
 * Applies one terminal-run log taxonomy to every agent ingress. The tracker
 * returns only errors observed at the model boundary; all other failures keep
 * the generic safe-metadata path.
 */
function createTerminalRunErrorObserver({
  responseMessageId,
  source,
  genericMessage = `${source} Error:`,
}) {
  const modelErrorTracker = createModelErrorTracker();
  return Object.freeze({
    modelCallback: modelErrorTracker.callback,
    log(error) {
      const upstreamModelError = modelErrorTracker.getUpstreamModelError(error);
      if (upstreamModelError != null) {
        logger.error(
          `${source} Upstream model error`,
          getUpstreamModelErrorMetadata(upstreamModelError, responseMessageId),
        );
        return;
      }

      logger.error(genericMessage, getSafeErrorMetadata(error));
    },
  });
}

module.exports = { createTerminalRunErrorObserver, getUpstreamModelErrorMetadata };
