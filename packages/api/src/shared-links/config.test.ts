import type { AppConfig } from '@librechat/data-schemas';
import { buildSharedLinkStartupPayload, isFileSnapshotEnabled } from './config';

const withSharedLinks = (sharedLinks: unknown): AppConfig =>
  ({ interfaceConfig: { sharedLinks } }) as unknown as AppConfig;

describe('isFileSnapshotEnabled', () => {
  const original = process.env.SHARED_LINKS_SNAPSHOT_FILES;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SHARED_LINKS_SNAPSHOT_FILES;
    } else {
      process.env.SHARED_LINKS_SNAPSHOT_FILES = original;
    }
  });

  it('defaults to enabled with no config or env', () => {
    delete process.env.SHARED_LINKS_SNAPSHOT_FILES;
    expect(isFileSnapshotEnabled()).toBe(true);
    expect(isFileSnapshotEnabled({} as AppConfig)).toBe(true);
  });

  it('honors yaml snapshotFiles: false', () => {
    delete process.env.SHARED_LINKS_SNAPSHOT_FILES;
    expect(isFileSnapshotEnabled(withSharedLinks({ snapshotFiles: false }))).toBe(false);
  });

  it('defaults enabled when sharedLinks is a boolean', () => {
    delete process.env.SHARED_LINKS_SNAPSHOT_FILES;
    expect(isFileSnapshotEnabled(withSharedLinks(true))).toBe(true);
  });

  it('env override wins over yaml (env false beats yaml true)', () => {
    process.env.SHARED_LINKS_SNAPSHOT_FILES = 'false';
    expect(isFileSnapshotEnabled(withSharedLinks({ snapshotFiles: true }))).toBe(false);
  });

  it('env override wins over yaml (env true beats yaml false)', () => {
    process.env.SHARED_LINKS_SNAPSHOT_FILES = 'true';
    expect(isFileSnapshotEnabled(withSharedLinks({ snapshotFiles: false }))).toBe(true);
  });
});

describe('buildSharedLinkStartupPayload', () => {
  it('builds the share-view startup allowlist', () => {
    const payload = buildSharedLinkStartupPayload(
      {
        interfaceConfig: {
          privacyPolicy: { externalUrl: 'https://example.com/privacy' },
          termsOfService: { externalUrl: 'https://example.com/tos' },
          modelSelect: true,
        },
      } as AppConfig,
      {
        ANALYTICS_GTM_ID: 'GTM-XYZ',
        APP_TITLE: 'Test Chat',
        CUSTOM_FOOTER: 'Shared footer',
        SANDPACK_BUNDLER_URL: 'https://bundler.example.com',
        SANDPACK_STATIC_BUNDLER_URL: 'https://static-bundler.example.com',
      },
    );

    expect(payload).toEqual({
      appTitle: 'Test Chat',
      analyticsGtmId: 'GTM-XYZ',
      bundlerURL: 'https://bundler.example.com',
      staticBundlerURL: 'https://static-bundler.example.com',
      customFooter: 'Shared footer',
      interface: {
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
        termsOfService: { externalUrl: 'https://example.com/tos' },
      },
    });
  });

  it('defaults the app title and omits unrelated interface config', () => {
    const payload = buildSharedLinkStartupPayload(
      { interfaceConfig: { modelSelect: true } } as AppConfig,
      {},
    );

    expect(payload).toEqual({ appTitle: 'LibreChat' });
  });
});
