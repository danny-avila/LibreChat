import { RateLimitPrefix } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';

/**
 *
 * @param rateLimits
 */
export const handleRateLimits = (rateLimits?: TCustomConfig['rateLimits']) => {
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
    const rateLimit = rateLimits[key as keyof typeof rateLimitKeys];
    if (rateLimit) {
      setRateLimitEnvVars(prefix, rateLimit);
    }
  });
};

type RateLimitConfig = {
  ipMax?: number | undefined;
  ipWindowInMinutes?: number | undefined;
  userMax?: number | undefined;
  userWindowInMinutes?: number | undefined;
};

/**
 * Set environment variables for rate limit configurations
 *
 * @param prefix - Prefix for environment variable names
 * @param rateLimit - Rate limit configuration object
 */
const setRateLimitEnvVars = (prefix: string, rateLimit: RateLimitConfig) => {
  const envVarsMapping = {
    ipMax: `${prefix}_IP_MAX`,
    ipWindowInMinutes: `${prefix}_IP_WINDOW`,
    userMax: `${prefix}_USER_MAX`,
    userWindowInMinutes: `${prefix}_USER_WINDOW`,
  };

  Object.entries(envVarsMapping).forEach(([key, envVar]) => {
    const value = rateLimit[key as keyof RateLimitConfig];
    if (value !== undefined) {
      process.env[envVar] = value.toString();
    }
  });
};
