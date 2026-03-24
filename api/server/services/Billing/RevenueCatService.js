const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { SubscriptionProfile } = require('~/db/models');

const DEFAULT_ENTITLEMENT_ID = 'codecan_ai_pro';
const DEFAULT_FREE_MESSAGES_PER_MONTH = 3;
const DEFAULT_RESET_POLICY = 'calendar_month';
const DEFAULT_API_BASE_URL = 'https://api.revenuecat.com/v1';

const toPositiveInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCurrentQuotaPeriod = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getRevenueCatConfig = () => {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim() ?? '';
  const webhookAuth = process.env.REVENUECAT_WEBHOOK_AUTH?.trim() ?? '';
  const webPurchaseLinkUrl = process.env.REVENUECAT_WEB_PURCHASE_LINK_URL?.trim() ?? '';
  const publicSdkKeyIOS =
    process.env.REVENUECAT_PUBLIC_SDK_KEY_IOS?.trim() ||
    process.env.REVENUECAT_APPLE_PUBLIC_SDK_KEY?.trim() ||
    '';
  const publicSdkKeyAndroid =
    process.env.REVENUECAT_PUBLIC_SDK_KEY_ANDROID?.trim() ||
    process.env.REVENUECAT_GOOGLE_PUBLIC_SDK_KEY?.trim() ||
    '';

  return {
    apiBaseUrl: process.env.REVENUECAT_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
    secretApiKey,
    webhookAuth,
    webPurchaseLinkUrl,
    publicSdkKeys: {
      ios: publicSdkKeyIOS,
      android: publicSdkKeyAndroid,
    },
    entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || DEFAULT_ENTITLEMENT_ID,
    freeMessagesPerMonth: toPositiveInteger(
      process.env.REVENUECAT_FREE_MESSAGES_PER_MONTH,
      DEFAULT_FREE_MESSAGES_PER_MONTH,
    ),
    resetPolicy: DEFAULT_RESET_POLICY,
  };
};

const getSubscriptionPublicConfig = () => {
  const config = getRevenueCatConfig();
  const publicSdkKeys = Object.fromEntries(
    Object.entries(config.publicSdkKeys).filter(([, value]) => Boolean(value)),
  );

  return {
    enabled: Boolean(config.secretApiKey),
    entitlementId: config.entitlementId,
    freeMessagesPerMonth: config.freeMessagesPerMonth,
    resetPolicy: config.resetPolicy,
    webCheckoutEnabled: Boolean(config.webPurchaseLinkUrl),
    publicSdkKeys,
  };
};

const createDisabledState = ({ userId = null, appUserId = null } = {}) => {
  const config = getRevenueCatConfig();
  const period = getCurrentQuotaPeriod();

  return {
    enabled: false,
    userId,
    appUserId,
    entitlementId: config.entitlementId,
    isPro: false,
    currentPlan: null,
    productId: null,
    store: null,
    expiresAt: null,
    managementUrl: null,
    lastSyncedAt: null,
    freeMessagesLimit: config.freeMessagesPerMonth,
    freeMessagesUsed: 0,
    freeMessagesRemaining: config.freeMessagesPerMonth,
    period,
    webCheckoutEnabled: Boolean(config.webPurchaseLinkUrl),
  };
};

const derivePlan = (productId, expiresAt) => {
  if (!productId) {
    return expiresAt == null ? 'lifetime' : null;
  }

  const normalized = productId.toLowerCase();
  if (normalized.includes('lifetime')) {
    return 'lifetime';
  }
  if (normalized.includes('year') || normalized.includes('annual')) {
    return 'yearly';
  }
  if (normalized.includes('month')) {
    return 'monthly';
  }

  return productId;
};

const normalizeQuota = (quota) => {
  const config = getRevenueCatConfig();
  const currentPeriod = getCurrentQuotaPeriod();

  if (!quota || quota.period !== currentPeriod) {
    return {
      period: currentPeriod,
      usedMessages: 0,
      limit: config.freeMessagesPerMonth,
    };
  }

  return {
    period: currentPeriod,
    usedMessages: Math.max(0, quota.usedMessages ?? 0),
    limit: config.freeMessagesPerMonth,
  };
};

const buildManualEntitlementSnapshot = ({
  existingEntitlement,
  isActive,
  productIdentifier,
  store = 'manual',
}) => ({
  ...(existingEntitlement ?? {}),
  isActive,
  productIdentifier: isActive ? productIdentifier : null,
  store: isActive ? store : null,
  expiresAt: null,
  gracePeriodExpiresAt: null,
  unsubscribeDetectedAt: null,
  billingIssuesDetectedAt: null,
});

