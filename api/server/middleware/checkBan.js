const { Keyv } = require('keyv');
const uap = require('ua-parser-js');
const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { isEnabled, keyvMongo, removePorts } = require('@librechat/api');
const { getLogStores } = require('~/cache');
const denyRequest = require('./denyRequest');
const { findUser } = require('~/models');

const banCache = new Keyv({ store: keyvMongo, namespace: ViolationTypes.BAN, ttl: 0 });
const message = 'Your account has been temporarily banned due to violations of our service.';

/** @returns {string} Cache key for ban lookups, prefixed for Redis or raw for MongoDB */
const getBanCacheKey = (prefix, value, useRedis) => {
  if (!value) {
    return '';
  }
  return useRedis ? `ban_cache:${prefix}:${value}` : value;
};

/**
 * Respond to the request if the user is banned.
 *
 * @async
 * @function
 * @param {Object} req - Express Request object.
 * @param {Object} res - Express Response object.
 *
 * @returns {Promise<Object>} - Returns a Promise which when resolved sends a response status of 403 with a specific message if request is not of api/agents/chat. If it is, calls `denyRequest()` function.
 */
const banResponse = async (req, res) => {
  const ua = uap(req.headers['user-agent']);
  const { baseUrl, originalUrl } = req;
  if (!ua.browser.name) {
    return res.status(403).json({ message });
  } else if (baseUrl === '/api/agents' && originalUrl.startsWith('/api/agents/chat')) {
    return await denyRequest(req, res, { type: ViolationTypes.BAN });
  }

  return res.status(403).json({ message });
};

/**
 * Creates a `checkBan` middleware instance for a given identity-resolution mode.
 *
 * - `'default'` (existing behavior): checks `req.user`, falling back to an
 *   unscoped `req.body.email` lookup when no user is set.
 * - `'ipOnly'`: never reads `req.user` or `req.body.email` — IP-only. For a
 *   pre-identity pass (e.g. before Clerk's `prepareClerkLogin` has run).
 * - `'resolvedIdentity'`: checks only `req.user` (the candidate an earlier
 *   middleware already resolved) — never falls back to `req.body.email`,
 *   since a Clerk login body has no such field.
 *
 * @param {Object} [options]
 * @param {'default'|'ipOnly'|'resolvedIdentity'} [options.mode='default']
 * @param {(req: Object, res: Object) => Promise<Object>} [options.respond] - Overrides the default 403 responder.
 * @returns {(req: Object, res: Object, next: import('express').NextFunction) => Promise<function|Object>}
 */
const createCheckBan = ({ mode = 'default', respond } = {}) => {
  const respondWith = respond ?? (mode === 'default' ? banResponse : clerkBanResponse);
  return async (req, res, next = () => {}) => {
    try {
      const { BAN_VIOLATIONS } = process.env ?? {};

      if (!isEnabled(BAN_VIOLATIONS)) {
        return next();
      }

      /**
       * `removePorts(req)`'s result must not be written back to `req.ip` —
       * Express 5 defines it as a getter with no setter, so the assignment
       * previously either threw (strict mode) or silently no-op'd (non-strict),
       * leaving every downstream `req.ip` read as Express's raw value instead
       * of the intended port-stripped one. A local variable carries the
       * intended value without touching the read-only property.
       */
      const clientIp = removePorts(req);
      let userId = mode === 'ipOnly' ? null : (req.user?.id ?? req.user?._id ?? null);

      if (!userId && mode === 'default' && req?.body?.email) {
        const user = await findUser({ email: req.body.email }, '_id');
        userId = user?._id ? user._id.toString() : userId;
      }

      if (!userId && !clientIp) {
        return next();
      }

      const useRedis = isEnabled(process.env.USE_REDIS);
      const ipKey = getBanCacheKey('ip', clientIp, useRedis);
      const userKey = getBanCacheKey('user', userId, useRedis);

      const [cachedIPBan, cachedUserBan] = await Promise.all([
        ipKey ? banCache.get(ipKey) : undefined,
        userKey ? banCache.get(userKey) : undefined,
      ]);

      if (cachedIPBan || cachedUserBan) {
        req.banned = true;
        return await respondWith(req, res);
      }

      const banLogs = getLogStores(ViolationTypes.BAN);
      const duration = banLogs.opts.ttl;

      if (duration <= 0) {
        return next();
      }

      const [ipBan, userBan] = await Promise.all([
        clientIp ? banLogs.get(clientIp) : undefined,
        userId ? banLogs.get(userId) : undefined,
      ]);

      const banData = ipBan || userBan;

      if (!banData) {
        return next();
      }

      const expiresAt = Number(banData.expiresAt);
      if (!banData.expiresAt || isNaN(expiresAt)) {
        req.banned = true;
        return await respondWith(req, res);
      }

      const timeLeft = expiresAt - Date.now();

      if (timeLeft <= 0) {
        const cleanups = [];
        if (ipBan) {
          cleanups.push(banLogs.delete(clientIp));
        }
        if (userBan) {
          cleanups.push(banLogs.delete(userId));
        }
        await Promise.all(cleanups);
        return next();
      }

      const cacheWrites = [];
      if (ipKey) {
        cacheWrites.push(banCache.set(ipKey, banData, timeLeft));
      }
      if (userKey) {
        cacheWrites.push(banCache.set(userKey, banData, timeLeft));
      }
      await Promise.all(cacheWrites).catch((err) =>
        logger.warn('[checkBan] Failed to write ban cache:', err),
      );

      req.banned = true;
      return await respondWith(req, res);
    } catch (error) {
      logger.error('Error in checkBan middleware:', error);
      return next(error);
    }
  };
};

/** Default responder for the Clerk `ipOnly`/`resolvedIdentity` modes: a stable `{code}` body. */
const clerkBanResponse = async (req, res) =>
  res.status(403).json({ code: 'CLERK_LOGIN_FORBIDDEN' });

const checkBan = createCheckBan();

module.exports = checkBan;
module.exports.createCheckBan = createCheckBan;
module.exports.clerkBanResponse = clerkBanResponse;
