import type { ParsedServerConfig } from '~/mcp/types';
import { cleanupMCPServerOAuth, getMCPServerGeneration } from './cleanup';

describe('getMCPServerGeneration', () => {
  it('includes the durable database identity for user servers', () => {
    const config = { type: 'streamable-http', url: 'https://example.com', dbId: 'server-1' };

    expect(getMCPServerGeneration(config as ParsedServerConfig)).toMatch(/^db:server-1:/);
  });

  it('ignores inspection-only fields for config servers', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      source: 'config',
      initDuration: 12,
      updatedAt: 100,
    } as ParsedServerConfig;
    const reinspected = { ...config, initDuration: 987, updatedAt: 200 };

    expect(getMCPServerGeneration(reinspected)).toBe(getMCPServerGeneration(config));
  });

  it('changes when the stable server definition changes', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      source: 'config',
    } as ParsedServerConfig;

    expect(getMCPServerGeneration({ ...config, url: 'https://other.example.com/mcp' })).not.toBe(
      getMCPServerGeneration(config),
    );
  });

  it('versions DB-backed servers when their definition changes', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      dbId: 'server-1',
    } as ParsedServerConfig;

    expect(getMCPServerGeneration({ ...config, url: 'https://other.example.com/mcp' })).not.toBe(
      getMCPServerGeneration(config),
    );
  });
});

describe('cleanupMCPServerOAuth', () => {
  it('deletes only token records snapshotted before flow cancellation', async () => {
    const deleteTokens = jest.fn();
    const findToken = jest.fn(async ({ type }: { type?: string }) =>
      type === 'mcp_oauth' ? ({ token: 'encrypted-old-access' } as never) : null,
    );
    const deleteUserTokens = jest.fn(
      async ({
        userId,
        serverName,
        deleteToken,
      }: {
        userId: string;
        serverName: string;
        deleteToken: (filter: {
          userId: string;
          type: string;
          identifier: string;
        }) => Promise<void>;
      }) => {
        const identifier = `mcp:${serverName}`;
        await deleteToken({
          userId,
          type: 'mcp_oauth_client',
          identifier: `${identifier}:client`,
        });
        await deleteToken({ userId, type: 'mcp_oauth', identifier });
        await deleteToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
        });
      },
    );

    await cleanupMCPServerOAuth({
      userId: 'user-1',
      pluginKey: 'mcp_test-server',
      serverConfigOverride: {
        type: 'streamable-http',
        url: 'https://example.com/mcp',
        oauth: {},
      },
      dependencies: {
        flowManager: { deleteFlow: jest.fn() } as never,
        oauthHandler: {
          generateFlowId: jest.fn(() => 'user-1:test-server'),
          generateTokenFlowId: jest.fn(() => 'user-1:test-server'),
          deleteFlowAndStateMapping: jest.fn(),
          revokeOAuthToken: jest.fn(),
        },
        tokenStorage: {
          deleteUserTokens,
          getClientInfoAndMetadata: jest.fn(async () => null),
          getTokens: jest.fn(),
          assertCredentialSetBinding: jest.fn(),
        },
        findToken: findToken as never,
        deleteTokens,
        getServerConfig: jest.fn(),
        isRegisteredOAuthServer: jest.fn(),
      },
    });

    expect(deleteTokens).toHaveBeenCalledTimes(1);
    expect(deleteTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'mcp_oauth',
      identifier: 'mcp:test-server',
      token: 'encrypted-old-access',
    });
  });
});
