const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { getFiles } = require('~/models/File');
const axios = require('axios');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { FileContext, ContentTypes } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logger } = require('~/config');

const displayMessage =
  'Flux displayed an image. All generated images are already plainly visible, so don\'t repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.';

/**
 * FluxAPI - A tool for generating high-quality images from text prompts using the Flux API.
 * Each call generates one image. If multiple images are needed, make multiple consecutive calls with the same or varied prompts.
 */
class FluxAPI extends Tool {
  // Pricing constants in USD per image
  static PRICING = {
    FLUX_KONTEXT_PRO: -0.04, // /v1/flux-kontext-pro
  };

  constructor(fields = {}) {
    super();

    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;

    /** @type {boolean} **/
    this.isAgent = fields.isAgent;
    this.returnMetadata = fields.returnMetadata ?? false;

    /** @type {Array} Store image files for editing */
    this.image_ids = fields.image_ids || [];

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.FLUX_API_KEY || this.getApiKey();

    this.name = 'flux';
    this.description =
      'Use Flux to generate images from text descriptions. This tool can generate or edit images. Each generate call creates one image. For multiple images, make multiple consecutive calls.';

    this.description_for_model = `// Flux Kontext Pro can both GENERATE new images and EDIT existing images
    // For GENERATION (action="generate"): Transform any image description into a detailed, high-quality prompt. Never submit a prompt under 3 sentences. Follow these core rules:
    // 1. ALWAYS enhance basic prompts into 5-10 detailed sentences (e.g., "a cat" becomes: "A close-up photo of a sleek Siamese cat with piercing blue eyes. The cat sits elegantly on a vintage leather armchair, its tail curled gracefully around its paws. Warm afternoon sunlight streams through a nearby window, casting gentle shadows across its face and highlighting the subtle variations in its cream and chocolate-point fur. The background is softly blurred, creating a shallow depth of field that draws attention to the cat's expressive features. The overall composition has a peaceful, contemplative mood with a professional photography style.")
    // 2. Each prompt MUST be 3-6 descriptive sentences minimum, focusing on visual elements: lighting, composition, mood, and style
    
    // For EDITING (action="edit"): 
    // 1. ALWAYS set action="edit" when modifying existing images
    // 2. ALWAYS include exactly ONE image_id in the image_ids array parameter
    // 3. Describe the desired changes or enhancements to the image in detail
    // 4. Focus on what should be added, modified, or enhanced rather than what to remove`;

    // Add base URL from environment variable with fallback
    this.baseUrl = process.env.FLUX_API_BASE_URL || 'https://api.bfl.ai';

    // Define the schema for structured input
    this.schema = z.object({
      action: z
        .enum(['generate', 'edit'])
        .default('generate')
        .describe(
          'Action to perform: "generate" for image generation, "edit" for image editing',
        ),
      prompt: z
        .string()
        .describe(
          'Text prompt for image generation and editing.',
        ),
      image_ids: z
        .array(z.string())
        .optional()
        .describe(
          'IDs of previously generated or uploaded images to use for editing. Only one image is supported for Flux Kontext Pro.',
        ),
      prompt_upsampling: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to perform upsampling on the prompt.'),
      seed: z
        .number()
        .optional()
        .describe('Optional seed for reproducibility.'),
      safety_tolerance: z
        .number()
        .optional()
        .default(2)
        .describe(
          'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.',
        ),
      endpoint: z
        .enum(['/v1/flux-kontext-pro'])
        .optional()
        .default('/v1/flux-kontext-pro')
        .describe('Endpoint to use for image generation.'),
      aspect_ratio: z
        .string()
        .optional()
        .default('9:16')
        .describe('Aspect ratio for kontext models (e.g., "9:16")'),
    });
  }

  getAxiosConfig() {
    const config = {};
    if (process.env.PROXY) {
      config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
    }
    return config;
  }

