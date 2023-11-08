import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import * as t from './types';
import * as dataService from './data-service';
import { QueryKeys } from './query-keys';

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = (
  params?: t.AssistantListParams,
  config?: UseQueryOptions<t.Assistant[]>,
): QueryObserverResult<t.Assistant[]> => {
  return useQuery<t.Assistant[]>(
    [QueryKeys.assistants, params],
    () => dataService.listAssistants(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for creating a new assistant
 */
export const useCreateAssistantMutation = (): UseMutationResult<
  t.Assistant,
  Error,
  t.AssistantCreateParams
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (newAssistantData: t.AssistantCreateParams) => dataService.createAssistant(newAssistantData),
    {
      onSuccess: () => {
        // Invalidate and refetch assistants query to update list
        queryClient.invalidateQueries([QueryKeys.assistants]);
      },
    },
  );
};

/**
 * Hook for retrieving details about a single assistant
 */
export const useGetAssistantByIdQuery = (
  assistantId: string,
  config?: UseQueryOptions<t.Assistant>,
): QueryObserverResult<t.Assistant> => {
  return useQuery<t.Assistant>(
    [QueryKeys.assistant, assistantId],
    () => dataService.getAssistantById(assistantId),
    {
      enabled: !!assistantId, // Query will not execute until the assistantId exists
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for updating an assistant
 */
export const useUpdateAssistantMutation = (): UseMutationResult<
  t.Assistant,
  Error,
  { assistantId: string; data: t.AssistantUpdateParams }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistantId, data }: { assistantId: string; data: t.AssistantUpdateParams }) =>
      dataService.updateAssistant(assistantId, data),
    {
      onSuccess: (_, { assistantId }) => {
        // Invalidate and refetch assistant details query
        queryClient.invalidateQueries([QueryKeys.assistant, assistantId]);
        // Optionally invalidate and refetch list of assistants
        queryClient.invalidateQueries([QueryKeys.assistants]);
      },
    },
  );
};

/**
 * Hook for deleting an assistant
 */
export const useDeleteAssistantMutation = (): UseMutationResult<
  void,
  Error,
  { assistantId: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistantId }: { assistantId: string }) => dataService.deleteAssistant(assistantId),
    {
      onSuccess: () => {
        // Invalidate and refetch assistant list query
        queryClient.invalidateQueries([QueryKeys.assistants]);
      },
    },
  );
};
