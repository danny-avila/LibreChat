import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';

export type UpdatePersonalizationParams = { displayName: string | null };
export type UpdatePersonalizationResponse = {
  updated: boolean;
  personalization: {
    memories?: boolean;
    displayName?: string;
  };
};

export const useUpdatePersonalizationMutation = (
  options?: UseMutationOptions<UpdatePersonalizationResponse, Error, UpdatePersonalizationParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation<UpdatePersonalizationResponse, Error, UpdatePersonalizationParams>(
    [MutationKeys.updatePersonalization],
    (personalization: UpdatePersonalizationParams) =>
      dataService.updatePersonalization(personalization),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.user]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
