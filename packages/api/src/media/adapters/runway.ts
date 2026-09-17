import { z } from 'zod';
import { finished } from 'node:stream/promises';
import type { MediaConfig } from 'librechat-data-provider';
import type {
  MediaModelProfile,
  MediaProviderAdapter,
  MediaProviderContext,
  MediaProviderInput,
} from '../provider';
import {
  dataURI,
  decodeOperation,
  encodeOperation,
  nativeDownload,
  nativeRequest,
  providerOptions,
} from './native';
import { MediaProviderError } from '../errors';

const models = new Map([
  ['runway/gen-4.5', 'gen4.5'],
  ['runway/aleph-2', 'aleph2'],
]);
const ratios: Record<string, string> = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '4:3': '1104:832',
  '1:1': '960:960',
  '3:4': '832:1104',
  '21:9': '1584:672',
};

function catalog(config: MediaConfig): MediaModelProfile[] {
  return [...models].map(([modelId, model]) => ({
    modelId,
    modelName: model === 'aleph2' ? 'Runway Aleph 2' : 'Runway Gen 4.5',
    capabilities: [
      {
        operation: 'video.generate',
        workflow: model === 'aleph2' ? 'edit' : 'generate',
        inputs: {
          roles: model === 'aleph2' ? ['video', 'reference'] : ['start_frame'],
          requiredRoles: model === 'aleph2' ? ['video'] : [],
          min: model === 'aleph2' ? 1 : 0,
          max: Math.min(model === 'aleph2' ? 6 : 1, config.limits.maxInputs),
        },
        execution: { kind: 'remote-job', cancellation: 'unsupported' },
        controls: {
          count: { min: 1, max: 1 },
          seed: { min: 0, max: 4_294_967_295 },
          ...(model === 'aleph2'
            ? {
                aspectRatio: {
                  values: ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '21:9'],
                },
              }
            : {
                durationSeconds: {
                  min: 2,
                  max: 10,
                  default: 5,
                  values: Array.from({ length: 9 }, (_, i) => i + 2),
                },
                aspectRatio: { values: Object.keys(ratios), default: '16:9' },
              }),
          providerOptions: ['contentModeration'],
        },
      },
    ],
  }));
}

async function upload(input: MediaProviderInput, context: MediaProviderContext): Promise<string> {
  const uri = dataURI(input);
  if (uri.length <= 5_242_880) return uri;
  const extension = input.type === 'video/mp4' ? 'mp4' : input.type.split('/')[1];
  const filename = `input.${extension}`;
  const receipt = await context.transport.json(
    nativeRequest(context, 'uploads', JSON.stringify({ filename, type: 'ephemeral' })),
    z.object({
      uploadUrl: z.string().url(),
      fields: z.record(z.string()),
      runwayUri: z.string().regex(/^runway:\/\//),
    }),
  );
  const url = new URL(receipt.uploadUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new MediaProviderError('rejected');
  const form = new FormData();
  for (const [name, value] of Object.entries(receipt.fields)) form.set(name, value);
  form.set('file', new Blob([new Uint8Array(input.data)], { type: input.type }), filename);
  const response = await context.transport.stream({
    ...nativeRequest(context, '', form),
    url: url.href,
    headers: {},
  });
  await finished(response.resume());
  return receipt.runwayUri;
}

export function createRunwayMediaAdapters(): MediaProviderAdapter[] {
  return [
    {
      api: 'runway.videos',
      configuration: {
        baseURL: 'https://api.dev.runwayml.com/v1',
        headers: { 'X-Runway-Version': '2024-11-06' },
      },
      operations: ['video.generate'],
      catalog,
      download: nativeDownload,
      async submit(request, inputs, context) {
        const model = models.get(request.selection.modelId);
        if (
          request.operation !== 'video.generate' ||
          !model ||
          request.parameters.count !== 1 ||
          request.prompt.length > 1000
        )
          throw new MediaProviderError('rejected');
        const options = providerOptions(request, ['contentModeration']);
        const video = inputs.filter((input) => input.role === 'video');
        const references = inputs.filter((input) => input.role === 'reference');
        if (model === 'aleph2') {
          if (
            video.length !== 1 ||
            video[0].type !== 'video/mp4' ||
            references.length > 5 ||
            inputs.length !== video.length + references.length ||
            references.some((input) => !/^image\/(png|jpeg|webp)$/.test(input.type))
          )
            throw new MediaProviderError('rejected');
        } else if (
          inputs.length > 1 ||
          inputs.some(
            (input) => input.role !== 'start_frame' || !/^image\/(png|jpeg|webp)$/.test(input.type),
          ) ||
          (request.parameters.durationSeconds !== undefined &&
            (!Number.isInteger(request.parameters.durationSeconds) ||
              request.parameters.durationSeconds < 2 ||
              request.parameters.durationSeconds > 10)) ||
          (!inputs.length && !['16:9', '9:16'].includes(request.parameters.aspectRatio ?? '16:9'))
        )
          throw new MediaProviderError('rejected');
        const prepared = await Promise.all(
          inputs.map(async (input) => ({ role: input.role, uri: await upload(input, context) })),
        );
        const body =
          model === 'aleph2'
            ? {
                ...options,
                model,
                promptText: request.prompt,
                videoUri: prepared.find((input) => input.role === 'video')?.uri,
                keyframes: references.length
                  ? prepared
                      .filter((input) => input.role === 'reference')
                      .map((input, index) => ({
                        uri: input.uri,
                        at: references.length === 1 ? 0 : index / (references.length - 1),
                      }))
                  : undefined,
                targetAspectRatio: request.parameters.aspectRatio,
                seed: request.parameters.seed,
              }
            : {
                ...options,
                model,
                promptText: request.prompt,
                promptImage: prepared[0]?.uri,
                ratio: ratios[request.parameters.aspectRatio ?? '16:9'],
                duration: request.parameters.durationSeconds ?? 5,
                seed: request.parameters.seed,
              };
        const generatePath = inputs.length ? 'image_to_video' : 'text_to_video';
        const path = model === 'aleph2' ? 'video_to_video' : generatePath;
        const response = await context.transport.json(
          nativeRequest(context, path, JSON.stringify(body)),
          z.object({ id: z.string().min(1) }),
        );
        return {
          status: 'running',
          operationId: encodeOperation(
            { id: response.id, modelId: request.selection.modelId },
            context,
          ),
        };
      },
      async poll(operationId, context) {
        const operation = decodeOperation(operationId, context);
        if (!models.has(operation.modelId)) throw new MediaProviderError('uncertain');
        const response = await context.transport.json(
          nativeRequest(context, `tasks/${encodeURIComponent(operation.id)}`, undefined, true),
          z.object({
            id: z.string(),
            status: z.string(),
            progress: z.number().optional(),
            output: z.array(z.string().url()).max(context.config.limits.maxOutputs).optional(),
          }),
        );
        if (response.id !== operation.id) throw new MediaProviderError('uncertain');
        if (['PENDING', 'THROTTLED', 'RUNNING'].includes(response.status))
          return { status: 'running', operationId, progress: response.progress };
        if (response.status === 'FAILED') return { status: 'failed' };
        if (response.status === 'CANCELLED') return { status: 'cancelled' };
        if (response.status !== 'SUCCEEDED' || !response.output?.length)
          throw new MediaProviderError('uncertain');
        return {
          status: 'completed',
          parts: response.output.map((url, ordinal) => ({
            kind: 'video',
            ordinal,
            type: 'video/mp4',
            url,
          })),
        };
      },
    },
  ];
}
