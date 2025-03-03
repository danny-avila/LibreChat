const { BlobServiceClient } = require('@azure/storage-blob');
const { logger } = require('~/config');

let blobServiceClient = null;
let azureWarningLogged = false;

/**
 * Initializes the Azure Blob Service client.
 * This function establishes a connection by checking if a connection string is provided.
 * If available, the connection string is used; otherwise, Managed Identity (via DefaultAzureCredential) is utilized.
 * Note: Container creation (and its public access settings) is handled later in the CRUD functions.
 * @returns {BlobServiceClient|null} The initialized client, or null if the required configuration is missing.
 */
const initializeAzureBlobService = () => {
  if (blobServiceClient) {
    return blobServiceClient;
  }
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    logger.info('Azure Blob Service initialized using connection string');
  } else {
    const { DefaultAzureCredential } = require('@azure/identity');
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) {
      if (!azureWarningLogged) {
        logger.error(
          '[initializeAzureBlobService] Azure Blob Service not initialized. Connection string missing and AZURE_STORAGE_ACCOUNT_NAME not provided.',
        );
        azureWarningLogged = true;
      }
      return null;
    }
    const url = `https://${accountName}.blob.core.windows.net`;
    const credential = new DefaultAzureCredential();
    blobServiceClient = new BlobServiceClient(url, credential);
    logger.info('Azure Blob Service initialized using Managed Identity');
  }
  return blobServiceClient;
};

/**
 * Retrieves the Azure ContainerClient for the given container name.
 * @param {string} [containerName=process.env.AZURE_CONTAINER_NAME || 'files'] - The container name.
 * @returns {ContainerClient|null} The Azure ContainerClient.
 */
const getAzureContainerClient = (containerName = process.env.AZURE_CONTAINER_NAME || 'files') => {
  const serviceClient = initializeAzureBlobService();
  return serviceClient ? serviceClient.getContainerClient(containerName) : null;
};

module.exports = {
  initializeAzureBlobService,
  getAzureContainerClient,
};
