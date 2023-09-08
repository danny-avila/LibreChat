const Keyv = require('keyv');
const cache = require('./keyvFile');
const { LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

const clearPendingReq = async () => {
  if (LIMIT_CONCURRENT_MESSAGES?.toLowerCase() !== 'true') {
    return;
  }
  const keyv = new Keyv({ store: cache, namespace: 'pendingRequests' });
  await keyv.clear();
};

module.exports = clearPendingReq;
