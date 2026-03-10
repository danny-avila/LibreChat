/**
 * Tests for MCP OAuth token expiry → re-authentication scenarios.
 *
 * Reproduces the edge case where:
 * 1. Tokens are stored (access + refresh)
 * 2. Access token expires
 * 3. Refresh attempt fails (server rejects/revokes refresh token)
 * 4. System must fall back to full OAuth re-auth via handleOAuthRequired
 * 5. The CSRF cookie may be absent (chat/SSE flow), so the PENDING flow fallback is needed
 *
 * Also tests the happy path: access token expired but refresh succeeds.
 */

import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import { FlowStateManager, PENDING_STALE_MS } from '~/flow/manager';
import { MCPTokenStorage, ReauthenticationRequiredError } from '~/mcp/oauth';
import { MockKeyv, InMemoryTokenStore, createOAuthMCPServer } from './helpers/oauthTestServer';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import type { MCPOAuthTokens } from '~/mcp/oauth';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  encryptV2: jest.fn(async (val: string) => `enc:${val}`),
  decryptV2: jest.fn(async (val: string) => val.replace(/^enc:/, '')),
}));

describe('MCP OAuth Token Expiry Scenarios', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Access token expired + refresh token available + refresh succeeds', () => {
    let server: OAuthTestServer;
    let tokenStore: InMemoryTokenStore;

    beforeEach(async () => {
      server = await createOAuthMCPServer({
        tokenTTLMs: 500,
        issueRefreshTokens: true,
      });
      tokenStore = new InMemoryTokenStore();
    });

    afterEach(async () => {
      await server.close();
    });

    it('should refresh expired access token via real /token endpoint', async () => {
      // Get initial tokens from real server
      const code = await server.getAuthCode();
      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}`,
      });
      const initial = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
      };

      // Store expired access token directly (bypassing storeTokens' expiresIn clamping)
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:test-srv',
        token: `enc:${initial.access_token}`,
        expiresIn: -1,
      });
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:test-srv:refresh',
        token: `enc:${initial.refresh_token}`,
        expiresIn: 86400,
      });

      const refreshCallback = async (refreshToken: string): Promise<MCPOAuthTokens> => {
        const res = await fetch(`${server.url}token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
        });
        if (!res.ok) {
          throw new Error(`Refresh failed: ${res.status}`);
        }
        const data = (await res.json()) as {
          access_token: string;
          token_type: string;
          expires_in: number;
        };
        return {
          ...data,
          obtained_at: Date.now(),
          expires_at: Date.now() + data.expires_in * 1000,
        };
      };

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'test-srv',
        findToken: tokenStore.findToken,
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        refreshTokens: refreshCallback,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).not.toBe(initial.access_token);

      // Verify the refreshed token works against the server
      const mcpRes = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${result!.access_token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.1' },
          },
        }),
      });
      expect(mcpRes.status).toBe(200);
    });
  });

  describe('Access token expired + refresh token rejected by server', () => {
    let tokenStore: InMemoryTokenStore;

    beforeEach(() => {
      tokenStore = new InMemoryTokenStore();
    });

    it('should return null when refresh token is rejected (invalid_grant)', async () => {
      const server = await createOAuthMCPServer({
        tokenTTLMs: 60000,
        issueRefreshTokens: true,
      });

      try {
        const code = await server.getAuthCode();
        const tokenRes = await fetch(`${server.url}token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=authorization_code&code=${code}`,
        });
        const initial = (await tokenRes.json()) as {
          access_token: string;
          token_type: string;
          expires_in: number;
          refresh_token: string;
        };

        // Store expired access token directly
        await tokenStore.createToken({
          userId: 'u1',
          type: 'mcp_oauth',
          identifier: 'mcp:test-srv',
          token: `enc:${initial.access_token}`,
          expiresIn: -1,
        });
        await tokenStore.createToken({
          userId: 'u1',
          type: 'mcp_oauth_refresh',
          identifier: 'mcp:test-srv:refresh',
          token: `enc:${initial.refresh_token}`,
          expiresIn: 86400,
        });

        // Simulate server revoking the refresh token
        server.issuedRefreshTokens.clear();

        const refreshCallback = async (refreshToken: string): Promise<MCPOAuthTokens> => {
          const res = await fetch(`${server.url}token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
          });
          if (!res.ok) {
            const body = (await res.json()) as { error: string };
            throw new Error(`Token refresh failed: ${body.error}`);
          }
          const data = (await res.json()) as MCPOAuthTokens;
          return data;
        };

        const result = await MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'test-srv',
          findToken: tokenStore.findToken,
          createToken: tokenStore.createToken,
          updateToken: tokenStore.updateToken,
          refreshTokens: refreshCallback,
        });

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to refresh tokens'),
          expect.any(Error),
        );
      } finally {
        await server.close();
      }
    });

    it('should return null when refresh endpoint returns unauthorized_client', async () => {
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:test-srv',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:test-srv:refresh',
        token: 'enc:some-refresh-token',
        expiresIn: 86400,
      });

      const refreshCallback = jest
        .fn()
        .mockRejectedValue(new Error('unauthorized_client: client not authorized for refresh'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'test-srv',
        findToken: tokenStore.findToken,
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        refreshTokens: refreshCallback,
      });

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('does not support refresh tokens'),
      );
    });
  });

  describe('Access token expired + NO refresh token → ReauthenticationRequiredError', () => {
    let tokenStore: InMemoryTokenStore;

    beforeEach(() => {
      tokenStore = new InMemoryTokenStore();
    });

    it('should throw ReauthenticationRequiredError when no refresh token stored', async () => {
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:test-srv',
        token: 'enc:expired-token',
        expiresIn: -1,
      });

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'test-srv',
          findToken: tokenStore.findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should throw ReauthenticationRequiredError with correct reason for expired token', async () => {
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:test-srv',
        token: 'enc:expired-token',
        expiresIn: -1,
      });

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'test-srv',
          findToken: tokenStore.findToken,
        }),
      ).rejects.toThrow('access token expired');
    });

    it('should throw ReauthenticationRequiredError with correct reason for missing token', async () => {
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'test-srv',
          findToken: tokenStore.findToken,
        }),
      ).rejects.toThrow('access token missing');
    });
  });

  describe('PENDING flow fallback for CSRF-less OAuth callbacks', () => {
    it('should allow OAuth completion when PENDING flow exists (simulating chat/SSE path)', async () => {
      const store = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(store as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });

      const flowId = 'user1:test-server';

      await flowManager.initFlow(flowId, 'mcp_oauth', {
        serverName: 'test-server',
        userId: 'user1',
        serverUrl: 'https://example.com',
        state: 'test-state',
        authorizationUrl: 'https://example.com/authorize?state=user1:test-server',
      });

      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(state?.status).toBe('PENDING');

      const tokens: MCPOAuthTokens = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        refresh_token: 'new-refresh-token',
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600000,
      };

      const completed = await flowManager.completeFlow(flowId, 'mcp_oauth', tokens);
      expect(completed).toBe(true);

      const completedState = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(completedState?.status).toBe('COMPLETED');
      expect((completedState?.result as MCPOAuthTokens | undefined)?.access_token).toBe(
        'new-access-token',
      );
    });

    it('should store authorizationUrl in flow metadata for re-issuance', async () => {
      const store = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(store as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });

      const flowId = 'user1:test-server';
      const authUrl = 'https://auth.example.com/authorize?client_id=abc&state=user1:test-server';

      await flowManager.initFlow(flowId, 'mcp_oauth', {
        serverName: 'test-server',
        userId: 'user1',
        serverUrl: 'https://example.com',
        state: 'test-state',
        authorizationUrl: authUrl,
      });

      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect((state?.metadata as Record<string, unknown>)?.authorizationUrl).toBe(authUrl);
    });
  });

  describe('Full token expiry → refresh failure → re-auth flow', () => {
    let server: OAuthTestServer;
    let tokenStore: InMemoryTokenStore;

    beforeEach(async () => {
      server = await createOAuthMCPServer({
        tokenTTLMs: 60000,
        issueRefreshTokens: true,
      });
      tokenStore = new InMemoryTokenStore();
    });

    afterEach(async () => {
      await server.close();
    });

    it('should go through full cycle: get tokens → expire → refresh fails → re-auth needed', async () => {
      // Step 1: Get initial tokens
      const code = await server.getAuthCode();
      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}`,
      });
      const initial = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
      };

      // Step 2: Store tokens with valid expiry first
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'test-srv',
        tokens: initial,
        createToken: tokenStore.createToken,
      });

      // Step 3: Verify tokens work
      const validResult = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'test-srv',
        findToken: tokenStore.findToken,
      });
      expect(validResult).not.toBeNull();
      expect(validResult!.access_token).toBe(initial.access_token);

      // Step 4: Simulate token expiry by directly updating the stored token's expiresAt
      await tokenStore.updateToken({ userId: 'u1', identifier: 'mcp:test-srv' }, { expiresIn: -1 });

      // Step 5: Revoke refresh token on server side (simulating server-side revocation)
      server.issuedRefreshTokens.clear();

      // Step 6: Try to get tokens — refresh should fail, return null
      const refreshCallback = async (refreshToken: string): Promise<MCPOAuthTokens> => {
        const res = await fetch(`${server.url}token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
        });
        if (!res.ok) {
          const body = (await res.json()) as { error: string };
          throw new Error(`Refresh failed: ${body.error}`);
        }
        const data = (await res.json()) as MCPOAuthTokens;
        return data;
      };

      const expiredResult = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'test-srv',
        findToken: tokenStore.findToken,
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        refreshTokens: refreshCallback,
      });

      // Refresh failed → returns null → triggers OAuth re-auth flow
      expect(expiredResult).toBeNull();

      // Step 7: Simulate the re-auth flow via FlowStateManager
      const flowStore = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(flowStore as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });
      const flowId = 'u1:test-srv';

      await flowManager.initFlow(flowId, 'mcp_oauth', {
        serverName: 'test-srv',
        userId: 'u1',
        serverUrl: server.url,
        state: 'test-state',
        authorizationUrl: `${server.url}authorize?state=${flowId}`,
      });

      // Step 8: Get a new auth code and exchange for tokens (simulating user re-auth)
      const newCode = await server.getAuthCode();
      const newTokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${newCode}`,
      });
      const newTokens = (await newTokenRes.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token?: string;
      };

      // Step 9: Complete the flow
      const mcpTokens: MCPOAuthTokens = {
        ...newTokens,
        obtained_at: Date.now(),
        expires_at: Date.now() + newTokens.expires_in * 1000,
      };
      await flowManager.completeFlow(flowId, 'mcp_oauth', mcpTokens);

      // Step 10: Store the new tokens
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'test-srv',
        tokens: mcpTokens,
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
      });

      // Step 11: Verify new tokens work
      const newResult = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'test-srv',
        findToken: tokenStore.findToken,
      });
      expect(newResult).not.toBeNull();
      expect(newResult!.access_token).toBe(newTokens.access_token);

      // Step 12: Verify new token works against server
      const finalMcpRes = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${newResult!.access_token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.1' },
          },
        }),
      });
      expect(finalMcpRes.status).toBe(200);
    });
  });

  describe('Concurrent token expiry with connection mutex', () => {
    it('should handle multiple concurrent getTokens calls when token is expired', async () => {
      const tokenStore = new InMemoryTokenStore();

      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:test-srv',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await tokenStore.createToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:test-srv:refresh',
        token: 'enc:valid-refresh',
        expiresIn: 86400,
      });

      let refreshCallCount = 0;
      const refreshCallback = jest.fn().mockImplementation(async () => {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 100));
        return {
          access_token: `refreshed-token-${refreshCallCount}`,
          token_type: 'Bearer',
          expires_in: 3600,
          obtained_at: Date.now(),
          expires_at: Date.now() + 3600000,
        };
      });

      // Fire 3 concurrent getTokens calls via FlowStateManager (like the connection mutex does)
      const flowStore = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(flowStore as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });

      const getTokensViaFlow = () =>
        flowManager.createFlowWithHandler('u1:test-srv', 'mcp_get_tokens', async () => {
          return await MCPTokenStorage.getTokens({
            userId: 'u1',
            serverName: 'test-srv',
            findToken: tokenStore.findToken,
            createToken: tokenStore.createToken,
            updateToken: tokenStore.updateToken,
            refreshTokens: refreshCallback,
          });
        });

      const [r1, r2, r3] = await Promise.all([
        getTokensViaFlow(),
        getTokensViaFlow(),
        getTokensViaFlow(),
      ]);

      // All should get tokens (either directly or via flow coalescing)
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r3).not.toBeNull();

      // The refresh callback should only be called once due to flow coalescing
      expect(refreshCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stale PENDING flow detection', () => {
    it('should treat PENDING flows older than 2 minutes as stale', async () => {
      const flowStore = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(flowStore as unknown as Keyv, {
        ttl: 300000,
        ci: true,
      });

      const flowId = 'user1:test-server';
      await flowManager.initFlow(flowId, 'mcp_oauth', {
        serverName: 'test-server',
        authorizationUrl: 'https://example.com/auth',
      });

      // Manually age the flow to 3 minutes
      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      if (state) {
        state.createdAt = Date.now() - 3 * 60 * 1000;
        await (flowStore as unknown as { set: (k: string, v: unknown) => Promise<void> }).set(
          `mcp_oauth:${flowId}`,
          state,
        );
      }

      const agedState = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(agedState?.status).toBe('PENDING');

      const age = agedState?.createdAt ? Date.now() - agedState.createdAt : 0;
      expect(age).toBeGreaterThan(2 * 60 * 1000);

      // A new flow should be created (the stale one would be deleted + recreated)
      // This verifies our staleness check threshold
      expect(age > PENDING_STALE_MS).toBe(true);
    });

    it('should not treat recent PENDING flows as stale', async () => {
      const flowStore = new MockKeyv<MCPOAuthTokens | null>();
      const flowManager = new FlowStateManager(flowStore as unknown as Keyv, {
        ttl: 300000,
        ci: true,
      });

      const flowId = 'user1:test-server';
      await flowManager.initFlow(flowId, 'mcp_oauth', {
        serverName: 'test-server',
        authorizationUrl: 'https://example.com/auth',
      });

      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      const age = state?.createdAt ? Date.now() - state.createdAt : Infinity;

      expect(age < PENDING_STALE_MS).toBe(true);
    });
  });
});
