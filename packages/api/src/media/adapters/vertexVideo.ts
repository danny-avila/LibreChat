import { z } from 'zod';
import { Readable } from 'node:stream';
import type { MediaCapability, MediaConfig } from 'librechat-data-provider';
import type { MediaProviderAdapter, MediaProviderContext, MediaProviderResult } from '../provider';
import { MediaProviderError } from '../errors';
import { mediaAPIURL } from '../provider';

/** Protocol limits for the documented GA Veo 3.1 text-to-video models. */
const models = new Map([
  ['veo-3.1-fast-generate-001', 'Veo 3.1 Fast'],
  ['veo-3.1-generate-001', 'Veo 3.1'],
]);

export function vertexVideoModelName(modelId: string): string | undefined {
  return models.get(modelId);
}

export function vertexVideoCapabilities(modelId: string, config: MediaConfig): MediaCapability[] {
  if (!vertexVideoModelName(modelId)) return [];
  return [
    {
      operation: 'video.generate',
      inputs: { roles: [], min: 0, max: 0 },
      execution: { kind: 'remote-job', cancellation: 'unsupported' },
      controls: {
        count: { min: 1, max: Math.min(4, config.limits.maxOutputs) },
        durationSeconds: { min: 4, max: 8, values: [4, 6, 8], default: 4 },
        resolution: { values: ['720p', '1080p'], default: '720p' },
        aspectRatio: { values: ['16:9', '9:16'], default: '16:9' },
        audio: true,
        seed: { min: 0, max: 4_294_967_295 },
      },
    },
  ];
}

function operationModel(operation: string, context: MediaProviderContext): string {
  const root = new URL(mediaAPIURL(context.connection, 'models/')).pathname;
  if (!root.startsWith('/v1/projects/')) throw new MediaProviderError('uncertain');
  const prefix = root.slice('/v1/'.length);
  const [model, id, extra] = operation.slice(prefix.length).split('/operations/');
  if (
    !operation.startsWith(prefix) ||
    extra !== undefined ||
    !vertexVideoModelName(model) ||
    !id ||
    !/^[A-Za-z0-9_-]+$/.test(id)
  ) {
    throw new MediaProviderError('uncertain');
  }
  return model;
}

function options(context: MediaProviderContext, path: string) {
  return {
    url: mediaAPIURL(context.connection, path),
    method: 'POST' as const,
    headers: { ...context.connection.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
    timeoutMs: context.config.timeouts.submitMs,
    maxBytes: context.config.catalog.maxResponseBytes,
  };
}

export function createVertexVideoAdapter(): MediaProviderAdapter {
  return {
    api: 'google.vertex.videos',
    operations: ['video.generate'],
    async submit(request, inputs, context): Promise<MediaProviderResult> {
      const model = request.selection.modelId;
      if (request.operation !== 'video.generate' || inputs.length || !vertexVideoModelName(model)) {
        throw new MediaProviderError('rejected');
      }
      const parameters = request.parameters;
      const response = await context.transport.json(
        {
          ...options(context, `models/${encodeURIComponent(model)}:predictLongRunning`),
          body: JSON.stringify({
            instances: [{ prompt: request.prompt }],
            parameters: {
              sampleCount: parameters.count,
              durationSeconds: parameters.durationSeconds ?? 4,
              aspectRatio: parameters.aspectRatio ?? '16:9',
              resolution: parameters.resolution ?? '720p',
              generateAudio: parameters.audio ?? false,
              seed: parameters.seed,
            },
          }),
        },
        z.object({ name: z.string().min(1) }),
      );
      if (operationModel(response.name, context) !== model) {
        throw new MediaProviderError('uncertain');
      }
      // Persist the operation before fetching bytes, even if generation already finished.
      return { status: 'running', operationId: response.name };
    },
    async poll(operationId, context): Promise<MediaProviderResult> {
      const model = operationModel(operationId, context);
      const maxVideoBytes = context.config.transfers.maxVideoBytes;
      const maxEncodedBytes = Math.ceil(maxVideoBytes / 3) * 4;
      const maxOutputs = Math.min(4, context.config.limits.maxOutputs);
      const response = await context.transport.json(
        {
          ...options(context, `models/${encodeURIComponent(model)}:fetchPredictOperation`),
          body: JSON.stringify({ operationName: operationId }),
          timeoutMs: context.config.timeouts.pollRequestMs,
          maxBytes: maxEncodedBytes * maxOutputs + context.config.catalog.maxResponseBytes,
        },
        z.object({
          name: z.string().min(1),
          done: z.boolean().optional(),
          error: z.object({ code: z.number(), message: z.string().optional() }).optional(),
          response: z
            .object({
              raiMediaFilteredCount: z.number().int().nonnegative().optional(),
              videos: z
                .array(
                  z.object({
                    mimeType: z.literal('video/mp4'),
                    bytesBase64Encoded: z.string().min(1).max(maxEncodedBytes),
                  }),
                )
                .max(maxOutputs)
                .optional(),
            })
            .optional(),
        }),
      );
      if (response.name !== operationId) throw new MediaProviderError('uncertain');
      if (!response.done) return { status: 'running', operationId };
      if (response.error) return { status: 'failed' };
      if (!response.response) throw new MediaProviderError('uncertain');
      const videos = response.response.videos ?? [];
      if (!videos.length) {
        if (response.response.raiMediaFilteredCount) return { status: 'failed' };
        throw new MediaProviderError('uncertain');
      }
      return {
        status: 'completed',
        parts: videos.map((video, ordinal) => {
          const encoded = video.bytesBase64Encoded;
          if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
            throw new MediaProviderError('uncertain');
          }
          const data = Buffer.from(encoded, 'base64');
          if (!data.length || data.length > maxVideoBytes)
            throw new MediaProviderError('uncertain');
          return { kind: 'video', ordinal, type: video.mimeType, data };
        }),
      };
    },
    async download(part) {
      if (!part.data) throw new MediaProviderError('uncertain');
      return Readable.from([part.data]);
    },
  };
}
