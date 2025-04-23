const { z } = require('zod');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { tool } = require('@langchain/core/tools');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { FileContext, ContentTypes, EImageOutputType } = require('librechat-data-provider');
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

/**
 * Wraps an image URL in markdown format
 * @param {string} imageUrl - The URL of the image
 * @returns {string} - The markdown formatted image
 */
function wrapInMarkdown(imageUrl) {
  return `![generated image](${imageUrl})`;
}

/**
 * Creates an OpenAI Image Generation tool using the gpt-image-1 model
 * @param {Object} fields - Configuration fields
 * @returns {Function} - The image generation tool
 */
function createImageGenOAITool(fields = {}) {
  /** @type {boolean} Used to initialize the Tool without necessary variables. */
  const override = fields.override ?? false;
  /** @type {boolean} Necessary for output to contain all image metadata. */
  const returnMetadata = fields.returnMetadata ?? false;

  const userId = fields.userId;
  const fileStrategy = fields.fileStrategy;
  /** @type {boolean} */
  const isAgent = fields.isAgent;
  let processFileURL;
  if (fields.processFileURL) {
    /** @type {processFileURL} Necessary for output to contain all image metadata. */
    processFileURL = fields.processFileURL.bind(fields);
  }

  // Get API key from environment variables or fields
  const getApiKey = () => {
    const apiKey = process.env.IMAGE_GEN_OAI_API_KEY ?? '';
    if (!apiKey && !override) {
      throw new Error('Missing IMAGE_GEN_OAI_API_KEY environment variable.');
    }
    return apiKey;
  };

  let apiKey = fields.IMAGE_GEN_OAI_API_KEY ?? getApiKey();
  const config = { apiKey };

  // Configure proxy if needed
  if (process.env.IMAGE_GEN_OAI_REVERSE_PROXY) {
    config.baseURL = extractBaseURL(process.env.IMAGE_GEN_OAI_REVERSE_PROXY);
  }

  // Configure Azure if needed
  if (process.env.IMAGE_GEN_OAI_AZURE_API_VERSION && process.env.IMAGE_GEN_OAI_BASEURL) {
    config.baseURL = process.env.IMAGE_GEN_OAI_BASEURL;
    config.defaultQuery = { 'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION };
    config.defaultHeaders = {
      'api-key': process.env.IMAGE_GEN_OAI_API_KEY,
      'Content-Type': 'application/json',
    };
    config.apiKey = process.env.IMAGE_GEN_OAI_API_KEY;
  }

  if (process.env.PROXY) {
    config.httpAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  /** @type {OpenAI} */
  const openai = new OpenAI(config);

  /**
   * Format the response value based on agent status
   * @param {string|object} value - The value to format
   * @returns {string|array} - The formatted value
   */
  const returnValue = (value) => {
    if (isAgent === true && typeof value === 'string') {
      return [value, {}];
    } else if (isAgent === true && typeof value === 'object') {
      return [displayMessage, value];
    }

    return value;
  };

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
      runManager,
    ) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      // Get the desired output format from the request
      const imageOutputType = runManager?.req?.app?.locals?.imageOutputType || EImageOutputType.PNG;

      // Set output_format based on imageOutputType
      let output_format = imageOutputType;

      // Validate background parameter when using transparent
      if (background === 'transparent' && output_format !== 'png' && output_format !== 'webp') {
        logger.warn(
          '[ImageGenOAI] Transparent background requires PNG or WebP format, defaulting to PNG',
        );
        output_format = 'png';
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
            output_format === 'webp' || output_format === 'jpeg' ? output_compression : undefined,
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
      const base64Image = resp.data[0].b64_json;

      if (!base64Image) {
        return returnValue(
          'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
        );
      }

      if (isAgent) {
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
      }

      // Save the image locally
      const imageName = `img-${uuidv4()}.${output_format}`;

      logger.debug('[ImageGenOAI]', {
        imageName,
        output_format,
        model: 'gpt-image-1',
        background,
        quality,
        size,
      });

      try {
        // Convert base64 to buffer for saving
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Create a temporary URL for the buffer
        const dataUrl = `data:image/${output_format};base64,${base64Image}`;

        const result = await processFileURL({
          URL: dataUrl,
          basePath: 'images',
          userId: userId,
          fileName: imageName,
          fileStrategy: fileStrategy,
          context: FileContext.image_generation,
          buffer: imageBuffer,
        });

        if (returnMetadata) {
          return returnValue(result);
        } else {
          return returnValue(wrapInMarkdown(result.filepath));
        }
      } catch (error) {
        logger.error('Error while saving the image:', error);
        return returnValue(`Failed to save the image locally. ${error.message}`);
      }
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
    },
  );
}

module.exports = createImageGenOAITool;
