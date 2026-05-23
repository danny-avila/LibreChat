import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { createRemoteAgentM2MAuth } from './remoteAgentM2MAuth';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

const BASE_ISSUER = 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test';
const BASE_JWKS_URI = `${BASE_ISSUER}/.well-known/jwks.json`;
const FAKE_TOKEN = 'header.payload.signature';

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

function makeReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers };
}

function makeUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: 'user-123',
    id: 'user-123',
    email: 'service-account@example.com',
    role: 'user',
    ...overrides,
  } as unknown as IUser;
}

function makeConfig(overrides: Record<string, unknown> = {}): AppConfig {
  return {
    endpoints: {
      agents: {
        remoteApi: {
          auth: {
            m2m: {
              enabled: true,
              issuer: BASE_ISSUER,
              audience: 'librechat-agents-api',
              jwksUri: BASE_JWKS_URI,
              clients: [{ clientId: 'dwh-dwaine-updater', userId: 'user-123' }],
              ...overrides,
            },
          },
        },
      },
    },
  } as unknown as AppConfig;
}

function makeDeps(appConfig: AppConfig = makeConfig(), payload?: JwtPayload) {
  return {
    findUser: jest.fn().mockResolvedValue(makeUser()) as jest.MockedFunction<
      UserMethods['findUser']
    >,
    getAppConfig: jest.fn().mockResolvedValue(appConfig),
    verifyBearer: jest.fn().mockResolvedValue(
      payload ?? {
        token_use: 'access',
        client_id: 'dwh-dwaine-updater',
        scope: 'librechat.agents:read librechat.agents:update',
      },
    ),
  };
}

describe('createRemoteAgentM2MAuth', () => {
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('authenticates a mapped M2M client and attaches auth info', async () => {
    const deps = makeDeps();
    const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

    await createRemoteAgentM2MAuth(deps)({ action: 'update' })(req as Request, makeRes().res, next);

    expect(deps.getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(deps.verifyBearer).toHaveBeenCalledWith(FAKE_TOKEN, {
      issuer: BASE_ISSUER,
      audience: 'librechat-agents-api',
      jwksUri: BASE_JWKS_URI,
    });
    expect(deps.findUser).toHaveBeenCalledWith({ _id: 'user-123' });
    expect(req.user).toMatchObject({ id: 'user-123', role: 'user' });
    expect((req as Request & { authInfo?: Record<string, unknown> }).authInfo).toMatchObject({
      type: 'm2m',
      issuer: BASE_ISSUER,
      clientId: 'dwh-dwaine-updater',
      action: 'update',
      scopes: ['librechat.agents:read', 'librechat.agents:update'],
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects requests when M2M auth is disabled', async () => {
    const deps = makeDeps(makeConfig({ enabled: false }));
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'read' })(
      makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'M2M authentication required' });
    expect(deps.verifyBearer).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', async () => {
    const deps = makeDeps();
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'read' })(makeReq() as Request, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Bearer token required' });
    expect(deps.verifyBearer).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects verified tokens with the wrong token_use', async () => {
    const deps = makeDeps(makeConfig(), {
      token_use: 'id',
      client_id: 'dwh-dwaine-updater',
      scope: 'librechat.agents:read',
    });
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'read' })(
      makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(deps.findUser).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects verified tokens missing the action scope', async () => {
    const deps = makeDeps(makeConfig(), {
      token_use: 'access',
      client_id: 'dwh-dwaine-updater',
      scope: 'librechat.agents:read',
    });
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'delete' })(
      makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(deps.findUser).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('supports configured client ID claims and scopes', async () => {
    const deps = makeDeps(
      makeConfig({
        clientIdClaim: 'azp',
        scopes: { delete: 'agents.delete' },
      }),
      {
        token_use: 'access',
        azp: 'dwh-dwaine-updater',
        scp: ['agents.delete'],
      },
    );
    const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

    await createRemoteAgentM2MAuth(deps)({ action: 'delete' })(req as Request, makeRes().res, next);

    expect(req.user).toMatchObject({ id: 'user-123' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects verified tokens from unmapped clients', async () => {
    const deps = makeDeps(makeConfig(), {
      token_use: 'access',
      client_id: 'unknown-client',
      scope: 'librechat.agents:read',
    });
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'read' })(
      makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(deps.findUser).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects mapped users whose tenant does not match the client mapping', async () => {
    const deps = makeDeps(
      makeConfig({
        clients: [{ clientId: 'dwh-dwaine-updater', userId: 'user-123', tenantId: 'tenant-a' }],
      }),
    );
    deps.findUser.mockResolvedValue(makeUser({ tenantId: 'tenant-b' }));
    const { res, status, json } = makeRes();

    await createRemoteAgentM2MAuth(deps)({ action: 'read' })(
      makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});
