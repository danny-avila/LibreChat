import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  bootstrapCredentials,
  credentialNames,
  getCredentialFingerprints,
  getCredentialRuntimeState,
  isLegacyCredential,
} from './credentials';

describe('credentials', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('generates and persists temporary credentials when values are absent', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'librechat-credentials-'));
    const tempFile = path.join(tempDirectory, '.env.temp');
    process.env = {
      ...originalEnv,
      LIBRECHAT_TEMP_CREDENTIALS_PATH: tempFile,
    };
    credentialNames.forEach((name) => delete process.env[name]);

    const state = bootstrapCredentials();

    expect(state.generated).toEqual(credentialNames);
    expect(state.loadedFromFile).toEqual([]);
    expect(state.persistenceFailed).toBe(false);
    expect(getCredentialRuntimeState()).toEqual(state);
    expect(fs.statSync(tempFile).mode & 0o777).toBe(0o600);
    expect(getCredentialFingerprints()).toEqual(
      expect.objectContaining({
        CREDS_KEY: expect.any(String),
        CREDS_IV: expect.any(String),
        JWT_SECRET: expect.any(String),
        JWT_REFRESH_SECRET: expect.any(String),
      }),
    );

    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('does not classify an arbitrary credential as a legacy default', () => {
    expect(isLegacyCredential('JWT_SECRET', 'test-only-secret')).toBe(false);
  });
});
