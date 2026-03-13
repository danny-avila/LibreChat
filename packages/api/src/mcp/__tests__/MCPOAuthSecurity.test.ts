/**
 * Tests verifying MCP OAuth security hardening:
 *
 * 1. SSRF via OAuth token_url — validates that the OAuth handler rejects
 *    token_url values pointing to private/internal addresses.
 *
 * 2. redirect_uri manipulation — validates that user-supplied redirect_uri
 *    is ignored in favor of the server-controlled default.
 */

import * as http from 'http';
import * as net from 'net';
import { TokenExchangeMethodEnum } from 'librechat-data-provider';
import type { Socket } from 'net';
import type { OAuthTestServer } from './helpers/oauthTestServer';
import { createOAuthMCPServer } from './helpers/oauthTestServer';
import { MCPOAuthHandler } from '~/mcp/oauth';

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

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => (err ? reject(err) : resolve(addr.port)));
    });
  });
}

function trackSockets(httpServer: http.Server): () => Promise<void> {
  const sockets = new Set<Socket>();
  httpServer.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return () =>
    new Promise<void>((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      httpServer.close(() => resolve());
    });
}

describe('MCP OAuth SSRF via token_url', () => {
  let oauthServer: OAuthTestServer;
  let ssrfTargetServer: http.Server;
  let ssrfTargetPort: number;
  let ssrfRequestReceived: boolean;
  let destroySSRFSockets: () => Promise<void>;

  beforeEach(async () => {
    ssrfRequestReceived = false;

    oauthServer = await createOAuthMCPServer({
      tokenTTLMs: 60000,
      issueRefreshTokens: true,
    });

    ssrfTargetPort = await getFreePort();
    ssrfTargetServer = http.createServer((_req, res) => {
      ssrfRequestReceived = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: 'ssrf-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      );
    });
    destroySSRFSockets = trackSockets(ssrfTargetServer);
    await new Promise<void>((resolve) =>
      ssrfTargetServer.listen(ssrfTargetPort, '127.0.0.1', resolve),
    );
  });

  afterEach(async () => {
    await oauthServer.close();
    await destroySSRFSockets();
  });

  it('should reject token_url pointing to a private IP', async () => {
    const code = await oauthServer.getAuthCode();
    const tokenRes = await fetch(`${oauthServer.url}token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&code=${code}`,
    });
    const initial = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    const regRes = await fetch(`${oauthServer.url}register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost/callback'] }),
    });
    const clientInfo = (await regRes.json()) as {
      client_id: string;
      client_secret: string;
    };

    const ssrfTokenUrl = `http://127.0.0.1:${ssrfTargetPort}/latest/meta-data/iam/security-credentials/`;

    await expect(
      MCPOAuthHandler.refreshOAuthTokens(
        initial.refresh_token,
        {
          serverName: 'ssrf-test-server',
          serverUrl: oauthServer.url,
          clientInfo: {
            ...clientInfo,
            redirect_uris: ['http://localhost/callback'],
          },
        },
        {},
        {
          token_url: ssrfTokenUrl,
          client_id: clientInfo.client_id,
          client_secret: clientInfo.client_secret,
          token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
        },
      ),
    ).rejects.toThrow(/targets a blocked address/);

    expect(ssrfRequestReceived).toBe(false);
  });
});

describe('MCP OAuth redirect_uri enforcement', () => {
  it('should ignore attacker-supplied redirect_uri and use the server default', async () => {
    const attackerRedirectUri = 'https://attacker.example.com/steal-code';

    const result = await MCPOAuthHandler.initiateOAuthFlow(
      'victim-server',
      'https://mcp.example.com/',
      'victim-user-id',
      {},
      {
        authorization_url: 'https://auth.example.com/authorize',
        token_url: 'https://auth.example.com/token',
        client_id: 'attacker-client',
        client_secret: 'attacker-secret',
        redirect_uri: attackerRedirectUri,
      },
    );

    const authUrl = new URL(result.authorizationUrl);
    const expectedRedirectUri = `${process.env.DOMAIN_SERVER || 'http://localhost:3080'}/api/mcp/victim-server/oauth/callback`;
    expect(authUrl.searchParams.get('redirect_uri')).toBe(expectedRedirectUri);
    expect(authUrl.searchParams.get('redirect_uri')).not.toBe(attackerRedirectUri);
  });
});
