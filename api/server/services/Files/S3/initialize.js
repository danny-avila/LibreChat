const { S3Client } = require('@aws-sdk/client-s3');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { logger } = require('~/config');

let i = 0;
let s3 = null;

const initializeS3 = () => {
  // Return existing instance if already initialized
  if (s3) {
    return s3;
  }

  const region = process.env.AWS_REGION;
  if (!region) {
    logger.error('[initializeS3] AWS_REGION is not set. Cannot initialize S3.');
    return null;
  }

  const endpoint = process.env.AWS_ENDPOINT_URL;
  const s3Config = {
    region: region,
    ...(endpoint ? { endpoint } : {}),
    credentials: fromNodeProviderChain(),
  };

  if (!s3Config.credentials) {
    logger.info('[Optional] S3 not initialized due to missing s3Config.');
    return null;
  }

  s3 = new S3Client(s3Config);
  logger.info('[initializeS3] S3 initialized with dynamic credentials and optional custom endpoint.');
  return s3;
};

module.exports = { initializeS3 };
