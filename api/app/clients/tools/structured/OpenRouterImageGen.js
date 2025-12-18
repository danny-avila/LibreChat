const { z } = require('zod');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { FileContext, ContentTypes } = require('librechat-data-provider');
const extractBaseURL = require('~/utils/extractBaseURL');

const displayMessage =
  "OpenRouter displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but not mention anything about downloading to the user.";

/**
 * OpenRouterImageGen - A tool for generating images using OpenRouter's image generation models.
 * Supports FLUX.2-Pro, FLUX.2-Flex, Gemini Image Generation, and other OpenRouter-compatible models.
 */
class OpenRouterImageGen extends Tool {
  // Supported models with their characteristics
  static MODELS = {
    'black-forest-labs/flux.2-pro': {
      name: 'FLUX.2 Pro',
      description: 'High-quality image generation with excellent detail',
      supportsAspectRatio: false,
    },
    'black-forest-labs/flux.2-flex': {
      name: 'FLUX.2 Flex',
      description: 'Flexible image generation model',
      supportsAspectRatio: false,
    },
    'google/gemini-2.5-flash-image-preview': {
      name: 'Gemini 2.5 Flash Image',
      description: 'Fast image generation with aspect ratio support',
      supportsAspectRatio: true,
    },
    'sourceful/riverflow-v2-standard-preview': {
      name: 'Riverflow v2',
      description: 'Standard preview model for image generation',
      supportsAspectRatio: false,
    },
  };

  // Supported aspect ratios for Gemini models (from OpenRouter docs)
  static ASPECT_RATIOS = [
    '1:1', // 1024×1024 (default)
    '2:3', // 832×1248
    '3:2', // 1248×832
    '3:4', // 864×1184
    '4:3', // 1184×864
    '4:5', // 896×1152
    '5:4', // 1152×896
    '9:16', // 768×1344
    '16:9', // 1344×768
    '21:9', // 1536×672
  ];

  constructor(fields = {}) {
    super();

    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;

    /** @type {boolean} **/
    this.isAgent = fields.isAgent;
    this.returnMetadata = fields.returnMetadata ?? false;

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }
    if (fields.uploadImageBuffer) {
      /** @type {uploadImageBuffer} More efficient for agents - uploads buffer directly. */
      this.uploadImageBuffer = fields.uploadImageBuffer.bind(this);
    }
    /** @type {ServerRequest | undefined} Express Request object, only provided by ToolService */
    this.req = fields.req;

    // Get API key from fields or environment
    this.apiKey = fields.OPENROUTER_API_KEY || this.getApiKey();

    // Get base URL from environment or use default OpenRouter URL
    this.baseUrl = extractBaseURL(
      fields.OPENROUTER_BASE_URL ||
        process.env.OPENROUTER_BASE_URL ||
        'https://openrouter.ai/api/v1',
    );

    this.name = 'openrouter_image_gen';
    this.description =
      'Generate high-quality images from text descriptions using OpenRouter-supported models like FLUX.2-Pro, FLUX.2-Flex, or Gemini Image Generation. Supports various models optimized for different use cases.';

    this.description_for_model = `// Generate images from detailed text descriptions using OpenRouter's image generation models.
    // Available models:
    // - black-forest-labs/flux.2-pro: Best for high-quality, detailed images
    // - black-forest-labs/flux.2-flex: Flexible model for various styles
    // - google/gemini-2.5-flash-image-preview: Fast generation with aspect ratio control
    // 
    // Always enhance basic prompts into detailed descriptions (3-6 sentences minimum).
    // Focus on visual elements: lighting, composition, mood, style, colors, and details.
    // For Gemini models, you can specify aspect ratios like "16:9" for wide images or "9:16" for portraits.`;

