import { useResetRecoilState, useSetRecoilState } from 'recoil';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService, request } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import useClearStates from '~/hooks/Config/useClearStates';
import { clearAllConversationStorage } from '~/utils';
import store from '~/store';

type LoginMutationOptions<Response, Request> = t.MutationOptions<
  Response,
  Request,
  unknown,
  unknown
>;

const useLoginMutation = <Response, Request>(
  key: MutationKeys,
  mutationFn: (payload: Request) => Promise<Response>,
  options?: LoginMutationOptions<Response, Request>,
): UseMutationResult<Response, unknown, Request, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

  return useMutation([key], {
    mutationFn,
    ...(options || {}),
    onMutate: async (vars) => {
      setQueriesEnabled(false);
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
      await options?.onMutate?.(vars);
    },
    // Queries re-enable in AuthContext only after its Authorization header is ready.
    onSuccess: (...args) => {
      options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      setQueriesEnabled(true);
      options?.onError?.(...args);
    },
  });
};

/* login/logout */
export const useLogoutUserMutation = (
  options?: t.LogoutOptions,
): UseMutationResult<t.TLogoutResponse, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  const clearLogoutState = () => {
    setQueriesEnabled(false);
    resetDefaultPreset();
    clearStates();
    queryClient.removeQueries();
  };

  return useMutation([MutationKeys.logoutUser], {
    mutationFn: () => dataService.logout(),
    ...(options || {}),
    onSuccess: (...args) => {
      clearLogoutState();
      options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      clearLogoutState();
      options?.onError?.(...args);
    },
  });
};

export const useLoginUserMutation = (
  options?: t.MutationOptions<t.TLoginResponse, t.TLoginUser, unknown, unknown>,
): UseMutationResult<t.TLoginResponse, unknown, t.TLoginUser, unknown> => {
  return useLoginMutation(MutationKeys.loginUser, dataService.login, options);
};

export const useClerkLoginMutation = (
  options?: t.MutationOptions<t.TClerkLoginResponse, t.TClerkLoginRequest, unknown, unknown>,
): UseMutationResult<t.TClerkLoginResponse, unknown, t.TClerkLoginRequest, unknown> => {
  return useLoginMutation(MutationKeys.loginClerk, dataService.loginClerk, options);
};

export const getClerkAuthErrorCode = (error: unknown): t.ClerkAuthErrorCode | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = error.response;
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    return undefined;
  }

  const data = response.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) {
    return undefined;
  }

  switch (data.code) {
    case 'CLERK_REQUEST_INVALID':
    case 'CLERK_TOKEN_INVALID':
    case 'CLERK_LOGIN_FORBIDDEN':
    case 'CLERK_IDENTITY_CONFLICT':
    case 'CLERK_TOKEN_REPLAYED':
    case 'CLERK_LOGIN_RATE_LIMITED':
    case 'CLERK_UPSTREAM_RATE_LIMITED':
    case 'CLERK_UNAVAILABLE':
    case 'CLERK_LOGIN_FAILED':
      return data.code;
    default:
      return undefined;
  }
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
  options?: t.MutationOptions<unknown, t.TDeleteUserRequest | undefined>,
): UseMutationResult<unknown, unknown, t.TDeleteUserRequest | undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);

  return useMutation([MutationKeys.deleteUser], {
    mutationFn: (payload?: t.TDeleteUserRequest) => dataService.deleteUser(payload),
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
  t.TEnable2FARequest | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload?: t.TEnable2FARequest) => dataService.enableTwoFactor(payload), {
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
  t.TRegenerateBackupCodesRequest | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload?: t.TRegenerateBackupCodesRequest) => dataService.regenerateBackupCodes(payload),
    {
      onSuccess: (data) => {
        queryClient.setQueryData([QueryKeys.user, '2fa', 'backup'], data);
      },
    },
  );
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
