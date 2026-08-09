const mockCheckEmailConfig = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('@librechat/api', () => ({
  checkEmailConfig: (...args) => mockCheckEmailConfig(...args),
}));

jest.mock('~/models', () => ({
  updateUser: (...args) => mockUpdateUser(...args),
}));

const {
  grandfatherLegacyEmailVerification,
  verificationEnabledTimestamp,
} = require('./verification');

/** Either side of the cutoff, expressed the way Mongo hands the field back. */
const BEFORE_CUTOFF = new Date((verificationEnabledTimestamp - 86_400) * 1000);
const AFTER_CUTOFF = new Date((verificationEnabledTimestamp + 86_400) * 1000);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue(undefined);
});

describe('grandfatherLegacyEmailVerification', () => {
  it('verifies a pre-cutoff account when no email is configured', async () => {
    mockCheckEmailConfig.mockReturnValue(false);
    const user = { _id: 'u1', emailVerified: false, createdAt: BEFORE_CUTOFF };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { emailVerified: true });
    expect(user.emailVerified).toBe(true);
  });

  it('leaves a post-cutoff account unverified', async () => {
    mockCheckEmailConfig.mockReturnValue(false);
    const user = { _id: 'u1', emailVerified: false, createdAt: AFTER_CUTOFF };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(user.emailVerified).toBe(false);
  });

  it('leaves a pre-cutoff account alone when email is configured', async () => {
    mockCheckEmailConfig.mockReturnValue(true);
    const user = { _id: 'u1', emailVerified: false, createdAt: BEFORE_CUTOFF };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('short-circuits an already verified account without writing', async () => {
    const user = { _id: 'u1', emailVerified: true, createdAt: BEFORE_CUTOFF };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(true);
    expect(mockCheckEmailConfig).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not verify when createdAt is unreadable', async () => {
    mockCheckEmailConfig.mockReturnValue(false);
    const user = { _id: 'u1', emailVerified: false, createdAt: 'not-a-date' };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(false);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('falls back to id when the document has no _id', async () => {
    mockCheckEmailConfig.mockReturnValue(false);
    const user = { id: 'u2', emailVerified: false, createdAt: BEFORE_CUTOFF };

    await expect(grandfatherLegacyEmailVerification(user)).resolves.toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith('u2', { emailVerified: true });
  });
});
