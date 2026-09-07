const mime = require('mime');
const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { getAzureContainerClient } = require('@librechat/api');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { getAppConfig } = require('~/server/services/Config');
const { isAzurePublicAccess, getAzureContainerName } = require('./crud');

/** `/{ownerId}/{filename}` below the `/images/` mount – the shape the app stores for private blobs. */
const IMAGE_PATH_PATTERN = /^\/([^/\\]+)\/([^/\\]+)$/;

/**
 * Creates the `/images/` fallback that streams images out of a private Azure Blob container.
 *
 * With `AZURE_STORAGE_PUBLIC_ACCESS` not `true`, the `azure_blob` strategy stores root-relative
 * `/images/{userId}/{fileName}` paths instead of blob URLs (a browser cannot read a private blob
 * anonymously). Those paths land on the same `/images/` route the local strategy serves from disk;
 * this handler runs after the static middleware and answers from Blob Storage with the app's own
 * credential. It steps aside (`next()`) whenever the request is not for a private Azure image, so
 * every other configuration keeps its current behavior. Authorization stays where it is for the
 * local strategy too: the `/images/` route's image-authorization middleware (`secureImageLinks`).
 *
 * @param {Object} [deps]
 * @param {() => Promise<object>} [deps.getAppConfig]
 * @param {typeof getFileStrategy} [deps.getFileStrategy]
 * @param {typeof getAzureContainerClient} [deps.getAzureContainerClient]
 * @param {() => boolean} [deps.isPublicAccess]
 * @returns {import('express').RequestHandler}
 */
function createAzureBlobImageHandler(deps = {}) {
  const resolveAppConfig = deps.getAppConfig ?? getAppConfig;
  const resolveStrategy = deps.getFileStrategy ?? getFileStrategy;
  const resolveContainerClient = deps.getAzureContainerClient ?? getAzureContainerClient;
  const isPublicAccess = deps.isPublicAccess ?? isAzurePublicAccess;

  return async function serveAzureBlobImage(req, res, next) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isPublicAccess()) {
      return next();
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const match = decodedPath.match(IMAGE_PATH_PATTERN);
    if (!match || match[1] === '..' || match[2] === '..' || decodedPath.includes('\0')) {
      return next();
    }

    try {
      const appConfig = await resolveAppConfig();
      const usesAzure =
        resolveStrategy(appConfig, { isImage: true }) === FileSources.azure_blob ||
        resolveStrategy(appConfig, { isAvatar: true }) === FileSources.azure_blob;
      if (!usesAzure) {
        return next();
      }

      const containerClient = await resolveContainerClient(getAzureContainerName());
      if (!containerClient) {
        return next();
      }

      const blobPath = `images${decodedPath}`;
      const download = await containerClient.getBlobClient(blobPath).download();
      if (!download.readableStreamBody) {
        return next();
      }

      res.setHeader(
        'Content-Type',
        download.contentType || mime.getType(blobPath) || 'application/octet-stream',
      );
      if (download.contentLength != null) {
        res.setHeader('Content-Length', String(download.contentLength));
      }
      /** Served per-request under the app's identity: never let a shared cache keep a copy. */
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Cookie');
      if (req.method === 'HEAD') {
        download.readableStreamBody.destroy?.();
        return res.status(200).end();
      }
      download.readableStreamBody.on('error', (error) => {
        logger.error('[serveAzureBlobImage] Stream error:', error);
        res.destroy(error);
      });
      download.readableStreamBody.pipe(res);
    } catch (error) {
      if (error?.statusCode === 404) {
        return next();
      }
      logger.error('[serveAzureBlobImage] Error serving blob:', error);
      return next(error);
    }
  };
}

module.exports = { createAzureBlobImageHandler };
