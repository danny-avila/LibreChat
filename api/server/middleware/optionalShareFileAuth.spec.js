const mockVerify = jest.fn();
const mockGetUserById = jest.fn();

jest.mock('jsonwebtoken', () => ({ verify: (...args) => mockVerify(...args) }));
jest.mock('@librechat/api', () => ({ isEnabled: (v) => v === 'true' || v === true }));
jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
  runAsSystem: (fn) => fn(),
}));
jest.mock('librechat-data-provider', () => ({ SystemRoles: { USER: 'USER' } }));
jest.mock('~/models', () => ({ getUserById: (...args) => mockGetUserById(...args) }));

const optionalShareFileAuth = require('./optionalShareFileAuth');

const run = async (req) => {
  const next = jest.fn();
  await optionalShareFileAuth(req, {}, next);
  return next;
};

describe('optionalShareFileAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET = 'test-secret';
  });

  it('short-circuits when a bearer user is already set (no cookie work)', async () => {
    const req = { user: { id: 'u1' }, headers: { cookie: 'refreshToken=x' } };
    const next = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('resolves the viewer from a valid refreshToken cookie', async () => {
    mockVerify.mockReturnValue({ id: 'viewer-1' });
    mockGetUserById.mockResolvedValue({ _id: 'viewer-1', role: 'USER' });
    const req = { headers: { cookie: 'refreshToken=good.jwt' } };
    const next = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith('good.jwt', 'test-secret');
    expect(req.user).toMatchObject({ id: 'viewer-1', role: 'USER' });
  });

  it('defaults the role to USER when the record has none', async () => {
    mockVerify.mockReturnValue({ id: 'viewer-2' });
    mockGetUserById.mockResolvedValue({ _id: 'viewer-2' });
    const req = { headers: { cookie: 'refreshToken=good.jwt' } };
    await run(req);
    expect(req.user.role).toBe('USER');
  });

  it('leaves req.user unset when there is no cookie', async () => {
    const req = { headers: {} };
    const next = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('leaves req.user unset when the token is invalid', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('bad token');
    });
    const req = { headers: { cookie: 'refreshToken=bad' } };
    const next = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('uses the signed openid_user_id cookie for OpenID-reuse sessions', async () => {
    process.env.OPENID_REUSE_TOKENS = 'true';
    mockVerify.mockReturnValue({ id: 'oidc-1' });
    mockGetUserById.mockResolvedValue({ _id: 'oidc-1', role: 'USER' });
    const req = {
      headers: { cookie: 'token_provider=openid; openid_user_id=signed.jwt' },
    };
    await run(req);
    expect(mockVerify).toHaveBeenCalledWith('signed.jwt', 'test-secret');
    expect(req.user).toMatchObject({ id: 'oidc-1' });
    delete process.env.OPENID_REUSE_TOKENS;
  });
});
