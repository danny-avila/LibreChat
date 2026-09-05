process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let decryptConfigSecret: typeof import('./secrets').decryptConfigSecret;
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let encryptConfigSecrets: typeof import('./secrets').encryptConfigSecrets;
let encryptLegacyPlaintextConfigSecrets: typeof import('./secrets').encryptLegacyPlaintextConfigSecrets;
let getArrayExistingIdentityConflictError: typeof import('./secrets').getArrayExistingIdentityConflictError;
let getSecretPreview: typeof import('./secrets').getSecretPreview;
let getConfigSecretInputError: typeof import('./secrets').getConfigSecretInputError;
let getConfigSecretMutationPaths: typeof import('./secrets').getConfigSecretMutationPaths;
let getConfigSecretSections: typeof import('./secrets').getConfigSecretSections;
let isConfigSecretAncestorPath: typeof import('./secrets').isConfigSecretAncestorPath;
let isConfigSecretDescendantPath: typeof import('./secrets').isConfigSecretDescendantPath;
let isConfigSecretPreservablePatch: typeof import('./secrets').isConfigSecretPreservablePatch;
let preserveConfigSecrets: typeof import('./secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let resolveConfigSecret: typeof import('./secrets').resolveConfigSecret;
let resolveCustomEndpointSecrets: typeof import('./secrets').resolveCustomEndpointSecrets;
let resolveMcpSecretHintBatch: typeof import('./secrets').resolveMcpSecretHintBatch;
let resolveMcpSecretHintBatchForWholeDocument: typeof import('./secrets').resolveMcpSecretHintBatchForWholeDocument;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({
    decryptConfigSecret,
    encryptConfigSecretFields,
    encryptConfigSecrets,
    encryptLegacyPlaintextConfigSecrets,
    getArrayExistingIdentityConflictError,
    getSecretPreview,
    getConfigSecretInputError,
    getConfigSecretMutationPaths,
    getConfigSecretSections,
    isConfigSecretAncestorPath,
    isConfigSecretDescendantPath,
    isConfigSecretPreservablePatch,
    preserveConfigSecrets,
    redactConfigSecrets,
    resolveConfigSecret,
    resolveCustomEndpointSecrets,
    resolveMcpSecretHintBatch,
    resolveMcpSecretHintBatchForWholeDocument,
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
    expect(out['langfuse.secretKeyPreview']).toBe('sk-lf-...cret');
    expect(out['langfuse.publicKey']).toBe('pk-lf-1');
  });

  it('encrypts object writes and removes client-supplied secret previews', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-lf-1',
        secretKey: 'sk-lf-secret',
        secretKeyPreview: 'spoofed',
      },
    });

    expect(out.langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(out.langfuse.secretKey)).toBe('sk-lf-secret');
    expect(out.langfuse.secretKeyPreview).toBe('sk-lf-...cret');
    expect(out.langfuse.publicKey).toBe('pk-lf-1');
  });

  it('clears empty or non-string secret values', () => {
    expect(encryptConfigSecretFields({ 'langfuse.secretKey': '' })).toEqual({
      'langfuse.secretKey': '',
      'langfuse.secretKeyPreview': '',
    });

    expect(
      encryptConfigSecrets({
        langfuse: {
          secretKey: null,
          secretKeyPreview: 'spoofed',
        },
      }),
    ).toEqual({
      langfuse: {
        secretKey: '',
        secretKeyPreview: '',
      },
    });
  });

  it('rejects protected display-key writes and encrypted secret submissions', () => {
    expect(getConfigSecretInputError('langfuse.secretKeyPreview', 'spoofed')).toContain(
      'protected secret preview path',
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
    expect(preservedLangfuse.secretKeyPreview).toBe(existingLangfuse.secretKeyPreview);
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
    expect(preservedLangfuse.secretKeyPreview).toBe(getSecretPreview('sk-plain-existing'));

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
        secretKeyPreview: '',
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
    expect(preservedLangfuse.secretKeyPreview).toBe(existingLangfuse.secretKeyPreview);
    expect(preserved.publicKey).toBe('pk-new');
  });

  it('redacts secret values while preserving secret previews', () => {
    const redacted = redactConfigSecrets({
      'langfuse.secretKey': 'literal',
      'langfuse.secretKeyPreview': 'literal-display',
      langfuse: {
        enabled: true,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKey: 'v3:abc:def',
        secretKeyPreview: 'sk-lf-...cret',
      },
    });

    expect(redacted['langfuse.secretKey']).toBeUndefined();
    expect(redacted['langfuse.secretKeyPreview']).toBeUndefined();
    expect(redacted.langfuse).toEqual({
      enabled: true,
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKeyPreview: 'sk-lf-...cret',
    });
  });

  it('masks Langfuse header values while keeping their names', () => {
    const redacted = redactConfigSecrets({
      langfuse: {
        enabled: true,
        publicKey: 'pk-lf-1',
        headers: {
          'CF-Access-Client-Id': 'client-id',
          'CF-Access-Client-Secret': 'gateway-credential',
        },
      },
    });

    /** These reach `GET /api/admin/config/base` from librechat.yaml, where no
     *  scalar secret registration covers them — unmasked, any delegated admin
     *  with Langfuse read access receives the raw gateway credential. */
    expect(redacted.langfuse).toEqual({
      enabled: true,
      publicKey: 'pk-lf-1',
      headers: { 'CF-Access-Client-Id': '***', 'CF-Access-Client-Secret': '***' },
    });
    expect(JSON.stringify(redacted)).not.toContain('gateway-credential');
  });

  it('drops a malformed Langfuse headers value rather than serializing it', () => {
    const redacted = redactConfigSecrets({
      langfuse: { publicKey: 'pk-lf-1', headers: 'Bearer raw-credential' },
    });

    expect(redacted.langfuse).toEqual({ publicKey: 'pk-lf-1' });
    expect(JSON.stringify(redacted)).not.toContain('raw-credential');
  });

  it('strips legacy displaySecretKey companions and migrates them on preserve', () => {
    const redacted = redactConfigSecrets({
      langfuse: { publicKey: 'pk-lf-1', secretKey: 'v3:abc:def', displaySecretKey: 'sk-lf-...old' },
    });
    expect(redacted.langfuse).toEqual({ publicKey: 'pk-lf-1', secretKeyPreview: 'sk-lf-...old' });

    const alreadyMigrated = redactConfigSecrets({
      langfuse: {
        secretKey: 'v3:abc:def',
        secretKeyPreview: 'sk-lf-...new',
        displaySecretKey: 'sk-lf-...old',
      },
    });
    expect(alreadyMigrated.langfuse).toEqual({ secretKeyPreview: 'sk-lf-...new' });

    const encrypted = encryptConfigSecrets({
      langfuse: { secretKey: 'sk-lf-new-secret', displaySecretKey: 'sk-lf-...old' },
    }).langfuse as Record<string, string>;
    expect(encrypted.displaySecretKey).toBeUndefined();
    expect(encrypted.secretKeyPreview).toBe('sk-lf-...cret');

    const existing = {
      langfuse: {
        secretKey: encryptConfigSecrets({ langfuse: { secretKey: 'sk-lf-old-secret' } }).langfuse
          .secretKey,
        displaySecretKey: 'sk-lf-...cret',
      },
    };
    const preserved = preserveConfigSecrets({ langfuse: { publicKey: 'pk-new' } }, existing);
    const preservedLangfuse = preserved.langfuse as Record<string, string>;
    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-lf-old-secret');
    expect(preservedLangfuse.secretKeyPreview).toBe('sk-lf-...cret');
    expect(preservedLangfuse.displaySecretKey).toBeUndefined();

    expect(getConfigSecretInputError('langfuse.displaySecretKey', 'spoofed')).toContain(
      'protected secret preview path',
    );
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
    expect(dottedOut['ocr.apiKeyPreview']).toBe('');

    const objectOut = encryptConfigSecrets({
      ocr: { apiKey: '${OCR_API_KEY}', apiKeyPreview: 'sk-sta...LE00' },
    });
    expect(objectOut.ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(objectOut.ocr.apiKeyPreview).toBe('');
  });

  it('never persists a client-supplied display mask alongside an env placeholder secret', () => {
    const out = encryptConfigSecrets({
      ocr: { apiKey: '${OCR_API_KEY}', apiKeyPreview: 'sk-atk...ACK' },
    });
    expect(out.ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(out.ocr.apiKeyPreview).toBe('');
  });

  it('trims whitespace from a literal secret before encrypting and masking', () => {
    const out = encryptConfigSecretFields({ 'ocr.apiKey': '  sk-padded-secret  ' });
    expect(decryptV3(out['ocr.apiKey'] as string)).toBe('sk-padded-secret');
    expect(out['ocr.apiKeyPreview']).toBe(getSecretPreview('sk-padded-secret'));
  });

  it('treats a whitespace-only literal secret as empty and clears it', () => {
    const out = encryptConfigSecretFields({ 'ocr.apiKey': '   ' });
    expect(out['ocr.apiKey']).toBe('');
    expect(out['ocr.apiKeyPreview']).toBe('');
  });

  it('masks short credentials fully instead of disclosing them via the preview companion', () => {
    expect(getSecretPreview('short12')).toBe('*******');
    expect(getSecretPreview('0123456789')).toBe('**********');
    expect(getSecretPreview('sk-longer-secret-value')).toBe('sk-lon...alue');
  });

  it('encrypts dotted patch writes and sets a masked preview companion for every field', () => {
    const out = encryptConfigSecretFields({
      'speech.tts.openai.apiKey': 'sk-tts',
      'webSearch.serperApiKey': '${SERPER_API_KEY}',
      'ocr.apiKey': '',
    });

    expect(decryptV3(out['speech.tts.openai.apiKey'] as string)).toBe('sk-tts');
    expect(out['speech.tts.openai.apiKeyPreview']).toBe(getSecretPreview('sk-tts'));
    expect(out['webSearch.serperApiKey']).toBe('${SERPER_API_KEY}');
    expect(out['webSearch.serperApiKeyPreview']).toBe('');
    expect(out['ocr.apiKey']).toBe('');
    expect(out['ocr.apiKeyPreview']).toBe('');
    expect(Object.keys(out).sort()).toEqual([
      'ocr.apiKey',
      'ocr.apiKeyPreview',
      'speech.tts.openai.apiKey',
      'speech.tts.openai.apiKeyPreview',
      'webSearch.serperApiKey',
      'webSearch.serperApiKeyPreview',
    ]);
  });

  it('encrypts secrets nested inside object-valued ancestor patch entries and sets their preview companion', () => {
    type SpeechPatch = { tts: { openai: Record<string, string> } };
    const sectionPatch = encryptConfigSecretFields({
      speech: { tts: { openai: { apiKey: 'sk-tts', model: 'tts-1' } } },
    });
    const speech = sectionPatch.speech as SpeechPatch;
    expect(decryptV3(speech.tts.openai.apiKey)).toBe('sk-tts');
    expect(speech.tts.openai.apiKeyPreview).toBe(getSecretPreview('sk-tts'));
    expect(speech.tts.openai.model).toBe('tts-1');

    const midPatch = encryptConfigSecretFields({
      'speech.tts': { openai: { apiKey: 'sk-tts' } },
    });
    const tts = midPatch['speech.tts'] as SpeechPatch['tts'];
    expect(decryptV3(tts.openai.apiKey)).toBe('sk-tts');
    expect(tts.openai.apiKeyPreview).toBe(getSecretPreview('sk-tts'));

    const leafParentPatch = encryptConfigSecretFields({
      'speech.tts.openai': { apiKey: 'sk-tts', model: 'tts-1' },
    });
    const openai = leafParentPatch['speech.tts.openai'] as Record<string, string>;
    expect(decryptV3(openai.apiKey)).toBe('sk-tts');
    expect(openai.apiKeyPreview).toBe(getSecretPreview('sk-tts'));
  });

  it('strips dotted registry-related keys, including preview companions, from whole-override writes', () => {
    const out = encryptConfigSecrets({
      'speech.tts.openai.apiKey': 'sk-smuggled',
      'speech.tts.openai.apiKeyPreview': 'sk-spoofed...display',
      'ocr.apiKey': 'sk-smuggled',
      'webSearch.serperApiKey.nested': 'sk-smuggled',
      'speech.tts': { openai: { apiKey: 'sk-smuggled' } },
      ocr: { apiKey: 'sk-legit' } as Record<string, string>,
    });

    expect(out).not.toHaveProperty(['speech.tts.openai.apiKey']);
    expect(out).not.toHaveProperty(['speech.tts.openai.apiKeyPreview']);
    expect(out).not.toHaveProperty(['ocr.apiKey']);
    expect(out).not.toHaveProperty(['webSearch.serperApiKey.nested']);
    expect(out).not.toHaveProperty(['speech.tts']);
    expect(decryptV3(out.ocr.apiKey)).toBe('sk-legit');
    expect(out.ocr.apiKeyPreview).toBe(getSecretPreview('sk-legit'));
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

  it('redacts secrets but keeps preview companions, env placeholders, and siblings visible on read', () => {
    const redacted = redactConfigSecrets({
      speech: {
        tts: {
          openai: {
            apiKey: 'sk-literal',
            apiKeyPreview: getSecretPreview('sk-literal'),
            model: 'tts-1',
          },
        },
        stt: {
          openai: { apiKey: 'v3:abc:def', apiKeyPreview: 'sk-old...-old', model: 'whisper-1' },
        },
      },
      ocr: { apiKey: '${OCR_API_KEY}', mistralModel: 'mistral-ocr-latest' },
      webSearch: {
        serperApiKey: 'sk-literal',
        serperApiKeyPreview: 'sk-lite...eral',
        searchProvider: 'serper',
      },
    });

    expect(redacted.speech.tts.openai).toEqual({
      apiKeyPreview: getSecretPreview('sk-literal'),
      model: 'tts-1',
    });
    expect(redacted.speech.stt.openai).toEqual({
      apiKeyPreview: 'sk-old...-old',
      model: 'whisper-1',
    });
    expect(redacted.ocr).toEqual({
      apiKey: '${OCR_API_KEY}',
      mistralModel: 'mistral-ocr-latest',
    });
    expect(redacted.webSearch).toEqual({
      serperApiKeyPreview: 'sk-lite...eral',
      searchProvider: 'serper',
    });
  });

  it('preserves omitted encrypted secrets and their preview companion on nested object writes', () => {
    const existing = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: 'sk-old', model: 'tts-1' } as Record<string, string> } },
    });
    const existingDisplay = existing.speech.tts.openai.apiKeyPreview;
    expect(existingDisplay).toBe(getSecretPreview('sk-old'));

    const next = preserveConfigSecrets(
      { speech: { tts: { openai: { model: 'tts-2' } as Record<string, string> } } },
      existing,
    );
    expect(decryptV3(next.speech.tts.openai.apiKey)).toBe('sk-old');
    expect(next.speech.tts.openai.apiKeyPreview).toBe(existingDisplay);
    expect(next.speech.tts.openai.model).toBe('tts-2');

    const providerRemoved = preserveConfigSecrets({ speech: { tts: {} } }, existing);
    expect(providerRemoved.speech.tts).toEqual({});

    const ancestorPatch = preserveConfigSecrets(
      { openai: { model: 'tts-2' } as Record<string, string> },
      existing,
      'speech.tts',
    );
    expect(decryptV3(ancestorPatch.openai.apiKey)).toBe('sk-old');
    expect(ancestorPatch.openai.apiKeyPreview).toBe(existingDisplay);
  });

  it('does not preserve explicitly cleared secrets, and clears the preview companion too', () => {
    const cleared = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: '' } as Record<string, string> } },
    });
    expect(cleared.speech.tts.openai.apiKeyPreview).toBe('');
    const existing = encryptConfigSecrets({
      speech: { tts: { openai: { apiKey: 'sk-old' } as Record<string, string> } },
    });
    const preservedAfterClear = preserveConfigSecrets(cleared, existing);
    expect(preservedAfterClear.speech.tts.openai.apiKey).toBe('');
    expect(preservedAfterClear.speech.tts.openai.apiKeyPreview).toBe('');
  });

  it('migrates a legacy plaintext existing secret on an omitted allow-placeholder field too', () => {
    const fromPlaintext = preserveConfigSecrets(
      { ocr: { mistralModel: 'm' } },
      { ocr: { apiKey: 'sk-plain-existing' } },
    );
    const ocr = fromPlaintext.ocr as Record<string, string>;
    expect(ocr.mistralModel).toBe('m');
    expect(decryptV3(ocr.apiKey)).toBe('sk-plain-existing');
    expect(ocr.apiKeyPreview).toBe(getSecretPreview('sk-plain-existing'));
  });

  it('preserves an existing env placeholder secret verbatim without encrypting it', () => {
    const fromPlaceholder = preserveConfigSecrets(
      { ocr: { mistralModel: 'm' } },
      { ocr: { apiKey: '${OCR_API_KEY}' } },
    );
    const ocr = fromPlaceholder.ocr as Record<string, string>;
    expect(ocr.apiKey).toBe('${OCR_API_KEY}');
    expect(ocr.apiKeyPreview).toBeUndefined();
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
    expect(resolveConfigSecret('v3:not-valid-ciphertext')).toBe('v3:not-valid-ciphertext');
    expect(resolveConfigSecret('v3:provider-literal-token')).toBe('v3:provider-literal-token');
  });

  it('reports mutation paths (including the preview companion) and ancestor/descendant checks for registry fields', () => {
    expect(getConfigSecretMutationPaths('speech.tts.openai.apiKey')).toEqual([
      'speech.tts.openai.apiKey',
      'speech.tts.openai.apiKeyPreview',
    ]);
    expect(getConfigSecretMutationPaths('webSearch.serperApiKey')).toEqual([
      'webSearch.serperApiKey',
      'webSearch.serperApiKeyPreview',
    ]);
    expect(getConfigSecretMutationPaths('langfuse.secretKey')).toEqual([
      'langfuse.secretKey',
      'langfuse.secretKeyPreview',
    ]);
    expect(getConfigSecretMutationPaths('speech.tts.openai.apiKeyPreview')).toEqual([
      'speech.tts.openai.apiKeyPreview',
    ]);

    for (const path of ['speech', 'speech.tts', 'speech.tts.openai', 'ocr', 'webSearch']) {
      expect(isConfigSecretAncestorPath(path)).toBe(true);
    }
    expect(isConfigSecretAncestorPath('speech.tts.openai.apiKey')).toBe(false);
    expect(isConfigSecretAncestorPath('interface')).toBe(false);

    expect(isConfigSecretDescendantPath('speech.tts.openai.apiKey.hidden')).toBe(true);
    expect(isConfigSecretDescendantPath('webSearch.serperApiKey.hidden')).toBe(true);
    expect(isConfigSecretDescendantPath('speech.tts.openai.apiKeyPreview.hidden')).toBe(true);
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

  describe('preview companion fields are write-side read-only for every registered field', () => {
    it.each([
      'ocr.apiKeyPreview',
      'speech.tts.openai.apiKeyPreview',
      'speech.stt.azureOpenAI.apiKeyPreview',
      'webSearch.serperApiKeyPreview',
      'webSearch.cohereApiKeyPreview',
      'endpoints.assistants.apiKeyPreview',
      'endpoints.azureAssistants.apiKeyPreview',
      'langfuse.secretKeyPreview',
    ])('rejects a direct dotted-patch write to %s', (previewPath) => {
      expect(getConfigSecretInputError(previewPath, 'attacker-supplied-display-value')).toContain(
        'Cannot write protected secret preview path',
      );
    });

    it('drops a client-supplied display value when the ancestor object omits the real secret, never storing it', () => {
      const out = encryptConfigSecretFields({
        speech: { tts: { openai: { model: 'tts-1', apiKeyPreview: 'attacker-injected-display' } } },
      });
      const openai = (out.speech as { tts: { openai: Record<string, unknown> } }).tts.openai;
      expect(openai).not.toHaveProperty('apiKeyPreview');
      expect(openai.model).toBe('tts-1');
    });

    it('overwrites a client-supplied display value with the server-computed one when a real secret is also present, never persisting the attacker value', () => {
      const out = encryptConfigSecretFields({
        webSearch: {
          serperApiKey: 'sk-real-secret',
          serperApiKeyPreview: 'v3:looks-encrypted-but-is-attacker-input',
        },
      });
      const webSearch = out.webSearch as Record<string, string>;
      expect(decryptV3(webSearch.serperApiKey)).toBe('sk-real-secret');
      expect(webSearch.serperApiKeyPreview).toBe(getSecretPreview('sk-real-secret'));
      expect(webSearch.serperApiKeyPreview).not.toBe('v3:looks-encrypted-but-is-attacker-input');
    });

    it('never encrypts or stores a display-path value submitted without its real secret, even if it looks like a secret literal', () => {
      const out = encryptConfigSecrets({
        ocr: { apiKeyPreview: 'this-should-never-be-treated-as-a-secret', mistralModel: 'x' },
      });
      expect(out.ocr).not.toHaveProperty('apiKeyPreview');
      expect(out.ocr).not.toHaveProperty('apiKey');
      expect(out.ocr.mistralModel).toBe('x');
    });
  });
});

