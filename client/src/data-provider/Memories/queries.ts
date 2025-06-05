/* Memories */
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationOptions,
  QueryObserverResult,
} from '@tanstack/react-query';
import type { TUserMemory, MemoriesResponse } from 'librechat-data-provider';

export const useMemoriesQuery = (
  config?: UseQueryOptions<MemoriesResponse>,
): QueryObserverResult<MemoriesResponse> => {
  return useQuery<MemoriesResponse>([QueryKeys.memories], () => dataService.getMemories(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useDeleteMemoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation((key: string) => dataService.deleteMemory(key), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.memories]);
    },
  });
};

export type UpdateMemoryParams = { key: string; value: string; originalKey?: string };
export const useUpdateMemoryMutation = (
  options?: UseMutationOptions<TUserMemory, Error, UpdateMemoryParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ key, value, originalKey }: UpdateMemoryParams) =>
      dataService.updateMemory(key, value, originalKey),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.memories]);
        options?.onSuccess?.(...params);
      },
    },
  );
};

export type UpdateMemoryPreferencesParams = { memories: boolean };
export type UpdateMemoryPreferencesResponse = {
  updated: boolean;
  preferences: { memories: boolean };
};

export const useUpdateMemoryPreferencesMutation = (
  options?: UseMutationOptions<
    UpdateMemoryPreferencesResponse,
    Error,
    UpdateMemoryPreferencesParams
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation<UpdateMemoryPreferencesResponse, Error, UpdateMemoryPreferencesParams>(
    [MutationKeys.updateMemoryPreferences],
    (preferences: UpdateMemoryPreferencesParams) =>
      dataService.updateMemoryPreferences(preferences),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.user]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