const applyManualOverride = ({ normalized, existingProfile, entitlementId }) => {
  const manualOverride = existingProfile?.manualOverride;

  if (!manualOverride?.enabled) {
    return normalized;
  }

  const existingEntitlements =
    existingProfile?.entitlements instanceof Map
      ? Object.fromEntries(existingProfile.entitlements)
      : (existingProfile?.entitlements ?? {});

  if (manualOverride.mode === 'grant') {
    return {
      ...normalized,
      isPro: true,
      currentPlan: existingProfile?.currentPlan ?? 'god_mode',
      productId: existingProfile?.productId ?? 'god_mode',
      store: existingProfile?.store ?? 'manual',
      expiresAt: existingProfile?.expiresAt ?? null,
      managementUrl: existingProfile?.managementUrl ?? normalized.managementUrl ?? null,
      entitlements: {
        ...normalized.entitlements,
        ...existingEntitlements,
        [entitlementId]: buildManualEntitlementSnapshot({
          existingEntitlement: existingEntitlements[entitlementId],
          isActive: true,
          productIdentifier: existingProfile?.productId ?? 'god_mode',
          store: existingProfile?.store ?? 'manual',
        }),
      },
      manualOverride,
    };
  }

  if (manualOverride.mode === 'revoke') {
    return {
      ...normalized,
      isPro: false,
      currentPlan: null,
      productId: null,
      store: null,
      expiresAt: null,
      entitlements: {
        ...normalized.entitlements,
        ...existingEntitlements,
        [entitlementId]: buildManualEntitlementSnapshot({
          existingEntitlement: existingEntitlements[entitlementId],
          isActive: false,
          productIdentifier: null,
        }),
      },
      manualOverride,
    };
  }

  return {
    ...normalized,
    manualOverride,
  };
};

const serializeProfile = (profile) => {
  if (!profile) {
    return createDisabledState();
  }

  const config = getRevenueCatConfig();
  const quota = normalizeQuota(profile.quota);
  const freeMessagesRemaining = Math.max(0, quota.limit - quota.usedMessages);

  return {
    enabled: true,
    userId: profile.userId?.toString?.() ?? profile.userId ?? null,
    appUserId: profile.appUserId,
    entitlementId: profile.entitlementId || config.entitlementId,
    isPro: Boolean(profile.isPro),
    currentPlan: profile.currentPlan ?? null,
    productId: profile.productId ?? null,
    store: profile.store ?? null,
    expiresAt: profile.expiresAt ?? null,
    managementUrl: profile.managementUrl ?? null,
    lastSyncedAt: profile.lastSyncedAt ?? null,
    freeMessagesLimit: quota.limit,
    freeMessagesUsed: quota.usedMessages,
    freeMessagesRemaining,
    period: quota.period,
    webCheckoutEnabled: Boolean(config.webPurchaseLinkUrl),
  };
};

const getRequestHeaders = () => {
  const { secretApiKey } = getRevenueCatConfig();

  if (!secretApiKey) {
    throw new Error('RevenueCat secret API key is not configured.');
  }

  return {
    Authorization: `Bearer ${secretApiKey}`,
    'Content-Type': 'application/json',
  };
};

const getSubscriberEndpoint = (appUserId) =>
  `${getRevenueCatConfig().apiBaseUrl}/subscribers/${encodeURIComponent(appUserId)}`;

const fetchSubscriber = async (appUserId) => {
  const response = await axios.get(getSubscriberEndpoint(appUserId), {
    headers: getRequestHeaders(),
  });

  return response?.data?.subscriber ?? null;
};

const buildEntitlementSnapshot = ({ subscriber, entitlement }) => {
  const productIdentifier = entitlement?.product_identifier ?? null;
  const subscription = productIdentifier ? subscriber?.subscriptions?.[productIdentifier] : null;
  const expiresAt = toDateOrNull(entitlement?.expires_date ?? subscription?.expires_date);

  return {
    isActive: Boolean(entitlement) && (expiresAt == null || expiresAt > new Date()),
    productIdentifier,
    store: entitlement?.store ?? subscription?.store ?? null,
    expiresAt,
    purchaseDate: toDateOrNull(entitlement?.purchase_date ?? subscription?.purchase_date),
    gracePeriodExpiresAt: toDateOrNull(subscription?.grace_period_expires_date),
    unsubscribeDetectedAt: toDateOrNull(subscription?.unsubscribe_detected_at),
    billingIssuesDetectedAt: toDateOrNull(subscription?.billing_issues_detected_at),
  };
};

const normalizeSubscriberData = ({ userId, appUserId, subscriber, existingProfile }) => {
  const config = getRevenueCatConfig();
  const entitlementEntries = Object.entries(subscriber?.entitlements ?? {});
  const entitlements = entitlementEntries.reduce((acc, [entitlementKey, entitlement]) => {
    acc[entitlementKey] = buildEntitlementSnapshot({
      subscriber,
      entitlement,
    });
    return acc;
  }, {});

  const primaryEntitlement = entitlements[config.entitlementId] ?? {
    isActive: false,
    productIdentifier: null,
    store: null,
    expiresAt: null,
    purchaseDate: null,
    gracePeriodExpiresAt: null,
    unsubscribeDetectedAt: null,
    billingIssuesDetectedAt: null,
  };

  const normalized = {
    userId,
    appUserId,
    entitlementId: config.entitlementId,
    isPro: Boolean(primaryEntitlement.isActive),
    currentPlan: primaryEntitlement.isActive
      ? derivePlan(primaryEntitlement.productIdentifier, primaryEntitlement.expiresAt)
      : null,
    productId: primaryEntitlement.productIdentifier ?? null,
    store: primaryEntitlement.store ?? null,
    expiresAt: primaryEntitlement.expiresAt ?? null,
    managementUrl: subscriber?.management_url ?? null,
    entitlements,
    quota: normalizeQuota(existingProfile?.quota),
    manualOverride: existingProfile?.manualOverride ?? {
      enabled: false,
      mode: null,
      source: null,
      updatedAt: null,
    },
    lastSyncedAt: new Date(),
  };

  return applyManualOverride({
    normalized,
    existingProfile,
    entitlementId: config.entitlementId,
  });
};

