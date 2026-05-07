jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const checkAdminIpAllowlist = require('./checkAdminIpAllowlist');
const { buildMiddleware, parseEntry, toBytes, matches } = checkAdminIpAllowlist._internal;

function makeReqRes(ip) {
  const req = { ip };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('checkAdminIpAllowlist', () => {
  it('passes through when env unset', () => {
    const mw = buildMiddleware(undefined);
    const { req, res, next } = makeReqRes('1.2.3.4');
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through when env empty string', () => {
    const mw = buildMiddleware('   ');
    const { req, res, next } = makeReqRes('1.2.3.4');
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes when IPv4 matches a CIDR', () => {
    const mw = buildMiddleware('10.0.0.0/8');
    const { req, res, next } = makeReqRes('10.1.2.3');
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes when IPv4 matches a single host', () => {
    const mw = buildMiddleware('192.168.1.5');
    const { req, res, next } = makeReqRes('192.168.1.5');
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes when IPv6 matches a CIDR', () => {
    const mw = buildMiddleware('2001:db8::/32');
    const { req, res, next } = makeReqRes('2001:db8:abcd::1');
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks when IPv4 does not match', () => {
    const mw = buildMiddleware('10.0.0.0/8');
    const { req, res, next } = makeReqRes('11.0.0.1');
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
  });

  it('blocks when IPv6 does not match', () => {
    const mw = buildMiddleware('2001:db8::/32');
    const { req, res, next } = makeReqRes('2001:dead::1');
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('fails closed when env is malformed', () => {
    const mw = buildMiddleware('not-an-ip');
    const { req, res, next } = makeReqRes('127.0.0.1');
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks when req.ip is missing', () => {
    const mw = buildMiddleware('10.0.0.0/8');
    const { req, res, next } = makeReqRes(undefined);
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  describe('parser internals', () => {
    it('parseEntry rejects malformed input', () => {
      expect(parseEntry('garbage')).toBeNull();
      expect(parseEntry('10.0.0.0/40')).toBeNull();
      expect(parseEntry('2001:db8::/200')).toBeNull();
    });

    it('toBytes handles ::ffff:v4 mapping', () => {
      const a = toBytes('1.2.3.4');
      const b = toBytes('::ffff:1.2.3.4');
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    });

    it('matches respects the prefix length', () => {
      const entry = parseEntry('10.0.0.0/8');
      expect(matches(entry, toBytes('10.255.255.255'))).toBe(true);
      expect(matches(entry, toBytes('11.0.0.0'))).toBe(false);
    });
  });
});
