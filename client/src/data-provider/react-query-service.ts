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
  tokenCount = "tokenCount",
}

export const useAbortRequestWithMessage = (): UseMutationResult<void, Error, { endpoint: string; abortKey: string; message: string }> => {
  return useMutation(({ endpoint, abortKey, message }) => dataService.abortRequestWithMessage(endpoint, abortKey, message));
};

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
): UseMutationResult<t.TConversation> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.getConversationById(id),
    {
      onSuccess: (res: t.TConversation) => {
       queryClient.invalidateQueries([QueryKeys.conversation, id]);
      },
    }   
  );
};

export const useUpdateConversationMutation = (
  id: string
): UseMutationResult<t.TUpdateConversationResponse, unknown, t.TUpdateConversationRequest, unknown> => {
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
): UseMutationResult<t.TDeleteConversationResponse, unknown, t.TDeleteConversationRequest, unknown> => {
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

export const useGetConversationsQuery = (pageNumber: string): QueryObserverResult<t.TConversation[]> => {
  return useQuery([QueryKeys.allConversations, pageNumber], () =>
    dataService.getConversations(pageNumber), {
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

export const useCreatePresetMutation = (): UseMutationResult<t.TPreset[], unknown, t.TPreset, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TPreset) =>
      dataService.createPreset(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.presets]);
      },
    }
  );
};

export const useUpdatePresetMutation = (): UseMutationResult<t.TPreset[], unknown, t.TPreset, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TPreset) =>
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

export const useDeletePresetMutation = (): UseMutationResult<t.TPreset[], unknown, t.TPreset | {}, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TPreset | {}) => 
      dataService.deletePreset(payload), 
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.presets]);
      },
    }
  );
}

export const useSearchQuery = (
  searchQuery: string, 
  pageNumber: string, 
  config?: UseQueryOptions<t.TSearchResults>
  ): QueryObserverResult<t.TSearchResults> => {
  return useQuery<t.TSearchResults>([QueryKeys.searchResults, pageNumber, searchQuery], () =>
    dataService.searchConversations(searchQuery, pageNumber), {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config
    }
  );
}

export const useUpdateTokenCountMutation = (): UseMutationResult<t.TUpdateTokenCountResponse, unknown, string, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    (text: string) =>
      dataService.updateTokenCount(text),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.tokenCount]);
      },
    }
  );
}