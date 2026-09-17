import { z } from 'zod';
import { Readable } from 'node:stream';
import type { MediaSubmissionRequest } from 'librechat-data-provider';
import type {
  MediaProviderContext,
  MediaProviderAdapter,
  MediaProviderInput,
  MediaProviderPart,
  MediaProviderResult,
} from '../provider';
import { mediaImageRouting, mediaVideoPolicySupported } from '../routing';
import { createVertexVideoAdapter } from './vertexVideo';
import { MediaProviderError } from '../errors';
import { mediaAPIURL } from '../provider';

const usageSchema = z
  .object({
    cost: z.number().nonnegative().optional(),
    prompt_tokens: z.number().nonnegative().optional(),
    completion_tokens: z.number().nonnegative().optional(),
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
  })
  .optional();

function requestOptions(context: MediaProviderContext, path: string) {
  return {
    url: mediaAPIURL(context.connection, path),
    headers: context.connection.headers,
    signal: context.signal,
    timeoutMs: context.config.timeouts.submitMs,
    maxBytes: context.config.transfers.maxImageBytes * context.config.limits.maxOutputs * 2,
  };
}

function asReference(input: MediaProviderInput) {
  return {
    type: 'image_url',
    image_url: { url: `data:${input.type};base64,${input.data.toString('base64')}` },
  };
}

function providerUsage(usage: z.infer<typeof usageSchema>) {
  if (!usage) {
    return undefined;
  }
  return {
    costUSD: usage.cost,
    inputTokens: usage.prompt_tokens ?? usage.input_tokens,
    outputTokens: usage.completion_tokens ?? usage.output_tokens,
  };
}

async function download(
  part: Extract<MediaProviderPart, { kind: 'image' | 'video' }>,
  context: MediaProviderContext,
): Promise<Readable> {
  if (part.data) {
    return Readable.from([part.data]);
  }
  if (!part.url) {
    throw new MediaProviderError('uncertain');
  }
  const url = new URL(part.url);
  const sameOrigin = url.origin === new URL(context.connection.baseURL).origin;
  return context.transport.stream({
    url: url.href,
    headers: sameOrigin ? context.connection.headers : {},
    signal: context.signal,
    timeoutMs: context.config.timeouts.downloadMs,
    maxBytes:
      part.kind === 'video'
        ? context.config.transfers.maxVideoBytes
        : context.config.transfers.maxImageBytes,
    maxRedirects: context.config.transfers.maxRedirects,
  });
}

async function submitImages(
  request: MediaSubmissionRequest,
  inputs: MediaProviderInput[],
  context: MediaProviderContext,
): Promise<MediaProviderResult> {
  if (request.operation === 'video.generate') {
    throw new MediaProviderError('rejected');
  }
  const parameters = request.parameters;
  const isRouter = context.connection.api === 'openrouter.images';
  const fields = {
    model: request.selection.modelId,
    prompt: request.prompt,
    n: parameters.count,
    size: parameters.size,
    quality: parameters.quality,
    output_format: parameters.format,
    background: parameters.background,
  };
  let body: string | FormData;
  let path: string;
  let headers = context.connection.headers;
  if (isRouter) {
    path = 'images';
    body = JSON.stringify({
      ...fields,
      aspect_ratio: parameters.aspectRatio,
      resolution: parameters.resolution,
      seed: parameters.seed,
      input_references: inputs.map(asReference),
      provider: mediaImageRouting(context.connection.routing, context.providerTag),
    });
    headers = { ...headers, 'Content-Type': 'application/json' };
  } else if (request.operation === 'image.edit') {
    path = 'images/edits';
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.set(key, String(value));
      }
    }
    for (const input of inputs) {
      form.append(
        input.role === 'mask' ? 'mask' : 'image[]',
        new Blob([new Uint8Array(input.data)], { type: input.type }),
        `${input.file_id}.${input.type.split('/')[1]}`,
      );
    }
    body = form;
  } else {
    path = 'images/generations';
    body = JSON.stringify(fields);
    headers = { ...headers, 'Content-Type': 'application/json' };
  }
  const result = await context.transport.json(
    {
      ...requestOptions(context, path),
      method: 'POST',
      headers,
      body,
    },
    z.object({
      data: z
        .array(
          z.object({
            b64_json: z.string().optional(),
            url: z.string().url().optional(),
            media_type: z.string().optional(),
            revised_prompt: z.string().optional(),
          }),
        )
        .min(1)
        .max(context.config.limits.maxOutputs),
      usage: usageSchema,
    }),
  );
  return {
    status: 'completed',
    usage: providerUsage(result.usage),
    parts: result.data.map((part, ordinal) => ({
      kind: 'image',
      ordinal,
      type: part.media_type ?? `image/${parameters.format ?? 'png'}`,
      data: part.b64_json ? Buffer.from(part.b64_json, 'base64') : undefined,
      url: part.url,
    })),
  };
}

