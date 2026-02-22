const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { FileContext, ContentTypes } = require('librechat-data-provider');

const MODELSLAB_TEXT2IMG_URL = 'https://modelslab.com/api/v6/images/text2img';
const MODELSLAB_FETCH_URL = 'https://modelslab.com/api/v6/images/fetch';

const modelsLabJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description:
        'A detailed text description of the image to generate. Be specific about subjects, style, lighting, and composition for best results.',
    },
    negative_prompt: {
      type: 'string',
      description:
        'Elements to exclude from the generated image (e.g., "blurry, low quality, watermark, text").',
    },
    model_id: {
      type: 'string',
      enum: [
        'flux',
        'juggernaut-xl-v10',
        'realvisxlV50_v50Bakedvae',
        'dreamshaperXL10_alpha2Xl10',
        'sdxl',
      ],
      description:
        'Model to use for generation. "flux" is the highest quality (default). SDXL variants are faster.',
    },
    width: {
      type: 'number',
      description: 'Image width in pixels (64–1024, multiples of 8). Default: 512.',
    },
    height: {
      type: 'number',
      description: 'Image height in pixels (64–1024, multiples of 8). Default: 512.',
    },
    guidance_scale: {
      type: 'number',
      description:
        'How closely to follow the prompt (1–20). Higher = more faithful, less creative. Default: 7.5.',
    },
    num_inference_steps: {
      type: 'number',
      description: 'Number of diffusion steps (10–50). More steps = higher quality but slower. Default: 20.',
    },
    seed: {
      type: 'number',
      description: 'Optional seed for reproducible results. Omit for random.',
    },
    enhance_prompt: {
      type: 'string',
      enum: ['yes', 'no'],
      description: 'Enhance the prompt using AI for better results. Default: "yes".',
    },
    safety_checker: {
      type: 'string',
      enum: ['yes', 'no'],
      description: 'Enable content safety filtering. Default: "yes".',
    },
  },
  required: ['prompt'],
};

const displayMessage =
  "ModelsLab displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * ModelsLabAPI - Generate images from text using the ModelsLab API.
 * Supports Flux, Juggernaut XL, RealVisXL, DreamShaper XL, and SDXL models.
 * Uses async polling for high-quality generations.
 */
class ModelsLabAPI extends Tool {
  constructor(fields = {}) {
    super();

    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    /** @type {boolean} Necessary for output to contain all image metadata. */
    this.returnMetadata = fields.returnMetadata ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;

    /** @type {boolean} */
    this.isAgent = fields.isAgent;

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.MODELSLAB_API_KEY || this.getApiKey();

    this.name = 'modelslab';
    this.description =
      "Generate images from text using ModelsLab's AI models including Flux, Juggernaut XL, RealVisXL, DreamShaper XL, and SDXL. Supports high-quality photorealistic and artistic image generation.";

    this.description_for_model = `// Generate high-quality AI images using ModelsLab. Follow these guidelines:
// 1. Write detailed, descriptive prompts (at least 2-3 sentences) specifying: subject, style, lighting, composition, and quality keywords.
// 2. Use negative_prompt to exclude unwanted elements: "blurry, low quality, watermark, text, deformed".
// 3. Choose model wisely: "flux" for highest quality, "juggernaut-xl-v10" for photorealism, SDXL variants for speed.
// 4. Use 1024x1024 for square images, 1024x576 for landscape, 576x1024 for portrait.
// 5. ALWAYS include the markdown image in your final response to show the user.
// 6. Generate one image per request unless the user explicitly asks for more.`;

    this.schema = modelsLabJsonSchema;
  }

  static get jsonSchema() {
    return modelsLabJsonSchema;
  }

