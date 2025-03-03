const { BlobServiceClient } = require('@azure/storage-blob');
const { logger } = require('~/config');

let blobServiceClient = null;
let azureWarningLogged = false;

/**
 * Initializes the Azure Blob Service client.
 * This function sets up the connection using the provided connection string.
 * Note: Container creation (and its public access settings) is handled later in the CRUD functions.
 * @returns {BlobServiceClient|null} The initialized client or null if connection string is missing.
 */
const initializeAzureBlobService = () => {
  if (blobServiceClient) {
    return blobServiceClient;
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    if (!azureWarningLogged) {
      logger.error(
        '[initializeAzureBlobService] Azure Blob Service not initialized. Connection string missing.',
      );
      azureWarningLogged = true;
    }
    return null;
  }
  blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  logger.info('Azure Blob Service initialized');
  return blobServiceClient;
};

/**
 * Retrieves the Azure ContainerClient for the given container name.
 * @param {string} [containerName=process.env.AZURE_CONTAINER_NAME || 'files'] - The container name.
 * @returns {ContainerClient} The Azure ContainerClient.
 */
const getAzureContainerClient = (containerName = process.env.AZURE_CONTAINER_NAME || 'files') => {
  const serviceClient = initializeAzureBlobService();
  return serviceClient ? serviceClient.getContainerClient(containerName) : null;
};

module.exports = {
  initializeAzureBlobService,
  getAzureContainerClient,
};
