process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let decryptConfigSecret: typeof import('./secrets').decryptConfigSecret;
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let encryptConfigSecrets: typeof import('./secrets').encryptConfigSecrets;
let getDisplaySecretKey: typeof import('./secrets').getDisplaySecretKey;
let getConfigSecretInputError: typeof import('./secrets').getConfigSecretInputError;
let getConfigSecretMutationPaths: typeof import('./secrets').getConfigSecretMutationPaths;
let getConfigSecretSections: typeof import('./secrets').getConfigSecretSections;
let isConfigSecretAncestorPath: typeof import('./secrets').isConfigSecretAncestorPath;
let isConfigSecretDescendantPath: typeof import('./secrets').isConfigSecretDescendantPath;
let preserveConfigSecrets: typeof import('./secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let resolveConfigSecret: typeof import('./secrets').resolveConfigSecret;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({
    decryptConfigSecret,
    encryptConfigSecretFields,
    encryptConfigSecrets,
    getDisplaySecretKey,
    getConfigSecretInputError,
    getConfigSecretMutationPaths,
    getConfigSecretSections,
    isConfigSecretAncestorPath,
    isConfigSecretDescendantPath,
    preserveConfigSecrets,
    redactConfigSecrets,
    resolveConfigSecret,
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

  it('migrates a legacy plaintext existing secret by encrypting it, and drops explicitly cleared secrets', () => {
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
    const preservedLangfuse = fromPlaintext.langfuse as Record<string, string>;
    expect(preservedLangfuse.publicKey).toBe('pk-new');
    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-plain-existing');
    expect(preservedLangfuse.displaySecretKey).toBe(getDisplaySecretKey('sk-plain-existing'));

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

describe('Config secret registry fields', () => {
  it('exposes the registered top-level sections', () => {
    expect([...getConfigSecretSections()].sort()).toEqual([
      'endpoints',
      'langfuse',
      'ocr',
      'speech',
      'webSearch',
    ]);
  });

  it('encrypts assistants endpoint keys but leaves unrelated endpoints untouched', () => {
    const out = encryptConfigSecrets({
      endpoints: {
        assistants: { apiKey: 'sk-assist', disableBuilder: true },
        azureAssistants: { apiKey: '${AZURE_ASSISTANTS_API_KEY}' },
        custom: [{ name: 'my-endpoint', apiKey: '${MY_KEY}', baseURL: 'https://x' }],
      },
    });
    const endpoints = out.endpoints as {
      assistants: Record<string, unknown>;
      azureAssistants: Record<string, unknown>;
      custom: Array<Record<string, unknown>>;
    };
    expect(decryptV3(endpoints.assistants.apiKey as string)).toBe('sk-assist');
    expect(endpoints.assistants.disableBuilder).toBe(true);
    expect(endpoints.azureAssistants.apiKey).toBe('${AZURE_ASSISTANTS_API_KEY}');
    expect(endpoints.custom[0]).toEqual({
      name: 'my-endpoint',
      apiKey: '${MY_KEY}',
      baseURL: 'https://x',
    });
  });

  it('encrypts speech, ocr, and webSearch literals on object writes', () => {
    const out = encryptConfigSecrets({
      speech: {
        tts: { openai: { apiKey: 'sk-tts', model: 'tts-1' } },
        stt: { azureOpenAI: { apiKey: 'sk-stt', instanceName: 'inst' } },
      },
      ocr: { apiKey: 'sk-ocr', mistralModel: 'mistral-ocr-latest' },
      webSearch: { serperApiKey: 'sk-serper', searchProvider: 'serper' },
    });

    expect(decryptV3(out.speech.tts.openai.apiKey)).toBe('sk-tts');
    expect(out.speech.tts.openai.model).toBe('tts-1');
    expect(decryptV3(out.speech.stt.azureOpenAI.apiKey)).toBe('sk-stt');
    expect(out.speech.stt.azureOpenAI.instanceName).toBe('inst');
    expect(decryptV3(out.ocr.apiKey)).toBe('sk-ocr');
    expect(out.ocr.mistralModel).toBe('mistral-ocr-latest');
    expect(decryptV3(out.webSearch.serperApiKey)).toBe('sk-serper');
    expect(out.webSearch.searchProvider).toBe('serper');
  });

  it('keeps env placeholder references as plain strings for fields that allow them', () => {
    const out = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: '${TTS_API_KEY}' } } },
      ocr: { apiKey: '${OCR_API_KEY}' },
      webSearch: { serperApiKey: '${SERPER_API_KEY}' },
    });

    expect(out.speech.tts.openai.apiKey).toBe('${TTS_API_KEY}');
    expect(out.ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(out.webSearch.serperApiKey).toBe('${SERPER_API_KEY}');
  });

  it('still encrypts placeholder-shaped Langfuse secrets (no placeholder exemption)', () => {
    const out = encryptConfigSecrets({ langfuse: { secretKey: '${LANGFUSE_SECRET_KEY}' } });
    expect(out.langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(out.langfuse.secretKey)).toBe('${LANGFUSE_SECRET_KEY}');
  });

  it('clears a stale display mask when a literal secret is rotated to an env placeholder', () => {
    const dottedOut = encryptConfigSecretFields({ 'ocr.apiKey': '${OCR_API_KEY}' });
    expect(dottedOut['ocr.apiKey']).toBe('${OCR_API_KEY}');
    expect(dottedOut['ocr.displayApiKey']).toBe('');

    const objectOut = encryptConfigSecrets({
      ocr: { apiKey: '${OCR_API_KEY}', displayApiKey: 'sk-sta...LE00' },
    });
    expect(objectOut.ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(objectOut.ocr.displayApiKey).toBe('');
  });

  it('never persists a client-supplied display mask alongside an env placeholder secret', () => {
    const out = encryptConfigSecrets({
      ocr: { apiKey: '${OCR_API_KEY}', displayApiKey: 'sk-atk...ACK' },
    });
    expect(out.ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(out.ocr.displayApiKey).toBe('');
  });

  it('trims whitespace from a literal secret before encrypting and masking', () => {
    const out = encryptConfigSecretFields({ 'ocr.apiKey': '  sk-padded-secret  ' });
    expect(decryptV3(out['ocr.apiKey'] as string)).toBe('sk-padded-secret');
    expect(out['ocr.displayApiKey']).toBe(getDisplaySecretKey('sk-padded-secret'));
  });

  it('treats a whitespace-only literal secret as empty and clears it', () => {
    const out = encryptConfigSecretFields({ 'ocr.apiKey': '   ' });
    expect(out['ocr.apiKey']).toBe('');
    expect(out['ocr.displayApiKey']).toBe('');
  });

  it('masks short credentials fully instead of disclosing them via the display companion', () => {
    expect(getDisplaySecretKey('short12')).toBe('*******');
    expect(getDisplaySecretKey('0123456789')).toBe('**********');
    expect(getDisplaySecretKey('sk-longer-secret-value')).toBe('sk-lon...alue');
  });

  it('encrypts dotted patch writes and sets a masked display companion for every field', () => {
    const out = encryptConfigSecretFields({
      'speech.tts.openai.apiKey': 'sk-tts',
      'webSearch.serperApiKey': '${SERPER_API_KEY}',
      'ocr.apiKey': '',
    });

    expect(decryptV3(out['speech.tts.openai.apiKey'] as string)).toBe('sk-tts');
    expect(out['speech.tts.openai.displayApiKey']).toBe(getDisplaySecretKey('sk-tts'));
    expect(out['webSearch.serperApiKey']).toBe('${SERPER_API_KEY}');
    expect(out['webSearch.displaySerperApiKey']).toBe('');
    expect(out['ocr.apiKey']).toBe('');
    expect(out['ocr.displayApiKey']).toBe('');
    expect(Object.keys(out).sort()).toEqual([
      'ocr.apiKey',
      'ocr.displayApiKey',
      'speech.tts.openai.apiKey',
      'speech.tts.openai.displayApiKey',
      'webSearch.displaySerperApiKey',
      'webSearch.serperApiKey',
    ]);
  });

  it('encrypts secrets nested inside object-valued ancestor patch entries and sets their display companion', () => {
    type SpeechPatch = { tts: { openai: Record<string, string> } };
    const sectionPatch = encryptConfigSecretFields({
      speech: { tts: { openai: { apiKey: 'sk-tts', model: 'tts-1' } } },
    });
    const speech = sectionPatch.speech as SpeechPatch;
    expect(decryptV3(speech.tts.openai.apiKey)).toBe('sk-tts');
    expect(speech.tts.openai.displayApiKey).toBe(getDisplaySecretKey('sk-tts'));
    expect(speech.tts.openai.model).toBe('tts-1');

    const midPatch = encryptConfigSecretFields({
      'speech.tts': { openai: { apiKey: 'sk-tts' } },
    });
    const tts = midPatch['speech.tts'] as SpeechPatch['tts'];
    expect(decryptV3(tts.openai.apiKey)).toBe('sk-tts');
    expect(tts.openai.displayApiKey).toBe(getDisplaySecretKey('sk-tts'));

    const leafParentPatch = encryptConfigSecretFields({
      'speech.tts.openai': { apiKey: 'sk-tts', model: 'tts-1' },
    });
    const openai = leafParentPatch['speech.tts.openai'] as Record<string, string>;
    expect(decryptV3(openai.apiKey)).toBe('sk-tts');
    expect(openai.displayApiKey).toBe(getDisplaySecretKey('sk-tts'));
  });

  it('strips dotted registry-related keys, including display companions, from whole-override writes', () => {
    const out = encryptConfigSecrets({
      'speech.tts.openai.apiKey': 'sk-smuggled',
      'speech.tts.openai.displayApiKey': 'sk-spoofed...display',
      'ocr.apiKey': 'sk-smuggled',
      'webSearch.serperApiKey.nested': 'sk-smuggled',
      'speech.tts': { openai: { apiKey: 'sk-smuggled' } },
      ocr: { apiKey: 'sk-legit' } as Record<string, string>,
    });

    expect(out).not.toHaveProperty(['speech.tts.openai.apiKey']);
    expect(out).not.toHaveProperty(['speech.tts.openai.displayApiKey']);
    expect(out).not.toHaveProperty(['ocr.apiKey']);
    expect(out).not.toHaveProperty(['webSearch.serperApiKey.nested']);
    expect(out).not.toHaveProperty(['speech.tts']);
    expect(decryptV3(out.ocr.apiKey)).toBe('sk-legit');
    expect(out.ocr.displayApiKey).toBe(getDisplaySecretKey('sk-legit'));
  });

  it('strips a nested array smuggled at any depth along a secret ancestor path, not just the top level', () => {
    const encrypted = encryptConfigSecrets({
      speech: { tts: { openai: [{ apiKey: 'sk-smuggled-via-array' }] } },
    });
    const speechOut = encrypted.speech as { tts: Record<string, unknown> };
    expect(speechOut.tts).not.toHaveProperty('openai');
    expect(JSON.stringify(encrypted)).not.toContain('sk-smuggled-via-array');

    const readBack = redactConfigSecrets(
      structuredClone({
        speech: { tts: { openai: [{ apiKey: 'sk-smuggled-via-array' }] } },
      }),
    );
    const speechRead = readBack.speech as { tts: Record<string, unknown> };
    expect(speechRead.tts).not.toHaveProperty('openai');
    expect(JSON.stringify(readBack)).not.toContain('sk-smuggled-via-array');
  });

  it('redacts secrets but keeps display companions, env placeholders, and siblings visible on read', () => {
    const redacted = redactConfigSecrets({
      speech: {
        tts: {
          openai: {
            apiKey: 'sk-literal',
            displayApiKey: getDisplaySecretKey('sk-literal'),
            model: 'tts-1',
          },
        },
        stt: {
          openai: { apiKey: 'v3:abc:def', displayApiKey: 'sk-old...-old', model: 'whisper-1' },
        },
      },
      ocr: { apiKey: '${OCR_API_KEY}', mistralModel: 'mistral-ocr-latest' },
      webSearch: {
        serperApiKey: 'sk-literal',
        displaySerperApiKey: 'sk-lite...eral',
        searchProvider: 'serper',
      },
    });

    expect(redacted.speech.tts.openai).toEqual({
      displayApiKey: getDisplaySecretKey('sk-literal'),
      model: 'tts-1',
    });
    expect(redacted.speech.stt.openai).toEqual({
      displayApiKey: 'sk-old...-old',
      model: 'whisper-1',
    });
    expect(redacted.ocr).toEqual({
      apiKey: '${OCR_API_KEY}',
      mistralModel: 'mistral-ocr-latest',
    });
    expect(redacted.webSearch).toEqual({
      displaySerperApiKey: 'sk-lite...eral',
      searchProvider: 'serper',
    });
  });

  it('preserves omitted encrypted secrets and their display companion on nested object writes', () => {
    const existing = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: 'sk-old', model: 'tts-1' } as Record<string, string> } },
    });
    const existingDisplay = existing.speech.tts.openai.displayApiKey;
    expect(existingDisplay).toBe(getDisplaySecretKey('sk-old'));

    const next = preserveConfigSecrets(
      { speech: { tts: { openai: { model: 'tts-2' } as Record<string, string> } } },
      existing,
    );
    expect(decryptV3(next.speech.tts.openai.apiKey)).toBe('sk-old');
    expect(next.speech.tts.openai.displayApiKey).toBe(existingDisplay);
    expect(next.speech.tts.openai.model).toBe('tts-2');

    const providerRemoved = preserveConfigSecrets({ speech: { tts: {} } }, existing);
    expect(providerRemoved.speech.tts).toEqual({});

    const ancestorPatch = preserveConfigSecrets(
      { openai: { model: 'tts-2' } as Record<string, string> },
      existing,
      'speech.tts',
    );
    expect(decryptV3(ancestorPatch.openai.apiKey)).toBe('sk-old');
    expect(ancestorPatch.openai.displayApiKey).toBe(existingDisplay);
  });

  it('does not preserve explicitly cleared secrets, and clears the display companion too', () => {
    const cleared = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: '' } as Record<string, string> } },
    });
    expect(cleared.speech.tts.openai.displayApiKey).toBe('');
    const existing = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: 'sk-old' } as Record<string, string> } },
    });
    const preservedAfterClear = preserveConfigSecrets(cleared, existing);
    expect(preservedAfterClear.speech.tts.openai.apiKey).toBe('');
    expect(preservedAfterClear.speech.tts.openai.displayApiKey).toBe('');
  });

  it('migrates a legacy plaintext existing secret on an omitted allow-placeholder field too', () => {
    const fromPlaintext = preserveConfigSecrets(
      { ocr: { mistralModel: 'm' } },
      { ocr: { apiKey: 'sk-plain-existing' } },
    );
    const ocr = fromPlaintext.ocr as Record<string, string>;
    expect(ocr.mistralModel).toBe('m');
    expect(decryptV3(ocr.apiKey)).toBe('sk-plain-existing');
    expect(ocr.displayApiKey).toBe(getDisplaySecretKey('sk-plain-existing'));
  });

  it('preserves an existing env placeholder secret verbatim without encrypting it', () => {
    const fromPlaceholder = preserveConfigSecrets(
      { ocr: { mistralModel: 'm' } },
      { ocr: { apiKey: '${OCR_API_KEY}' } },
    );
    const ocr = fromPlaceholder.ocr as Record<string, string>;
    expect(ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(ocr.displayApiKey).toBeUndefined();
  });

  it('resolveConfigSecret decrypts, resolves env references, and passes literals through', () => {
    const encrypted = encryptConfigSecrets({ ocr: { apiKey: 'sk-ocr' } }).ocr.apiKey;
    expect(resolveConfigSecret(encrypted)).toBe('sk-ocr');

    process.env.SECRETS_SPEC_TEST_KEY = 'sk-from-env';
    expect(resolveConfigSecret('${SECRETS_SPEC_TEST_KEY}')).toBe('sk-from-env');
    delete process.env.SECRETS_SPEC_TEST_KEY;

    expect(resolveConfigSecret('sk-plain-literal')).toBe('sk-plain-literal');
    expect(resolveConfigSecret('')).toBe('');
    expect(resolveConfigSecret(undefined)).toBeUndefined();
    expect(resolveConfigSecret('v3:not-valid-ciphertext')).toBeUndefined();
  });

  it('reports mutation paths (including the display companion) and ancestor/descendant checks for registry fields', () => {
    expect(getConfigSecretMutationPaths('speech.tts.openai.apiKey')).toEqual([
      'speech.tts.openai.apiKey',
      'speech.tts.openai.displayApiKey',
    ]);
    expect(getConfigSecretMutationPaths('webSearch.serperApiKey')).toEqual([
      'webSearch.serperApiKey',
      'webSearch.displaySerperApiKey',
    ]);
    expect(getConfigSecretMutationPaths('langfuse.secretKey')).toEqual([
      'langfuse.secretKey',
      'langfuse.displaySecretKey',
    ]);
    expect(getConfigSecretMutationPaths('speech.tts.openai.displayApiKey')).toEqual([
      'speech.tts.openai.displayApiKey',
    ]);

    for (const path of ['speech', 'speech.tts', 'speech.tts.openai', 'ocr', 'webSearch']) {
      expect(isConfigSecretAncestorPath(path)).toBe(true);
    }
    expect(isConfigSecretAncestorPath('speech.tts.openai.apiKey')).toBe(false);
    expect(isConfigSecretAncestorPath('interface')).toBe(false);

    expect(isConfigSecretDescendantPath('speech.tts.openai.apiKey.hidden')).toBe(true);
    expect(isConfigSecretDescendantPath('webSearch.serperApiKey.hidden')).toBe(true);
    expect(isConfigSecretDescendantPath('speech.tts.openai.displayApiKey.hidden')).toBe(true);
    expect(isConfigSecretDescendantPath('speech.tts.openai.model')).toBe(false);
  });

  it('rejects encrypted submissions at registry paths and inside ancestor objects', () => {
    expect(getConfigSecretInputError('webSearch.serperApiKey', 'v3:attacker')).toContain(
      'Encrypted config secret values',
    );
    expect(
      getConfigSecretInputError('speech', { tts: { openai: { apiKey: 'v3:attacker' } } }),
    ).toContain('Encrypted config secret values');
    expect(getConfigSecretInputError('speech.tts.openai', { apiKey: 'v3:attacker' })).toContain(
      'Encrypted config secret values',
    );
    expect(getConfigSecretInputError('speech.tts.openai.apiKey', 'sk-legit')).toBeNull();
    expect(getConfigSecretInputError('ocr.apiKey', '${OCR_API_KEY}')).toBeNull();
  });

  describe('display companion fields are write-side read-only for every registered field', () => {
    it.each([
      'ocr.displayApiKey',
      'speech.tts.openai.displayApiKey',
      'speech.stt.azureOpenAI.displayApiKey',
      'webSearch.displaySerperApiKey',
      'webSearch.displayCohereApiKey',
      'endpoints.assistants.displayApiKey',
      'endpoints.azureAssistants.displayApiKey',
      'langfuse.displaySecretKey',
    ])('rejects a direct dotted-patch write to %s', (displayPath) => {
      expect(getConfigSecretInputError(displayPath, 'attacker-supplied-display-value')).toContain(
        'Cannot write protected display secret path',
      );
    });

    it('drops a client-supplied display value when the ancestor object omits the real secret, never storing it', () => {
      const out = encryptConfigSecretFields({
        speech: { tts: { openai: { model: 'tts-1', displayApiKey: 'attacker-injected-display' } } },
      });
      const openai = (out.speech as { tts: { openai: Record<string, unknown> } }).tts.openai;
      expect(openai).not.toHaveProperty('displayApiKey');
      expect(openai.model).toBe('tts-1');
    });

    it('overwrites a client-supplied display value with the server-computed one when a real secret is also present, never persisting the attacker value', () => {
      const out = encryptConfigSecretFields({
        webSearch: {
          serperApiKey: 'sk-real-secret',
          displaySerperApiKey: 'v3:looks-encrypted-but-is-attacker-input',
        },
      });
      const webSearch = out.webSearch as Record<string, string>;
      expect(decryptV3(webSearch.serperApiKey)).toBe('sk-real-secret');
      expect(webSearch.displaySerperApiKey).toBe(getDisplaySecretKey('sk-real-secret'));
      expect(webSearch.displaySerperApiKey).not.toBe('v3:looks-encrypted-but-is-attacker-input');
    });

    it('never encrypts or stores a display-path value submitted without its real secret, even if it looks like a secret literal', () => {
      const out = encryptConfigSecrets({
        ocr: { displayApiKey: 'this-should-never-be-treated-as-a-secret', mistralModel: 'x' },
      });
      expect(out.ocr).not.toHaveProperty('displayApiKey');
      expect(out.ocr).not.toHaveProperty('apiKey');
      expect(out.ocr.mistralModel).toBe('x');
    });
  });
});
