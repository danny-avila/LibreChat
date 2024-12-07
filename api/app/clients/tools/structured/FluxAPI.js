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

    this.override = fields.override ?? false;
    this.returnMetadata = fields.returnMetadata ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;

    if (fields.processFileURL) {
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.name = 'flux';
    this.apiKey = fields.FLUX_API_KEY || this.getApiKey();
    this.description =
      "Use Flux to generate images from text descriptions. This tool is exclusively for visual content.";
      this.description_for_model = `// Use Flux to generate images from text descriptions.
      // Guidelines:
      // - Provide a detailed and vivid prompt for the image you want to generate, but don't change it if the user asks you not to.
      // - Include parameters for image width and height if necessary (default width: 1024, height: 768).
      // - Visually describe the moods, details, structures, styles, and proportions of the image.
      // - Craft your input by "showing" and not "telling" the imagery.
      // - Generate images only once per human query unless explicitly requested by the user.
      // - If the user requests multiple images, set the 'number_of_images' parameter to the desired number (up to 24).
      // - Output in PNG format by default.
      // - Default to the endpoint /v1/flux-pro-1.1 unless the user says otherwise.
      // - Upsample if the user says so.
      // - **Include the generated image(s) in your text response to the user by embedding the Markdown links.**
      // - **Include the prompt you created for flux in your response so the user can see what you generated.**
      
      /* Available endpoints:
       - /v1/flux-pro-1.1
       - /v1/flux-pro
       - /v1/flux-dev
       - /v1/flux-pro-1.1-ultra
      */
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
      output_format: z
        .string()
        .optional()
        .describe('Output format for the generated image. Can be "jpeg" or "png".'),
      endpoint: z
        .string()
        .optional()
        .describe('Endpoint to use for image generation. Default is /v1/flux-pro.'),
      number_of_images: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe('Number of images to generate, up to a maximum of 24. Default is 1.'),
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
      steps = 40,
      prompt_upsampling = false,
      seed = null,
      safety_tolerance = 2,
      output_format = 'png',
      endpoint = '/v1/flux-pro',
      number_of_images = 1,
    } = data;

    const generateUrl = `${baseUrl}${endpoint}`;
    const resultUrl = `${baseUrl}/v1/get_result`;

    const payload = {
      prompt,
      width,
      height,
      steps,
      prompt_upsampling,
      seed,
      safety_tolerance,
      output_format,
    };

    const headers = {
      'x-key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const totalImages = Math.min(Math.max(number_of_images, 1), 24);

    const imageResults = [];

    for (let i = 0; i < totalImages; i++) {
      let taskResponse;
      try {
        taskResponse = await axios.post(generateUrl, payload, { headers });
      } catch (error) {
        logger.error(
          '[FluxAPI] Error while submitting task:',
          error.response ? error.response.data : error.message
        );
        imageResults.push('Error submitting task to Flux API.');
        continue;
      }

      const taskId = taskResponse.data.id;

      // Polling for the result
      let status = 'Pending';
      let resultData = null;
      while (status !== 'Ready' && status !== 'Error') {
        try {
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
            imageResults.push('Error occurred during image generation.');
            break;
          }
        } catch (error) {
          logger.error(
            '[FluxAPI] Error while getting result:',
            error.response ? error.response.data : error.message
          );
          imageResults.push('Error getting result from Flux API.');
          break;
        }
      }

      if (!resultData || !resultData.sample) {
        logger.error('[FluxAPI] No image data received from API. Response:', resultData);
        imageResults.push('No image data received from Flux API.');
        continue;
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
          imageResults.push(result);
        } else {
          const markdownImage = this.wrapInMarkdown(result.filepath);
          imageResults.push(markdownImage);
        }
      } catch (error) {
        logger.error('Error while saving the image:', error);
        imageResults.push(`Failed to save the image locally. ${error.message}`);
      }
    } // End of loop

    if (this.returnMetadata) {
      this.result = imageResults;
    } else {
      // Join the markdown image links with double newlines for better spacing
      this.result = imageResults.join('\n\n');
    }

    return this.result;
  }
}

module.exports = FluxAPI;