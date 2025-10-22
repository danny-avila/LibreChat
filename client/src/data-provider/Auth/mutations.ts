import { useResetRecoilState, useSetRecoilState } from 'recoil';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService, request } from 'librechat-data-provider';
import type { UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import useClearStates from '~/hooks/Config/useClearStates';
import { clearAllConversationStorage } from '~/utils';
import store from '~/store';

/* login/logout */
export const useLogoutUserMutation = (
  options?: UseMutationOptions<t.TLogoutResponse, unknown, undefined, unknown>,
): UseMutationResult<t.TLogoutResponse, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

  return useMutation({
    mutationKey: [MutationKeys.logoutUser],
    mutationFn: () => dataService.logout(),
    ...(options || {}),
    onSuccess: (...args) => {
      setQueriesEnabled(false);
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
      options?.onSuccess?.(...args);
    },
  });
};

export const useLoginUserMutation = (
  options?: UseMutationOptions<t.TLoginResponse, unknown, t.TLoginUser, unknown>,
): UseMutationResult<t.TLoginResponse, unknown, t.TLoginUser, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  return useMutation({
    mutationKey: [MutationKeys.loginUser],
    mutationFn: (payload: t.TLoginUser) => dataService.login(payload),
    ...(options || {}),
    onMutate: (vars, context) => {
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
      options?.onMutate?.(vars, context);
    },
    onSuccess: (...args) => {
      setQueriesEnabled(true);
      options?.onSuccess?.(...args);
    },
  });
};

export const useRefreshTokenMutation = (
  options?: UseMutationOptions<t.TRefreshTokenResponse, unknown, undefined, unknown>,
): UseMutationResult<t.TRefreshTokenResponse, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  return useMutation({
    mutationKey: [MutationKeys.refreshToken],
    mutationFn: async () => {
      const res = await request.refreshToken();
      if (!res || !res.token) {
        throw new Error('Refresh token not provided');
      }
      return res;
    },
    ...(options || {}),
    onMutate: (vars, context) => {
      queryClient.removeQueries();
      options?.onMutate?.(vars, context);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      setQueriesEnabled(true);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};

/* User */
export const useDeleteUserMutation = (
  options?: UseMutationOptions<unknown, unknown, undefined, unknown>,
): UseMutationResult<unknown, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);

  return useMutation({
    mutationKey: [MutationKeys.deleteUser],
    mutationFn: () => dataService.deleteUser(),
    ...(options || {}),
    onSuccess: (...args) => {
      resetDefaultPreset();
      clearStates();
      clearAllConversationStorage();
      queryClient.removeQueries();
      options?.onSuccess?.(...args);
    },
  });
};

export const useEnableTwoFactorMutation = (): UseMutationResult<
  t.TEnable2FAResponse,
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.enableTwoFactor(),
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.user, '2fa'], data);
    },
  });
};

export const useVerifyTwoFactorMutation = (): UseMutationResult<
  t.TVerify2FAResponse,
  unknown,
  t.TVerify2FARequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TVerify2FARequest) => dataService.verifyTwoFactor(payload),
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.user, '2fa'], data);
    },
  });
};

export const useConfirmTwoFactorMutation = (): UseMutationResult<
  t.TVerify2FAResponse,
  unknown,
  t.TVerify2FARequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TVerify2FARequest) => dataService.confirmTwoFactor(payload),
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.user, '2fa'], data);
    },
  });
};

export const useDisableTwoFactorMutation = (): UseMutationResult<
  t.TDisable2FAResponse,
  unknown,
  t.TDisable2FARequest | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: t.TDisable2FARequest) => dataService.disableTwoFactor(payload),
    onSuccess: () => {
      queryClient.setQueryData([QueryKeys.user, '2fa'], null);
    },
  });
};

export const useRegenerateBackupCodesMutation = (): UseMutationResult<
  t.TRegenerateBackupCodesResponse,
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.regenerateBackupCodes(),
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.user, '2fa', 'backup'], data);
    },
  });
};

export const useVerifyTwoFactorTempMutation = (
  options?: UseMutationOptions<t.TVerify2FATempResponse, unknown, t.TVerify2FATempRequest, unknown>,
): UseMutationResult<t.TVerify2FATempResponse, unknown, t.TVerify2FATempRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TVerify2FATempRequest) => dataService.verifyTwoFactorTemp(payload),
    ...(options || {}),
    onSuccess: (data, ...args) => {
      queryClient.setQueryData([QueryKeys.user, '2fa'], data);
      options?.onSuccess?.(data, ...args);
    },
  });
};
