/* Memories */
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TUserMemory } from 'librechat-data-provider';

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

export const useUpdateMemoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ key, value, originalKey }: { key: string; value: string; originalKey?: string }) =>
      dataService.updateMemory(key, value, originalKey),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.memories]);
      },
    },
  );
};
