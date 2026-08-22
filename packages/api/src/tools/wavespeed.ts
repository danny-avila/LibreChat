import { randomUUID } from 'crypto';
import axios from 'axios';
import fetch from 'node-fetch';
import { logger } from '@librechat/data-schemas';
import { StructuredTool } from '@librechat/agents/langchain/tools';
import { FileContext, ContentTypes } from 'librechat-data-provider';

import type { AxiosRequestConfig } from 'axios';
import type { RequestInit } from 'node-fetch';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedJsonSchema } from '~/tools/registry/schema';
import type { RetentionRequest } from '~/files/retention';

import { applyAxiosProxyConfig, getHttpsProxyAgent } from '~/utils/proxy';
import { createMinimalRetentionRequest } from '~/files/retention';
import { waveSpeedSchema } from '~/tools/registry/definitions';

export const WAVESPEED_DEFAULT_MODEL = 'bytedance/seedream-v5.0-pro';

/** Model ids are slash-separated slugs, e.g. `wavespeed-ai/flux-dev`. */
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

/** Documented as "width*height" in pixels. */
const SIZE_PATTERN = /^[1-9]\d{1,4}\*[1-9]\d{1,4}$/;

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 600;

const displayMessage =
  "WaveSpeed displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

export type WaveSpeedToolInput = {
  prompt: string;
  model?: string;
  size?: string;
};

export type ProcessFileURL = (params: {
  fileStrategy?: string;
  userId?: string;
  URL: string;
  fileName: string;
  basePath: string;
  context: FileContext;
  tenantId?: string;
  req?: RetentionRequest;
}) => Promise<TFile>;

export type WaveSpeedToolFields = {
  /** Initializes the tool without the credentials it would otherwise require. */
  override?: boolean;
  userId?: string;
  req?: RetentionRequest | null;
  fileStrategy?: string;
  isAgent?: boolean;
  returnMetadata?: boolean;
  processFileURL?: ProcessFileURL;
  WAVESPEED_API_KEY?: string;
};

type WaveSpeedPrediction = {
  id?: string;
  status?: string;
  error?: string;
  outputs?: string[];
};

type WaveSpeedEnvelope = {
  data?: WaveSpeedPrediction;
};

type ImageArtifact = {
  content: Array<{
    type: (typeof ContentTypes)['IMAGE_URL'];
    image_url: { url: string };
  }>;
};

type TextResponse = Array<{
  type: (typeof ContentTypes)['TEXT'];
  text: string;
}>;

type WaveSpeedToolOutput = string | TFile | [string | TextResponse, ImageArtifact | object];

const getDetails = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
};

/**
 * Narrows an unknown thrown value to the parts this tool reports on. Axios
 * rejections carry the upstream body, which is far more useful than `message`.
 */
const describeError = (error: unknown): string => {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (response?.data != null) {
    return getDetails(response.data);
  }
  return getDetails((error as Error)?.message ?? 'No additional error details.');
};

/**
 * Generates images from text prompts with the WaveSpeed AI API by submitting a
 * prediction and polling until it reaches a terminal status. Each call
 * generates one image; multiple images require multiple consecutive calls.
 *
 * Extends `StructuredTool` rather than `Tool` because the tool takes an object
 * input described by a JSON schema, which is what `StructuredTool` is typed for.
 */
export class WaveSpeedAPI extends StructuredTool<ExtendedJsonSchema> {
  static lc_name(): string {
    return 'WaveSpeedAPI';
  }

  name = 'wavespeed';
  description =
    'Use WaveSpeed AI to generate images from text descriptions. Each call creates one image. For multiple images, make multiple consecutive calls.';

  description_for_model = `// Generate images from text prompts with WaveSpeed AI. Follow these rules:
    // 1. Prompts should be detailed and descriptive, covering subject, composition, lighting, mood, and style.
    // 2. Leave "model" unset unless the user explicitly requests a specific WaveSpeed model; the default ("${WAVESPEED_DEFAULT_MODEL}") is a high-quality general-purpose image model.
    // 3. "size" is "width*height" in pixels (e.g. "2048*2048"); omit it unless the user asks for specific dimensions or an aspect ratio.`;

