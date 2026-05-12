/**
 * Type contracts for the admin dashboard API surface.
 * Routes are mounted at /api/admin/*. All responses are JSON.
 *
 * Failure responses follow the shape `{ message: string, code?: string }`.
 */

/* ---------- Common ---------- */

export type AdminPaginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export type AdminErrorResponse = {
  message: string;
  code?: string;
};

/* ---------- Overview ---------- */

export type AdminOverview = {
  users: {
    total: number;
    newLast7d: number;
    newLast30d: number;
  };
  subscriptions: {
    activePro: number;
    manuallyOverridden: number;
  };
  messages: {
    total30d: number;
    totalAll: number;
  };
  tokens: {
    total30d: number;
  };
  audit: {
    total30d: number;
    failures30d: number;
  };
};

/* ---------- Subscription / Balance shared shapes ---------- */

export type AdminManualOverride = {
  enabled: boolean;
  mode: string | null;
  source: string | null;
  updatedAt: string | null;
};

export type AdminSubscriptionQuota = {
  period: string | null;
  usedMessages: number;
  limit: number;
};

/** Detail shape used in `getUserDetail` and `getSubscriptionForUser`. */
export type AdminSubscription = {
  userId?: string | null;
  appUserId?: string | null;
  entitlementId?: string | null;
  isPro: boolean;
  currentPlan: string | null;
  productId: string | null;
  store: string | null;
  expiresAt: string | null;
  managementUrl?: string | null;
  quota?: AdminSubscriptionQuota | null;
  manualOverride: AdminManualOverride | null;
  entitlements?: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AdminAutoRefill = {
  enabled: boolean;
  intervalValue: number;
  intervalUnit: string;
  amount: number;
  lastRefill: string | null;
};

export type AdminBalance = {
  tokenCredits: number;
  autoRefill: AdminAutoRefill;
};

/* ---------- Users ---------- */

export type AdminUserListItem = {
  _id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  avatar?: string | null;
  provider?: string | null;
  role?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  banned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Allow extra fields that the backend's lean query may pass through. */
  [key: string]: unknown;
};

export type AdminUserListParams = {
  q?: string;
  role?: string;
  provider?: string;
  banned?: boolean | 'true' | 'false';
  createdAfter?: string;
  createdBefore?: string;
  sort?: 'email' | '-email' | 'createdAt' | '-createdAt' | 'name' | '-name';
  page?: number;
  limit?: number;
};

export type AdminUserListResponse = AdminPaginated<AdminUserListItem>;

export type AdminUserDetail = {
  user: AdminUserListItem;
  subscription: AdminSubscription | null;
  balance: AdminBalance | null;
};

export type AdminBanUserRequest = {
  reason: string;
};

export type AdminUnbanUserRequest = {
  reason?: string;
};

export type AdminBanUserResponse = {
  user: AdminUserListItem;
};

export type AdminChangeUserRoleRequest = {
  role: string;
  reason: string;
};

export type AdminChangeUserRoleResponse = {
  user: AdminUserListItem;
};

export type AdminResetPasswordRequest = {
  reason?: string;
};

export type AdminResetPasswordResponse = {
  ok: true;
};

export type AdminInviteUserRequest = {
  email: string;
  name?: string;
  reason?: string;
};

export type AdminInviteUserResponse = {
  ok: true;
  email: string;
};

export type AdminDeleteUserRequest = {
  confirmEmail: string;
  reason: string;
};

export type AdminDeleteUserResponse = {
  ok?: boolean;
  email?: string;
  [key: string]: unknown;
};

/* ---------- Impersonation ---------- */

export type AdminImpersonateRequest = {
  reason: string;
};

export type AdminImpersonateResponse = {
  url: string;
  expiresAt: number;
  targetEmail: string | null;
};

export type AdminImpersonateConsumeRequest = {
  token: string;
};

export type AdminImpersonateConsumeResponse = {
  token: string;
  user: AdminUserListItem;
};

/* ---------- Subscriptions list ---------- */

export type AdminSubscriptionListItem = {
  userId: string | null;
  email: string | null;
  name: string | null;
  isPro: boolean;
  currentPlan: string | null;
  productId: string | null;
  store: string | null;
  expiresAt: string | null;
  manualOverride: AdminManualOverride | null;
  lastSyncedAt: string | null;
  updatedAt: string | null;
};

export type AdminSubscriptionListParams = {
  q?: string;
  plan?: string;
  store?: string;
  manuallyOverridden?: boolean | 'true' | 'false';
  sort?: string;
  page?: number;
  limit?: number;
};

export type AdminSubscriptionListResponse = AdminPaginated<AdminSubscriptionListItem>;

export type AdminGrantProRequest = {
  reason: string;
  plan?: string;
};

export type AdminRevokeProRequest = {
  reason: string;
};

export type AdminClearOverrideRequest = {
  reason?: string;
};

/* ---------- Balance mutations ---------- */

export type AdminAdjustBalanceRequest = {
  delta: number;
  reason: string;
};

export type AdminSetBalanceRequest = {
  tokenCredits: number;
  reason: string;
};

export type AdminBalanceMutationResponse = {
  tokenCredits: number;
  before?: number;
};

/* ---------- Usage ---------- */

export type AdminUsageRange = '7d' | '30d' | '90d';
export type AdminUsageGranularity = 'day' | 'week';
export type AdminOrgUsageRange = '30d' | '90d';

export type AdminUsageBucket = {
  date: string;
  prompt: number;
  completion: number;
  totalTokens: number;
};

export type AdminUsageByModel = {
  model: string;
  prompt: number;
  completion: number;
  totalTokens: number;
};

export type AdminUsageTotals = {
  prompt: number;
  completion: number;
};

export type AdminUserUsageParams = {
  range?: AdminUsageRange;
  granularity?: AdminUsageGranularity;
};

export type AdminUserUsageResponse = {
  rangeStart: string;
  rangeEnd: string;
  granularity: AdminUsageGranularity;
  byDay: AdminUsageBucket[];
  byModel: AdminUsageByModel[];
  totals: AdminUsageTotals;
};

export type AdminTransactionItem = {
  _id: string;
  user?: string;
  userEmail?: string | null;
  userName?: string | null;
  conversationId?: string | null;
  tokenType?: string | null;
  model?: string | null;
  context?: string | null;
  rate?: number | null;
  rawAmount?: number | null;
  tokenValue?: number | null;
  inputTokens?: number | null;
  writeTokens?: number | null;
  readTokens?: number | null;
  createdAt?: string;
  [key: string]: unknown;
};

export type AdminTransactionsParams = {
  userId?: string;
  from?: string;
  to?: string;
  tokenType?: string;
  model?: string;
  page?: number;
  limit?: number;
};

export type AdminTransactionsResponse = AdminPaginated<AdminTransactionItem>;

export type AdminOrgUsageOverview = {
  totalUsers: number;
  activeUsers30d: number;
  activeProUsers: number;
  messages30d: number;
  tokens30d: number;
  dauTimeseries: Array<{ date: string; count: number }>;
  messagesByDay: Array<{ date: string; count: number }>;
};

export type AdminOrgUsageResponse = {
  rangeStart: string;
  rangeEnd: string;
  granularity: 'day';
  byDay: AdminUsageBucket[];
  byModel: AdminUsageByModel[];
  totals: AdminUsageTotals;
};

/* ---------- Messages ---------- */

export type AdminConversationListItem = {
  conversationId: string;
  title: string;
  messageCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastMessageAt: string | Date | null;
};

export type AdminConversationsParams = {
  page?: number;
  limit?: number;
};

export type AdminConversationsResponse = AdminPaginated<AdminConversationListItem>;

export type AdminConversationDetail = {
  conversationId: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  messageCount: number;
  firstMessageAt: string | Date | null;
  lastMessageAt: string | Date | null;
};

export type AdminMessageItem = {
  _id?: string;
  messageId?: string;
  conversationId?: string;
  parentMessageId?: string | null;
  user?: string;
  sender?: string | null;
  isCreatedByUser?: boolean;
  text?: string;
  model?: string | null;
  tokenCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type AdminMessagesParams = {
  page?: number;
  limit?: number;
  includeContent?: boolean;
};

export type AdminMessagesResponse = AdminPaginated<AdminMessageItem> & {
  includeContent: boolean;
};

/* ---------- Audit ---------- */

export type AdminAuditEntry = {
  _id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorIp?: string | null;
  userAgent?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  status?: 'success' | 'failure' | string;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt?: string;
  [key: string]: unknown;
};

export type AdminAuditListParams = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  status?: 'success' | 'failure';
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

export type AdminAuditListResponse = AdminPaginated<AdminAuditEntry>;

export type AdminAuditAction = {
  action: string;
  count: number;
};