async function submitGoogle(
  request: MediaSubmissionRequest,
  inputs: MediaProviderInput[],
  context: MediaProviderContext,
): Promise<MediaProviderResult> {
  if (request.operation === 'video.generate') {
    throw new MediaProviderError('rejected');
  }
  const userParts = (prompt: string, references: MediaProviderInput[]) => [
    { text: prompt },
    ...references.map((input) => ({
      inlineData: { mimeType: input.type, data: input.data.toString('base64') },
    })),
  ];
  const previous = context.continuation;
  if (previous && previous.parts.length > context.config.limits.maxNativeParts) {
    throw new MediaProviderError('rejected');
  }
  const history = previous
    ? [
        { role: 'user', parts: userParts(previous.prompt, previous.inputs) },
        {
          role: 'model',
          parts: previous.parts.map((part) => {
            if (part.kind === 'text') {
              return { text: part.text, thoughtSignature: part.thoughtSignature };
            }
            if (part.kind !== 'image' || !part.data) {
              throw new MediaProviderError('rejected');
            }
            return {
              inlineData: { mimeType: part.type, data: part.data.toString('base64') },
              thoughtSignature: part.thoughtSignature,
            };
          }),
        },
      ]
    : [];
  const result = await context.transport.json(
    {
      ...requestOptions(
        context,
        `models/${encodeURIComponent(request.selection.modelId)}:generateContent`,
      ),
      method: 'POST',
      headers: { ...context.connection.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [...history, { role: 'user', parts: userParts(request.prompt, inputs) }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: request.parameters.aspectRatio
            ? { aspectRatio: request.parameters.aspectRatio }
            : undefined,
        },
      }),
    },
    z.object({
      candidates: z
        .array(
          z.object({
            content: z
              .object({
                parts: z.array(
                  z.object({
                    text: z.string().optional(),
                    inlineData: z.object({ data: z.string(), mimeType: z.string() }).optional(),
                    thoughtSignature: z.string().optional(),
                    thought: z.boolean().optional(),
                  }),
                ),
              })
              .optional(),
          }),
        )
        .optional(),
      usageMetadata: z
        .object({
          promptTokenCount: z.number().optional(),
          candidatesTokenCount: z.number().optional(),
        })
        .optional(),
    }),
  );
  const parts: MediaProviderPart[] = [];
  let descriptorBytes = 0;
  let imageCount = 0;
  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.thought) {
        continue;
      }
      const bytes =
        Buffer.byteLength(part.text ?? '') + Buffer.byteLength(part.thoughtSignature ?? '');
      descriptorBytes += bytes;
      if (
        bytes > context.config.limits.maxNativePartBytes ||
        descriptorBytes > context.config.limits.maxNativeRecordingBytes
      ) {
        throw new MediaProviderError('uncertain');
      }
      if (part.text) {
        parts.push({
          kind: 'text',
          ordinal: parts.length,
          text: part.text,
          thoughtSignature: part.thoughtSignature,
        });
      }
      if (part.inlineData) {
        imageCount++;
        parts.push({
          kind: 'image',
          ordinal: parts.length,
          type: part.inlineData.mimeType,
          data: Buffer.from(part.inlineData.data, 'base64'),
          thoughtSignature: part.thoughtSignature,
        });
      }
      if (
        parts.length > context.config.limits.maxNativeParts ||
        imageCount > context.config.limits.maxOutputs
      ) {
        throw new MediaProviderError('uncertain');
      }
    }
  }
  if (parts.length === 0) {
    return { status: 'failed' };
  }
  return {
    status: 'completed',
    parts,
    usage: {
      inputTokens: result.usageMetadata?.promptTokenCount,
      outputTokens: result.usageMetadata?.candidatesTokenCount,
    },
  };
}

const videoResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  progress: z.number().optional(),
  unsigned_urls: z.array(z.string().url()).optional(),
  usage: usageSchema,
});

