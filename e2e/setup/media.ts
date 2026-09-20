/** One provider fixture serves the mock journey and the Studio Lighthouse scenario. */
export const mediaFixturePort = process.env.E2E_MEDIA_PORT || '8768';
export const mediaFixtureURL = `http://127.0.0.1:${mediaFixturePort}`;
export function mediaFixtureConfig(enabled = true) {
  return {
    enabled,
    integrations: enabled
      ? [
          {
            id: 'fixture-images',
            label: 'Local image fixture',
            api: 'openai.images',
            endpointRef: {
              kind: 'direct',
              apiKey: 'local-fixture-key',
              baseURL: `${mediaFixtureURL}/v1`,
            },
            catalog: { kind: 'configured', models: ['gpt-image-1'] },
            operations: ['image.generate', 'image.edit'],
          },
        ]
      : [],
    polling: { clientIntervalMs: 500, clientCatchUpIntervalMs: 1000 },
  };
}