const saveSubscriptionProfile = async ({ userId, appUserId, subscriber }) => {
  const existingProfile = await SubscriptionProfile.findOne({ userId }).lean();
  const normalized = normalizeSubscriberData({
    userId,
    appUserId,
    subscriber,
    existingProfile,
  });

  const profile = await SubscriptionProfile.findOneAndUpdate(
    { userId },
    { $set: normalized },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return profile;
};

const getSubscriptionProfile = async ({ userId, forceRefresh = false, appUserId }) => {
  const config = getRevenueCatConfig();
  const resolvedAppUserId = appUserId ?? String(userId ?? '');

  if (!config.secretApiKey) {
    return createDisabledState({
      userId,
      appUserId: resolvedAppUserId,
    });
  }

  const cachedProfile = await SubscriptionProfile.findOne({ userId }).lean();
  if (!forceRefresh && cachedProfile) {
    return serializeProfile(cachedProfile);
  }

  try {
    const subscriber = await fetchSubscriber(resolvedAppUserId);
    const profile = await saveSubscriptionProfile({
      userId,
      appUserId: resolvedAppUserId,
      subscriber,
    });

    return serializeProfile(profile);
  } catch (error) {
    logger.error('[RevenueCatService] Failed to sync subscriber profile', error);
    if (cachedProfile) {
      return serializeProfile(cachedProfile);
    }

    return createDisabledState({
      userId,
      appUserId: resolvedAppUserId,
    });
  }
};

const buildHostedCheckoutUrl = ({ appUserId, email }) => {
  const { webPurchaseLinkUrl } = getRevenueCatConfig();

  if (!webPurchaseLinkUrl) {
    return null;
  }

  let resolvedUrl = webPurchaseLinkUrl;
  const encodedAppUserId = encodeURIComponent(appUserId);

  if (resolvedUrl.includes('{{APP_USER_ID}}')) {
    resolvedUrl = resolvedUrl.replaceAll('{{APP_USER_ID}}', encodedAppUserId);
  } else if (resolvedUrl.includes('{APP_USER_ID}')) {
    resolvedUrl = resolvedUrl.replaceAll('{APP_USER_ID}', encodedAppUserId);
  }

  const url = new URL(resolvedUrl);
  if (!url.searchParams.has('app_user_id')) {
    url.searchParams.set('app_user_id', appUserId);
  }
  if (email && !url.searchParams.has('email')) {
    url.searchParams.set('email', email);
  }

  return url.toString();
};

const getCheckoutLinkForUser = async (user) => {
  const profile = await getSubscriptionProfile({
    userId: user.id,
    appUserId: String(user.id),
  });

  const url = buildHostedCheckoutUrl({
    appUserId: String(user.id),
    email: user.email,
  });

  return {
    ...profile,
    checkoutUrl: url,
  };
};

const verifyWebhookAuthorization = (authorizationHeader) => {
  const { webhookAuth } = getRevenueCatConfig();

  if (!webhookAuth) {
    return false;
  }

  if (!authorizationHeader) {
    return false;
  }

  const trimmed = authorizationHeader.trim();
  return trimmed === webhookAuth || trimmed === `Bearer ${webhookAuth}`;
};

const handleWebhookEvent = async (payload) => {
  const config = getRevenueCatConfig();
  if (!config.secretApiKey) {
    return {
      ok: false,
      reason: 'not_configured',
    };
  }

  const event = payload?.event ?? payload;
  const appUserIds = [
    event?.app_user_id,
    event?.original_app_user_id,
    ...(Array.isArray(event?.aliases) ? event.aliases : []),
  ].filter(Boolean);

  if (appUserIds.length === 0) {
    return {
      ok: false,
      reason: 'missing_app_user_id',
    };
  }

  const profile = await SubscriptionProfile.findOne({
    appUserId: { $in: appUserIds },
  }).lean();

  if (!profile) {
    return {
      ok: true,
      reason: 'profile_not_found',
      appUserIds,
    };
  }

  const syncedProfile = await getSubscriptionProfile({
    userId: profile.userId,
    appUserId: profile.appUserId,
    forceRefresh: true,
  });

  return {
    ok: true,
    reason: 'synced',
    appUserIds,
    profile: syncedProfile,
  };
};

module.exports = {
  getRevenueCatConfig,
  getSubscriptionPublicConfig,
  getSubscriptionProfile,
  getCheckoutLinkForUser,
  verifyWebhookAuthorization,
  handleWebhookEvent,
};
