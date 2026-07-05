process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so the crypto module initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let encryptConfigSecrets: typeof import('./secrets').encryptConfigSecrets;
let decryptConfigSecret: typeof import('./secrets').decryptConfigSecret;
let preserveConfigSecrets: typeof import('./secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({
    decryptConfigSecret,
    encryptConfigSecretFields,
    encryptConfigSecrets,
    preserveConfigSecrets,
    redactConfigSecrets,
  } = await import('./secrets'));
  ({ decryptV3 } = await import('@librechat/data-schemas'));
});

describe('encryptConfigSecretFields', () => {
  it('encrypts a registered secret field and stores a fingerprint', () => {
    const out = encryptConfigSecretFields({
      'langfuse.enabled': true,
      'langfuse.publicKey': 'pk-lf-1',
      'langfuse.secretKey': 'sk-lf-secret',
    });

    expect(out['langfuse.secretKey']).toMatch(/^v3:/);
    expect(decryptV3(out['langfuse.secretKey'] as string)).toBe('sk-lf-secret');
    expect(out['langfuse.secretKeyFingerprint']).toMatch(/^[a-f0-9]{12}$/);
    expect(out['langfuse.enabled']).toBe(true);
    expect(out['langfuse.publicKey']).toBe('pk-lf-1');
  });

  it('resets already-encrypted API values and stale fingerprints', () => {
    const second = encryptConfigSecretFields({
      'langfuse.secretKey': 'v3:attacker-controlled',
      'langfuse.secretKeyFingerprint': 'oldfingerprint',
    });

    expect(second['langfuse.secretKey']).toBe('');
    expect(second['langfuse.secretKeyFingerprint']).toBe('');
  });

  it('resets the secret and fingerprint for an empty secret', () => {
    const out = encryptConfigSecretFields({ 'langfuse.secretKey': '' });
    expect(out['langfuse.secretKey']).toBe('');
    expect(out['langfuse.secretKeyFingerprint']).toBe('');
  });

  it('encrypts registered secrets inside object-valued ancestor patches', () => {
    const out = encryptConfigSecretFields({
      langfuse: {
        publicKey: 'pk-lf-1',
        secretKey: 'sk-lf-secret',
      },
    });

    const langfuse = out.langfuse as Record<string, string>;
    expect(langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(langfuse.secretKey)).toBe('sk-lf-secret');
    expect(langfuse.secretKeyFingerprint).toMatch(/^[a-f0-9]{12}$/);
  });

  it('drops array-valued ancestor patches for registered secrets', () => {
    const out = encryptConfigSecretFields({
      langfuse: [{ secretKey: 'sk-lf-secret' }],
    });

    expect(out).not.toHaveProperty('langfuse');
  });

  it('ignores direct fingerprint writes when no secret is patched', () => {
    const out = encryptConfigSecretFields({
      'langfuse.secretKeyFingerprint': 'spoofed',
    });

    expect(out).not.toHaveProperty('langfuse.secretKeyFingerprint');
  });

  it('resets non-string secret values and ignores spoofed fingerprints', () => {
    const out = encryptConfigSecretFields({
      'langfuse.secretKey': { hidden: 'sk-lf-secret' },
      'langfuse.secretKeyFingerprint': 'spoofed',
    });

    expect(out['langfuse.secretKey']).toBe('');
    expect(out['langfuse.secretKeyFingerprint']).toBe('');
  });
});

describe('encryptConfigSecrets', () => {
  it('encrypts a nested registered secret field and stores a fingerprint', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        enabled: true,
        publicKey: 'pk-lf-1',
        secretKey: 'sk-lf-secret',
      },
    });

    const langfuse = out.langfuse as Record<string, string | boolean>;
    expect(langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(langfuse.secretKey as string)).toBe('sk-lf-secret');
    expect(langfuse.secretKeyFingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(langfuse.publicKey).toBe('pk-lf-1');
  });

  it('resets a nested empty secret and stale fingerprint', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        secretKey: '',
        secretKeyFingerprint: 'oldfingerprint',
      },
    });

    expect(out.langfuse.secretKey).toBe('');
    expect(out.langfuse.secretKeyFingerprint).toBe('');
  });

  it('removes orphaned nested fingerprints when the secret is absent', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-lf-1',
        secretKeyFingerprint: 'spoofed',
      },
    });

    expect(out.langfuse).toEqual({ publicKey: 'pk-lf-1' });
  });

  it('resets nested non-string secret values and stale fingerprints', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        secretKey: null,
        secretKeyFingerprint: 'spoofed',
      },
    });

    expect(out.langfuse).toEqual({
      secretKey: '',
      secretKeyFingerprint: '',
    });
  });

  it('drops literal dotted secret keys on full-object writes', () => {
    const out = encryptConfigSecrets({
      'langfuse.secretKey': 'sk-lf-secret',
      'langfuse.secretKeyFingerprint': 'spoofed',
      langfuse: {
        publicKey: 'pk-lf-1',
      },
    });

    expect(out).not.toHaveProperty('langfuse.secretKey');
    expect(out).not.toHaveProperty('langfuse.secretKeyFingerprint');
    expect(out.langfuse).toEqual({ publicKey: 'pk-lf-1' });
  });

  it('drops array-shaped ancestors for registered secret paths', () => {
    const out = encryptConfigSecrets({
      langfuse: [{ secretKey: 'sk-lf-secret' }],
    });

    expect(out).not.toHaveProperty('langfuse');
  });
});

