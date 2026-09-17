import { z } from 'zod';
import type { MediaConfig, MediaNumberControl } from 'librechat-data-provider';
import type {
  MediaModelProfile,
  MediaProviderAdapter,
  MediaProviderResult,
  MediaProviderInput,
} from '../provider';
import {
  nativeRequest,
  nativeDownload,
  providerOptions,
  encodeOperation,
  decodeOperation,
} from './native';
import { MediaProviderError } from '../errors';

const models = new Map([
  ['kwaivgi/kling-v3.0-pro', 'Kling v3.0 Pro'],
  ['kwaivgi/kling-v3.0-std', 'Kling v3.0 Standard'],
  ['kwaivgi/kling-video-o1', 'Kling Video O1'],
  ['alibaba/wan-2.7', 'Wan 2.7'],
  ['alibaba/wan-2.6', 'Wan 2.6'],
]);
const klingOptions = [
  'cfg_scale',
  'multi_shot',
  'shot_type',
  'multi_prompt',
  'elements',
  'resolution',
];
const wanOptions = ['prompt_extend'];
const wanLegacyOptions = ['enable_prompt_expansion', 'shot_type'];
const ratios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
const sizes: Record<string, Record<string, string>> = {
  '720p': {
    '16:9': '1280*720',
    '9:16': '720*1280',
    '1:1': '960*960',
    '4:3': '1088*832',
    '3:4': '832*1088',
  },
  '1080p': {
    '16:9': '1920*1080',
    '9:16': '1080*1920',
    '1:1': '1440*1440',
    '4:3': '1632*1248',
    '3:4': '1248*1632',
  },
};
const prediction = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  outputs: z.array(z.string().url()).optional(),
});
const predictionResponse = z.union([z.object({ data: prediction }), prediction]);
const shots = z
  .array(
    z
      .object({
        index: z.number().int().min(1),
        prompt: z.string().max(512),
        duration: z.string().regex(/^\d+$/),
      })
      .strict(),
  )
  .min(1)
  .max(6);

function optionNames(model: string): string[] {
  if (model.startsWith('alibaba/')) return model.endsWith('2.6') ? wanLegacyOptions : wanOptions;
  if (model.endsWith('-o1')) return [];
  return klingOptions;
}

function profiles(config: MediaConfig): MediaModelProfile[] {
  return [...models].map(([modelId, modelName]) => {
    const wan = modelId.startsWith('alibaba/');
    const legacy = modelId.endsWith('2.6');
    const o1 = modelId.endsWith('-o1');
    let roles: MediaProviderInput['role'][] = ['start_frame', 'end_frame'];
    if (wan)
      roles = legacy ? ['start_frame', 'audio'] : ['start_frame', 'end_frame', 'video', 'audio'];
    let durationSeconds: MediaNumberControl = { min: wan ? 2 : 3, max: 15, default: 5 };
    if (legacy) durationSeconds = { min: 5, max: 15, values: [5, 10, 15], default: 5 };
    if (o1) durationSeconds = { min: 5, max: 10, values: [5, 10], default: 5 };
    const options = optionNames(modelId);
    return {
      modelId,
      modelName,
      capabilities: [
        {
          operation: 'video.generate',
          inputs: {
            roles,
            min: 0,
            max: Math.min(roles.length, config.limits.maxInputs),
          },
          execution: { kind: 'remote-job', cancellation: 'unsupported' },
          controls: {
            count: { min: 1, max: 1, default: 1 },
            durationSeconds,
            aspectRatio: { values: wan ? ratios : ['16:9', '9:16', '1:1'], default: '16:9' },
            ...(wan
              ? {
                  resolution: {
                    values: legacy ? ['720p', '1080p'] : ['720P', '1080P'],
                    default: legacy ? '720p' : '720P',
                  },
                  seed: { min: 0, max: 2_147_483_647 },
                }
              : {}),
            ...((!wan && !o1) || legacy ? { audio: true } : {}),
            ...(o1 ? {} : { negativePrompt: true }),
            providerOptions: options.length ? options : undefined,
          },
        },
      ],
    };
  });
}