  /** @param {Object|string} value */
  getDetails(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  getApiKey() {
    const apiKey = process.env.FLUX_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing FLUX_API_KEY environment variable.');
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
    if (this.override) {
      return 'FluxAPI tool initialized without necessary variables.';
    }

    if (!this.apiKey) {
      return 'No Flux API key found. Please set the FLUX_API_KEY environment variable.';
    }

    // Determine if this is an edit or generate request
    const isEdit = this.image_ids && this.image_ids.length > 0;
    
    // For editing, we need to get the image file
    let imageBase64 = null;
    let imageFile = null;
    
    if (isEdit) {
      if (this.image_ids.length > 1) {
        return this.returnValue('Flux Kontext Pro only supports editing one image at a time. Please provide only one image ID.');
      }
      
      try {
        const imageId = this.image_ids[0];
        logger.debug('[FluxAPI] Getting image file for editing:', imageId);
        
        // Get the file from the database
        const files = await getFiles({ file_id: imageId });
        
        if (!files || files.length === 0) {
          return this.returnValue(`Image with ID ${imageId} not found.`);
        }
        imageFile = files[0];
        
        // For local files, fetch from the server URL
        const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
        const imageUrl = `${serverDomain}${imageFile.filepath}`;
        logger.debug('[FluxAPI] Fetching image from URL:', imageUrl);
        
        // Fetch the image from the URL
        const fetchOptions = {};
        if (process.env.PROXY) {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          fetchOptions.agent = new HttpsProxyAgent(process.env.PROXY);
        }
        
        const imageResponse = await fetch(imageUrl, fetchOptions);
        
        if (!imageResponse.ok) {
          return this.returnValue(`Failed to fetch image from ${imageUrl}: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        imageBase64 = buffer.toString('base64');
        logger.debug('[FluxAPI] Image loaded for editing from URL, base64 length:', imageBase64.length);
      } catch (error) {
        logger.error('[FluxAPI] Error getting image for editing:', error);
        return this.returnValue(`Error getting image for editing: ${error.message}`);
      }
    }

    // Prepare the request data
    const requestApiKey = this.apiKey;
    
    // Set the endpoint based on action
    const generateEndpoint = '/v1/flux-kontext-pro';
    const resultEndpoint = '/v1/get_result';

    // Prepare the request body
    const requestBody = {
      prompt: data.prompt,
      prompt_upsampling: data.prompt_upsampling || false,
      safety_tolerance: data.safety_tolerance || 2,
      aspect_ratio: data.aspect_ratio || '9:16',
      output_format: data.output_format || 'png',
    };

    // Add image for editing
    if (isEdit && imageBase64) {
      requestBody.input_image = `data:image/${imageFile.type.split('/')[1]};base64,${imageBase64}`;
    }

    // Submit the task
    let taskResponse;
    try {
      logger.debug(`[FluxAPI] Submitting ${isEdit ? 'edit' : 'generation'} task to ${generateEndpoint}`);
      taskResponse = await axios.post(generateEndpoint, requestBody, {
        baseURL: this.baseUrl,
        headers: {
          'x-key': requestApiKey,
          'Content-Type': 'application/json',
        },
        ...this.getAxiosConfig(),
      });
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      logger.error('[FluxAPI] Error while submitting task:', details);

      return this.returnValue(
        `Something went wrong when trying to ${isEdit ? 'edit' : 'generate'} the image. The Flux API may be unavailable:
        Error Message: ${details}`,
      );
    }

    const taskId = taskResponse.data.id;

    // Polling for the result
    let status = 'Pending';
    let resultData = null;
    while (status !== 'Ready' && status !== 'Error') {
      try {
        // Wait 2 seconds between polls
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const resultResponse = await axios.get(resultEndpoint, {
          baseURL: this.baseUrl,
          headers: {
            'x-key': requestApiKey,
            Accept: 'application/json',
          },
          params: { id: taskId },
          ...this.getAxiosConfig(),
        });
        status = resultResponse.data.status;

        if (status === 'Ready') {
          resultData = resultResponse.data.result;
          break;
        } else if (status === 'Error') {
          logger.error('[FluxAPI] Error in task:', resultResponse.data);
          return this.returnValue('An error occurred during image generation.');
        }
      } catch (error) {
        const details = this.getDetails(error?.response?.data || error.message);
        logger.error('[FluxAPI] Error while getting result:', details);
        return this.returnValue('An error occurred while retrieving the image.');
      }
    }

    // If no result data
    if (!resultData || !resultData.sample) {
      logger.error('[FluxAPI] No image data received from API. Response:', resultData);
      return this.returnValue('No image data received from Flux API.');
    }

    // Try saving the image locally
    const imageUrl = resultData.sample;
    const imageName = `img-${uuidv4()}.png`;

    if (this.isAgent) {
      try {
        // Fetch the image and convert to base64
        const fetchOptions = {};
        if (process.env.PROXY) {
          fetchOptions.agent = new HttpsProxyAgent(process.env.PROXY);
        }
        const imageResponse = await fetch(imageUrl, fetchOptions);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: `data:image/png;base64,${base64}`,
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
        logger.error('Error processing image for agent:', error);
        return this.returnValue(`Failed to process the image. ${error.message}`);
      }
    }

    try {
      logger.debug('[FluxAPI] Saving image:', imageUrl);
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      logger.debug('[FluxAPI] Image saved to path:', result.filepath);

      // Calculate cost based on endpoint
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = this.getDetails(error?.message ?? 'No additional error details.');
      logger.error('Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }
}

module.exports = FluxAPI;
