/**
 * Tests for MCP OAuth client registration reuse on reconnection.
 *
 * Documents the client_id mismatch bug in horizontally scaled deployments:
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
 * The fix stabilizes reconnection flows: before calling registerClient(), check
 * MongoDB (shared across replicas) for an existing client registration from a prior
 * successful OAuth flow and reuse it. This eliminates redundant /register calls on
 * reconnection. Note: the first-time concurrent auth race is NOT addressed by this
 * fix and would require a distributed lock (e.g., Redis SETNX) around registration.
 */

import type { OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import { InMemoryTokenStore, createOAuthMCPServer } from './helpers/oauthTestServer';
import { MCPOAuthHandler, MCPTokenStorage } from '~/mcp/oauth';

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

describe('MCPOAuthHandler - client registration reuse on reconnection', () => {
  let server: OAuthTestServer;
  let originalDomainServer: string | undefined;

  beforeEach(() => {
    originalDomainServer = process.env.DOMAIN_SERVER;
    process.env.DOMAIN_SERVER = 'http://localhost:3080';
  });

  afterEach(async () => {
    if (originalDomainServer !== undefined) {
      process.env.DOMAIN_SERVER = originalDomainServer;
    } else {
      delete process.env.DOMAIN_SERVER;
    }
    if (server) {
      await server.close();
    }
    jest.clearAllMocks();
  });

  describe('Race condition reproduction: concurrent replicas re-register', () => {
    it('should produce duplicate client registrations when two replicas initiate flows concurrently', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });

      const [resultA, resultB] = await Promise.all([
        MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {}),
        MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {}),
      ]);

      expect(resultA.authorizationUrl).toBeTruthy();
      expect(resultB.authorizationUrl).toBeTruthy();
      expect(server.registeredClients.size).toBe(2);

      const clientA = resultA.flowMetadata.clientInfo?.client_id;
      const clientB = resultB.flowMetadata.clientInfo?.client_id;
      expect(clientA).not.toBe(clientB);
    });

    it('should re-register on every sequential initiateOAuthFlow call (reconnections)', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(1);

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(2);

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});
      expect(server.registeredClients.size).toBe(3);
    });
  });

  describe('Client reuse via findToken on reconnection', () => {
    it('should reuse an existing client registration when findToken returns stored client info', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      const firstResult = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );
      expect(server.registeredClients.size).toBe(1);
      const firstClientId = firstResult.flowMetadata.clientInfo?.client_id;

      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'test-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: firstResult.flowMetadata.clientInfo,
        metadata: firstResult.flowMetadata.metadata,
      });

      const secondResult = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      expect(server.registeredClients.size).toBe(1);
      expect(secondResult.flowMetadata.clientInfo?.client_id).toBe(firstClientId);
    });

    it('should reuse the same client when two reconnections fire concurrently with pre-seeded token', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      const initialResult = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );
      const storedClientId = initialResult.flowMetadata.clientInfo?.client_id;

      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'test-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: initialResult.flowMetadata.clientInfo,
        metadata: initialResult.flowMetadata.metadata,
      });

      const [resultA, resultB] = await Promise.all([
        MCPOAuthHandler.initiateOAuthFlow(
          'test-server',
          server.url,
          'user-1',
          {},
          undefined,
          undefined,
          tokenStore.findToken,
        ),
        MCPOAuthHandler.initiateOAuthFlow(
          'test-server',
          server.url,
          'user-1',
          {},
          undefined,
          undefined,
          tokenStore.findToken,
        ),
      ]);

      // Both should reuse the stored client — only the initial registration should exist
      expect(server.registeredClients.size).toBe(1);
      expect(resultA.flowMetadata.clientInfo?.client_id).toBe(storedClientId);
      expect(resultB.flowMetadata.clientInfo?.client_id).toBe(storedClientId);
    });

    it('should re-register when stored redirect_uri differs from current', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'old-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: {
          client_id: 'old-client-id',
          client_secret: 'old-secret',
          redirect_uris: ['http://old-domain.com/api/mcp/test-server/oauth/callback'],
        } as OAuthClientInformation & { redirect_uris: string[] },
      });

      const result = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).not.toBe('old-client-id');
    });

    it('should re-register when stored client has empty redirect_uris', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'old-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: {
          client_id: 'empty-redirect-client',
          client_secret: 'secret',
          redirect_uris: [],
        } as OAuthClientInformation & { redirect_uris: string[] },
      });

      const result = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      // Should NOT reuse the client with empty redirect_uris — must re-register
      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).not.toBe('empty-redirect-client');
    });

    it('should fall back to registration when findToken lookup throws', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
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

      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).toBeTruthy();
    });

    it('should not reuse a stale client on retry after a failed flow', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      // Seed a stored client with a client_id that the OAuth server doesn't recognize
      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'old-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: {
          client_id: 'stale-client-that-oauth-server-deleted',
          client_secret: 'stale-secret',
          redirect_uris: ['http://localhost:3080/api/mcp/test-server/oauth/callback'],
        } as OAuthClientInformation & { redirect_uris: string[] },
      });

      // First attempt: reuses the stale client (this is expected — we don't know it's stale yet)
      const firstResult = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );
      expect(firstResult.flowMetadata.clientInfo?.client_id).toBe(
        'stale-client-that-oauth-server-deleted',
      );
      expect(server.registeredClients.size).toBe(0);

      // Simulate flow failure: the OAuth server rejected the stale client_id,
      // so the operator clears the stored client registration
      await MCPTokenStorage.deleteClientRegistration({
        userId: 'user-1',
        serverName: 'test-server',
        deleteTokens: tokenStore.deleteToken,
      });

      // Second attempt (retry after failure): should do a fresh DCR
      const secondResult = await MCPOAuthHandler.initiateOAuthFlow(
        'test-server',
        server.url,
        'user-1',
        {},
        undefined,
        undefined,
        tokenStore.findToken,
      );

      // Now it registered a new client
      expect(server.registeredClients.size).toBe(1);
      expect(secondResult.flowMetadata.clientInfo?.client_id).not.toBe(
        'stale-client-that-oauth-server-deleted',
      );
    });

    it('should not call getClientInfoAndMetadata when findToken is not provided', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const spy = jest.spyOn(MCPTokenStorage, 'getClientInfoAndMetadata');

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
