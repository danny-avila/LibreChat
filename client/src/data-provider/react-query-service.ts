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
  searchEnabled = "searchEnabled",
  user = "user",
  endpoints = "endpoints",
  presets = "presets",
  searchResults = "searchResults",
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
      ...config
    }
  );
}

//This isn't ideal because its just a query and we're using mutation, but it was the only way
//to make it work with how the Chat component is structured
export const useGetConversationByIdMutation = (
  id: string,
  callback: (data: t.TConversation) => void
): UseMutationResult<t.TConversation> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.getConversationById(id),
    {
      onSuccess: (res: t.TConversation) => {
        callback(res);
       queryClient.invalidateQueries([QueryKeys.conversation, id]);
      },
    }   
  );
};

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

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.clearAllConversations(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useGetConversationsQuery = (pageNumber: string): QueryObserverResult<t.Conversation[]> => {
  return useQuery([QueryKeys.allConversations, pageNumber], () =>
    dataService.getConversations(pageNumber), {
      // refetchOnWindowFocus: false,
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

export const useGetEndpointsQuery = (): QueryObserverResult<t.TEndpoints> => {
  return useQuery([QueryKeys.endpoints], () =>
    dataService.getAIEndpoints(), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    }
  );
}

export const useCreatePresetMutation = (): UseMutationResult<t.Preset[]> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TCreatePresetRequest) =>
      dataService.createPreset(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.presets]);
      },
    }
  );
};

export const useUpdatePresetMutation = (): UseMutationResult<t.TPreset[]> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdatePresetRequest) =>
      dataService.updatePreset(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.presets]);
      },
    }
  );
};

export const useGetPresetsQuery = (): QueryObserverResult<t.TPreset[], unknown> => {
  return useQuery([QueryKeys.presets], () => dataService.getPresets(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
};

export const useDeleteAllPresetsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.deletePresets(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.presets]);
    },
  });
}

export const useSearchFetcher = (query: string, pageNumber: string, callback: () => void, config?: UseQueryOptions<t.TSearchResponse>): QueryObserverResult<t.TSearchResponse> => {
  return useQuery<t.TSearchResponse>([QueryKeys.searchResults, pageNumber, query], () =>
    dataService.searchConversations(query, pageNumber, callback), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config
    }
  );
}
