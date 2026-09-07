import type { StreamableHTTPOptions } from './types';
import { resolveDirectOpenIDBearerConfig, usesDirectOpenIDBearerRecovery } from './openid';
import { MCPAuthenticationRefreshError } from './errors';
import { OpenIDReauthRequiredError } from '~/utils/oidc';

const directBearerConfig = (
  source: 'yaml' | 'config' | 'user' | 'plugin',
): StreamableHTTPOptions & {
  source: typeof source;
} => ({
  type: 'streamable-http',
  url: 'https://mcp.example.com',
  source,
  headers: { Authorization: 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}' },
});

describe('direct OpenID bearer recovery', () => {
  it.each(['yaml', 'config'] as const)('resolves a trusted %s configuration', async (source) => {
    const upstreamTokenProvider = jest.fn().mockResolvedValue({ access_token: 'live-token' });

    const resolved = await resolveDirectOpenIDBearerConfig({
      config: directBearerConfig(source),
      upstreamTokenProvider,
      forceRefresh: true,
    });

    expect('headers' in resolved ? resolved.headers : undefined).toEqual({
      Authorization: 'Bearer live-token',
    });
    expect(upstreamTokenProvider).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('resolves a bearer placeholder supplied through an operator environment variable', async () => {
    const variableName = 'LIBRECHAT_TEST_DIRECT_BEARER_HEADER';
    process.env[variableName] = 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}';
    const config = {
      ...directBearerConfig('yaml'),
      headers: { Authorization: `\${${variableName}}` },
    };

    try {
      expect(usesDirectOpenIDBearerRecovery(config)).toBe(true);
      await expect(
        resolveDirectOpenIDBearerConfig({
          config,
          upstreamTokenProvider: jest.fn().mockResolvedValue({ access_token: 'live-token' }),
        }),
      ).resolves.toMatchObject({ headers: { Authorization: 'Bearer live-token' } });
    } finally {
      delete process.env[variableName];
    }
  });

  it.each(['user', 'plugin'] as const)(
    'does not resolve an untrusted %s configuration',
    async (source) => {
      const config = directBearerConfig(source);
      const upstreamTokenProvider = jest.fn();

      await expect(
        resolveDirectOpenIDBearerConfig({ config, upstreamTokenProvider }),
      ).resolves.toBe(config);
      expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
      expect(upstreamTokenProvider).not.toHaveBeenCalled();
    },
  );

  it('requires explicit trusted provenance even when the placeholder is present', () => {
    const config = { ...directBearerConfig('yaml'), source: undefined };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
  });

  it('rejects a database-backed config even if its source marker is spoofed', () => {
    const config = { ...directBearerConfig('config'), dbId: 'user-server' };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
  });

  it('enables recovery from the trusted placeholder without a separate opt-in', () => {
    expect(usesDirectOpenIDBearerRecovery(directBearerConfig('yaml'))).toBe(true);
  });

  it('does not infer direct bearer recovery without the Authorization placeholder', () => {
    const config = {
      ...directBearerConfig('yaml'),
      headers: { Authorization: 'Bearer static-token' },
    };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
  });

  it('lets audience-bound OBO take precedence when both modes are configured', () => {
    const config = {
      ...directBearerConfig('yaml'),
      obo: { scopes: 'api://mcp/.default' },
    };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
  });

  it('preserves explicit OAuth and removes its shadowed OpenID template', async () => {
    const config = {
      ...directBearerConfig('yaml'),
      oauth: { client_id: 'explicit-client' },
    };
    const upstreamTokenProvider = jest.fn();
    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
    await expect(
      resolveDirectOpenIDBearerConfig({ config, upstreamTokenProvider }),
    ).resolves.toMatchObject({ oauth: config.oauth, headers: {} });
    expect(upstreamTokenProvider).not.toHaveBeenCalled();
  });

  it('preserves direct bearer selection when OAuth is explicitly disabled', async () => {
    const config = {
      ...directBearerConfig('yaml'),
      oauth: { client_id: 'disabled-client' },
      requiresOAuth: false,
    };
    expect(usesDirectOpenIDBearerRecovery(config)).toBe(true);
    await expect(
      resolveDirectOpenIDBearerConfig({
        config,
        upstreamTokenProvider: jest.fn().mockResolvedValue({ access_token: 'direct-token' }),
      }),
    ).resolves.toMatchObject({ headers: { Authorization: 'Bearer direct-token' } });
  });

  it('removes the shadowed OpenID Authorization template when OBO takes precedence', async () => {
    const config = {
      ...directBearerConfig('yaml'),
      obo: { scopes: 'api://mcp/.default' },
      headers: {
        Authorization: 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}',
        'X-Service': 'private-mcp',
      },
    };
    const upstreamTokenProvider = jest.fn();

    const resolved = await resolveDirectOpenIDBearerConfig({ config, upstreamTokenProvider });

    expect('headers' in resolved ? resolved.headers : undefined).toEqual({
      'X-Service': 'private-mcp',
    });
    expect(upstreamTokenProvider).not.toHaveBeenCalled();
  });

  it('preserves the verified request bearer fallback when no session is available', async () => {
    const config = directBearerConfig('yaml');

    await expect(
      resolveDirectOpenIDBearerConfig({
        config,
        upstreamTokenProvider: jest.fn().mockResolvedValue(null),
      }),
    ).resolves.toBe(config);
  });

  it('preserves the verified request bearer fallback when no provider is plumbed', async () => {
    const config = directBearerConfig('yaml');

    await expect(resolveDirectOpenIDBearerConfig({ config })).resolves.toBe(config);
  });

  it('requires a live provider after the upstream bearer is rejected', async () => {
    await expect(
      resolveDirectOpenIDBearerConfig({
        config: directBearerConfig('yaml'),
        forceRefresh: true,
      }),
    ).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
  });

  it('returns a transport-neutral reauthentication error when forced refresh is unavailable', async () => {
    await expect(
      resolveDirectOpenIDBearerConfig({
        config: directBearerConfig('yaml'),
        upstreamTokenProvider: jest.fn().mockResolvedValue(null),
        forceRefresh: true,
      }),
    ).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
  });

  it('preserves transient provider failures for the calling transport', async () => {
    const transient = Object.assign(new Error('service unavailable'), { status: 503 });

    await expect(
      resolveDirectOpenIDBearerConfig({
        config: directBearerConfig('yaml'),
        upstreamTokenProvider: jest.fn().mockRejectedValue(transient),
      }),
    ).rejects.toMatchObject({
      name: 'MCPAuthenticationRefreshError',
      cause: transient,
    } satisfies Partial<MCPAuthenticationRefreshError>);
  });

  it('substitutes opaque access tokens without interpreting replacement patterns', async () => {
    const resolved = await resolveDirectOpenIDBearerConfig({
      config: directBearerConfig('yaml'),
      upstreamTokenProvider: jest.fn().mockResolvedValue({ access_token: "opaque-$&-$`-$'" }),
    });

    expect('headers' in resolved ? resolved.headers?.Authorization : undefined).toBe(
      "Bearer opaque-$&-$`-$'",
    );
  });
});
