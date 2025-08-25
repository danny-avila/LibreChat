const jwt = require('jsonwebtoken');
const validateImageRequest = require('~/server/middleware/validateImageRequest');

jest.mock('~/server/services/Config/app', () => ({
  getAppConfig: jest.fn(),
}));

describe('validateImageRequest middleware', () => {
  let req, res, next;
  const validObjectId = '65cfb246f7ecadb8b1e8036b';
  const { getAppConfig } = require('~/server/services/Config/app');

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: {},
      originalUrl: '',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    next = jest.fn();
    process.env.JWT_REFRESH_SECRET = 'test-secret';

    // Mock getAppConfig to return secureImageLinks: true by default
    getAppConfig.mockResolvedValue({
      secureImageLinks: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should call next() if secureImageLinks is false', async () => {
    getAppConfig.mockResolvedValue({
      secureImageLinks: false,
    });
    await validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('should return 401 if refresh token is not provided', async () => {
    await validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  test('should return 403 if refresh token is invalid', async () => {
    req.headers.cookie = 'refreshToken=invalid-token';
    await validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should return 403 if refresh token is expired', async () => {
    const expiredToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${expiredToken}`;
    await validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should call next() for valid image path', async () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = `/images/${validObjectId}/example.jpg`;
    await validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('should return 403 for invalid image path', async () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = '/images/65cfb246f7ecadb8b1e8036c/example.jpg'; // Different ObjectId
    await validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  test('should return 403 for invalid ObjectId format', async () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = '/images/123/example.jpg'; // Invalid ObjectId
    await validateImageRequest(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access Denied');
  });

  // File traversal tests
  test('should prevent file traversal attempts', async () => {
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

    for (const attempt of traversalAttempts) {
      req.originalUrl = attempt;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
      jest.clearAllMocks();
    }
  });

  test('should handle URL encoded characters in valid paths', async () => {
    const validToken = jwt.sign(
      { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_REFRESH_SECRET,
    );
    req.headers.cookie = `refreshToken=${validToken}`;
    req.originalUrl = `/images/${validObjectId}/image%20with%20spaces.jpg`;
    await validateImageRequest(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
