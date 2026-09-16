import { resolveMediaConfig } from 'librechat-data-provider';
import { sanitizeMediaStartupConfig } from './config';

describe('sanitizeMediaStartupConfig', () => {
  const access = { authenticated: true, canUse: true, canCreate: true };
  const config = resolveMediaConfig({
    enabled: true,
    integrations: [
      {
        id: 'private-connection',
        api: 'openrouter.images',
        endpointRef: { kind: 'custom', name: 'Private endpoint' },
        catalog: { kind: 'configured', models: ['publisher/model'] },
        operations: ['image.generate'],
      },
    ],
  });

  it('does not expose media before authentication', () => {
    expect(sanitizeMediaStartupConfig({ ...access, config, authenticated: false })).toBeUndefined();
  });

  it('projects only safe availability and cadence fields', () => {
    expect(sanitizeMediaStartupConfig({ ...access, config })).toEqual({
      enabled: true,
      studio: true,
      chat: true,
      canCreate: true,
      clientPollIntervalMs: 5_000,
      clientCatchUpIntervalMs: 30_000,
    });
  });

  it('keeps absent/disabled deployments off and enforces explicit role denial', () => {
    expect(sanitizeMediaStartupConfig(access)).toMatchObject({ enabled: false, canCreate: false });
    expect(sanitizeMediaStartupConfig({ ...access, config, canUse: false })).toMatchObject({
      enabled: false,
      studio: false,
      chat: false,
      canCreate: false,
    });
  });

  it('keeps reconciliation visible without admitting new paid work after removal', () => {
    expect(sanitizeMediaStartupConfig({ ...access, reconciliationAvailable: true })).toMatchObject({
      enabled: true,
      studio: true,
      canCreate: false,
    });
  });
});
