const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const md5 = require('md5');

const S3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const putObjectToR2 = async (fileName, buffer, fileSize, contentType = 'image/png') => {
  try {
    console.log('uploading image to r2 => ', fileName);
    const uploadParams = {
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentLength: fileSize,
      ContentType: contentType,
    };

    const cmd = new PutObjectCommand(uploadParams);

    const digest = md5(buffer);

    cmd.middlewareStack.add(
      (next) => async (args) => {
        args.request.headers['if-none-match'] = `"${digest}"`;
        return await next(args);
      },
      {
        step: 'build',
        name: 'addETag',
      },
    );

    const data = await S3.send(cmd);
    console.log(`Success - Status Code: ${data.$metadata.httpStatusCode}`);
    return data;
  } catch (error) {
    console.error(error);
    throw new Error('[message]: Error uploading files in R2');
  }
};

module.exports = {
  putObjectToR2,
};
