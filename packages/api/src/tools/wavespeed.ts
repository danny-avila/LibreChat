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
/** Per-request timeout so a hung socket cannot block the tool forever. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Submit gets more headroom: a timeout here is an ambiguous outcome (the task may exist). */
const SUBMIT_TIMEOUT_MS = 60_000;
/** Consecutive transient poll failures tolerated before giving up on a status check. */
const POLL_TRANSIENT_RETRIES = 5;
const POLL_RETRY_BASE_MS = 1500;
const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'ERR_NETWORK',
]);
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'timeout', 'deleted']);

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

/** Resolves true after `ms`, or false early if `signal` aborts. */
const sleep = (ms: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

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

const getHttpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

/** Transient = worth retrying a read-only status check: 429/5xx or a network-level failure. */
const isTransientPollError = (error: unknown): boolean => {
  const status = getHttpStatus(error);
  if (status != null) {
    return TRANSIENT_HTTP_STATUS.has(status);
  }
  const code = (error as { code?: string })?.code;
  /** No HTTP response and no recognised code: the request got nothing back, treat as network. */
  return code != null ? TRANSIENT_NETWORK_CODES.has(code) : true;
};

/** The submit may have reached WaveSpeed: no response at all, or a 5xx. */
const isAmbiguousSubmitError = (error: unknown): boolean => {
  const status = getHttpStatus(error);
  return status == null || status >= 500;
};

/**
 * Generates images from text prompts with the WaveSpeed AI API by submitting a
 * prediction and polling until it reaches a terminal status. Each call
 * generates one image; multiple images require multiple consecutive calls.
 * The submit is single-shot and never retried automatically (a retry could
 * create a second paid task); only the read-only status poll retries.
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
    'Use WaveSpeed AI to generate images from text descriptions. Each call creates one image. For multiple images, make multiple consecutive calls. Never call again just to retry a failed or unknown-outcome call: a task may already exist and be charged.';

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

  protected async _call(
    data: WaveSpeedToolInput,
    _runManager?: unknown,
    parentConfig?: { signal?: AbortSignal },
  ): Promise<WaveSpeedToolOutput> {
    const signal = parentConfig?.signal;
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
        timeout: SUBMIT_TIMEOUT_MS,
        ...this.getAxiosConfig(),
      });
    } catch (error) {
      const details = describeError(error);
      logger.error('[WaveSpeedAPI] Error while submitting task:', details);

      if (isAmbiguousSubmitError(error)) {
        return this.returnValue(
          `Submission outcome unknown: the task may already exist and be charged. Do NOT retry automatically; ask the user to check their recent WaveSpeed predictions first.
        Error Message: ${details}`,
        );
      }
      return this.returnValue(
        `Something went wrong when trying to generate the image. The WaveSpeed API rejected the request and no task was created. Do not retry unless the cause below is fixed:
        Error Message: ${details}`,
      );
    }

    const taskId = taskResponse.data?.data?.id;
    if (!taskId) {
      logger.error('[WaveSpeedAPI] No prediction ID received from API:', taskResponse.data);
      return this.returnValue(
        'No prediction ID received from the WaveSpeed API. Submission outcome unknown: the task may already exist and be charged. Do NOT retry automatically; ask the user to check their recent WaveSpeed predictions first.',
      );
    }

    const resultUrl = `${this.baseUrl}/api/v3/predictions/${taskId}/result`;

    /**
     * No overall attempt cap: tasks can legitimately run for hours. The loop
     * ends on a terminal status, a non-retryable poll failure, or the caller
     * aborting the run.
     */
    let resultData: WaveSpeedPrediction | null = null;
    while (!resultData) {
      if (!(await sleep(POLL_INTERVAL_MS, signal))) {
        return this.abortedValue(taskId);
      }

      let resultResponse;
      try {
        resultResponse = await this.fetchResultWithRetry(resultUrl, requestApiKey, signal);
      } catch (error) {
        if (signal?.aborted) {
          return this.abortedValue(taskId);
        }
        const details = describeError(error);
        logger.error(`[WaveSpeedAPI] Error while getting result for task ${taskId}:`, details);
        return this.returnValue(
          `Status check failed for WaveSpeed task ${taskId}: the task may still be running and may be charged. Do NOT resubmit; ask the user to check this task id in their WaveSpeed predictions.
        Error Message: ${details}`,
        );
      }

      const prediction = resultResponse.data?.data;
      const status = prediction?.status;

      if (status === 'completed') {
        resultData = prediction ?? {};
      } else if (status != null && TERMINAL_FAILURE_STATUSES.has(status)) {
        logger.error('[WaveSpeedAPI] Error in task:', resultResponse.data);
        return this.returnValue(
          `An error occurred during image generation (task ${taskId}): prediction ${status}${
            prediction?.error ? ` - ${prediction.error}` : ''
          }`,
        );
      }
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

  /**
   * Read-only status poll. Tolerates transient 429/5xx and network errors with
   * linear backoff; anything else (401, 404, ...) fails immediately.
   */
  private async fetchResultWithRetry(resultUrl: string, apiKey: string, signal?: AbortSignal) {
    for (let retry = 0; ; retry++) {
      try {
        return await axios.get<WaveSpeedEnvelope>(resultUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          timeout: REQUEST_TIMEOUT_MS,
          signal,
          ...this.getAxiosConfig(),
        });
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        if (retry >= POLL_TRANSIENT_RETRIES || !isTransientPollError(error)) {
          throw error;
        }
        logger.warn(
          `[WaveSpeedAPI] Transient poll error (retry ${retry + 1}/${POLL_TRANSIENT_RETRIES}):`,
          describeError(error),
        );
        if (!(await sleep(POLL_RETRY_BASE_MS * (retry + 1), signal))) {
          throw error;
        }
      }
    }
  }

  private abortedValue(taskId: string): WaveSpeedToolOutput {
    logger.warn(`[WaveSpeedAPI] Polling for task ${taskId} stopped: the run was aborted.`);
    return this.returnValue(
      `Stopped waiting for WaveSpeed task ${taskId} because the run was cancelled. The task may still be running and may be charged. Do NOT resubmit; ask the user to check this task id in their WaveSpeed predictions.`,
    );
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
