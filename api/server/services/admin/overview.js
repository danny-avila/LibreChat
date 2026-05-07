const { User, AdminAuditLog, SubscriptionProfile, Transaction, Message } = require('~/db/models');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute org-wide KPIs for the admin overview dashboard.
 *
 * @returns {Promise<{
 *   users: { total: number, newLast7d: number, newLast30d: number },
 *   subscriptions: { activePro: number, manuallyOverridden: number },
 *   messages: { total30d: number, totalAll: number },
 *   tokens: { total30d: number },
 *   audit: { total30d: number, failures30d: number }
 * }>}
 */
async function getOverview() {
  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS);
  const since30d = new Date(now - 30 * DAY_MS);

  const [
    usersTotal,
    usersNew7d,
    usersNew30d,
    activePro,
    manuallyOverridden,
    messages30d,
    messagesAll,
    tokens30dAgg,
    audit30d,
    auditFailures30d,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: since7d } }),
    User.countDocuments({ createdAt: { $gte: since30d } }),
    SubscriptionProfile.countDocuments({ isPro: true }),
    SubscriptionProfile.countDocuments({ 'manualOverride.enabled': true }),
    Message.countDocuments({ createdAt: { $gte: since30d } }),
    Message.countDocuments({}),
    Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: since30d },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
        },
      },
    ]),
    AdminAuditLog.countDocuments({ createdAt: { $gte: since30d } }),
    AdminAuditLog.countDocuments({ createdAt: { $gte: since30d }, status: 'failure' }),
  ]);

  const tokens30d = tokens30dAgg?.[0]?.total ?? 0;

  return {
    users: {
      total: usersTotal,
      newLast7d: usersNew7d,
      newLast30d: usersNew30d,
    },
    subscriptions: {
      activePro,
      manuallyOverridden,
    },
    messages: {
      total30d: messages30d,
      totalAll: messagesAll,
    },
    tokens: {
      total30d: tokens30d,
    },
    audit: {
      total30d: audit30d,
      failures30d: auditFailures30d,
    },
  };
}

module.exports = { getOverview };
