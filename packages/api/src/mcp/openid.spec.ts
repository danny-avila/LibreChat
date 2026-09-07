import type { MCPOptions } from './types';
import { resolveDirectOpenIDBearerConfig, usesDirectOpenIDBearerRecovery } from './openid';
import { MCPAuthenticationRefreshError } from './errors';
import { OpenIDReauthRequiredError } from '~/utils/oidc';

const directBearerConfig = (
  source: 'yaml' | 'config' | 'user' | 'plugin',
): MCPOptions & {
  source: typeof source;
  openidBearerRecovery: true;
} => ({
  type: 'streamable-http',
  url: 'https://mcp.example.com',
  source,
  openidBearerRecovery: true,
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

  it('requires the explicit recovery opt-in', () => {
    const config = { ...directBearerConfig('yaml'), openidBearerRecovery: false };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
  });

  it('lets audience-bound OBO take precedence when both modes are configured', () => {
    const config = {
      ...directBearerConfig('yaml'),
      obo: { scopes: 'api://mcp/.default' },
    };

    expect(usesDirectOpenIDBearerRecovery(config)).toBe(false);
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
