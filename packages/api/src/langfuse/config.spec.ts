import type { AppConfig } from '@librechat/data-schemas';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const CENTRAL_EXPORT_ATTRIBUTE = 'librechat.langfuse.central_export.enabled';
const envKeys = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_HOST',
  'LANGFUSE_BASEURL',
  'LANGFUSE_FANOUT_ENABLED',
  'LANGFUSE_FANOUT_COLLECTOR_URL',
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
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://langfuse-fanout-collector:4318';
    const { encryptV3 } = await import('@librechat/data-schemas');
    const { buildLangfuseConfig } = await import('./config');

    const config = buildLangfuseConfig({
      tenantId: 'tenant-1',
      appConfig: {
        langfuse: {
          publicKey: 'pk-tenant-1',
          secretKey: encryptV3('sk-tenant-1'),
          destination: 'eu',
          fanout: {
            enabled: true,
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

  it('fails closed to central-only export when tenant secret decryption fails', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://langfuse-fanout-collector:4318';
    const { buildLangfuseConfig } = await import('./config');

    const config = buildLangfuseConfig({
      tenantId: 'tenant-1',
      appConfig: {
        langfuse: {
          publicKey: 'pk-tenant-1',
          secretKey: 'v3:not-valid-ciphertext',
          destination: 'eu',
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

  it('fails closed to central-only export when tenant secret is plaintext at runtime', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://langfuse-fanout-collector:4318';
    const { buildLangfuseConfig } = await import('./config');

    const config = buildLangfuseConfig({
      tenantId: 'tenant-1',
      appConfig: {
        langfuse: {
          publicKey: 'pk-tenant-1',
          secretKey: 'sk-tenant-1',
          destination: 'eu',
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

  it('keeps central export enabled by default', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_BASE_URL = 'https://central.langfuse.example';
    const { buildLangfuseConfig } = await import('./config');

    expect(buildLangfuseConfig({ tenantId: 'tenant-1' })).toEqual({
      deterministicTraceId: true,
      publicKey: 'pk-central',
      secretKey: 'sk-central',
      baseUrl: 'https://central.langfuse.example',
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      tags: ['tenant:tenant-1'],
    });
  });

  it('disables direct central tracing when central export is disabled', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_BASE_URL = 'https://central.langfuse.example';
    const { buildLangfuseConfig } = await import('./config');

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
      }),
    ).toEqual({
      deterministicTraceId: true,
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      enabled: false,
      librechatTraceAttributes: {
        [CENTRAL_EXPORT_ATTRIBUTE]: 'false',
      },
      tags: ['tenant:tenant-1'],
    });
  });

  it('does not emit central-suppressed traces when there is no tenant fanout route', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';
    const { buildLangfuseConfig } = await import('./config');

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
      }),
    ).toEqual({
      deterministicTraceId: true,
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      enabled: false,
      librechatTraceAttributes: {
        [CENTRAL_EXPORT_ATTRIBUTE]: 'false',
      },
      tags: ['tenant:tenant-1'],
    });
  });

  it('routes encrypted tenant credentials while marking central export disabled', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';
    const { encryptV3 } = await import('@librechat/data-schemas');
    const { buildLangfuseConfig } = await import('./config');

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
        appConfig: {
          langfuse: {
            publicKey: 'pk-tenant-1',
            secretKey: encryptV3('sk-tenant-1'),
            destination: 'us',
          },
        } as unknown as AppConfig,
      }),
    ).toMatchObject({
      deterministicTraceId: true,
      publicKey: 'pk-tenant-1',
      secretKey: 'sk-tenant-1',
      baseUrl: 'http://collector-from-env:4318/tenant/us/central-media-disabled',
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      librechatTraceAttributes: {
        [CENTRAL_EXPORT_ATTRIBUTE]: 'false',
        'librechat.langfuse.tenant_export.enabled': 'true',
        'librechat.langfuse.destination': 'us',
      },
      tags: ['tenant:tenant-1'],
    });
  });

  it('does not emit central-suppressed traces when tenant fanout is emergency-disabled', async () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';
    process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = 'true';
    const { encryptV3 } = await import('@librechat/data-schemas');
    const { buildLangfuseConfig } = await import('./config');

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
        appConfig: {
          langfuse: {
            publicKey: 'pk-tenant-1',
            secretKey: encryptV3('sk-tenant-1'),
            destination: 'us',
          },
        } as unknown as AppConfig,
      }),
    ).toEqual({
      deterministicTraceId: true,
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      enabled: false,
      librechatTraceAttributes: {
        [CENTRAL_EXPORT_ATTRIBUTE]: 'false',
      },
      tags: ['tenant:tenant-1'],
    });
  });

  it('honors tenant Langfuse enabled=false before adding routing attributes', async () => {
    const { buildLangfuseConfig } = await import('./config');

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
        appConfig: {
          langfuse: {
            enabled: false,
          },
        } as AppConfig,
      }),
    ).toEqual({
      deterministicTraceId: true,
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      enabled: false,
      tags: ['tenant:tenant-1'],
    });
  });
});