describe('Custom endpoint config secrets', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });

  it('encrypts literal API keys on full-document writes and stores display companions', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', apiKey: 'sk-or-super-secret', baseURL: 'https://openrouter.ai' },
      ]),
    );
    const entry = out.endpoints.custom[0] as Record<string, string>;

    expect(entry.apiKey).toMatch(/^v3:/);
    expect(decryptV3(entry.apiKey)).toBe('sk-or-super-secret');
    expect(entry.apiKeyPreview).toBe('sk-or-...cret');
    expect(entry.baseURL).toBe('https://openrouter.ai');
  });

  it('leaves user_provided and env-reference API keys readable', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'user_provided', apiKeyPreview: 'spoofed' },
        { name: 'B', apiKey: '${OPENROUTER_KEY}' },
      ]),
    );
    const [a, b] = out.endpoints.custom as Array<Record<string, string>>;

    expect(a.apiKey).toBe('user_provided');
    expect(a.apiKeyPreview).toBeUndefined();
    expect(b.apiKey).toBe('${OPENROUTER_KEY}');
    expect(b.apiKeyPreview).toBeUndefined();
  });

  it('encrypts section and array patched values from field maps', () => {
    const viaSection = encryptConfigSecretFields({
      endpoints: { custom: [{ name: 'A', apiKey: 'sk-section-key' }] },
    });
    const sectionEntry = (viaSection.endpoints as { custom: Array<Record<string, string>> })
      .custom[0];
    expect(decryptV3(sectionEntry.apiKey)).toBe('sk-section-key');
    expect(sectionEntry.apiKeyPreview).toBe('sk-sec...-key');

    const viaArray = encryptConfigSecretFields({
      'endpoints.custom': [{ name: 'A', apiKey: 'sk-array-key0' }],
    });
    const arrayEntry = (viaArray['endpoints.custom'] as Array<Record<string, string>>)[0];
    expect(decryptV3(arrayEntry.apiKey)).toBe('sk-array-key0');
    expect(arrayEntry.apiKeyPreview).toBe('sk-arr...key0');
  });

  it('clears empty, non-string, or pre-encrypted API key submissions', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: '' },
        { name: 'B', apiKey: null },
        { name: 'C', apiKey: 'v3:smuggled', apiKeyPreview: 'spoofed' },
      ]),
    );

    for (const item of out.endpoints.custom as Array<Record<string, string>>) {
      expect(item.apiKey).toBe('');
      expect(item.apiKeyPreview).toBe('');
    }
  });

  it('rejects encrypted submissions and indexed secret writes', () => {
    expect(
      getConfigSecretInputError('endpoints', { custom: [{ name: 'A', apiKey: 'v3:smuggled' }] }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('endpoints.custom', [{ name: 'A', apiKey: 'v3:smuggled' }]),
    ).toContain('Encrypted config secret values');
    expect(getConfigSecretInputError('endpoints', [])).toBeNull();
    expect(getConfigSecretInputError('endpoints.custom.0.apiKey', 'sk-new')).toContain(
      'Cannot write secret fields by array index',
    );
    expect(getConfigSecretInputError('endpoints.custom.0.apiKeyPreview', undefined)).toContain(
      'Cannot write secret fields by array index',
    );
    expect(
      getConfigSecretInputError('endpoints.custom.0', { name: 'A', apiKey: 'sk-new' }),
    ).toContain('Cannot replace endpoints.custom entries by array index');
    expect(getConfigSecretInputError('endpoints.custom.0', { name: 'A' })).toContain(
      'Cannot replace endpoints.custom entries by array index',
    );
    expect(getConfigSecretInputError('endpoints.custom.0.baseURL', 'https://x')).toBeNull();
    expect(getConfigSecretInputError('endpoints.custom.apiKey', 'sk-smuggled')).toContain(
      'has no named fields',
    );
    expect(getConfigSecretInputError('endpoints.custom.slot.apiKey', 'sk-smuggled')).toContain(
      'has no named fields',
    );
    expect(getConfigSecretInputError('endpoints.custom.apiKeyPreview', 'spoofed')).toContain(
      'has no named fields',
    );
    expect(
      getConfigSecretInputError('endpoints.custom', [{ name: 'A', apiKey: 'sk-plain-1234' }]),
    ).toBeNull();
  });

  it('rejects and strips non-array protected containers', () => {
    expect(getConfigSecretInputError('endpoints', { custom: { apiKey: 'sk-smuggled' } })).toContain(
      'Protected secret container must be an array',
    );
    expect(getConfigSecretInputError('endpoints.custom', { apiKey: 'sk-smuggled' })).toContain(
      'Protected secret container must be an array',
    );
    expect(getConfigSecretInputError('endpoints', { custom: null })).toContain(
      'Protected secret container must be an array',
    );
    expect(getConfigSecretInputError('endpoints.custom', null)).toContain(
      'Protected secret container must be an array',
    );
    expect(getConfigSecretInputError('endpoints.custom', undefined)).toBeNull();

    const encrypted = encryptConfigSecrets({ endpoints: { custom: { apiKey: 'sk-smuggled' } } });
    expect(encrypted.endpoints).toEqual({});

    const nullStripped = encryptConfigSecrets({ endpoints: { custom: null } });
    expect(nullStripped.endpoints).toEqual({});

    const redacted = redactConfigSecrets({ endpoints: { custom: { apiKey: 'sk-smuggled' } } });
    expect(redacted.endpoints).toEqual({});

    const fields = encryptConfigSecretFields({ 'endpoints.custom': { apiKey: 'sk-smuggled' } });
    expect(fields['endpoints.custom']).toBeUndefined();
  });

  it('rejects positional-operator writes to secret fields', () => {
    expect(getConfigSecretInputError('endpoints.custom.$[].apiKey', 'sk-new-value')).toContain(
      'Cannot write secret fields by array index',
    );
    expect(getConfigSecretInputError('endpoints.custom.$.apiKeyPreview', 'spoof')).toContain(
      'Cannot write secret fields by array index',
    );
    expect(
      getConfigSecretInputError('endpoints.custom.$[elem]', { name: 'A', apiKey: 'sk-new' }),
    ).toContain('Cannot replace endpoints.custom entries by array index');
  });

  it('fully masks display previews of short secrets', () => {
    const out = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'secret' }]));
    const entry = out.endpoints.custom[0] as Record<string, string>;

    expect(decryptV3(entry.apiKey)).toBe('secret');
    expect(entry.apiKeyPreview).toBe('******');
  });

  it('preserves omitted API keys by endpoint name across redacted round-trips', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', apiKey: 'sk-or-old-secret' },
        { name: 'Renamed', apiKey: 'sk-renamed-1234' },
      ]),
    );

    const next = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', baseURL: 'https://openrouter.ai' },
        { name: 'BrandNew', baseURL: 'https://new.example' },
      ]),
    );
    const preserved = preserveConfigSecrets(next, existing);
    const [openRouter, brandNew] = preserved.endpoints.custom as Array<Record<string, string>>;

    expect(decryptV3(openRouter.apiKey)).toBe('sk-or-old-secret');
    expect(openRouter.apiKeyPreview).toBe('sk-or-...cret');
    expect(brandNew.apiKey).toBeUndefined();
  });

  it('preserves and encrypts plaintext-legacy API keys on redacted round-trips', () => {
    const existing = endpointsWith([
      { name: 'Legacy', apiKey: 'sk-legacy-plaintext' },
      { name: 'EnvRef', apiKey: '${OPENROUTER_KEY}' },
    ]);
    const next = encryptConfigSecrets(
      endpointsWith([
        { name: 'Legacy', baseURL: 'https://legacy.example' },
        { name: 'EnvRef', baseURL: 'https://ref.example' },
      ]),
    );

    const preserved = preserveConfigSecrets(next, existing);
    const [legacy, envRef] = preserved.endpoints.custom as Array<Record<string, string>>;

    expect(legacy.apiKey).toMatch(/^v3:/);
    expect(decryptV3(legacy.apiKey)).toBe('sk-legacy-plaintext');
    expect(legacy.apiKeyPreview).toBe('sk-leg...text');
    expect(envRef.apiKey).toBeUndefined();
  });

  it('matches identities verbatim so whitespace-distinct names keep their own keys', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'Prod', apiKey: 'sk-prod-exact-key' },
        { name: ' Prod ', apiKey: 'sk-prod-spaced-key' },
      ]),
    );
    const next = encryptConfigSecrets(endpointsWith([{ name: 'Prod' }, { name: ' Prod ' }]));

    const preserved = preserveConfigSecrets(next, existing);
    const [exact, spaced] = preserved.endpoints.custom as Array<Record<string, string>>;

    expect(decryptV3(exact.apiKey)).toBe('sk-prod-exact-key');
    expect(decryptV3(spaced.apiKey)).toBe('sk-prod-spaced-key');
  });

  it('does not preserve keys for duplicated endpoint identities', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'Doubled', apiKey: 'sk-first-key-value' },
        { name: 'Doubled', apiKey: 'sk-second-key-value' },
        { name: 'Unique', apiKey: 'sk-unique-key-value' },
      ]),
    );
    const next = encryptConfigSecrets(endpointsWith([{ name: 'Doubled' }, { name: 'Unique' }]));

    const preserved = preserveConfigSecrets(next, existing);
    const [doubled, unique] = preserved.endpoints.custom as Array<Record<string, string>>;

    expect(doubled.apiKey).toBeUndefined();
    expect(decryptV3(unique.apiKey)).toBe('sk-unique-key-value');
  });

  it('preserves omitted API keys for array-valued patches, not cleared ones', () => {
    const existing = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-old-value' }]));

    const kept = preserveConfigSecrets(
      [{ name: 'A', baseURL: 'https://a.example' }],
      existing,
      'endpoints.custom',
    ) as Array<Record<string, string>>;
    expect(decryptV3(kept[0].apiKey)).toBe('sk-old-value');

    const cleared = preserveConfigSecrets(
      encryptConfigSecrets([{ name: 'A', apiKey: '' }], 'endpoints.custom'),
      existing,
      'endpoints.custom',
    ) as Array<Record<string, string>>;
    expect(cleared[0].apiKey).toBe('');
    expect(cleared[0].apiKeyPreview).toBe('');
  });

  it('redacts encrypted and plaintext-legacy keys while keeping readable references', () => {
    const redacted = redactConfigSecrets({
      endpoints: {
        custom: [
          { name: 'A', apiKey: 'v3:abc:def', apiKeyPreview: 'sk-a...key' },
          { name: 'B', apiKey: 'sk-plaintext-legacy' },
          { name: 'C', apiKey: 'user_provided' },
          { name: 'D', apiKey: '${OPENROUTER_KEY}' },
          { name: 'E', apiKey: '' },
        ],
      },
    });
    const [a, b, c, d, e] = redacted.endpoints.custom as Array<Record<string, string>>;

    expect(a.apiKey).toBeUndefined();
    expect(a.apiKeyPreview).toBe('sk-a...key');
    expect(b.apiKey).toBeUndefined();
    expect(c.apiKey).toBe('user_provided');
    expect(d.apiKey).toBe('${OPENROUTER_KEY}');
    expect(e.apiKey).toBe('');
  });

  it('resolves stored values for runtime use', () => {
    const encrypted = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-runtime' }]))
      .endpoints.custom[0] as Record<string, string>;

    expect(resolveConfigSecret(encrypted.apiKey)).toBe('sk-runtime');
    expect(resolveConfigSecret('sk-plain')).toBe('sk-plain');
    expect(resolveConfigSecret('${OPENROUTER_KEY}')).toBe('${OPENROUTER_KEY}');
    expect(resolveConfigSecret('v3:provider-literal-token')).toBe('v3:provider-literal-token');
    expect(resolveConfigSecret('v3:not-valid-ciphertext')).toBe('v3:not-valid-ciphertext');

    const resolved = resolveCustomEndpointSecrets({ name: 'A', apiKey: encrypted.apiKey });
    expect(resolved.apiKey).toBe('sk-runtime');
    const passthrough = { name: 'B', apiKey: 'user_provided' };
    expect(resolveCustomEndpointSecrets(passthrough)).toBe(passthrough);
  });

  describe('encrypted headers nested inside an array entry (endpoints.custom[].headers)', () => {
    it('restores real v3 ciphertext headers by entry identity when the whole array is resubmitted with only an unrelated property (baseURL) changed', () => {
      // The admin panel redacts headers on read (deleting each secret entry
      // but leaving the container present as `{}`). ObjectEntryCard.tsx now
      // drops a credential-record container from its spread whenever it is
      // still plain-object-shaped (i.e. never touched via its KeyValueField,
      // which always converts a container to array-shape the moment the
      // admin genuinely edits it) — so the submitted entry's headers is
      // omitted, not `{}`, once only baseURL changed. This must round-trip
      // through the real v3 ciphertext shape a production Mongo snapshot
      // actually has, not a plaintext fixture.
      const existing = encryptConfigSecrets(
        endpointsWith([
          {
            name: 'OpenRouter',
            baseURL: 'https://openrouter.ai/api/v1',
            headers: { Authorization: 'Bearer gateway-token' },
          },
        ]),
      );
      const existingHeaders = (
        (existing.endpoints.custom[0] as Record<string, unknown>).headers as Record<string, string>
      ).Authorization;
      expect(existingHeaders).toMatch(/^v3:/);

      const submitted = [{ name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v2' }];
      const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom');
      const preservedEntry = (preserved as Array<Record<string, unknown>>)[0];
      const preservedHeaders = preservedEntry.headers as Record<string, string>;

      expect(preservedEntry.baseURL).toBe('https://openrouter.ai/api/v2');
      expect(decryptV3(preservedHeaders.Authorization)).toBe('Bearer gateway-token');
    });

    it('leaves a deliberately emptied headers map alone, never restoring stale ciphertext onto it', () => {
      // Complementary case to the one above: the container is PRESENT (even
      // as `{}`), which is the admin panel's — and this function's —
      // documented signal for "the admin touched this container," so it must
      // stay authoritative and never be silently repopulated.
      const existing = encryptConfigSecrets(
        endpointsWith([{ name: 'OpenRouter', headers: { Authorization: 'Bearer gateway-token' } }]),
      );
      const submitted = [{ name: 'OpenRouter', headers: {} }];
      const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom');
      const preservedHeaders = (preserved as Array<Record<string, unknown>>)[0].headers as Record<
        string,
        unknown
      >;

      expect(preservedHeaders).toEqual({});
    });

    it('deletes only the header the admin actually removed from a partial map, keeping the rest by entry identity', () => {
      const existing = encryptConfigSecrets(
        endpointsWith([
          {
            name: 'OpenRouter',
            headers: { Authorization: 'Bearer old-token', 'X-Custom': 'old-custom-value' },
          },
        ]),
      );
      const submitted = [{ name: 'OpenRouter', headers: { Authorization: 'Bearer new-token' } }];
      const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom');
      const preservedHeaders = (preserved as Array<Record<string, unknown>>)[0].headers as Record<
        string,
        string
      >;

      expect(preservedHeaders.Authorization).toBe('Bearer new-token');
      expect(preservedHeaders['X-Custom']).toBeUndefined();
      expect(Object.keys(preservedHeaders)).toEqual(['Authorization']);
    });

    it('does not restore anything for a different array entry (identity match, not position)', () => {
      const existing = encryptConfigSecrets(
        endpointsWith([
          { name: 'OpenRouter', headers: { Authorization: 'Bearer or-token' } },
          { name: 'Anyscale', headers: { Authorization: 'Bearer any-token' } },
        ]),
      );
      // Reordered relative to `existing`, plus OpenRouter's headers omitted
      // (matching the container-omitted case) — Anyscale's headers must
      // restore by its own identity, unaffected by OpenRouter's position.
      const submitted = [
        { name: 'Anyscale', baseURL: 'https://anyscale.example' },
        { name: 'OpenRouter', baseURL: 'https://openrouter.ai' },
      ];
      const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
        Record<string, unknown>
      >;
      const anyscaleHeaders = preserved[0].headers as Record<string, string>;
      const openRouterHeaders = preserved[1].headers as Record<string, string>;

      expect(decryptV3(anyscaleHeaders.Authorization)).toBe('Bearer any-token');
      expect(decryptV3(openRouterHeaders.Authorization)).toBe('Bearer or-token');
    });
  });
});

