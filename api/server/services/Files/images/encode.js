const axios = require('axios');
const { logAxiosError } = require('@librechat/api');
const {
  FileSources,
  VisionModes,
  ImageDetail,
  ContentTypes,
  EModelEndpoint,
} = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

/**
 * Converts a readable stream to a base64 encoded string.
 *
 * @param {NodeJS.ReadableStream} stream - The readable stream to convert.
 * @param {boolean} [destroyStream=true] - Whether to destroy the stream after processing.
 * @returns {Promise<string>} - Promise resolving to the base64 encoded content.
 */
async function streamToBase64(stream, destroyStream = true) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');
        chunks.length = 0; // Clear the array
        resolve(base64Data);
      } catch (err) {
        reject(err);
      }
    });

    stream.on('error', (error) => {
      chunks.length = 0;
      reject(error);
    });
  }).finally(() => {
    // Clean up the stream if required
    if (destroyStream && stream.destroy && typeof stream.destroy === 'function') {
      stream.destroy();
    }
  });
}

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

const blobStorageSources = new Set([FileSources.azure_blob, FileSources.s3]);

/**
 * Encodes and formats the given files.
 * @param {Express.Request} req - The request object.
 * @param {Array<MongoFile>} files - The array of files to encode and format.
 * @param {EModelEndpoint} [endpoint] - Optional: The endpoint for the image.
 * @param {string} [mode] - Optional: The endpoint mode for the image.
 * @returns {Promise<{ text: string; files: MongoFile[]; image_urls: MessageContentImageUrl[] }>} - A promise that resolves to the result object containing the encoded images and file details.
 */
async function encodeAndFormat(req, files, endpoint, mode) {
  const promises = [];
  /** @type {Record<FileSources, Pick<ReturnType<typeof getStrategyFunctions>, 'prepareImagePayload' | 'getDownloadStream'>>} */
  const encodingMethods = {};
  /** @type {{ text: string; files: MongoFile[]; image_urls: MessageContentImageUrl[] }} */
  const result = {
    text: '',
    files: [],
    image_urls: [],
  };

  if (!files || !files.length) {
    return result;
  }

  for (let file of files) {
    /** @type {FileSources} */
    const source = file.source ?? FileSources.local;
    if (source === FileSources.text && file.text) {
      result.text += `${!result.text ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${file.text}\n`;
    }

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
    /* We need to fetch the image and convert it to base64 if we are using S3/Azure Blob storage. */
    if (blobStorageSources.has(source)) {
      try {
        const downloadStream = encodingMethods[source].getDownloadStream;
        let stream = await downloadStream(req, file.filepath);
        let base64Data = await streamToBase64(stream);
        stream = null;
        promises.push([file, base64Data]);
        base64Data = null;
        continue;
      } catch (error) {
        // Error handling code
      }
    } else if (source !== FileSources.local && base64Only.has(endpoint)) {
      const [_file, imageURL] = await preparePayload(req, file);
      promises.push([_file, await fetchImageToBase64(imageURL)]);
      continue;
    }
    promises.push(preparePayload(req, file));
  }

  if (result.text) {
    result.text += '\n```';
  }

  const detail = req.body.imageDetail ?? ImageDetail.auto;

  /** @type {Array<[MongoFile, string]>} */
  const formattedImages = await Promise.all(promises);
  promises.length = 0;

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

    if (endpoint && endpoint === EModelEndpoint.google && mode === VisionModes.generative) {
      delete imagePart.image_url;
      imagePart.inlineData = {
        mimeType: file.type,
        data: imageContent,
      };
    } else if (endpoint && endpoint === EModelEndpoint.google) {
      imagePart.image_url = imagePart.image_url.url;
    } else if (endpoint && endpoint === EModelEndpoint.anthropic) {
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
