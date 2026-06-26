import { Keyv } from 'keyv';
import type { IUser } from '@librechat/data-schemas';
import type {
  OAuthClientInformation,
  OAuthStoredClientMetadata,
  MCPOAuthTokens,
} from '~/mcp/oauth';
import {
  MockKeyv,
  InMemoryTokenStore,
  createOAuthMCPServer,
  type OAuthTestServer,
} from './helpers/oauthTestServer';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { FlowStateManager } from '~/flow/manager';
import { MCPConnection } from '~/mcp/connection';
import { MCPTokenStorage } from '~/mcp/oauth';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(),
  tenantStorage: {
    getStore: jest.fn(),
    run: jest.fn((_context, fn: () => Promise<unknown>) => fn()),
  },
  encryptV2: jest.fn(async (val: string) => `enc:${val}`),
  decryptV2: jest.fn(async (val: string) => val.replace(/^enc:/, '')),
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  isOAuthUrlAllowed: jest.fn(() => false),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: {
    CONNECTION_CHECK_TTL: 0,
    USER_CONNECTION_IDLE_TIMEOUT: 30 * 60 * 1000,
    TOOLS_LIST_MAX_PAGES: 50,
    TOOLS_LIST_MAX_TOOLS: 1000,
    TOOLS_LIST_MAX_BYTES: 5 * 1024 * 1024,
    TOOLS_LIST_TIMEOUT_MS: 30000,
  },
}));

const SERVER_NAME = 'sdk-oauth-server';
const USER_ID = 'sdk-user';
const CLIENT_ID = 'librechat-sdk-test-client';

async function safeDisconnect(conn: MCPConnection | null): Promise<void> {
  if (!conn) {
    return;
  }
  (conn as unknown as { shouldStopReconnecting: boolean }).shouldStopReconnecting = true;
  conn.removeAllListeners();
  await conn.disconnect().catch(() => undefined);
}

function createFlowManager(): FlowStateManager<MCPOAuthTokens | null> {
  return new FlowStateManager(new MockKeyv<MCPOAuthTokens | null>() as unknown as Keyv, {
    ttl: 30000,
    ci: true,
  });
}

