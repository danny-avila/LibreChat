import { mediaSubmissionRequestSchema, resolveMediaConfig } from 'librechat-data-provider';
import type { MediaVideoParameters } from 'librechat-data-provider';
import type { MediaProviderAdapter, MediaProviderInput } from '../provider';
import { validateMediaOffering } from '../catalog';
import { createRESTMediaAdapters } from './rest';

describe('provider conditional admission', () => {
  const config = resolveMediaConfig();
  const cases: Array<{
    api: MediaProviderAdapter['api'];
    model: string;
    parameters: Partial<MediaVideoParameters>;
    reference?: boolean;
  }> = [
    { api: 'runway.videos', model: 'runway/gen-4.5', parameters: { aspectRatio: '1:1' } },
    {
      api: 'minimax.videos',
      model: 'minimax/hailuo-2.3',
      parameters: { durationSeconds: 10, resolution: '1080P' },
    },
    {
      api: 'google.vertex.videos',
      model: 'google/veo-3.1',
      parameters: { durationSeconds: 4 },
      reference: true,
    },
    { api: 'heygen.videos', model: 'heygen/avatar-iv', parameters: {}, reference: true },
  ];
  it.each(cases)(
    'rejects $model unsupported settings before admission and provider dispatch',
    async ({ api, model, parameters, reference }) => {
      const adapter = createRESTMediaAdapters().find((candidate) => candidate.api === api)!;
      const profile = adapter.catalog!(config).find((candidate) => candidate.modelId === model)!;
      const inputs: MediaProviderInput[] = reference
        ? [{ role: 'reference', file_id: 'image', type: 'image/png', data: Buffer.from('image') }]
        : [];
      const request = mediaSubmissionRequestSchema.parse({
        clientRequestId: 'request',
        operation: 'video.generate',
        prompt: 'A forest',
        parameters,
        inputs: inputs.map(({ role, file_id }) => ({ role, file_id })),
        selection: { connectionId: 'native', modelId: model, catalogVersion: 'catalog' },
      });
      expect(() =>
        validateMediaOffering(
          request,
          { ...profile, api, connectionId: 'native', connectionName: 'Native', available: true },
          config.limits,
        ),
      ).toThrow();
      const json = jest.fn(async () => {
        throw new Error('Provider must not be contacted');
      });
      await expect(
        adapter.submit(request, inputs, {
          jobId: 'server-job',
          config,
          signal: new AbortController().signal,
          connection: {
            id: 'native',
            api,
            binding: 'account',
            baseURL: 'https://provider.example/v1',
            headers: {},
          },
          transport: {
            json,
            stream: async () => {
              throw new Error('Download must not run');
            },
          },
        }),
      ).rejects.toMatchObject({ certainty: 'rejected' });
      expect(json).not.toHaveBeenCalled();
    },
  );
});
