const axios = require('axios');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { Tool } = require('@librechat/agents/langchain/tools');
const {
  applyAxiosProxyConfig,
  createMinimalRetentionRequest,
  getHttpsProxyAgent,
} = require('@librechat/api');
const { FileContext, ContentTypes } = require('librechat-data-provider');

const DEFAULT_MODEL = 'bytedance/seedream-v5.0-pro';

const wavespeedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Text prompt describing the image to generate.',
    },
    model: {
      type: 'string',
      description: `WaveSpeed model ID to use for generation, e.g. "${DEFAULT_MODEL}". Defaults to "${DEFAULT_MODEL}" when omitted. Only set this when the user explicitly asks for a different WaveSpeed model.`,
    },
    size: {
      type: 'string',
      description:
        'Output image size as "width*height" in pixels, e.g. "2048*2048" or "1920*1080". Omit to use the model default.',
    },
  },
  required: ['prompt'],
};

const displayMessage =
  "WaveSpeed displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * WaveSpeedAPI - A tool for generating high-quality images from text prompts using the WaveSpeed AI API.
 * Submits a prediction, then polls until it reaches a terminal status.
 * Each call generates one image. If multiple images are needed, make multiple consecutive calls.
 */
class WaveSpeedAPI extends Tool {
  constructor(fields = {}) {
    super();

    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    this.tenantId = fields.req?.user?.tenantId;
    this.retentionRequest = createMinimalRetentionRequest(fields.req);
    this.fileStrategy = fields.fileStrategy;

    /** @type {boolean} **/
    this.isAgent = fields.isAgent;
    if (this.isAgent) {
      /** Ensures LangChain maps [content, artifact] tuple to ToolMessage fields instead of serializing it into content. */
      this.responseFormat = 'content_and_artifact';
    }
    this.returnMetadata = fields.returnMetadata ?? false;

    if (fields.processFileURL) {
      /** @type {processFileURL} Necessary for output to contain all image metadata. */
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.WAVESPEED_API_KEY || this.getApiKey();

    this.name = 'wavespeed';
    this.description =
      'Use WaveSpeed AI to generate images from text descriptions. Each call creates one image. For multiple images, make multiple consecutive calls.';

    this.description_for_model = `// Generate images from text prompts with WaveSpeed AI. Follow these rules:
    // 1. Prompts should be detailed and descriptive, covering subject, composition, lighting, mood, and style.
    // 2. Leave "model" unset unless the user explicitly requests a specific WaveSpeed model; the default ("${DEFAULT_MODEL}") is a high-quality general-purpose image model.
    // 3. "size" is "width*height" in pixels (e.g. "2048*2048"); omit it unless the user asks for specific dimensions or an aspect ratio.`;

    // Add base URL from environment variable with fallback
    this.baseUrl = process.env.WAVESPEED_API_BASE_URL || 'https://api.wavespeed.ai';

    this.schema = wavespeedJsonSchema;
  }

  static get jsonSchema() {
    return wavespeedJsonSchema;
  }

  getAxiosConfig() {
    const config = {};
    return applyAxiosProxyConfig(config, this.baseUrl);
  }

  /** @param {Object|string} value */
  getDetails(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  }

  getApiKey() {
    const apiKey = process.env.WAVESPEED_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing WAVESPEED_API_KEY environment variable.');
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
    const { prompt, model, size } = data;

    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    // Use provided API key for this request if available, otherwise use default
    const requestApiKey = this.apiKey || this.getApiKey();
    const modelId = model || DEFAULT_MODEL;

    const payload = { prompt };
    if (size) {
      payload.size = size;
    }

    const generateUrl = `${this.baseUrl}/api/v3/${modelId}`;

    logger.debug('[WaveSpeedAPI] Generating image with payload:', payload);
    logger.debug('[WaveSpeedAPI] Using model endpoint:', generateUrl);

    const headers = {
      Authorization: `Bearer ${requestApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let taskResponse;
    try {
      taskResponse = await axios.post(generateUrl, payload, {
        headers,
        ...this.getAxiosConfig(),
      });
    } catch (error) {
      const details = this.getDetails(error?.response?.data || error.message);
      logger.error('[WaveSpeedAPI] Error while submitting task:', details);

      return this.returnValue(
        `Something went wrong when trying to generate the image. The WaveSpeed API may be unavailable:
        Error Message: ${details}`,
      );
    }

    const taskId = taskResponse.data?.data?.id;
    if (!taskId) {
      logger.error('[WaveSpeedAPI] No prediction ID received from API:', taskResponse.data);
      return this.returnValue('No prediction ID received from the WaveSpeed API.');
    }

    const resultUrl = `${this.baseUrl}/api/v3/predictions/${taskId}/result`;

    // Polling for the result; predictions terminate as completed/failed/cancelled/timeout
    const pollIntervalMs = 1000;
    const maxAttempts = 600;
    let resultData = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const resultResponse = await axios.get(resultUrl, {
          headers: {
            Authorization: `Bearer ${requestApiKey}`,
            Accept: 'application/json',
          },
          ...this.getAxiosConfig(),
        });
        const prediction = resultResponse.data?.data;
        const status = prediction?.status;

        if (status === 'completed') {
          resultData = prediction;
          break;
        } else if (status === 'failed' || status === 'cancelled' || status === 'timeout') {
          logger.error('[WaveSpeedAPI] Error in task:', resultResponse.data);
          return this.returnValue(
            `An error occurred during image generation: prediction ${status}${
              prediction?.error ? ` - ${prediction.error}` : ''
            }`,
          );
        }
      } catch (error) {
        const details = this.getDetails(error?.response?.data || error.message);
        logger.error('[WaveSpeedAPI] Error while getting result:', details);
        return this.returnValue('An error occurred while retrieving the image.');
      }
    }

    // If no result data
    if (!resultData || !resultData.outputs || !resultData.outputs.length) {
      logger.error('[WaveSpeedAPI] No image data received from API. Response:', resultData);
      return this.returnValue('No image data received from the WaveSpeed API.');
    }

    // Try saving the image locally
    const imageUrl = resultData.outputs[0];
    const imageName = `img-${uuidv4()}.png`;

    if (this.isAgent) {
      try {
        // Fetch the image and convert to base64
        const fetchOptions = {};
        const agent = getHttpsProxyAgent(imageUrl);
        if (agent) {
          fetchOptions.agent = agent;
        }
        const imageResponse = await fetch(imageUrl, fetchOptions);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = imageResponse.headers?.get?.('content-type') || 'image/png';
        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
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
      logger.debug('[WaveSpeedAPI] Saving image:', imageUrl);
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: imageName,
        basePath: 'images',
        context: FileContext.image_generation,
        tenantId: this.tenantId,
        req: this.retentionRequest,
      });

      logger.debug('[WaveSpeedAPI] Image saved to path:', result.filepath);

      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = this.getDetails(error?.message ?? 'No additional error details.');
      logger.error('Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }
}

module.exports = WaveSpeedAPI;
