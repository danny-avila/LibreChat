import { useResetRecoilState } from 'recoil';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import useClearStates from '~/hooks/Config/useClearStates';
import store from '~/store';

/* login/logout */
export const useLogoutUserMutation = (
  options?: t.LogoutOptions,
): UseMutationResult<unknown, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);

  return useMutation([MutationKeys.logoutUser], {
    mutationFn: () => dataService.logout(),
    ...(options || {}),
    onSuccess: (...args) => {
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
      options?.onSuccess?.(...args);
    },
  });
};

export const useLoginUserMutation = (): UseMutationResult<
  t.TLoginResponse,
  unknown,
  t.TLoginUser,
  unknown
> => {
  const queryClient = useQueryClient();
  const clearStates = useClearStates();
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  return useMutation((payload: t.TLoginUser) => dataService.login(payload), {
    onMutate: () => {
      resetDefaultPreset();
      clearStates();
      queryClient.removeQueries();
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
      queryClient.removeQueries();
      options?.onSuccess?.(...args);
    },
  });
};
