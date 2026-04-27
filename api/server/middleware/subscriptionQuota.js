const denyRequest = require('./denyRequest');
const {
  evaluateSubscriptionQuota,
  getSubscriptionConfig,
} = require('~/server/services/Billing/quota');

function buildQuotaErrorPayload(state, entitlementId) {
  return {
    type: 'subscription_required',
    code: 'quota_exceeded',
    entitlementId,
    period: state.period,
    limit: state.limit,
    usedMessages: state.usedMessages,
    remainingMessages: state.remainingMessages,
    isPro: state.isPro,
  };
}

async function enforceSubscriptionQuota(req, res, next) {
  const result = await evaluateSubscriptionQuota(req);

  if (!result.enabled || result.allowed) {
    return next();
  }

  const { entitlementId } = getSubscriptionConfig(req);
  return denyRequest(req, res, buildQuotaErrorPayload(result.state, entitlementId));
}

module.exports = {
  enforceSubscriptionQuota,
};
