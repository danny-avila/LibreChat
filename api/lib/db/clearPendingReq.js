const Keyv = require('keyv');
const keyvMongo = require('./keyvMongo');
const { LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

const clearPendingReq = async () => {
  if (LIMIT_CONCURRENT_MESSAGES?.toLowerCase() !== 'true') {
    return;
  }
  const keyv = new Keyv({ store: keyvMongo, namespace: 'pendingRequests' });
  await keyv.clear();
};

module.exports = clearPendingReq;
