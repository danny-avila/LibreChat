import fs from 'fs';
import { Readable } from 'stream';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { initializeS3 } from '../../cdn/s3';
import { deleteRagFile } from '../../files';
import { s3Config } from './s3Config';
import type { GetObjectCommandInput } from '@aws-sdk/client-s3';
import type { ServerRequest } from '~/types';
import type {
  SaveBufferParams,
  GetURLParams,
  SaveURLParams,
  UploadFileParams,
  UploadResult,
  UrlBuilder,
  S3FileRef,
  MongoFile,
  BatchUpdateFn,
} from '../types';

const {
  AWS_BUCKET_NAME: bucketName,
  AWS_ENDPOINT_URL: endpoint,
  AWS_FORCE_PATH_STYLE: forcePathStyle,
  S3_URL_EXPIRY_SECONDS: s3UrlExpirySeconds,
  S3_REFRESH_EXPIRY_MS: s3RefreshExpiryMs,
  DEFAULT_BASE_PATH: defaultBasePath,
} = s3Config;

export const getS3Key = (basePath: string, userId: string, fileName: string): string =>
  `${basePath}/${userId}/${fileName}`;

export async function getS3URL({
  userId,
  fileName,
  basePath = defaultBasePath,
  customFilename = null,
  contentType = null,
}: GetURLParams): Promise<string> {
  const key = getS3Key(basePath, userId, fileName);
  const params: GetObjectCommandInput = { Bucket: bucketName, Key: key };

  if (customFilename) {
    params.ResponseContentDisposition = `attachment; filename="${customFilename}"`;
  }
  if (contentType) {
    params.ResponseContentType = contentType;
  }

  try {
    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[getS3URL] S3 not initialized');
    }

    return await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: s3UrlExpirySeconds });
  } catch (error) {
    logger.error('[getS3URL] Error getting signed URL from S3:', (error as Error).message);
    throw error;
  }
}

export async function saveBufferToS3({
  userId,
  buffer,
  fileName,
  basePath = defaultBasePath,
  urlBuilder,
}: SaveBufferParams & { urlBuilder?: UrlBuilder }): Promise<string> {
  const key = getS3Key(basePath, userId, fileName);
  const params = { Bucket: bucketName, Key: key, Body: buffer };

  try {
    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[saveBufferToS3] S3 not initialized');
    }

    await s3.send(new PutObjectCommand(params));
    const getUrl = urlBuilder ?? getS3URL;
    return await getUrl({ userId, fileName, basePath });
  } catch (error) {
    logger.error('[saveBufferToS3] Error uploading buffer to S3:', (error as Error).message);
    throw error;
  }
}

export async function saveURLToS3({
  userId,
  URL,
  fileName,
  basePath = defaultBasePath,
  urlBuilder,
}: SaveURLParams & { urlBuilder?: UrlBuilder }): Promise<string> {
  try {
    const response = await fetch(URL);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    return await saveBufferToS3({ userId, buffer, fileName, basePath, urlBuilder });
  } catch (error) {
    logger.error('[saveURLToS3] Error uploading file from URL to S3:', (error as Error).message);
    throw error;
  }
}

export function extractKeyFromS3Url(fileUrlOrKey: string): string {
  if (!fileUrlOrKey) {
    throw new Error('Invalid input: URL or key is empty');
  }

  try {
    const url = new URL(fileUrlOrKey);
    const hostname = url.hostname;
    const pathname = url.pathname.substring(1);

    if (endpoint && forcePathStyle) {
      const endpointUrl = new URL(endpoint);
      const startPos =
        endpointUrl.pathname.length +
        (endpointUrl.pathname.endsWith('/') ? 0 : 1) +
        bucketName.length +
        1;
      const key = url.pathname.substring(startPos);
      if (!key) {
        logger.warn(
          `[extractKeyFromS3Url] Extracted key is empty for endpoint path-style URL: ${fileUrlOrKey}`,
        );
      } else {
        logger.debug(`[extractKeyFromS3Url] fileUrlOrKey: ${fileUrlOrKey}, Extracted key: ${key}`);
      }
      return key;
    }

    if (
      hostname === 's3.amazonaws.com' ||
      hostname.match(/^s3[-.][a-z0-9-]+\.amazonaws\.com$/) ||
      (bucketName && pathname.startsWith(`${bucketName}/`))
    ) {
      const firstSlashIndex = pathname.indexOf('/');
      if (firstSlashIndex > 0) {
        const key = pathname.substring(firstSlashIndex + 1);
        if (key === '') {
          logger.warn(
            `[extractKeyFromS3Url] Extracted key is empty after removing bucket name from URL: ${fileUrlOrKey}`,
          );
        } else {
          logger.debug(
            `[extractKeyFromS3Url] fileUrlOrKey: ${fileUrlOrKey}, Extracted key: ${key}`,
          );
        }
        return key;
      }
      logger.warn(
        `[extractKeyFromS3Url] Unable to extract key from path-style URL: ${fileUrlOrKey}`,
      );
      return '';
    }

    logger.debug(`[extractKeyFromS3Url] fileUrlOrKey: ${fileUrlOrKey}, Extracted key: ${pathname}`);
    return pathname;
  } catch (error) {
    if (fileUrlOrKey.startsWith('http://') || fileUrlOrKey.startsWith('https://')) {
      logger.error(
        `[extractKeyFromS3Url] Error parsing URL: ${fileUrlOrKey}, Error: ${(error as Error).message}`,
      );
    } else {
      logger.debug(`[extractKeyFromS3Url] Non-URL input, using fallback: ${fileUrlOrKey}`);
    }

    const parts = fileUrlOrKey.split('/');
    if (parts.length >= 3 && !fileUrlOrKey.startsWith('http') && !fileUrlOrKey.startsWith('/')) {
      return fileUrlOrKey;
    }

    const key = fileUrlOrKey.startsWith('/') ? fileUrlOrKey.substring(1) : fileUrlOrKey;
    logger.debug(
      `[extractKeyFromS3Url] FALLBACK. fileUrlOrKey: ${fileUrlOrKey}, Extracted key: ${key}`,
    );
    return key;
  }
}