export function createAtlasMediaAdapters(): MediaProviderAdapter[] {
  return [
    {
      api: 'atlas.videos',
      configuration: { baseURL: 'https://api.atlascloud.ai/api/v1' },
      catalog: profiles,
      operations: ['video.generate'],
      download: nativeDownload,
      async submit(request, inputs, context): Promise<MediaProviderResult> {
        const model = request.selection.modelId;
        if (!models.has(model) || request.operation !== 'video.generate')
          throw new MediaProviderError('rejected');
        const wan = model.startsWith('alibaba/');
        const legacy = model.endsWith('2.6');
        const o1 = model.endsWith('-o1');
        const options = providerOptions(request, optionNames(model));
        const start = inputs.find((input) => input.role === 'start_frame');
        const end = inputs.find((input) => input.role === 'end_frame');
        const video = inputs.find((input) => input.role === 'video');
        const audio = inputs.find((input) => input.role === 'audio');
        if (
          inputs.some((input) => input.role === 'reference' || input.role === 'mask') ||
          new Set(inputs.map((input) => input.role)).size !== inputs.length ||
          (!wan && (video || audio)) ||
          (legacy && (video || end)) ||
          (end && !start && !video) ||
          (start && video) ||
          (!wan && request.prompt.length > 2500) ||
          (wan &&
            !legacy &&
            (request.prompt.length > 5000 ||
              (request.parameters.negativePrompt?.length ?? 0) > 500)) ||
          (wan && !legacy && audio && video) ||
          (!start && (options.resolution !== undefined || options.elements !== undefined)) ||
          (legacy && options.shot_type === 'multi' && options.enable_prompt_expansion === false)
        )
          throw new MediaProviderError('rejected');
        if (options.multi_shot === true) {
          if (options.shot_type !== 'customize' && options.shot_type !== 'intelligence')
            throw new MediaProviderError('rejected');
          if (options.shot_type === 'customize') {
            const parsed = shots.safeParse(options.multi_prompt);
            if (
              !parsed.success ||
              parsed.data.some((shot) => Number(shot.duration) < 1) ||
              parsed.data.reduce((sum, shot) => sum + Number(shot.duration), 0) !==
                (request.parameters.durationSeconds ?? 5)
            )
              throw new MediaProviderError('rejected');
          }
        }
        const upload = async (input: MediaProviderInput | undefined) => {
          if (!input) return undefined;
          const form = new FormData();
          form.set(
            'file',
            new Blob([new Uint8Array(input.data)], { type: input.type }),
            `${input.file_id}.${input.type.split('/')[1]}`,
          );
          const result = await context.transport.json(
            nativeRequest(context, 'model/uploadMedia', form),
            z.object({ url: z.string().url() }),
          );
          return result.url;
        };
        const [image, last, videoURL, audioURL] = await Promise.all([
          upload(start),
          upload(end),
          upload(video),
          upload(audio),
        ]);
        const imageMode = Boolean(image || videoURL);
        const parameters = request.parameters;
        const body: Record<string, unknown> = {
          ...options,
          model: `${model}/${imageMode ? 'image-to-video' : 'text-to-video'}`,
          prompt: request.prompt,
          image,
          duration: parameters.durationSeconds,
        };
        if (wan) {
          Object.assign(body, {
            negative_prompt: parameters.negativePrompt,
            audio: audioURL,
            seed: parameters.seed,
          });
          if (legacy) {
            body.generate_audio = parameters.audio;
            if (imageMode) body.resolution = parameters.resolution ?? '720p';
            else
              body.size =
                sizes[parameters.resolution ?? '720p']?.[parameters.aspectRatio ?? '16:9'];
          } else {
            Object.assign(body, {
              last_image: last,
              video: videoURL,
              resolution: parameters.resolution ?? '720P',
              ratio: imageMode ? undefined : parameters.aspectRatio,
            });
          }
        } else if (o1) {
          Object.assign(body, { last_image: last, aspect_ratio: parameters.aspectRatio });
        } else {
          Object.assign(body, {
            end_image: last,
            sound: parameters.audio,
            negative_prompt: parameters.negativePrompt,
            aspect_ratio: imageMode ? undefined : parameters.aspectRatio,
          });
        }
        const response = await context.transport.json(
          nativeRequest(context, 'model/generateVideo', JSON.stringify(body)),
          predictionResponse,
        );
        const result = 'data' in response ? response.data : response;
        return {
          status: 'running',
          operationId: encodeOperation({ id: result.id, modelId: model }, context),
        };
      },
      async poll(operationId, context): Promise<MediaProviderResult> {
        const operation = decodeOperation(operationId, context);
        if (!models.has(operation.modelId)) throw new MediaProviderError('uncertain');
        const response = await context.transport.json(
          nativeRequest(
            context,
            `model/prediction/${encodeURIComponent(operation.id)}`,
            undefined,
            true,
          ),
          predictionResponse,
        );
        const result = 'data' in response ? response.data : response;
        if (result.id !== operation.id) throw new MediaProviderError('uncertain');
        if (result.status === 'failed') return { status: 'failed' };
        if (['created', 'processing', 'queued', 'running', 'pending'].includes(result.status ?? ''))
          return { status: 'running', operationId };
        if (
          !['completed', 'succeeded'].includes(result.status ?? '') ||
          !result.outputs?.length ||
          result.outputs.length > context.config.limits.maxOutputs
        )
          throw new MediaProviderError('uncertain');
        return {
          status: 'completed',
          parts: result.outputs.map((url, ordinal) => ({
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
