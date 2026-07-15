process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let decryptConfigSecret: typeof import('./secrets').decryptConfigSecret;
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let encryptConfigSecrets: typeof import('./secrets').encryptConfigSecrets;
let getConfigSecretInputError: typeof import('./secrets').getConfigSecretInputError;
let preserveConfigSecrets: typeof import('./secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({
    decryptConfigSecret,
    encryptConfigSecretFields,
    encryptConfigSecrets,
    getConfigSecretInputError,
    preserveConfigSecrets,
    redactConfigSecrets,
  } = await import('./secrets'));
  ({ decryptV3 } = await import('@librechat/data-schemas'));
});

describe('Langfuse config secrets', () => {
  it('encrypts direct field writes and stores a display secret key', () => {
    const out = encryptConfigSecretFields({
      'langfuse.publicKey': 'pk-lf-1',
      'langfuse.secretKey': 'sk-lf-secret',
    });

    expect(out['langfuse.secretKey']).toMatch(/^v3:/);
    expect(decryptV3(out['langfuse.secretKey'] as string)).toBe('sk-lf-secret');
    expect(out['langfuse.displaySecretKey']).toBe('sk-lf-...cret');
    expect(out['langfuse.publicKey']).toBe('pk-lf-1');
  });

  it('encrypts object writes and removes client-supplied display secret keys', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-lf-1',
        secretKey: 'sk-lf-secret',
        displaySecretKey: 'spoofed',
      },
    });

    expect(out.langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(out.langfuse.secretKey)).toBe('sk-lf-secret');
    expect(out.langfuse.displaySecretKey).toBe('sk-lf-...cret');
    expect(out.langfuse.publicKey).toBe('pk-lf-1');
  });

  it('clears empty or non-string secret values', () => {
    expect(encryptConfigSecretFields({ 'langfuse.secretKey': '' })).toEqual({
      'langfuse.secretKey': '',
      'langfuse.displaySecretKey': '',
    });

    expect(
      encryptConfigSecrets({
        langfuse: {
          secretKey: null,
          displaySecretKey: 'spoofed',
        },
      }),
    ).toEqual({
      langfuse: {
        secretKey: '',
        displaySecretKey: '',
      },
    });
  });

  it('rejects protected display-key writes and encrypted secret submissions', () => {
    expect(getConfigSecretInputError('langfuse.displaySecretKey', 'spoofed')).toContain(
      'protected display secret path',
    );
    expect(getConfigSecretInputError('langfuse.secretKey', 'v3:attacker-controlled')).toContain(
      'Encrypted config secret values',
    );
    expect(
      getConfigSecretInputError('langfuse', { secretKey: 'v3:attacker-controlled' }),
    ).toContain('Encrypted config secret values');
    expect(getConfigSecretInputError('langfuse.secretKey', 'sk-lf-secret')).toBeNull();
  });

  it('decrypts encrypted config secrets and rejects plaintext runtime values', () => {
    const encrypted = encryptConfigSecrets({
      langfuse: { secretKey: 'sk-lf-secret' },
    }).langfuse.secretKey;

    expect(decryptConfigSecret(encrypted)).toBe('sk-lf-secret');
    expect(decryptConfigSecret(' sk-plaintext ')).toBeUndefined();
    expect(decryptConfigSecret('')).toBeUndefined();
    expect(decryptConfigSecret('v3:not-valid-ciphertext')).toBeUndefined();
  });

  it('preserves existing encrypted secrets when object writes omit them', () => {
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
    expect(preservedLangfuse.displaySecretKey).toBe(existingLangfuse.displaySecretKey);
    expect(preserved.langfuse.publicKey).toBe('pk-new');
  });

  it('does not preserve plaintext existing secrets or explicitly cleared secrets', () => {
    const next = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-new',
      },
    });

    const fromPlaintext = preserveConfigSecrets(next, {
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-plain-existing',
      },
    });
    expect(fromPlaintext.langfuse).toEqual({ publicKey: 'pk-new' });

    const existing = encryptConfigSecrets({
      langfuse: {
        secretKey: 'sk-old',
      },
    });
    const cleared = encryptConfigSecrets({
      langfuse: {
        secretKey: '',
      },
    });
    expect(preserveConfigSecrets(cleared, existing)).toEqual({
      langfuse: {
        secretKey: '',
        displaySecretKey: '',
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
    expect(preservedLangfuse.displaySecretKey).toBe(existingLangfuse.displaySecretKey);
    expect(preserved.publicKey).toBe('pk-new');
  });

  it('redacts secret values while preserving display secret keys', () => {
    const redacted = redactConfigSecrets({
      'langfuse.secretKey': 'literal',
      'langfuse.displaySecretKey': 'literal-display',
      langfuse: {
        enabled: true,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKey: 'v3:abc:def',
        displaySecretKey: 'sk-lf-...cret',
      },
    });

    expect(redacted['langfuse.secretKey']).toBeUndefined();
    expect(redacted['langfuse.displaySecretKey']).toBeUndefined();
    expect(redacted.langfuse).toEqual({
      enabled: true,
      destination: 'eu',
      publicKey: 'pk-lf-1',
      displaySecretKey: 'sk-lf-...cret',
    });
  });
});
