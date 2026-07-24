import { randomUUID } from 'crypto';
import { tool } from '@librechat/agents/langchain/tools';
import { ContentTypes } from 'librechat-data-provider';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { AxiosInstance } from 'axios';
import { createAxiosInstance } from '~/utils/axios';
import { oaiToolkit } from './toolkits/oai';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const TERMINAL_FAILURE_STATUSES = new Set(['cancelled', 'failed']);

type VideoGenerationInput = {
  prompt: string;
  width?: number;
  height?: number;
  n_seconds?: number;
};

type SoraGeneration = {
  id: string;
};

type SoraJob = {
  id: string;
  status: string;
  failure_reason?: string;
  generations?: SoraGeneration[];
};

type GenerateSoraVideoOptions = {
  apiKey: string;
  apiVersion: string;
  baseURL: string;
  model: string;
  input: VideoGenerationInput;
  signal?: AbortSignal;
  client?: AxiosInstance;
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxVideoBytes?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

type CreateSoraVideoToolOptions = {
  VIDEO_GEN_OAI_API_KEY?: string;
  isAgent?: boolean;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? new Error('Video generation aborted'));
    };
    const complete = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    timeout = setTimeout(complete, milliseconds);
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '');
}

function isMP4(video: Buffer): boolean {
  if (video.length < 12 || video.toString('ascii', 4, 8) !== 'ftyp') {
    return false;
  }
  const boxSize = video.readUInt32BE(0);
  return boxSize >= 12 && boxSize <= video.length;
}

export async function generateSoraVideo({
  apiKey,
  apiVersion,
  baseURL,
  model,
  input,
  signal,
  client = createAxiosInstance(),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxVideoBytes = DEFAULT_MAX_VIDEO_BYTES,
  sleep = delay,
}: GenerateSoraVideoOptions): Promise<Buffer> {
  const endpoint = normalizeBaseURL(baseURL);
  const controller = new AbortController();
  const abortFromCaller = () =>
    controller.abort(signal?.reason ?? new Error('Video generation aborted'));
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = setTimeout(
    () => controller.abort(new Error('Sora video generation timed out')),
    timeoutMs,
  );
  const requestConfig = {
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    params: { 'api-version': apiVersion },
    signal: controller.signal,
  };
  try {
    const response = await client.post<SoraJob>(
      `${endpoint}/video/generations/jobs`,
      {
        model,
        prompt: input.prompt,
        width: String(input.width ?? 1920),
        height: String(input.height ?? 1080),
        n_seconds: String(input.n_seconds ?? 5),
        n_variants: '1',
      },
      requestConfig,
    );

    let job = response.data;
    while (job.status !== 'succeeded') {
      if (TERMINAL_FAILURE_STATUSES.has(job.status)) {
        throw new Error(job.failure_reason || `Sora video generation ${job.status}`);
      }
      await sleep(pollIntervalMs, controller.signal);
      const pollResponse = await client.get<SoraJob>(
        `${endpoint}/video/generations/jobs/${encodeURIComponent(job.id)}`,
        requestConfig,
      );
      job = pollResponse.data;
    }

    const generationId = job.generations?.[0]?.id;
    if (!generationId) {
      throw new Error('Sora completed without returning a video generation ID');
    }
    const videoResponse = await client.get<ArrayBuffer>(
      `${endpoint}/video/generations/${encodeURIComponent(generationId)}/content/video`,
      {
        ...requestConfig,
        responseType: 'arraybuffer',
        maxContentLength: maxVideoBytes,
        maxBodyLength: maxVideoBytes,
      },
    );
    const video = Buffer.from(videoResponse.data);
    if (video.length > maxVideoBytes) {
      throw new Error(`Generated video exceeds the ${maxVideoBytes}-byte size limit`);
    }
    if (!isMP4(video)) {
      throw new Error('Sora returned content that is not a valid MP4 video');
    }
    return video;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Sora video generation timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function createSoraVideoTool({
  VIDEO_GEN_OAI_API_KEY,
  isAgent,
}: CreateSoraVideoToolOptions = {}): DynamicStructuredTool {
  if (!isAgent) {
    throw new Error('This tool is only available for agents.');
  }
  const apiKey = VIDEO_GEN_OAI_API_KEY || process.env.VIDEO_GEN_OAI_API_KEY;
  const baseURL = process.env.VIDEO_GEN_OAI_BASEURL;
  const apiVersion = process.env.VIDEO_GEN_OAI_API_VERSION || 'preview';
  const model = process.env.VIDEO_GEN_OAI_MODEL || 'sora';
  if (!apiKey) {
    throw new Error('Missing VIDEO_GEN_OAI_API_KEY environment variable.');
  }
  if (!baseURL) {
    throw new Error('Missing VIDEO_GEN_OAI_BASEURL environment variable.');
  }

  return tool(async (input: VideoGenerationInput, runnableConfig) => {
    try {
      const video = await generateSoraVideo({
        apiKey,
        apiVersion,
        baseURL,
        model,
        input,
        signal: runnableConfig?.signal,
        pollIntervalMs: parsePositiveInteger(
          process.env.VIDEO_GEN_OAI_POLL_INTERVAL_MS,
          DEFAULT_POLL_INTERVAL_MS,
        ),
        timeoutMs: parsePositiveInteger(process.env.VIDEO_GEN_OAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        maxVideoBytes: parsePositiveInteger(
          process.env.VIDEO_GEN_OAI_MAX_SIZE_BYTES,
          DEFAULT_MAX_VIDEO_BYTES,
        ),
      });
      const fileId = randomUUID();
      return [
        `Video generation completed. The video will appear after secure storage succeeds.\n\ngenerated_video_id: "${fileId}"`,
        {
          content: [
            {
              type: ContentTypes.VIDEO_URL,
              video_url: { url: `data:video/mp4;base64,${video.toString('base64')}` },
            },
          ],
          file_ids: [fileId],
        },
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return [`Error: tool call failed: Video generation failed: ${message}`, {}];
    }
  }, oaiToolkit.video_gen_oai);
}