  getApiKey() {
    const apiKey = process.env.MODELSLAB_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing MODELSLAB_API_KEY environment variable.');
    }
    return apiKey;
  }

  wrapInMarkdown(imageUrl) {
    const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    return `![generated image](${serverDomain}${imageUrl})`;
  }

  /** @param {Object|string} value */
  getDetails(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
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

  /**
   * Poll the ModelsLab fetch endpoint until the image is ready.
   * @param {string} fetchId - The request ID from the initial generation response.
   * @returns {Promise<string|null>} - The image URL, or null on error.
   */
  async pollForResult(fetchId) {
    const maxAttempts = 40;
    const pollIntervalMs = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      try {
        const response = await axios.post(
          `${MODELSLAB_FETCH_URL}/${fetchId}`,
          { key: this.apiKey },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const data = response.data;

        if (data.status === 'success' && data.output && data.output.length > 0) {
          return data.output[0];
        } else if (data.status === 'error') {
          logger.error('[ModelsLabAPI] Fetch error:', data);
          return null;
        }
        // status === 'processing' → keep polling
        logger.debug(`[ModelsLabAPI] Still processing, attempt ${attempt + 1}/${maxAttempts}`);
      } catch (error) {
        logger.error('[ModelsLabAPI] Polling error:', error?.response?.data || error.message);
        return null;
      }
    }

    logger.error('[ModelsLabAPI] Timed out waiting for image generation.');
    return null;
  }

  async _call(data) {
    if (!data.prompt) {
      return this.returnValue('Error: prompt is required.');
    }

    const payload = {
      key: this.apiKey,
      prompt: data.prompt,
      negative_prompt: data.negative_prompt || 'low quality, blurry, watermark, text, deformed',
      model_id: data.model_id || 'flux',
      width: data.width || 512,
      height: data.height || 512,
      samples: 1,
      num_inference_steps: data.num_inference_steps || 20,
      guidance_scale: data.guidance_scale || 7.5,
      enhance_prompt: data.enhance_prompt || 'yes',
      safety_checker: data.safety_checker || 'yes',
    };

    if (data.seed !== undefined) {
      payload.seed = data.seed;
    }

    logger.debug('[ModelsLabAPI] Generating image with model:', payload.model_id);

    let generateResponse;
    try {
      generateResponse = await axios.post(MODELSLAB_TEXT2IMG_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      logger.error('[ModelsLabAPI] Generation request error:', details);
      return this.returnValue(
        `Something went wrong when trying to generate the image. ModelsLab API may be unavailable: ${details}`,
      );
    }

    const responseData = generateResponse.data;
    logger.debug('[ModelsLabAPI] Initial response status:', responseData.status);

    let imageUrl = null;

    if (responseData.status === 'success' && responseData.output && responseData.output.length > 0) {
      // Synchronous success
      imageUrl = responseData.output[0];
    } else if (responseData.status === 'processing' && responseData.id) {
      // Async generation — poll for result
      logger.debug('[ModelsLabAPI] Image queued, polling with id:', responseData.id);
      imageUrl = await this.pollForResult(responseData.id);
    } else {
      const details = this.getDetails(responseData);
      logger.error('[ModelsLabAPI] Unexpected response:', details);
      return this.returnValue(`ModelsLab API returned an unexpected response: ${details}`);
    }

    if (!imageUrl) {
      return this.returnValue(
        'ModelsLab image generation failed or timed out. Please try again.',
      );
    }

    logger.debug('[ModelsLabAPI] Image URL:', imageUrl);

    // For agent mode: download and return as base64
    if (this.isAgent) {
      try {
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(imageResponse.data).toString('base64');
        const mimeType = 'image/png';
        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
        ];
        const response = [{ type: ContentTypes.TEXT, text: displayMessage }];
        return [response, { content }];
      } catch (error) {
        logger.error('[ModelsLabAPI] Error processing image for agent:', error);
        return this.returnValue(`Failed to process the image. ${error.message}`);
      }
    }

    // Save the image to local storage and return markdown
    const imageName = `img-${uuidv4()}.png`;

    try {
      logger.debug('[ModelsLabAPI] Saving image:', imageUrl);
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      logger.debug('[ModelsLabAPI] Image saved to path:', result.filepath);
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = this.getDetails(error?.message ?? 'No additional error details.');
      logger.error('[ModelsLabAPI] Error saving image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }
}

module.exports = ModelsLabAPI;
