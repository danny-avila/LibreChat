import { logger } from '@librechat/data-schemas';
import type { CloudFrontConfig } from 'librechat-data-provider';
import { initializeS3 } from './s3';

export interface CloudFrontFullConfig extends NonNullable<CloudFrontConfig> {
  privateKey: string | null;
  keyPairId: string | null;
}

let cloudFrontConfig: CloudFrontFullConfig | null = null;

export function initializeCloudFront(config?: CloudFrontConfig): boolean {
  if (cloudFrontConfig) {
    logger.debug('[initializeCloudFront] Already initialized; skipping re-initialization.');
    return true;
  }

  if (!config?.domain) {
    logger.error('[initializeCloudFront] CloudFront domain is required in config.');
    return false;
  }

  const s3 = initializeS3();
  if (!s3) {
    logger.error('[initializeCloudFront] S3 must be initialized for CloudFront to work.');
    return false;
  }

  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID ?? null;
  const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY ?? null;

  cloudFrontConfig = { ...config, privateKey, keyPairId };

  if (config.imageSigning !== 'none') {
    logger.warn(
      `[initializeCloudFront] imageSigning="${config.imageSigning}" is configured but not yet implemented. All URLs will be unsigned. Do NOT restrict your CloudFront distribution to signed requests.`,
    );
  }

  if (keyPairId && privateKey) {
    logger.warn(
      '[initializeCloudFront] Signing keys are configured but URL signing is not yet active. ' +
        'All files will be served via unsigned URLs. Signing will be enabled in a follow-up release.',
    );
  } else {
    logger.info(
      '[initializeCloudFront] CloudFront initialized without signing keys (public OAC only).',
    );
  }

  if (config.invalidateOnDelete) {
    logger.info('[initializeCloudFront] Cache invalidation on delete enabled.');
  }

  return true;
}

export function getCloudFrontConfig(): CloudFrontFullConfig | null {
  return cloudFrontConfig;
}
