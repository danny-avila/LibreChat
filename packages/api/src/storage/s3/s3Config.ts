import { logger } from '@librechat/data-schemas';
import { isEnabled } from '../../utils/common';

const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_EXPIRY_SECONDS = 2 * 60; // 2 minutes
const DEFAULT_BASE_PATH = 'images';

const parseUrlExpiry = (): number => {
  if (process.env.S3_URL_EXPIRY_SECONDS === undefined) {
    return DEFAULT_EXPIRY_SECONDS;
  }

  const parsed = parseInt(process.env.S3_URL_EXPIRY_SECONDS, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(
      `[S3] Invalid S3_URL_EXPIRY_SECONDS value: "${process.env.S3_URL_EXPIRY_SECONDS}". Using ${DEFAULT_EXPIRY_SECONDS}s expiry.`,
    );
    return DEFAULT_EXPIRY_SECONDS;
  }

  return Math.min(parsed, MAX_EXPIRY_SECONDS);
};

const parseRefreshExpiry = (): number | null => {
  if (!process.env.S3_REFRESH_EXPIRY_MS) {
    return null;
  }

  const parsed = parseInt(process.env.S3_REFRESH_EXPIRY_MS, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(
      `[S3] Invalid S3_REFRESH_EXPIRY_MS value: "${process.env.S3_REFRESH_EXPIRY_MS}". Using default refresh logic.`,
    );
    return null;
  }

  logger.info(`[S3] Using custom refresh expiry time: ${parsed}ms`);
  return parsed;
};

export const s3Config = {
  /** AWS region for S3 */
  AWS_REGION: process.env.AWS_REGION ?? '',
  /** S3 bucket name */
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME ?? '',
  /** Custom endpoint URL (for MinIO, R2, etc.) */
  AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
  /** AWS access key ID (optional if using IRSA) */
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  /** AWS secret access key (optional if using IRSA) */
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  /** Use path-style URLs instead of virtual-hosted-style */
  AWS_FORCE_PATH_STYLE: isEnabled(process.env.AWS_FORCE_PATH_STYLE),
  /** Presigned URL expiry in seconds */
  S3_URL_EXPIRY_SECONDS: parseUrlExpiry(),
  /** Custom refresh expiry in milliseconds (null = use default buffer logic) */
  S3_REFRESH_EXPIRY_MS: parseRefreshExpiry(),
  /** Default base path for file storage */
  DEFAULT_BASE_PATH,
};