function videoResult(
  response: z.infer<typeof videoResponseSchema>,
  context: MediaProviderContext,
): MediaProviderResult {
  if (response.status === 'failed' || response.status === 'expired') {
    return { status: 'failed', usage: providerUsage(response.usage) };
  }
  if (response.status === 'cancelled') {
    return { status: 'cancelled', usage: providerUsage(response.usage) };
  }
  if (response.status !== 'completed') {
    return { status: 'running', operationId: response.id, progress: response.progress };
  }
  const outputs = response.unsigned_urls?.length ?? 1;
  if (outputs > context.config.limits.maxOutputs) {
    throw new MediaProviderError('uncertain');
  }
  return {
    status: 'completed',
    usage: providerUsage(response.usage),
    parts: Array.from({ length: outputs }, (_, ordinal) => ({
      kind: 'video',
      ordinal,
      type: 'video/mp4',
      url: mediaAPIURL(
        context.connection,
        `videos/${encodeURIComponent(response.id)}/content${
          context.connection.api === 'openrouter.videos' ? `?index=${ordinal}` : ''
        }`,
      ),
    })),
  };
}

async function submitVideo(
  request: MediaSubmissionRequest,
  inputs: MediaProviderInput[],
  context: MediaProviderContext,
): Promise<MediaProviderResult> {
  if (request.operation !== 'video.generate') {
    throw new MediaProviderError('rejected');
  }
  let body: string | FormData;
  let headers = context.connection.headers;
  if (context.connection.api === 'openrouter.videos') {
    if (!mediaVideoPolicySupported(context.connection.routing)) {
      throw new MediaProviderError('rejected');
    }
    body = JSON.stringify({
      model: request.selection.modelId,
      prompt: request.prompt,
      duration: request.parameters.durationSeconds,
      aspect_ratio: request.parameters.aspectRatio,
      resolution: request.parameters.resolution,
      generate_audio: request.parameters.audio,
      seed: request.parameters.seed,
      input_references: inputs.filter((input) => input.role === 'reference').map(asReference),
      frame_images: inputs
        .filter((input) => input.role === 'start_frame' || input.role === 'end_frame')
        .map((input) => ({
          ...asReference(input),
          frame_type: input.role === 'start_frame' ? 'first_frame' : 'last_frame',
        })),
    });
    headers = { ...headers, 'Content-Type': 'application/json' };
  } else {
    const form = new FormData();
    form.set('model', request.selection.modelId);
    form.set('prompt', request.prompt);
    if (request.parameters.durationSeconds != null) {
      form.set('seconds', String(request.parameters.durationSeconds));
    }
    if (request.parameters.resolution) {
      form.set('size', request.parameters.resolution);
    }
    if (inputs[0]) {
      form.set(
        'input_reference',
        new Blob([new Uint8Array(inputs[0].data)], { type: inputs[0].type }),
        'reference.png',
      );
    }
    body = form;
  }
  const result = await context.transport.json(
    {
      ...requestOptions(context, 'videos'),
      method: 'POST',
      headers,
      body,
    },
    videoResponseSchema,
  );
  return videoResult(result, context);
}

async function poll(
  operationId: string,
  context: MediaProviderContext,
): Promise<MediaProviderResult> {
  const result = await context.transport.json(
    {
      ...requestOptions(context, `videos/${encodeURIComponent(operationId)}`),
      timeoutMs: context.config.timeouts.pollRequestMs,
      maxBytes: context.config.catalog.maxResponseBytes,
    },
    videoResponseSchema,
  );
  return videoResult(result, context);
}

export function createRESTMediaAdapters(): MediaProviderAdapter[] {
  return [
    createVertexVideoAdapter(),
    {
      api: 'openrouter.images',
      operations: ['image.generate', 'image.edit'],
      submit: submitImages,
      download,
    },
    {
      api: 'openai.images',
      operations: ['image.generate', 'image.edit'],
      submit: submitImages,
      download,
    },
    {
      api: 'google.generateContent',
      operations: ['image.generate', 'image.edit'],
      submit: submitGoogle,
      download,
    },
    {
      api: 'openrouter.videos',
      operations: ['video.generate'],
      submit: submitVideo,
      poll,
      download,
    },
    { api: 'openai.videos', operations: ['video.generate'], submit: submitVideo, poll, download },
  ];
}
