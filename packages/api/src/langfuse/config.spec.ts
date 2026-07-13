import type { AppConfig } from '@librechat/data-schemas';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { buildLangfuseConfig } from './config';

const CENTRAL_EXPORT_ATTRIBUTE = 'librechat.langfuse.central_export.enabled';

function clearLangfuseEnv() {
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.LANGFUSE_BASEURL;
  delete process.env.LANGFUSE_HOST;
  delete process.env.LANGFUSE_FANOUT_ENABLED;
  delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
  delete process.env.LANGFUSE_FANOUT_TENANT_BASE_URL;
  delete process.env.LANGFUSE_FANOUT_TENANT_DESTINATIONS;
  delete process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED;
}

describe('buildLangfuseConfig central export control', () => {
  beforeEach(() => {
    clearLangfuseEnv();
  });

  it('keeps central export enabled by default', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_BASE_URL = 'https://central.langfuse.example';

    expect(buildLangfuseConfig({ tenantId: 'tenant-1' })).toEqual({
      deterministicTraceId: true,
      publicKey: 'pk-central',
      secretKey: 'sk-central',
      baseUrl: 'https://central.langfuse.example',
      metadata: { 'librechat.tenant.id': 'tenant-1' },
      tags: ['tenant:tenant-1'],
    });
  });

  it('disables direct central tracing when central export is disabled', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_BASE_URL = 'https://central.langfuse.example';

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

  it('does not emit central-suppressed traces when there is no tenant fanout route', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-central';
    process.env.LANGFUSE_SECRET_KEY = 'sk-central';
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';

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

  it('routes tenant fanout traces while marking central export disabled', () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
        appConfig: {
          langfuse: {
            publicKey: 'pk-tenant-1',
            secretKey: 'sk-tenant-1',
            baseUrl: 'https://us.cloud.langfuse.com',
          },
        } as AppConfig,
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

  it('does not emit central-suppressed traces when tenant fanout is emergency-disabled', () => {
    process.env.LANGFUSE_FANOUT_ENABLED = 'true';
    process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://collector-from-env:4318';
    process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = 'true';

    expect(
      buildLangfuseConfig({
        tenantId: 'tenant-1',
        centralTraceExportEnabled: false,
        appConfig: {
          langfuse: {
            publicKey: 'pk-tenant-1',
            secretKey: 'sk-tenant-1',
            baseUrl: 'https://us.cloud.langfuse.com',
          },
        } as AppConfig,
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

  it('honors tenant Langfuse enabled=false before adding routing attributes', () => {
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
