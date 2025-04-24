const { z } = require('zod');
const OpenAI = require('openai');
const { tool } = require('@langchain/core/tools');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ContentTypes, EImageOutputType } = require('librechat-data-provider');
const extractBaseURL = require('~/utils/extractBaseURL');
const { logger } = require('~/config');

const displayMessage =
  'OpenAI Image Generations displayed an image. All generated images are already plainly visible, so don\'t repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.';

/**
 * Replaces unwanted characters from the input string
 * @param {string} inputString - The input string to process
 * @returns {string} - The processed string
 */
function replaceUnwantedChars(inputString) {
  return inputString
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/"/g, '')
    .trim();
}

function returnValue(value) {
  if (typeof value === 'string') {
    return [value, {}];
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value;
    }
    return [displayMessage, value];
  }
  return value;
}

/**
 * Creates an OpenAI Image Generation tool using the gpt-image-1 model
 * @param {Object} fields - Configuration fields
 * @returns {Function} - The image generation tool
 */
function createImageGenOAITool(fields = {}) {
  /** @type {boolean} Used to initialize the Tool without necessary variables. */
  const override = fields.override ?? false;
  /** @type {boolean} */
  if (!fields.override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }
  const imageOutputType = fields.imageOutputType || EImageOutputType.PNG;

  // Get API key from environment variables or fields
  const getApiKey = () => {
    const apiKey = process.env.IMAGE_GEN_OAI_API_KEY ?? '';
    if (!apiKey && !override) {
      throw new Error('Missing IMAGE_GEN_OAI_API_KEY environment variable.');
    }
    return apiKey;
  };

  let apiKey = fields.IMAGE_GEN_OAI_API_KEY ?? getApiKey();
  const closureConfig = { apiKey };

  // Configure proxy if needed
  if (process.env.IMAGE_GEN_OAI_REVERSE_PROXY) {
    closureConfig.baseURL = extractBaseURL(process.env.IMAGE_GEN_OAI_REVERSE_PROXY);
  }

  // Configure Azure if needed
  if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
    closureConfig.baseURL = process.env.IMAGE_GEN_OAI_BASEURL;
    closureConfig.defaultQuery = { 'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION };
    closureConfig.defaultHeaders = {
      'api-key': process.env.IMAGE_GEN_OAI_API_KEY,
      'Content-Type': 'application/json',
    };
    closureConfig.apiKey = process.env.IMAGE_GEN_OAI_API_KEY;
  }

  return tool(
    async (
      {
        prompt,
        background = 'auto',
        n = 1,
        output_compression = 100,
        quality = 'auto',
        size = 'auto',
      },
      runnableConfig,
    ) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }
      const config = { ...closureConfig };
      if (process.env.PROXY) {
        config.httpAgent = new HttpsProxyAgent(process.env.PROXY);
      }

      /** @type {OpenAI} */
      const openai = new OpenAI(config);
      let output_format = imageOutputType;
      // Validate background parameter when using transparent
      if (
        background === 'transparent' &&
        output_format !== EImageOutputType.PNG &&
        output_format !== EImageOutputType.WEBP
      ) {
        logger.warn(
          '[ImageGenOAI] Transparent background requires PNG or WebP format, defaulting to PNG',
        );
        output_format = EImageOutputType.PNG;
      }

      let resp;
      try {
        resp = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: replaceUnwantedChars(prompt),
          n: Math.min(Math.max(1, n), 10), // Ensure n is between 1 and 10
          background,
          output_format,
          output_compression:
            output_format === EImageOutputType.WEBP || output_format === EImageOutputType.JPEG
              ? output_compression
              : undefined,
          quality,
          size,
        });
      } catch (error) {
        logger.error('[ImageGenOAI] Problem generating the image:', error);
        return returnValue(`Something went wrong when trying to generate the image. The OpenAI API may be unavailable:
Error Message: ${error.message}`);
      }

      if (!resp) {
        return returnValue(
          'Something went wrong when trying to generate the image. The OpenAI API may be unavailable',
        );
      }

      // For gpt-image-1, the response contains base64-encoded images
      // TODO: handle cost in `resp.usage`
      const base64Image = resp.data[0].b64_json;

      if (!base64Image) {
        return returnValue(
          'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
        );
      }

      const content = [
        {
          type: ContentTypes.IMAGE_URL,
          image_url: {
            url: `data:image/${output_format};base64,${base64Image}`,
          },
        },
      ];

      const response = [
        {
          type: ContentTypes.TEXT,
          text: displayMessage,
        },
      ];
      return [response, { content }];
    },
    {
      name: 'image_gen_oai',
      description: `Use OpenAI Image Generations to create images from text descriptions.
      - Creates high-quality images based on detailed text prompts
      - Supports various customization options including background transparency, quality settings, and size
      - Returns images in various formats (PNG, JPEG, WebP) based on system configuration`,
      schema: z.object({
        prompt: z
          .string()
          .max(32000)
          .describe('A text description of the desired image, up to 32000 characters.'),
        background: z
          .enum(['transparent', 'opaque', 'auto'])
          .optional()
          .describe(
            'Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.',
          ),
        n: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('The number of images to generate. Must be between 1 and 10.'),
        output_compression: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe('The compression level (0-100%) for webp or jpeg formats. Defaults to 100.'),
        quality: z
          .enum(['auto', 'high', 'medium', 'low'])
          .optional()
          .describe('The quality of the image. One of auto (default), high, medium, or low.'),
        size: z
          .enum(['auto', '1024x1024', '1536x1024', '1024x1536'])
          .optional()
          .describe(
            'The size of the generated image. One of 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).',
          ),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = createImageGenOAITool;
