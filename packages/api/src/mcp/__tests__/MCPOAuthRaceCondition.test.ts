/**
 * Tests for MCP OAuth race condition fixes:
 *
 * 1. Connection mutex coalesces concurrent getUserConnection() calls
 * 2. PENDING OAuth flows are reused, not deleted
 * 3. No-refresh-token expiry throws ReauthenticationRequiredError
 * 4. completeFlow recovers when flow state was deleted by a race
 * 5. monitorFlow retries once when flow state disappears mid-poll
 */

import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import { MCPTokenStorage, MCPOAuthHandler, ReauthenticationRequiredError } from '~/mcp/oauth';
import { MockKeyv, createOAuthMCPServer } from './helpers/oauthTestServer';
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
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { CONNECTION_CHECK_TTL: 0, USER_CONNECTION_IDLE_TIMEOUT: 30 * 60 * 1000 },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('MCP OAuth Race Condition Fixes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Fix 1: Connection mutex coalesces concurrent attempts', () => {
    it('should return the same pending promise for concurrent getUserConnection calls', async () => {
      const { UserConnectionManager } = await import('~/mcp/UserConnectionManager');

      class TestManager extends UserConnectionManager {
        public createCallCount = 0;

        getPendingConnections() {
          return this.pendingConnections;
        }
      }

      const manager = new TestManager();

      const mockConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isStale: jest.fn().mockReturnValue(false),
      };

      const mockAppConnections = { has: jest.fn().mockResolvedValue(false) };
      manager.appConnections = mockAppConnections as never;

      const mockConfig = {
        type: 'streamable-http',
        url: 'http://localhost:9999/',
        updatedAt: undefined,
        dbId: undefined,
      };

      jest
        .spyOn(
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('~/mcp/registry/MCPServersRegistry').MCPServersRegistry,
          'getInstance',
        )
        .mockReturnValue({
          getServerConfig: jest.fn().mockResolvedValue(mockConfig),
          shouldEnableSSRFProtection: jest.fn().mockReturnValue(false),
          getAllowedDomains: jest.fn().mockReturnValue(null),
        });

      const { MCPConnectionFactory } = await import('~/mcp/MCPConnectionFactory');
      const createSpy = jest.spyOn(MCPConnectionFactory, 'create').mockImplementation(async () => {
        manager.createCallCount++;
        await new Promise((r) => setTimeout(r, 100));
        return mockConnection as never;
      });

      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });
      const user = { id: 'user-1' };
      const opts = {
        serverName: 'test-server',
        user: user as never,
        flowManager: flowManager as never,
      };

      const [conn1, conn2, conn3] = await Promise.all([
        manager.getUserConnection(opts),
        manager.getUserConnection(opts),
        manager.getUserConnection(opts),
      ]);

      expect(conn1).toBe(conn2);
      expect(conn2).toBe(conn3);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(manager.createCallCount).toBe(1);

      createSpy.mockRestore();
    });

    it('should not coalesce when forceNew is true', async () => {
      const { UserConnectionManager } = await import('~/mcp/UserConnectionManager');

      class TestManager extends UserConnectionManager {}

      const manager = new TestManager();

      let callCount = 0;
      const makeConnection = () => ({
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isStale: jest.fn().mockReturnValue(false),
      });

      const mockAppConnections = { has: jest.fn().mockResolvedValue(false) };
      manager.appConnections = mockAppConnections as never;

      const mockConfig = {
        type: 'streamable-http',
        url: 'http://localhost:9999/',
        updatedAt: undefined,
        dbId: undefined,
      };

      jest
        .spyOn(
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('~/mcp/registry/MCPServersRegistry').MCPServersRegistry,
          'getInstance',
        )
        .mockReturnValue({
          getServerConfig: jest.fn().mockResolvedValue(mockConfig),
          shouldEnableSSRFProtection: jest.fn().mockReturnValue(false),
          getAllowedDomains: jest.fn().mockReturnValue(null),
        });

      const { MCPConnectionFactory } = await import('~/mcp/MCPConnectionFactory');
      jest.spyOn(MCPConnectionFactory, 'create').mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return makeConnection() as never;
      });

      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });
      const user = { id: 'user-2' };

      const [conn1, conn2] = await Promise.all([
        manager.getUserConnection({
          serverName: 'test-server',
          forceNew: true,
          user: user as never,
          flowManager: flowManager as never,
        }),
        manager.getUserConnection({
          serverName: 'test-server',
          forceNew: true,
          user: user as never,
          flowManager: flowManager as never,
        }),
      ]);

      expect(callCount).toBe(2);
      expect(conn1).not.toBe(conn2);
    });
  });

  describe('Fix 2: PENDING flow is reused, not deleted', () => {
    it('should join an existing PENDING flow via createFlow instead of deleting it', async () => {
      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });

      const flowId = 'test-flow-pending';

      await flowManager.initFlow(flowId, 'mcp_oauth', {
        clientInfo: { client_id: 'test-client' },
      });

      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(state?.status).toBe('PENDING');

      const deleteSpy = jest.spyOn(flowManager, 'deleteFlow');

      const monitorPromise = flowManager.createFlow(flowId, 'mcp_oauth', {});

      await new Promise((r) => setTimeout(r, 500));

      await flowManager.completeFlow(flowId, 'mcp_oauth', {
        access_token: 'test-token',
        token_type: 'Bearer',
      } as never);

      const result = await monitorPromise;
      expect(result).toEqual(
        expect.objectContaining({ access_token: 'test-token', token_type: 'Bearer' }),
      );
      expect(deleteSpy).not.toHaveBeenCalled();

      deleteSpy.mockRestore();
    });

    it('should delete and recreate FAILED flows', async () => {
      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });

      const flowId = 'test-flow-failed';
      await flowManager.initFlow(flowId, 'mcp_oauth', {});
      await flowManager.failFlow(flowId, 'mcp_oauth', 'previous error');

      const state = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(state?.status).toBe('FAILED');

      await flowManager.deleteFlow(flowId, 'mcp_oauth');

      const afterDelete = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(afterDelete).toBeUndefined();
    });
  });

  describe('Fix 3: completeFlow handles deleted state gracefully', () => {
    it('should return false when state was deleted by race', async () => {
      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });

      const flowId = 'race-deleted-flow';

      await flowManager.initFlow(flowId, 'mcp_oauth', {});
      await flowManager.deleteFlow(flowId, 'mcp_oauth');

      const stateBeforeComplete = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(stateBeforeComplete).toBeUndefined();

      const result = await flowManager.completeFlow(flowId, 'mcp_oauth', {
        access_token: 'recovered-token',
        token_type: 'Bearer',
      } as never);

      expect(result).toBe(false);

      const stateAfterComplete = await flowManager.getFlowState(flowId, 'mcp_oauth');
      expect(stateAfterComplete).toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('flow not found'),
        expect.any(Object),
      );
    });

    it('should reject monitorFlow when state is deleted and not recoverable', async () => {
      const store = new MockKeyv();
      const flowManager = new FlowStateManager(store as unknown as Keyv, { ttl: 30000, ci: true });

      const flowId = 'monitor-retry-flow';

      await flowManager.initFlow(flowId, 'mcp_oauth', {});

      const monitorPromise = flowManager.createFlow(flowId, 'mcp_oauth', {});

      await new Promise((r) => setTimeout(r, 500));

      await flowManager.deleteFlow(flowId, 'mcp_oauth');

      await expect(monitorPromise).rejects.toThrow('Flow state not found');
    });
  });

  describe('State mapping cleanup on flow replacement', () => {
    it('should delete old state mapping when a flow is replaced', async () => {
      const store = new MockKeyv();
      const flowManager = new FlowStateManager<MCPOAuthTokens | null>(store as unknown as Keyv, {
        ttl: 30000,
        ci: true,
      });

      const flowId = 'user1:test-server';
      const oldState = 'old-random-state-abc123';
      const newState = 'new-random-state-xyz789';

      // Simulate initial flow with state mapping
      await flowManager.initFlow(flowId, 'mcp_oauth', { state: oldState });
      await MCPOAuthHandler.storeStateMapping(oldState, flowId, flowManager);

      // Old state should resolve
      const resolvedBefore = await MCPOAuthHandler.resolveStateToFlowId(oldState, flowManager);
      expect(resolvedBefore).toBe(flowId);

      // Replace the flow: delete old, create new, clean up old state mapping
      await flowManager.deleteFlow(flowId, 'mcp_oauth');
      await MCPOAuthHandler.deleteStateMapping(oldState, flowManager);
      await flowManager.initFlow(flowId, 'mcp_oauth', { state: newState });
      await MCPOAuthHandler.storeStateMapping(newState, flowId, flowManager);

      // Old state should no longer resolve
      const resolvedOld = await MCPOAuthHandler.resolveStateToFlowId(oldState, flowManager);
      expect(resolvedOld).toBeNull();

      // New state should resolve
      const resolvedNew = await MCPOAuthHandler.resolveStateToFlowId(newState, flowManager);
      expect(resolvedNew).toBe(flowId);
    });
  });

  describe('Fix 4: ReauthenticationRequiredError for no-refresh-token', () => {
    it('should throw ReauthenticationRequiredError when access token expired and no refresh token', async () => {
      const expiredDate = new Date(Date.now() - 60000);

      const findToken = jest.fn().mockImplementation(async (filter: { type?: string }) => {
        if (filter.type === 'mcp_oauth') {
          return {
            token: 'enc:expired-access-token',
            expiresAt: expiredDate,
            createdAt: new Date(Date.now() - 120000),
          };
        }
        if (filter.type === 'mcp_oauth_refresh') {
          return null;
        }
        return null;
      });

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'user-1',
          serverName: 'test-server',
          findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'user-1',
          serverName: 'test-server',
          findToken,
        }),
      ).rejects.toThrow('Re-authentication required');
    });

    it('should throw ReauthenticationRequiredError when access token is missing and no refresh token', async () => {
      const findToken = jest.fn().mockResolvedValue(null);

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'user-1',
          serverName: 'test-server',
          findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should not throw when access token is valid', async () => {
      const futureDate = new Date(Date.now() + 3600000);

      const findToken = jest.fn().mockImplementation(async (filter: { type?: string }) => {
        if (filter.type === 'mcp_oauth') {
          return {
            token: 'enc:valid-access-token',
            expiresAt: futureDate,
            createdAt: new Date(),
          };
        }
        if (filter.type === 'mcp_oauth_refresh') {
          return null;
        }
        return null;
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'user-1',
        serverName: 'test-server',
        findToken,
      });

      expect(result).not.toBeNull();
      expect(result?.access_token).toBe('valid-access-token');
    });
  });

  describe('E2E: OAuth-gated MCP server with no refresh tokens', () => {
    let server: OAuthTestServer;

    beforeEach(async () => {
      server = await createOAuthMCPServer({ tokenTTLMs: 60000 });
    });

    afterEach(async () => {
      await server.close();
    });

    it('should start OAuth-gated MCP server that validates Bearer tokens', async () => {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('invalid_token');
    });

    it('should issue tokens via authorization code exchange with no refresh token', async () => {
      const authRes = await fetch(`${server.url}authorize?redirect_uri=http://localhost&state=s1`, {
        redirect: 'manual',
      });

      expect(authRes.status).toBe(302);
      const location = authRes.headers.get('location') ?? '';
      const code = new URL(location).searchParams.get('code');
      expect(code).toBeTruthy();

      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}`,
      });

      expect(tokenRes.status).toBe(200);
      const tokenBody = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
        refresh_token?: string;
      };
      expect(tokenBody.access_token).toBeTruthy();
      expect(tokenBody.token_type).toBe('Bearer');
      expect(tokenBody.refresh_token).toBeUndefined();
    });

    it('should allow MCP requests with valid Bearer token', async () => {
      const authRes = await fetch(`${server.url}authorize?redirect_uri=http://localhost&state=s1`, {
        redirect: 'manual',
      });
      const location = authRes.headers.get('location') ?? '';
      const code = new URL(location).searchParams.get('code');

      const tokenRes = await fetch(`${server.url}token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&code=${code}`,
      });

      const { access_token } = (await tokenRes.json()) as { access_token: string };

      const mcpRes = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${access_token}`,
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

    it('should reject expired tokens with 401', async () => {
      const shortTTLServer = await createOAuthMCPServer({ tokenTTLMs: 500 });

      try {
        const authRes = await fetch(
          `${shortTTLServer.url}authorize?redirect_uri=http://localhost&state=s1`,
          { redirect: 'manual' },
        );
        const location = authRes.headers.get('location') ?? '';
        const code = new URL(location).searchParams.get('code');

        const tokenRes = await fetch(`${shortTTLServer.url}token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=authorization_code&code=${code}`,
        });

        const { access_token } = (await tokenRes.json()) as { access_token: string };

        await new Promise((r) => setTimeout(r, 600));

        const mcpRes = await fetch(shortTTLServer.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 2 }),
        });

        expect(mcpRes.status).toBe(401);
      } finally {
        await shortTTLServer.close();
      }
    });
  });
});
