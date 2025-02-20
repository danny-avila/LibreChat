// FluxAPI.js

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('~/config');
const { FileContext } = require('librechat-data-provider');
const { processFileURL } = require('~/server/services/Files/process');

/**
 * FluxAPI - A tool for generating high-quality images from text prompts using the Flux API.
 * Each call generates one image. If multiple images are needed, make multiple consecutive calls with the same or varied prompts.
 */
class FluxAPI extends Tool {
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
      "Use Flux to generate images from text descriptions. This tool is exclusively for visual content. Each call generates one image. If multiple images are needed, make multiple consecutive calls with the same or varied prompts. Additional actions: 'list_finetunes' to see available finetuned models, 'generate_finetuned' to generate with a specific finetuned model.";

    this.description_for_model = `// Use Flux to generate images from detailed text descriptions. Follow these guidelines:

1. Core Requirements:
   - All prompts must be in English (translate if needed)
   - Each call generates ONE image. For multiple images, make multiple consecutive calls
   - Do not list descriptions before/after generating
   - Generate without asking for permission
   - Embed images directly without additional text/commentary
   - Available actions:
     * 'generate': Standard image generation
     * 'list_finetunes': List available finetuned models
     * 'generate_finetuned': Generate using a finetuned model

2. Multiple Image Generation:
   - When user requests multiple images, make multiple consecutive calls to the tool
   - Each call should use the same prompt or variations of it
   - Do not wait for user confirmation between calls
   - All generated images will be displayed in sequence

3. Prompt Structure:
   - Subject: Clearly define the main focus
   - Style: Specify artistic approach (e.g., photorealistic, painterly, abstract)
   - Composition: Detail foreground, middle ground, and background arrangement
   - Lighting: Describe type, direction, and quality of light
   - Color Palette: Define dominant colors or color scheme
   - Mood/Atmosphere: Convey emotional tone and ambiance
   - Technical Details: Include camera settings/lens type for photorealistic images
   - Additional Elements: Add supporting details that enhance the scene

4. Leverage Flux's Strengths:
   - Layered Elements: Describe distinct layers and their relationships
   - Material Properties: Specify textures, transparency, reflections
   - Text Integration: Utilize Flux's text rendering capabilities
   - Style Fusion: Combine multiple artistic styles when appropriate
   - Temporal Elements: Incorporate motion or time-based aspects

5. Best Practices:
   - Write in natural language, as if explaining to a human artist
   - Be precise and detailed while maintaining coherence
   - Balance specificity with creative interpretation
   - Focus on visual descriptions rather than conceptual ideas
   - Guide the overall composition, not just individual elements

6. Avoid Common Mistakes:
   - Don't overload prompts with conflicting concepts
   - Avoid vague descriptions
   - Don't default to realism unless specified
   - Don't repeat prompts or provide captions
   - Don't mention download links or technical aspects to users

7. Image Handling:
   - Embed images directly in responses
   - No additional text or descriptions around images
   - No captions or alt text
   - No commentary about the generation process
   - Multiple images will appear in sequence from multiple calls

8. Finetuned Generation (action: 'generate_finetuned'):
   - First use 'list_finetunes' to get available model IDs
   - Required parameters:
     * finetune_id: ID of the model to use
     * prompt: Text description of the image
   - Optional parameters:
     * finetune_strength (0-2): Control model influence
     * For pro finetune:
       - guidance (1.5-5): Controls prompt adherence
     * For ultra finetune:
       - Compatible with all standard parameters`;

