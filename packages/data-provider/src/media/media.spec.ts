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
});

describe('media command contracts', () => {
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
