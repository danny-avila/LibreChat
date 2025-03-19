const { S3Client } = require('@aws-sdk/client-s3');
const { logger } = require('~/config');

let s3 = null;

/**
 * Initializes and returns an instance of the AWS S3 client.
 *
 * If AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are provided, they will be used.
 * Otherwise, the AWS SDK's default credentials chain (including IRSA) is used.
 *
 * @returns {S3Client|null} An instance of S3Client if the region is provided; otherwise, null.
 */
const initializeS3 = () => {
  if (s3) {
    return s3;
  }

  const region = process.env.AWS_REGION;
  if (!region) {
    logger.error('[initializeS3] AWS_REGION is not set. Cannot initialize S3.');
    return null;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    logger.info('[initializeS3] S3 initialized with provided credentials.');
  } else {
    // When using IRSA, credentials are automatically provided via the IAM Role attached to the ServiceAccount.
    s3 = new S3Client({ region });
    logger.info('[initializeS3] S3 initialized using default credentials (IRSA).');
  }

  return s3;
};

module.exports = { initializeS3 };