  schema: ExtendedJsonSchema = waveSpeedSchema;

  override: boolean;
  userId?: string;
  tenantId?: string;
  retentionRequest?: RetentionRequest;
  fileStrategy?: string;
  isAgent?: boolean;
  returnMetadata: boolean;
  processFileURL?: ProcessFileURL;
  apiKey: string;
  baseUrl: string;
  result?: string | TFile;

  constructor(fields: WaveSpeedToolFields = {}) {
    super();

    this.override = fields.override ?? false;
    this.userId = fields.userId;
    this.tenantId = fields.req?.user?.tenantId;
    this.retentionRequest = createMinimalRetentionRequest(fields.req);
    this.fileStrategy = fields.fileStrategy;

    this.isAgent = fields.isAgent;
    if (this.isAgent) {
      /** Ensures LangChain maps [content, artifact] tuple to ToolMessage fields instead of serializing it into content. */
      this.responseFormat = 'content_and_artifact';
    }
    this.returnMetadata = fields.returnMetadata ?? false;

    if (fields.processFileURL) {
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.apiKey = fields.WAVESPEED_API_KEY || this.getApiKey();
    this.baseUrl = process.env.WAVESPEED_API_BASE_URL || 'https://api.wavespeed.ai';
  }

  static get jsonSchema(): ExtendedJsonSchema {
    return waveSpeedSchema;
  }

  getAxiosConfig(): AxiosRequestConfig {
    return applyAxiosProxyConfig({}, this.baseUrl);
  }

  getDetails(value: unknown): string {
    return getDetails(value);
  }

  getApiKey(): string {
    const apiKey = process.env.WAVESPEED_API_KEY || '';
    if (!apiKey && !this.override) {
      throw new Error('Missing WAVESPEED_API_KEY environment variable.');
    }
    return apiKey;
  }

  wrapInMarkdown(imageUrl: string): string {
    const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    return `![generated image](${serverDomain}${imageUrl})`;
  }

  returnValue(value: string | TFile): WaveSpeedToolOutput {
    if (this.isAgent !== true) {
      return value;
    }
    if (typeof value === 'string') {
      return [value, {}];
    }
    return [displayMessage, value as unknown as ImageArtifact];
  }

  protected async _call(data: WaveSpeedToolInput): Promise<WaveSpeedToolOutput> {
    const { prompt, model, size } = data;

    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    const requestApiKey = this.apiKey || this.getApiKey();
    const modelId = model || WAVESPEED_DEFAULT_MODEL;

    /**
     * `model` is tool input and is interpolated into the request path, so a
     * crafted value could reach unintended WaveSpeed routes with the caller's
     * API key. Model ids are slash-separated slugs (`wavespeed-ai/flux-dev`),
     * so anything outside that shape is rejected rather than escaped.
     */
    if (!MODEL_ID_PATTERN.test(modelId)) {
      throw new Error(
        `Invalid model id: ${modelId}. Expected a WaveSpeed model id such as "${WAVESPEED_DEFAULT_MODEL}".`,
      );
    }

    const payload: { prompt: string; size?: string } = { prompt };
    if (size) {
      if (!SIZE_PATTERN.test(size)) {
        throw new Error(
          `Invalid size: ${size}. Expected "width*height" in pixels, e.g. "2048*2048".`,
        );
      }
      payload.size = size;
    }

    const generateUrl = `${this.baseUrl}/api/v3/${modelId}`;

    logger.debug('[WaveSpeedAPI] Generating image with payload:', payload);
    logger.debug('[WaveSpeedAPI] Using model endpoint:', generateUrl);

    let taskResponse;
    try {
      taskResponse = await axios.post<WaveSpeedEnvelope>(generateUrl, payload, {
        headers: {
          Authorization: `Bearer ${requestApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...this.getAxiosConfig(),
      });
    } catch (error) {
      const details = describeError(error);
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

    let resultData: WaveSpeedPrediction | null = null;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const resultResponse = await axios.get<WaveSpeedEnvelope>(resultUrl, {
          headers: {
            Authorization: `Bearer ${requestApiKey}`,
            Accept: 'application/json',
          },
          ...this.getAxiosConfig(),
        });
        const prediction = resultResponse.data?.data;
        const status = prediction?.status;

        if (status === 'completed') {
          resultData = prediction ?? null;
          break;
        }
        if (status === 'failed' || status === 'cancelled' || status === 'timeout') {
          logger.error('[WaveSpeedAPI] Error in task:', resultResponse.data);
          return this.returnValue(
            `An error occurred during image generation: prediction ${status}${
              prediction?.error ? ` - ${prediction.error}` : ''
            }`,
          );
        }
      } catch (error) {
        logger.error('[WaveSpeedAPI] Error while getting result:', describeError(error));
        return this.returnValue('An error occurred while retrieving the image.');
      }
    }

    /**
     * Exhausting the poll loop is a timeout, not a missing-output error; the
     * job may well still be running. Reporting it as "no image data" sends the
     * model down the wrong path.
     */
    if (!resultData) {
      logger.error('[WaveSpeedAPI] Timed out waiting for the prediction to finish.');
      return this.returnValue(
        'Timed out waiting for the WaveSpeed prediction to finish. The job may still be running; please try again.',
      );
    }

    if (!resultData.outputs || !resultData.outputs.length) {
      logger.error('[WaveSpeedAPI] No image data received from API. Response:', resultData);
      return this.returnValue('No image data received from the WaveSpeed API.');
    }

    const imageUrl = resultData.outputs[0];

    if (this.isAgent) {
      return this.encodeForAgent(imageUrl);
    }

    return this.saveImage(imageUrl);
  }

  private async encodeForAgent(imageUrl: string): Promise<WaveSpeedToolOutput> {
    try {
      const fetchOptions: RequestInit = {};
      const agent = getHttpsProxyAgent(imageUrl);
      if (agent) {
        fetchOptions.agent = agent;
      }
      const imageResponse = await fetch(imageUrl, fetchOptions);
      /**
       * fetch resolves on 4xx/5xx, so an expired signed URL would otherwise be
       * base64-encoded and handed back as an IMAGE_URL artifact — the model
       * would be told an image was displayed while the user sees an encoded
       * error page.
       */
      if (!imageResponse.ok) {
        logger.error(
          `[WaveSpeedAPI] Failed to download the generated image: HTTP ${imageResponse.status}`,
        );
        return this.returnValue('Failed to download the generated image.');
      }
      const contentType = imageResponse.headers?.get?.('content-type') || '';
      if (contentType && !contentType.startsWith('image/')) {
        logger.error(`[WaveSpeedAPI] Expected an image but received "${contentType}".`);
        return this.returnValue('Failed to download the generated image.');
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = contentType || 'image/png';

      const artifact: ImageArtifact = {
        content: [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      };
      const response: TextResponse = [{ type: ContentTypes.TEXT, text: displayMessage }];
      return [response, artifact];
    } catch (error) {
      logger.error('Error processing image for agent:', error);
      return this.returnValue(`Failed to process the image. ${(error as Error)?.message}`);
    }
  }

  private async saveImage(imageUrl: string): Promise<WaveSpeedToolOutput> {
    if (!this.processFileURL) {
      logger.error('[WaveSpeedAPI] No processFileURL handler configured.');
      return this.returnValue('Failed to save the image locally.');
    }

    try {
      logger.debug('[WaveSpeedAPI] Saving image:', imageUrl);
      const result = await this.processFileURL({
        fileStrategy: this.fileStrategy,
        userId: this.userId,
        URL: imageUrl,
        fileName: `img-${randomUUID()}.png`,
        basePath: 'images',
        context: FileContext.image_generation,
        tenantId: this.tenantId,
        req: this.retentionRequest,
      });

      logger.debug('[WaveSpeedAPI] Image saved to path:', result.filepath);

      this.result = this.returnMetadata ? result : this.wrapInMarkdown(result.filepath);
      return this.returnValue(this.result);
    } catch (error) {
      const details = getDetails((error as Error)?.message ?? 'No additional error details.');
      logger.error('Error while saving the image:', details);
      return this.returnValue(`Failed to save the image locally. ${details}`);
    }
  }
}
