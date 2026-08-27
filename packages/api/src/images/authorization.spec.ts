import jwt from 'jsonwebtoken';
import { createImageAuthorizationMiddleware } from './authorization';
import type { ImageAuthorizationDeps } from './authorization';
import type { NextFunction, Request, Response } from 'express';

const VIEWER_ID = '65cfb246f7ecadb8b1e8036b';
const OWNER_ID = '65cfb246f7ecadb8b1e8036c';
const AGENT_DB_ID = '65cfb246f7ecadb8b1e8036d';
const AGENT_PATH = `/images/${OWNER_ID}/agent-agent_abc123-avatar-12345.png`;

function createResponse(): Response {
  const response = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return response as unknown as Response;
}

function createDeps(): ImageAuthorizationDeps {
  return {
    parseCookies: (header: string) =>
      Object.fromEntries(
        header.split(';').map((part: string) => {
          const [key, ...value] = part.trim().split('=');
          return [key, value.join('=')];
        }),
      ),
    isOpenIdReuseEnabled: jest.fn().mockReturnValue(false),
    getBasePath: jest.fn().mockReturnValue(''),
    findSession: jest.fn().mockResolvedValue({ _id: 'active-session' }),
    getUserById: jest.fn().mockResolvedValue({
      role: 'USER',
      tenantId: 'tenant-a',
      idOnTheSource: null,
    }),
    getAgent: jest.fn().mockResolvedValue(null),
    getAssistant: jest.fn().mockResolvedValue(null),
    getUserPrincipals: jest
      .fn()
      .mockResolvedValue([{ principalType: 'user', principalId: VIEWER_ID }]),
    hasCapabilityForPrincipals: jest.fn().mockResolvedValue(false),
    hasPermission: jest.fn().mockResolvedValue(false),
  } as unknown as ImageAuthorizationDeps;
}

function createRequest(path: string, cookie?: string): Request {
  return {
    originalUrl: path,
    headers: cookie ? { cookie } : {},
  } as unknown as Request;
}

function signUser(userId: string): string {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '1h' });
}

describe('createImageAuthorizationMiddleware', () => {
  let deps: ImageAuthorizationDeps;
  let response: Response;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = 'image-authorization-secret';
    deps = createDeps();
    response = createResponse();
    next = jest.fn();
  });

  it('authenticates an active session and allows the owner path', async () => {
    const token = signUser(VIEWER_ID);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(
      createRequest(`/images/${VIEWER_ID}/profile.png`, `refreshToken=${token}`),
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(deps.findSession).toHaveBeenCalledWith({ userId: VIEWER_ID, refreshToken: token });
  });

  it('rejects a signed refresh token whose session was revoked', async () => {
    (deps.findSession as jest.Mock).mockResolvedValue(null);
    const token = signUser(VIEWER_ID);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(
      createRequest(`/images/${VIEWER_ID}/profile.png`, `refreshToken=${token}`),
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('resolves principals once and applies the tenant to an agent capability check', async () => {
    (deps.getAgent as jest.Mock).mockResolvedValue({ _id: AGENT_DB_ID });
    (deps.hasPermission as jest.Mock).mockResolvedValue(true);
    const token = signUser(VIEWER_ID);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(createRequest(AGENT_PATH, `refreshToken=${token}`), response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(deps.getAgent).toHaveBeenCalledWith(
      { id: 'agent_abc123', 'avatar.filepath': AGENT_PATH },
      { _id: 1 },
    );
    expect(deps.getUserPrincipals).toHaveBeenCalledTimes(1);
    expect(deps.hasCapabilityForPrincipals).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
    expect(deps.hasPermission).toHaveBeenCalledTimes(1);
  });

  it('allows an anonymous request only when the agent has PUBLIC VIEW', async () => {
    (deps.getAgent as jest.Mock).mockResolvedValue({ _id: AGENT_DB_ID });
    (deps.hasPermission as jest.Mock).mockResolvedValue(true);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(createRequest(AGENT_PATH), response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(deps.getUserPrincipals).not.toHaveBeenCalled();
    expect(deps.hasPermission).toHaveBeenCalledWith(
      [{ principalType: 'public' }],
      'agent',
      AGENT_DB_ID,
      1,
    );
  });

  it('does not apply a viewer role or group grant across tenant boundaries', async () => {
    (deps.getAgent as jest.Mock).mockResolvedValue({ _id: AGENT_DB_ID });
    (deps.getUserById as jest.Mock)
      .mockResolvedValueOnce({ tenantId: 'tenant-a' })
      .mockResolvedValueOnce({ role: 'USER', tenantId: 'tenant-b', idOnTheSource: null });
    (deps.hasPermission as jest.Mock).mockResolvedValue(true);
    const token = signUser(VIEWER_ID);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(createRequest(AGENT_PATH, `refreshToken=${token}`), response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(deps.getUserPrincipals).not.toHaveBeenCalled();
    expect(deps.hasCapabilityForPrincipals).not.toHaveBeenCalled();
    expect(deps.hasPermission).toHaveBeenCalledWith(
      [{ principalType: 'public' }],
      'agent',
      AGENT_DB_ID,
      1,
    );
  });

  it('preserves shared assistant avatars by matching their stored filepath', async () => {
    (deps.getAssistant as jest.Mock).mockResolvedValue({
      _id: '65cfb246f7ecadb8b1e8036e',
      assistant_id: 'asst_shared',
    });
    const assistantPath = `/images/${OWNER_ID}/assistant-avatar.png`;
    const middleware = createImageAuthorizationMiddleware(
      { assistantEndpoints: [{ privateAssistants: false }] },
      deps,
    );

    await middleware(createRequest(assistantPath), response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(deps.getAssistant).toHaveBeenCalledWith(
      { 'avatar.filepath': assistantPath },
      { _id: 1, assistant_id: 1 },
    );
  });

  it('rejects encoded traversal before any resource lookup', async () => {
    const token = signUser(VIEWER_ID);
    const middleware = createImageAuthorizationMiddleware({}, deps);

    await middleware(
      createRequest(`/images/${VIEWER_ID}/..%2F..%2Fetc%2Fpasswd`, `refreshToken=${token}`),
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(deps.getAgent).not.toHaveBeenCalled();
    expect(deps.getAssistant).not.toHaveBeenCalled();
  });
});
