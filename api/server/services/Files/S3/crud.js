const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const { getBufferMetadata } = require('~/server/utils');
const { initializeS3 } = require('./initialize');
const { logger } = require('~/config');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const FileModel = require('~/models/File');

const bucketName = process.env.AWS_BUCKET_NAME;
const s3 = initializeS3();

/**
 * Saves a file from a provided URL to an S3 bucket.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.URL - The URL of the file to be uploaded.
 * @param {string} params.fileName - The name to save the file as in S3.
 * @param {string} [params.basePath='images'] - The base path in the S3 bucket where the file will be stored.
 * @returns {Promise<Object|null>} A promise that resolves to the buffer metadata (including bytes, type, dimensions) or null if error.
 */
async function saveURLToS3({ userId, URL, fileName, basePath = 'images' }) {
  const response = await fetch(URL);
  const buffer = await response.buffer();

  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${userId}/${fileName}`,
    Body: buffer,
  };

  try {
    await s3.send(new PutObjectCommand(params));
    return await getBufferMetadata(buffer);
  } catch (error) {
    logger.error('Error uploading file to S3:', error.message);
    return null;
  }
}

/**
 * Retrieves a signed URL for a specified file in S3.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.fileName - The name of the file in S3.
 * @param {string} [params.basePath='images'] - The base path in the S3 bucket where the file is stored.
 * @returns {Promise<string|null>} A promise that resolves to a signed URL or null if error.
 */
async function getS3URL({ fileName, basePath = 'images' }) {
  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${fileName}`,
  };

  try {
    const url = await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: 86400 });
    return url;
  } catch (error) {
    logger.error('Error getting URL from S3:', error.message);
    return null;
  }
}

/**
 * Uploads a buffer to S3 and returns its signed URL.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier.
 * @param {Buffer} params.buffer - The buffer containing file data.
 * @param {string} params.fileName - The name of the file to be saved in S3.
 * @param {string} [params.basePath='images'] - The base path in the S3 bucket.
 * @returns {Promise<string>} A promise that resolves to the signed URL of the uploaded file.
 * @throws {Error} Throws error if upload fails.
 */
async function saveBufferToS3({ userId, buffer, fileName, basePath = 'images' }) {
  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${userId}/${fileName}`,
    Body: buffer,
  };

  try {
    await s3.send(new PutObjectCommand(params));
    return await getS3URL({ fileName, basePath: `${basePath}/${userId}` });
  } catch (error) {
    logger.error('Error uploading buffer to S3:', error.message);
    throw error;
  }
}

/**
 * Extracts the S3 key path from a signed URL.
 *
 * @param {string} url - The signed URL.
 * @returns {string} The S3 key path extracted from the URL.
 */
function extractS3FilePath(url) {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname; // Part after the bucket name
  return decodeURIComponent(pathname.substring(1)); // Remove leading "/" and decode
}

/**
 * Deletes a file from S3 using its signed URL.
 *
 * @param {string} signedUrl - The signed URL of the file to delete.
 * @returns {Promise<Object>} A promise that resolves to the deletion result.
 * @throws {Error} Throws error if deletion fails.
 */
async function deleteFiles(signedUrl) {
  try {
    const keyPath = extractS3FilePath(signedUrl);
    const params = { Bucket: bucketName, Key: keyPath };
    return await s3.send(new DeleteObjectCommand(params));
  } catch (error) {
    logger.error('Error deleting file from S3:', error.message);
    throw error;
  }
}

/**
 * Deletes a file record from the database.
 *
 * @param {string} fileId - The ID of the file to delete.
 * @returns {Promise<void>} A promise that resolves when the file record is deleted.
 * @throws {Error} Throws error if deletion from the database fails.
 */
async function deleteFileFromDatabase(fileId) {
  try {
    const result = await FileModel.deleteFile(fileId);
    if (result) {
      logger.info(`Successfully deleted ${fileId} from database`);
    } else {
      logger.warn(`File ${fileId} not found in database`);
    }
  } catch (error) {
    logger.error('Error deleting file from database:', error.message);
    throw error;
  }
}

/**
 * Deletes a file from S3 and its corresponding database record.
 *
 * @param {import('express').Request} req - The Express request object (must contain user and headers).
 * @param {Object} file - The file object containing file_id and filepath.
 * @returns {Promise<void>} A promise that resolves when deletion is complete.
 * @throws {Error} Throws error if deletion fails.
 */
const deleteS3FileByPath = async (req, file) => {
  if (file.embedded && process.env.RAG_API_URL) {
    const jwtToken = req.headers.authorization.split(' ')[1];
    // Optionally await this if you want to handle errors
    await axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: [file.file_id],
    });
  }
  const signedUrl = file.filepath;
  try {
    await deleteFiles(signedUrl);
    await deleteFileFromDatabase(file.file_id);
  } catch (error) {
    logger.error('Error deleting file from S3:', error);
    if (error.code === 'storage/object-not-found') {
      return;
    }
    throw error;
  }
};

/**
 * Uploads a file (from local disk) to S3 and returns the signed URL and file size.
 *
 * @param {Object} params - The parameters object.
 * @param {import('express').Request} params.req - The Express request object (must contain user).
 * @param {Express.Multer.File} params.file - The file object containing the file path.
 * @param {string} params.file_id - The file ID to use in naming the file in S3.
 * @returns {Promise<{ filepath: string, bytes: number }>} A promise that resolves to an object with the signed URL and file size in bytes.
 * @throws {Error} Throws error if upload fails.
 */
async function uploadFileToS3({ req, file, file_id }) {
  const inputFilePath = file.path;
  const inputBuffer = await fs.promises.readFile(inputFilePath);
  const bytes = Buffer.byteLength(inputBuffer);
  const userId = req.user.id;
  const fileName = `${file_id}__${path.basename(inputFilePath)}`;
  const params = { Bucket: bucketName, Key: `${userId}/${fileName}`, Body: inputBuffer };

  try {
    await s3.send(new PutObjectCommand(params));
    await fs.promises.unlink(inputFilePath); // Remove local file
    const signedUrl = await getS3URL({ fileName, basePath: userId });
    return { filepath: signedUrl, bytes };
  } catch (error) {
    logger.error('Error uploading file to S3:', error.message);
    throw error;
  }
}

/**
 * Retrieves a readable stream for a file from S3.
 *
 * @param {string} filePath - The S3 key for the file.
 * @returns {Promise<NodeJS.ReadableStream>} A promise that resolves to a readable stream of the file.
 * @throws {Error} Throws error if retrieval fails.
 */
async function getS3FileStream(filePath) {
  const params = { Bucket: bucketName, Key: filePath };
  try {
    const data = await s3.send(new GetObjectCommand(params));
    return data.Body; // Node.js ReadableStream
  } catch (error) {
    logger.error('Error getting S3 file stream:', error.message);
    throw error;
  }
}

module.exports = {
  saveURLToS3,
  getS3URL,
  saveBufferToS3,
  extractS3FilePath,
  deleteFiles,
  deleteFileFromDatabase,
  deleteS3FileByPath,
  uploadFileToS3,
  getS3FileStream,
};
