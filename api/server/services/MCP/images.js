const { resolveImageToolArguments: resolveImageToolArgumentsInApi } = require('@librechat/api');

function getDependencies() {
  const db = require('~/models');
  const { encodeAndFormat } = require('~/server/services/Files/images/encode');
  return {
    findFiles: db.getFiles,
    encodeImages: async (request, files) => {
      const image_urls = await Promise.all(
        files.map(async (file) => {
          const { image_urls: encodedImages } = await encodeAndFormat(request, [file], {});
          const url = encodedImages[0]?.image_url?.url;
          return typeof url === 'string'
            ? { file_id: file.file_id, image_url: { url } }
            : undefined;
        }),
      );
      return { image_urls: image_urls.filter((image) => image !== undefined) };
    },
  };
}

async function resolveImageToolArguments(params) {
  return await resolveImageToolArgumentsInApi({
    ...params,
    dependencies: params.dependencies ?? getDependencies(),
  });
}

module.exports = { resolveImageToolArguments };
