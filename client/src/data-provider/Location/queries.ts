import { useQueryClient, useMutation } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { UseMutationOptions } from '@tanstack/react-query';
import type { TUserLocation } from 'librechat-data-provider';

export type UpdateUserLocationResponse = { updated: boolean; location?: TUserLocation };

export const useUpdateUserLocationMutation = (
  options?: UseMutationOptions<UpdateUserLocationResponse, Error, TUserLocation>,
) => {
  const queryClient = useQueryClient();
  return useMutation<UpdateUserLocationResponse, Error, TUserLocation>(
    [MutationKeys.updateUserLocation],
    (location: TUserLocation) => dataService.updateUserLocation(location),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.user]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
