/**
 * Tests for MCP OAuth client registration reuse (PR #11925).
 *
 * Reproduces the client_id mismatch bug in horizontally scaled deployments:
 *
 * When LibreChat runs with multiple replicas (e.g., 3 behind a load balancer),
 * each replica independently calls registerClient() on the OAuth server's /register
 * endpoint, getting a different client_id. The check-then-act race between the
 * PENDING flow check and storing the flow state means that even with a shared
 * Redis-backed flow store, replicas slip through before any has stored PENDING:
 *
 *   Replica A: getFlowState() → null → initiateOAuthFlow() → registers client_A
 *   Replica B: getFlowState() → null → initiateOAuthFlow() → registers client_B
 *   Replica A: initFlow(metadata with client_A) → stored in Redis
 *   Replica B: initFlow(metadata with client_B) → OVERWRITES in Redis
 *   User completes OAuth in browser with client_A in the URL
 *   Callback reads Redis → finds client_B → token exchange fails: "client_id mismatch"
 *
 * The fix: before calling registerClient(), check MongoDB (shared across replicas)
 * for an existing client registration and reuse it. This is done by passing
 * findToken to initiateOAuthFlow, which looks up MCPTokenStorage.getClientInfoAndMetadata().
 *
 * These tests are designed to FAIL on the current dev branch and PASS with PR #11925.
 */

import { Keyv } from 'keyv';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import { MockKeyv, InMemoryTokenStore, createOAuthMCPServer } from './helpers/oauthTestServer';
import { MCPOAuthHandler, MCPTokenStorage } from '~/mcp/oauth';
import { FlowStateManager } from '~/flow/manager';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(),
  SYSTEM_TENANT_ID: '__SYSTEM__',
  encryptV2: jest.fn(async (val: string) => `enc:${val}`),
  decryptV2: jest.fn(async (val: string) => val.replace(/^enc:/, '')),
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  resolveHostnameSSRF: jest.fn(async () => false),
  isSSRFTarget: jest.fn(async () => false),
  isOAuthUrlAllowed: jest.fn(() => true),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { CONNECTION_CHECK_TTL: 0, USER_CONNECTION_IDLE_TIMEOUT: 30 * 60 * 1000 },
}));

describe('MCP OAuth Client Registration Reuse (PR #11925)', () => {
  let server: OAuthTestServer;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    jest.clearAllMocks();
  });

  describe('Race condition reproduction: concurrent replicas re-register', () => {
    it('should produce duplicate client registrations when two replicas initiate flows concurrently', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      const serverName = 'test-server';
      const userId = 'user-1';

      // Simulate two replicas calling initiateOAuthFlow concurrently
      // Both slip past the PENDING flow check (check-then-act race)
      const [resultA, resultB] = await Promise.all([
        MCPOAuthHandler.initiateOAuthFlow(serverName, server.url, userId, {}),
        MCPOAuthHandler.initiateOAuthFlow(serverName, server.url, userId, {}),
      ]);

      expect(resultA.authorizationUrl).toBeTruthy();
      expect(resultB.authorizationUrl).toBeTruthy();

      // Two separate client registrations hit the OAuth server
      expect(server.registeredClients.size).toBe(2);

      // Each got a different client_id — this is the root cause of the mismatch
      const clientA = resultA.flowMetadata.clientInfo?.client_id;
      const clientB = resultB.flowMetadata.clientInfo?.client_id;
      expect(clientA).not.toBe(clientB);
    });

    it('should re-register on every sequential initiateOAuthFlow call (reconnections)', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      // First flow
      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(1);

      // Second flow (page reload / reconnection) — registers again
      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(2);

      // Third flow — yet another registration
      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(3);
    });
  });

  describe('Fix: reuse stored client registration via findToken', () => {
    it('should reuse an existing client registration when findToken returns stored client info', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      const serverName = 'test-server';
      const userId = 'user-1';
      const tokenStore = new InMemoryTokenStore();

      // First flow: no stored client → registers a new one
      const firstResult = await MCPOAuthHandler.initiateOAuthFlow(
        serverName,
        server.url,
        userId,
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );
      expect(server.registeredClients.size).toBe(1);
      const firstClientId = firstResult.flowMetadata.clientInfo?.client_id;
      expect(firstClientId).toBeTruthy();

      // Simulate what happens after a successful OAuth flow:
      // storeTokens() saves the client info to MongoDB (here: InMemoryTokenStore)
      await MCPTokenStorage.storeTokens({
        userId,
        serverName,
        tokens: { access_token: 'test-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: firstResult.flowMetadata.clientInfo,
        metadata: firstResult.flowMetadata.metadata,
      });

      // Second flow (reconnection): findToken should find the stored client → reuse it
      const secondResult = await MCPOAuthHandler.initiateOAuthFlow(
        serverName,
        server.url,
        userId,
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      // Should still be only 1 registration on the OAuth server (reused the first)
      expect(server.registeredClients.size).toBe(1);

      // Same client_id used in both flows
      const secondClientId = secondResult.flowMetadata.clientInfo?.client_id;
      expect(secondClientId).toBe(firstClientId);
    });

    it('should re-register when stored redirect_uri differs from current', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      const serverName = 'test-server';
      const userId = 'user-1';
      const tokenStore = new InMemoryTokenStore();

      // Seed a stored client with a different redirect_uri (simulating domain change)
      const oldClientInfo = {
        client_id: 'old-client-id',
        client_secret: 'old-secret',
        redirect_uris: ['http://old-domain.com/api/mcp/test-server/oauth/callback'],
      };

      await MCPTokenStorage.storeTokens({
        userId,
        serverName,
        tokens: { access_token: 'old-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: oldClientInfo,
      });

      // New flow with different DOMAIN_SERVER → redirect_uri changed
      const result = await MCPOAuthHandler.initiateOAuthFlow(
        serverName,
        server.url,
        userId,
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      // Should have registered a NEW client because redirect_uri changed
      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).not.toBe('old-client-id');
    });

    it('should fall back to registration when findToken lookup throws', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      const failingFindToken = jest.fn().mockRejectedValue(new Error('DB connection lost'));

      const result = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        failingFindToken,
      );

      // Should have fallen back to registering a new client
      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).toBeTruthy();
    });

    it('should not call getClientInfoAndMetadata when findToken is not provided', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      process.env.DOMAIN_SERVER = 'http://localhost:3080';

      const spy = jest.spyOn(MCPTokenStorage, 'getClientInfoAndMetadata');

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});

      // Without findToken, should not attempt client reuse lookup
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