export async function deleteFileFromS3(req: ServerRequest, file: MongoFile): Promise<void> {
  if (!req.user) {
    throw new Error('[deleteFileFromS3] User not authenticated');
  }

  const userId = req.user.id;
  await deleteRagFile({ userId, file });

  const key = extractKeyFromS3Url(file.filepath);
  const params = { Bucket: bucketName, Key: key };

  if (!key.includes(userId)) {
    const message = `[deleteFileFromS3] User ID mismatch: ${userId} vs ${key}`;
    logger.error(message);
    throw new Error(message);
  }

  const s3 = initializeS3();
  if (!s3) {
    throw new Error('[deleteFileFromS3] S3 not initialized');
  }

  try {
    try {
      const headCommand = new HeadObjectCommand(params);
      await s3.send(headCommand);
      logger.debug('[deleteFileFromS3] File exists, proceeding with deletion');
    } catch (headErr) {
      if ((headErr as { name?: string }).name === 'NotFound') {
        logger.warn(`[deleteFileFromS3] File does not exist: ${key}`);
        return;
      }
    }

    const deleteResult = await s3.send(new DeleteObjectCommand(params));
    logger.debug('[deleteFileFromS3] Delete command response:', JSON.stringify(deleteResult));

    try {
      await s3.send(new HeadObjectCommand(params));
      logger.error('[deleteFileFromS3] File still exists after deletion!');
    } catch (verifyErr) {
      if ((verifyErr as { name?: string }).name === 'NotFound') {
        logger.debug(`[deleteFileFromS3] Verified file is deleted: ${key}`);
      } else {
        logger.error('[deleteFileFromS3] Error verifying deletion:', verifyErr);
      }
    }

    logger.debug('[deleteFileFromS3] S3 File deletion completed');
  } catch (error) {
    logger.error(`[deleteFileFromS3] Error deleting file from S3: ${(error as Error).message}`);
    logger.error((error as Error).stack);

    if ((error as { code?: string }).code === 'NoSuchKey') {
      return;
    }
    throw error;
  }
}

export async function uploadFileToS3({
  req,
  file,
  file_id,
  basePath = defaultBasePath,
  urlBuilder,
}: UploadFileParams & { urlBuilder?: UrlBuilder }): Promise<UploadResult> {
  if (!req.user) {
    throw new Error('[uploadFileToS3] User not authenticated');
  }

  try {
    const inputFilePath = file.path;
    const userId = req.user.id;
    const fileName = `${file_id}__${file.originalname}`;
    const key = getS3Key(basePath, userId, fileName);

    const stats = await fs.promises.stat(inputFilePath);
    const bytes = stats.size;
    const fileStream = fs.createReadStream(inputFilePath);

    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[uploadFileToS3] S3 not initialized');
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
    };

    await s3.send(new PutObjectCommand(uploadParams));
    const getUrl = urlBuilder ?? getS3URL;
    const fileURL = await getUrl({ userId, fileName, basePath });
    return { filepath: fileURL, bytes };
  } catch (error) {
    logger.error('[uploadFileToS3] Error streaming file to S3:', error);
    try {
      if (file?.path) {
        await fs.promises.unlink(file.path);
      }
    } catch (unlinkError) {
      logger.error(
        '[uploadFileToS3] Error deleting temporary file, likely already deleted:',
        (unlinkError as Error).message,
      );
    }
    throw error;
  }
}

