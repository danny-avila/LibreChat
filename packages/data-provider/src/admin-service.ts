/**
 * Admin dashboard data service. One function per admin endpoint.
 *
 * The bearer (session) token is set globally via `setTokenHeader` and is
 * sent on every axios call automatically.
 */

import axios, { AxiosRequestConfig } from 'axios';
import * as endpoints from './api-endpoints';
import request from './request';
import type * as t from './types/admin';

/** POST that supports custom headers. */
async function postWithConfig<T>(
  url: string,
  data: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const merged: AxiosRequestConfig = {
    ...(config ?? {}),
    headers: {
      'Content-Type': 'application/json',
      ...(config?.headers ?? {}),
    },
  };
  const res = await axios.post<T>(url, JSON.stringify(data ?? {}), merged);
  return res.data;
}

async function patchWithConfig<T>(
  url: string,
  data: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const merged: AxiosRequestConfig = {
    ...(config ?? {}),
    headers: {
      'Content-Type': 'application/json',
      ...(config?.headers ?? {}),
    },
  };
  const res = await axios.patch<T>(url, JSON.stringify(data ?? {}), merged);
  return res.data;
}

async function deleteWithConfig<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const merged: AxiosRequestConfig = {
    ...(config ?? {}),
    headers: {
      'Content-Type': 'application/json',
      ...(config?.headers ?? {}),
    },
    data: data !== undefined ? JSON.stringify(data) : undefined,
  };
  const res = await axios.delete<T>(url, merged);
  return res.data;
}

/* ---------- Overview ---------- */

export function getAdminOverview(): Promise<t.AdminOverview> {
  return request.get<t.AdminOverview>(endpoints.adminOverview());
}

/* ---------- Users ---------- */

export function listAdminUsers(
  params: t.AdminUserListParams = {},
): Promise<t.AdminUserListResponse> {
  return request.get<t.AdminUserListResponse>(
    endpoints.adminUsers(params as Record<string, unknown>),
  );
}

export function getAdminUser(id: string): Promise<t.AdminUserDetail> {
  return request.get<t.AdminUserDetail>(endpoints.adminUserDetail(id));
}

export function banAdminUser(
  id: string,
  payload: t.AdminBanUserRequest,
): Promise<t.AdminBanUserResponse> {
  return postWithConfig<t.AdminBanUserResponse>(endpoints.adminUserBan(id), payload);
}

export function unbanAdminUser(
  id: string,
  payload: t.AdminUnbanUserRequest = {},
): Promise<t.AdminBanUserResponse> {
  return postWithConfig<t.AdminBanUserResponse>(endpoints.adminUserUnban(id), payload);
}

export function changeAdminUserRole(
  id: string,
  payload: t.AdminChangeUserRoleRequest,
): Promise<t.AdminChangeUserRoleResponse> {
  return patchWithConfig<t.AdminChangeUserRoleResponse>(endpoints.adminUserRole(id), payload);
}

export function resetAdminUserPassword(
  id: string,
  payload: t.AdminResetPasswordRequest = {},
): Promise<t.AdminResetPasswordResponse> {
  return postWithConfig<t.AdminResetPasswordResponse>(
    endpoints.adminUserResetPassword(id),
    payload,
  );
}

export function inviteAdminUser(
  payload: t.AdminInviteUserRequest,
): Promise<t.AdminInviteUserResponse> {
  return request.post(endpoints.adminUsersInvite(), payload) as Promise<t.AdminInviteUserResponse>;
}

export function deleteAdminUser(
  id: string,
  payload: t.AdminDeleteUserRequest,
): Promise<t.AdminDeleteUserResponse> {
  return deleteWithConfig<t.AdminDeleteUserResponse>(endpoints.adminUserDelete(id), payload);
}

export function impersonateAdminUser(
  id: string,
  payload: t.AdminImpersonateRequest,
): Promise<t.AdminImpersonateResponse> {
  return postWithConfig<t.AdminImpersonateResponse>(endpoints.adminUserImpersonate(id), payload);
}

export function consumeImpersonationToken(
  payload: t.AdminImpersonateConsumeRequest,
): Promise<t.AdminImpersonateConsumeResponse> {
  // No fresh-auth header — the body token IS the auth.
  return request.post(
    endpoints.authImpersonateConsume(),
    payload,
  ) as Promise<t.AdminImpersonateConsumeResponse>;
}

/* ---------- Subscriptions ---------- */

export function listAdminSubscriptions(
  params: t.AdminSubscriptionListParams = {},
): Promise<t.AdminSubscriptionListResponse> {
  return request.get<t.AdminSubscriptionListResponse>(
    endpoints.adminSubscriptionList(params as Record<string, unknown>),
  );
}

