import { cloudfrontConfigSchema } from '../config';

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
