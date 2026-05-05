const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { SubscriptionProfile } = require('~/db/models');
const {
  getRevenueCatConfig,
  getSubscriptionPublicConfig,
} = require('~/server/services/Billing/RevenueCatService');

const DEFAULT_FREE_LIMIT = 3;
const DEFAULT_ENTITLEMENT_ID = 'codecan_ai_pro';

function getCollectionName() {
  if (SubscriptionProfile?.collection?.collectionName) {
    return SubscriptionProfile.collection.collectionName;
  }

  if (mongoose.models?.SubscriptionProfile?.collection?.collectionName) {
    return mongoose.models.SubscriptionProfile.collection.collectionName;
  }

  try {
    const subscriptionModel = mongoose.model('SubscriptionProfile');
    return subscriptionModel?.collection?.collectionName ?? null;
  } catch (_error) {
    return null;
  }
}

function getSubscriptionConfig(req) {
  const subscriptionConfig =
    req?.config?.subscription ?? req?.config?.config?.subscription ?? getSubscriptionPublicConfig();
  const revenueCatConfig = getRevenueCatConfig();
  const enabled = subscriptionConfig.enabled ?? Boolean(revenueCatConfig.secretApiKey);
  const entitlementId = subscriptionConfig.entitlementId ?? revenueCatConfig.entitlementId;
  const freeMessagesPerMonth =
    Number.parseInt(String(subscriptionConfig.freeMessagesPerMonth), 10) ||
    revenueCatConfig.freeMessagesPerMonth ||
    DEFAULT_FREE_LIMIT;

  return {
    enabled,
    entitlementId,
    freeMessagesPerMonth,
  };
}

function getCurrentPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function isCountableChatRequest(body = {}) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text.length) {
    return false;
  }

  if (body.isRegenerate === true || body.isContinued === true || body.editedContent != null) {
    return false;
  }

  return true;
}

function toUserId(userId) {
  if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }

  return userId;
}

function getCollection() {
  if (mongoose.connection?.readyState !== 1) {
    return null;
  }

  const collectionName = getCollectionName();
  if (!collectionName) {
    return null;
  }

  return mongoose.connection.collection(collectionName);
}

function getEntitlementPath(entitlementId) {
  return `entitlements.${entitlementId}.isActive`;
}

async function getSubscriptionState({ userId, appUserId, entitlementId, freeMessagesPerMonth }) {
  const collection = getCollection();
  if (!collection) {
    return {
      isEnabled: false,
      isPro: false,
      period: getCurrentPeriod(),
      usedMessages: 0,
      limit: freeMessagesPerMonth,
      remainingMessages: freeMessagesPerMonth,
    };
  }

  const profile = await collection.findOne(
    { userId },
    { projection: { isPro: 1, entitlements: 1, quota: 1 } },
  );
  const period = getCurrentPeriod();
  const isPro = Boolean(profile?.isPro ?? profile?.entitlements?.[entitlementId]?.isActive);
  const storedPeriod = profile?.quota?.period;
  const usedMessages = storedPeriod === period ? (profile?.quota?.usedMessages ?? 0) : 0;

  return {
    isEnabled: true,
    appUserId,
    isPro,
    period,
    usedMessages,
    limit: freeMessagesPerMonth,
    remainingMessages: Math.max(freeMessagesPerMonth - usedMessages, 0),
  };
}

