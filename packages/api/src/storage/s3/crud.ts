import fs from 'fs';
import { Readable } from 'stream';
import {
  UploadPartCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  CompletedPart,
  GetObjectCommandInput,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import type { TFile } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import type {
  UploadFileParams,
  SaveBufferParams,
  DownloadURLParams,
  SaveURLResult,
  BatchUpdateFn,
  SaveURLParams,
  GetURLParams,
  UploadResult,
  UrlBuilder,
  S3FileRef,
} from '~/storage/types';
import {
  assertS3FileName,
  assertPathSegment,
  sanitizeContentDispositionFilename,
} from '~/storage/validation';
import { initializeS3 } from '~/cdn/s3';
import { deleteRagFile } from '~/files';
import { s3Config } from './s3Config';

const {
  AWS_BUCKET_NAME: bucketName,
  AWS_ENDPOINT_URL: endpoint,
  AWS_FORCE_PATH_STYLE: forcePathStyle,
  S3_URL_EXPIRY_SECONDS: s3UrlExpirySeconds,
  S3_REFRESH_EXPIRY_MS: s3RefreshExpiryMs,
  DEFAULT_BASE_PATH: defaultBasePath,
} = s3Config;

const MULTIPART_UPLOAD_PART_SIZE = 5 * 1024 * 1024;

export interface S3KeyParts {
  basePath: string;
  userId: string;
  fileName: string;
  tenantId?: string;
}

const parseS3PathSegment = (value: string | undefined): string | null => {
  try {
    return assertPathSegment('S3 key segment', value, 'getS3Key');
  } catch {
    return null;
  }
};

export const getS3Key = (
  basePath: string,
  userId: string,
  fileName: string,
  tenantId?: string | null,
): string => {
  const safeBasePath = assertPathSegment('basePath', basePath, 'getS3Key');
  const safeUserId = assertPathSegment('userId', userId, 'getS3Key');
  const safeFileName = assertS3FileName('fileName', fileName, 'getS3Key');

  if (tenantId) {
    const safeTenantId = assertPathSegment('tenantId', tenantId, 'getS3Key');
    return `t/${safeTenantId}/${safeBasePath}/${safeUserId}/${safeFileName}`;
  }
  return `${safeBasePath}/${safeUserId}/${safeFileName}`;
};

export const parseS3Key = (key: string): S3KeyParts | null => {
  const normalizedKey = key.replace(/^\/+/, '');
  const keyParts = normalizedKey.split('/');

  if (keyParts[0] === 't') {
    if (keyParts.length < 5) {
      return null;
    }
    const [, tenantId, basePath, userId, ...fileNameParts] = keyParts;
    const safeTenantId = parseS3PathSegment(tenantId);
    const safeBasePath = parseS3PathSegment(basePath);
    const safeUserId = parseS3PathSegment(userId);
    if (!safeTenantId || !safeBasePath || !safeUserId) {
      return null;
    }
    return {
      tenantId: safeTenantId,
      basePath: safeBasePath,
      userId: safeUserId,
      fileName: fileNameParts.join('/'),
    };
  }

  if (keyParts.length < 3) {
    return null;
  }
  const [basePath, userId, ...fileNameParts] = keyParts;
  const safeBasePath = parseS3PathSegment(basePath);
  const safeUserId = parseS3PathSegment(userId);
  if (!safeBasePath || !safeUserId) {
    return null;
  }
  return { basePath: safeBasePath, userId: safeUserId, fileName: fileNameParts.join('/') };
};

async function getS3URLForKey({
  key,
  customFilename = null,
  contentType = null,
}: {
  key: string;
  customFilename?: string | null;
  contentType?: string | null;
}): Promise<string> {
  const params: GetObjectCommandInput = { Bucket: bucketName, Key: key };

  if (customFilename) {
    const safeFilename = sanitizeContentDispositionFilename(customFilename);
    params.ResponseContentDisposition = `attachment; filename="${safeFilename}"`;
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

export async function getS3URL({
  userId,
  fileName,
  basePath = defaultBasePath,
  customFilename = null,
  contentType = null,
  tenantId = null,
}: GetURLParams): Promise<string> {
  const key = getS3Key(basePath, userId, fileName, tenantId);
  return getS3URLForKey({ key, customFilename, contentType });
}

export async function saveBufferToS3({
  userId,
  buffer,
  fileName,
  basePath = defaultBasePath,
  tenantId = null,
  urlBuilder,
}: SaveBufferParams & { urlBuilder?: UrlBuilder }): Promise<string> {
  const key = getS3Key(basePath, userId, fileName, tenantId);
  const params = { Bucket: bucketName, Key: key, Body: buffer };

  try {
    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[saveBufferToS3] S3 not initialized');
    }

    await s3.send(new PutObjectCommand(params));
    const getUrl = urlBuilder ?? getS3URL;
    return await getUrl({ userId, fileName, basePath, tenantId });
  } catch (error) {
    logger.error('[saveBufferToS3] Error uploading buffer to S3:', (error as Error).message);
    throw error;
  }
}

interface PendingUploadBuffers {
  buffers: Buffer[];
  bytes: number;
}

const toUploadBuffer = (chunk: Buffer | string | Uint8Array): Buffer => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  return Buffer.from(chunk);
};

const takePendingBytes = (pending: PendingUploadBuffers, size: number): Buffer => {
  const output = Buffer.allocUnsafe(size);
  let offset = 0;

  while (offset < size) {
    const buffer = pending.buffers[0];
    const bytesNeeded = size - offset;

    if (buffer.length <= bytesNeeded) {
      buffer.copy(output, offset);
      offset += buffer.length;
      pending.bytes -= buffer.length;
      pending.buffers.shift();
      continue;
    }

    buffer.copy(output, offset, 0, bytesNeeded);
    pending.buffers[0] = buffer.subarray(bytesNeeded);
    pending.bytes -= bytesNeeded;
    offset += bytesNeeded;
  }

  return output;
};

async function saveReadableToS3({
  userId,
  body,
  fileName,
  basePath = defaultBasePath,
  tenantId = null,
  urlBuilder,
}: Omit<SaveBufferParams, 'buffer'> & {
  body: Readable;
  urlBuilder?: UrlBuilder;
}): Promise<{ filepath: string; bytes: number }> {
  const key = getS3Key(basePath, userId, fileName, tenantId);
  const pending: PendingUploadBuffers = { buffers: [], bytes: 0 };
  const completedParts: CompletedPart[] = [];
  let totalBytes = 0;
  let partNumber = 1;
  let uploadId: string | undefined;

  try {
    const s3 = initializeS3();
    if (!s3) {
      throw new Error('[saveReadableToS3] S3 not initialized');
    }

    const createMultipartUpload = async (): Promise<string> => {
      if (uploadId) {
        return uploadId;
      }
      const response = await s3.send(
        new CreateMultipartUploadCommand({ Bucket: bucketName, Key: key }),
      );
      if (!response.UploadId) {
        throw new Error('[saveReadableToS3] S3 did not return an upload ID');
      }
      uploadId = response.UploadId;
      return uploadId;
    };

    const uploadPart = async (partBody: Buffer): Promise<void> => {
      const currentUploadId = await createMultipartUpload();
      const response = await s3.send(
        new UploadPartCommand({
          Bucket: bucketName,
          Key: key,
          UploadId: currentUploadId,
          PartNumber: partNumber,
          Body: partBody,
        }),
      );
      completedParts.push({ ETag: response.ETag, PartNumber: partNumber });
      partNumber += 1;
    };

    for await (const chunk of body as AsyncIterable<Buffer | string | Uint8Array>) {
      const buffer = toUploadBuffer(chunk);
      pending.buffers.push(buffer);
      pending.bytes += buffer.length;
      totalBytes += buffer.length;

      while (pending.bytes >= MULTIPART_UPLOAD_PART_SIZE) {
        await uploadPart(takePendingBytes(pending, MULTIPART_UPLOAD_PART_SIZE));
      }
    }

    if (!uploadId) {
      const bodyBuffer =
        pending.bytes > 0 ? takePendingBytes(pending, pending.bytes) : Buffer.alloc(0);
      const params: PutObjectCommandInput = { Bucket: bucketName, Key: key, Body: bodyBuffer };
      await s3.send(new PutObjectCommand(params));
    } else {
      if (pending.bytes > 0) {
        await uploadPart(takePendingBytes(pending, pending.bytes));
      }
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
    }

    const getUrl = urlBuilder ?? getS3URL;
    return { filepath: await getUrl({ userId, fileName, basePath, tenantId }), bytes: totalBytes };
  } catch (error) {
    if (uploadId) {
      try {
        await initializeS3()?.send(
          new AbortMultipartUploadCommand({ Bucket: bucketName, Key: key, UploadId: uploadId }),
        );
      } catch (abortError) {
        logger.warn('[saveReadableToS3] Error aborting multipart upload:', abortError);
      }
    }
    logger.error('[saveReadableToS3] Error uploading stream to S3:', (error as Error).message);
    throw error;
  }
}

export async function saveURLToS3WithMetadata({
  userId,
  URL,
  fileName,
  basePath = defaultBasePath,
  tenantId = null,
  urlBuilder,
}: SaveURLParams & { urlBuilder?: UrlBuilder }): Promise<SaveURLResult> {
  try {
    const response = await fetch(URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (response.body) {
      const source = Readable.fromWeb(
        response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      const result = await saveReadableToS3({
        userId,
        body: source,
        fileName,
        basePath,
        tenantId,
        urlBuilder,
      });
      return {
        filepath: result.filepath,
        bytes: result.bytes,
        type: contentType,
        dimensions: {},
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filepath = await saveBufferToS3({
      userId,
      buffer,
      fileName,
      basePath,
      tenantId,
      urlBuilder,
    });
    return {
      filepath,
      bytes: buffer.byteLength,
      type: contentType,
      dimensions: {},
    };
  } catch (error) {
    logger.error('[saveURLToS3] Error uploading file from URL to S3:', (error as Error).message);
    throw error;
  }
}

export async function saveURLToS3(
  params: SaveURLParams & { urlBuilder?: UrlBuilder },
): Promise<string> {
  const { filepath } = await saveURLToS3WithMetadata(params);
  return filepath;
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

export async function deleteFileFromS3(req: ServerRequest, file: TFile): Promise<void> {
  if (!req.user) {
    throw new Error('[deleteFileFromS3] User not authenticated');
  }

  const key = extractKeyFromS3Url(file.filepath);
  const parsedKey = parseS3Key(key);
  const ownerId = file.user?.toString?.();
  const fileTenantId = file.tenantId?.toString?.() ?? null;

  if (!ownerId) {
    const message = `[deleteFileFromS3] File record has no owner: ${key}`;
    logger.error(message);
    throw new Error(message);
  }

  if (!parsedKey || parsedKey.userId !== ownerId) {
    const message = `[deleteFileFromS3] File owner mismatch: ${ownerId} vs ${key}`;
    logger.error(message);
    throw new Error(message);
  }
  if ((parsedKey.tenantId ?? null) !== fileTenantId) {
    const message = `[deleteFileFromS3] Tenant ID mismatch: ${fileTenantId} vs ${key}`;
    logger.error(message);
    throw new Error(message);
  }

  const s3 = initializeS3();
  if (!s3) {
    throw new Error('[deleteFileFromS3] S3 not initialized');
  }

  const params = { Bucket: bucketName, Key: key };

  try {
    try {
      const headCommand = new HeadObjectCommand(params);
      await s3.send(headCommand);
      logger.debug('[deleteFileFromS3] File exists, proceeding with deletion');
    } catch (headErr) {
      if ((headErr as { name?: string }).name === 'NotFound') {
        logger.warn(`[deleteFileFromS3] File does not exist: ${key}`);
        await deleteRagFile({ userId: ownerId, file });
        return;
      }
      throw headErr;
    }

    await s3.send(new DeleteObjectCommand(params));
    await deleteRagFile({ userId: ownerId, file });
    logger.debug('[deleteFileFromS3] S3 File deletion completed');
  } catch (error) {
    logger.error(`[deleteFileFromS3] Error deleting file from S3: ${(error as Error).message}`);
    logger.error((error as Error).stack);

    if ((error as { name?: string }).name === 'NoSuchKey') {
      await deleteRagFile({ userId: ownerId, file });
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
  tenantId = null,
  urlBuilder,
}: UploadFileParams & { urlBuilder?: UrlBuilder }): Promise<UploadResult> {
  if (!req.user) {
    throw new Error('[uploadFileToS3] User not authenticated');
  }

  try {
    const inputFilePath = file.path;
    const userId = req.user.id;
    const resolvedTenantId = tenantId ?? req.user.tenantId ?? null;
    const fileName = `${file_id}__${file.originalname}`;
    const key = getS3Key(basePath, userId, fileName, resolvedTenantId);

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
    const fileURL = await getUrl({ userId, fileName, basePath, tenantId: resolvedTenantId });
    // NOTE: temp file is intentionally NOT deleted on the success path.
    // The caller (processAgentFileUpload) reads file.path after this returns
    // to stream the file to the RAG vector embedding service (POST /embed).
    // Temp file lifecycle on success is the caller's responsibility.
    return { filepath: fileURL, bytes };
  } catch (error) {
    logger.error('[uploadFileToS3] Error streaming file to S3:', error);
    if (file?.path) {
      await fs.promises
        .unlink(file.path)
        .catch((e: unknown) =>
          logger.error('[uploadFileToS3] Failed to delete temp file:', (e as Error).message),
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
    if (!data.Body) {
      throw new Error(`[getS3FileStream] S3 response body is empty for key: ${Key}`);
    }
    return data.Body as Readable;
  } catch (error) {
    logger.error('[getS3FileStream] Error retrieving S3 file stream:', error);
    throw error;
  }
}

export async function getS3DownloadURL({
  file,
  customFilename = null,
  contentType = null,
}: DownloadURLParams): Promise<string> {
  const key = extractKeyFromS3Url(file.filepath);
  if (!key) {
    throw new Error('[getS3DownloadURL] Unable to extract S3 key from file path');
  }
  return getS3URLForKey({ key, customFilename, contentType });
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
    const now = new Date();

    if (s3RefreshExpiryMs !== null) {
      const urlAge = now.getTime() - dateObj.getTime();
      return urlAge >= s3RefreshExpiryMs;
    }

    const expiresAtDate = new Date(dateObj.getTime() + parseInt(expiresParam) * 1000);
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

    const parsedKey = parseS3Key(s3Key);
    if (!parsedKey) {
      return;
    }

    return getS3URL(parsedKey);
  } catch (error) {
    logger.error('Error getting new S3 URL:', error);
  }
}

export async function refreshS3FileUrls(
  files: TFile[] | null | undefined,
  batchUpdateFiles: BatchUpdateFn,
  bufferSeconds = 3600,
): Promise<TFile[]> {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  const filesToUpdate: Array<{ file_id: string; filepath: string }> = [];
  const updatedFiles = [...files];

  for (let i = 0; i < updatedFiles.length; i++) {
    const file = updatedFiles[i];
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
      updatedFiles[i] = { ...file, filepath: newURL };
    } catch (error) {
      logger.error(`Error refreshing S3 URL for file ${file.file_id}:`, error);
    }
  }

  if (filesToUpdate.length > 0) {
    await batchUpdateFiles(filesToUpdate);
  }

  return updatedFiles;
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

    const parsedKey = parseS3Key(s3Key);
    if (!parsedKey) {
      logger.warn(`Invalid S3 key format: ${s3Key}`);
      return fileObj.filepath;
    }

    const newUrl = await getS3URL(parsedKey);
    logger.debug(`Refreshed S3 URL for key: ${s3Key}`);
    return newUrl;
  } catch (error) {
    logger.error(`Error refreshing S3 URL: ${(error as Error).message}`);
    return fileObj.filepath;
  }
}