describe('array entry rename preserves credentials via the __previousIdentity hint', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });
  const azureWith = (groups: Array<Record<string, unknown>>) => ({
    endpoints: { azureOpenAI: { groups } },
  });

  it("restores a custom endpoint's real v3 apiKey and headers by __previousIdentity when its name changes", () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        {
          name: 'OpenRouter',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-gateway-key',
          headers: { Authorization: 'Bearer gateway-token' },
        },
      ]),
    );
    const existingEntry = existing.endpoints.custom[0] as Record<string, unknown>;
    expect(existingEntry.apiKey).toMatch(/^v3:/);
    expect((existingEntry.headers as Record<string, string>).Authorization).toMatch(/^v3:/);

    const submitted = [
      {
        name: 'OpenRouter EU',
        baseURL: 'https://openrouter.ai/api/v1',
        __previousIdentity: 'OpenRouter',
      },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom');
    const preservedEntry = (preserved as Array<Record<string, unknown>>)[0];

    expect(preservedEntry.name).toBe('OpenRouter EU');
    expect(decryptV3(preservedEntry.apiKey as string)).toBe('sk-gateway-key');
    expect(decryptV3((preservedEntry.headers as Record<string, string>).Authorization)).toBe(
      'Bearer gateway-token',
    );
    expect(preservedEntry).not.toHaveProperty('__previousIdentity');
  });

  it("restores an Azure group's real v3 apiKey and additionalHeaders by __previousIdentity when its group name changes", () => {
    const existing = encryptConfigSecrets(
      azureWith([
        {
          group: 'prod',
          apiKey: 'sk-azure-super-secret',
          additionalHeaders: { 'X-Region': 'us-east' },
        },
      ]),
    );
    const existingGroup = (
      existing.endpoints as { azureOpenAI: { groups: Array<Record<string, unknown>> } }
    ).azureOpenAI.groups[0];
    expect(existingGroup.apiKey).toMatch(/^v3:/);
    expect((existingGroup.additionalHeaders as Record<string, string>)['X-Region']).toMatch(/^v3:/);

    const submitted = [{ group: 'prod-eu', __previousIdentity: 'prod' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.azureOpenAI.groups');
    const preservedGroup = (preserved as Array<Record<string, unknown>>)[0];

    expect(preservedGroup.group).toBe('prod-eu');
    expect(decryptV3(preservedGroup.apiKey as string)).toBe('sk-azure-super-secret');
    expect(
      decryptV3((preservedGroup.additionalHeaders as Record<string, string>)['X-Region']),
    ).toBe('us-east');
    expect(preservedGroup).not.toHaveProperty('__previousIdentity');
  });

  it('does not restore anything for a rename with no __previousIdentity hint (pre-fix client shape)', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([{ name: 'OpenRouter', apiKey: 'sk-gateway-key' }]),
    );
    const submitted = [{ name: 'OpenRouter EU' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom');
    const preservedEntry = (preserved as Array<Record<string, unknown>>)[0];

    expect(preservedEntry.apiKey).toBeUndefined();
  });

  it('ignores an ambiguous hint claimed by two submitted entries, restoring credentials for neither', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([{ name: 'OpenRouter', apiKey: 'sk-gateway-key' }]),
    );
    const submitted = [
      { name: 'OpenRouter US', __previousIdentity: 'OpenRouter' },
      { name: 'OpenRouter EU', __previousIdentity: 'OpenRouter' },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
    expect(preserved[0]).not.toHaveProperty('__previousIdentity');
    expect(preserved[1]).not.toHaveProperty('__previousIdentity');
  });

  it('restores neither entry when a bare identity and a hint from another entry collide on the same origin', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([{ name: 'OpenRouter', apiKey: 'sk-or-key' }]),
    );
    // "OpenRouter" is submitted bare (no hint) and "OpenRouter EU" hints at
    // being a rename of "OpenRouter" too — this is genuinely ambiguous from
    // the wire data alone: the bare entry could be the same OpenRouter,
    // continuing unchanged, OR a brand-new entry that reused the name freed
    // up by the real rename (in which case the hinting entry is the one
    // that should inherit the credentials). Since the backend can't tell
    // which without a stale or forged hint on one side, neither may use the
    // stored entry's credentials.
    const submitted = [
      { name: 'OpenRouter' },
      { name: 'OpenRouter EU', __previousIdentity: 'OpenRouter' },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
  });

  it('strips the hint even when there is no existing array to restore from', () => {
    const submitted = [{ name: 'OpenRouter', __previousIdentity: 'OpenRouter' }];
    const preserved = preserveConfigSecrets(submitted, {}, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0]).not.toHaveProperty('__previousIdentity');
  });

  it('strips the hint on a brand-new configuration document (existing is undefined, not {})', () => {
    // {} and undefined are NOT the same input to preserveConfigSecrets: {} is
    // an object, so it reaches the array-secret cleanup below the top-level
    // null/object guard; undefined — the real shape of "no config document
    // has ever been saved for this principal" — previously short-circuited
    // that guard entirely, before preserveArraySecrets ever ran, letting
    // __previousIdentity persist verbatim into the freshly created document.
    const submitted = [{ name: 'OpenRouter', __previousIdentity: null }];
    const preserved = preserveConfigSecrets(submitted, undefined, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0]).not.toHaveProperty('__previousIdentity');
  });

  it('does not strip a persisted hint marker into a second save, breaking the entry it belongs to', () => {
    // Full lifecycle: first save (no existing document) persists the entry
    // with its apiKey and, before the fix above, a leaked __previousIdentity
    // marker. Redaction never touches that marker (it isn't a registered
    // secret path), so it survives into the next read verbatim. A second,
    // unrelated edit must not resend a marker that would tell the backend
    // "this entry has no origin" about an entry that plainly does.
    const firstSave = preserveConfigSecrets(
      encryptConfigSecrets(
        endpointsWith([{ name: 'OpenRouter', apiKey: 'sk-gateway-key', __previousIdentity: null }]),
      ),
      undefined,
    ) as { endpoints: { custom: Array<Record<string, unknown>> } };
    const storedEntry = firstSave.endpoints.custom[0];
    expect(storedEntry).not.toHaveProperty('__previousIdentity');
    expect(storedEntry.apiKey).toMatch(/^v3:/);

    // A subsequent, unrelated edit (baseURL only) submits the entry exactly
    // as the redacted read returned it, since the panel never received the
    // real apiKey to resubmit.
    const secondSave = preserveConfigSecrets(
      [{ name: 'OpenRouter', baseURL: 'https://new' }],
      firstSave,
      'endpoints.custom',
    ) as Array<Record<string, unknown>>;

    expect(decryptV3(secondSave[0].apiKey as string)).toBe('sk-gateway-key');
  });

  it('swaps credentials correctly when two entries swap identities in the same submission', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'sk-a-secret' },
        { name: 'B', apiKey: 'sk-b-secret' },
      ]),
    );
    // A becomes B and B becomes A, each carrying its own history via hint —
    // an exact-identity-only match would instead hand A's slot straight to
    // whichever entry now happens to be visibly named "A".
    const submitted = [
      { name: 'B', __previousIdentity: 'A' },
      { name: 'A', __previousIdentity: 'B' },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(decryptV3(preserved[0].apiKey as string)).toBe('sk-a-secret');
    expect(decryptV3(preserved[1].apiKey as string)).toBe('sk-b-secret');
  });

  it("restores the renamed entry's own credentials, not the deleted entry's, when a rename lands on a deleted identity", () => {
    // The admin deletes "B" and renames "A" to "B" in the same save. Exact
    // identity matching alone would attach B's (about to be discarded)
    // credentials to the surviving, renamed entry instead of A's.
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'sk-a-secret' },
        { name: 'B', apiKey: 'sk-b-secret' },
      ]),
    );
    const submitted = [{ name: 'B', __previousIdentity: 'A' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(decryptV3(preserved[0].apiKey as string)).toBe('sk-a-secret');
  });

  it('does not restore via a hint that targets a duplicated stored identity', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'sk-first-a-secret' },
        { name: 'A', apiKey: 'sk-second-a-secret' },
      ]),
    );
    const submitted = [{ name: 'A EU', __previousIdentity: 'A' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
  });

  it('restores neither entry when two entries share a destination name even with distinct hints', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'sk-a-secret' },
        { name: 'B', apiKey: 'sk-b-secret' },
      ]),
    );
    const submitted = [
      { name: 'X', __previousIdentity: 'A' },
      { name: 'X', __previousIdentity: 'B' },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
  });

  it('restores neither entry when a rename hint collides with a brand-new entry reusing the freed name', () => {
    // The admin renames A to X, then separately creates a fresh new entry
    // named A (reusing the name A just vacated). The new A has no hint (it
    // never existed before) and no credentials of its own to lose, but its
    // bare identity still collides with X's hint — exact-match-always-wins
    // would incorrectly hand the new, blank A the old A's credentials while
    // leaving the real renamed entry (X) with nothing.
    const existing = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-a-secret' }]));
    const submitted = [{ name: 'X', __previousIdentity: 'A' }, { name: 'A' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
  });

  it('does not restore credentials onto an entry with no usable destination identity', () => {
    const existing = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-a-secret' }]));
    const submitted = [{ name: '', __previousIdentity: 'A' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
  });

  it("does not resurrect a deleted entry's credentials onto a brand-new entry reusing its freed name", () => {
    // The admin deletes A entirely, then separately creates a genuinely new
    // endpoint also named A. Unlike the "rename hint collides" case above,
    // there is no competing claim left in the submission once the old A is
    // gone — an absent hint would fall back to bare-identity matching and
    // uniquely match stored A, silently handing the new entry the deleted
    // entry's apiKey and headers. The panel stamps every newly created entry
    // with an explicit __previousIdentity: null (not merely omitting the
    // field) specifically so this case is distinguishable from a genuinely
    // untouched entry, which never carries the key at all.
    const existing = encryptConfigSecrets(
      endpointsWith([
        {
          name: 'A',
          apiKey: 'sk-a-secret',
          headers: { Authorization: 'Bearer old-token' },
        },
      ]),
    );
    const submitted = [{ name: 'A', __previousIdentity: null }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[0].headers).toBeUndefined();
    expect(preserved[0]).not.toHaveProperty('__previousIdentity');
  });

  it('still restores a genuinely untouched entry that carries no hint key at all (backward compatibility)', () => {
    // Distinguishes the new explicit-null case above from the pre-existing,
    // still-supported fallback: an entry with the hint key entirely absent
    // (an old/non-upgraded client, or an untouched sibling the panel's own
    // merge layer resubmitted as-is) still matches by bare identity, exactly
    // like before this whole mechanism existed.
    const existing = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-a-secret' }]));
    const submitted = [{ name: 'A', baseURL: 'https://unchanged' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(decryptV3(preserved[0].apiKey as string)).toBe('sk-a-secret');
  });
});

describe('duplicate submitted identities never inherit hidden credentials', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });

  it('restores neither entry when two submitted entries share the same name as one existing entry', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        {
          name: 'OpenRouter',
          apiKey: 'sk-gateway-key',
          headers: { Authorization: 'Bearer gateway-token' },
        },
      ]),
    );
    // handleCreate in the panel appends without checking names, so a
    // submission can legitimately contain two entries with the same name.
    const submitted = [{ name: 'OpenRouter' }, { name: 'OpenRouter', baseURL: 'https://dup' }];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
    expect(preserved[0].headers).toBeUndefined();
    expect(preserved[1].headers).toBeUndefined();
  });

  it('still restores an unrelated, uniquely-named entry submitted alongside a duplicated pair', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', apiKey: 'sk-or-key' },
        { name: 'Anyscale', apiKey: 'sk-any-key' },
      ]),
    );
    const submitted = [
      { name: 'OpenRouter' },
      { name: 'OpenRouter' },
      { name: 'Anyscale', baseURL: 'https://anyscale.example' },
    ];
    const preserved = preserveConfigSecrets(submitted, existing, 'endpoints.custom') as Array<
      Record<string, unknown>
    >;

    expect(preserved[0].apiKey).toBeUndefined();
    expect(preserved[1].apiKey).toBeUndefined();
    expect(decryptV3(preserved[2].apiKey as string)).toBe('sk-any-key');
  });
});