async function consumeFreeMessage({
  userId,
  appUserId,
  entitlementId,
  freeMessagesPerMonth,
  period = getCurrentPeriod(),
}) {
  const collection = getCollection();
  if (!collection) {
    return {
      allowed: true,
      reason: 'collection_unavailable',
      state: {
        isEnabled: false,
        appUserId,
        isPro: false,
        period,
        usedMessages: 0,
        limit: freeMessagesPerMonth,
        remainingMessages: freeMessagesPerMonth,
      },
    };
  }

  const entitlementPath = getEntitlementPath(entitlementId);

  // Step 1: ensure a profile row exists for this user. Done as a separate
  // idempotent upsert so the conditional increment below can run without
  // upsert and never risks a duplicate-key insert on retry. (A combined
  // upsert+conditional-filter findOneAndUpdate triggers E11000 when the
  // user is at the limit, since the $or no longer matches and Mongo tries
  // to insert a second row against the unique userId/appUserId index.)
  await collection.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        appUserId,
        entitlementId,
        isPro: false,
      },
    },
    { upsert: true },
  );

  // Step 2: conditional increment. Filter matches only when the user is
  // pro, on a new period, below the limit, or has no quota subdoc yet —
  // i.e. when this request is allowed. If nothing matches, the user is
  // over the limit and Mongo returns null (we explicitly disable upsert).
  const filter = {
    userId,
    $or: [
      { isPro: true },
      { [entitlementPath]: true },
      { 'quota.period': { $ne: period } },
      { 'quota.usedMessages': { $lt: freeMessagesPerMonth } },
      { quota: { $exists: false } },
    ],
  };

  const updatePipeline = [
    {
      $set: {
        appUserId,
        entitlementId: {
          $ifNull: ['$entitlementId', entitlementId],
        },
        isPro: {
          $cond: [
            { $eq: ['$isPro', true] },
            true,
            {
              $cond: [{ $eq: [`$${entitlementPath}`, true] }, true, false],
            },
          ],
        },
        quota: {
          period,
          limit: freeMessagesPerMonth,
          usedMessages: {
            $cond: [
              {
                $or: [{ $eq: ['$isPro', true] }, { $eq: [`$${entitlementPath}`, true] }],
              },
              { $ifNull: ['$quota.usedMessages', 0] },
              {
                $cond: [
                  { $eq: ['$quota.period', period] },
                  { $add: [{ $ifNull: ['$quota.usedMessages', 0] }, 1] },
                  1,
                ],
              },
            ],
          },
        },
      },
    },
  ];

  const result = await collection.findOneAndUpdate(filter, updatePipeline, {
    upsert: false,
    returnDocument: 'after',
  });
  const profile = result?.value ?? result;

  if (!profile) {
    const state = await getSubscriptionState({
      userId,
      appUserId,
      entitlementId,
      freeMessagesPerMonth,
    });

    return {
      allowed: false,
      reason: 'quota_exceeded',
      state,
    };
  }

  const isPro = Boolean(profile?.isPro ?? profile?.entitlements?.[entitlementId]?.isActive);
  const usedMessages = profile?.quota?.usedMessages ?? 0;

  return {
    allowed: true,
    reason: isPro ? 'pro' : 'free_usage',
    state: {
      isEnabled: true,
      appUserId,
      isPro,
      period,
      usedMessages,
      limit: freeMessagesPerMonth,
      remainingMessages: isPro
        ? freeMessagesPerMonth
        : Math.max(freeMessagesPerMonth - usedMessages, 0),
    },
  };
}

async function evaluateSubscriptionQuota(req) {
  const { enabled, entitlementId, freeMessagesPerMonth } = getSubscriptionConfig(req);
  const appUserId = req?.user?.id;
  const userId = toUserId(appUserId);

  if (!enabled || !userId || !appUserId) {
    return {
      enabled,
      allowed: true,
      reason: enabled ? 'missing_user' : 'disabled',
      countable: false,
      state: {
        isEnabled: enabled,
        appUserId,
        isPro: false,
        period: getCurrentPeriod(),
        usedMessages: 0,
        limit: freeMessagesPerMonth,
        remainingMessages: freeMessagesPerMonth,
      },
    };
  }

  const countable = isCountableChatRequest(req?.body);

  try {
    if (!countable) {
      return {
        enabled,
        allowed: true,
        reason: 'not_countable',
        countable,
        state: await getSubscriptionState({
          userId,
          appUserId,
          entitlementId,
          freeMessagesPerMonth,
        }),
      };
    }

    const result = await consumeFreeMessage({
      userId,
      appUserId,
      entitlementId,
      freeMessagesPerMonth,
    });

    return {
      enabled,
      countable,
      ...result,
    };
  } catch (error) {
    logger.error('[evaluateSubscriptionQuota] Failed to evaluate quota', error);
    return {
      enabled,
      allowed: true,
      reason: 'error',
      countable,
      state: {
        isEnabled: enabled,
        appUserId,
        isPro: false,
        period: getCurrentPeriod(),
        usedMessages: 0,
        limit: freeMessagesPerMonth,
        remainingMessages: freeMessagesPerMonth,
      },
    };
  }
}

module.exports = {
  DEFAULT_ENTITLEMENT_ID,
  DEFAULT_FREE_LIMIT,
  evaluateSubscriptionQuota,
  getCollectionName,
  getCurrentPeriod,
  getSubscriptionConfig,
  isCountableChatRequest,
};
