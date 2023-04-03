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
  messages = "messsages",
  allConversations = "allConversations",
  conversation = "conversation",
  models = "models",
  customGpts = "customGpts",
  searchEnabled = "searchEnabled",
  user = "user",
}

export const useGetUserQuery = (): QueryObserverResult<t.TUser> => {
  return useQuery<t.TUser>([QueryKeys.user], () => dataService.getUser(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useGetMessagesByConvoId = (
  id: string, 
  config?: UseQueryOptions<t.TMessage[]>
): QueryObserverResult<t.TMessage[]> => {
  return useQuery<t.TMessage[]>([QueryKeys.messages, id], () =>
    dataService.getMessagesByConvoId(id), 
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    }
  );
};

export const useGetConversationByIdQuery = (
  id: string, 
  config?: UseQueryOptions<t.TConversation> 
  ): QueryObserverResult<t.TConversation> => {
  return useQuery<t.TConversation>([QueryKeys.conversation, id], () =>
    dataService.getConversationById(id), 
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: false,
      ...config
    }
  );
}

export const useUpdateConversationMutation = (
  id: string
): UseMutationResult<
  t.TUpdateConversationResponse> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateConversationRequest) =>
      dataService.updateConversation(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.conversation, id]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    }
  );
};

export const useDeleteConversationMutation = (
  id?: string
): UseMutationResult<t.TDeleteConversationResponse> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TDeleteConversationRequest) =>
      dataService.deleteConversation(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.conversation, id]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    }
  );
};

export const useUpdateCustomGptMutation = (): UseMutationResult<t.TUpdateCustomGptResponse> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateCustomGptRequest) =>
      dataService.updateCustomGpt(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.customGpts]);
      },
    }
  );
};

export const useGetCustomGptsQuery = (): QueryObserverResult<
  t.TCustomGpt[],
  unknown
> => {
  return useQuery([QueryKeys.customGpts], () => dataService.getCustomGpts(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useDeleteCustomGptMutation = (): UseMutationResult<t.TDeleteCustomGptResponse> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TDeleteCustomGptRequest) =>
      dataService.deleteCustomGpt(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.customGpts]);
      },
    }
  );
};

export const useGetModelsQuery = (): QueryObserverResult<t.TGetModelsResponse> => {
  return useQuery([QueryKeys.models], () => dataService.getModels(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.clearAllConversations(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useGetConversationsQuery = (pageNumber: string): QueryObserverResult<t.TGetConversationsResponse> => {
  return useQuery([QueryKeys.allConversations, pageNumber], () =>
    dataService.getConversations(pageNumber), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    }
  );
}

export const useGetSearchEnabledQuery = (config?: UseQueryOptions<boolean>): QueryObserverResult<boolean> => {
  return useQuery<boolean>([QueryKeys.searchEnabled], () =>
    dataService.getSearchEnabled(), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    }
  );
}
