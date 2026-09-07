const fs = require('fs');
const path = require('path');
const mime = require('mime');
const axios = require('axios');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');
const {
  deleteRagFile,
  assertRemoteFileURL,
  getAzureContainerClient,
  getRemoteFileFetchMaxBytes,
  getRemoteFileFetchTimeoutMs,
  assertRemoteFileContentLength,
} = require('@librechat/api');

const defaultBasePath = 'images';

/**
 * Whether the container is configured for anonymous (public) blob access.
 * Read per call so a process can be reconfigured without a restart (and so tests can toggle it).
 * @returns {boolean}
 */
function isAzurePublicAccess() {
  return (process.env.AZURE_STORAGE_PUBLIC_ACCESS ?? 'true').toLowerCase() === 'true';
}

/** @returns {string} The configured container name (defaults to `files`). */
function getAzureContainerName() {
  return process.env.AZURE_CONTAINER_NAME || 'files';
}

/**
 * Resolves the blob path (`{basePath}/{userId}/{fileName}`) from a stored file path.
 *
 * Public containers store the absolute blob URL (`https://{account}.blob.core.windows.net/{container}/{path}`);
 * private containers store a root-relative path (`/{path}`) that the app serves itself, because the
 * browser cannot fetch a private blob directly. Both shapes resolve to the same blob path.
 *
 * @param {string} fileURL - Absolute blob URL or root-relative stored path.
 * @param {string} [containerName] - The container the blob lives in.
 * @returns {string} The blob path within the container.
 */
function getAzureBlobPath(fileURL, containerName = getAzureContainerName()) {
  if (typeof fileURL !== 'string' || fileURL.length === 0) {
    throw new Error('Invalid Azure blob file path');
  }
  let pathname = fileURL;
  if (/^https?:\/\//i.test(fileURL)) {
    pathname = decodeURIComponent(new URL(fileURL).pathname);
    const containerPrefix = `/${containerName}/`;
    if (!pathname.startsWith(containerPrefix)) {
      throw new Error(`Blob URL is not in container "${containerName}"`);
    }
    pathname = pathname.slice(containerPrefix.length);
  } else {
    pathname = pathname.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  }
  if (pathname.length === 0 || pathname.split('/').some((segment) => segment === '..')) {
    throw new Error('Invalid Azure blob file path');
  }
  return pathname;
}

/**
 * The file path stored for (and handed to) clients. Public containers expose the blob URL directly;
 * private containers expose the root-relative `/{blobPath}` served by the app (`/images/...`), so the
 * download goes through the app's identity instead of an anonymous request the container would refuse.
 *
 * @param {import('@azure/storage-blob').BlockBlobClient} blockBlobClient
 * @param {string} blobPath
 * @returns {string}
 */
function getAzureStoredPath(blockBlobClient, blobPath) {
  return isAzurePublicAccess() ? blockBlobClient.url : `/${blobPath}`;
}

/**
 * Uploads a buffer to Azure Blob Storage.
 *
 * Files will be stored at the path: {basePath}/{userId}/{fileName} within the container.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's id.
 * @param {Buffer} params.buffer - The buffer to upload.
 * @param {string} params.fileName - The name of the file.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The URL of the uploaded blob.
 */
async function saveBufferToAzure({
  userId,
  buffer,
  fileName,
  basePath = defaultBasePath,
  containerName,
}) {
  try {
    const containerClient = await getAzureContainerClient(containerName);
    const access = isAzurePublicAccess() ? 'blob' : undefined;
    // Create the container if it doesn't exist. This is done per operation.
    await containerClient.createIfNotExists({ access });
    const blobPath = `${basePath}/${userId}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    await blockBlobClient.uploadData(buffer);
    return getAzureStoredPath(blockBlobClient, blobPath);
  } catch (error) {
    logger.error('[saveBufferToAzure] Error uploading buffer:', error);
    throw error;
  }
}

/**
 * Saves a file from a URL to Azure Blob Storage.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's id.
 * @param {string} params.URL - The URL of the file.
 * @param {string} params.fileName - The name of the file.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The URL of the uploaded blob.
 */
async function saveURLToAzure({
  userId,
  URL,
  fileName,
  basePath = defaultBasePath,
  containerName,
}) {
  try {
    const maxBytes = getRemoteFileFetchMaxBytes();
    const response = await fetch(assertRemoteFileURL(URL), {
      timeout: getRemoteFileFetchTimeoutMs(),
      size: maxBytes,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    assertRemoteFileContentLength(response.headers, maxBytes);
    const buffer = await response.buffer();
    if (buffer.length > maxBytes) {
      throw new Error(`Remote file response too large: ${buffer.length} bytes`);
    }

    return await saveBufferToAzure({ userId, buffer, fileName, basePath, containerName });
  } catch (error) {
    logger.error('[saveURLToAzure] Error uploading file from URL:', error);
    throw error;
  }
}

/**
 * Retrieves a blob URL from Azure Blob Storage.
 *
 * @param {Object} params
 * @param {string} params.fileName - The file name.
 * @param {string} [params.basePath='images'] - The base folder used during upload.
 * @param {string} [params.userId] - If files are stored in a user-specific directory.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The blob's URL.
 */
async function getAzureURL({ fileName, basePath = defaultBasePath, userId, containerName }) {
  try {
    const containerClient = await getAzureContainerClient(containerName);
    const blobPath = userId ? `${basePath}/${userId}/${fileName}` : `${basePath}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    return getAzureStoredPath(blockBlobClient, blobPath);
  } catch (error) {
    logger.error('[getAzureURL] Error retrieving blob URL:', error);
    throw error;
  }
}

