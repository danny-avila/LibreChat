import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { logger } from '@librechat/data-schemas';
import { getCloudFrontConfig } from '../../cdn/cloudfront';
import { s3Config } from '../s3/s3Config';
import {
  getS3Key,
  saveBufferToS3,
  saveURLToS3,
  uploadFileToS3,
  deleteFileFromS3,
  getS3FileStream,
  extractKeyFromS3Url,
} from '../s3/crud';
import type { ServerRequest } from '~/types';
import type {
  SaveBufferParams,
  GetURLParams,
  SaveURLParams,
  UploadFileParams,
  UploadResult,
  MongoFile,
} from '../types';

const defaultBasePath = 'images';

export interface CloudFrontURLParams extends GetURLParams {
  sign?: boolean;
}

function buildCloudFrontUrl(s3Key: string): string {
  const config = getCloudFrontConfig();
  if (!config?.domain) {
    throw new Error('[buildCloudFrontUrl] CloudFront not initialized.');
  }
  const cleanDomain = config.domain.endsWith('/') ? config.domain.slice(0, -1) : config.domain;
  const cleanKey = s3Key.startsWith('/') ? s3Key.slice(1) : s3Key;
  return `${cleanDomain}/${cleanKey}`;
}

function signUrl(url: string): string {
  const config = getCloudFrontConfig();
  if (!config?.privateKey || !config?.keyPairId) {
    throw new Error('[signUrl] Signing keys not configured.');
  }

  const expiry = config.urlExpiry ?? s3Config.S3_URL_EXPIRY_SECONDS;
  const dateLessThan = new Date(Date.now() + expiry * 1000).toISOString();

  return getSignedUrl({
    url,
    keyPairId: config.keyPairId,
    privateKey: config.privateKey,
    dateLessThan,
  });
}

/**
 * Get CloudFront URL for a file.
 * @param sign - If true, returns a signed URL. Caller (strategy) decides based on config.
 */
export async function getCloudFrontURL({
  userId,
  fileName,
  basePath = defaultBasePath,
  sign = false,
}: CloudFrontURLParams): Promise<string> {
  const key = getS3Key(basePath, userId, fileName);
  const url = buildCloudFrontUrl(key);
  return sign ? signUrl(url) : url;
}

/** Save buffer to S3 and return CloudFront URL. */
export async function saveBufferToCloudFront(
  params: SaveBufferParams & { sign?: boolean },
): Promise<string> {
  const { sign = false, ...rest } = params;
  return saveBufferToS3({ ...rest, urlBuilder: (p) => getCloudFrontURL({ ...p, sign }) });
}

/** Save file from URL to S3 and return CloudFront URL. */
export async function saveURLToCloudFront(
  params: SaveURLParams & { sign?: boolean },
): Promise<string> {
  const { sign = false, ...rest } = params;
  return saveURLToS3({ ...rest, urlBuilder: (p) => getCloudFrontURL({ ...p, sign }) });
}

/** Upload file to S3 and return CloudFront URL. */
export async function uploadFileToCloudFront(
  params: UploadFileParams & { sign?: boolean },
): Promise<UploadResult> {
  const { sign = false, ...rest } = params;
  return uploadFileToS3({ ...rest, urlBuilder: (p) => getCloudFrontURL({ ...p, sign }) });
}

/** Delete file from S3 and optionally invalidate CloudFront cache. */
export async function deleteFileFromCloudFront(req: ServerRequest, file: MongoFile): Promise<void> {
  const config = getCloudFrontConfig();
  const key = extractKeyFromS3Url(file.filepath);

  await deleteFileFromS3(req, file);

  if (config?.invalidateOnDelete && config.distributionId) {
    try {
      const client = new CloudFrontClient({ region: process.env.AWS_REGION });
      const path = key.startsWith('/') ? key : `/${key}`;

      await client.send(
        new CreateInvalidationCommand({
          DistributionId: config.distributionId,
          InvalidationBatch: {
            CallerReference: `${Date.now()}-${key}`,
            Paths: { Quantity: 1, Items: [path] },
          },
        }),
      );
      logger.debug(`[deleteFileFromCloudFront] Invalidation created for: ${path}`);
    } catch (error) {
      logger.error(
        '[deleteFileFromCloudFront] Cache invalidation failed:',
        (error as Error).message,
      );
    }
  }
}

/** Get file stream from S3 storage. */
export async function getCloudFrontFileStream(
  req: ServerRequest,
  filePath: string,
): Promise<Readable> {
  return getS3FileStream(req, filePath);
}
