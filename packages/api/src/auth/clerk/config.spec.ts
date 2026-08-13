import { ClerkAuthConfigError, resolveClerkAuthConfig, toPublicClerkAuthConfig } from './config';

const ALL_VALID_ENV = {
  CLERK_PUBLISHABLE_KEY: 'pk_test_abc123',
  CLERK_SECRET_KEY: 'sk_test_abc123',
  CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----',
  CLERK_AUTHORIZED_PARTIES: 'https://app.example.com',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_abc123',
};

const CLERK_ENV_KEYS = Object.keys(ALL_VALID_ENV) as Array<keyof typeof ALL_VALID_ENV>;

function envWithout(key: keyof typeof ALL_VALID_ENV) {
  const env = { ...ALL_VALID_ENV };
  delete env[key];
  return env;
}

describe('resolveClerkAuthConfig', () => {
  it('returns enabled config when all five values are valid', () => {
    const result = resolveClerkAuthConfig(ALL_VALID_ENV);

    expect(result).toEqual({
      enabled: true,
      publishableKey: 'pk_test_abc123',
      secretKey: 'sk_test_abc123',
      jwtKey: ALL_VALID_ENV.CLERK_JWT_KEY,
      authorizedParties: ['https://app.example.com'],
      webhookSigningSecret: 'whsec_abc123',
    });
  });

  it('returns disabled config when no Clerk variables are set', () => {
    expect(resolveClerkAuthConfig({})).toEqual({ enabled: false });
  });

  it('returns disabled config when every Clerk variable is blank/whitespace', () => {
    const env = Object.fromEntries(CLERK_ENV_KEYS.map((key) => [key, '   ']));
    expect(resolveClerkAuthConfig(env)).toEqual({ enabled: false });
  });

  it.each(CLERK_ENV_KEYS)('throws a redacted error when only %s is missing', (missingKey) => {
    expect(() => resolveClerkAuthConfig(envWithout(missingKey))).toThrow(ClerkAuthConfigError);
  });

  it.each(CLERK_ENV_KEYS)('throws when %s is present but whitespace-only', (blankKey) => {
    const env = { ...ALL_VALID_ENV, [blankKey]: '   ' };
    expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
  });

  it('never includes raw secret values in the thrown error message', () => {
    const env = envWithout('CLERK_JWT_KEY');
    try {
      resolveClerkAuthConfig(env);
      throw new Error('expected resolveClerkAuthConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ClerkAuthConfigError);
      expect((err as Error).message).not.toContain(ALL_VALID_ENV.CLERK_SECRET_KEY);
      expect((err as Error).message).not.toContain(ALL_VALID_ENV.CLERK_WEBHOOK_SIGNING_SECRET);
    }
  });

  it('rejects a publishable key that is secret-shaped', () => {
    const env = { ...ALL_VALID_ENV, CLERK_PUBLISHABLE_KEY: 'sk_live_shouldnotbepublic' };
    expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
  });

  describe('CLERK_AUTHORIZED_PARTIES parsing', () => {
    it('deduplicates repeated origins and normalizes case', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES:
          'https://app.example.com,HTTPS://APP.EXAMPLE.COM,https://app.example.com',
      };
      const result = resolveClerkAuthConfig(env);
      expect(result.enabled).toBe(true);
      if (result.enabled) {
        expect(result.authorizedParties).toEqual(['https://app.example.com']);
      }
    });

    it('accepts multiple distinct valid origins', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.com,https://admin.example.com:8443',
      };
      const result = resolveClerkAuthConfig(env);
      expect(result.enabled).toBe(true);
      if (result.enabled) {
        expect(result.authorizedParties).toEqual([
          'https://app.example.com',
          'https://admin.example.com:8443',
        ]);
      }
    });

    it('allows an HTTP loopback origin in development', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'http://localhost:3090',
        NODE_ENV: 'development',
      };
      const result = resolveClerkAuthConfig(env);
      expect(result.enabled).toBe(true);
      if (result.enabled) {
        expect(result.authorizedParties).toEqual(['http://localhost:3090']);
      }
    });

    it('rejects an HTTP loopback origin in production', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'http://localhost:3090',
        NODE_ENV: 'production',
      };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects a non-loopback HTTP origin outside development', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'http://app.example.com',
      };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects a wildcard origin', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'https://*.example.com' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects an origin containing credentials', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'https://user:pass@app.example.com',
      };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects an origin containing a path', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'https://app.example.com/login' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects an origin containing a query string', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'https://app.example.com?x=1' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects an origin containing a fragment', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'https://app.example.com#frag' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects a non-http(s) protocol', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'ftp://app.example.com' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects an invalid URL', () => {
      const env = { ...ALL_VALID_ENV, CLERK_AUTHORIZED_PARTIES: 'not-a-url' };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });

    it('rejects a blank entry between commas', () => {
      const env = {
        ...ALL_VALID_ENV,
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.com,,https://admin.example.com',
      };
      expect(() => resolveClerkAuthConfig(env)).toThrow(ClerkAuthConfigError);
    });
  });
});

describe('toPublicClerkAuthConfig', () => {
  it('projects only enabled and publishableKey when enabled', () => {
    const result = resolveClerkAuthConfig(ALL_VALID_ENV);
    const publicConfig = toPublicClerkAuthConfig(result);

    expect(publicConfig).toEqual({
      clerkLoginEnabled: true,
      clerkPublishableKey: 'pk_test_abc123',
    });
    expect(Object.keys(publicConfig).sort()).toEqual(
      ['clerkLoginEnabled', 'clerkPublishableKey'].sort(),
    );
  });

  it('never leaks secretKey, jwtKey, webhookSigningSecret, or authorizedParties', () => {
    const result = resolveClerkAuthConfig(ALL_VALID_ENV);
    const publicConfig = toPublicClerkAuthConfig(result) as unknown as Record<string, unknown>;

    expect(publicConfig.secretKey).toBeUndefined();
    expect(publicConfig.jwtKey).toBeUndefined();
    expect(publicConfig.webhookSigningSecret).toBeUndefined();
    expect(publicConfig.authorizedParties).toBeUndefined();
  });

  it('projects disabled with no publishable key when disabled', () => {
    const publicConfig = toPublicClerkAuthConfig({ enabled: false });

    expect(publicConfig).toEqual({ clerkLoginEnabled: false });
    expect('clerkPublishableKey' in publicConfig).toBe(false);
  });
});
