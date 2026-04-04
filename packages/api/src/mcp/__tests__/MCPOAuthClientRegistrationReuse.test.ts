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
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
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
  let server: OAuthTestServer | undefined;
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
      server = undefined;
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
      expect(secondResult.flowMetadata.reusedStoredClient).toBe(true);
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

      // Seed a stored client with a client_id that the OAuth server doesn't recognize,
      // but with matching issuer and redirect_uri so reuse logic accepts it
      const serverIssuer = `http://127.0.0.1:${server.port}`;
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
        metadata: {
          issuer: serverIssuer,
          authorization_endpoint: `${serverIssuer}/authorize`,
          token_endpoint: `${serverIssuer}/token`,
        },
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
      expect(firstResult.flowMetadata.reusedStoredClient).toBe(true);
      expect(server.registeredClients.size).toBe(0);

      // Simulate what MCPConnectionFactory does on failure when reusedStoredClient is set:
      // clear the stored client registration so the next attempt does a fresh DCR
      await MCPTokenStorage.deleteClientRegistration({
        userId: 'user-1',
        serverName: 'test-server',
        deleteTokens: tokenStore.deleteTokens,
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

      expect(server.registeredClients.size).toBe(1);
      expect(secondResult.flowMetadata.clientInfo?.client_id).not.toBe(
        'stale-client-that-oauth-server-deleted',
      );
      expect(secondResult.flowMetadata.reusedStoredClient).toBeUndefined();
    });

    it('should re-register when stored client was issued by a different authorization server', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const tokenStore = new InMemoryTokenStore();

      // Seed a stored client that was registered with a different issuer
      await MCPTokenStorage.storeTokens({
        userId: 'user-1',
        serverName: 'test-server',
        tokens: { access_token: 'old-token', token_type: 'Bearer' },
        createToken: tokenStore.createToken,
        updateToken: tokenStore.updateToken,
        findToken: tokenStore.findToken,
        clientInfo: {
          client_id: 'old-issuer-client',
          client_secret: 'secret',
          redirect_uris: ['http://localhost:3080/api/mcp/test-server/oauth/callback'],
        } as OAuthClientInformation & { redirect_uris: string[] },
        metadata: {
          issuer: 'https://old-auth-server.example.com',
          authorization_endpoint: 'https://old-auth-server.example.com/authorize',
          token_endpoint: 'https://old-auth-server.example.com/token',
        },
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

      // Should have registered a NEW client because the issuer changed
      expect(server.registeredClients.size).toBe(1);
      expect(result.flowMetadata.clientInfo?.client_id).not.toBe('old-issuer-client');
      expect(result.flowMetadata.reusedStoredClient).toBeUndefined();
    });

    it('should not call getClientInfoAndMetadata when findToken is not provided', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
      const spy = jest.spyOn(MCPTokenStorage, 'getClientInfoAndMetadata');

      await MCPOAuthHandler.initiateOAuthFlow('test-server', server.url, 'user-1', {});

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('isClientRejection', () => {
    it('should detect invalid_client errors', () => {
      expect(MCPConnectionFactory.isClientRejection(new Error('invalid_client'))).toBe(true);
      expect(
        MCPConnectionFactory.isClientRejection(
          new Error('OAuth token exchange failed: invalid_client'),
        ),
      ).toBe(true);
    });

    it('should detect unauthorized_client errors', () => {
      expect(MCPConnectionFactory.isClientRejection(new Error('unauthorized_client'))).toBe(true);
    });

    it('should detect client_id mismatch errors', () => {
      expect(
        MCPConnectionFactory.isClientRejection(
          new Error('Token exchange rejected: client_id mismatch'),
        ),
      ).toBe(true);
    });

    it('should detect client not found errors', () => {
      expect(MCPConnectionFactory.isClientRejection(new Error('client not found'))).toBe(true);
      expect(MCPConnectionFactory.isClientRejection(new Error('unknown client'))).toBe(true);
    });

    it('should not match unrelated errors', () => {
      expect(MCPConnectionFactory.isClientRejection(new Error('timeout'))).toBe(false);
      expect(MCPConnectionFactory.isClientRejection(new Error('Flow state not found'))).toBe(false);
      expect(MCPConnectionFactory.isClientRejection(new Error('user denied access'))).toBe(false);
      expect(MCPConnectionFactory.isClientRejection(null)).toBe(false);
      expect(MCPConnectionFactory.isClientRejection(undefined)).toBe(false);
    });
  });

  describe('Token exchange with enforced client_id', () => {
    it('should reject token exchange when client_id does not match registered client', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000, enforceClientId: true });

      // Register a real client via DCR
      const regRes = await fetch(`${server.url}register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['http://localhost/callback'] }),
      });
      const registered = (await regRes.json()) as { client_id: string };

      // Get an auth code bound to the registered client_id
      const authRes = await fetch(
        `${server.url}authorize?redirect_uri=http://localhost/callback&state=s1&client_id=${registered.client_id}`,
        { redirect: 'manual' },
      );
      const location = authRes.headers.get('location') ?? '';
      const code = new URL(location).searchParams.get('code');

      // Try to exchange the code with a DIFFERENT (stale) client_id
      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}&client_id=stale-client-id`,
      });

      expect(tokenRes.status).toBe(401);
      const body = (await tokenRes.json()) as { error: string; error_description?: string };
      expect(body.error).toBe('invalid_client');

      // Verify isClientRejection would match this error
      const errorMsg = body.error_description ?? body.error;
      expect(MCPConnectionFactory.isClientRejection(new Error(errorMsg))).toBe(true);
    });

    it('should accept token exchange when client_id matches', async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000, enforceClientId: true });

      const regRes = await fetch(`${server.url}register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['http://localhost/callback'] }),
      });
      const registered = (await regRes.json()) as { client_id: string };

      const authRes = await fetch(
        `${server.url}authorize?redirect_uri=http://localhost/callback&state=s1&client_id=${registered.client_id}`,
        { redirect: 'manual' },
      );
      const location = authRes.headers.get('location') ?? '';
      const code = new URL(location).searchParams.get('code');

      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}&client_id=${registered.client_id}`,
      });

      expect(tokenRes.status).toBe(200);
      const body = (await tokenRes.json()) as { access_token: string };
      expect(body.access_token).toBeTruthy();
    });
  });
});
