import { useResetRecoilState, useSetRecoilState } from 'recoil';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService, request } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import useClearStates from '~/hooks/Config/useClearStates';
import { clearAllConversationStorage } from '~/utils';
import store from '~/store';

/* login/logout */
export const useLogoutUserMutation = (
  options?: t.LogoutOptions,
): UseMutationResult<t.TLogoutResponse, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

  return useMutation([MutationKeys.logoutUser], {
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
  options?: t.MutationOptions<t.TLoginResponse, t.TLoginUser, unknown, unknown>,
): UseMutationResult<t.TLoginResponse, unknown, t.TLoginUser, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  return useMutation([MutationKeys.loginUser], {
    mutationFn: (payload: t.TLoginUser) => dataService.login(payload),
    ...(options || {}),
    onMutate: (vars) => {
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
      options?.onMutate?.(vars);
    },
    onSuccess: (...args) => {
      setQueriesEnabled(true);
      options?.onSuccess?.(...args);
    },
  });
};

export const useRefreshTokenMutation = (
  options?: t.MutationOptions<t.TRefreshTokenResponse | undefined, undefined, unknown, unknown>,
): UseMutationResult<t.TRefreshTokenResponse | undefined, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.refreshToken], {
    mutationFn: () => request.refreshToken(),
    ...(options || {}),
    onMutate: (vars) => {
      queryClient.removeQueries();
      options?.onMutate?.(vars);
    },
  });
};

/* User */
export const useDeleteUserMutation = (
  options?: t.MutationOptions<unknown, undefined>,
): UseMutationResult<unknown, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);

  return useMutation([MutationKeys.deleteUser], {
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
  return useMutation(() => dataService.enableTwoFactor(), {
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
  return useMutation((payload: t.TVerify2FARequest) => dataService.verifyTwoFactor(payload), {
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
  return useMutation((payload: t.TVerify2FARequest) => dataService.confirmTwoFactor(payload), {
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
  return useMutation((payload?: t.TDisable2FARequest) => dataService.disableTwoFactor(payload), {
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
  return useMutation(() => dataService.regenerateBackupCodes(), {
    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.user, '2fa', 'backup'], data);
    },
  });
};

export const useVerifyTwoFactorTempMutation = (
  options?: t.MutationOptions<t.TVerify2FATempResponse, t.TVerify2FATempRequest, unknown, unknown>,
): UseMutationResult<t.TVerify2FATempResponse, unknown, t.TVerify2FATempRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TVerify2FATempRequest) => dataService.verifyTwoFactorTemp(payload),
    {
      ...(options || {}),
      onSuccess: (data, ...args) => {
        queryClient.setQueryData([QueryKeys.user, '2fa'], data);
        options?.onSuccess?.(data, ...args);
      },
    },
  );
};
