import {
  UseQueryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  UseMutationResult,
  QueryObserverResult,
} from "@tanstack/react-query";
import * as t from "./types";
import * as dataService from "./data-service";

export enum QueryKeys {
  getMessagesByConvoId = "getMessages",
  getConversations = "getConversations",
  getConversationById = "getConversationById",
  getOpenAIModels = "getOpenAIModels",
  getModels = "getModels",
  getCustomGpts = "getCustomGpts",
}

export const useGetMessagesByConvoId = (
  id: string
): QueryObserverResult<t.TGetMessagesResponse, unknown> => {
  return useQuery([QueryKeys.getMessagesByConvoId, id], () =>
    dataService.getMessages(id), 
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    }
  );
};

export const useUpdateConvoMutation = (
  id: string
): UseMutationResult<
  t.TUpdateConversationResponse,
  unknown,
  t.TUpdateConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateConversationRequest) =>
      dataService.updateConversation(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.getConversationById, id]);
      },
    }
  );
};

export const useUpdateCustomGptMutation = (): UseMutationResult<
  t.TUpdateCustomGptResponse,
  unknown,
  t.TUpdateCustomGptRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateCustomGptRequest) =>
      dataService.updateCustomGpt(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.getCustomGpts]);
      },
    }
  );
};

export const useGetCustomGptsQuery = (): QueryObserverResult<
  t.TCustomPrompt[],
  unknown
> => {
  return useQuery([QueryKeys.getCustomGpts], () => dataService.getCustomGpts(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useDeleteCustomGptMutation = (): UseMutationResult<
  t.TDeleteCustomGptResponse,
  unknown,
  t.TDeleteCustomGptRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TDeleteCustomGptRequest) =>
      dataService.deleteCustomGpt(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.getCustomGpts]);
      },
    }
  );
};

export const useGetModelsQuery = (): QueryObserverResult<
  t.TGetModelsResponse,
  unknown
> => {
  return useQuery([QueryKeys.getModels], () => dataService.getModels(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.clearAllConversations(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.getConversations]);
    },
  });
};

export const useGetConversationsQuery = (pageNumber: string): QueryObserverResult<t.TGetConversationsResponse> => {
  return useQuery([QueryKeys.getConversations, pageNumber], () =>
    dataService.getConversations(pageNumber), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    }
  );
}
