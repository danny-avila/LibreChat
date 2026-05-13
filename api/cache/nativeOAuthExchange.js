const crypto = require('crypto');
const { standardCache } = require('@librechat/api');

const NAMESPACE = 'NATIVE_OAUTH_EXCHANGE';
const TTL_MS = 60 * 1000;

const store = standardCache(NAMESPACE, TTL_MS);

const generateCode = () => crypto.randomBytes(32).toString('base64url');

const putExchange = async (payload) => {
  const code = generateCode();
  await store.set(code, payload, TTL_MS);
  return code;
};

const consumeExchange = async (code) => {
  if (typeof code !== 'string' || code.length < 16) {
    return null;
  }
  const payload = await store.get(code);
  if (!payload) {
    return null;
  }
  await store.delete(code);
  return payload;
};

module.exports = {
  putExchange,
  consumeExchange,
};