export function getAdminSubscription(userId: string): Promise<t.AdminSubscription> {
  return request.get<t.AdminSubscription>(endpoints.adminSubscriptionForUser(userId));
}

export function grantAdminPro(
  userId: string,
  payload: t.AdminGrantProRequest,
): Promise<t.AdminSubscription> {
  return postWithConfig<t.AdminSubscription>(endpoints.adminSubscriptionGrant(userId), payload);
}

export function revokeAdminPro(
  userId: string,
  payload: t.AdminRevokeProRequest,
): Promise<t.AdminSubscription> {
  return postWithConfig<t.AdminSubscription>(endpoints.adminSubscriptionRevoke(userId), payload);
}

export function clearAdminSubscriptionOverride(
  userId: string,
  payload: t.AdminClearOverrideRequest = {},
): Promise<t.AdminSubscription> {
  return request.post(
    endpoints.adminSubscriptionClearOverride(userId),
    payload,
  ) as Promise<t.AdminSubscription>;
}

export function refreshAdminSubscription(userId: string): Promise<t.AdminSubscription> {
  return request.post(
    endpoints.adminSubscriptionRefresh(userId),
    {},
  ) as Promise<t.AdminSubscription>;
}

/* ---------- Balance ---------- */

export function getAdminBalance(userId: string): Promise<t.AdminBalance> {
  return request.get<t.AdminBalance>(endpoints.adminBalanceForUser(userId));
}

export function adjustAdminBalance(
  userId: string,
  payload: t.AdminAdjustBalanceRequest,
): Promise<t.AdminBalanceMutationResponse> {
  return postWithConfig<t.AdminBalanceMutationResponse>(
    endpoints.adminBalanceAdjust(userId),
    payload,
  );
}

export function setAdminBalance(
  userId: string,
  payload: t.AdminSetBalanceRequest,
): Promise<t.AdminBalanceMutationResponse> {
  return postWithConfig<t.AdminBalanceMutationResponse>(endpoints.adminBalanceSet(userId), payload);
}

/* ---------- Usage ---------- */

export function getAdminUserUsage(
  userId: string,
  params: t.AdminUserUsageParams = {},
): Promise<t.AdminUserUsageResponse> {
  return request.get<t.AdminUserUsageResponse>(
    endpoints.adminUsageForUser(userId, params as Record<string, unknown>),
  );
}

export function listAdminTransactions(
  params: t.AdminTransactionsParams = {},
): Promise<t.AdminTransactionsResponse> {
  return request.get<t.AdminTransactionsResponse>(
    endpoints.adminUsageTransactions(params as Record<string, unknown>),
  );
}

export function getAdminUsageOverview(): Promise<t.AdminOrgUsageOverview> {
  return request.get<t.AdminOrgUsageOverview>(endpoints.adminUsageStatsOverview());
}

export function getAdminOrgUsage(
  range: t.AdminOrgUsageRange = '30d',
): Promise<t.AdminOrgUsageResponse> {
  return request.get<t.AdminOrgUsageResponse>(endpoints.adminUsageStats({ range }));
}

/* ---------- Messages / Conversations ---------- */

export function listAdminConversations(
  userId: string,
  params: t.AdminConversationsParams = {},
): Promise<t.AdminConversationsResponse> {
  return request.get<t.AdminConversationsResponse>(
    endpoints.adminConversationsForUser(userId, params as Record<string, unknown>),
  );
}

export function getAdminConversation(
  userId: string,
  conversationId: string,
): Promise<t.AdminConversationDetail> {
  return request.get<t.AdminConversationDetail>(
    endpoints.adminConversationDetail(userId, conversationId),
  );
}

export function listAdminMessages(
  userId: string,
  conversationId: string,
  params: t.AdminMessagesParams = {},
): Promise<t.AdminMessagesResponse> {
  return request.get<t.AdminMessagesResponse>(
    endpoints.adminConversationMessages(userId, conversationId, params as Record<string, unknown>),
  );
}

export function getAdminMessage(messageId: string): Promise<t.AdminMessageItem> {
  return request.get<t.AdminMessageItem>(endpoints.adminMessage(messageId));
}

/* ---------- Audit ---------- */

export function listAdminAudit(
  params: t.AdminAuditListParams = {},
): Promise<t.AdminAuditListResponse> {
  return request.get<t.AdminAuditListResponse>(
    endpoints.adminAudit(params as Record<string, unknown>),
  );
}

export function listAdminAuditActions(): Promise<t.AdminAuditAction[]> {
  return request.get<t.AdminAuditAction[]>(endpoints.adminAuditActions());
}

export function getAdminAuditEntry(id: string): Promise<t.AdminAuditEntry> {
  return request.get<t.AdminAuditEntry>(endpoints.adminAuditEntry(id));
}
