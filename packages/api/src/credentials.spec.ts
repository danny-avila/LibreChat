import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CredentialRuntimeState } from './credentials';
import {
  bootstrapCredentials,
  credentialNames,
  getCredentialFingerprints,
  getCredentialRuntimeState,
  isLegacyCredential,
} from './credentials';

const credentialRuntimeKey = Symbol.for('librechat.credentials.runtime');

function resetCredentialRuntime(): void {
  const runtime = globalThis as typeof globalThis &
    Record<symbol, CredentialRuntimeState | undefined>;
  delete runtime[credentialRuntimeKey];
}

describe('credentials', () => {
  const originalEnv = process.env;
  let tempDirectory: string;
  let tempFile: string;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation();
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'librechat-credentials-'));
    tempFile = path.join(tempDirectory, '.env.temp');
    process.env = {
      ...originalEnv,
      LIBRECHAT_TEMP_CREDENTIALS_PATH: tempFile,
    };
    for (const name of credentialNames) {
      delete process.env[name];
    }
    resetCredentialRuntime();
  });

  afterEach(() => {
    resetCredentialRuntime();
    process.env = originalEnv;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('generates and persists temporary credentials when values are absent', () => {
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
  });

  it('reuses persisted credentials on the next startup', () => {
    bootstrapCredentials();
    const originalValues = Object.fromEntries(
      credentialNames.map((name) => [name, process.env[name]]),
    );
    resetCredentialRuntime();
    for (const name of credentialNames) {
      delete process.env[name];
    }

    const state = bootstrapCredentials();

    expect(state.generated).toEqual([]);
    expect(state.loadedFromFile).toEqual(credentialNames);
    for (const name of credentialNames) {
      expect(process.env[name]).toBe(originalValues[name]);
    }
  });

  it('adopts a winning repair when an existing credential file is incomplete', () => {
    const winningValues = {
      CREDS_KEY: 'a'.repeat(64),
      CREDS_IV: 'b'.repeat(32),
      JWT_SECRET: 'c'.repeat(64),
      JWT_REFRESH_SECRET: 'd'.repeat(64),
    };
    fs.writeFileSync(
      tempFile,
      `CREDS_KEY=${winningValues.CREDS_KEY}\nCREDS_IV=${winningValues.CREDS_IV}\n`,
    );
    fs.writeFileSync(
      `${tempFile}.lock`,
      credentialNames.map((name) => `${name}=${winningValues[name]}`).join('\n'),
      { mode: 0o600 },
    );

    const state = bootstrapCredentials();

    expect(state.generated).toEqual([]);
    expect(state.loadedFromFile).toEqual(credentialNames);
    expect(state.persistenceFailed).toBe(false);
    expect(fs.existsSync(`${tempFile}.lock`)).toBe(false);
    for (const name of credentialNames) {
      expect(process.env[name]).toBe(winningValues[name]);
    }
  });

  it('preserves explicitly configured JWT secrets for backward compatibility', () => {
    process.env.JWT_SECRET = 'short-but-explicit';
    process.env.JWT_REFRESH_SECRET = 'another-explicit-value';

    const state = bootstrapCredentials();

    expect(process.env.JWT_SECRET).toBe('short-but-explicit');
    expect(process.env.JWT_REFRESH_SECRET).toBe('another-explicit-value');
    expect(state.sources.JWT_SECRET).toBe('environment');
    expect(state.sources.JWT_REFRESH_SECRET).toBe('environment');
    expect(state.generated).toEqual(['CREDS_KEY', 'CREDS_IV']);
  });

  it('does not overwrite an explicitly selected environment file', () => {
    const environmentFile = path.join(tempDirectory, '.env');
    process.env.LIBRECHAT_TEMP_CREDENTIALS_PATH = environmentFile;

    const state = bootstrapCredentials();

    expect(state.persistenceFailed).toBe(true);
    expect(fs.existsSync(environmentFile)).toBe(false);
  });

  it('does not classify an arbitrary credential as a legacy default', () => {
    expect(isLegacyCredential('JWT_SECRET', 'test-only-secret')).toBe(false);
  });
});
