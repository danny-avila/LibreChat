import {
  resolveMediaConfig,
  mediaConfigSchema,
  mediaSubmissionRequestSchema,
  createMediaSubmissionSchema,
  createMediaImportSchema,
  mediaImportReceiptSchema,
  mediaSubmissionReceiptSchema,
  mediaStartupConfigSchema,
  mediaNumberControlSchema,
  mediaThreadListRequestSchema,
  mediaOptionValueSchema,
  mediaInputSchema,
  mediaURLUploadRequestSchema,
  mediaCatalogSchema,
  mediaUserKeySchema,
} from './index';
import { PermissionTypes, Permissions, permissionsSchema } from '../permissions';
import { configSchema, BASE_ONLY_CONFIG_SECTIONS } from '../config';
import { roleDefaults, SystemRoles } from '../roles';
import * as endpoints from '../api-endpoints';

const integration = {
  id: 'router',
  api: 'openrouter.images' as const,
  endpointRef: { kind: 'custom' as const, name: 'OpenRouter' },
  catalog: { kind: 'configured' as const, models: ['publisher/model'] },
  operations: ['image.generate' as const, 'image.edit' as const],
};
const submission = {
  clientRequestId: 'request-1',
  selection: { connectionId: 'router', modelId: 'publisher/model', catalogVersion: 'opaque-token' },
  operation: 'image.generate' as const,
  prompt: 'A lake at dawn',
};

