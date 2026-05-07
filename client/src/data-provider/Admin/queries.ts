import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import { adminService } from 'librechat-data-provider';
import type t from 'librechat-data-provider';

/**
 * Query keys for the admin dashboard. The first segment is always the
 * `AdminQueryKeys.admin` namespace so cache invalidation can target the entire
 * subtree.
 */
export enum AdminQueryKeys {
  admin = 'admin',
  overview = 'overview',
  users = 'users',
  user = 'user',
  subscriptions = 'subscriptions',
  subscription = 'subscription',
  balance = 'balance',
  usage = 'usage',
  transactions = 'transactions',
  orgUsage = 'orgUsage',
  conversations = 'conversations',
  conversation = 'conversation',
  messages = 'messages',
  message = 'message',
  audit = 'audit',
  auditEntry = 'auditEntry',
  auditActions = 'auditActions',
}

/* ---------- Overview ---------- */

export const useAdminOverview = (
  config?: UseQueryOptions<t.AdminOverview>,
): QueryObserverResult<t.AdminOverview> =>
  useQuery<t.AdminOverview>(
    [AdminQueryKeys.admin, AdminQueryKeys.overview],
    () => adminService.getAdminOverview(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: false,
      ...config,
    },
  );

/* ---------- Users ---------- */

export const useAdminUsers = (
  filters: t.AdminUserListParams = {},
  config?: UseQueryOptions<t.AdminUserListResponse>,
): QueryObserverResult<t.AdminUserListResponse> =>
  useQuery<t.AdminUserListResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.users, filters],
    () => adminService.listAdminUsers(filters),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminUser = (
  id: string,
  config?: UseQueryOptions<t.AdminUserDetail>,
): QueryObserverResult<t.AdminUserDetail> =>
  useQuery<t.AdminUserDetail>(
    [AdminQueryKeys.admin, AdminQueryKeys.user, id],
    () => adminService.getAdminUser(id),
    {
      enabled: !!id,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/* ---------- Subscriptions ---------- */

export const useAdminSubscriptions = (
  filters: t.AdminSubscriptionListParams = {},
  config?: UseQueryOptions<t.AdminSubscriptionListResponse>,
): QueryObserverResult<t.AdminSubscriptionListResponse> =>
  useQuery<t.AdminSubscriptionListResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.subscriptions, filters],
    () => adminService.listAdminSubscriptions(filters),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminSubscription = (
  userId: string,
  config?: UseQueryOptions<t.AdminSubscription>,
): QueryObserverResult<t.AdminSubscription> =>
  useQuery<t.AdminSubscription>(
    [AdminQueryKeys.admin, AdminQueryKeys.subscription, userId],
    () => adminService.getAdminSubscription(userId),
    {
      enabled: !!userId,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/* ---------- Balance ---------- */

export const useAdminBalance = (
  userId: string,
  config?: UseQueryOptions<t.AdminBalance>,
): QueryObserverResult<t.AdminBalance> =>
  useQuery<t.AdminBalance>(
    [AdminQueryKeys.admin, AdminQueryKeys.balance, userId],
    () => adminService.getAdminBalance(userId),
    {
      enabled: !!userId,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/* ---------- Usage ---------- */

export const useAdminUsage = (
  userId: string,
  params: t.AdminUserUsageParams = {},
  config?: UseQueryOptions<t.AdminUserUsageResponse>,
): QueryObserverResult<t.AdminUserUsageResponse> =>
  useQuery<t.AdminUserUsageResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.usage, userId, params],
    () => adminService.getAdminUserUsage(userId, params),
    {
      enabled: !!userId,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminTransactions = (
  params: t.AdminTransactionsParams = {},
  config?: UseQueryOptions<t.AdminTransactionsResponse>,
): QueryObserverResult<t.AdminTransactionsResponse> =>
  useQuery<t.AdminTransactionsResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.transactions, params],
    () => adminService.listAdminTransactions(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminUsageOverview = (
  config?: UseQueryOptions<t.AdminOrgUsageOverview>,
): QueryObserverResult<t.AdminOrgUsageOverview> =>
  useQuery<t.AdminOrgUsageOverview>(
    [AdminQueryKeys.admin, AdminQueryKeys.orgUsage, 'overview'],
    () => adminService.getAdminUsageOverview(),
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminOrgUsage = (
  range: t.AdminOrgUsageRange = '30d',
  config?: UseQueryOptions<t.AdminOrgUsageResponse>,
): QueryObserverResult<t.AdminOrgUsageResponse> =>
  useQuery<t.AdminOrgUsageResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.orgUsage, range],
    () => adminService.getAdminOrgUsage(range),
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/* ---------- Messages / Conversations ---------- */

export const useAdminConversations = (
  userId: string,
  params: t.AdminConversationsParams = {},
  config?: UseQueryOptions<t.AdminConversationsResponse>,
): QueryObserverResult<t.AdminConversationsResponse> =>
  useQuery<t.AdminConversationsResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.conversations, userId, params],
    () => adminService.listAdminConversations(userId, params),
    {
      enabled: !!userId,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminConversation = (
  userId: string,
  conversationId: string,
  config?: UseQueryOptions<t.AdminConversationDetail>,
): QueryObserverResult<t.AdminConversationDetail> =>
  useQuery<t.AdminConversationDetail>(
    [AdminQueryKeys.admin, AdminQueryKeys.conversation, userId, conversationId],
    () => adminService.getAdminConversation(userId, conversationId),
    {
      enabled: !!userId && !!conversationId,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminMessages = (
  userId: string,
  conversationId: string,
  params: t.AdminMessagesParams = {},
  config?: UseQueryOptions<t.AdminMessagesResponse>,
): QueryObserverResult<t.AdminMessagesResponse> =>
  useQuery<t.AdminMessagesResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.messages, userId, conversationId, params],
    () => adminService.listAdminMessages(userId, conversationId, params),
    {
      enabled: !!userId && !!conversationId,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminMessage = (
  messageId: string,
  config?: UseQueryOptions<t.AdminMessageItem>,
): QueryObserverResult<t.AdminMessageItem> =>
  useQuery<t.AdminMessageItem>(
    [AdminQueryKeys.admin, AdminQueryKeys.message, messageId],
    () => adminService.getAdminMessage(messageId),
    {
      enabled: !!messageId,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/* ---------- Audit ---------- */

export const useAdminAuditLog = (
  params: t.AdminAuditListParams = {},
  config?: UseQueryOptions<t.AdminAuditListResponse>,
): QueryObserverResult<t.AdminAuditListResponse> =>
  useQuery<t.AdminAuditListResponse>(
    [AdminQueryKeys.admin, AdminQueryKeys.audit, params],
    () => adminService.listAdminAudit(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminAuditActions = (
  config?: UseQueryOptions<t.AdminAuditAction[]>,
): QueryObserverResult<t.AdminAuditAction[]> =>
  useQuery<t.AdminAuditAction[]>(
    [AdminQueryKeys.admin, AdminQueryKeys.auditActions],
    () => adminService.listAdminAuditActions(),
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

export const useAdminAuditEntry = (
  id: string,
  config?: UseQueryOptions<t.AdminAuditEntry>,
): QueryObserverResult<t.AdminAuditEntry> =>
  useQuery<t.AdminAuditEntry>(
    [AdminQueryKeys.admin, AdminQueryKeys.auditEntry, id],
    () => adminService.getAdminAuditEntry(id),
    {
      enabled: !!id,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );
