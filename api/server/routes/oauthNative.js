const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { setAuthTokens } = require('~/server/services/AuthService');
const { consumeExchange } = require('~/cache/nativeOAuthExchange');
const resolveSocialLogin = require('~/server/services/auth/resolveSocialLogin');
const { getUserById } = require('~/models');
const { loginLimiter, checkBan } = require('~/server/middleware');

const router = express.Router();

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = `${APPLE_ISSUER}/auth/keys`;

const appleJwks = jwksClient({
  jwksUri: APPLE_JWKS_URI,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
});

const getAppleSigningKey = (header, callback) => {
  appleJwks.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    callback(null, key.getPublicKey());
  });
};

const getAllowedAppleAudiences = () => {
  const audiences = new Set();
  if (process.env.APPLE_CLIENT_ID) {
    audiences.add(process.env.APPLE_CLIENT_ID);
  }
  if (process.env.APPLE_NATIVE_CLIENT_ID) {
    for (const value of process.env.APPLE_NATIVE_CLIENT_ID.split(',')) {
      const trimmed = value.trim();
      if (trimmed) {
        audiences.add(trimmed);
      }
    }
  }
  return Array.from(audiences);
};

const verifyAppleIdentityToken = (identityToken, expectedNonce) =>
  new Promise((resolve, reject) => {
    const audiences = getAllowedAppleAudiences();
    if (audiences.length === 0) {
      return reject(new Error('No Apple audience configured'));
    }
    jwt.verify(
      identityToken,
      getAppleSigningKey,
      {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: audiences,
      },
      (err, payload) => {
        if (err) {
          return reject(err);
        }
        if (expectedNonce) {
          const tokenNonce = payload.nonce;
          if (!tokenNonce || tokenNonce !== expectedNonce) {
            return reject(new Error('Apple nonce mismatch'));
          }
        }
        resolve(payload);
      },
    );
  });

/**
 * POST /api/auth/oauth/exchange
 *
 * Native Capacitor clients consume the one-time code they received via the
 * ai.codecan.app://oauth/callback deep link and trade it for the LibreChat
 * JWT + refresh token to store in Capacitor Preferences.
 */
router.post('/oauth/exchange', loginLimiter, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code) {
      return res.status(400).json({ message: 'code is required', code: 'CODE_REQUIRED' });
    }
    const payload = await consumeExchange(code);
    if (!payload) {
      return res.status(400).json({
        message: 'Exchange code is invalid or expired',
        code: 'INVALID_CODE',
      });
    }
    const user = await getUserById(payload.userId, '-password -__v -totpSecret -backupCodes');
    if (!user) {
      return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
    }
    user.id = user._id.toString();
    return res.status(200).json({
      token: payload.token,
      refreshToken: payload.refreshToken,
      expiresAt: payload.refreshTokenExpires,
      user,
    });
  } catch (err) {
    logger.error('[/api/auth/oauth/exchange] failed', err);
    return res.status(500).json({ message: 'Failed to exchange code', code: 'EXCHANGE_FAILED' });
  }
});

/**
 * POST /api/auth/apple/native
 *
 * Direct Sign in with Apple via native ASAuthorization. The Capacitor plugin
 * returns an Apple-signed identity token; we verify it against Apple's JWKS,
 * resolve / create the matching user record (reusing the `apple` provider so
 * web SIWA users land on the same account), and mint our own session tokens.
 *
 * Body: { identityToken, nonce?, fullName? }
 *   - identityToken (required): JWT issued by Apple
 *   - nonce (optional but required if the client sent one to Apple): the raw
 *       nonce value the client used; Apple hashes it with SHA-256 and embeds
 *       in the token under the `nonce` claim. We validate equality so we can
 *       use the raw value the client passes here.
 *   - fullName (optional): { givenName, familyName } — Apple only ever sends
 *       these on the FIRST authorization for a user; the client should pass
 *       them through if present.
 */
router.post('/apple/native', loginLimiter, async (req, res) => {
  try {
    await checkBan(req, res);
    if (req.banned) {
      return;
    }

    const { identityToken, nonce, fullName } = req.body || {};
    if (typeof identityToken !== 'string' || !identityToken) {
      return res
        .status(400)
        .json({ message: 'identityToken is required', code: 'IDENTITY_TOKEN_REQUIRED' });
    }

    let payload;
    try {
      payload = await verifyAppleIdentityToken(identityToken, nonce);
    } catch (err) {
      logger.warn('[/api/auth/apple/native] identity token verification failed', {
        message: err.message,
      });
      return res
        .status(401)
        .json({ message: 'Invalid Apple identity token', code: ErrorTypes.AUTH_FAILED });
    }

    if (!payload.email) {
      logger.warn('[/api/auth/apple/native] identity token missing email claim', {
        sub: payload.sub,
      });
      return res
        .status(400)
        .json({ message: 'Apple identity token missing email', code: ErrorTypes.AUTH_FAILED });
    }

    const identity = {
      email: payload.email,
      id: payload.sub,
      avatarUrl: null,
      username: payload.email.split('@')[0].toLowerCase(),
      name:
        fullName && (fullName.givenName || fullName.familyName)
          ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
          : null,
      emailVerified: true,
    };

    let user;
    try {
      user = await resolveSocialLogin('apple', identity);
    } catch (err) {
      logger.warn('[/api/auth/apple/native] resolveSocialLogin rejected', { message: err.message });
      const status = err.code === ErrorTypes.AUTH_FAILED ? 401 : 500;
      return res
        .status(status)
        .json({ message: err.message || 'Authentication failed', code: ErrorTypes.AUTH_FAILED });
    }

    const tokens = await setAuthTokens(user._id, res, null, { returnRefresh: true });
    const safeUser = user.toObject ? user.toObject() : user;
    delete safeUser.password;
    delete safeUser.totpSecret;
    delete safeUser.backupCodes;
    delete safeUser.__v;
    safeUser.id = user._id.toString();

    return res.status(200).json({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.refreshTokenExpires,
      user: safeUser,
    });
  } catch (err) {
    logger.error('[/api/auth/apple/native] failed', err);
    return res.status(500).json({ message: 'Authentication failed', code: 'AUTH_FAILED' });
  }
});

module.exports = router;
