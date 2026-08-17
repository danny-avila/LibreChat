const {
  resolveUploadedImageArguments: resolveUploadedImageArgumentsInApi,
} = require('@librechat/api');
const { mergeFileConfig, getEndpointFileConfig } = require('librechat-data-provider');

function getMcpImageSizeLimit(request) {
  const fileConfig = mergeFileConfig(request?.config?.fileConfig);
  return getEndpointFileConfig({ fileConfig }).fileSizeLimit;
}

function getDependencies() {
  const db = require('~/models');
  const { encodeAndFormat } = require('~/server/services/Files/images/encode');
  return {
    findFiles: db.getFiles,
    encodeImages: async (request, files) => {
      const imageSizeLimit = getMcpImageSizeLimit(request);
      const imageFiles = files.filter(
        (file) => Number.isFinite(file.bytes) && file.bytes <= imageSizeLimit,
      );
      if (imageFiles.length === 0) {
        return { image_urls: [] };
      }

      const { image_urls } = await encodeAndFormat(request, imageFiles, {});
      return { image_urls };
    },
  };
}

async function resolveUploadedImageArguments(params) {
  return await resolveUploadedImageArgumentsInApi({
    ...params,
    dependencies: params.dependencies ?? getDependencies(),
  });
}

module.exports = { resolveUploadedImageArguments };
