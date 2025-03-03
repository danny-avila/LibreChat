const { S3Client } = require('@aws-sdk/client-s3');
const { logger } = require('~/config');

let s3 = null;

/**
 * Initializes and returns an instance of the AWS S3 client.
 *
 * @returns {S3Client|null} An S3Client instance if credentials are provided; otherwise, null.
 */
const initializeS3 = () => {
  if (s3) {
    return s3;
  }

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    logger.info('[initializeS3] S3 not initialized. Missing credentials.');
    return null;
  }

  s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  logger.info('S3 initialized');
  return s3;
};

module.exports = { initializeS3 };