describe('getArrayExistingIdentityConflictError', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });

  it('rejects a submission that targets a stored identity duplicated across two existing entries', () => {
    const existing = endpointsWith([
      { name: 'A', apiKey: 'v3:test:secret-1' },
      { name: 'A', apiKey: 'v3:test:secret-2' },
    ]);
    const submitted = [{ name: 'A', baseURL: 'https://new' }];

    const error = getArrayExistingIdentityConflictError('endpoints.custom', submitted, existing);
    expect(error).toMatch(/Ambiguous existing name in endpoints\.custom.*"A"/);
  });

  it('rejects via a rename hint that targets a duplicated stored identity too', () => {
    const existing = endpointsWith([
      { name: 'A', apiKey: 'v3:test:secret-1' },
      { name: 'A', apiKey: 'v3:test:secret-2' },
    ]);
    const submitted = [{ name: 'A EU', __previousIdentity: 'A' }];

    const error = getArrayExistingIdentityConflictError('endpoints.custom', submitted, existing);
    expect(error).toMatch(/Ambiguous existing name in endpoints\.custom/);
  });

  it('allows deleting every entry that targets the duplicated identity', () => {
    const existing = endpointsWith([
      { name: 'A', apiKey: 'v3:test:secret-1' },
      { name: 'A', apiKey: 'v3:test:secret-2' },
    ]);
    // Both ambiguous entries removed entirely — nothing left targets "A".
    const submitted = [{ name: 'B', apiKey: 'sk-new' }];

    expect(
      getArrayExistingIdentityConflictError('endpoints.custom', submitted, existing),
    ).toBeNull();
  });

  it('does not reject when the stored array has no duplicated identity', () => {
    const existing = endpointsWith([{ name: 'A', apiKey: 'v3:test:secret-1' }]);
    const submitted = [{ name: 'A', baseURL: 'https://new' }];

    expect(
      getArrayExistingIdentityConflictError('endpoints.custom', submitted, existing),
    ).toBeNull();
  });
});