    // Define the schema for structured input
    this.schema = z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          'Detailed text description of the image to generate. Should be 3-6 sentences, focusing on visual elements, lighting, composition, mood, and style.',
        ),
      model: z
        .enum([
          'black-forest-labs/flux.2-pro',
          'black-forest-labs/flux.2-flex',
          'google/gemini-2.5-flash-image-preview',
          'sourceful/riverflow-v2-standard-preview',
        ])
        .optional()
        .default('black-forest-labs/flux.2-pro')
        .describe('The image generation model to use. Defaults to FLUX.2-Pro for best quality.'),
      aspect_ratio: z
        .enum(OpenRouterImageGen.ASPECT_RATIOS)
        .optional()
        .describe(
          'Aspect ratio for the generated image. Only supported for Gemini models. Defaults to 1:1 (square).',
        ),
    });
  }

  getAxiosConfig() {
    const config = {};
    if (process.env.PROXY) {
      config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
    }
    return config;
  }

  getApiKey() {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing OPENROUTER_API_KEY environment variable.');
    }
    return apiKey;
  }

  wrapInMarkdown(imageUrl) {
    const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    return `![generated image](${serverDomain}${imageUrl})`;
  }

  returnValue(value) {
    if (this.isAgent === true && typeof value === 'string') {
      return [value, {}];
    } else if (this.isAgent === true && typeof value === 'object') {
      if (Array.isArray(value)) {
        return value;
      }
      return [displayMessage, value];
    }
    return value;
  }

  async _call(data) {
    const { prompt, model = 'black-forest-labs/flux.2-pro', aspect_ratio } = data;

    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    // Validate aspect ratio is only used with Gemini models
    const modelInfo = OpenRouterImageGen.MODELS[model];
    if (!modelInfo) {
      throw new Error(`Unsupported model: ${model}`);
    }

    if (aspect_ratio && !modelInfo.supportsAspectRatio) {
      logger.warn(
        `[OpenRouterImageGen] Aspect ratio is only supported for Gemini models. Ignoring aspect_ratio for ${model}.`,
      );
    }

    const chatCompletionsUrl = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://librechat.ai',
    };

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      modalities: ['image', 'text'],
    };

    // Add image_config for Gemini models if aspect_ratio is specified
    if (modelInfo.supportsAspectRatio && aspect_ratio) {
      requestBody.image_config = {
        aspect_ratio,
      };
    }

    logger.debug('[OpenRouterImageGen] Generating image:', {
      model,
      url: chatCompletionsUrl,
      hasAspectRatio: !!aspect_ratio,
    });

    let axiosResponse;
    try {
      axiosResponse = await axios.post(chatCompletionsUrl, requestBody, {
        headers,
        ...this.getAxiosConfig(),
      });
    } catch (error) {
      const errorDetails = error?.response?.data || error.message || 'Unknown error';
      logger.error('[OpenRouterImageGen] Error while generating image:', errorDetails);

      return this.returnValue(
        `Something went wrong when trying to generate the image via OpenRouter:
Error Message: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`,
      );
    }

    // OpenRouter returns images in message.images array
    // Structure: response.data.choices[0].message.images[0].image_url.url
    const responseData = axiosResponse.data;
    const message = responseData.choices?.[0]?.message;
    const images = message?.images || [];

    if (!images || images.length === 0 || !images[0]?.image_url) {
      logger.error(
        '[OpenRouterImageGen] No image data returned from OpenRouter. Response:',
        responseData,
      );
      return this.returnValue(
        'No image data returned from OpenRouter API. The model may not support image generation or the request may have failed.',
      );
    }

    // Extract base64 from data URL (format: "data:image/png;base64,...")
    const imageUrl = images[0].image_url.url;

    // For agents, return base64 directly (consistent with other image tools)
    if (this.isAgent) {
      try {
        // Ensure imageUrl is in the correct format
        let base64Url = imageUrl;
        if (!imageUrl.startsWith('data:')) {
          // If it's already base64 without data: prefix, add it
          base64Url = `data:image/png;base64,${imageUrl}`;
        }

        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: base64Url,
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
      } catch (error) {
        logger.error('[OpenRouterImageGen] Error processing image for agent:', error);
        return this.returnValue(`Failed to process the image. ${error.message}`);
      }
    }

    // For non-agents, save locally
    const imageName = `img-${uuidv4()}.png`;
    try {
      logger.debug('[OpenRouterImageGen] Saving image:', imageName);
      // Ensure imageUrl is in the correct format for processFileURL
      const imageUrlForSave = imageUrl.startsWith('data:')
        ? imageUrl
        : `data:image/png;base64,${imageUrl}`;
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrlForSave,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      logger.debug('[OpenRouterImageGen] Image saved to path:', result.filepath);
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = error?.message ?? 'No additional error details.';
      logger.error('[OpenRouterImageGen] Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }
}

module.exports = OpenRouterImageGen;
