import * as http from 'http';
import * as net from 'net';
import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FlowState } from '~/flow/types';
import type { Socket } from 'net';

export class MockKeyv<T = unknown> {
  private store: Map<string, FlowState<T>>;

  constructor() {
    this.store = new Map();
  }

  async get(key: string): Promise<FlowState<T> | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: FlowState<T>, _ttl?: number): Promise<true> {
    this.store.set(key, value);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
}

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => (err ? reject(err) : resolve(addr.port)));
    });
  });
}

export function trackSockets(httpServer: http.Server): () => Promise<void> {
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

export interface OAuthTestServerOptions {
  tokenTTLMs?: number;
  issueRefreshTokens?: boolean;
  refreshTokenTTLMs?: number;
  rotateRefreshTokens?: boolean;
}

export interface OAuthTestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
  issuedTokens: Set<string>;
  tokenTTL: number;
  tokenIssueTimes: Map<string, number>;
  issuedRefreshTokens: Map<string, string>;
  registeredClients: Map<string, { client_id: string; client_secret: string }>;
  getAuthCode: () => Promise<string>;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks).toString();
}

function parseTokenRequest(body: string, contentType: string | undefined): URLSearchParams | null {
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(body);
  }
  if (contentType?.includes('application/json')) {
    const json = JSON.parse(body) as Record<string, string>;
    return new URLSearchParams(json);
  }
  return new URLSearchParams(body);
}

export async function createOAuthMCPServer(
  options: OAuthTestServerOptions = {},
): Promise<OAuthTestServer> {
  const {
    tokenTTLMs = 60000,
    issueRefreshTokens = false,
    refreshTokenTTLMs = 365 * 24 * 60 * 60 * 1000,
    rotateRefreshTokens = false,
  } = options;

  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const issuedTokens = new Set<string>();
  const tokenIssueTimes = new Map<string, number>();
  const issuedRefreshTokens = new Map<string, string>();
  const refreshTokenIssueTimes = new Map<string, number>();
  const authCodes = new Map<string, { codeChallenge?: string; codeChallengeMethod?: string }>();
  const registeredClients = new Map<string, { client_id: string; client_secret: string }>();

  let port = 0;

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: `http://127.0.0.1:${port}`,
          authorization_endpoint: `http://127.0.0.1:${port}/authorize`,
          token_endpoint: `http://127.0.0.1:${port}/token`,
          registration_endpoint: `http://127.0.0.1:${port}/register`,
          response_types_supported: ['code'],
          grant_types_supported: issueRefreshTokens
            ? ['authorization_code', 'refresh_token']
            : ['authorization_code'],
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        }),
      );
      return;
    }

    if (url.pathname === '/register' && req.method === 'POST') {
      const body = await readRequestBody(req);
      const data = JSON.parse(body) as { redirect_uris?: string[] };
      const clientId = `client-${randomUUID().slice(0, 8)}`;
      const clientSecret = `secret-${randomUUID()}`;
      registeredClients.set(clientId, { client_id: clientId, client_secret: clientSecret });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uris: data.redirect_uris ?? [],
        }),
      );
      return;
    }

    if (url.pathname === '/authorize') {
      const code = randomUUID();
      const codeChallenge = url.searchParams.get('code_challenge') ?? undefined;
      const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? undefined;
      authCodes.set(code, { codeChallenge, codeChallengeMethod });
      const redirectUri = url.searchParams.get('redirect_uri') ?? '';
      const state = url.searchParams.get('state') ?? '';
      res.writeHead(302, {
        Location: `${redirectUri}?code=${code}&state=${state}`,
      });
      res.end();
      return;
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const body = await readRequestBody(req);
      const params = parseTokenRequest(body, req.headers['content-type']);
      if (!params) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_request' }));
        return;
      }

      const grantType = params.get('grant_type');

      if (grantType === 'authorization_code') {
        const code = params.get('code');
        const codeData = code ? authCodes.get(code) : undefined;
        if (!code || !codeData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }

        if (codeData.codeChallenge) {
          const codeVerifier = params.get('code_verifier');
          if (!codeVerifier) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          if (codeData.codeChallengeMethod === 'S256') {
            const expected = createHash('sha256').update(codeVerifier).digest('base64url');
            if (expected !== codeData.codeChallenge) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'invalid_grant' }));
              return;
            }
          }
        }

        authCodes.delete(code);

        const accessToken = randomUUID();
        issuedTokens.add(accessToken);
        tokenIssueTimes.set(accessToken, Date.now());

        const tokenResponse: Record<string, string | number> = {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: Math.ceil(tokenTTLMs / 1000),
        };

        if (issueRefreshTokens) {
          const refreshToken = randomUUID();
          issuedRefreshTokens.set(refreshToken, accessToken);
          refreshTokenIssueTimes.set(refreshToken, Date.now());
          tokenResponse.refresh_token = refreshToken;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tokenResponse));
        return;
      }

      if (grantType === 'refresh_token' && issueRefreshTokens) {
        const refreshToken = params.get('refresh_token');
        if (!refreshToken || !issuedRefreshTokens.has(refreshToken)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }

        const issueTime = refreshTokenIssueTimes.get(refreshToken) ?? 0;
        if (Date.now() - issueTime > refreshTokenTTLMs) {
          issuedRefreshTokens.delete(refreshToken);
          refreshTokenIssueTimes.delete(refreshToken);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }

        const newAccessToken = randomUUID();
        issuedTokens.add(newAccessToken);
        tokenIssueTimes.set(newAccessToken, Date.now());

        const tokenResponse: Record<string, string | number> = {
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: Math.ceil(tokenTTLMs / 1000),
        };

        if (rotateRefreshTokens) {
          issuedRefreshTokens.delete(refreshToken);
          refreshTokenIssueTimes.delete(refreshToken);
          const newRefreshToken = randomUUID();
          issuedRefreshTokens.set(newRefreshToken, newAccessToken);
          refreshTokenIssueTimes.set(newRefreshToken, Date.now());
          tokenResponse.refresh_token = newRefreshToken;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tokenResponse));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
      return;
    }

    // All other paths require Bearer token auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    const token = authHeader.slice(7);
    if (!issuedTokens.has(token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    const issueTime = tokenIssueTimes.get(token) ?? 0;
    if (Date.now() - issueTime > tokenTTLMs) {
      issuedTokens.delete(token);
      tokenIssueTimes.delete(token);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    // Authenticated MCP request — route to transport
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      const mcp = new McpServer({ name: 'oauth-test-server', version: '0.0.1' });
      mcp.tool('echo', { message: z.string() }, async (args) => ({
        content: [{ type: 'text' as const, text: `echo: ${args.message}` }],
      }));
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);

    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport!.sessionId!);
    }
  });

  const destroySockets = trackSockets(httpServer);
  port = await getFreePort();
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    issuedTokens,
    tokenTTL: tokenTTLMs,
    tokenIssueTimes,
    issuedRefreshTokens,
    registeredClients,
    getAuthCode: async () => {
      const authRes = await fetch(
        `http://127.0.0.1:${port}/authorize?redirect_uri=http://localhost&state=test`,
        { redirect: 'manual' },
      );
      const location = authRes.headers.get('location') ?? '';
      return new URL(location).searchParams.get('code') ?? '';
    },
    close: async () => {
      const closing = [...sessions.values()].map((t) => t.close().catch(() => undefined));
      sessions.clear();
      await Promise.all(closing);
      await destroySockets();
    },
  };
}

