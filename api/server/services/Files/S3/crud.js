const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { FileSources } = require('librechat-data-provider');
const {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { initializeS3 } = require('./initialize');
const { logger } = require('~/config');

const bucketName = process.env.AWS_BUCKET_NAME;
const defaultBasePath = 'images';

let s3UrlExpirySeconds = 7 * 24 * 60 * 60;

if (process.env.S3_URL_EXPIRY_SECONDS !== undefined) {
  const parsed = parseInt(process.env.S3_URL_EXPIRY_SECONDS, 10);

  if (!isNaN(parsed) && parsed > 0) {
    s3UrlExpirySeconds = Math.min(parsed, 7 * 24 * 60 * 60);
  } else {
    logger.warn(
      `[S3] Invalid S3_URL_EXPIRY_SECONDS value: "${process.env.S3_URL_EXPIRY_SECONDS}". Using 7-day expiry.`,
    );
  }
}

/**
 * Constructs the S3 key based on the base path, user ID, and file name.
 */
const getS3Key = (basePath, userId, fileName) => `${basePath}/${userId}/${fileName}`;

/**
 * Uploads a buffer to S3 and returns a signed URL.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's unique identifier.
 * @param {Buffer} params.buffer - The buffer containing file data.
 * @param {string} params.fileName - The file name to use in S3.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<string>} Signed URL of the uploaded file.
 */
async function saveBufferToS3({ userId, buffer, fileName, basePath = defaultBasePath }) {
  const key = getS3Key(basePath, userId, fileName);
  const params = { Bucket: bucketName, Key: key, Body: buffer };

  try {
    const s3 = initializeS3();
    await s3.send(new PutObjectCommand(params));
    return await getS3URL({ userId, fileName, basePath });
  } catch (error) {
    logger.error('[saveBufferToS3] Error uploading buffer to S3:', error.message);
    throw error;
  }
}

/**
 * Retrieves a URL for a file stored in S3.
 * Returns a signed URL with expiration time or a proxy URL based on config
 *
 * @param {Object} params
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.fileName - The file name in S3.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<string>} A URL to access the S3 object
 */
async function getS3URL({ userId, fileName, basePath = defaultBasePath }) {
  const key = getS3Key(basePath, userId, fileName);
  const params = { Bucket: bucketName, Key: key };

  try {
    const s3 = initializeS3();
    return await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: s3UrlExpirySeconds });
  } catch (error) {
    logger.error('[getS3URL] Error getting signed URL from S3:', error.message);
    throw error;
  }
}

/**
 * Saves a file from a given URL to S3.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.URL - The source URL of the file.
 * @param {string} params.fileName - The file name to use in S3.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<string>} Signed URL of the uploaded file.
 */
async function saveURLToS3({ userId, URL, fileName, basePath = defaultBasePath }) {
  try {
    const response = await fetch(URL);
    const buffer = await response.buffer();
    // Optionally you can call getBufferMetadata(buffer) if needed.
    return await saveBufferToS3({ userId, buffer, fileName, basePath });
  } catch (error) {
    logger.error('[saveURLToS3] Error uploading file from URL to S3:', error.message);
    throw error;
  }
}

/**
 * Deletes a file from S3.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {MongoFile} params.file - The file object to delete.
 * @returns {Promise<void>}
 */
async function deleteFileFromS3(req, file) {
  const key = extractKeyFromS3Url(file.filepath);
  const params = { Bucket: bucketName, Key: key };
  if (!key.includes(req.user.id)) {
    const message = `[deleteFileFromS3] User ID mismatch: ${req.user.id} vs ${key}`;
    logger.error(message);
    throw new Error(message);
  }

  try {
    const s3 = initializeS3();

    try {
      const headCommand = new HeadObjectCommand(params);
      await s3.send(headCommand);
      logger.debug('[deleteFileFromS3] File exists, proceeding with deletion');
    } catch (headErr) {
      if (headErr.name === 'NotFound') {
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
      if (verifyErr.name === 'NotFound') {
        logger.debug(`[deleteFileFromS3] Verified file is deleted: ${key}`);
      } else {
        logger.error('[deleteFileFromS3] Error verifying deletion:', verifyErr);
      }
    }

    logger.debug('[deleteFileFromS3] S3 File deletion completed');
  } catch (error) {
    logger.error(`[deleteFileFromS3] Error deleting file from S3: ${error.message}`);
    logger.error(error.stack);

    // If the file is not found, we can safely return.
    if (error.code === 'NoSuchKey') {
      return;
    }
    throw error;
  }
}

/**
 * Uploads a local file to S3 by streaming it directly without loading into memory.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req - The Express request (must include user).
 * @param {Express.Multer.File} params.file - The file object from Multer.
 * @param {string} params.file_id - Unique file identifier.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<{ filepath: string, bytes: number }>}
 */
async function uploadFileToS3({ req, file, file_id, basePath = defaultBasePath }) {
  try {
    const inputFilePath = file.path;
    const userId = req.user.id;
    const fileName = `${file_id}__${path.basename(inputFilePath)}`;
    const key = getS3Key(basePath, userId, fileName);

    const stats = await fs.promises.stat(inputFilePath);
    const bytes = stats.size;
    const fileStream = fs.createReadStream(inputFilePath);

    const s3 = initializeS3();
    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
    };

    await s3.send(new PutObjectCommand(uploadParams));
    const fileURL = await getS3URL({ userId, fileName, basePath });
    return { filepath: fileURL, bytes };
  } catch (error) {
    logger.error('[uploadFileToS3] Error streaming file to S3:', error);
    try {
      if (file && file.path) {
        await fs.promises.unlink(file.path);
      }
    } catch (unlinkError) {
      logger.error(
        '[uploadFileToS3] Error deleting temporary file, likely already deleted:',
        unlinkError.message,
      );
    }
    throw error;
  }
}

