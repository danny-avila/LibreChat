describe('CodeCan prompt and vector store config', () => {
  const originalEnv = { ...process.env };

  const loadModule = () => {
    jest.resetModules();
    return require('./codeCan');
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('returns default Ontario and National vector stores when env vars are missing', () => {
    delete process.env.CODECAN_OPENAI_ONTARIO_VECTOR_STORE_ID;
    delete process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID;
    delete process.env.CODECAN_OPENAI_VECTOR_STORE_ID;
    const { getCodeCanVectorStoreConfig } = loadModule();

    expect(getCodeCanVectorStoreConfig()).toEqual({
      ontarioId: 'vs_698b51aa511081919a033eff64f38c97',
      nationalId: 'vs_693860848bc48191bccb7c1d197f488f',
    });
  });

  it('uses legacy CODECAN_OPENAI_VECTOR_STORE_ID as National fallback', () => {
    process.env.CODECAN_OPENAI_VECTOR_STORE_ID = 'vs_legacy_national';
    delete process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID;
    const { getCodeCanVectorStoreConfig } = loadModule();

    expect(getCodeCanVectorStoreConfig().nationalId).toBe('vs_legacy_national');
  });

  it('prefers CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID over legacy National fallback', () => {
    process.env.CODECAN_OPENAI_VECTOR_STORE_ID = 'vs_legacy_national';
    process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID = 'vs_national_preferred';
    const { getCodeCanVectorStoreConfig } = loadModule();

    expect(getCodeCanVectorStoreConfig().nationalId).toBe('vs_national_preferred');
  });

  it('returns stage-specific vector store IDs', () => {
    process.env.CODECAN_OPENAI_ONTARIO_VECTOR_STORE_ID = 'vs_ontario_custom';
    process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID = 'vs_national_custom';
    const { getCodeCanVectorStoreIds } = loadModule();

    expect(getCodeCanVectorStoreIds('ontario')).toEqual(['vs_ontario_custom']);
    expect(getCodeCanVectorStoreIds('national')).toEqual(['vs_national_custom']);
  });

  it('builds Ontario and National stage prompts with correct supersession policy text', () => {
    const {
      buildCodeCanSystemPrompt,
      NO_RELEVANT_ONTARIO_TEXT,
      NO_RELEVANT_NATIONAL_TEXT,
    } = loadModule();

    const ontarioPrompt = buildCodeCanSystemPrompt('ontario');
    const nationalPrompt = buildCodeCanSystemPrompt('national');

    expect(ontarioPrompt).toContain('supersedes');
    expect(ontarioPrompt).toContain(NO_RELEVANT_ONTARIO_TEXT);
    expect(nationalPrompt).toContain('fallback');
    expect(nationalPrompt).toContain(NO_RELEVANT_NATIONAL_TEXT);
  });
});