describe('media configuration compatibility', () => {
  it('accepts explicit provider exclusions without changing existing integration defaults', () => {
    const config = resolveMediaConfig({
      enabled: true,
      integrations: [
        integration,
        { ...integration, id: 'visible', enabled: true },
        { ...integration, id: 'hidden', enabled: false },
      ],
    });
    expect(config.integrations.map((entry) => entry.enabled)).toEqual([undefined, true, false]);
    expect(configSchema.parse({ version: '1.3.1', media: config }).media).toEqual(config);
    expect(
      resolveMediaConfig({ enabled: true, integrations: [{ ...integration, enabled: false }] })
        .integrations[0].enabled,
    ).toBe(false);
    expect(
      mediaConfigSchema.safeParse({ integrations: [{ ...integration, enabled: 'false' }] }).success,
    ).toBe(false);
  });

  it('publishes only explicit user-key setup instructions without requiring model discovery', () => {
    const catalog = {
      schemaVersion: 1,
      version: 'catalog-version',
      offerings: [],
      limits: {},
      clientPollIntervalMs: 5_000,
      clientCatchUpIntervalMs: 30_000,
      integrations: [
        {
          connectionId: 'router',
          connectionName: 'OpenRouter',
          api: 'openrouter.images',
          available: false,
          unavailableReason: 'credentials_required',
          userKey: { keyName: 'My OpenRouter', encoding: 'apiKey', userProvideURL: false },
        },
      ],
    };
    expect(mediaCatalogSchema.parse(catalog).integrations?.[0].userKey).toEqual(
      catalog.integrations[0].userKey,
    );
    const { userKey: _userKey, ...managed } = catalog.integrations[0];
    expect(
      mediaCatalogSchema.parse({ ...catalog, integrations: [managed] }).integrations?.[0].userKey,
    ).toBeUndefined();
    for (const secretField of ['apiKey', 'baseURL', 'headers', 'options', 'value']) {
      expect(
        mediaUserKeySchema.safeParse({
          ...catalog.integrations[0].userKey,
          [secretField]: 'private',
        }).success,
      ).toBe(false);
    }
    expect(mediaUserKeySchema.safeParse({ keyName: '', encoding: 'raw' }).success).toBe(false);
  });

  it('keeps personal credentials an explicit YAML choice and lets image/video share a saved key', () => {
    const config = resolveMediaConfig({
      integrations: [
        {
          ...integration,
          endpointRef: {
            kind: 'direct',
            apiKey: 'user_provided',
            baseURL: 'user_provided',
            credentialName: 'router-account',
          },
        },
        {
          ...integration,
          id: 'router-videos',
          api: 'openrouter.videos',
          operations: ['video.generate'],
          endpointRef: {
            kind: 'direct',
            apiKey: 'user_provided',
            credentialName: 'router-account',
          },
        },
      ],
    });
    expect(config.integrations[0].endpointRef).toMatchObject({
      apiKey: 'user_provided',
      baseURL: 'user_provided',
      credentialName: 'router-account',
    });
    expect(config.integrations[1].endpointRef).toMatchObject({ credentialName: 'router-account' });
  });

  it('accepts hosted audio/video sources while rejecting credentials, fragments and non-HTTPS URLs', () => {
    const url = 'https://media.example/reference.mp4?signature=opaque';
    expect(mediaURLUploadRequestSchema.parse({ url, role: 'video' })).toEqual({
      url,
      role: 'video',
    });
    expect(
      mediaInputSchema.parse({ role: 'audio', file_id: 'owned-file', sourceURL: url }).sourceURL,
    ).toBe(url);
    for (const invalid of [
      'not-a-url',
      'http://media.example/video',
      'https://user:secret@media.example/video',
      'https://media.example/video#fragment',
      'data:video/mp4;base64,AA==',
    ]) {
      expect(mediaURLUploadRequestSchema.safeParse({ url: invalid, role: 'video' }).success).toBe(
        false,
      );
    }
    expect(
      mediaInputSchema.safeParse({ role: 'reference', file_id: 'image', sourceURL: url }).success,
    ).toBe(false);
    expect(mediaURLUploadRequestSchema.safeParse({ url, role: 'reference' }).success).toBe(false);
  });

  it('supports opt-in full discovery and direct provider credentials without changing curated defaults', () => {
    const config = resolveMediaConfig({
      enabled: true,
      integrations: [
        {
          ...integration,
          api: 'bfl.images',
          endpointRef: { kind: 'direct', apiKey: '${BFL_API_KEY}' },
          catalog: {
            kind: 'discovered',
            allModels: true,
            excludeModels: ['black-forest-labs/flux.2-max'],
          },
        },
      ],
    });
    expect(config.integrations[0].catalog).toEqual({
      kind: 'discovered',
      allModels: true,
      allowModels: [],
      excludeModels: ['black-forest-labs/flux.2-max'],
    });
    expect(
      resolveMediaConfig({ integrations: [{ ...integration, catalog: { kind: 'discovered' } }] })
        .integrations[0].catalog,
    ).toEqual({ kind: 'discovered', allModels: false, allowModels: [], excludeModels: [] });
  });

  it('validates deep provider JSON without recursive parsing and rejects non-JSON/cyclic values', () => {
    let value: object = {};
    for (let i = 0; i < 10_000; i++) value = { nested: value };
    expect(mediaOptionValueSchema.safeParse(value).success).toBe(true);
    const circular: { self?: object } = {};
    circular.self = circular;
    expect(mediaOptionValueSchema.safeParse(circular).success).toBe(false);
    expect(mediaOptionValueSchema.safeParse({ seed: NaN }).success).toBe(false);
    expect(mediaOptionValueSchema.safeParse({ date: new Date() }).success).toBe(false);
  });
  it('leaves absent YAML disabled and materializes nested defaults only on resolution', () => {
    const before = configSchema.parse({ version: '1.3.1' });
    expect(before.media).toBeUndefined();
    const resolved = resolveMediaConfig(before.media);
    expect(resolved.enabled).toBe(false);
    expect(resolved.integrations).toEqual([]);
    expect(resolved.polling.clientIntervalMs).toBe(5_000);
    expect(resolved.polling.clientCatchUpIntervalMs).toBe(30_000);
    expect(BASE_ONLY_CONFIG_SECTIONS).toContain('media');
  });

  it('parses partial nested config and keeps ordinary defaults', () => {
    const config = mediaConfigSchema.parse({
      enabled: true,
      integrations: [integration],
      worker: { tickMs: 2_000 },
    });
    expect(config.worker.tickMs).toBe(2_000);
    expect(config.worker.leaseMs).toBe(60_000);
    expect(config.assets).toEqual({
      source: null,
      retention: 'inherit',
      orphanRetentionMs: 86_400_000,
    });
    expect(config.integrations[0].billing).toBeUndefined();
  });

  it.each([
    { enabled: true },
    { integrations: [integration, integration] },
    { worker: { leaseMs: 1_000, renewEveryMs: 1_000 } },
    { execution: { maxActiveTotal: 1 } },
    { polling: { clientIntervalMs: 60_000, clientCatchUpIntervalMs: 30_000 } },
    { limits: { pageSize: 101, maxPageSize: 100 } },
    { limits: { maxNativeParts: 4_097 } },
    { limits: { maxNativeRecordingBytes: 4_194_305 } },
    { transfers: { arbitrary: 'ignored' } },
    { integrations: [{ ...integration, api: 'openrouter.videos' }] },
    { integrations: [{ ...integration, billing: { estimatedCostUSD: 1 } }] },
  ])('fails closed for invalid config %j', (config) => {
    expect(mediaConfigSchema.safeParse(config).success).toBe(false);
  });

  it('defaults new permissions off for both roles and preserves explicit denial', () => {
    for (const role of [SystemRoles.USER, SystemRoles.ADMIN]) {
      expect(roleDefaults[role].permissions[PermissionTypes.MEDIA]).toEqual({
        USE: false,
        CREATE: false,
      });
    }
    const parsed = permissionsSchema.parse({
      ...roleDefaults[SystemRoles.USER].permissions,
      [PermissionTypes.MEDIA]: { [Permissions.USE]: true, [Permissions.CREATE]: false },
    });
    expect(parsed[PermissionTypes.MEDIA]).toEqual({ USE: true, CREATE: false });
  });

  it('configures Vertex separately from API-key and OpenRouter credentials', () => {
    const config = mediaConfigSchema.parse({
      integrations: [
        {
          id: 'vertex-video',
          api: 'google.vertex.videos',
          endpointRef: { kind: 'vertex', keyFile: '${GOOGLE_SERVICE_KEY_FILE}' },
          catalog: { kind: 'configured', models: ['veo-3.1-fast-generate-001'] },
          operations: ['video.generate'],
        },
      ],
    });
    expect(config.integrations[0].endpointRef).toEqual({
      kind: 'vertex',
      keyFile: '${GOOGLE_SERVICE_KEY_FILE}',
      location: 'us-central1',
    });
    expect(configSchema.parse({ version: '1.3.1', media: config }).media).toEqual(config);
  });

  it.each([
    { api: 'google.vertex.videos', endpointRef: { kind: 'custom', name: 'OpenRouter' } },
    { api: 'openrouter.videos', endpointRef: { kind: 'vertex', keyFile: 'auth.json' } },
    { endpointRef: { kind: 'vertex', keyFile: '' } },
    { endpointRef: { kind: 'vertex', keyFile: 'auth.json', location: 'bad/region' } },
    { catalog: { kind: 'discovered', allowModels: ['veo-3.1-fast-generate-001'] } },
    { operations: ['image.generate'] },
  ])('rejects incompatible Vertex configuration %j', (override) => {
    expect(
      mediaConfigSchema.safeParse({
        integrations: [
          {
            id: 'vertex-video',
            api: 'google.vertex.videos',
            endpointRef: { kind: 'vertex', keyFile: 'auth.json' },
            catalog: { kind: 'configured', models: ['veo-3.1-fast-generate-001'] },
            operations: ['video.generate'],
            ...override,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('media command contracts', () => {
  it('preserves exact custom credential names in lookup and revoke URLs', () => {
    const name = 'Media / Team & Labs?#';
    const lookup = new URL(endpoints.userKeyQuery(name), 'http://localhost');
    expect(lookup.searchParams.get('name')).toBe(name);
    expect(Array.from(lookup.searchParams.keys())).toEqual(['name']);
    const removal = new URL(endpoints.revokeUserKey(name), 'http://localhost');
    expect(decodeURIComponent(removal.pathname.split('/').pop()!)).toBe(name);
    expect(removal.search).toBe('');
    expect(removal.hash).toBe('');
  });

  it('opts into gallery activity over HTTP while leaving legacy requests unchanged', () => {
    const params = {
      include: 'activity' as const,
      filter: 'completed' as const,
      cursor: 'page/next',
    };
    const url = new URL(endpoints.mediaThreads(params), 'http://localhost');
    expect(mediaThreadListRequestSchema.parse(Object.fromEntries(url.searchParams))).toEqual(
      params,
    );
    expect(new URL(endpoints.mediaThreads(), 'http://localhost').searchParams.has('include')).toBe(
      false,
    );
  });

  it('canonicalizes omitted version, inputs and parameters', () => {
    expect(mediaSubmissionRequestSchema.parse(submission)).toMatchObject({
      schemaVersion: 1,
      inputs: [],
      parameters: { count: 1 },
    });
  });

  it('keeps provider image resolution distinct from pixel size', () => {
    expect(
      mediaSubmissionRequestSchema.parse({ ...submission, parameters: { resolution: '2K' } })
        .parameters,
    ).toEqual({ count: 1, resolution: '2K' });
  });

  it.each([
    { ...submission, apiKey: 'secret' },
    { ...submission, parameters: { addParams: { model: 'other-model' } } },
    { ...submission, operation: 'image.edit', inputs: [] },
    { ...submission, parentTurnId: 'turn-without-thread' },
    { ...submission, inputs: [{ role: 'video', file_id: 'file-1' }] },
    { ...submission, operation: 'video.generate', parameters: { background: 'transparent' } },
  ])('rejects invalid or untyped input %j', (request) => {
    expect(mediaSubmissionRequestSchema.safeParse(request).success).toBe(false);
  });

  it('enforces configured prompt/input/output/import bounds', () => {
    const limits = { maxPromptChars: 5, maxTitleChars: 5, maxInputs: 1, maxOutputs: 1 };
    const schema = createMediaSubmissionSchema(limits);
    expect(schema.safeParse(submission).success).toBe(false);
    expect(
      schema.safeParse({ ...submission, prompt: 'lake', parameters: { count: 2 } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...submission,
        prompt: 'lake',
        inputs: [
          { role: 'reference', file_id: 'a' },
          { role: 'reference', file_id: 'b' },
        ],
      }).success,
    ).toBe(false);
    expect(
      createMediaImportSchema(limits).safeParse({
        clientRequestId: 'import-1',
        title: 'too long',
        inputs: [{ role: 'reference', file_id: 'a' }],
      }).success,
    ).toBe(false);
  });

  it('keeps stable preparing identity and distinguishes imports from generation', () => {
    const receipt = {
      schemaVersion: 1,
      clientRequestId: 'request-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      phase: 'preparing',
    };
    expect(mediaImportReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(mediaSubmissionReceiptSchema.safeParse(receipt).success).toBe(false);
    expect(mediaSubmissionReceiptSchema.parse({ ...receipt, jobId: 'job-1' })).toMatchObject({
      jobId: 'job-1',
    });
    expect(mediaImportReceiptSchema.safeParse({ ...receipt, jobId: 'job-1' }).success).toBe(false);
  });

  it('rejects invalid discrete numeric controls', () => {
    expect(
      mediaNumberControlSchema.parse({ min: 4, max: 8, values: [4, 6, 8], default: 6 }).values,
    ).toEqual([4, 6, 8]);
    expect(
      mediaNumberControlSchema.safeParse({ min: 4, max: 8, values: [4, 6, 8], default: 5 }).success,
    ).toBe(false);
  });

  it('keeps startup projection strict and excludes integration/credential material', () => {
    const startup = {
      enabled: false,
      studio: false,
      chat: false,
      canCreate: false,
      clientPollIntervalMs: 5_000,
      clientCatchUpIntervalMs: 30_000,
    };
    expect(mediaStartupConfigSchema.parse(startup)).toEqual(startup);
    expect(
      mediaStartupConfigSchema.safeParse({ ...startup, integrations: [integration] }).success,
    ).toBe(false);
    expect(mediaStartupConfigSchema.safeParse({ ...startup, apiKey: 'secret' }).success).toBe(
      false,
    );
  });

  it('encodes all dynamic endpoint identities and cursors', () => {
    expect(endpoints.mediaSubmission('a/b?c')).toContain('/submissions/a%2Fb%3Fc');
    expect(endpoints.mediaTurnJobs('a/b', 'c?d', { cursor: 'cursor&next', limit: 2 })).toContain(
      '/threads/a%2Fb/turns/c%3Fd/jobs?cursor=cursor%26next&limit=2',
    );
  });
});
