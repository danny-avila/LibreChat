const Keyv = require('keyv');
const keyvMongo = require('../../cache/keyvMongo');
const { isEnabled, math } = require('../utils');

const banCache = new Keyv({ namespace: 'bans', ttl: 0 });
const message = 'Your account has been banned due to violations of our terms of service.';

const checkBan = async (req, res, next) => {
  const { BAN_VIOLATIONS, BAN_DURATION } = process.env ?? {};

  if (!isEnabled(BAN_VIOLATIONS)) {
    return next();
  }

  const cachedBan = await banCache.get(req.user.id);

  if (cachedBan) {
    console.log('banCache hit');
    return res.status(403).json({ message });
  }

  let duration;
  try {
    duration = math(BAN_DURATION);
  } catch {
    duration = 0;
  }

  if (duration <= 0) {
    return next();
  }

  const banLogs = new Keyv({ store: keyvMongo, ttl: duration, namespace: 'bans' });
  const isBanned = await banLogs.get(req.user.id);

  if (!isBanned) {
    return next();
  }

  const timeLeft = Number(isBanned.expiresAt) - Date.now();

  if (timeLeft <= 0) {
    await banLogs.delete(req.user.id);
    return next();
  }

  banCache.set(req.user.id, isBanned, timeLeft);

  return res.status(403).json({ message });
};

module.exports = checkBan;
