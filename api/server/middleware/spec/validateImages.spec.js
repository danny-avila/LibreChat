const jwt = require('jsonwebtoken');
const validateImageRequest = require('~/server/middleware/validateImageRequest');

describe('validateImageRequest middleware', () => {
  let req, res, next;
  const validObjectId = '65cfb246f7ecadb8b1e8036b';

  beforeEach(() => {
    req = {
      app: { locals: { secureImageLinks: true } },
      headers: {},
      originalUrl: '',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    next = jest.fn();
    process.env.JWT_REFRESH_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should call next() if secureImageLinks is false', () => {
    req.app.locals.secureImageLinks = false;
    validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('should return 401 if refresh token is not provided', () => {
    validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  test('should return 403 if refresh token is invalid', () => {
    req.headers.cookie = 'refreshToken=invalid-token';
    validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should return 403 if refresh token is expired', () => {
    const expiredToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${expiredToken}`;
    validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should call next() for valid image path', () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = `/images/${validObjectId}/example.jpg`;
    validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('should return 403 for invalid image path', () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = '/images/65cfb246f7ecadb8b1e8036c/example.jpg'; // Different ObjectId
    validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should return 403 for invalid ObjectId format', () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = '/images/123/example.jpg'; // Invalid ObjectId
    validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  // File traversal tests
  test('should prevent file traversal attempts', () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;

    const traversalAttempts = [
      `/images/${validObjectId}/../../../etc/passwd`,
      `/images/${validObjectId}/..%2F..%2F..%2Fetc%2Fpasswd`,
      `/images/${validObjectId}/image.jpg/../../../etc/passwd`,
      `/images/${validObjectId}/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
    ];

    traversalAttempts.forEach((attempt) => {
      req.originalUrl = attempt;
      validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
      jest.clearAllMocks();
    });
  });

  test('should handle URL encoded characters in valid paths', () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = `/images/${validObjectId}/image%20with%20spaces.jpg`;
    validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
