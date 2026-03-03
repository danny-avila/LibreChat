import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult, UseQueryOptions } from '@tanstack/react-query';
import type { TAdminUser, TAdminInvitePayload } from 'librechat-data-provider';

export const useDeleteAdminUser = (): UseMutationResult<{ message: string }, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation(
    [MutationKeys.deleteUser],
    (id: string) => dataService.deleteAdminUser(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminUsers]);
      },
    },
  );
};

export const useAdminUsers = (
  config?: UseQueryOptions<TAdminUser[]>,
) => {
  return useQuery<TAdminUser[]>(
    [QueryKeys.adminUsers],
    () => dataService.getAdminUsers(),
    {
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useUpdateUserRole = (): UseMutationResult<
  { message: string; role: string },
  unknown,
  { id: string; role: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    [MutationKeys.updateRole],
    ({ id, role }: { id: string; role: string }) => dataService.updateAdminUserRole(id, role),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminUsers]);
      },
    },
  );
};

export const useInviteUser = (): UseMutationResult<
  { message: string },
  unknown,
  TAdminInvitePayload
> => {
  const queryClient = useQueryClient();
  return useMutation(
    [MutationKeys.inviteUser],
    (payload: TAdminInvitePayload) => dataService.inviteUser(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminUsers]);
      },
    },
  );
};
