import type { MCPOptions } from './types';
import { resolveDirectOpenIDBearerConfig, usesDirectOpenIDBearerRecovery } from './openid';
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

  it('returns a transport-neutral reauthentication error when refresh is unavailable', async () => {
    await expect(
      resolveDirectOpenIDBearerConfig({
        config: directBearerConfig('yaml'),
        upstreamTokenProvider: jest.fn().mockResolvedValue(null),
      }),
    ).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
  });
});
