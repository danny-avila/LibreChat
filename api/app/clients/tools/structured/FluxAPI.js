// FluxAPI.js

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('~/config');
const { FileContext } = require('librechat-data-provider');
const { processFileURL } = require('~/server/services/Files/process');

class FluxAPI extends Tool {
  constructor(fields) {
    super();

    /** @type {Express.Request | undefined} Express Request object, only provided by ToolService */
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    /** @type {boolean} Necessary for output to contain all image metadata. */
    this.returnMetadata = fields.returnMetadata ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.name = 'flux';
    this.apiKey = fields.FLUX_API_KEY || this.getApiKey();
    this.description =
      "Use Flux to generate images from text descriptions. This tool is exclusively for visual content.";
    this.description_for_model = `// Use Flux to generate images from text descriptions.
    // Guidelines:
    // - Provide a detailed and vivid prompt for the image you want to generate. But don't change it if the user asks you not to.
    // - After the image is generated tell the user the prompt you used to generate the image.
    // - Include parameters for image width and height if necessary (default width: 1024, height: 768).
    // - Visually describe the moods, details, structures, styles, and proportions of the image.
    // - Craft your input by "showing" and not "telling" the imagery.
    // - Generate images only once per human query unless explicitly requested by the user.
    // - Output in PNG format by default.
    // - Default to the endpoint /v1/flux-pro unless the user says otherwise
    // - Upsample if the user says so
    // - **When using this tool, do not include the generated image or its URL in your text response to the user.**
    // - **Simply acknowledge that the image has been generated.**  

    // Available endpoints:
     - /v1/flux-pro-1.1
     - /v1/flux-pro
     - /v1/flux-dev
     - /v1/flux-pro-1.1-ultra
    `;

    // Define the schema for structured input
    this.schema = z.object({
      prompt: z.string().describe('Text prompt for image generation.'),
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
      seed: z.number().optional().describe('Optional seed for reproducibility.'),
      safety_tolerance: z
        .number()
        .optional()
        .describe(
          'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.'
        ),
      output_format: z
        .string()
        .optional()
        .describe('Output format for the generated image. Can be "jpeg" or "png".'),
      endpoint: z
      .string()
      .optional()
      .describe('Endpoint to use for image generation. Default is /v1/flux-pro.'),
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
    return `![generated image](${imageUrl})`;
  }

  async _call(data) {
    const baseUrl = 'https://api.bfl.ml';
    const {
      prompt,
      width = 1024,
      height = 768,
      prompt_upsampling = false,
      seed = null,
      safety_tolerance = 2,
      output_format = 'png',
      endpoint = '/v1/flux-pro', // Default endpoint if none is provided
    } = data;
  
    // Use the endpoint variable to construct generateUrl
    const generateUrl = `${baseUrl}${endpoint}`;
    const resultUrl = `${baseUrl}/v1/get_result`;
  
    const payload = {
      prompt,
      width,
      height,
      prompt_upsampling,
      seed,
      safety_tolerance,
      output_format,
    };

    const headers = {
      'x-key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json', // Ensure the API returns JSON
    };

    let taskResponse;
    try {
      taskResponse = await axios.post(generateUrl, payload, { headers });
    } catch (error) {
      logger.error(
        '[FluxAPI] Error while submitting task:',
        error.response ? error.response.data : error.message
      );
      return 'Error submitting task to Flux API.';
    }

    const taskId = taskResponse.data.id;

    // Polling for the result
    let status = 'Pending';
    let resultData = null;
    while (status !== 'Ready' && status !== 'Error') {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before polling again
        const resultResponse = await axios.get(resultUrl, {
          headers,
          params: { id: taskId },
        });
        status = resultResponse.data.status;

        // Log the resultResponse.data for debugging
        console.log('Result Response Data:', resultResponse.data);

        if (status === 'Ready') {
          resultData = resultResponse.data.result;
          break;
        } else if (status === 'Error') {
          logger.error('[FluxAPI] Error in task:', resultResponse.data);
          return 'Error occurred during image generation.';
        }
      } catch (error) {
        logger.error(
          '[FluxAPI] Error while getting result:',
          error.response ? error.response.data : error.message
        );
        return 'Error getting result from Flux API.';
      }
    }

    // Handle the result
    if (!resultData || !resultData.sample) {
      logger.error('[FluxAPI] No image data received from API. Response:', resultData);
      return 'No image data received from Flux API.';
    }

    const imageUrl = resultData.sample;
    const imageName = `img-${uuidv4()}.png`;

    try {
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
      });

      if (this.returnMetadata) {
        this.result = result;
      } else {
        this.result = this.wrapInMarkdown(result.filepath);
      }
    } catch (error) {
      logger.error('Error while saving the image:', error);
      this.result = `Failed to save the image locally. ${error.message}`;
    }


    return this.result;
  }
}

module.exports = FluxAPI;
