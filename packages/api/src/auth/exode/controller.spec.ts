import { Types } from 'mongoose';
import type { IUser, IPluginAuth } from '@librechat/data-schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ExodeExchangeDeps } from './controller';
import { createExodeExchangeController } from './controller';

jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn() } }), { virtual: true });
jest.mock('librechat-data-provider', () => ({ SystemRoles: { USER: 'USER' } }), {
  virtual: true,
});
jest.mock('~/auth/openid', () => ({
  normalizeOpenIdIssuer: (issuer?: string) => issuer?.trim().replace(/\/+$/, '') || undefined,
}));

const ORIGINAL_ENV = process.env;
const handshakeId = 'ec150ba8-01a4-4db3-b61e-a1ca22d021ba';

function createUser(): IUser {
  const id = new Types.ObjectId();
  return {
    _id: id,
    id: id.toString(),
    email: 'principal-subject-with-enough-length@users.exode.invalid',
    emailVerified: true,
    name: 'Aslan Orlov',
    username: '',
    avatar: '',
    provider: 'exode',
    role: 'USER',
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T10:00:00.000Z'),
  } as IUser;
}

function createDeps(user: IUser) {
  const disconnectUserConnection = jest.fn(async () => undefined);
  const deps: ExodeExchangeDeps = {
    findUser: jest.fn(async () => user),
    createUser: jest.fn(async () => user),
    updateUser: jest.fn(async () => user),
    generateToken: jest.fn(async () => 'librechat-jwt'),
    updateUserPluginAuth: jest.fn(async () => ({ _id: new Types.ObjectId() }) as IPluginAuth),
    invalidateCachedTools: jest.fn(async () => undefined),
    getMCPManager: () => ({ disconnectUserConnection }),
    getTenantId: () => 'tenant-a',
    now: () => Date.parse('2026-07-20T14:00:00.000Z'),
    fetcher: jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            payload: {
              identity: {
                subject: 'principal-subject-with-enough-length',
                userId: 9021,
                userUuid: 'f49635f4-e814-4d66-a535-73229b949253',
                name: 'Aslan Orlov',
                schoolId: 17,
                sellerId: 42,
              },
              token: 'access-token-with-enough-length',
              expiresAt: '2026-07-20T14:30:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  };
  return { deps, disconnectUserConnection };
}

async function invokeController(handler: RequestHandler, body: object) {
  const req: Pick<Request, 'body'> = { body };
  const json = jest.fn();
  const response = {
    status: jest.fn(),
    json,
  };
  response.status.mockReturnValue(response);
  const res: Pick<Response, 'status' | 'json'> = response;
  const next: NextFunction = jest.fn();

  await handler(req as Request, res as Response, next);

  return { status: response.status, json };
}

describe('createExodeExchangeController', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      EXODE_MAIN_URL: 'https://api.exode.biz/',
      EXODE_MAIN_SERVICE_ID: 'LibreChatBridge',
      EXODE_MAIN_SERVICE_SECRET: 'service-secret',
      EXODE_MAIN_ISSUER: 'exode-backend-main',
      EXODE_EMBED_ORIGINS: 'https://exode.biz',
      EXODE_EMBED_JWT_TTL_MS: '300000',
      EXODE_MCP_SERVER_NAME: 'exode',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('stores the access token, resets MCP state, and returns an in-memory session', async () => {
    const user = createUser();
    const { deps, disconnectUserConnection } = createDeps(user);
    const response = await invokeController(createExodeExchangeController(deps), {
      token: 'bootstrap-token-with-enough-length',
      handshakeId,
      parentOrigin: 'https://exode.biz',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      token: 'librechat-jwt',
      tokenExpiresAt: '2026-07-20T14:05:00.000Z',
      mcpExpiresAt: '2026-07-20T14:30:00.000Z',
      user: expect.objectContaining({ id: String(user._id), provider: 'exode' }),
    });
    expect(deps.updateUserPluginAuth).toHaveBeenCalledWith(
      String(user._id),
      'EXODE_AI_TOKEN',
      'mcp_exode',
      'access-token-with-enough-length',
    );
    expect(disconnectUserConnection).toHaveBeenCalledWith(String(user._id), 'exode');
    expect(deps.invalidateCachedTools).toHaveBeenCalledWith({
      userId: String(user._id),
      serverName: 'exode',
    });
  });

  it('rejects a parent origin outside the allowlist before calling main', async () => {
    const { deps } = createDeps(createUser());
    const response = await invokeController(createExodeExchangeController(deps), {
      token: 'bootstrap-token-with-enough-length',
      handshakeId,
      parentOrigin: 'https://attacker.example.com',
    });

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_HANDSHAKE' }),
    );
    expect(deps.fetcher).not.toHaveBeenCalled();
  });

  it('does not issue a JWT when encrypted PluginAuth persistence fails', async () => {
    const { deps } = createDeps(createUser());
    deps.updateUserPluginAuth = jest.fn(async () => new Error('encryption failed'));
    const response = await invokeController(createExodeExchangeController(deps), {
      token: 'bootstrap-token-with-enough-length',
      handshakeId,
      parentOrigin: 'https://exode.biz',
    });

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    expect(deps.generateToken).not.toHaveBeenCalled();
  });
});
