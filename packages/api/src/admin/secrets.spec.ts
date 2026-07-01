process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so the crypto module initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({ encryptConfigSecretFields, redactConfigSecrets } = await import('./secrets'));
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

  it('leaves an already-encrypted value untouched', () => {
    const first = encryptConfigSecretFields({ 'langfuse.secretKey': 'sk-lf-secret' });
    const second = encryptConfigSecretFields({
      'langfuse.secretKey': first['langfuse.secretKey'] as string,
    });
    expect(second['langfuse.secretKey']).toBe(first['langfuse.secretKey']);
  });

  it('does not add a fingerprint for an empty secret', () => {
    const out = encryptConfigSecretFields({ 'langfuse.secretKey': '' });
    expect(out['langfuse.secretKey']).toBe('');
    expect(out['langfuse.secretKeyFingerprint']).toBeUndefined();
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

  it('handles null/non-object roots', () => {
    expect(redactConfigSecrets(null)).toBeNull();
    expect(redactConfigSecrets(undefined)).toBeUndefined();
  });
});
