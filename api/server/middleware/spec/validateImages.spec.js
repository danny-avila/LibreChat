const jwt = require('jsonwebtoken');
const createValidateImageRequest = require('~/server/middleware/validateImageRequest');

// Mock only isEnabled, keep getBasePath real so it reads process.env.DOMAIN_CLIENT
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(),
}));

const { isEnabled } = require('@librechat/api');

describe('validateImageRequest middleware', () => {
  let req, res, next, validateImageRequest;
  const validObjectId = '65cfb246f7ecadb8b1e8036b';

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
    process.env.OPENID_REUSE_TOKENS = 'false';
    delete process.env.DOMAIN_CLIENT; // Clear for tests without basePath

    // Default: OpenID token reuse disabled
    isEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Factory function', () => {
    test('should return a pass-through middleware if secureImageLinks is false', async () => {
      const middleware = createValidateImageRequest(false);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return validation middleware if secureImageLinks is true', async () => {
      validateImageRequest = createValidateImageRequest(true);
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Unauthorized');
    });
  });

  describe('Standard LibreChat token flow', () => {
    beforeEach(() => {
      validateImageRequest = createValidateImageRequest(true);
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

    test('should allow agent avatar pattern for any valid ObjectId', async () => {
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = '/images/65cfb246f7ecadb8b1e8036c/agent-avatar-12345.png';
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

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
        // Reset mocks for next iteration
        res.status = jest.fn().mockReturnThis();
        res.send = jest.fn();
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

  describe('OpenID token flow', () => {
    beforeEach(() => {
      validateImageRequest = createValidateImageRequest(true);
      // Enable OpenID token reuse
      isEnabled.mockReturnValue(true);
      process.env.OPENID_REUSE_TOKENS = 'true';
    });

    test('should return 403 if no OpenID user ID cookie when token_provider is openid', async () => {
      req.headers.cookie = 'refreshToken=dummy-token; token_provider=openid';
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should validate JWT-signed user ID for OpenID flow', async () => {
      const signedUserId = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=dummy-token; token_provider=openid; openid_user_id=${signedUserId}`;
      req.originalUrl = `/images/${validObjectId}/example.jpg`;
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should return 403 for invalid JWT-signed user ID', async () => {
      req.headers.cookie =
        'refreshToken=dummy-token; token_provider=openid; openid_user_id=invalid-jwt';
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should return 403 for expired JWT-signed user ID', async () => {
      const expiredSignedUserId = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=dummy-token; token_provider=openid; openid_user_id=${expiredSignedUserId}`;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should validate image path against JWT-signed user ID', async () => {
      const signedUserId = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      const differentObjectId = '65cfb246f7ecadb8b1e8036c';
      req.headers.cookie = `refreshToken=dummy-token; token_provider=openid; openid_user_id=${signedUserId}`;
      req.originalUrl = `/images/${differentObjectId}/example.jpg`;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should allow agent avatars in OpenID flow', async () => {
      const signedUserId = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=dummy-token; token_provider=openid; openid_user_id=${signedUserId}`;
      req.originalUrl = '/images/65cfb246f7ecadb8b1e8036c/agent-avatar-12345.png';
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Security edge cases', () => {
    let validToken;

    beforeEach(() => {
      validateImageRequest = createValidateImageRequest(true);
      validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
    });

    test('should handle very long image filenames', async () => {
      const longFilename = 'a'.repeat(1000) + '.jpg';
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/${longFilename}`;
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle URLs with maximum practical length', async () => {
      // Most browsers support URLs up to ~2000 characters
      const longFilename = 'x'.repeat(1900) + '.jpg';
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/${longFilename}`;
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should accept URLs just under the 2048 limit', async () => {
      // Create a URL exactly 2047 characters long
      const baseLength = `/images/${validObjectId}/`.length + '.jpg'.length;
      const filenameLength = 2047 - baseLength;
      const filename = 'a'.repeat(filenameLength) + '.jpg';
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/${filename}`;
      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle malformed URL encoding gracefully', async () => {
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test%ZZinvalid.jpg`;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should reject URLs with null bytes', async () => {
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test\x00.jpg`;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should handle URLs with repeated slashes', async () => {
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}//test.jpg`;
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should reject extremely long URLs as potential DoS', async () => {
      // Create a URL longer than 2048 characters
      const baseLength = `/images/${validObjectId}/`.length + '.jpg'.length;
      const filenameLength = 2049 - baseLength; // Ensure total length exceeds 2048
      const extremelyLongFilename = 'x'.repeat(filenameLength) + '.jpg';
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/${extremelyLongFilename}`;
      // Verify our test URL is actually too long
      expect(req.originalUrl.length).toBeGreaterThan(2048);
      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });
  });

  describe('basePath functionality', () => {
    let originalDomainClient;

    beforeEach(() => {
      originalDomainClient = process.env.DOMAIN_CLIENT;
    });

    afterEach(() => {
      process.env.DOMAIN_CLIENT = originalDomainClient;
    });

    test('should validate image paths with base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should validate agent avatar paths with base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/agent-avatar.png`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should reject image paths without base path when DOMAIN_CLIENT is set', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should handle empty base path (root deployment)', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle missing DOMAIN_CLIENT', async () => {
      delete process.env.DOMAIN_CLIENT;
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle nested subdirectories in base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/apps/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/apps/librechat/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should prevent path traversal with base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/../../../etc/passwd`;

      await validateImageRequest(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access Denied');
    });

    test('should handle URLs with query parameters and base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/test.jpg?version=1`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle URLs with fragments and base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/test.jpg#section`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle HTTPS URLs with base path', async () => {
      process.env.DOMAIN_CLIENT = 'https://example.com/librechat';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle invalid DOMAIN_CLIENT gracefully', async () => {
      process.env.DOMAIN_CLIENT = 'not-a-valid-url';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}`;
      req.originalUrl = `/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should handle OpenID flow with base path', async () => {
      process.env.DOMAIN_CLIENT = 'http://localhost:3080/librechat';
      process.env.OPENID_REUSE_TOKENS = 'true';
      const validToken = jwt.sign(
        { id: validObjectId, exp: Math.floor(Date.now() / 1000) + 3600 },
        process.env.JWT_REFRESH_SECRET,
      );
      req.headers.cookie = `refreshToken=${validToken}; token_provider=openid; openid_user_id=${validToken}`;
      req.originalUrl = `/librechat/images/${validObjectId}/test.jpg`;

      await validateImageRequest(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
