const axios = require('axios');
const { logAxiosError, validateImage, getFileStream, runGuardedEncode } = require('@librechat/api');
const {
  FileSources,
  VisionModes,
  ImageDetail,
  ContentTypes,
  EModelEndpoint,
  mergeFileConfig,
  getEndpointFileConfig,
} = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

/**
 * Fetches an image from a URL and returns its base64 representation.
 *
 * @async
 * @param {string} url The URL of the image.
 * @returns {Promise<string>} The base64-encoded string of the image.
 * @throws {Error} If there's an issue fetching the image or encoding it.
 */
async function fetchImageToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });
    const base64Data = Buffer.from(response.data).toString('base64');
    response.data = null;
    return base64Data;
  } catch (error) {
    const message = 'Error fetching image to convert to base64';
    throw new Error(logAxiosError({ message, error }));
  }
}

const base64Only = new Set([
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  'Ollama',
  'ollama',
  EModelEndpoint.bedrock,
]);

const blobStorageSources = new Set([
  FileSources.azure_blob,
  FileSources.s3,
  FileSources.firebase,
  FileSources.cloudfront,
]);

/**
 * Encodes and formats the given files.
 * @param {ServerRequest} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {object} params - Object containing provider/endpoint information
 * @param {Providers | EModelEndpoint | string} [params.provider] - The provider for the image
 * @param {string} [params.endpoint] - Optional: The endpoint for the image
 * @param {string} [params.imageDetail] - Optional: Detail level resolved by the caller, used
 *   where the request body carries no conversation-level setting (the agents route).
 * @param {string} [mode] - Optional: The endpoint mode for the image.
 * @returns {Promise<{ files: MongoFile[]; image_urls: MessageContentImageUrl[] }>} - A promise that resolves to the result object containing the encoded images and file details.
 */
async function encodeAndFormat(req, files, params, mode) {
  const { provider, endpoint } = params;
  const effectiveEndpoint = endpoint ?? provider;
  const promises = [];
  /** @type {Record<FileSources, ReturnType<typeof getStrategyFunctions>>} */
  const encodingMethods = {};
  /** @type {{ files: MongoFile[]; image_urls: MessageContentImageUrl[] }} */
  const result = {
    files: [],
    image_urls: [],
  };

  if (!files || !files.length) {
    return result;
  }

  for (let file of files) {
    /** @type {FileSources} */
    const source = file.source ?? FileSources.local;

    if (!file.height) {
      promises.push([file, null]);
      continue;
    }

    if (!encodingMethods[source]) {
      const { prepareImagePayload, getDownloadStream } = getStrategyFunctions(source);
      if (!prepareImagePayload) {
        throw new Error(`Encoding function not implemented for ${source}`);
      }

      encodingMethods[source] = { prepareImagePayload, getDownloadStream };
    }

    const preparePayload = encodingMethods[source].prepareImagePayload;
    /* We need to fetch the image and convert it to base64 if we are using S3/Azure Blob/Firebase storage. */
    if (blobStorageSources.has(source)) {
      const processedFile = await runGuardedEncode(file.bytes ?? 0, () =>
        getFileStream(req, file, encodingMethods, getStrategyFunctions, {
          sanitizeStorageErrors: true,
        }),
      );
      promises.push([file, processedFile?.content ?? null]);
      continue;
    }
    if (source !== FileSources.local && base64Only.has(effectiveEndpoint)) {
      const entry = await runGuardedEncode(file.bytes ?? 0, async () => {
        const [_file, imageURL] = await preparePayload(req, file);
        return [_file, await fetchImageToBase64(imageURL)];
      });
      promises.push(entry);
      continue;
    }
    promises.push(preparePayload(req, file));
  }

  const detail = params.imageDetail ?? req.body.imageDetail ?? ImageDetail.auto;

  /** @type {Array<[MongoFile, string]>} */
  const formattedImages = await Promise.all(promises);
  promises.length = 0;

  /** Extract configured file size limit from fileConfig for this endpoint */
  let configuredFileSizeLimit;
  if (req.config?.fileConfig) {
    const fileConfig = mergeFileConfig(req.config.fileConfig);
    const endpointConfig = getEndpointFileConfig({
      fileConfig,
      endpoint: effectiveEndpoint,
    });
    configuredFileSizeLimit = endpointConfig?.fileSizeLimit;
  }

  for (const [file, imageContent] of formattedImages) {
    const fileMetadata = {
      type: file.type,
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      embedded: !!file.embedded,
      metadata: file.metadata,
    };

    if (file.height && file.width) {
      fileMetadata.height = file.height;
      fileMetadata.width = file.width;
    }

    if (!imageContent) {
      result.files.push(fileMetadata);
      continue;
    }

    /** Validate image buffer against size limits */
    if (file.height && file.width) {
      const imageBuffer = imageContent.startsWith('http')
        ? null
        : Buffer.from(imageContent, 'base64');

      if (imageBuffer) {
        const validation = await validateImage(
          imageBuffer,
          imageBuffer.length,
          effectiveEndpoint,
          configuredFileSizeLimit,
        );

        if (!validation.isValid) {
          throw new Error(`Image validation failed for ${file.filename}: ${validation.error}`);
        }
      }
    }

    const imagePart = {
      type: ContentTypes.IMAGE_URL,
      image_url: {
        url: imageContent.startsWith('http')
          ? imageContent
          : `data:${file.type};base64,${imageContent}`,
        detail,
      },
    };

    if (mode === VisionModes.agents) {
      result.image_urls.push({ ...imagePart });
      result.files.push({ ...fileMetadata });
      continue;
    }

    if (
      effectiveEndpoint &&
      effectiveEndpoint === EModelEndpoint.google &&
      mode === VisionModes.generative
    ) {
      delete imagePart.image_url;
      imagePart.inlineData = {
        mimeType: file.type,
        data: imageContent,
      };
    } else if (effectiveEndpoint && effectiveEndpoint === EModelEndpoint.google) {
      imagePart.image_url = imagePart.image_url.url;
    } else if (effectiveEndpoint && effectiveEndpoint === EModelEndpoint.anthropic) {
      imagePart.type = 'image';
      imagePart.source = {
        type: 'base64',
        media_type: file.type,
        data: imageContent,
      };
      delete imagePart.image_url;
    }

    result.image_urls.push({ ...imagePart });
    result.files.push({ ...fileMetadata });
  }
  formattedImages.length = 0;
  return { ...result };
}

module.exports = {
  encodeAndFormat,
};
