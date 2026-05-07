const mongoose = require('mongoose');
const { User, SubscriptionProfile } = require('~/db/models');
const { getSubscriptionProfile } = require('~/server/services/Billing/RevenueCatService');

const DEFAULT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'codecan_ai_pro';
const DEFAULT_FREE_MESSAGES_PER_MONTH = Number.parseInt(
  process.env.REVENUECAT_FREE_MESSAGES_PER_MONTH || '3',
  10,
);

const ALLOWED_SORTS = new Set(['-updatedAt', 'updatedAt', 'expiresAt', '-expiresAt']);

function getCurrentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

/**
 * Build a JSON-safe snapshot of the audit-relevant fields of a profile.
 * Intentionally omits the `entitlements` Map to keep audit rows well under 16KB.
 */
function snapshotProfile(profile) {
  if (!profile) return null;
  return {
    isPro: profile.isPro ?? null,
    currentPlan: profile.currentPlan ?? null,
    productId: profile.productId ?? null,
    store: profile.store ?? null,
    expiresAt: profile.expiresAt ?? null,
    manualOverride: profile.manualOverride
      ? {
          enabled: !!profile.manualOverride.enabled,
          mode: profile.manualOverride.mode ?? null,
          source: profile.manualOverride.source ?? null,
          updatedAt: profile.manualOverride.updatedAt ?? null,
        }
      : null,
  };
}

function serializeProfile(profile) {
  if (!profile) return null;
  let entitlements = profile.entitlements;
  if (entitlements instanceof Map) {
    entitlements = Object.fromEntries(entitlements);
  }
  return {
    userId: profile.userId ? profile.userId.toString() : null,
    appUserId: profile.appUserId ?? null,
    entitlementId: profile.entitlementId ?? null,
    isPro: !!profile.isPro,
    currentPlan: profile.currentPlan ?? null,
    productId: profile.productId ?? null,
    store: profile.store ?? null,
    expiresAt: profile.expiresAt ?? null,
    managementUrl: profile.managementUrl ?? null,
    quota: profile.quota
      ? {
          period: profile.quota.period ?? null,
          usedMessages: profile.quota.usedMessages ?? 0,
          limit: profile.quota.limit ?? 0,
        }
      : null,
    manualOverride: profile.manualOverride
      ? {
          enabled: !!profile.manualOverride.enabled,
          mode: profile.manualOverride.mode ?? null,
          source: profile.manualOverride.source ?? null,
          updatedAt: profile.manualOverride.updatedAt ?? null,
        }
      : null,
    entitlements: entitlements ?? null,
    lastSyncedAt: profile.lastSyncedAt ?? null,
    createdAt: profile.createdAt ?? null,
    updatedAt: profile.updatedAt ?? null,
  };
}

/**
 * List active Pro user subscriptions. Defaults to filtering on isPro:true.
 */
async function listSubscriptions({ q, plan, store, manuallyOverridden, sort, page, limit } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;
  const safeSort = ALLOWED_SORTS.has(sort) ? sort : '-updatedAt';

  const subFilter = { isPro: true };
  if (typeof plan === 'string' && plan.length > 0) {
    subFilter.currentPlan = plan;
  }
  if (typeof store === 'string' && store.length > 0) {
    subFilter.store = store;
  }
  if (manuallyOverridden === true || manuallyOverridden === 'true') {
    subFilter['manualOverride.enabled'] = true;
  } else if (manuallyOverridden === false || manuallyOverridden === 'false') {
    subFilter['manualOverride.enabled'] = { $ne: true };
  }

  // If a search query is provided, restrict by matching user emails first.
  if (typeof q === 'string' && q.trim().length > 0) {
    const re = new RegExp(escapeRegex(q.trim()), 'i');
    const matchingUsers = await User.find({ email: re }, { _id: 1 }).lean();
    const ids = matchingUsers.map((u) => u._id);
    if (ids.length === 0) {
      return { items: [], page: safePage, limit: safeLimit, total: 0 };
    }
    subFilter.userId = { $in: ids };
  }

  const [total, profiles] = await Promise.all([
    SubscriptionProfile.countDocuments(subFilter),
    SubscriptionProfile.find(subFilter).sort(safeSort).skip(skip).limit(safeLimit).lean(),
  ]);

  // Hydrate user email/name in a single round trip.
  const userIds = profiles.map((p) => p.userId).filter(Boolean);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }, { email: 1, name: 1 }).lean()
    : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const items = profiles.map((p) => {
    const u = p.userId ? userMap.get(p.userId.toString()) : null;
    return {
      userId: p.userId ? p.userId.toString() : null,
      email: u?.email ?? null,
      name: u?.name ?? null,
      isPro: !!p.isPro,
      currentPlan: p.currentPlan ?? null,
      productId: p.productId ?? null,
      store: p.store ?? null,
      expiresAt: p.expiresAt ?? null,
      manualOverride: p.manualOverride
        ? {
            enabled: !!p.manualOverride.enabled,
            mode: p.manualOverride.mode ?? null,
            source: p.manualOverride.source ?? null,
            updatedAt: p.manualOverride.updatedAt ?? null,
          }
        : null,
      lastSyncedAt: p.lastSyncedAt ?? null,
      updatedAt: p.updatedAt ?? null,
    };
  });

  return { items, page: safePage, limit: safeLimit, total };
}

/**
 * Fetch a single user's subscription profile. Throws { code: 'NO_SUBSCRIPTION' }
 * if the user has no profile.
 */
