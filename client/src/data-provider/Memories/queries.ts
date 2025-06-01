/* Memories */
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
  UseMutationOptions,
} from '@tanstack/react-query';
import type { TUserMemory, MutationOptions } from 'librechat-data-provider';

export const useMemoriesQuery = (
  config?: UseQueryOptions<TUserMemory[]>,
): QueryObserverResult<TUserMemory[]> => {
  return useQuery<TUserMemory[]>([QueryKeys.memories], () => dataService.getMemories(), {
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
