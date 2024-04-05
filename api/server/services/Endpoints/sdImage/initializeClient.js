const { EModelEndpoint } = require('librechat-data-provider');
const { SdImageClient } = require('~/app');

const initializeClient = async ({ req, res }) => {
  const { model: modelName } = req.body;
  const apiKey = process.env.SDIMAGE_API_KEY;
  const fileLinkPrefix = process.env.CLOUDFLARE_BUCKET_URI ?? '';

  const client = new SdImageClient(apiKey, {
    modelOptions: {
      model: modelName,
      endpoint: EModelEndpoint.sdImage,
    },
    fileLinkPrefix,
    req,
    res,
  });
  return {
    client,
  };
};

module.exports = initializeClient;
