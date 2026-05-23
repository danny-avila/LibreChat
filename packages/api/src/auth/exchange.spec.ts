import crypto from 'crypto';
import { Keyv } from 'keyv';
import type { IUser } from '@librechat/data-schemas';

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
    },
  }),
  { virtual: true },
);

import { exchangeAdminCode, generateAdminExchangeCode, verifyCodeChallenge } from './exchange';

describe('admin OAuth code exchange', () => {
  const user = {
    _id: 'user123',
    email: 'admin@example.com',
    name: 'Admin User',
    username: 'admin',
    role: 'ADMIN',
    provider: 'openid',
  } as unknown as IUser;

  const createCache = () => {
    const cache = new Keyv();
    const deleteSpy = jest.spyOn(cache, 'delete');
    return { cache, deleteSpy };
  };

  describe('origin binding', () => {
    it('exchanges code when request origin matches generated origin', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
      );

      const result = await exchangeAdminCode(cache, exchangeCode, 'https://admin.example.com');

      expect(result).not.toBeNull();
      expect(result!.token).toBe('jwt-token');
      expect(result!.refreshToken).toBe('refresh-token');
      expect(result!.user.email).toBe('admin@example.com');
    });

    it('rejects code exchange when request origin does not match generated origin', async () => {
      const { cache, deleteSpy } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
      );

      const result = await exchangeAdminCode(cache, exchangeCode, 'https://evil.example.com');

      expect(result).toBeNull();
      expect(deleteSpy).toHaveBeenCalledWith(exchangeCode);
      await expect(cache.get(exchangeCode)).resolves.toBeUndefined();
    });

    it('rejects code exchange when origin is stored but request has no origin', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
      );

      const result = await exchangeAdminCode(cache, exchangeCode, undefined);

      expect(result).toBeNull();
    });

    it('allows exchange when no origin was stored (backward compat)', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
      );

      const result = await exchangeAdminCode(cache, exchangeCode, 'https://any-origin.com');

      expect(result).not.toBeNull();
      expect(result!.token).toBe('jwt-token');
    });
  });

  describe('one-time use', () => {
    it('rejects code that has already been used', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
      );

      await exchangeAdminCode(cache, exchangeCode, 'https://admin.example.com');
      const secondAttempt = await exchangeAdminCode(
        cache,
        exchangeCode,
        'https://admin.example.com',
      );

      expect(secondAttempt).toBeNull();
    });
  });

  describe('PKCE verification', () => {
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('hex');

    it('verifyCodeChallenge returns true for matching verifier', () => {
      expect(verifyCodeChallenge(codeVerifier, codeChallenge)).toBe(true);
    });

    it('verifyCodeChallenge returns false for wrong verifier', () => {
      expect(verifyCodeChallenge('wrong-verifier', codeChallenge)).toBe(false);
    });

    it('verifyCodeChallenge handles hex case insensitively (input gate rejects uppercase)', () => {
      const uppercaseChallenge = codeChallenge.toUpperCase();
      // Buffer.from(hex) is case-insensitive, so verification passes at this layer.
      // Uppercase challenges are rejected earlier by PKCE_CHALLENGE_PATTERN (no /i flag).
      expect(verifyCodeChallenge(codeVerifier, uppercaseChallenge)).toBe(true);
    });

    it('exchanges code when valid code_verifier is provided', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
        codeChallenge,
      );

      const result = await exchangeAdminCode(
        cache,
        exchangeCode,
        'https://admin.example.com',
        codeVerifier,
      );

      expect(result).not.toBeNull();
      expect(result!.token).toBe('jwt-token');
    });

    it('rejects exchange when code_verifier does not match challenge', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
        codeChallenge,
      );

      const result = await exchangeAdminCode(
        cache,
        exchangeCode,
        'https://admin.example.com',
        'wrong-verifier',
      );

      expect(result).toBeNull();
    });

    it('rejects exchange when challenge stored but no verifier provided', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
        codeChallenge,
      );

      const result = await exchangeAdminCode(cache, exchangeCode, 'https://admin.example.com');

      expect(result).toBeNull();
    });

    it('allows exchange when no challenge stored and no verifier sent (backward compat)', async () => {
      const { cache } = createCache();
      const exchangeCode = await generateAdminExchangeCode(
        cache,
        user,
        'jwt-token',
        'refresh-token',
        'https://admin.example.com',
      );

      const result = await exchangeAdminCode(cache, exchangeCode, 'https://admin.example.com');

      expect(result).not.toBeNull();
      expect(result!.token).toBe('jwt-token');
    });
  });
});
