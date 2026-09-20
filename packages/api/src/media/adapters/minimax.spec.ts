import { mediaSubmissionRequestSchema, resolveMediaConfig } from 'librechat-data-provider';
import type { MediaProviderContext, MediaProviderInput } from '../provider';
import type { MediaTransportRequest } from '../transport';
import { createMinimaxMediaAdapters } from './minimax';

function fixture(modelId: string, input: MediaProviderInput) {
  const calls: MediaTransportRequest[] = [];
  const context: MediaProviderContext = {
    jobId: 'server-job',
    config: resolveMediaConfig(),
    signal: new AbortController().signal,
    connection: {
      id: 'minimax',
      api: 'minimax.videos',
      binding: 'account',
      baseURL: 'https://api.minimax.io',
      headers: { Authorization: 'Bearer provider-key' },
    },
    transport: {
      async json(request, schema) {
        calls.push(request);
        return schema.parse({ task_id: 'saved-task' });
      },
      async stream() {
        throw new Error('Input submission must not download output');
      },
    },
  };
  const request = mediaSubmissionRequestSchema.parse({
    clientRequestId: 'request',
    operation: 'video.generate',
    prompt: 'A sailboat reaching the final frame',
    selection: { connectionId: 'minimax', modelId, catalogVersion: 'catalog' },
    parameters: { durationSeconds: 5 },
    inputs: [{ role: input.role, file_id: input.file_id }],
  });
  return { calls, context, request, adapter: createMinimaxMediaAdapters()[0] };
}

describe('MiniMax native input parity', () => {
  it.each(['minimax/hailuo-3', 'minimax/hailuo-3-max'])(
    'submits the documented last-frame-only image mode for %s',
    async (modelId) => {
      const input: MediaProviderInput = {
        role: 'end_frame',
        file_id: 'owned-last-frame',
        type: 'image/png',
        data: Buffer.from('last-frame'),
      };
      const { calls, context, request, adapter } = fixture(modelId, input);
      await expect(adapter.submit(request, [input], context)).resolves.toMatchObject({
        status: 'running',
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://api.minimax.io/v2/video_generation');
      expect(JSON.parse(String(calls[0].body))).toMatchObject({
        content: [
          { type: 'text', text: request.prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${input.data.toString('base64')}` },
            role: 'last_frame',
          },
        ],
        ratio: 'adaptive',
      });
    },
  );

  it.each(['minimax/hailuo-3', 'minimax/hailuo-3-max'])(
    'rejects a generic WebM upload before provider work for %s',
    async (modelId) => {
      const input: MediaProviderInput = {
        role: 'video',
        file_id: 'owned-webm',
        type: 'video/webm',
        data: Buffer.from('webm'),
      };
      const { calls, context, request, adapter } = fixture(modelId, input);
      await expect(adapter.submit(request, [input], context)).rejects.toMatchObject({
        certainty: 'rejected',
      });
      expect(calls).toHaveLength(0);
    },
  );
});
