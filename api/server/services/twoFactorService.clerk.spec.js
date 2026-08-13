// twoFactorService.js requires @librechat/data-schemas for
// hashBackupCode/decryptV2/decryptV3 (unused by signTwoFactorTempToken).
// Mocking it here — rather than letting this file load the real package —
// keeps this suite's module registry isolated from sibling spec files (e.g.
// AuthService.spec.js) that mock @librechat/data-schemas with
// `{ virtual: true }`; loading the real module in one file and the virtual
// mock in another inside the same --runInBand worker otherwise collides.
jest.mock('@librechat/data-schemas', () => ({
  hashBackupCode: jest.fn(),
  decryptV3: jest.fn(),
  decryptV2: jest.fn(),
}));
jest.mock('~/models', () => ({ updateUser: jest.fn() }));

const jwt = require('jsonwebtoken');
const { signTwoFactorTempToken } = require('./twoFactorService');

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-2fa-signer';
});

afterAll(() => {
  process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

describe('signTwoFactorTempToken', () => {
  it('signs exactly the given payload, adding no fields of its own', () => {
    const payload = {
      userId: 'user-123',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
      clerkSessionId: 'sess_1',
      clerkTokenId: 'tok_1',
      clerkUserId: 'clerk_user_1',
      tokenExpiresAt: '2026-08-13T00:04:00.000Z',
      absoluteExpiresAt: '2026-08-13T00:15:00.000Z',
    };

    const token = signTwoFactorTempToken(payload, 300);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    for (const [key, value] of Object.entries(payload)) {
      expect(decoded[key]).toBe(value);
    }
  });

  it('never injects a Clerk token field it was not given', () => {
    const payload = { userId: 'user-123', twoFAPending: true };

    const token = signTwoFactorTempToken(payload, 300);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded).not.toHaveProperty('clerkToken');
  });

  it('expires after exactly the given number of seconds', () => {
    const token = signTwoFactorTempToken({ userId: 'user-123' }, 90);
    const decoded = jwt.decode(token);

    expect(decoded.exp - decoded.iat).toBe(90);
  });

  it('signs an immediately-expired token when given zero seconds, rather than throwing', () => {
    const token = signTwoFactorTempToken({ userId: 'user-123' }, 0);

    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow(/jwt expired/);
  });

  it('is rejected once its given lifetime elapses', async () => {
    const token = signTwoFactorTempToken({ userId: 'user-123' }, 1);
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow(/jwt expired/);
  });
});