export interface InMemoryToken {
  userId: string;
  type: string;
  identifier: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  metadata?: Map<string, unknown> | Record<string, unknown>;
}

export class InMemoryTokenStore {
  private tokens: Map<string, InMemoryToken> = new Map();

  private key(filter: { userId?: string; type?: string; identifier?: string }): string {
    return `${filter.userId}:${filter.type}:${filter.identifier}`;
  }

  findToken = async (filter: {
    userId?: string;
    type?: string;
    identifier?: string;
  }): Promise<InMemoryToken | null> => {
    for (const token of this.tokens.values()) {
      const matchUserId = !filter.userId || token.userId === filter.userId;
      const matchType = !filter.type || token.type === filter.type;
      const matchIdentifier = !filter.identifier || token.identifier === filter.identifier;
      if (matchUserId && matchType && matchIdentifier) {
        return token;
      }
    }
    return null;
  };

  createToken = async (data: {
    userId: string;
    type: string;
    identifier: string;
    token: string;
    expiresIn?: number;
    metadata?: Record<string, unknown>;
  }): Promise<InMemoryToken> => {
    const expiresIn = data.expiresIn ?? 365 * 24 * 60 * 60;
    const token: InMemoryToken = {
      userId: data.userId,
      type: data.type,
      identifier: data.identifier,
      token: data.token,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      createdAt: new Date(),
      metadata: data.metadata,
    };
    this.tokens.set(this.key(data), token);
    return token;
  };

  updateToken = async (
    filter: { userId?: string; type?: string; identifier?: string },
    data: {
      userId?: string;
      type?: string;
      identifier?: string;
      token?: string;
      expiresIn?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<InMemoryToken> => {
    const existing = await this.findToken(filter);
    if (!existing) {
      throw new Error(`Token not found for filter: ${JSON.stringify(filter)}`);
    }
    const existingKey = this.key(existing);
    const expiresIn =
      data.expiresIn ?? Math.floor((existing.expiresAt.getTime() - Date.now()) / 1000);
    const updated: InMemoryToken = {
      ...existing,
      token: data.token ?? existing.token,
      expiresAt: data.expiresIn ? new Date(Date.now() + expiresIn * 1000) : existing.expiresAt,
      metadata: data.metadata ?? existing.metadata,
    };
    this.tokens.set(existingKey, updated);
    return updated;
  };

  deleteToken = async (filter: {
    userId: string;
    type: string;
    identifier: string;
  }): Promise<void> => {
    this.tokens.delete(this.key(filter));
  };

  getAll(): InMemoryToken[] {
    return [...this.tokens.values()];
  }

  clear(): void {
    this.tokens.clear();
  }
}
