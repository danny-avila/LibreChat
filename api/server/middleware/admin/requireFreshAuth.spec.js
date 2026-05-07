jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const crypto = require('crypto');
const requireFreshAuth = require('./requireFreshAuth');
const { issueFreshAuthToken } = require('./requireFreshAuth');

const USER_ID = '507f191e810c19729de860ea';

function makeReq({ token, userId = USER_ID } = {}) {
  return {
    headers: token ? { 'x-fresh-auth-token': token } : {},
    user: { id: userId, _id: userId },
  };
}
function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('requireFreshAuth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test';
  });

  it('rejects when header missing', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Fresh authentication required',
      code: 'FRESH_AUTH_REQUIRED',
    });
  });

  it('rejects malformed token (no dot)', () => {
    const req = makeReq({ token: 'not-a-token' });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects bad signature', () => {
    const { token } = issueFreshAuthToken(USER_ID);
    const [head] = token.split('.');
    const tampered = head + '.' + Buffer.from('bogus').toString('base64url');
    const req = makeReq({ token: tampered });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects expired token', () => {
    const { token } = issueFreshAuthToken(USER_ID, 'admin', -10);
    const req = makeReq({ token });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects token with wrong userId', () => {
    const { token } = issueFreshAuthToken('aaaaaaaaaaaaaaaaaaaaaaaa');
    const req = makeReq({ token });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects token with wrong scope', () => {
    const { token } = issueFreshAuthToken(USER_ID, 'something-else');
    const req = makeReq({ token });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts a valid token', () => {
    const { token } = issueFreshAuthToken(USER_ID);
    const req = makeReq({ token });
    const res = makeRes();
    const next = jest.fn();
    requireFreshAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('issueFreshAuthToken round-trips correctly', () => {
    const { token, expiresAt } = issueFreshAuthToken(USER_ID, 'admin', 60);
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const [headB64, sigB64] = token.split('.');
    const payload = Buffer.from(headB64, 'base64url').toString('utf8');
    const sig = Buffer.from(sigB64, 'base64url');

    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest();
    expect(sig.equals(expected)).toBe(true);

    const [uid, expStr, scope] = payload.split('.');
    expect(uid).toBe(USER_ID);
    expect(scope).toBe('admin');
    expect(parseInt(expStr, 10)).toBe(expiresAt);
  });
});
