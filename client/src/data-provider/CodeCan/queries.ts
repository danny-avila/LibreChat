import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationOptions,
  QueryObserverResult,
} from '@tanstack/react-query';
import type { TJurisdictionsResponse } from 'librechat-data-provider';

export const useJurisdictionsQuery = (
  config?: UseQueryOptions<TJurisdictionsResponse>,
): QueryObserverResult<TJurisdictionsResponse> => {
  return useQuery<TJurisdictionsResponse>(
    [QueryKeys.jurisdictions],
    () => dataService.getCodeCanJurisdictions(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Catalog rarely changes; cache it.
      staleTime: 5 * 60 * 1000,
      ...config,
    },
  );
};

export type UpdateJurisdictionResponse = {
  updated: boolean;
  preferences: { jurisdiction: string; hasPickedJurisdiction: boolean };
};

export const useUpdateJurisdictionMutation = (
  options?: UseMutationOptions<UpdateJurisdictionResponse, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<UpdateJurisdictionResponse, Error, string>(
    [MutationKeys.updateJurisdiction],
    (jurisdiction: string) => dataService.updateCodeCanJurisdiction(jurisdiction),
    {
      ...options,
      onSuccess: (...params) => {
        // Refresh the cached user (personalization.jurisdiction) and the catalog response
        // (which echoes the current selection).
        queryClient.invalidateQueries([QueryKeys.user]);
        queryClient.invalidateQueries([QueryKeys.jurisdictions]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
