const { SystemCapabilities } = require('@librechat/data-schemas');

jest.mock('@librechat/api', () => ({ isEnabled: jest.fn() }));
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn() },
}));
jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(),
}));

const { isEnabled } = require('@librechat/api');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const canDeleteAccount = require('./canDeleteAccount');

const makeReq = (user) => ({ user });
const makeRes = () => {
  const json = jest.fn();
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  return { status, send, json };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('canDeleteAccount', () => {
  describe('ALLOW_ACCOUNT_DELETION=true (default)', () => {
    it('calls next without hitting the DB', async () => {
      isEnabled.mockReturnValue(true);
      const next = jest.fn();
      const req = makeReq({ id: 'user-1', role: 'USER' });
      const res = makeRes();

      await canDeleteAccount(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(hasCapability).not.toHaveBeenCalled();
    });
  });

  describe('ALLOW_ACCOUNT_DELETION=false', () => {
    beforeEach(() => {
      isEnabled.mockReturnValue(false);
    });

    it('allows an ADMIN user with MANAGE_USERS capability', async () => {
      hasCapability.mockResolvedValue(true);
      const next = jest.fn();
      const req = makeReq({ id: 'admin-1', role: 'ADMIN' });
      const res = makeRes();

      await canDeleteAccount(req, res, next);

      expect(hasCapability).toHaveBeenCalledWith(req.user, SystemCapabilities.MANAGE_USERS);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks a regular user without MANAGE_USERS capability', async () => {
      hasCapability.mockResolvedValue(false);
      const next = jest.fn();
      const req = makeReq({ id: 'user-1', role: 'USER' });
      const res = makeRes();

      await canDeleteAccount(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('blocks when user is undefined — does not throw', async () => {
      const next = jest.fn();
      const req = makeReq(undefined);
      const res = makeRes();

      await canDeleteAccount(req, res, next);

      expect(hasCapability).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