    // Define the schema for structured input
    this.schema = z.object({
      action: z
        .enum(['generate', 'list_finetunes', 'generate_finetuned'])
        .default('generate')
        .describe('Action to perform: "generate" for standard generation, "list_finetunes" to list models, "generate_finetuned" for finetuned generation'),
      prompt: z
        .string()
        .optional()
        .describe('Text prompt for image generation. Required for "generate" and "generate_finetuned" actions.'),
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
        .describe(
          'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.'
        ),
      endpoint: z
        .enum([
          '/v1/flux-pro-1.1',
          '/v1/flux-pro',
          '/v1/flux-dev',
          '/v1/flux-pro-1.1-ultra',
          '/v1/flux-pro-1.1-ultra-finetuned',
          '/v1/flux-pro-finetuned'
        ])
        .optional()
        .default('/v1/flux-dev')
        .describe('Endpoint to use for image generation. Default is /v1/flux-pro. The finetuned models are to be used with their respective parameters.'),
      raw: z
        .boolean()
        .optional()
        .describe(
          'Generate less processed, more natural-looking images. Only works for /v1/flux-pro-1.1-ultra.'
        ),
      // Add finetuning parameters
      finetune_id: z
        .string()
        .optional()
        .describe('ID of the fine-tuned model to use.'),
      finetune_strength: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe('Strength of the fine-tuned model. 0.0 means no influence, up to 2.0 for maximum influence.'),
      guidance: z
        .number()
        .min(1.5)
        .max(5)
        .optional()
        .default(2.5)
        .describe('Guidance scale for image generation. High guidance scales improve prompt adherence at the cost of reduced realism.'),
      aspect_ratio: z
        .string()
        .optional()
        .default('16:9')
        .describe('Aspect ratio of the image between 21:9 and 9:21'),
      image_prompt: z
        .string()
        .optional()
        .nullable()
        .describe('Optional image to remix in base64 format'),
      image_prompt_strength: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.1)
        .describe('Blend between the prompt and the image prompt'),
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
    const { action = 'generate', ...imageData } = data;

    // Handle finetunes listing
    if (action === 'list_finetunes') {
      return this.getMyFinetunes();
    }

    // For both generate actions, ensure prompt is provided
    if (!imageData.prompt) {
      throw new Error('Missing required field: prompt');
    }

    // Handle finetuned generation
    if (action === 'generate_finetuned') {
      if (!imageData.finetune_id) {
        throw new Error('Missing required field: finetune_id for finetuned generation');
      }
      // Set the appropriate endpoint based on the finetune_id format or user preference
      imageData.endpoint = imageData.endpoint || '/v1/flux-pro-1.1-ultra-finetuned';
    }

    const baseUrl = 'https://api.bfl.ml';
    const generateUrl = `${baseUrl}${imageData.endpoint || '/v1/flux-pro'}`;
    const resultUrl = `${baseUrl}/v1/get_result`;

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
      // Include finetuning parameters if provided
      ...(imageData.finetune_id && {
        finetune_id: imageData.finetune_id,
        finetune_strength: imageData.finetune_strength,
        guidance: imageData.guidance,
      }),
    };

    logger.debug('[FluxAPI] Action:', action);
    logger.debug('[FluxAPI] Generating image with prompt:', imageData.prompt);
    logger.debug('[FluxAPI] Using endpoint:', imageData.endpoint || '/v1/flux-pro');
    if (action === 'generate_finetuned') {
      logger.debug('[FluxAPI] Using finetune:', imageData.finetune_id);
      logger.debug('[FluxAPI] Finetune strength:', imageData.finetune_strength);
      if (imageData.guidance) {
        logger.debug('[FluxAPI] Guidance:', imageData.guidance);
      }
    }
    logger.debug('[FluxAPI] Steps:', payload.steps);
    logger.debug('[FluxAPI] Safety Tolerance:', payload.safety_tolerance);
    logger.debug('[FluxAPI] Dimensions:', payload.width, 'x', payload.height);

    const headers = {
      'x-key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let taskResponse;
    try {
      taskResponse = await axios.post(generateUrl, payload, { headers });
    } catch (error) {
      const details = error?.response?.data || error.message;
      logger.error('[FluxAPI] Error while submitting task:', details);
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
      
      // Return the result based on returnMetadata flag
      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = error?.message ?? 'No additional error details.';
      logger.error('Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }

  async getMyFinetunes() {
    const baseUrl = 'https://api.bfl.ml';
    const finetunesUrl = `${baseUrl}/v1/my_finetunes`;

    try {
      const headers = {
        'x-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const response = await axios.get(finetunesUrl, { headers });
      if (this.isAgent) {
        return this.returnValue(['Here are your available finetuned models:', response.data]);
      }
      return response.data;
    } catch (error) {
      const details = error?.response?.data || error.message;
      logger.error('[FluxAPI] Error while getting finetunes:', details);
      const errorMsg = `Failed to get finetunes: ${details}`;
      return this.isAgent ? this.returnValue([errorMsg, {}]) : new Error(errorMsg);
    }
  }

  async generateWithFinetune(data, useUltra = true) {
    if (!data.finetune_id) {
      throw new Error('Missing required field: finetune_id');
    }

    // Force the endpoint based on whether using ultra or pro
    data.endpoint = useUltra 
      ? '/v1/flux-pro-1.1-ultra-finetuned'
      : '/v1/flux-pro-finetuned';
    
    return this._call(data);
  }
}

module.exports = FluxAPI;