describe('Azure OpenAI group API keys', () => {
  const azureWith = (groups: Array<Record<string, unknown>>) => ({
    endpoints: { azureOpenAI: { groups } },
  });

  it('encrypts literal group API keys and stores display companions', () => {
    const out = encryptConfigSecrets(
      azureWith([{ group: 'prod', apiKey: 'sk-azure-super-secret', instanceName: 'inst' }]),
    );
    const groups = out.endpoints as { azureOpenAI: { groups: Array<Record<string, string>> } };
    const entry = groups.azureOpenAI.groups[0];

    expect(entry.apiKey).toMatch(/^v3:/);
    expect(decryptV3(entry.apiKey)).toBe('sk-azure-super-secret');
    expect(entry.apiKeyPreview).toBe('sk-azu...cret');
    expect(entry.instanceName).toBe('inst');
  });

  it('leaves user_provided and env-reference group API keys readable', () => {
    const out = encryptConfigSecrets(
      azureWith([
        { group: 'A', apiKey: 'user_provided' },
        { group: 'B', apiKey: '${AZURE_GROUP_B_KEY}' },
      ]),
    );
    const [a, b] = (out.endpoints as { azureOpenAI: { groups: Array<Record<string, string>> } })
      .azureOpenAI.groups;

    expect(a.apiKey).toBe('user_provided');
    expect(b.apiKey).toBe('${AZURE_GROUP_B_KEY}');
  });

  it('preserves an omitted group API key by group name across a redacted round-trip', () => {
    const existing = encryptConfigSecrets(
      azureWith([{ group: 'prod', apiKey: 'sk-azure-old-secret' }]),
    );
    const next = encryptConfigSecrets(azureWith([{ group: 'prod', instanceName: 'inst2' }]));

    const preserved = preserveConfigSecrets(next, existing);
    const [entry] = (
      preserved.endpoints as { azureOpenAI: { groups: Array<Record<string, string>> } }
    ).azureOpenAI.groups;

    expect(decryptV3(entry.apiKey)).toBe('sk-azure-old-secret');
    expect(entry.instanceName).toBe('inst2');
  });

  it('encrypts a plaintext group apiKey submitted via the endpoints.azureOpenAI ancestor patch', () => {
    // endpoints.azureOpenAI sits between endpoints and the array-secret path
    // endpoints.azureOpenAI.groups, and carries no scalar CONFIG_SECRET_FIELDS
    // entry of its own — without azure-groups' ancestors registered, this
    // exact dotted-field patch shape reaches storage without encryption.
    const fields = encryptConfigSecretFields({
      'endpoints.azureOpenAI': {
        groups: [{ group: 'prod', apiKey: 'sk-ancestor-patch-secret', models: { 'gpt-4': true } }],
      },
    });
    const patched = fields['endpoints.azureOpenAI'] as { groups: Array<Record<string, string>> };

    expect(patched.groups[0].apiKey).toMatch(/^v3:/);
    expect(decryptV3(patched.groups[0].apiKey)).toBe('sk-ancestor-patch-secret');
    expect(patched.groups[0].apiKeyPreview).toBe('sk-anc...cret');
  });

  it('recognizes an endpoints.azureOpenAI ancestor patch as preservable and restores an omitted group apiKey', () => {
    const existing = encryptConfigSecrets(
      azureWith([{ group: 'prod', apiKey: 'sk-azure-old-secret' }]),
    );
    const submittedGroups = { groups: [{ group: 'prod', models: { 'gpt-4': true } }] };

    expect(isConfigSecretPreservablePatch('endpoints.azureOpenAI', submittedGroups)).toBe(true);

    const preserved = preserveConfigSecrets(submittedGroups, existing, 'endpoints.azureOpenAI') as {
      groups: Array<Record<string, unknown>>;
    };
    expect(decryptV3(preserved.groups[0].apiKey as string)).toBe('sk-azure-old-secret');
  });

  it('redacts group API keys on read while keeping the preview companion', () => {
    const redacted = redactConfigSecrets(
      azureWith([{ group: 'prod', apiKey: 'v3:abc:def', apiKeyPreview: 'sk-azu...cret' }]),
    );
    const [entry] = (
      redacted.endpoints as { azureOpenAI: { groups: Array<Record<string, string>> } }
    ).azureOpenAI.groups;

    expect(entry.apiKey).toBeUndefined();
    expect(entry.apiKeyPreview).toBe('sk-azu...cret');
  });

  it('rejects an encrypted group API key submission', () => {
    expect(
      getConfigSecretInputError('endpoints.azureOpenAI.groups', [
        { group: 'prod', apiKey: 'v3:smuggled' },
      ]),
    ).toContain('Encrypted config secret values');
  });
});

describe('webSearch.keenableApiKey', () => {
  it('encrypts a literal key and stores a display companion', () => {
    const out = encryptConfigSecretFields({ 'webSearch.keenableApiKey': 'sk-keenable-secret' });
    expect(decryptV3(out['webSearch.keenableApiKey'] as string)).toBe('sk-keenable-secret');
    expect(out['webSearch.keenableApiKeyPreview']).toBe(getSecretPreview('sk-keenable-secret'));
  });

  it('keeps an env placeholder readable without encrypting it', () => {
    const out = encryptConfigSecrets({ webSearch: { keenableApiKey: '${KEENABLE_API_KEY}' } });
    expect(out.webSearch.keenableApiKey).toBe('${KEENABLE_API_KEY}');
  });

  it('preserves an omitted existing key and redacts it on read', () => {
    const existing = encryptConfigSecrets({ webSearch: { keenableApiKey: 'sk-keenable-old' } });
    const next = preserveConfigSecrets({ webSearch: { keenableApiUrl: 'https://x' } }, existing);
    expect(decryptV3((next.webSearch as Record<string, string>).keenableApiKey)).toBe(
      'sk-keenable-old',
    );

    const redacted = redactConfigSecrets(existing);
    expect((redacted.webSearch as Record<string, unknown>).keenableApiKey).toBeUndefined();
  });

  it('rejects an encrypted keenableApiKey submission', () => {
    expect(getConfigSecretInputError('webSearch.keenableApiKey', 'v3:smuggled')).toContain(
      'Encrypted config secret values',
    );
  });
});

