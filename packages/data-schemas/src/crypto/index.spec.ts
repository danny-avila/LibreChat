describe('crypto without configured credentials', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses process-local fallback material instead of throwing at startup', async () => {
    process.env = { ...originalEnv };
    delete process.env.CREDS_KEY;
    delete process.env.CREDS_IV;
    delete process.env.JWT_SECRET;

    jest.resetModules();
    const { encryptV3, signPayload } = await import('./index');

    const encrypted = encryptV3('startup-safe');
    const token = await signPayload({
      payload: { id: 'startup-safe' },
      expirationTime: 60,
    });

    expect(encrypted.startsWith('v3:')).toBe(true);
    expect(token.split('.')).toHaveLength(3);
  });
});
