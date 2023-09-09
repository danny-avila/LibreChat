const Keyv = require('keyv');
const { pendingReqFile } = require('./keyvFiles');
const { LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

const clearPendingReq = async () => {
  if (LIMIT_CONCURRENT_MESSAGES?.toLowerCase() !== 'true') {
    return;
  }
  const keyv = new Keyv({ store: pendingReqFile, namespace: 'pendingRequests' });
  await keyv.clear();
};

module.exports = clearPendingReq;