export async function getS3FileStream(_req: ServerRequest, filePath: string): Promise<Readable> {
  try {
    const Key = extractKeyFromS3Url(filePath);
    const params = { Bucket: bucketName, Key };

    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[getS3FileStream] S3 not initialized');
    }

    const data = await s3.send(new GetObjectCommand(params));
    return data.Body as Readable;
  } catch (error) {
    logger.error('[getS3FileStream] Error retrieving S3 file stream:', error);
    throw error;
  }
}

export function needsRefresh(signedUrl: string, bufferSeconds: number): boolean {
  try {
    const url = new URL(signedUrl);

    if (!url.searchParams.has('X-Amz-Signature')) {
      return false;
    }

    const expiresParam = url.searchParams.get('X-Amz-Expires');
    const dateParam = url.searchParams.get('X-Amz-Date');

    if (!expiresParam || !dateParam) {
      return true;
    }

    const year = dateParam.substring(0, 4);
    const month = dateParam.substring(4, 6);
    const day = dateParam.substring(6, 8);
    const hour = dateParam.substring(9, 11);
    const minute = dateParam.substring(11, 13);
    const second = dateParam.substring(13, 15);

    const dateObj = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const expiresAtDate = new Date(dateObj.getTime() + parseInt(expiresParam) * 1000);

    const now = new Date();

    if (s3RefreshExpiryMs !== null) {
      const urlCreationTime = dateObj.getTime();
      const urlAge = now.getTime() - urlCreationTime;
      return urlAge >= s3RefreshExpiryMs;
    }

    const bufferTime = new Date(now.getTime() + bufferSeconds * 1000);
    return expiresAtDate <= bufferTime;
  } catch (error) {
    logger.error('Error checking URL expiration:', error);
    return true;
  }
}

export async function getNewS3URL(currentURL: string): Promise<string | undefined> {
  try {
    const s3Key = extractKeyFromS3Url(currentURL);
    if (!s3Key) {
      return;
    }

    const keyParts = s3Key.split('/');
    if (keyParts.length < 3) {
      return;
    }

    const basePath = keyParts[0];
    const userId = keyParts[1];
    const fileName = keyParts.slice(2).join('/');

    return getS3URL({ userId, fileName, basePath });
  } catch (error) {
    logger.error('Error getting new S3 URL:', error);
  }
}

export async function refreshS3FileUrls(
  files: MongoFile[],
  batchUpdateFiles: BatchUpdateFn,
  bufferSeconds = 3600,
): Promise<MongoFile[]> {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return files;
  }

  const filesToUpdate: Array<{ file_id: string; filepath: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file?.file_id) {
      continue;
    }
    if (file.source !== FileSources.s3) {
      continue;
    }
    if (!file.filepath) {
      continue;
    }
    if (!needsRefresh(file.filepath, bufferSeconds)) {
      continue;
    }

    try {
      const newURL = await getNewS3URL(file.filepath);
      if (!newURL) {
        continue;
      }
      filesToUpdate.push({
        file_id: file.file_id,
        filepath: newURL,
      });
      files[i].filepath = newURL;
    } catch (error) {
      logger.error(`Error refreshing S3 URL for file ${file.file_id}:`, error);
    }
  }

  if (filesToUpdate.length > 0) {
    await batchUpdateFiles(filesToUpdate);
  }

  return files;
}

export async function refreshS3Url(fileObj: S3FileRef, bufferSeconds = 3600): Promise<string> {
  if (!fileObj || fileObj.source !== FileSources.s3 || !fileObj.filepath) {
    return fileObj?.filepath || '';
  }

  if (!needsRefresh(fileObj.filepath, bufferSeconds)) {
    return fileObj.filepath;
  }

  try {
    const s3Key = extractKeyFromS3Url(fileObj.filepath);
    if (!s3Key) {
      logger.warn(`Unable to extract S3 key from URL: ${fileObj.filepath}`);
      return fileObj.filepath;
    }

    const keyParts = s3Key.split('/');
    if (keyParts.length < 3) {
      logger.warn(`Invalid S3 key format: ${s3Key}`);
      return fileObj.filepath;
    }

    const basePath = keyParts[0];
    const userId = keyParts[1];
    const fileName = keyParts.slice(2).join('/');

    const newUrl = await getS3URL({ userId, fileName, basePath });
    logger.debug(`Refreshed S3 URL for key: ${s3Key}`);
    return newUrl;
  } catch (error) {
    logger.error(`Error refreshing S3 URL: ${(error as Error).message}`);
    return fileObj.filepath;
  }
}
