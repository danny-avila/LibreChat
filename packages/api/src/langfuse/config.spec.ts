import type { AppConfig } from '@librechat/data-schemas';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const envKeys = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_HOST',
  'LANGFUSE_BASEURL',
  'LANGFUSE_FANOUT_ENABLED',
  'LANGFUSE_FANOUT_COLLECTOR_URL',
  'LANGFUSE_FANOUT_TENANT_BASE_URL',
  'LANGFUSE_FANOUT_TENANT_DESTINATIONS',
  'LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED',
];

function clearEnv() {
  for (const key of envKeys) {
    delete process.env[key];
  }
}

describe('buildLangfuseConfig', () => {
  beforeEach(() => {
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  it('decrypts encrypted tenant secrets for tenant trace export', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    const { encryptV3 } = await import('@librechat/data-schemas');
    const { buildLangfuseConfig } = await import('./config');

    const config = buildLangfuseConfig({
      tenantId: 'tenant-1',
      appConfig: {
        langfuse: {
          publicKey: 'pk-tenant-1',
          secretKey: encryptV3('sk-tenant-1'),
          baseUrl: 'https://cloud.langfuse.com',
          fanout: {
            enabled: true,
            collectorUrl: 'http://langfuse-fanout-collector:4318',
          },
        },
      } as unknown as AppConfig,
    });

    expect(config).toMatchObject({
      publicKey: 'pk-tenant-1',
      secretKey: 'sk-tenant-1',
      baseUrl: 'http://langfuse-fanout-collector:4318/tenant/eu',
      librechatTraceAttributes: {
        'librechat.langfuse.tenant_export.enabled': 'true',
        'librechat.langfuse.destination': 'eu',
      },
    });
  });

  it('fails closed to fanout-only trace export when tenant secret decryption fails', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://langfuse-fanout-collector:4318';
    const { buildLangfuseConfig } = await import('./config');

    const config = buildLangfuseConfig({
      tenantId: 'tenant-1',
      appConfig: {
        langfuse: {
          publicKey: 'pk-tenant-1',
          secretKey: 'v3:not-valid-ciphertext',
          baseUrl: 'https://cloud.langfuse.com',
        },
      } as unknown as AppConfig,
    });

    expect(config).toEqual({
      deterministicTraceId: true,
      baseUrl: 'http://langfuse-fanout-collector:4318',
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      tags: ['tenant:tenant-1'],
    });
  });
});
