const {
  resolveUploadedImageArguments: resolveUploadedImageArgumentsInApi,
} = require('@librechat/api');

function getDependencies() {
  const db = require('~/models');
  const { encodeAndFormat } = require('~/server/services/Files/images/encode');
  return {
    findFiles: db.getFiles,
    encodeImages: async (request, files) => {
      const { image_urls } = await encodeAndFormat(request, files, {});
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