/**
 * Extracts the S3 key from a URL or returns the key if already properly formatted
 *
 * @param {string} fileUrlOrKey - The file URL or key
 * @returns {string} The S3 key
 */
function extractKeyFromS3Url(fileUrlOrKey) {
  if (!fileUrlOrKey) {
    throw new Error('Invalid input: URL or key is empty');
  }

  try {
    const url = new URL(fileUrlOrKey);
    return url.pathname.substring(1);
  } catch (error) {
    const parts = fileUrlOrKey.split('/');

    if (parts.length >= 3 && !fileUrlOrKey.startsWith('http') && !fileUrlOrKey.startsWith('/')) {
      return fileUrlOrKey;
    }

    return fileUrlOrKey.startsWith('/') ? fileUrlOrKey.substring(1) : fileUrlOrKey;
  }
}

/**
 * Retrieves a readable stream for a file stored in S3.
 *
 * @param {ServerRequest} req - Server request object.
 * @param {string} filePath - The S3 key of the file.
 * @returns {Promise<NodeJS.ReadableStream>}
 */
async function getS3FileStream(_req, filePath) {
  try {
    const Key = extractKeyFromS3Url(filePath);
    const params = { Bucket: bucketName, Key };
    const s3 = initializeS3();
    const data = await s3.send(new GetObjectCommand(params));
    return data.Body; // Returns a Node.js ReadableStream.
  } catch (error) {
    logger.error('[getS3FileStream] Error retrieving S3 file stream:', error);
    throw error;
  }
}

/**
 * Determines if a signed S3 URL is close to expiration
 *
 * @param {string} signedUrl - The signed S3 URL
 * @param {number} bufferSeconds - Buffer time in seconds
 * @returns {boolean} True if the URL needs refreshing
 */
function needsRefresh(signedUrl, bufferSeconds) {
  try {
    // Parse the URL
    const url = new URL(signedUrl);

    // Check if it has the signature parameters that indicate it's a signed URL
    // X-Amz-Signature is the most reliable indicator for AWS signed URLs
    if (!url.searchParams.has('X-Amz-Signature')) {
      // Not a signed URL, so no expiration to check (or it's already a proxy URL)
      return false;
    }

    // Extract the expiration time from the URL
    const expiresParam = url.searchParams.get('X-Amz-Expires');
    const dateParam = url.searchParams.get('X-Amz-Date');

    if (!expiresParam || !dateParam) {
      // Missing expiration information, assume it needs refresh to be safe
      return true;
    }

    // Parse the AWS date format (YYYYMMDDTHHMMSSZ)
    const year = dateParam.substring(0, 4);
    const month = dateParam.substring(4, 6);
    const day = dateParam.substring(6, 8);
    const hour = dateParam.substring(9, 11);
    const minute = dateParam.substring(11, 13);
    const second = dateParam.substring(13, 15);

    const dateObj = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const expiresAtDate = new Date(dateObj.getTime() + parseInt(expiresParam) * 1000);

    // Check if it's close to expiration
    const now = new Date();
    const bufferTime = new Date(now.getTime() + bufferSeconds * 1000);

    return expiresAtDate <= bufferTime;
  } catch (error) {
    logger.error('Error checking URL expiration:', error);
    // If we can't determine, assume it needs refresh to be safe
    return true;
  }
}

/**
 * Refreshes S3 URLs for an array of files if they're expired or close to expiring
 *
 * @param {IMongoFile[]} files - Array of file documents
 * @param {(files: MongoFile[]) => Promise<void>} batchUpdateFiles - Function to update files in the database
 * @param {number} [bufferSeconds=3600] - Buffer time in seconds to check for expiration
 * @returns {Promise<IMongoFile[]>} The files with refreshed URLs if needed
 */
async function refreshS3FileUrls(files, batchUpdateFiles, bufferSeconds = 3600) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return files;
  }

  const filesToUpdate = [];

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
      const s3Key = extractKeyFromS3Url(file.filepath);
      if (!s3Key) {
        continue;
      }
      const keyParts = s3Key.split('/');
      if (keyParts.length < 3) {
        continue;
      }

      const basePath = keyParts[0];
      const userId = keyParts[1];
      const fileName = keyParts.slice(2).join('/');

      const newUrl = await getS3URL({
        userId,
        fileName,
        basePath,
      });

      filesToUpdate.push({
        file_id: file.file_id,
        filepath: newUrl,
      });
      files[i].filepath = newUrl;
    } catch (error) {
      logger.error(`Error refreshing S3 URL for file ${file.file_id}:`, error);
    }
  }

  if (filesToUpdate.length > 0) {
    await batchUpdateFiles(filesToUpdate);
  }

  return files;
}

module.exports = {
  saveBufferToS3,
  saveURLToS3,
  getS3URL,
  deleteFileFromS3,
  uploadFileToS3,
  getS3FileStream,
  refreshS3FileUrls,
};
