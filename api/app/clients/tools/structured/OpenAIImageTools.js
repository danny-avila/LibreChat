const { z } = require('zod');
const axios = require('axios');
const OpenAI = require('openai');
const FormData = require('form-data');
const { tool } = require('@langchain/core/tools');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ContentTypes, EImageOutputType } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logAxiosError, extractBaseURL } = require('~/utils');
const { logger } = require('~/config');

const displayMessage =
  'The tool displayed an image. All generated images are already plainly visible, so don\'t repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.';

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
 * Creates OpenAI Image tools (generation and editing)
 * @param {Object} fields - Configuration fields
 * @param {ServerRequest} fields.req - Whether the tool is being used in an agent context
 * @param {boolean} fields.isAgent - Whether the tool is being used in an agent context
 * @param {string} fields.IMAGE_GEN_OAI_API_KEY - The OpenAI API key
 * @param {boolean} [fields.override] - Whether to override the API key check, necessary for app initialization
 * @param {MongoFile[]} [fields.imageFiles] - The images to be used for editing
 * @returns {Array} - Array of image tools
 */
function createOpenAIImageTools(fields = {}) {
  /** @type {boolean} Used to initialize the Tool without necessary variables. */
  const override = fields.override ?? false;
  /** @type {boolean} */
  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }
  const { req } = fields;
  const imageOutputType = req?.app.locals.imageOutputType || EImageOutputType.PNG;
  const fileStrategy = req?.app.locals.fileStrategy;

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
  let baseURL = 'https://api.openai.com/v1/';
  if (!override && process.env.IMAGE_GEN_OAI_REVERSE_PROXY) {
    baseURL = extractBaseURL(process.env.IMAGE_GEN_OAI_REVERSE_PROXY);
    closureConfig.baseURL = baseURL;
  }

  // Configure Azure if needed
  if (
    !override &&
    process.env.IMAGE_GEN_OAI_AZURE_API_VERSION &&
    process.env.IMAGE_GEN_OAI_BASEURL
  ) {
    baseURL = process.env.IMAGE_GEN_OAI_BASEURL;
    closureConfig.baseURL = baseURL;
    closureConfig.defaultQuery = { 'api-version': process.env.IMAGE_GEN_OAI_AZURE_API_VERSION };
    closureConfig.defaultHeaders = {
      'api-key': process.env.IMAGE_GEN_OAI_API_KEY,
      'Content-Type': 'application/json',
    };
    closureConfig.apiKey = process.env.IMAGE_GEN_OAI_API_KEY;
  }

  /**
   * Image Generation Tool
   */
  const imageGenTool = tool(
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
        const message = '[`image_gen_oai`] Problem generating the image:';
        logAxiosError({ error, message });
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
      description: `Use \`image_gen_oai\` to create completely new images from text descriptions only.
      - Use this tool when there are no user-uploaded reference images being used or requested.
      - Generates high-quality, original images based on your text prompt.
      - If the user refers to uploaded images for inspiration, modification, or remixing, always use the image editing tool (\`image_edit_oai\`) instead.`,
      schema: z.object({
        prompt: z
          .string()
          .max(32000)
          .describe(
            `Describe the image you want in detail. 
      Be highly specific—break your idea into layers: 
      (1) main concept and subject,
      (2) composition and position,
      (3) lighting and mood,
      (4) style, medium, or camera details,
      (5) important features (age, expression, clothing, etc.),
      (6) background.
      Use positive, descriptive language and specify what should be included, not what to avoid. 
      List number and characteristics of people/objects, and mention style/technical requirements (e.g., "DSLR photo, 85mm lens, golden hour").
      Do not reference any uploaded images—use for new image creation from text only.`,
          ),
        background: z
          .enum(['transparent', 'opaque', 'auto'])
          .optional()
          .describe(
            'Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.',
          ),
        /*
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
           */
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

  /**
   * Image Editing Tool
   */
  const imageEditTool = tool(
    async ({ prompt, quality = 'auto', size = 'auto' }, runnableConfig) => {
      if (!fileStrategy) {
        throw new Error('Missing required toolkit field: fileStrategy');
      }
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      // Setup HTTP request configuration
      const config = {};
      if (process.env.PROXY) {
        config.httpAgent = new HttpsProxyAgent(process.env.PROXY);
      }

      // Create form data for the request
      const formData = new FormData();
      formData.append('model', 'gpt-image-1');
      formData.append('prompt', replaceUnwantedChars(prompt));
      // TODO: more than 1 image support
      // formData.append('n', n.toString());
      formData.append('quality', quality);
      formData.append('size', size);

      const { getDownloadStream } = getStrategyFunctions(fileStrategy);
      for (const imageFile of fields.imageFiles) {
        const stream = await getDownloadStream(req, imageFile.filepath);
        if (!stream) {
          throw new Error('Failed to get download stream for image file');
        }
        formData.append('image[]', stream, {
          filename: imageFile.filename,
          contentType: imageFile.type,
        });
      }

      // TODO: `mask` support

      // Set headers
      const headers = {
        ...formData.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      };

      try {
        const response = await axios.post(`${baseURL}images/edits`, formData, {
          headers,
          ...config,
        });

        if (!response.data || !response.data.data || !response.data.data.length) {
          return returnValue(
            'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
          );
        }

        // Process the response
        const base64Image = response.data.data[0].b64_json;
        if (!base64Image) {
          return returnValue(
            'No image data returned from OpenAI API. There may be a problem with the API or your configuration.',
          );
        }

        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: `data:image/${imageOutputType};base64,${base64Image}`,
            },
          },
        ];

        const textResponse = [
          {
            type: ContentTypes.TEXT,
            text: displayMessage,
          },
        ];
        return [textResponse, { content }];
      } catch (error) {
        const message = '[`image_edit_oai`] Problem editing the image:';
        logAxiosError({ error, message });
        return returnValue(`Something went wrong when trying to edit the image. The OpenAI API may be unavailable:
Error Message: ${error.message || 'Unknown error'}`);
      }
    },
    {
      name: 'image_edit_oai',
      description: `Use \`image_edit_oai\` if the user has uploaded one or more reference images and wants to modify, extend, or create a new image inspired by them.
      - Always use this tool when the user refers to uploaded images for editing, enhancement, remixing, style transfer, or combining elements.
      - The most recently uploaded images are used as the reference or input.
      - Do not use this tool for brand new image generation from scratch—use \`image_gen_oai\` for that.`,
      schema: z.object({
        prompt: z
          .string()
          .max(32000)
          .describe(
            `Describe the changes, enhancements, or new ideas to apply to the uploaded image(s).
      Be highly specific—break your request into layers: 
      (1) main concept or transformation,
      (2) specific edits/replacements or composition guidance,
      (3) desired style, mood, or technique,
      (4) features/items to keep, change, or add (such as objects, people, clothing, lighting, etc.).
      Use positive, descriptive language and clarify what should be included or changed, not what to avoid.
      Always base this prompt on the most recently uploaded reference images.`,
          ),
        /*
        n: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('The number of images to generate. Must be between 1 and 10. Defaults to 1.'),
        */
        quality: z
          .enum(['auto', 'high', 'medium', 'low'])
          .optional()
          .describe(
            'The quality of the image. One of auto (default), high, medium, or low. High/medium/low only supported for gpt-image-1.',
          ),
        size: z
          .enum(['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512'])
          .optional()
          .describe(
            'The size of the generated images. For gpt-image-1: auto (default), 1024x1024, 1536x1024, 1024x1536. For dall-e-2: 256x256, 512x512, 1024x1024.',
          ),
      }),
      responseFormat: 'content_and_artifact',
    },
  );

  return [imageGenTool, imageEditTool];
}

module.exports = createOpenAIImageTools;
