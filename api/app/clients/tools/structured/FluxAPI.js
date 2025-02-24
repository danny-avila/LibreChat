// FluxAPI.js

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('~/config');
const { FileContext } = require('librechat-data-provider');
const { processFileURL } = require('~/server/services/Files/process');
const { ImageTransaction } = require('~/models/ImageTransaction');

/**
 * FluxAPI - A tool for generating high-quality images from text prompts using the Flux API.
 * Each call generates one image. If multiple images are needed, make multiple consecutive calls with the same or varied prompts.
 */
class FluxAPI extends Tool {
  // Pricing constants in USD per image
  static PRICING = {
    'FLUX_PRO_1_1_ULTRA': -0.06,          // /v1/flux-pro-1.1-ultra
    'FLUX_PRO_1_1': -0.04,                // /v1/flux-pro-1.1
    'FLUX_PRO': -0.05,                    // /v1/flux-pro
    'FLUX_DEV': -0.025,                   // /v1/flux-dev
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

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.FLUX_API_KEY || this.getApiKey();

    this.name = 'flux';
    this.description =
      "Use Flux to generate images from text descriptions. This tool can generate images and list available finetunes. Each generate call creates one image. For multiple images, make multiple consecutive calls.";

    this.description_for_model = `// Transform any image description into a detailed, high-quality prompt. Follow these core rules:
    // 1. ALWAYS enhance basic prompts into 5-10 detailed sentences (e.g., "a cat" becomes: "A close-up photo of a sleek Siamese cat with piercing blue eyes. The cat sits elegantly on a vintage leather armchair, its tail curled gracefully around its paws. Warm afternoon sunlight streams through a nearby window, casting gentle shadows across its face and highlighting the subtle variations in its cream and chocolate-point fur. The background is softly blurred, creating a shallow depth of field that draws attention to the cat's expressive features. The overall composition has a peaceful, contemplative mood with a professional photography style.")
    // 2. Start with image type (photo, painting, digital art, etc.) unless specified otherwise
    // 3. Add concrete visual details that enhance the core concept
    // 4. Each prompt MUST be 3-6 descriptive sentences minimum, focusing on visual elements: lighting, composition, mood, and style
    // For finetunes: Use action: 'list_finetunes' to see available custom models
    // Generate without asking permission, embed images directly without commentary.`;

    // Add base URL from environment variable with fallback
    this.baseUrl = process.env.FLUX_API_BASE_URL || 'https://api.us1.bfl.ai';

    // Define the schema for structured input
    this.schema = z.object({
      action: z
        .enum(['generate', 'list_finetunes'])
        .default('generate')
        .describe('Action to perform: "generate" for image generation, "list_finetunes" to get available custom models'),
      api_key: z
        .string()
        .optional()
        .describe('Optional API key to use for this request. If not provided, will use the default system API key.'),
      prompt: z
        .string()
        .optional()
        .describe('Text prompt for image generation. Required when action is "generate". Not used for list_finetunes.'),
      width: z
        .number()
        .optional()
        .describe(
          'Width of the generated image in pixels. Must be a multiple of 32. Default is 1024.'
        ),
      height: z
        .number()
        .optional()
        .describe(
          'Height of the generated image in pixels. Must be a multiple of 32. Default is 768.'
        ),
      prompt_upsampling: z
        .boolean()
        .optional()
        .describe('Whether to perform upsampling on the prompt.'),
      steps: z
        .number()
        .int()
        .optional()
        .describe('Number of steps to run the model for, a number from 1 to 50. Default is 40.'),
      seed: z.number().optional().describe('Optional seed for reproducibility.'),
      safety_tolerance: z
        .number()
        .optional()
        .default(5)
        .describe(
          'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.'
        ),
      endpoint: z
        .enum([
          '/v1/flux-pro-1.1',
          '/v1/flux-pro',
          '/v1/flux-dev',
          '/v1/flux-pro-1.1-ultra'
        ])
        .optional()
        .default('/v1/flux-dev')
        .describe('Endpoint to use for image generation. Default is /v1/flux-pro.'),
      raw: z
        .boolean()
        .optional()
        .describe(
          'Generate less processed, more natural-looking images. Only works for /v1/flux-pro-1.1-ultra.'
        ),
    });
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
      // Special handling for finetunes list
      if (Array.isArray(value) && value[0] === 'Here are your available finetuned models:') {
        return value;
      }
      // Default image handling
      return [
        'Flux displayed an image. All generated images are already plainly visible, so don\'t repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.',
        value,
      ];
    }
    return value;
  }

  async _call(data) {
    const { action = 'generate', api_key, ...imageData } = data;

    // Use provided API key for this request if available, otherwise use default
    const requestApiKey = api_key || this.getApiKey();

    // Handle list_finetunes action
    if (action === 'list_finetunes') {
      return this.getMyFinetunes(requestApiKey);
    }

    // For generate action, ensure prompt is provided
    if (!imageData.prompt) {
      throw new Error('Missing required field: prompt');
    }

    const generateUrl = `${this.baseUrl}${imageData.endpoint || '/v1/flux-pro'}`;
    const resultUrl = `${this.baseUrl}/v1/get_result`;

    const payload = {
      prompt: imageData.prompt,
      width: imageData.width || 1024,
      height: imageData.height || 768,
      steps: imageData.steps || 40,
      prompt_upsampling: imageData.prompt_upsampling || false,
      seed: imageData.seed || null,
      safety_tolerance: imageData.safety_tolerance || 6,
      output_format: imageData.output_format || 'png',
      raw: imageData.raw || false,
    };

    logger.debug('[FluxAPI] Action:', action);
    logger.debug('[FluxAPI] Generating image with prompt:', imageData.prompt);
    logger.debug('[FluxAPI] Using endpoint:', imageData.endpoint || '/v1/flux-pro');
    logger.debug('[FluxAPI] Steps:', payload.steps);
    logger.debug('[FluxAPI] Safety Tolerance:', payload.safety_tolerance);
    logger.debug('[FluxAPI] Dimensions:', payload.width, 'x', payload.height);

    const headers = {
      'x-key': requestApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let taskResponse;
    try {
      taskResponse = await axios.post(generateUrl, payload, { headers });
    } catch (error) {
      const details = error?.response?.data || error.message;
      logger.error('[FluxAPI] Error while submitting task:', details);
      
      // Create error transaction
      try {
        await ImageTransaction.create({
          user: this.userId,
          prompt: imageData.prompt,
          endpoint: imageData.endpoint || '/v1/flux-pro',
          cost: 0, // No charge for failed requests
          imagePath: '',
          status: 'error',
          error: details,
          metadata: {
            ...payload,
          }
        });
      } catch (txError) {
        logger.error('[FluxAPI] Error creating error transaction:', txError);
      }

      return this.returnValue(
        `Something went wrong when trying to generate the image. The Flux API may be unavailable:
        Error Message: ${details}`
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
        const resultResponse = await axios.get(resultUrl, {
          headers,
          params: { id: taskId },
        });
        status = resultResponse.data.status;

        if (status === 'Ready') {
          resultData = resultResponse.data.result;
          break;
        } else if (status === 'Error') {
          logger.error('[FluxAPI] Error in task:', resultResponse.data);
          
          // Create error transaction
          try {
            await ImageTransaction.create({
              user: this.userId,
              prompt: imageData.prompt,
              endpoint: imageData.endpoint || '/v1/flux-pro',
              cost: 0, // No charge for failed requests
              imagePath: '',
              status: 'error',
              error: 'Task failed during processing',
              metadata: {
                ...payload,
              }
            });
          } catch (txError) {
            logger.error('[FluxAPI] Error creating error transaction:', txError);
          }

          return this.returnValue('An error occurred during image generation.');
        }
      } catch (error) {
        const details = error?.response?.data || error.message;
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
      const endpoint = imageData.endpoint || '/v1/flux-pro';
      const endpointKey = Object.entries(FluxAPI.PRICING).find(([key, _]) => 
        endpoint.includes(key.toLowerCase().replace(/_/g, '-'))
      )?.[0];
      const cost = FluxAPI.PRICING[endpointKey] || 0;

      // Create successful transaction
      try {
        await ImageTransaction.create({
          user: this.userId,
          prompt: imageData.prompt,
          endpoint: endpoint,
          cost: cost,
          imagePath: result.filepath,
          status: 'success',
          metadata: {
            ...payload,
          }
        });
      } catch (txError) {
        logger.error('[FluxAPI] Error creating success transaction:', txError);
      }
      
      // Return the result based on returnMetadata flag
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = error?.message ?? 'No additional error details.';
      logger.error('Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }

  async getMyFinetunes(apiKey = null) {
    const finetunesUrl = `${this.baseUrl}/v1/my_finetunes`;
    const detailsUrl = `${this.baseUrl}/v1/finetune_details`;

    try {
      const headers = {
        'x-key': apiKey || this.getApiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Get list of finetunes
      const response = await axios.get(finetunesUrl, { headers });
      const finetunes = response.data.finetunes;

      // Fetch details for each finetune
      const finetuneDetails = await Promise.all(
        finetunes.map(async (finetuneId) => {
          try {
            const detailResponse = await axios.get(`${detailsUrl}?finetune_id=${finetuneId}`, { headers });
            return {
              id: finetuneId,
              ...detailResponse.data
            };
          } catch (error) {
            logger.error(`[FluxAPI] Error fetching details for finetune ${finetuneId}:`, error);
            return {
              id: finetuneId,
              error: 'Failed to fetch details'
            };
          }
        })
      );

      return finetuneDetails;
      
    } catch (error) {
      const details = error?.response?.data || error.message;
      logger.error('[FluxAPI] Error while getting finetunes:', details);
      const errorMsg = `Failed to get finetunes: ${details}`;
      return this.isAgent ? this.returnValue([errorMsg, {}]) : new Error(errorMsg);
    }
  }
}

module.exports = FluxAPI;