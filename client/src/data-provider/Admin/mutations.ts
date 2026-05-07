import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { adminService } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { AdminQueryKeys } from './queries';

type Options<TData, TVars> = {
  onSuccess?: (data: TData, variables: TVars) => void;
  onError?: (error: unknown, variables: TVars) => void;
};

/**
 * Invalidate every admin query under the [AdminQueryKeys.admin, ...]
 * namespace. Cheap because admin pages are not in the hot path.
 */
function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries([AdminQueryKeys.admin]);
}

/* ---------- Reauth ---------- */

export const useReauthMutation = (
  options?: Options<t.AdminReauthResponse, t.AdminReauthRequest>,
): UseMutationResult<t.AdminReauthResponse, unknown, t.AdminReauthRequest> =>
  useMutation<t.AdminReauthResponse, unknown, t.AdminReauthRequest>({
    mutationFn: (vars) => adminService.adminReauth(vars),
    ...(options ?? {}),
  });

/* ---------- User mutations ---------- */

type WithUserId<T> = T & { id: string };

export const useBanUserMutation = (
  options?: Options<t.AdminBanUserResponse, WithUserId<t.AdminBanUserRequest>>,
): UseMutationResult<t.AdminBanUserResponse, unknown, WithUserId<t.AdminBanUserRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminBanUserResponse, unknown, WithUserId<t.AdminBanUserRequest>>({
    mutationFn: ({ id, ...payload }) => adminService.banAdminUser(id, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useUnbanUserMutation = (
  options?: Options<t.AdminBanUserResponse, WithUserId<t.AdminUnbanUserRequest>>,
): UseMutationResult<t.AdminBanUserResponse, unknown, WithUserId<t.AdminUnbanUserRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminBanUserResponse, unknown, WithUserId<t.AdminUnbanUserRequest>>({
    mutationFn: ({ id, ...payload }) => adminService.unbanAdminUser(id, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useChangeUserRoleMutation = (
  options?: Options<t.AdminChangeUserRoleResponse, WithUserId<t.AdminChangeUserRoleRequest>>,
): UseMutationResult<
  t.AdminChangeUserRoleResponse,
  unknown,
  WithUserId<t.AdminChangeUserRoleRequest>
> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<
    t.AdminChangeUserRoleResponse,
    unknown,
    WithUserId<t.AdminChangeUserRoleRequest>
  >({
    mutationFn: ({ id, ...payload }) => adminService.changeAdminUserRole(id, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useResetPasswordMutation = (
  options?: Options<t.AdminResetPasswordResponse, WithUserId<t.AdminResetPasswordRequest>>,
): UseMutationResult<
  t.AdminResetPasswordResponse,
  unknown,
  WithUserId<t.AdminResetPasswordRequest>
> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<
    t.AdminResetPasswordResponse,
    unknown,
    WithUserId<t.AdminResetPasswordRequest>
  >({
    mutationFn: ({ id, ...payload }) => adminService.resetAdminUserPassword(id, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useInviteUserMutation = (
  options?: Options<t.AdminInviteUserResponse, t.AdminInviteUserRequest>,
): UseMutationResult<t.AdminInviteUserResponse, unknown, t.AdminInviteUserRequest> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminInviteUserResponse, unknown, t.AdminInviteUserRequest>({
    mutationFn: (vars) => adminService.inviteAdminUser(vars),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useDeleteUserMutation = (
  options?: Options<t.AdminDeleteUserResponse, WithUserId<t.AdminDeleteUserRequest>>,
): UseMutationResult<t.AdminDeleteUserResponse, unknown, WithUserId<t.AdminDeleteUserRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminDeleteUserResponse, unknown, WithUserId<t.AdminDeleteUserRequest>>({
    mutationFn: ({ id, ...payload }) => adminService.deleteAdminUser(id, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

/* ---------- Subscription mutations ---------- */

type WithUserKey<T> = T & { userId: string };

export const useGrantProMutation = (
  options?: Options<t.AdminSubscription, WithUserKey<t.AdminGrantProRequest>>,
): UseMutationResult<t.AdminSubscription, unknown, WithUserKey<t.AdminGrantProRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminSubscription, unknown, WithUserKey<t.AdminGrantProRequest>>({
    mutationFn: ({ userId, ...payload }) => adminService.grantAdminPro(userId, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useRevokeProMutation = (
  options?: Options<t.AdminSubscription, WithUserKey<t.AdminRevokeProRequest>>,
): UseMutationResult<t.AdminSubscription, unknown, WithUserKey<t.AdminRevokeProRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminSubscription, unknown, WithUserKey<t.AdminRevokeProRequest>>({
    mutationFn: ({ userId, ...payload }) => adminService.revokeAdminPro(userId, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useClearOverrideMutation = (
  options?: Options<t.AdminSubscription, WithUserKey<t.AdminClearOverrideRequest>>,
): UseMutationResult<t.AdminSubscription, unknown, WithUserKey<t.AdminClearOverrideRequest>> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminSubscription, unknown, WithUserKey<t.AdminClearOverrideRequest>>({
    mutationFn: ({ userId, ...payload }) =>
      adminService.clearAdminSubscriptionOverride(userId, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useRefreshSubscriptionMutation = (
  options?: Options<t.AdminSubscription, { userId: string }>,
): UseMutationResult<t.AdminSubscription, unknown, { userId: string }> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<t.AdminSubscription, unknown, { userId: string }>({
    mutationFn: ({ userId }) => adminService.refreshAdminSubscription(userId),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

/* ---------- Balance mutations ---------- */

export const useAdjustBalanceMutation = (
  options?: Options<t.AdminBalanceMutationResponse, WithUserKey<t.AdminAdjustBalanceRequest>>,
): UseMutationResult<
  t.AdminBalanceMutationResponse,
  unknown,
  WithUserKey<t.AdminAdjustBalanceRequest>
> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<
    t.AdminBalanceMutationResponse,
    unknown,
    WithUserKey<t.AdminAdjustBalanceRequest>
  >({
    mutationFn: ({ userId, ...payload }) => adminService.adjustAdminBalance(userId, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};

export const useSetBalanceMutation = (
  options?: Options<t.AdminBalanceMutationResponse, WithUserKey<t.AdminSetBalanceRequest>>,
): UseMutationResult<
  t.AdminBalanceMutationResponse,
  unknown,
  WithUserKey<t.AdminSetBalanceRequest>
> => {
  const invalidate = useInvalidateAdmin();
  return useMutation<
    t.AdminBalanceMutationResponse,
    unknown,
    WithUserKey<t.AdminSetBalanceRequest>
  >({
    mutationFn: ({ userId, ...payload }) => adminService.setAdminBalance(userId, payload),
    ...(options ?? {}),
    onSuccess: (data, vars) => {
      invalidate();
      options?.onSuccess?.(data, vars);
    },
  });
};
