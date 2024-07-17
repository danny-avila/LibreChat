var AWS = require('aws-sdk');
const { logger } = require('~/config');

let i = 0;
let s3 = null;

const initializeS3 = () => {
  // Return existing instance if already initialized
  if (s3) {
    return s3;
  }

  const s3Config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  };

  if (Object.values(s3Config).some((value) => !value)) {
    i === 0 && logger.info('[Optional] S3 not initialized.');
    i++;
    return null;
  }

  s3 = new AWS.S3(s3Config);
  logger.info('S3 initialized');
  return s3;
};

module.exports = { initializeS3 };
