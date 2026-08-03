jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
  isEmailDomainAllowed: jest.fn(() => true),
  resolveAppConfigForUser: jest.fn(async () => ({})),
}));

jest.mock('./process', () => ({
  createSocialUser: jest.fn(async (fields) => ({ _id: 'new-user', ...fields })),
  handleExistingUser: jest.fn(async () => undefined),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(async () => ({})),
}));

jest.mock('~/models', () => ({
  findUser: jest.fn(),
}));

const { ErrorTypes } = require('librechat-data-provider');
const { createSocialUser, handleExistingUser } = require('./process');
const socialLogin = require('./socialLogin');
const { findUser } = require('~/models');

const getProfileDetails = () => ({
  email: 'user@example.com',
  id: 'gid-1',
  avatarUrl: 'https://example.com/a.png',
  username: 'user',
  name: 'User',
  emailVerified: true,
});

function invoke() {
  return new Promise((resolve) => {
    const verify = socialLogin('google', getProfileDetails);
    verify('at', 'rt', 'idt', {}, (err, user, info) => resolve({ err, user, info }));
  });
}

const existing = { _id: 'user-1', provider: 'google', email: 'user@example.com' };

describe('socialLogin deletion barrier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes a normal existing-user login when the boundary recheck is clean', async () => {
    findUser
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ _id: 'user-1', deletionRequestedAt: undefined });

    const { err, user } = await invoke();

    expect(err).toBeFalsy();
    expect(user).toBe(existing);
    expect(handleExistingUser).toHaveBeenCalled();
  });

  it('refuses when the barrier rose during config resolution or avatar refresh', async () => {
    findUser
      // Pre-barrier snapshot at the provider-id lookup.
      .mockResolvedValueOnce(existing)
      // The boundary recheck, sequenced after handleExistingUser, observes it.
      .mockResolvedValueOnce({ _id: 'user-1', deletionRequestedAt: new Date() });

    const { err } = await invoke();

    // The OAuth callback would otherwise run setBalanceConfig and oauthHandler,
    // recreating a Balance and Session behind the destructive cascade.
    expect(err?.code).toBe(ErrorTypes.AUTH_FAILED);
    expect(err?.message).toMatch(/deletion/i);
  });

  it('fails closed when the identity was removed mid-flow', async () => {
    findUser.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);

    const { err, user } = await invoke();

    expect(user).toBeUndefined();
    expect(err?.code).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('refuses registration when an account for the email appeared mid-flow', async () => {
    findUser
      // Neither lookup finds the user (the document was absent at that instant)...
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      // ...but the registration-boundary recheck sees a (barriered) account.
      .mockResolvedValueOnce({ _id: 'user-1', deletionRequestedAt: new Date() });

    const { err } = await invoke();

    // Registering here would shadow the existing account with a duplicate email.
    expect(createSocialUser).not.toHaveBeenCalled();
    expect(err?.code).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('refuses registration when the boundary recheck cannot be verified', async () => {
    findUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('primary unreachable'));

    const { err } = await invoke();

    expect(createSocialUser).not.toHaveBeenCalled();
    expect(err?.code).toBe(ErrorTypes.AUTH_FAILED);
  });

  it('registers a genuinely new user when every read confirms absence', async () => {
    findUser.mockResolvedValue(null);

    const { err, user } = await invoke();

    expect(err).toBeFalsy();
    expect(createSocialUser).toHaveBeenCalled();
    expect(user?._id).toBe('new-user');
  });
});
