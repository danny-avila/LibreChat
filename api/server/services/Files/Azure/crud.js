const fs = require('fs');
const path = require('path');
const mime = require('mime');
const axios = require('axios');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { getAzureContainerClient, deleteRagFile } = require('@librechat/api');

const defaultBasePath = 'images';
const { AZURE_STORAGE_PUBLIC_ACCESS = 'true', AZURE_CONTAINER_NAME = 'files' } = process.env;
const { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');

let azureUrlExpirySeconds = 2 * 60;
let azureRefreshExpiryMs = null;

let userDelegationKey = null;
let userDelegationKeyExpiry = null;
const DELEGATION_KEY_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

if (process.env.AZURE_URL_EXPIRY_SECONDS !== undefined) {
  const parsed = parseInt(process.env.AZURE_URL_EXPIRY_SECONDS, 10);
  if (!isNaN(parsed) && parsed > 0) {
    azureUrlExpirySeconds = Math.min(parsed, 7 * 24 * 60 * 60);
  } else {
    logger.warn(
      `[Azure] Invalid AZURE_URL_EXPIRY_SECONDS value: "${process.env.AZURE_URL_EXPIRY_SECONDS}". Using 2-minute expiry.`,
    );
  }
}

if (process.env.AZURE_REFRESH_EXPIRY_MS !== null && process.env.AZURE_REFRESH_EXPIRY_MS) {
  const parsed = parseInt(process.env.AZURE_REFRESH_EXPIRY_MS, 10);
  if (!isNaN(parsed) && parsed > 0) {
    azureRefreshExpiryMs = parsed;
    logger.info(`[Azure] Using custom refresh expiry time: ${azureRefreshExpiryMs}ms`);
  }
}

const isPublicAccess = () => AZURE_STORAGE_PUBLIC_ACCESS?.toLowerCase() === 'true';

/**
 * Obtains and caches a User Delegation Key from Azure Blob Storage for use with
 * Managed Identity (User Delegation SAS) URL signing. The key is cached for its
 * full 7-day lifespan and proactively refreshed within a 5-minute buffer of expiry.
 *
 * @param {import('@azure/storage-blob').BlobServiceClient} blobServiceClient
 * @returns {Promise<import('@azure/storage-blob').UserDelegationKey>}
 */
async function getUserDelegationKey(blobServiceClient) {
  const now = new Date();

  if (userDelegationKey && userDelegationKeyExpiry) {
    const timeUntilExpiry = userDelegationKeyExpiry.getTime() - now.getTime();
    if (timeUntilExpiry > DELEGATION_KEY_REFRESH_BUFFER_MS) {
      return userDelegationKey;
    }
  }

  const startsOn = now;
  const expiresOn = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);
  userDelegationKeyExpiry = expiresOn;

  logger.info('[Azure] User delegation key obtained, expires:', expiresOn.toISOString());
  return userDelegationKey;
}

/**
 * Generates a time-limited signed URL (SAS token) for an Azure Blob.
 * Automatically selects the signing method based on configuration:
 * - Account Key signing when `AZURE_STORAGE_CONNECTION_STRING` is set
 * - User Delegation SAS via Managed Identity when only `AZURE_STORAGE_ACCOUNT_NAME` is set
 *
 * @param {Object} params
 * @param {string} params.blobPath - The path of the blob within the container.
 * @param {string} [params.containerName=AZURE_CONTAINER_NAME] - The Azure Blob Storage container name.
 * @returns {Promise<string>} A promise that resolves to the generated signed URL.
 */
