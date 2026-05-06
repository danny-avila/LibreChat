import { cloudfrontConfigSchema } from './config';

describe('cloudfrontConfigSchema cookieDomain validation', () => {
  it('accepts cookieDomain starting with dot', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      cookieDomain: '.example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects cookieDomain without leading dot', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      cookieDomain: 'example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('must start with a dot');
    }
  });

  it('allows omitting cookieDomain', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('cloudfrontConfigSchema cross-field refinements', () => {
  it('rejects invalidateOnDelete=true without distributionId', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      invalidateOnDelete: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        'distributionId is required when invalidateOnDelete is true',
      );
      expect(result.error.issues[0].path).toEqual(['distributionId']);
    }
  });

  it('accepts invalidateOnDelete=true with distributionId', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      invalidateOnDelete: true,
      distributionId: 'E1ABCDEFGHIJK',
    });
    expect(result.success).toBe(true);
  });

  it('rejects imageSigning="cookies" without cookieDomain', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        'cookieDomain is required when imageSigning is "cookies"',
      );
      expect(result.error.issues[0].path).toEqual(['cookieDomain']);
    }
  });

  it('accepts imageSigning="cookies" with cookieDomain', () => {
    const result = cloudfrontConfigSchema.safeParse({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
    });
    expect(result.success).toBe(true);
  });
});
