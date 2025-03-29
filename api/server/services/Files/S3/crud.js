const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { initializeS3 } = require('./initialize');
const { logger } = require('~/config');

const bucketName = process.env.AWS_BUCKET_NAME;
const defaultBasePath = 'images';

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
 * Retrieves a signed URL for a file stored in S3.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.fileName - The file name in S3.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<string>} A signed URL valid for 24 hours.
 */
async function getS3URL({ userId, fileName, basePath = defaultBasePath }) {
  const key = getS3Key(basePath, userId, fileName);
  const params = { Bucket: bucketName, Key: key };

  try {
    const s3 = initializeS3();
    return await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: 86400 });
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
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.fileName - The file name in S3.
 * @param {string} [params.basePath='images'] - The base path in the bucket.
 * @returns {Promise<void>}
 */
async function deleteFileFromS3({ userId, fileName, basePath = defaultBasePath }) {
  const key = getS3Key(basePath, userId, fileName);
  const params = { Bucket: bucketName, Key: key };

  try {
    const s3 = initializeS3();
    await s3.send(new DeleteObjectCommand(params));
    logger.debug('[deleteFileFromS3] File deleted successfully from S3');
  } catch (error) {
    logger.error('[deleteFileFromS3] Error deleting file from S3:', error.message);
    // If the file is not found, we can safely return.
    if (error.code === 'NoSuchKey') {
      return;
    }
    throw error;
  }
}

/**
 * Uploads a local file to S3.
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
    const inputBuffer = await fs.promises.readFile(inputFilePath);
    const bytes = Buffer.byteLength(inputBuffer);
    const userId = req.user.id;
    const fileName = `${file_id}__${path.basename(inputFilePath)}`;
    const fileURL = await saveBufferToS3({ userId, buffer: inputBuffer, fileName, basePath });
    await fs.promises.unlink(inputFilePath);
    return { filepath: fileURL, bytes };
  } catch (error) {
    logger.error('[uploadFileToS3] Error uploading file to S3:', error.message);
    throw error;
  }
}

/**
 * Extracts the S3 key from a full S3 URL.
 *
 * @param {string} s3Url - The full S3 URL
 * @returns {string} The S3 key
 */
function extractKeyFromS3Url(s3Url) {
  try {
    // Parse the URL
    const url = new URL(s3Url);
    // Extract the path from the URL, removing the leading slash
    let key = url.pathname.substring(1);

    return key;
  } catch (error) {
    throw new Error(`Failed to extract key from S3 URL: ${error.message}`);
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

module.exports = {
  saveBufferToS3,
  saveURLToS3,
  getS3URL,
  deleteFileFromS3,
  uploadFileToS3,
  getS3FileStream,
};