describe('decryptConfigSecret', () => {
  it('decrypts encrypted config secrets and passes plaintext through', () => {
    const encrypted = encryptConfigSecrets({
      langfuse: { secretKey: 'sk-lf-secret' },
    }).langfuse.secretKey;

    expect(decryptConfigSecret(encrypted)).toBe('sk-lf-secret');
    expect(decryptConfigSecret(' sk-plaintext ')).toBe('sk-plaintext');
    expect(decryptConfigSecret('')).toBeUndefined();
  });

  it('returns undefined for undecryptable encrypted values', () => {
    expect(decryptConfigSecret('v3:not-valid-ciphertext')).toBeUndefined();
  });
});

describe('preserveConfigSecrets', () => {
  it('preserves an existing encrypted secret when a full object omits it', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-old',
      },
    });
    const next = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-new',
      },
    });

    const preserved = preserveConfigSecrets(next, existing);
    const preservedLangfuse = preserved.langfuse as Record<string, string>;
    const existingLangfuse = existing.langfuse as Record<string, string>;

    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-old');
    expect(preservedLangfuse.secretKeyFingerprint).toBe(existingLangfuse.secretKeyFingerprint);
    expect(preserved.langfuse.publicKey).toBe('pk-new');
  });

  it('encrypts preserved plaintext secrets from existing stored config', () => {
    const next = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-new',
      },
    });

    const preserved = preserveConfigSecrets(next, {
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-legacy-plaintext',
      },
    });
    const preservedLangfuse = preserved.langfuse as Record<string, string>;

    expect(preservedLangfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-legacy-plaintext');
    expect(preservedLangfuse.secretKeyFingerprint).toMatch(/^[a-f0-9]{12}$/);
  });

  it('does not preserve when the secret section is absent', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        secretKey: 'sk-old',
      },
    });

    expect(preserveConfigSecrets({ interface: { modelSelect: false } }, existing)).toEqual({
      interface: { modelSelect: false },
    });
  });

  it('does not preserve when the secret is explicitly cleared', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        secretKey: 'sk-old',
      },
    });
    const next = encryptConfigSecrets({
      langfuse: {
        secretKey: '',
      },
    });

    expect(preserveConfigSecrets(next, existing)).toEqual({
      langfuse: {
        secretKey: '',
        secretKeyFingerprint: '',
      },
    });
  });

  it('preserves existing secrets for object-valued ancestor patches', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-old',
      },
    });

    const preserved = preserveConfigSecrets({ publicKey: 'pk-new' }, existing, 'langfuse');
    const preservedLangfuse = preserved as Record<string, string>;
    const existingLangfuse = existing.langfuse as Record<string, string>;

    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-old');
    expect(preservedLangfuse.secretKeyFingerprint).toBe(existingLangfuse.secretKeyFingerprint);
    expect(preserved.publicKey).toBe('pk-new');
  });
});

describe('redactConfigSecrets', () => {
  it('removes the secret but keeps the fingerprint and other fields', () => {
    const redacted = redactConfigSecrets({
      langfuse: {
        enabled: true,
        baseUrl: 'https://cloud.langfuse.com',
        publicKey: 'pk-lf-1',
        secretKey: 'v3:abc:def',
        secretKeyFingerprint: 'abc123def456',
      },
    });

    expect(redacted.langfuse).not.toHaveProperty('secretKey');
    expect(redacted.langfuse.secretKeyFingerprint).toBe('abc123def456');
    expect(redacted.langfuse.publicKey).toBe('pk-lf-1');
    expect(redacted.langfuse.enabled).toBe(true);
  });

  it('is a no-op when the secret path is absent', () => {
    const input = { langfuse: { enabled: false } };
    expect(redactConfigSecrets(input)).toEqual({ langfuse: { enabled: false } });
  });

  it('removes literal dotted secret keys and array-shaped secret containers', () => {
    const redacted = redactConfigSecrets({
      'langfuse.secretKey': 'sk-lf-secret',
      'langfuse.secretKeyFingerprint': 'spoofed',
      langfuseArray: true,
      langfuse: [{ secretKey: 'sk-lf-secret' }],
    });

    expect(redacted).toEqual({ langfuseArray: true });
  });

  it('handles null/non-object roots', () => {
    expect(redactConfigSecrets(null)).toBeNull();
    expect(redactConfigSecrets(undefined)).toBeUndefined();
  });
});