async function issueTokens(server: OAuthTestServer, scope = 'read'): Promise<MCPOAuthTokens> {
  const authUrl = new URL('authorize', server.url);
  authUrl.searchParams.set('redirect_uri', 'http://localhost');
  authUrl.searchParams.set('state', 'sdk-test');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('resource', server.resourceUrl);

  const authRes = await fetch(authUrl, { redirect: 'manual' });
  const location = authRes.headers.get('location');
  if (!location) {
    throw new Error(`Authorization failed with ${authRes.status}`);
  }
  const code = new URL(location).searchParams.get('code');
  if (!code) {
    throw new Error('Authorization response did not include a code');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    resource: server.resourceUrl,
  });
  const tokenRes = await fetch(new URL('token', server.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };
  return {
    ...tokens,
    obtained_at: Date.now(),
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

async function storeTokens(
  tokenStore: InMemoryTokenStore,
  server: OAuthTestServer,
  tokens: MCPOAuthTokens,
  scope = 'read',
): Promise<void> {
  const clientInfo: OAuthClientInformation = {
    client_id: CLIENT_ID,
    redirect_uris: ['http://localhost'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope,
  };
  const metadata: OAuthStoredClientMetadata = {
    issuer: server.url.replace(/\/$/, ''),
    authorization_endpoint: new URL('authorize', server.url).href,
    token_endpoint: new URL('token', server.url).href,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: scope.split(/\s+/).filter(Boolean),
    resource: server.resourceUrl,
  };

  await MCPTokenStorage.storeTokens({
    userId: USER_ID,
    serverName: SERVER_NAME,
    tokens,
    createToken: tokenStore.createToken,
    updateToken: tokenStore.updateToken,
    findToken: tokenStore.findToken,
    clientInfo,
    metadata,
  });
}

describe('MCPConnectionFactory OAuth against real SDK Streamable HTTP server', () => {
  let server: OAuthTestServer;
  let connection: MCPConnection | null;
  let tokenStore: InMemoryTokenStore;

  beforeEach(() => {
    MCPConnection.clearCooldown(SERVER_NAME);
    connection = null;
    tokenStore = new InMemoryTokenStore();
  });

  afterEach(async () => {
    await safeDisconnect(connection);
    if (server) {
      await server.close();
    }
    jest.clearAllMocks();
  });

  it('silently refreshes a server-rejected token and reconnects with the MCP resource parameter', async () => {
    server = await createOAuthMCPServer({
      issueRefreshTokens: true,
      requireResourceParameter: true,
      tokenScopes: ['read'],
      scopesSupported: ['read'],
    });
    const initialTokens = await issueTokens(server);
    await storeTokens(tokenStore, server, initialTokens);

    server.issuedTokens.delete(initialTokens.access_token);

    connection = await MCPConnectionFactory.create(
      {
        serverName: SERVER_NAME,
        serverConfig: {
          type: 'streamable-http',
          url: server.url,
          initTimeout: 15000,
        },
      },
      {
        useOAuth: true,
        user: { id: USER_ID } as IUser,
        flowManager: createFlowManager(),
        tokenMethods: {
          findToken: tokenStore.findToken,
          createToken: tokenStore.createToken,
          updateToken: tokenStore.updateToken,
          deleteTokens: tokenStore.deleteTokens,
        },
      },
    );

    expect(await connection.isConnected()).toBe(true);
    const tools = await connection.fetchTools();
    expect(tools.some((tool) => tool.name === 'echo')).toBe(true);

    const refreshRequest = server.tokenRequests.find(
      (request) => request.grantType === 'refresh_token',
    );
    expect(refreshRequest).toEqual(
      expect.objectContaining({
        resource: server.resourceUrl,
        clientId: CLIENT_ID,
      }),
    );

    const storedAccessToken = await tokenStore.findToken({
      userId: USER_ID,
      type: 'mcp_oauth',
      identifier: `mcp:${SERVER_NAME}`,
    });
    expect(storedAccessToken?.token).not.toBe(`enc:${initialTokens.access_token}`);
  });

  it('does not silently refresh an SDK insufficient_scope challenge before starting OAuth', async () => {
    server = await createOAuthMCPServer({
      issueRefreshTokens: true,
      requireResourceParameter: true,
      tokenScopes: ['read'],
      requiredScopes: ['write'],
      scopesSupported: ['write'],
    });
    const initialTokens = await issueTokens(server);
    await storeTokens(tokenStore, server, initialTokens);

    const oauthStart = jest.fn(async (_authorizationUrl: string): Promise<void> => undefined);
    await expect(
      MCPConnectionFactory.create(
        {
          serverName: SERVER_NAME,
          serverConfig: {
            type: 'streamable-http',
            url: server.url,
            initTimeout: 15000,
          },
        },
        {
          useOAuth: true,
          user: { id: USER_ID } as IUser,
          flowManager: createFlowManager(),
          tokenMethods: {
            findToken: tokenStore.findToken,
            createToken: tokenStore.createToken,
            updateToken: tokenStore.updateToken,
            deleteTokens: tokenStore.deleteTokens,
          },
          returnOnOAuth: true,
          oauthStart,
        },
      ),
    ).rejects.toThrow();

    expect(
      server.tokenRequests.filter((request) => request.grantType === 'refresh_token'),
    ).toHaveLength(0);
    expect(oauthStart).toHaveBeenCalledTimes(1);
    const authorizationUrl = new URL(oauthStart.mock.calls[0][0]);
    expect(authorizationUrl.searchParams.get('resource')).toBe(server.resourceUrl);
    expect(authorizationUrl.searchParams.get('scope')).toBe('write');
  });
});