describe('Generic record-container secrets (headers, oauth_headers, additionalHeaders)', () => {
  it('encrypts header values at a whole-section write and preserves non-secret siblings', () => {
    const out = encryptConfigSecrets({
      endpoints: {
        openAI: {
          headers: { Authorization: 'Bearer gateway-token', 'X-Trace': 'abc' },
          models: { default: ['gpt-4'] },
        },
      },
    });
    const openAI = (out.endpoints as Record<string, unknown>).openAI as Record<string, unknown>;
    const headers = openAI.headers as Record<string, string>;

    expect(decryptV3(headers.Authorization)).toBe('Bearer gateway-token');
    expect(headers['X-Trace']).not.toBe('abc');
    expect(decryptV3(headers['X-Trace'])).toBe('abc');
    expect(openAI.models).toEqual({ default: ['gpt-4'] });
  });

  it('encrypts a header map submitted directly via a dotted-entry write to the container path', () => {
    const out = encryptConfigSecretFields({
      'endpoints.openAI.headers': { Authorization: 'Bearer gateway-token' },
    });
    const headers = out['endpoints.openAI.headers'] as Record<string, string>;
    expect(decryptV3(headers.Authorization)).toBe('Bearer gateway-token');
  });

  it('encrypts a header map submitted via a dotted-entry write to an ancestor object', () => {
    const out = encryptConfigSecretFields({
      'endpoints.openAI': { headers: { Authorization: 'Bearer gateway-token' } },
    });
    const openAI = out['endpoints.openAI'] as Record<string, unknown>;
    const headers = openAI.headers as Record<string, string>;
    expect(decryptV3(headers.Authorization)).toBe('Bearer gateway-token');
  });

  it('encrypts a real header literally named __previousIdentity on a non-mcpServers path — that hint protocol only applies to mcpServers headers/oauth_headers (Finding 1 regression)', () => {
    const out = encryptConfigSecrets({
      endpoints: { openAI: { headers: { __previousIdentity: 'gateway-secret' } } },
    }) as { endpoints: { openAI: { headers: Record<string, string> } } };
    expect(decryptV3(out.endpoints.openAI.headers.__previousIdentity)).toBe('gateway-secret');

    const fieldOut = encryptConfigSecretFields({
      'endpoints.openAI.headers': { __previousIdentity: 'gateway-secret-2' },
    });
    const headers = fieldOut['endpoints.openAI.headers'] as Record<string, string>;
    expect(decryptV3(headers.__previousIdentity)).toBe('gateway-secret-2');
  });

  it('clears an already-encrypted-looking submitted header value rather than storing it verbatim', () => {
    const out = encryptConfigSecrets({
      endpoints: { openAI: { headers: { Authorization: 'v3:looks-encrypted:but-attacker' } } },
    });
    const headers = (out.endpoints as Record<string, unknown>).openAI as Record<string, unknown>;
    expect((headers.headers as Record<string, unknown>).Authorization).toBeUndefined();
  });

  it('preserves an omitted header value and redacts headers on read, keeping the key names', () => {
    const existing = encryptConfigSecrets({
      endpoints: {
        openAI: { headers: { Authorization: 'Bearer old-token', 'X-Env': '${MY_ENV}' } },
      },
    });
    const next = preserveConfigSecrets(
      { endpoints: { openAI: { models: { default: ['gpt-4'] } } } },
      existing,
    );
    const nextOpenAI = (next.endpoints as Record<string, unknown>).openAI as Record<
      string,
      unknown
    >;
    const nextHeaders = nextOpenAI.headers as Record<string, string>;
    expect(decryptV3(nextHeaders.Authorization)).toBe('Bearer old-token');

    const redacted = redactConfigSecrets(existing);
    const redactedOpenAI = (redacted.endpoints as Record<string, unknown>).openAI as Record<
      string,
      unknown
    >;
    const redactedHeaders = redactedOpenAI.headers as Record<string, unknown>;
    expect(redactedHeaders.Authorization).toBeUndefined();
    expect(redactedHeaders['X-Env']).toBe('${MY_ENV}');
    expect(Object.keys(redactedHeaders)).toEqual(['X-Env']);
  });

  it('does not restore a header omitted from a partial map the admin submitted for a container that is present — deleting one credential must actually delete it', () => {
    const existing = encryptConfigSecrets({
      endpoints: {
        openAI: {
          headers: { Authorization: 'Bearer old-token', 'X-Custom': 'old-custom-value' },
        },
      },
    });
    // The admin's submission still HAS a headers key — it just dropped
    // X-Custom, matching the admin panel's own convention that a present
    // container (even partial) is authoritative.
    const next = preserveConfigSecrets(
      { endpoints: { openAI: { headers: { Authorization: 'Bearer new-token' } } } },
      existing,
    );
    const nextHeaders = (
      (next.endpoints as Record<string, unknown>).openAI as Record<string, unknown>
    ).headers as Record<string, string>;
    // preserveConfigSecrets only restores OMITTED secrets from `existing` —
    // encryption of what the admin actually submitted is encryptConfigSecrets'
    // job, run earlier in the real mutation pipeline; here the literal value
    // passes through preserveConfigSecrets unchanged.
    expect(nextHeaders.Authorization).toBe('Bearer new-token');
    expect(nextHeaders['X-Custom']).toBeUndefined();
    expect(Object.keys(nextHeaders)).toEqual(['Authorization']);
  });

  it('clears every header when the admin submits an explicit empty map for a present container', () => {
    const existing = encryptConfigSecrets({
      endpoints: {
        openAI: {
          headers: { Authorization: 'Bearer old-token', 'X-Custom': 'old-custom-value' },
        },
      },
    });
    const next = preserveConfigSecrets({ endpoints: { openAI: { headers: {} } } }, existing);
    const nextHeaders = (
      (next.endpoints as Record<string, unknown>).openAI as Record<string, unknown>
    ).headers as Record<string, string>;
    expect(nextHeaders).toEqual({});
  });

  it('rejects an encrypted-looking header value submitted at the container path or an ancestor', () => {
    expect(
      getConfigSecretInputError('endpoints.openAI.headers', { Authorization: 'v3:smuggled' }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('endpoints.openAI', {
        headers: { Authorization: 'v3:smuggled' },
      }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('endpoints.openAI.headers', { Authorization: 'Bearer legit' }),
    ).toBeNull();
  });

  it('never touches langfuse.headers through the generic container mechanism', () => {
    const out = encryptConfigSecrets({
      langfuse: { headers: { 'X-Gateway-Token': 'plaintext-gateway-secret' } },
    });
    expect((out.langfuse as Record<string, unknown>).headers).toEqual({
      'X-Gateway-Token': 'plaintext-gateway-secret',
    });
    expect(getConfigSecretInputError('langfuse.headers', { 'X-Gateway-Token': 'v3:x' })).toBeNull();
  });

  it('rejects a direct leaf-dotted write to a single header name, forcing the whole-container shape', () => {
    expect(
      getConfigSecretInputError('endpoints.openAI.headers.Authorization', 'Bearer new-token'),
    ).toContain('Cannot write headers fields by dotted leaf path');
    expect(getConfigSecretInputError('mcpServers.Jira.oauth_headers.X-Custom', 'value')).toContain(
      'Cannot write oauth_headers fields by dotted leaf path',
    );
    expect(
      encryptConfigSecretFields({ 'endpoints.openAI.headers.Authorization': 'Bearer new-token' }),
    ).toEqual({});
    // langfuse.headers.* is excluded — its own dedicated reject upstream
    // (isLangfuseHeadersFieldPath) handles it, matching the whole-container check above.
    expect(getConfigSecretInputError('langfuse.headers.X-Gateway-Token', 'value')).toBeNull();
  });

  it('recognizes a header-container-object patch as preservable so the existing document gets loaded', () => {
    expect(
      isConfigSecretPreservablePatch('endpoints.openAI.headers', { Authorization: 'Bearer x' }),
    ).toBe(true);
    expect(
      isConfigSecretPreservablePatch('endpoints.openAI', {
        headers: { Authorization: 'Bearer x' },
      }),
    ).toBe(true);
    expect(isConfigSecretPreservablePatch('endpoints.openAI', { models: { default: [] } })).toBe(
      false,
    );
  });
});

describe('mcpServers dynamic secret fields (oauth.client_secret, apiKey.key)', () => {
  const mcpServersWith = (name: string, entry: Record<string, unknown>) => ({
    mcpServers: { [name]: entry },
  });

  it('encrypts oauth.client_secret and apiKey.key on a whole-mcpServers write', () => {
    const out = encryptConfigSecrets(
      mcpServersWith('Jira', {
        url: 'https://mcp.example.com/jira',
        oauth: { client_secret: 'oauth-secret-value' },
        apiKey: { key: 'sk-mcp-admin-key' },
      }),
    );
    const server = (out.mcpServers as Record<string, Record<string, unknown>>).Jira;
    const oauth = server.oauth as Record<string, string>;
    const apiKey = server.apiKey as Record<string, string>;

    expect(decryptV3(oauth.client_secret)).toBe('oauth-secret-value');
    expect(decryptV3(apiKey.key)).toBe('sk-mcp-admin-key');
    expect(server.url).toBe('https://mcp.example.com/jira');
  });

  it('encrypts secrets when a single mcpServers entry is submitted via a dotted-entry write', () => {
    const out = encryptConfigSecretFields({
      'mcpServers.Jira': {
        url: 'https://mcp.example.com/jira',
        oauth: { client_secret: 'oauth-secret-value' },
      },
    });
    const server = out['mcpServers.Jira'] as Record<string, unknown>;
    const oauth = server.oauth as Record<string, string>;
    expect(decryptV3(oauth.client_secret)).toBe('oauth-secret-value');
  });

  it('encrypts secrets when the whole mcpServers record is submitted via a dotted-entry write', () => {
    const out = encryptConfigSecretFields({
      mcpServers: { Jira: { oauth: { client_secret: 'oauth-secret-value' } } },
    });
    const servers = out.mcpServers as Record<string, Record<string, unknown>>;
    const oauth = servers.Jira.oauth as Record<string, string>;
    expect(decryptV3(oauth.client_secret)).toBe('oauth-secret-value');
  });

  it('clears an already-encrypted-looking submitted mcp secret rather than storing it verbatim', () => {
    const out = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'v3:looks-encrypted:but-attacker' } }),
    );
    const server = (out.mcpServers as Record<string, Record<string, unknown>>).Jira;
    expect((server.oauth as Record<string, unknown>).client_secret).toBeUndefined();
  });

  it('preserves an omitted oauth.client_secret and apiKey.key when their containing objects are still present', () => {
    // The admin panel never receives real ciphertext, so it can only omit
    // the secret leaf itself — the containing `oauth`/`apiKey` object is
    // still submitted (with its own non-secret fields, e.g. `token_url`).
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', {
        oauth: { client_secret: 'oauth-secret-value' },
        apiKey: { key: 'sk-mcp-admin-key' },
      }),
    );
    const next = preserveConfigSecrets(
      mcpServersWith('Jira', {
        url: 'https://mcp.example.com/jira-v2',
        oauth: { token_url: 'https://mcp.example.com/oauth/token' },
        apiKey: {},
      }),
      existing,
    );
    const server = (next.mcpServers as Record<string, Record<string, unknown>>).Jira;
    expect(decryptV3((server.oauth as Record<string, string>).client_secret)).toBe(
      'oauth-secret-value',
    );
    expect((server.oauth as Record<string, string>).token_url).toBe(
      'https://mcp.example.com/oauth/token',
    );
    expect(decryptV3((server.apiKey as Record<string, string>).key)).toBe('sk-mcp-admin-key');
    expect(server.url).toBe('https://mcp.example.com/jira-v2');
  });

  it('does not resurrect oauth.client_secret when the whole oauth object is explicitly removed', () => {
    // Matches the established preservation philosophy for nested scalar
    // secrets (e.g. `speech.tts.openai` omitted entirely): removing the
    // whole containing object is treated as an intentional deletion, not an
    // omission to preserve.
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'oauth-secret-value' } }),
    );
    const next = preserveConfigSecrets(
      mcpServersWith('Jira', { url: 'https://mcp.example.com/jira-v2' }),
      existing,
    );
    const server = (next.mcpServers as Record<string, Record<string, unknown>>).Jira;
    expect(server.oauth).toBeUndefined();
  });

  it('redacts oauth.client_secret and apiKey.key on read', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', {
        oauth: { client_secret: 'oauth-secret-value' },
        apiKey: { key: 'sk-mcp-admin-key' },
      }),
    );
    const redacted = redactConfigSecrets(existing);
    const server = (redacted.mcpServers as Record<string, Record<string, unknown>>).Jira;
    expect((server.oauth as Record<string, unknown>).client_secret).toBeUndefined();
    expect((server.apiKey as Record<string, unknown>).key).toBeUndefined();
  });

  it('rejects an encrypted-looking oauth.client_secret or apiKey.key submission', () => {
    expect(
      getConfigSecretInputError('mcpServers.Jira', {
        oauth: { client_secret: 'v3:smuggled' },
      }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('mcpServers', {
        Jira: { apiKey: { key: 'v3:smuggled' } },
      }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('mcpServers.Jira', {
        oauth: { client_secret: 'legit-oauth-secret' },
      }),
    ).toBeNull();
  });

  // The admin panel never submits a leaf-level dotted patch for an oauth/apiKey
  // sub-field — it always resubmits the WHOLE sub-object at fieldPath
  // `mcpServers.<name>.oauth` (spreading its current in-memory copy and
  // overwriting just the edited key). This is the exact submission shape a
  // reviewer traced end-to-end; these tests exercise it directly rather than
  // only the coarser `mcpServers`/`mcpServers.Jira` ancestor paths above.
  describe('whole-oauth-object dotted-entry writes (the panel real submission shape)', () => {
    it('encrypts a client_secret submitted inside a dotted-entry write scoped to the oauth object itself', () => {
      const out = encryptConfigSecretFields({
        'mcpServers.Jira.oauth': { client_secret: 'oauth-secret-value', token_url: 'https://x' },
      });
      const oauth = out['mcpServers.Jira.oauth'] as Record<string, unknown>;
      expect(decryptV3(oauth.client_secret as string)).toBe('oauth-secret-value');
      expect(oauth.token_url).toBe('https://x');
    });

    it('recognizes an oauth-object-scoped patch as preservable so the existing document gets loaded', () => {
      expect(
        isConfigSecretPreservablePatch('mcpServers.Jira.oauth', { token_url: 'https://x' }),
      ).toBe(true);
      expect(
        isConfigSecretPreservablePatch('mcpServers.Jira.apiKey', { authorization_type: 'Bearer' }),
      ).toBe(true);
      expect(isConfigSecretPreservablePatch('mcpServers.Jira.oauth', 'not-an-object')).toBe(false);
    });

    it('restores an omitted client_secret when preserveConfigSecrets is scoped to the oauth object itself, matching the real mutation basePath', () => {
      const existingDoc = encryptConfigSecrets(
        mcpServersWith('Jira', { oauth: { client_secret: 'oauth-secret-value' } }),
      );
      const submittedOauthObject = { token_url: 'https://mcp.example.com/oauth/token' };

      const preserved = preserveConfigSecrets(
        submittedOauthObject,
        existingDoc,
        'mcpServers.Jira.oauth',
      );
      expect(decryptV3((preserved as Record<string, string>).client_secret)).toBe(
        'oauth-secret-value',
      );
      expect((preserved as Record<string, string>).token_url).toBe(
        'https://mcp.example.com/oauth/token',
      );
    });

    it('rejects a direct leaf-dotted write to oauth.client_secret or apiKey.key, forcing the whole sub-object shape', () => {
      expect(getConfigSecretInputError('mcpServers.Jira.oauth.client_secret', 'sk-new')).toContain(
        'Cannot write mcpServers secret fields by dotted leaf path',
      );
      expect(getConfigSecretInputError('mcpServers.Jira.apiKey.key', 'sk-new')).toContain(
        'Cannot write mcpServers secret fields by dotted leaf path',
      );
      expect(
        encryptConfigSecretFields({ 'mcpServers.Jira.oauth.client_secret': 'sk-new' }),
      ).toEqual({});
    });
  });
});