/**
 * Deletes a blob from Azure Blob Storage.
 *
 * @param {Object} params
 * @param {ServerRequest} params.req - The Express request object.
 * @param {MongoFile} params.file - The file object.
 */
async function deleteFileFromAzure(req, file) {
  await deleteRagFile({ userId: req.user.id, file });

  try {
    const containerName = getAzureContainerName();
    const containerClient = await getAzureContainerClient(containerName);
    const blobPath = getAzureBlobPath(file.filepath, containerName);
    if (!blobPath.includes(req.user.id)) {
      throw new Error('User ID not found in blob path');
    }
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    await blockBlobClient.delete();
    logger.debug('[deleteFileFromAzure] Blob deleted successfully from Azure Blob Storage');
  } catch (error) {
    logger.error('[deleteFileFromAzure] Error deleting blob:', error);
    if (error.statusCode === 404) {
      return;
    }
    throw error;
  }
}

/**
 * Streams a file from disk directly to Azure Blob Storage without loading
 * the entire file into memory.
 *
 * @param {Object} params
 * @param {string} params.userId - The user's id.
 * @param {string} params.filePath - The local file path to upload.
 * @param {string} params.fileName - The name of the file in Azure.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The URL of the uploaded blob.
 */
async function streamFileToAzure({
  userId,
  filePath,
  fileName,
  basePath = defaultBasePath,
  containerName,
}) {
  try {
    const containerClient = await getAzureContainerClient(containerName);
    const access = isAzurePublicAccess() ? 'blob' : undefined;

    // Create the container if it doesn't exist
    await containerClient.createIfNotExists({ access });

    const blobPath = `${basePath}/${userId}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    // Get file size for proper content length
    const stats = await fs.promises.stat(filePath);

    // Create read stream from the file
    const fileStream = fs.createReadStream(filePath);

    const blobContentType = mime.getType(fileName);
    await blockBlobClient.uploadStream(
      fileStream,
      undefined, // Use default concurrency (5)
      undefined, // Use default buffer size (8MB)
      {
        blobHTTPHeaders: {
          blobContentType,
        },
        onProgress: (progress) => {
          logger.debug(
            `[streamFileToAzure] Upload progress: ${progress.loadedBytes} bytes of ${stats.size}`,
          );
        },
      },
    );

    return getAzureStoredPath(blockBlobClient, blobPath);
  } catch (error) {
    logger.error('[streamFileToAzure] Error streaming file:', error);
    throw error;
  }
}

/**
 * Uploads a file from the local file system to Azure Blob Storage.
 *
 * This function reads the file from disk and then uploads it to Azure Blob Storage
 * at the path: {basePath}/{userId}/{fileName}.
 *
 * @param {Object} params
 * @param {object} params.req - The Express request object.
 * @param {Express.Multer.File} params.file - The file object.
 * @param {string} params.file_id - The file id.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<{ filepath: string, bytes: number }>} An object containing the blob URL and its byte size.
 */
async function uploadFileToAzure({
  req,
  file,
  file_id,
  basePath = defaultBasePath,
  containerName,
}) {
  try {
    const inputFilePath = file.path;
    const stats = await fs.promises.stat(inputFilePath);
    const bytes = stats.size;
    const userId = req.user.id;
    const fileName = `${file_id}__${path.basename(inputFilePath)}`;

    const fileURL = await streamFileToAzure({
      userId,
      filePath: inputFilePath,
      fileName,
      basePath,
      containerName,
    });

    return { filepath: fileURL, bytes };
  } catch (error) {
    logger.error('[uploadFileToAzure] Error uploading file:', error);
    throw error;
  }
}

/**
 * Retrieves a readable stream for a blob from Azure Blob Storage.
 *
 * Public containers are fetched anonymously by URL. Private containers (`AZURE_STORAGE_PUBLIC_ACCESS`
 * not `true`) are read through the authenticated client (connection string or managed identity),
 * since an anonymous request to a private container is refused (404).
 *
 * @param {object} _req - The Express request object.
 * @param {string} fileURL - The stored file path: the blob URL, or the root-relative path of a private blob.
 * @returns {Promise<NodeJS.ReadableStream>} A readable stream of the blob.
 */
async function getAzureFileStream(_req, fileURL) {
  try {
    if (isAzurePublicAccess()) {
      const response = await axios({
        method: 'get',
        url: fileURL,
        responseType: 'stream',
      });
      return response.data;
    }
    const containerName = getAzureContainerName();
    const containerClient = await getAzureContainerClient(containerName);
    if (!containerClient) {
      throw new Error('Azure Blob Service is not initialized');
    }
    const blobClient = containerClient.getBlobClient(getAzureBlobPath(fileURL, containerName));
    const response = await blobClient.download();
    if (!response.readableStreamBody) {
      throw new Error('Azure blob download returned no stream body');
    }
    return response.readableStreamBody;
  } catch (error) {
    logger.error('[getAzureFileStream] Error getting blob stream:', error);
    throw error;
  }
}

module.exports = {
  saveBufferToAzure,
  saveURLToAzure,
  getAzureURL,
  getAzureBlobPath,
  isAzurePublicAccess,
  deleteFileFromAzure,
  uploadFileToAzure,
  getAzureFileStream,
  getAzureContainerName,
};
