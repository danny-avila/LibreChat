const { RateLimitPrefix } = require('librechat-data-provider');

/**
 *
 * @param {TCustomConfig['rateLimits'] | undefined} rateLimits
 */
const handleRateLimits = (rateLimits) => {
  if (!rateLimits) {
    return;
  }

  const rateLimitKeys = {
    fileUploads: RateLimitPrefix.FILE_UPLOAD,
    conversationsImport: RateLimitPrefix.IMPORT,
    tts: RateLimitPrefix.TTS,
    stt: RateLimitPrefix.STT,
  };

  Object.entries(rateLimitKeys).forEach(([key, prefix]) => {
    const rateLimit = rateLimits[key];
    if (rateLimit) {
      setRateLimitEnvVars(prefix, rateLimit);
    }
  });
};

/**
 * Set environment variables for rate limit configurations
 *
 * @param {string} prefix - Prefix for environment variable names
 * @param {object} rateLimit - Rate limit configuration object
 */
const setRateLimitEnvVars = (prefix, rateLimit) => {
  const envVarsMapping = {
    ipMax: `${prefix}_IP_MAX`,
    ipWindowInMinutes: `${prefix}_IP_WINDOW`,
    userMax: `${prefix}_USER_MAX`,
    userWindowInMinutes: `${prefix}_USER_WINDOW`,
  };

  Object.entries(envVarsMapping).forEach(([key, envVar]) => {
    if (rateLimit[key] !== undefined) {
      process.env[envVar] = rateLimit[key];
    }
  });
};

module.exports = handleRateLimits;