async function getSignedAzureURL({ blobPath, containerName = AZURE_CONTAINER_NAME }) {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

    // BlobServiceClient is loaded dynamically to allow optional Azure SDK installation.
    // BlobSASPermissions, generateBlobSASQueryParameters, and StorageSharedKeyCredential
    // are imported at the top of the module and reused here.
    const { BlobServiceClient } = await import('@azure/storage-blob');

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + azureUrlExpirySeconds * 1000);

    if (connectionString) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

      const match = connectionString.match(/AccountName=([^;]+)/i);
      const keyMatch = connectionString.match(/AccountKey=([^;]+)/i);

      if (!match || !keyMatch) {
        logger.warn('[getSignedAzureURL] Connection string missing AccountName or AccountKey, returning unsigned URL');
        return blockBlobClient.url;
      }

      const sharedKeyCredential = new StorageSharedKeyCredential(match[1], keyMatch[1]);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName: blobPath,
          permissions: BlobSASPermissions.parse('r'),
          startsOn,
          expiresOn,
        },
        sharedKeyCredential,
      ).toString();

      return `${blockBlobClient.url}?${sasToken}`;
    }

    if (accountName) {
      try {
        const { DefaultAzureCredential } = await import('@azure/identity');
        const credential = new DefaultAzureCredential();
        const blobServiceClient = new BlobServiceClient(
          `https://${accountName}.blob.core.windows.net`,
          credential,
        );

        const delegationKey = await getUserDelegationKey(blobServiceClient);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

        const sasToken = generateBlobSASQueryParameters(
          {
            containerName,
            blobName: blobPath,
            permissions: BlobSASPermissions.parse('r'),
            startsOn,
            expiresOn,
          },
          delegationKey,
          accountName,
        ).toString();

        return `${blockBlobClient.url}?${sasToken}`;
      } catch (credentialError) {
        logger.error('[getSignedAzureURL] User Delegation signing failed. Ensure you are running on Azure with Managed Identity or use a connection string:', credentialError.message);
        throw credentialError;
      }
    }

    throw new Error('Azure storage not configured: set AZURE_STORAGE_CONNECTION_STRING for local/AccountKey signing, or AZURE_STORAGE_ACCOUNT_NAME for Managed Identity');
  } catch (error) {
    logger.error('[getSignedAzureURL] Error generating signed URL:', error);
    throw error;
  }
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
    const access = isPublicAccess() ? 'blob' : undefined;
    await containerClient.createIfNotExists({ access });
    const blobPath = `${basePath}/${userId}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    await blockBlobClient.uploadData(buffer);
    
    if (!isPublicAccess()) {
      return await getSignedAzureURL({ blobPath, containerName });
    }
    return blockBlobClient.url;
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
    const response = await fetch(URL);
    const buffer = await response.buffer();
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
    return blockBlobClient.url;
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
    const containerClient = await getAzureContainerClient(AZURE_CONTAINER_NAME);
    const blobPath = file.filepath.split(`${AZURE_CONTAINER_NAME}/`)[1];
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
    const access = isPublicAccess() ? 'blob' : undefined;
    await containerClient.createIfNotExists({ access });

    const blobPath = `${basePath}/${userId}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const stats = await fs.promises.stat(filePath);
    const fileStream = fs.createReadStream(filePath);

    const blobContentType = mime.getType(fileName);
    await blockBlobClient.uploadStream(
      fileStream,
      undefined,
      undefined,
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

    if (!isPublicAccess()) {
      return await getSignedAzureURL({ blobPath, containerName });
    }
    return blockBlobClient.url;
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
 * @param {object} _req - The Express request object.
 * @param {string} fileURL - The URL of the blob.
 * @returns {Promise<ReadableStream>} A readable stream of the blob.
 */
async function getAzureFileStream(_req, fileURL) {
  try {
    const response = await axios({
      method: 'get',
      url: fileURL,
      responseType: 'stream',
    });
    return response.data;
  } catch (error) {
    logger.error('[getAzureFileStream] Error getting blob stream:', error);
    throw error;
  }
}

/**
 * Determines whether the provided Azure Blob Storage URL needs to be refreshed.
 * A plain URL without a SAS token is treated as needing a refresh when private
 * access is enabled, allowing seamless transitions from public to private access.
 *
 * @param {string} signedUrl - The Azure Blob Storage URL, which may include a SAS token.
 * @param {number} bufferSeconds - The number of seconds before expiration at which the URL
 *   should be considered in need of refresh.
 * @returns {boolean} `true` if the URL should be refreshed, `false` if it is still valid.
 */
function needsRefreshAzure(signedUrl, bufferSeconds) {
  try {
    const url = new URL(signedUrl);
    const hasSasToken = url.searchParams.has('se');
    
    // Private access required but URL is plain → needs signing
    if (!isPublicAccess() && !hasSasToken) {
      return true;
    }
    
    // Public access and no SAS token → no refresh needed
    if (!hasSasToken) {
      return false;
    }

    // Check expiration for signed URLs
    const expiresParam = url.searchParams.get('se');
    if (!expiresParam) {
      return true;
    }

    const expiresAtDate = new Date(expiresParam);
    const now = new Date();

    if (azureRefreshExpiryMs !== null) {
      const stParam = url.searchParams.get('st');
      if (stParam) {
        const urlCreationTime = new Date(stParam).getTime();
        const urlAge = now.getTime() - urlCreationTime;
        return urlAge >= azureRefreshExpiryMs;
      }
    }

    const bufferTime = new Date(now.getTime() + bufferSeconds * 1000);
    return expiresAtDate <= bufferTime;
  } catch (error) {
    logger.error('[needsRefreshAzure] Error checking URL expiration:', error);
    return true;
  }
}

/**
 * Extracts the blob path from an Azure Blob Storage URL.
 *
 * For a URL of the form `https://<account>.blob.core.windows.net/<container>/<blobPath>`,
 * this function returns the `<blobPath>` portion, or `null` if it cannot be determined.
 *
 * @param {string} fileUrl - The full Azure Blob Storage URL of the file.
 * @returns {string | null} The blob path within the container, or `null` on failure.
 */
function extractBlobPathFromAzureUrl(fileUrl) {
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return parts.slice(1).join('/');
  } catch (error) {
    logger.error('[extractBlobPathFromAzureUrl] Error extracting blob path:', error);
    return null;
  }
}

