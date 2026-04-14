const noIndex = require('./noIndex');

describe('noIndex middleware', () => {
  let originalEnv;
  let req;
  let res;
  let next;

  beforeEach(() => {
    originalEnv = { ...process.env };
    req = {
      method: 'GET',
      path: '/',
    };
    res = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    if (originalEnv.ENABLE_PUBLIC_AUTH_INDEXING == null) {
      delete process.env.ENABLE_PUBLIC_AUTH_INDEXING;
    } else {
      process.env.ENABLE_PUBLIC_AUTH_INDEXING = originalEnv.ENABLE_PUBLIC_AUTH_INDEXING;
    }

    if (originalEnv.NO_INDEX == null) {
      delete process.env.NO_INDEX;
    } else {
      process.env.NO_INDEX = originalEnv.NO_INDEX;
    }
  });

  it('should keep public auth routes indexable when feature is enabled', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    delete process.env.NO_INDEX;
    req.path = '/login';

    noIndex(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should keep reset password routes non-indexable when feature is enabled', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    delete process.env.NO_INDEX;
    req.path = '/reset-password';

    noIndex(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow');
    expect(next).toHaveBeenCalled();
  });

  it('should force noindex for all routes when NO_INDEX=true', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    process.env.NO_INDEX = 'true';
    req.path = '/login';

    noIndex(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow');
    expect(next).toHaveBeenCalled();
  });
});
