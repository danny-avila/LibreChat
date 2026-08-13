const jwt = require('jsonwebtoken');

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    getTenantId: jest.fn(),
  };
});

const { getTenantId, toClerkTenantScope } = require('@librechat/data-schemas');
const setTwoFactorTempUser = require('./setTwoFactorTempUser');

const JWT_SECRET = 'clerk-two-factor-middleware-secret';

function invoke(payload, reqOverrides = {}) {
  const req = {
    body: { tempToken: jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' }) },
    ...reqOverrides,
  };
  const next = jest.fn();

  setTwoFactorTempUser(req, {}, next);

  expect(next).toHaveBeenCalledTimes(1);
  return req;
}

describe('setTwoFactorTempUser Clerk tenant binding', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getTenantId.mockReturnValue(undefined);
  });

  it('keeps the existing local temporary-token behavior', () => {
    const req = invoke({ userId: 'local-user', twoFAPending: true });

    expect(req.user).toEqual({ id: 'local-user' });
  });

  it('exposes a Clerk user to the ban middleware only for the signed tenant scope', () => {
    getTenantId.mockReturnValue('tenant-a');

    const req = invoke({
      userId: 'clerk-user',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
    });

    expect(req.user).toEqual({ id: 'clerk-user' });
  });

  it('keeps a Clerk user unset when the request tenant does not match the capability', () => {
    getTenantId.mockReturnValue('tenant-b');

    const req = invoke({
      userId: 'clerk-user',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: 'tenant-a',
    });

    expect(req.user).toBeUndefined();
  });

  it('requires an explicit tenantless scope for a tenantless Clerk request', () => {
    const matching = invoke({
      userId: 'tenantless-user',
      twoFAPending: true,
      authProvider: 'clerk',
      tenantScope: toClerkTenantScope(),
    });
    const missingScope = invoke({
      userId: 'missing-scope-user',
      twoFAPending: true,
      authProvider: 'clerk',
    });

    expect(matching.user).toEqual({ id: 'tenantless-user' });
    expect(missingScope.user).toBeUndefined();
  });
});
