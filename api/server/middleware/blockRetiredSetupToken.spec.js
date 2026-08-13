const mockGetUserById = jest.fn();

jest.mock('~/models', () => ({
  getUserById: (...args) => mockGetUserById(...args),
}));

const blockRetiredSetupToken = require('./blockRetiredSetupToken');

const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const run = async (req) => {
  const res = createResponse();
  const next = jest.fn();
  await blockRetiredSetupToken(req, res, next);
  return { res, next };
};

describe('blockRetiredSetupToken', () => {
  const resetAt = new Date('2026-02-02T00:00:10.500Z');
  const resetSecond = Math.floor(resetAt.getTime() / 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({ _id: 'user-1' });
  });

  it('continues when nothing has retired the setup token', async () => {
    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond,
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuses a setup token minted before the password reset', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'user-1', passwordResetAt: resetAt });

    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond - 1,
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('admits a setup token minted after the password reset', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'user-1', passwordResetAt: resetAt });

    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond + 1,
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuses a setup token minted before enrollment promoted the account', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'user-1', twoFactorEnrolledAt: resetAt });

    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond - 1,
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refuses an undatable setup token once a cutoff is set', async () => {
    mockGetUserById.mockResolvedValue({ _id: 'user-1', passwordResetAt: resetAt });

    const { res, next } = await run({ user: { id: 'user-1' } });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('reads only the fields the cutoff needs', async () => {
    await run({ user: { id: 'user-1' }, twoFactorSetupIssuedAt: resetSecond });

    expect(mockGetUserById).toHaveBeenCalledWith('user-1', 'twoFactorEnrolledAt passwordResetAt');
  });

  it('refuses when the named account no longer exists', async () => {
    mockGetUserById.mockResolvedValue(null);

    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond,
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refuses when no setup user was stamped on the request', async () => {
    const { res, next } = await run({});

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('fails closed when the lookup throws', async () => {
    mockGetUserById.mockRejectedValue(new Error('mongo is down'));

    const { res, next } = await run({
      user: { id: 'user-1' },
      twoFactorSetupIssuedAt: resetSecond,
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