describe('mcpServers rename/create preserves secrets via the __previousIdentity hint on oauth/apiKey/headers/oauth_headers sub-objects', () => {
  const mcpServersWith = (name: string, entry: Record<string, unknown>) => ({
    mcpServers: { [name]: entry },
  });

  it('restores oauth.client_secret from the pre-rename origin name when the redacted oauth object carries a string __previousIdentity hint', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'oauth-secret-value' } }),
    );
    const submitted = { __previousIdentity: 'Jira' };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.JiraEU.oauth',
    ) as Record<string, unknown>;

    expect(decryptV3(preserved.client_secret as string)).toBe('oauth-secret-value');
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it('restores apiKey.key from the pre-rename origin name when the redacted apiKey object carries a string __previousIdentity hint', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { apiKey: { key: 'sk-mcp-admin-key' } }),
    );
    const submitted = { authorization_type: 'Bearer', __previousIdentity: 'Jira' };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.JiraEU.apiKey',
    ) as Record<string, unknown>;

    expect(decryptV3(preserved.key as string)).toBe('sk-mcp-admin-key');
    expect(preserved.authorization_type).toBe('Bearer');
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it('restores a real headers secret from the pre-rename origin name when the redacted headers object carries a string __previousIdentity hint', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { headers: { Authorization: 'Bearer gateway-token' } }),
    );
    const submitted = { __previousIdentity: 'Jira' };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.JiraEU.headers',
    ) as Record<string, unknown>;

    expect(decryptV3(preserved.Authorization as string)).toBe('Bearer gateway-token');
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it("does not let a brand-new entry's oauth inherit another entry's client_secret via __previousIdentity: null, even when the name is reused", () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'stale-secret-should-not-leak' } }),
    );
    const submitted = { __previousIdentity: null };

    // The brand-new entry reuses the SAME name ("Jira") that a bare-identity
    // fallback would otherwise happily match against.
    const preserved = preserveConfigSecrets(submitted, existing, 'mcpServers.Jira.oauth') as Record<
      string,
      unknown
    >;

    expect(preserved.client_secret).toBeUndefined();
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it("does not let a brand-new entry's headers inherit another entry's header secret via __previousIdentity: null, even when the name is reused", () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { headers: { Authorization: 'Bearer stale-token-should-not-leak' } }),
    );
    const submitted = { __previousIdentity: null };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.Jira.headers',
    ) as Record<string, unknown>;

    expect(preserved.Authorization).toBeUndefined();
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it('resolves a chained rename to the true persisted origin, since the frontend collapses the hint forward instead of pointing at an intermediate, never-persisted name', () => {
    // Session: Jira -> JiraTemp -> JiraEU. JiraTemp was never saved, so the
    // frontend's resolvedMcpOrigin propagates the ORIGINAL hint ("Jira")
    // forward onto JiraEU's submission instead of re-hinting "JiraTemp" —
    // the backend just needs to trust whatever string hint it receives.
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'original-secret' } }),
    );
    const submitted = { __previousIdentity: 'Jira' };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.JiraEU.oauth',
    ) as Record<string, unknown>;

    expect(decryptV3(preserved.client_secret as string)).toBe('original-secret');
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });

  it('never persists the __previousIdentity hint field itself, across every hint state (string origin, explicit null, and headers-container hints)', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', {
        oauth: { client_secret: 'x' },
        headers: { Authorization: 'Bearer x' },
      }),
    );
    const withStringHint = preserveConfigSecrets(
      { __previousIdentity: 'Jira' },
      existing,
      'mcpServers.JiraEU.oauth',
    );
    const withNullHint = preserveConfigSecrets(
      { __previousIdentity: null },
      existing,
      'mcpServers.Brand.oauth',
    );
    const headersWithHint = preserveConfigSecrets(
      { __previousIdentity: 'Jira' },
      existing,
      'mcpServers.JiraEU.headers',
    );

    expect(withStringHint).not.toHaveProperty('__previousIdentity');
    expect(withNullHint).not.toHaveProperty('__previousIdentity');
    expect(headersWithHint).not.toHaveProperty('__previousIdentity');
  });

  it('continues to restore oauth.client_secret via bare current-name matching for an ordinary edit with no hint at all (regression guard)', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { oauth: { client_secret: 'oauth-secret-value' } }),
    );
    const submitted = { token_url: 'https://mcp.example.com/oauth/token' };

    const preserved = preserveConfigSecrets(submitted, existing, 'mcpServers.Jira.oauth') as Record<
      string,
      unknown
    >;

    expect(decryptV3(preserved.client_secret as string)).toBe('oauth-secret-value');
    expect(preserved.token_url).toBe('https://mcp.example.com/oauth/token');
  });

  it('does NOT restore headers via bare current-name matching for an ordinary edit with no hint at all — the submitted container is authoritative, unlike oauth/apiKey', () => {
    // headers/oauth_headers diverge deliberately from oauth/apiKey here: the
    // admin panel always resubmits the whole container as a complete,
    // authoritative map (see restoreOmittedRecordSecretContainers's doc
    // comment), so an ordinary edit with no __previousIdentity hint at all
    // must leave it exactly as submitted. Falling back to a bare current-name
    // match — the pre-fix behavior this test used to assert — would silently
    // resurrect a credential the admin just deleted from the map.
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { headers: { Authorization: 'Bearer gateway-token' } }),
    );
    const submitted = {};

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.Jira.headers',
    ) as Record<string, unknown>;

    expect(preserved.Authorization).toBeUndefined();
    expect(preserved).toEqual({});
  });

  it('does not resurrect one deliberately-deleted header from a partial mcpServers headers map submitted with no hint at all', () => {
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', {
        headers: { Authorization: 'Bearer gateway-token', 'X-Custom': 'old-custom-value' },
      }),
    );
    // The admin's submission still HAS a headers key for the SAME server —
    // it just dropped X-Custom. No __previousIdentity hint is present at all,
    // so this is an ordinary edit, not a rename/create.
    const submitted = { Authorization: 'Bearer new-token' };

    const preserved = preserveConfigSecrets(
      submitted,
      existing,
      'mcpServers.Jira.headers',
    ) as Record<string, unknown>;

    expect(preserved.Authorization).toBe('Bearer new-token');
    expect(preserved['X-Custom']).toBeUndefined();
    expect(Object.keys(preserved)).toEqual(['Authorization']);
  });

  it('resolves the rename hint correctly even when basePath is an ancestor (the legacy whole-document route) rather than the sub-object itself', () => {
    const existing = encryptConfigSecrets({
      mcpServers: {
        OldJira: { oauth: { client_secret: 'secret-A' } },
        OtherServer: { url: 'https://other.example' },
      },
    });
    const submitted = {
      mcpServers: {
        NewJira: { oauth: { __previousIdentity: 'OldJira' } },
        OtherServer: { url: 'https://other.example/v2' },
      },
    };

    // basePath = '' here — the whole overrides document is `next`, exactly
    // like `upsertConfigOverrides`/the atomic `overrides` replace mode. The
    // hint still has to be found and resolved even though it's nested two
    // levels below basePath rather than being basePath itself.
    const preserved = preserveConfigSecrets(submitted, existing, '') as {
      mcpServers: Record<string, Record<string, unknown>>;
    };

    const newJira = preserved.mcpServers.NewJira;
    expect(decryptV3((newJira.oauth as Record<string, string>).client_secret)).toBe('secret-A');
    expect(newJira.oauth).not.toHaveProperty('__previousIdentity');
    expect(preserved.mcpServers.OtherServer.url).toBe('https://other.example/v2');
    expect(preserved.mcpServers.OldJira).toBeUndefined();
  });

  it('restores an mcpServers headers secret via __previousIdentity when encryption runs before preservation, matching the real save pipeline order (Finding 1)', () => {
    // patchConfigField and mutateConfigAtomic both run
    // encryptConfigSecretFields BEFORE preservePatchedConfigSecretFields (see
    // config.ts). The generic headers/oauth_headers bulk-encryptor previously
    // could not distinguish the __previousIdentity hint from a real header
    // value, so it encrypted the hint itself before preservation ever read
    // it — resolveOrigin then looked for a server literally named the
    // ciphertext and never found "Jira", silently losing the credential.
    const existing = encryptConfigSecrets(
      mcpServersWith('Jira', { headers: { Authorization: 'gateway-token' } }),
    );
    const encryptedFields = encryptConfigSecretFields({
      'mcpServers.JiraEU.headers': { __previousIdentity: 'Jira' },
    });
    const preserved = preserveConfigSecrets(
      encryptedFields['mcpServers.JiraEU.headers'],
      existing,
      'mcpServers.JiraEU.headers',
    ) as Record<string, unknown>;

    expect(decryptV3(preserved.Authorization as string)).toBe('gateway-token');
    expect(preserved).not.toHaveProperty('__previousIdentity');
  });
});

