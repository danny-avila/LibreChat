const { GenerationJobManager } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

async function detectGenerationRetry(req, _res, next) {
  const clientRequestId = req.body?.clientRequestId;
  const userId = req.user?.id;
  if (
    req.method !== 'POST' ||
    req.path === '/resume' ||
    typeof userId !== 'string' ||
    typeof clientRequestId !== 'string' ||
    !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)
  ) {
    return next();
  }

  try {
    req._isConfirmedGenerationRetry = await GenerationJobManager.hasGenerationClaim(
      userId,
      clientRequestId,
    );
  } catch (error) {
    logger.warn('[GenerationIdempotency] Failed to inspect start-generation claim', {
      userId,
      clientRequestId,
      error: error?.message,
    });
  }
  return next();
}

function isConfirmedGenerationRetry(req) {
  return req._isConfirmedGenerationRetry === true;
}

module.exports = { detectGenerationRetry, isConfirmedGenerationRetry };
