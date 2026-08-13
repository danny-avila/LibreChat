const jwt = require('jsonwebtoken');
const { generateClerkTwoFactorTempToken } = require('./twoFactorService');

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-clerk-2fa';
});

afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function buildCapability(overrides = {}) {
  const now = Date.now();
  return {
    userId: 'user-123',
    authProvider: 'clerk',
    tenantScope: 'tenant-a',
    clerkSessionId: 'sess_1',
    clerkTokenId: 'tok_1',
    clerkUserId: 'clerk_user_1',
    tokenExpiresAt: new Date(now + 4 * 60 * 1000),
    absoluteExpiresAt: new Date(now + 15 * 60 * 1000),
    capabilityExpiresAt: new Date(now + 5 * 60 * 1000),
    ...overrides,
  };
}

describe('generateClerkTwoFactorTempToken', () => {
  it('signs a token carrying only the trusted correlation claims', () => {
    const capability = buildCapability();

    const token = generateClerkTwoFactorTempToken(capability);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded.userId).toBe('user-123');
    expect(decoded.twoFAPending).toBe(true);
    expect(decoded.authProvider).toBe('clerk');
    expect(decoded.tenantScope).toBe('tenant-a');
    expect(decoded.clerkSessionId).toBe('sess_1');
    expect(decoded.clerkTokenId).toBe('tok_1');
    expect(decoded.clerkUserId).toBe('clerk_user_1');
    expect(decoded.tokenExpiresAt).toBe(capability.tokenExpiresAt.toISOString());
    expect(decoded.absoluteExpiresAt).toBe(capability.absoluteExpiresAt.toISOString());
  });

  it('never includes the original Clerk session token in the payload', () => {
    const capability = buildCapability({ clerkToken: 'should-never-appear' });

    const token = generateClerkTwoFactorTempToken(capability);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded).not.toHaveProperty('clerkToken');
    expect(JSON.stringify(decoded)).not.toContain('should-never-appear');
  });

  it('expires at the capability deadline, not a fixed 5-minute window', () => {
    const capability = buildCapability({
      capabilityExpiresAt: new Date(Date.now() + 90 * 1000),
    });

    const token = generateClerkTwoFactorTempToken(capability);
    const decoded = jwt.decode(token);

    const expiresInSeconds = decoded.exp - decoded.iat;
    expect(expiresInSeconds).toBeGreaterThan(0);
    expect(expiresInSeconds).toBeLessThanOrEqual(90);
  });

  it('signs a zero-lifetime token rather than throwing for an already-past capability deadline', () => {
    const capability = buildCapability({
      capabilityExpiresAt: new Date(Date.now() - 1000),
    });

    const token = generateClerkTwoFactorTempToken(capability);

    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow(/jwt expired/);
  });

  it('rejects the token once its capability deadline has passed', async () => {
    const capability = buildCapability({
      capabilityExpiresAt: new Date(Date.now() + 1500),
    });

    const token = generateClerkTwoFactorTempToken(capability);
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 1700));

    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow(/jwt expired/);
  });
});