/**
 * Generates a new Azure Blob URL for the given file URL.
 * Returns a signed (SAS) URL when private access is enabled, or a plain blob URL
 * when public access is configured.
 *
 * @param {string} currentURL - The existing Azure Blob file URL that may need to be refreshed or signed.
 * @returns {Promise<string | undefined>} A promise that resolves to the new URL,
 *   or `undefined` if the blob path cannot be extracted.
 */
async function getNewAzureURL(currentURL) {
  try {
    const blobPath = extractBlobPathFromAzureUrl(currentURL);
    if (!blobPath) {
      return;
    }
    
    if (!isPublicAccess()) {
      return await getSignedAzureURL({ blobPath });
    }
    
    // Return plain URL for public access
    const containerClient = await getAzureContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    return blockBlobClient.url;
  } catch (error) {
    logger.error('[getNewAzureURL] Error getting new Azure URL:', error);
  }
}

/**
 * Refreshes Azure Blob file URLs that are close to expiring and persists the updated URLs.
 *
 * @param {MongoFile[]} files - The list of file records whose Azure URLs may need refreshing.
 * @param {(updates: Partial<MongoFile>[]) => Promise<void>} batchUpdateFiles - Function used to
 *   update the file records in bulk with their new URLs.
 * @param {number} [bufferSeconds=3600] - The minimum number of seconds before expiry at which a
 *   URL should be refreshed.
 * @returns {Promise<MongoFile[]>} A promise that resolves to the array of files with refreshed URLs.
 */
async function refreshAzureFileUrls(files, batchUpdateFiles, bufferSeconds = 3600) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return files;
  }

  const filesToUpdate = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file?.file_id || file.source !== FileSources.azure_blob || !file.filepath) {
      continue;
    }
    if (!needsRefreshAzure(file.filepath, bufferSeconds)) {
      continue;
    }
    try {
      const newURL = await getNewAzureURL(file.filepath);
      if (!newURL) {
        continue;
      }
      filesToUpdate.push({
        file_id: file.file_id,
        filepath: newURL,
      });
      files[i].filepath = newURL;
    } catch (error) {
      logger.error(`[refreshAzureFileUrls] Error refreshing Azure URL for file ${file.file_id}:`, error);
    }
  }

  if (filesToUpdate.length > 0) {
    await batchUpdateFiles(filesToUpdate);
  }

  return files;
}

/**
 * Refreshes an Azure Blob storage file URL if it is close to expiration.
 *
 * When the file originates from Azure Blob storage and the existing URL is determined to be
 * near expiry (based on {@link needsRefreshAzure} and the provided `bufferSeconds`), this
 * function generates and returns a new URL. If the URL does not need to be refreshed or a
 * new URL cannot be obtained, the original URL is returned instead.
 *
 * @param {Object} fileObj - The file metadata object.
 * @param {string} fileObj.filepath - The current Azure Blob file URL that may need refreshing.
 * @param {string} fileObj.source - The source type; must be {@link FileSources.azure_blob} to trigger a refresh.
 * @param {number} [bufferSeconds=3600] - The number of seconds before URL expiry within which a refresh should be attempted.
 * @returns {Promise<string>} A promise that resolves to the (possibly refreshed) Azure Blob file URL.
 */
async function refreshAzureUrl(fileObj, bufferSeconds = 3600) {
  if (!fileObj || fileObj.source !== FileSources.azure_blob || !fileObj.filepath) {
    return fileObj?.filepath || '';
  }

  if (!needsRefreshAzure(fileObj.filepath, bufferSeconds)) {
    return fileObj.filepath;
  }

  try {
    const newUrl = await getNewAzureURL(fileObj.filepath);
    if (!newUrl) {
      logger.warn(`[refreshAzureUrl] Unable to refresh Azure URL: ${fileObj.filepath}`);
      return fileObj.filepath;
    }
    logger.debug(`[refreshAzureUrl] Refreshed Azure URL`);
    return newUrl;
  } catch (error) {
    logger.error(`[refreshAzureUrl] Error refreshing Azure URL: ${error.message}`);
    return fileObj.filepath;
  }
}

module.exports = {
  saveBufferToAzure,
  saveURLToAzure,
  getAzureURL,
  deleteFileFromAzure,
  uploadFileToAzure,
  getAzureFileStream,
  getSignedAzureURL,
  needsRefreshAzure,
  refreshAzureFileUrls,
  refreshAzureUrl,
  getNewAzureURL,
  extractBlobPathFromAzureUrl
};