function assertUserId(userId) {
  if (!isValidObjectId(userId)) {
    const err = new Error('Invalid user id');
    err.code = 'INVALID_USER_ID';
    err.status = 400;
    throw err;
  }
}

async function getSubscriptionForUser(userId) {
  assertUserId(userId);
  const profile = await SubscriptionProfile.findOne({ userId }).lean();
  if (!profile) {
    const err = new Error('No subscription profile for user');
    err.code = 'NO_SUBSCRIPTION';
    throw err;
  }
  return serializeProfile(profile);
}

async function ensureUserExists(userId) {
  assertUserId(userId);
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return user;
}

async function grantPro(userId, { reason: _reason, plan, actorId, actorEmail: _actorEmail } = {}) {
  const user = await ensureUserExists(userId);

  const before = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  const quotaPeriod = getCurrentPeriod();
  const freeMessagesLimit = Number.isFinite(DEFAULT_FREE_MESSAGES_PER_MONTH)
    ? DEFAULT_FREE_MESSAGES_PER_MONTH
    : 3;

  const resolvedPlan = typeof plan === 'string' && plan.length > 0 ? plan : 'god_mode';
  const source = `admin-api:${actorId || 'unknown'}`;

  const entitlementSnapshot = {
    isActive: true,
    productIdentifier: resolvedPlan,
    store: 'manual',
    expiresAt: null,
    purchaseDate: new Date(),
    gracePeriodExpiresAt: null,
    unsubscribeDetectedAt: null,
    billingIssuesDetectedAt: null,
  };

  const after = await SubscriptionProfile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        appUserId: user._id.toString(),
        entitlementId: DEFAULT_ENTITLEMENT_ID,
        isPro: true,
        currentPlan: resolvedPlan,
        productId: resolvedPlan,
        store: 'manual',
        expiresAt: null,
        managementUrl: null,
        entitlements: {
          [DEFAULT_ENTITLEMENT_ID]: entitlementSnapshot,
        },
        quota: {
          period: before?.quota?.period ?? quotaPeriod,
          usedMessages: before?.quota?.usedMessages ?? 0,
          limit: before?.quota?.limit ?? freeMessagesLimit,
        },
        manualOverride: {
          enabled: true,
          mode: 'grant',
          source,
          updatedAt: new Date(),
        },
        lastSyncedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return { before: serializeProfile(before), after: serializeProfile(after) };
}

async function revokePro(userId, { reason: _reason, actorId, actorEmail: _actorEmail } = {}) {
  const user = await ensureUserExists(userId);

  const before = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  const quotaPeriod = getCurrentPeriod();
  const freeMessagesLimit = Number.isFinite(DEFAULT_FREE_MESSAGES_PER_MONTH)
    ? DEFAULT_FREE_MESSAGES_PER_MONTH
    : 3;

  const source = `admin-api:${actorId || 'unknown'}`;

  const after = await SubscriptionProfile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        appUserId: user._id.toString(),
        entitlementId: DEFAULT_ENTITLEMENT_ID,
        isPro: false,
        currentPlan: null,
        productId: null,
        store: null,
        expiresAt: null,
        managementUrl: null,
        entitlements: {
          [DEFAULT_ENTITLEMENT_ID]: {
            isActive: false,
            productIdentifier: null,
            store: null,
            expiresAt: null,
            purchaseDate: null,
            gracePeriodExpiresAt: null,
            unsubscribeDetectedAt: null,
            billingIssuesDetectedAt: null,
          },
        },
        quota: {
          period: before?.quota?.period ?? quotaPeriod,
          usedMessages: before?.quota?.usedMessages ?? 0,
          limit: before?.quota?.limit ?? freeMessagesLimit,
        },
        manualOverride: {
          enabled: true,
          mode: 'revoke',
          source,
          updatedAt: new Date(),
        },
        lastSyncedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return { before: serializeProfile(before), after: serializeProfile(after) };
}

/**
 * Clear the manual override on a user's subscription. Does NOT change `isPro`
 * or any other field; only flips `manualOverride.enabled` to false and
 * `manualOverride.mode` to null. The natural RevenueCat sync may then take
 * over on the next refresh.
 */
async function clearOverride(userId, { reason: _reason, actorId: _actorId } = {}) {
  const user = await ensureUserExists(userId);

  const before = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  if (!before) {
    const err = new Error('No subscription profile for user');
    err.code = 'NO_SUBSCRIPTION';
    throw err;
  }

  await SubscriptionProfile.updateOne(
    { userId: user._id },
    {
      $set: {
        manualOverride: {
          enabled: false,
          mode: null,
          source: null,
          updatedAt: new Date(),
        },
      },
    },
  );

  const after = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  return { before: serializeProfile(before), after: serializeProfile(after) };
}

async function refreshFromRevenueCat(userId) {
  const user = await ensureUserExists(userId);

  const before = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  const refreshed = await getSubscriptionProfile({
    userId: user._id,
    appUserId: user._id.toString(),
    forceRefresh: true,
  });
  const after = await SubscriptionProfile.findOne({ userId: user._id }).lean();

  return {
    before: serializeProfile(before),
    after: serializeProfile(after),
    profile: refreshed ?? serializeProfile(after),
  };
}

module.exports = {
  listSubscriptions,
  getSubscriptionForUser,
  grantPro,
  revokePro,
  clearOverride,
  refreshFromRevenueCat,
  // exported for tests / route layer
  snapshotProfile,
  serializeProfile,
  isValidObjectId,
  ALLOWED_SORTS,
};
