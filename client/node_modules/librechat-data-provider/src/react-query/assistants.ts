import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import * as t from '../types/assistants';
import * as dataService from '../data-service';
import { QueryKeys } from '../keys';

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = <TData = t.AssistantListResponse>(
  params?: t.AssistantListParams,
  config?: UseQueryOptions<t.AssistantListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.AssistantListResponse, unknown, TData>(
    [QueryKeys.assistants, params],
    () => dataService.listAssistants(params),
    {
      // Example selector to sort them by created_at
      // select: (res) => {
      //   return res.data.sort((a, b) => a.created_at - b.created_at);
      // },
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

export const useListAssistantsInfiniteQuery = (
  params?: t.AssistantListParams,
  config?: UseInfiniteQueryOptions<t.AssistantListResponse, Error>,
) => {
  return useInfiniteQuery<t.AssistantListResponse, Error>(
    ['assistantsList', params],
    ({ pageParam = '' }) => dataService.listAssistants({ ...params, after: pageParam }),
    {
      getNextPageParam: (lastPage) => {
        // lastPage is of type AssistantListResponse, you can use the has_more and last_id from it directly
        if (lastPage.has_more) {
          return lastPage.last_id;
        }
        return undefined;
      },
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
  assistant_id: string,
  config?: UseQueryOptions<t.Assistant>,
): QueryObserverResult<t.Assistant> => {
  return useQuery<t.Assistant>(
    [QueryKeys.assistant, assistant_id],
    () => dataService.getAssistantById(assistant_id),
    {
      enabled: !!assistant_id, // Query will not execute until the assistant_id exists
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
  { assistant_id: string; data: t.AssistantUpdateParams }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistant_id, data }: { assistant_id: string; data: t.AssistantUpdateParams }) =>
      dataService.updateAssistant(assistant_id, data),
    {
      onSuccess: (_, { assistant_id }) => {
        // Invalidate and refetch assistant details query
        queryClient.invalidateQueries([QueryKeys.assistant, assistant_id]);
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
  { assistant_id: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistant_id }: { assistant_id: string }) => dataService.deleteAssistant(assistant_id),
    {
      onSuccess: () => {
        // Invalidate and refetch assistant list query
        queryClient.invalidateQueries([QueryKeys.assistants]);
      },
    },
  );
};