describe('encryption never consumes the __previousIdentity hint before preservation reads it (Finding 1)', () => {
  it('leaves the hint untouched while encrypting a real header value, at the exact sub-object-scoped basePath the admin panel submits', () => {
    const out = encryptConfigSecrets(
      { Authorization: 'plaintext-token', __previousIdentity: 'OldJira' },
      'mcpServers.NewJira.headers',
    ) as Record<string, unknown>;

    expect(decryptV3(out.Authorization as string)).toBe('plaintext-token');
    expect(out.__previousIdentity).toBe('OldJira');
  });

  it('leaves the hint untouched for oauth_headers too, at the same sub-object-scoped basePath', () => {
    const out = encryptConfigSecrets(
      { 'X-Discovery': 'plaintext-value', __previousIdentity: 'OldJira' },
      'mcpServers.NewJira.oauth_headers',
    ) as Record<string, unknown>;

    expect(decryptV3(out['X-Discovery'] as string)).toBe('plaintext-value');
    expect(out.__previousIdentity).toBe('OldJira');
  });

  it('leaves the hint untouched when encrypting a single server entry object (basePath = mcpServers.<name>)', () => {
    const out = encryptConfigSecrets(
      { headers: { Authorization: 'plaintext-token', __previousIdentity: 'OldJira' } },
      'mcpServers.NewJira',
    ) as { headers: Record<string, unknown> };

    expect(decryptV3(out.headers.Authorization as string)).toBe('plaintext-token');
    expect(out.headers.__previousIdentity).toBe('OldJira');
  });

  it('leaves the hint untouched when encrypting the whole mcpServers record (basePath = mcpServers)', () => {
    const out = encryptConfigSecrets(
      {
        NewJira: {
          headers: { Authorization: 'plaintext-token', __previousIdentity: 'OldJira' },
        },
      },
      'mcpServers',
    ) as Record<string, { headers: Record<string, unknown> }>;

    expect(decryptV3(out.NewJira.headers.Authorization as string)).toBe('plaintext-token');
    expect(out.NewJira.headers.__previousIdentity).toBe('OldJira');
  });

  it('leaves the hint untouched when encrypting the whole overrides document (basePath = "")', () => {
    const out = encryptConfigSecrets({
      mcpServers: {
        NewJira: {
          headers: { Authorization: 'plaintext-token', __previousIdentity: 'OldJira' },
        },
      },
    }) as { mcpServers: Record<string, { headers: Record<string, unknown> }> };

    expect(decryptV3(out.mcpServers.NewJira.headers.Authorization as string)).toBe(
      'plaintext-token',
    );
    expect(out.mcpServers.NewJira.headers.__previousIdentity).toBe('OldJira');
  });

  it('leaves the hint untouched via a dotted-entry write straight to the headers container path (encryptConfigSecretFields)', () => {
    const out = encryptConfigSecretFields({
      'mcpServers.NewJira.headers': {
        Authorization: 'plaintext-token',
        __previousIdentity: 'OldJira',
      },
    });
    const headers = out['mcpServers.NewJira.headers'] as Record<string, unknown>;

    expect(decryptV3(headers.Authorization as string)).toBe('plaintext-token');
    expect(headers.__previousIdentity).toBe('OldJira');
  });

  it('still does not broaden oauth/apiKey encryption to the hint key — it only ever targeted the known scalar leaf, before and after the headers/oauth_headers fix', () => {
    const oauthOut = encryptConfigSecrets(
      { client_id: 'cid', client_secret: 'plaintext-secret', __previousIdentity: 'OldJira' },
      'mcpServers.NewJira.oauth',
    ) as Record<string, unknown>;
    expect(decryptV3(oauthOut.client_secret as string)).toBe('plaintext-secret');
    expect(oauthOut.__previousIdentity).toBe('OldJira');

    const apiKeyOut = encryptConfigSecrets(
      { key: 'plaintext-api-key', __previousIdentity: 'OldJira' },
      'mcpServers.NewJira.apiKey',
    ) as Record<string, unknown>;
    expect(decryptV3(apiKeyOut.key as string)).toBe('plaintext-api-key');
    expect(apiKeyOut.__previousIdentity).toBe('OldJira');
  });
});

describe('resolveMcpSecretHintBatch (Finding 7 batch-level ambiguity detection)', () => {
  it('validates a single, unambiguous hint spanning a whole batch', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
    });
    expect(validated.get('mcpServers.C.oauth')).toBe('A');
  });

  it("validates a consistent hint repeated across a destination's own sub-keys (rule a: agreement)", () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
      'mcpServers.C.headers': { __previousIdentity: 'A' },
    });
    expect(validated.get('mcpServers.C.oauth')).toBe('A');
    expect(validated.get('mcpServers.C.headers')).toBe('A');
  });

  it('rejects every hint for a destination whose own sub-keys disagree on origin (rule a violation)', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
      'mcpServers.C.headers': { __previousIdentity: 'B' },
    });
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
    expect(validated.has('mcpServers.C.headers')).toBe(false);
  });

  it('rejects both claimants when two destinations claim the same origin (rule b violation)', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
      'mcpServers.D.oauth': { __previousIdentity: 'A' },
    });
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
    expect(validated.has('mcpServers.D.oauth')).toBe(false);
  });

  it('rejects a hint claiming an origin that is itself present as an unrenamed destination in the same batch (rule c violation)', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
      'mcpServers.A.oauth': { token_url: 'https://still-here' },
    });
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
  });

  it('detects origin presence from a whole-mcpServers-record field, not just per-server dotted fields', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: 'A' },
      mcpServers: { A: { url: 'https://mcp.example.com/a' } },
    });
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
  });

  it('validates explicit null hints (brand-new entry, no origin) same as a string origin', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.C.oauth': { __previousIdentity: null },
    });
    expect(validated.get('mcpServers.C.oauth')).toBeNull();
  });

  it('returns an empty map when no fieldPath in the batch carries a hint at all', () => {
    const validated = resolveMcpSecretHintBatch({
      'mcpServers.Jira.oauth': { token_url: 'https://new' },
      cache: true,
    });
    expect(validated.size).toBe(0);
  });

  it('ignores array-shaped field values entirely, since the array-entry __previousIdentity protocol is unrelated to this mcpServers mechanism', () => {
    const validated = resolveMcpSecretHintBatch({
      'endpoints.custom': [{ name: 'B', __previousIdentity: 'A' }],
    });
    expect(validated.size).toBe(0);
  });

  it('rejects a hint claiming an origin that is untouched-but-present in the existing document, not just one mentioned in this batch (Finding 2)', () => {
    const existingOverrides = { mcpServers: { A: { url: 'https://mcp.example.com/a' } } };
    // The batch never mentions A at all — nothing about it is changing.
    const validated = resolveMcpSecretHintBatch(
      { 'mcpServers.C.oauth': { __previousIdentity: 'A' } },
      existingOverrides,
    );
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
  });

  it('honors a whole-entry resetPaths deletion of the claimed origin as a genuine vacate, not a still-alive block (Finding 2)', () => {
    const existingOverrides = { mcpServers: { A: { url: 'https://mcp.example.com/a' } } };
    const validated = resolveMcpSecretHintBatch(
      { 'mcpServers.C.oauth': { __previousIdentity: 'A' } },
      existingOverrides,
      ['mcpServers.A'],
    );
    expect(validated.get('mcpServers.C.oauth')).toBe('A');
  });

  it('treats a bare "mcpServers" resetPaths entry as vacating every existing name at once (Finding 2)', () => {
    const existingOverrides = { mcpServers: { A: { url: 'https://mcp.example.com/a' } } };
    const validated = resolveMcpSecretHintBatch(
      { 'mcpServers.C.oauth': { __previousIdentity: 'A' } },
      existingOverrides,
      ['mcpServers'],
    );
    expect(validated.get('mcpServers.C.oauth')).toBe('A');
  });

  it('does not treat a partial leaf reset of the origin as a vacate — the server itself still exists (Finding 2)', () => {
    const existingOverrides = { mcpServers: { A: { url: 'https://mcp.example.com/a' } } };
    const validated = resolveMcpSecretHintBatch(
      { 'mcpServers.C.oauth': { __previousIdentity: 'A' } },
      existingOverrides,
      ['mcpServers.A.headers'],
    );
    expect(validated.has('mcpServers.C.oauth')).toBe(false);
  });
});

describe('resolveMcpSecretHintBatchForWholeDocument (Finding 2: legacy upsert / atomic replace routes)', () => {
  it('rejects a hint claiming an origin that survives as itself elsewhere in the same whole-document replacement', () => {
    const validated = resolveMcpSecretHintBatchForWholeDocument({
      mcpServers: {
        A: { url: 'https://mcp.example.com/a' },
        C: { url: 'https://mcp.example.com/c', oauth: { __previousIdentity: 'A' } },
      },
    });
    expect(validated.size).toBe(0);
  });

  it('validates a hint whose origin is genuinely absent from the replacement document (a real rename)', () => {
    const validated = resolveMcpSecretHintBatchForWholeDocument({
      mcpServers: {
        C: { url: 'https://mcp.example.com/c', oauth: { __previousIdentity: 'A' } },
      },
    });
    expect(validated.get('mcpServers.C.oauth')).toBe('A');
  });

  it('rejects two destinations in the same replacement document both claiming the same origin', () => {
    const validated = resolveMcpSecretHintBatchForWholeDocument({
      mcpServers: {
        C: { oauth: { __previousIdentity: 'A' } },
        D: { oauth: { __previousIdentity: 'A' } },
      },
    });
    expect(validated.size).toBe(0);
  });
});

describe('encryptLegacyPlaintextConfigSecrets', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });

  it('encrypts a genuine legacy plaintext secret', () => {
    const result = encryptLegacyPlaintextConfigSecrets({
      langfuse: { secretKey: 'sk-legacy-plaintext' },
    });
    const secretKey = (result.langfuse as Record<string, string>).secretKey;
    expect(secretKey).not.toBe('sk-legacy-plaintext');
    expect(decryptConfigSecret(secretKey)).toBe('sk-legacy-plaintext');
  });

  it('leaves an already-encrypted value untouched instead of blanking it', () => {
    const encrypted = encryptConfigSecrets({ langfuse: { secretKey: 'sk-real' } });
    const alreadyEncrypted = (encrypted.langfuse as Record<string, string>).secretKey;

    const result = encryptLegacyPlaintextConfigSecrets(encrypted);
    expect((result.langfuse as Record<string, string>).secretKey).toBe(alreadyEncrypted);
  });

  it('encrypts a malformed "v3:" legacy secret that is not real ciphertext, scalar field', () => {
    // "v3:vendor-token" merely starts with the encrypted prefix by
    // coincidence — decryptV3/isEncryptedSecretPayload would reject it, so
    // treating it as "already encrypted" and skipping it would leave a real
    // secret in plaintext inside a revision snapshot.
    const result = encryptLegacyPlaintextConfigSecrets({
      langfuse: { secretKey: 'v3:vendor-token' },
    });
    const secretKey = (result.langfuse as Record<string, string>).secretKey;
    expect(secretKey).not.toBe('v3:vendor-token');
    expect(decryptConfigSecret(secretKey)).toBe('v3:vendor-token');
  });

  it('encrypts a malformed "v3:" legacy secret that is not real ciphertext, array field', () => {
    const result = encryptLegacyPlaintextConfigSecrets(
      endpointsWith([{ name: 'A', apiKey: 'v3:vendor-token' }]),
    );
    const apiKey = (result.endpoints.custom[0] as Record<string, string>).apiKey;
    expect(apiKey).not.toBe('v3:vendor-token');
    expect(decryptConfigSecret(apiKey)).toBe('v3:vendor-token');
  });

  it('leaves an already-encrypted array-field secret untouched', () => {
    const encrypted = encryptConfigSecrets(
      endpointsWith([{ name: 'A', apiKey: 'sk-real-array-secret' }]),
    );
    const alreadyEncrypted = (encrypted.endpoints.custom[0] as Record<string, string>).apiKey;

    const result = encryptLegacyPlaintextConfigSecrets(encrypted);
    expect((result.endpoints.custom[0] as Record<string, string>).apiKey).toBe(alreadyEncrypted);
  });

  it('leaves env-var placeholders and passthrough values untouched', () => {
    const result = encryptLegacyPlaintextConfigSecrets({
      ocr: { apiKey: '${OCR_KEY}' },
      endpoints: { custom: [{ name: 'A', apiKey: 'user_provided' }] },
    });
    expect((result.ocr as Record<string, string>).apiKey).toBe('${OCR_KEY}');
    expect((result.endpoints as { custom: Array<Record<string, string>> }).custom[0].apiKey).toBe(
      'user_provided',
    );
  });

  it('drops legacy plaintext langfuse.headers instead of carrying it forward into a revision snapshot', () => {
    // langfuse.headers is a map of arbitrary proxy/gateway credential values —
    // the secret registry can only express a scalar or array-item path, so it
    // can never be encrypted here. Current policy also forbids ever writing
    // it again (YAML-only), so a legacy document that still has it must not
    // keep leaking it in plaintext into every subsequent revision snapshot.
    const result = encryptLegacyPlaintextConfigSecrets({
      langfuse: { headers: { 'X-Gateway-Token': 'plaintext-gateway-secret' } },
    });
    expect(result.langfuse).toEqual({});
    expect(JSON.stringify(result)).not.toContain('plaintext-gateway-secret');
  });

  it('drops langfuse.headers while still encrypting the sibling secretKey', () => {
    const result = encryptLegacyPlaintextConfigSecrets({
      langfuse: {
        secretKey: 'sk-legacy-plaintext',
        publicKey: 'pk-real',
        headers: { 'X-Gateway-Token': 'plaintext-gateway-secret' },
      },
    });
    const langfuse = result.langfuse as Record<string, unknown>;
    expect(langfuse.headers).toBeUndefined();
    expect(langfuse.publicKey).toBe('pk-real');
    expect(decryptConfigSecret(langfuse.secretKey as string)).toBe('sk-legacy-plaintext');
    expect(JSON.stringify(result)).not.toContain('plaintext-gateway-secret');
  });
});
