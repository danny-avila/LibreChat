const { FileSources } = require('librechat-data-provider');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const sharedAvatarBasePathStrategies = new Set([FileSources.s3, FileSources.cloudfront]);

function getAvatarFileStrategy(appConfig) {
  const config =
    appConfig?.fileStrategy || appConfig?.fileStrategies
      ? appConfig
      : { fileStrategy: process.env.CDN_PROVIDER };
  return getFileStrategy(config, { isAvatar: true });
}

function getAvatarSaveParams(fileStrategy, params) {
  if (!sharedAvatarBasePathStrategies.has(fileStrategy)) {
    return params;
  }
  return { ...params, basePath: 'avatars' };
}

module.exports = { getAvatarFileStrategy, getAvatarSaveParams };
