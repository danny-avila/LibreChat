const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const { getBufferMetadata } = require('~/server/utils');
const { initializeS3 } = require('./initialize');
const { logger } = require('~/config');
const bucketName = process.env.AWS_BUCKET_NAME;
const s3 = initializeS3();
const FileModel = require('~/models/File');

/**
 * Saves a file from a given URL to an S3 bucket.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier.
 * @param {string} params.URL - The URL of the file to be uploaded.
 * @param {string} params.fileName - The name to save the file as in S3.
 * @param {string} [params.basePath='images'] - Optional. The base path in the S3 bucket where the file will be stored.
 * @returns {Promise<{ bytes: number, type: string, dimensions: Record<string, number>} | null>}
 */
async function saveURLToS3({ userId, URL, fileName, basePath = 'images' }) {
  const response = await fetch(URL);
  const buffer = await response.buffer();

  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${userId.toString()}/${fileName}`,
    Body: buffer,
  };

  try {
    await s3.upload(params).promise();
    return await getBufferMetadata(buffer);
  } catch (error) {
    logger.error('Error uploading file to S3:', error.message);
    return null;
  }
}

/**
 * Retrieves the download URL for a specified file from an S3 bucket.
 * @param {Object} params - The parameters object.
 * @param {string} params.fileName - The name of the file for which the URL is to be retrieved.
 * @param {string} [params.basePath='images'] - Optional. The base path in the S3 bucket where the file is stored.
 * @returns {Promise<string|null>}
 */
async function getS3URL({ fileName, basePath = 'images' }) {
  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${fileName}`,
    Expires: 86400, // URL expires in 24 hours
  };

  try {
    const url = s3.getSignedUrl('getObject', params);
    return url;
  } catch (error) {
    logger.error('Error getting URL from S3:', error.message);
    return null;
  }
}

/**
 * Uploads a buffer to an S3 bucket.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user's unique identifier.
 * @param {Buffer} params.buffer - The buffer to be uploaded.
 * @param {string} params.fileName - The name of the file to be saved in S3.
 * @param {string} [params.basePath='images'] - Optional. The base path in the S3 bucket where the file will be stored.
 * @returns {Promise<string>}
 */
async function saveBufferToS3({ userId, buffer, fileName, basePath = 'images' }) {
  const params = {
    Bucket: bucketName,
    Key: `${basePath}/${userId}/${fileName}`,
    Body: buffer,
  };

  try {
    await s3.upload(params).promise();
    const signedUrl = await getS3URL({ fileName, basePath: `${basePath}/${userId}` });
    return signedUrl;
  } catch (error) {
    logger.error('Error uploading buffer to S3:', error.message);
    throw error;
  }
}

/**
 * Extracts the S3 file path from a signed URL.
 * @param {string} url - The signed URL.
 * @returns {string} - The file path in S3.
 */
function extractS3FilePath(url) {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname; // This is the part after the bucket name
  return decodeURIComponent(pathname.substring(1)); // Remove the leading "/" and decode
}

/**
 * Deletes a file from S3 using its signed URL.
 * @param {string} signedUrl - The signed URL of the file to delete.
 * @returns {Promise<Object>} - The data returned from the S3 delete operation.
 */
async function deleteFiles(signedUrl) {
  try {
    const keyPath = extractS3FilePath(signedUrl);
    const params = {
      Bucket: bucketName,
      Key: keyPath,
    };
    const data = await s3.deleteObject(params).promise();
    return data;
  } catch (error) {
    logger.error('Error deleting file from S3:', error.message);
    throw error;
  }
}

/**
 * Deletes a file from the database.
 * @param {string} fileId - The ID of the file to delete.
 * @returns {Promise<void>}
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
 * Deletes a file from S3 based on user and file object.
 * @param {Express.Request} req - The request object from Express.
 * It should contain a `user` object with an `id` property.
 * @param {MongoFile} file - The file object to be deleted.
 * @returns {Promise<void>}
 */
const deleteS3FileByPath = async (req, file) => {
  if (file.embedded && process.env.RAG_API_URL) {
    const jwtToken = req.headers.authorization.split(' ')[1];
    axios.delete(`${process.env.RAG_API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
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
 * Uploads a file to an S3 bucket.
 * @param {Object} params - The parameters object.
 * @param {Express.Request} params.req - The request object from Express.
 * It should contain a `user` property with an `id`.
 * @param {Express.Multer.File} params.file - The file object which is part of the request.
 * The file object should have a `path` property that points to the location of the uploaded file.
 * @param {string} params.file_id - The file ID.
 * @returns {Promise<{ filepath: string, bytes: number }>}
 */
async function uploadFileToS3({ req, file, file_id }) {
  const inputFilePath = file.path;
  const inputBuffer = await fs.promises.readFile(inputFilePath);
  const bytes = Buffer.byteLength(inputBuffer);
  const userId = req.user.id;

  const fileName = `${file_id}__${path.basename(inputFilePath)}`;

  const params = {
    Bucket: bucketName,
    Key: `${userId}/${fileName}`,
    Body: inputBuffer,
  };

  try {
    const data = await s3.upload(params).promise();
    await fs.promises.unlink(inputFilePath); // Delete the file locally
    return { filepath: data.Location, bytes };
  } catch (error) {
    logger.error('Error uploading file to S3:', error.message);
    throw error;
  }
}

/**
 * Retrieves a readable stream for a file from S3.
 * @param {string} filePath - The S3 file key.
 * @returns {Promise<ReadableStream>} A promise that resolves to a readable stream of the file.
 */
async function getS3FileStream(filePath) {
  const params = {
    Bucket: bucketName,
    Key: filePath,
  };

  try {
    const data = s3.getObject(params).createReadStream();
    return data;
  } catch (error) {
    logger.error('Error getting S3 file stream:', error.message);
    throw error;
  }
}

module.exports = {
  deleteFiles,
  getS3URL,
  saveURLToS3,
  deleteS3FileByPath,
  uploadFileToS3,
  saveBufferToS3,
  getS3FileStream,
};
