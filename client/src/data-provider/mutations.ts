import {
  Constants,
  defaultAssistantsVersion,
  ConversationListResponse,
} from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys, defaultOrderQuery } from 'librechat-data-provider';
import type { InfiniteData, UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import {
  logger,
  /* Conversations */
  addConvoToAllQueries,
  updateConvoInAllQueries,
  removeConvoFromAllQueries,
} from '~/utils';
import useUpdateTagsInConvo from '~/hooks/Conversations/useUpdateTagsInConvo';
import { updateConversationTag } from '~/utils/conversationTags';
import { useConversationTagsQuery } from './queries';

export const useUpdateConversationMutation = (
  id: string,
): UseMutationResult<
  t.TUpdateConversationResponse,
  unknown,
  t.TUpdateConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateConversationRequest) => dataService.updateConversation(payload),
    {
      onSuccess: (updatedConvo, payload) => {
        const targetId = payload.conversationId || id;
        queryClient.setQueryData([QueryKeys.conversation, targetId], updatedConvo);
        updateConvoInAllQueries(queryClient, targetId, () => updatedConvo);
      },
    },
  );
};

export const useTagConversationMutation = (
  conversationId: string,
  options?: t.updateTagsInConvoOptions,
): UseMutationResult<t.TTagConversationResponse, unknown, t.TTagConversationRequest, unknown> => {
  const query = useConversationTagsQuery();
  const { updateTagsInConversation } = useUpdateTagsInConvo();
  return useMutation(
    (payload: t.TTagConversationRequest) =>
      dataService.addTagToConversation(conversationId, payload),
    {
      onSuccess: (updatedTags, ...rest) => {
        query.refetch();
        updateTagsInConversation(conversationId, updatedTags);
        options?.onSuccess?.(updatedTags, ...rest);
      },
      onError: options?.onError,
      onMutate: options?.onMutate,
    },
  );
};

export const useArchiveConvoMutation = (
  options?: t.ArchiveConversationOptions,
): UseMutationResult<
  t.TArchiveConversationResponse,
  unknown,
  t.TArchiveConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  const convoQueryKey = [QueryKeys.allConversations];
  const archivedConvoQueryKey = [QueryKeys.archivedConversations];
  const { onMutate, onError, onSuccess, ..._options } = options || {};

  return useMutation(
    (payload: t.TArchiveConversationRequest) => dataService.archiveConversation(payload),
    {
      onMutate,
      onSuccess: (_data, vars, context) => {
        const isArchived = vars.isArchived === true;

        removeConvoFromAllQueries(queryClient, vars.conversationId);

        const archivedQueries = queryClient
          .getQueryCache()
          .findAll([QueryKeys.archivedConversations], { exact: false });

        for (const query of archivedQueries) {
          queryClient.setQueryData<InfiniteData<ConversationListResponse>>(
            query.queryKey,
            (oldData) => {
              if (!oldData) {
                return oldData;
              }
              if (isArchived) {
                return {
                  ...oldData,
                  pages: [
                    {
                      ...oldData.pages[0],
                      conversations: [_data, ...oldData.pages[0].conversations],
                    },
                    ...oldData.pages.slice(1),
                  ],
                };
              } else {
                return {
                  ...oldData,
                  pages: oldData.pages.map((page) => ({
                    ...page,
                    conversations: page.conversations.filter(
                      (conv) => conv.conversationId !== vars.conversationId,
                    ),
                  })),
                };
              }
            },
          );
        }

        queryClient.setQueryData(
          [QueryKeys.conversation, vars.conversationId],
          isArchived ? null : _data,
        );

        onSuccess?.(_data, vars, context);
      },
      onError,
      onSettled: () => {
        queryClient.invalidateQueries({
          queryKey: convoQueryKey,
          refetchPage: (_, index) => index === 0,
        });
        queryClient.invalidateQueries({
          queryKey: archivedConvoQueryKey,
          refetchPage: (_, index) => index === 0,
        });
      },
      ..._options,
    },
  );
};

export const useCreateSharedLinkMutation = (
  options?: t.MutationOptions<
    t.TCreateShareLinkRequest,
    { conversationId: string; targetMessageId?: string }
  >,
): UseMutationResult<
  t.TSharedLinkResponse,
  unknown,
  { conversationId: string; targetMessageId?: string },
  unknown
> => {
  const queryClient = useQueryClient();

  const { onSuccess, ..._options } = options || {};
  return useMutation(
    ({ conversationId, targetMessageId }: { conversationId: string; targetMessageId?: string }) => {
      if (!conversationId) {
        throw new Error('Conversation ID is required');
      }

      return dataService.createSharedLink(conversationId, targetMessageId);
    },
    {
      onSuccess: (_data: t.TSharedLinkResponse, vars, context) => {
        queryClient.setQueryData([QueryKeys.sharedLinks, _data.conversationId], _data);

        onSuccess?.(_data, vars, context);
      },
      ..._options,
    },
  );
};

export const useUpdateSharedLinkMutation = (
  options?: t.MutationOptions<t.TUpdateShareLinkRequest, { shareId: string }>,
): UseMutationResult<t.TSharedLinkResponse, unknown, { shareId: string }, unknown> => {
  const queryClient = useQueryClient();

  const { onSuccess, ..._options } = options || {};
  return useMutation(
    ({ shareId }) => {
      if (!shareId) {
        throw new Error('Share ID is required');
      }
      return dataService.updateSharedLink(shareId);
    },
    {
      onSuccess: (_data: t.TSharedLinkResponse, vars, context) => {
        queryClient.setQueryData([QueryKeys.sharedLinks, _data.conversationId], _data);

        onSuccess?.(_data, vars, context);
      },
      ..._options,
    },
  );
};

export const useDeleteSharedLinkMutation = (
  options?: t.DeleteSharedLinkOptions,
): UseMutationResult<
  t.TDeleteSharedLinkResponse,
  unknown,
  { shareId: string },
  t.DeleteSharedLinkContext
> => {
  const queryClient = useQueryClient();
  const { onSuccess } = options || {};

  return useMutation((vars) => dataService.deleteSharedLink(vars.shareId), {
    onMutate: async (vars) => {
      await queryClient.cancelQueries({
        queryKey: [QueryKeys.sharedLinks],
        exact: false,
      });

      const previousQueries = new Map();
      const queryKeys = queryClient.getQueryCache().findAll([QueryKeys.sharedLinks]);

      queryKeys.forEach((query) => {
        const previousData = queryClient.getQueryData(query.queryKey);
        previousQueries.set(query.queryKey, previousData);

        queryClient.setQueryData<t.SharedLinkQueryData>(query.queryKey, (old) => {
          if (!old?.pages) {
            return old;
          }

          const updatedPages = old.pages.map((page) => ({
            ...page,
            links: page.links.filter((link) => link.shareId !== vars.shareId),
          }));

          const nonEmptyPages = updatedPages.filter((page) => page.links.length > 0);

          return {
            ...old,
            pages: nonEmptyPages,
          };
        });
      });

      return { previousQueries };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach((prevData: unknown, prevQueryKey: unknown) => {
          queryClient.setQueryData(prevQueryKey as string[], prevData);
        });
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.sharedLinks],
        exact: false,
      });
    },

    onSuccess: (data, variables) => {
      if (onSuccess) {
        onSuccess(data, variables);
      }

      queryClient.refetchQueries({
        queryKey: [QueryKeys.sharedLinks],
        exact: true,
      });
    },
  });
};

// Add a tag or update tag information (tag, description, position, etc.)
export const useConversationTagMutation = ({
  context,
  tag,
  options,
}: {
  context: string;
  tag?: string;
  options?: t.UpdateConversationTagOptions;
}): UseMutationResult<t.TConversationTagResponse, unknown, t.TConversationTagRequest, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ..._options } = options || {};
  const onMutationSuccess: typeof onSuccess = (_data, vars) => {
    queryClient.setQueryData<t.TConversationTag[]>([QueryKeys.conversationTags], (queryData) => {
      if (!queryData) {
        return [
          {
            count: 1,
            position: 0,
            tag: Constants.SAVED_TAG,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ] as t.TConversationTag[];
      }
      if (tag === undefined || !tag.length) {
        // Check if the tag already exists
        const existingTagIndex = queryData.findIndex((item) => item.tag === _data.tag);
        if (existingTagIndex !== -1) {
          logger.log(
            'tag_mutation',
            `"Created" tag exists, updating from ${context}`,
            queryData,
            _data,
          );
          // If the tag exists, update it
          const updatedData = [...queryData];
          updatedData[existingTagIndex] = { ...updatedData[existingTagIndex], ..._data };
          return updatedData.sort((a, b) => a.position - b.position);
        } else {
          // If the tag doesn't exist, add it
          logger.log(
            'tag_mutation',
            `"Created" tag is new, adding from ${context}`,
            queryData,
            _data,
          );
          return [...queryData, _data].sort((a, b) => a.position - b.position);
        }
      }
      logger.log('tag_mutation', `Updating tag from ${context}`, queryData, _data);
      return updateConversationTag(queryData, vars, _data, tag);
    });
    if (vars.addToConversation === true && vars.conversationId != null && _data.tag) {
      const currentConvo = queryClient.getQueryData<t.TConversation>([
        QueryKeys.conversation,
        vars.conversationId,
      ]);
      if (!currentConvo) {
        return;
      }
      logger.log(
        'tag_mutation',
        `\`updateTagsInConversation\` Update from ${context}`,
        currentConvo,
      );
      updateTagsInConversation(vars.conversationId, [...(currentConvo.tags || []), _data.tag]);
    }
    // Change the tag title to the new title
    if (tag != null) {
      replaceTagsInAllConversations(tag, _data.tag);
    }
  };
  const { updateTagsInConversation, replaceTagsInAllConversations } = useUpdateTagsInConvo();
  return useMutation(
    (payload: t.TConversationTagRequest) =>
      tag != null
        ? dataService.updateConversationTag(tag, payload)
        : dataService.createConversationTag(payload),
    {
      onSuccess: (...args) => {
        onMutationSuccess(...args);
        onSuccess?.(...args);
      },
      ..._options,
    },
  );
};

// When a bookmark is deleted, remove that bookmark(tag) from all conversations associated with it
export const useDeleteTagInConversations = () => {
  const queryClient = useQueryClient();
  const deleteTagInAllConversation = (deletedTag: string) => {
    const data = queryClient.getQueryData<InfiniteData<ConversationListResponse>>([
      QueryKeys.allConversations,
    ]);

    // If there is no conversations cache yet, nothing to update
    if (!data || !Array.isArray(data.pages) || data.pages.length === 0) {
      return;
    }

    const conversationIdsWithTag: string[] = [];

    // Create an updated copy of the infinite query data without mutating the cache directly
    const updatedData: InfiniteData<ConversationListResponse> = {
      pageParams: Array.isArray(data.pageParams) ? [...data.pageParams] : [],
      pages: data.pages.map((page) => ({
        ...page,
        conversations: page.conversations.map((conversation) => {
          if (
            conversation.conversationId &&
            'tags' in conversation &&
            Array.isArray((conversation as unknown as { tags?: string[] }).tags) &&
            (conversation as unknown as { tags: string[] }).tags.includes(deletedTag)
          ) {
            conversationIdsWithTag.push(conversation.conversationId);
            return {
              ...conversation,
              tags: (conversation as unknown as { tags: string[] }).tags.filter(
                (tag: string) => tag !== deletedTag,
              ),
            } as t.TConversation;
          }
          return conversation as t.TConversation;
        }),
      })),
    };

    queryClient.setQueryData<InfiniteData<ConversationListResponse>>(
      [QueryKeys.allConversations],
      updatedData,
    );

    // Remove the deleted tag from the cache of each individual conversation
    for (let i = 0; i < conversationIdsWithTag.length; i++) {
      const conversationId = conversationIdsWithTag[i];
      const conversationData = queryClient.getQueryData<t.TConversation>([
        QueryKeys.conversation,
        conversationId,
      ]);
      if (conversationData && Array.isArray((conversationData as { tags?: string[] }).tags)) {
        queryClient.setQueryData<t.TConversation>([QueryKeys.conversation, conversationId], {
          ...conversationData,
          tags: (conversationData as { tags: string[] }).tags.filter(
            (tag: string) => tag !== deletedTag,
          ),
        });
      }
    }
  };
  return deleteTagInAllConversation;
};

export const useDeleteConversationTagMutation = (
  options?: t.DeleteConversationTagOptions,
): UseMutationResult<t.TConversationTagResponse, unknown, string, void> => {
  const queryClient = useQueryClient();
  const deleteTagInAllConversations = useDeleteTagInConversations();

  const { onSuccess, ..._options } = options || {};

  return useMutation((tag: string) => dataService.deleteConversationTag(tag), {
    onSuccess: (_data, tagToDelete, context) => {
      queryClient.setQueryData<t.TConversationTag[]>([QueryKeys.conversationTags], (data) => {
        if (!data) {
          return data;
        }
        return data.filter((t) => t.tag !== tagToDelete);
      });

      deleteTagInAllConversations(tagToDelete);
      onSuccess?.(_data, tagToDelete, context);
    },
    ..._options,
  });
};

export const useDeleteConversationMutation = (
  options?: t.DeleteConversationOptions,
): UseMutationResult<
  t.TDeleteConversationResponse,
  unknown,
  t.TDeleteConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: t.TDeleteConversationRequest) =>
      dataService.deleteConversation(payload) as Promise<t.TDeleteConversationResponse>,
    {
      onMutate: async () => {
        await queryClient.cancelQueries([QueryKeys.allConversations]);
        await queryClient.cancelQueries([QueryKeys.archivedConversations]);
        // could store old state if needed for rollback
      },
      onError: () => {
        // TODO: CHECK THIS, no-op; restore if needed
      },
      onSuccess: (data, vars, context) => {
        if (vars.conversationId) {
          removeConvoFromAllQueries(queryClient, vars.conversationId);
        }

        // Also remove from all archivedConversations caches
        const archivedQueries = queryClient
          .getQueryCache()
          .findAll([QueryKeys.archivedConversations], { exact: false });

        for (const query of archivedQueries) {
          queryClient.setQueryData<InfiniteData<ConversationListResponse>>(
            query.queryKey,
            (oldData) => {
              if (!oldData) {
                return oldData;
              }
              return {
                ...oldData,
                pages: oldData.pages
                  .map((page) => ({
                    ...page,
                    conversations: page.conversations.filter(
                      (conv) => conv.conversationId !== vars.conversationId,
                    ),
                  }))
                  .filter((page) => page.conversations.length > 0),
              };
            },
          );
        }

        queryClient.removeQueries({
          queryKey: [QueryKeys.conversation, vars.conversationId],
          exact: true,
        });

        queryClient.invalidateQueries({
          queryKey: [QueryKeys.allConversations],
          refetchPage: (_, index) => index === 0,
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.archivedConversations],
          refetchPage: (_, index) => index === 0,
        });

        options?.onSuccess?.(data, vars, context);
      },
    },
  );
};

export const useDuplicateConversationMutation = (
  options?: t.DuplicateConvoOptions,
): UseMutationResult<t.TDuplicateConvoResponse, unknown, t.TDuplicateConvoRequest, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ..._options } = options ?? {};
  return useMutation((payload) => dataService.duplicateConversation(payload), {
    onSuccess: (data, vars, context) => {
      const duplicatedConversation = data.conversation;
      if (!duplicatedConversation?.conversationId) {
        return;
      }
      queryClient.setQueryData(
        [QueryKeys.conversation, duplicatedConversation.conversationId],
        duplicatedConversation,
      );
      addConvoToAllQueries(queryClient, duplicatedConversation);
      queryClient.setQueryData(
        [QueryKeys.messages, duplicatedConversation.conversationId],
        data.messages,
      );
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.allConversations],
        refetchPage: (_, index) => index === 0,
      });

      if (duplicatedConversation.tags && duplicatedConversation.tags.length > 0) {
        queryClient.setQueryData<t.TConversationTag[]>([QueryKeys.conversationTags], (oldTags) => {
          if (!oldTags) return oldTags;
          return oldTags.map((tag) => {
            if (duplicatedConversation.tags?.includes(tag.tag)) {
              return { ...tag, count: tag.count + 1 };
            }
            return tag;
          });
        });
      }

      onSuccess?.(data, vars, context);
    },
    ..._options,
  });
};

export const useForkConvoMutation = (
  options?: t.ForkConvoOptions,
): UseMutationResult<t.TForkConvoResponse, unknown, t.TForkConvoRequest, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ..._options } = options || {};

  return useMutation((payload: t.TForkConvoRequest) => dataService.forkConversation(payload), {
    onSuccess: (data, vars, context) => {
      if (!vars.conversationId) {
        return;
      }
      const forkedConversation = data.conversation;
      const forkedConversationId = forkedConversation.conversationId;
      if (!forkedConversationId) {
        return;
      }

      queryClient.setQueryData([QueryKeys.conversation, forkedConversationId], forkedConversation);
      addConvoToAllQueries(queryClient, forkedConversation);
      queryClient.setQueryData([QueryKeys.messages, forkedConversationId], data.messages);
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.allConversations],
        refetchPage: (_, index) => index === 0,
      });

      if (forkedConversation.tags && forkedConversation.tags.length > 0) {
        queryClient.setQueryData<t.TConversationTag[]>([QueryKeys.conversationTags], (oldTags) => {
          if (!oldTags) return oldTags;
          return oldTags.map((tag) => {
            if (forkedConversation.tags?.includes(tag.tag)) {
              return { ...tag, count: tag.count + 1 };
            }
            return tag;
          });
        });
      }

      onSuccess?.(data, vars, context);
    },
    ..._options,
  });
};

export const useUploadConversationsMutation = (
  _options?: t.MutationOptions<t.TImportResponse, FormData>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate } = _options || {};

  return useMutation<t.TImportResponse, unknown, FormData>({
    mutationFn: (formData: FormData) => dataService.importConversationsFile(formData),
    onSuccess: (data, variables, context) => {
      /* TODO: optimize to return imported conversations and add manually */
      queryClient.invalidateQueries([QueryKeys.allConversations]);
      if (onSuccess) {
        onSuccess(data, variables, context);
      }
    },
    onError: (err, variables, context) => {
      if (onError) {
        onError(err, variables, context);
      }
    },
    onMutate,
  });
};

export const useUpdatePresetMutation = (
  options?: t.UpdatePresetOptions,
): UseMutationResult<
  t.TPreset, // response data
  unknown,
  t.TPreset,
  unknown
> => {
  return useMutation([MutationKeys.updatePreset], {
    mutationFn: (preset: t.TPreset) => dataService.updatePreset(preset),
    ...(options || {}),
  });
};

export const useDeletePresetMutation = (
  options?: t.DeletePresetOptions,
): UseMutationResult<
  t.PresetDeleteResponse, // response data
  unknown,
  t.TPreset | undefined,
  unknown
> => {
  return useMutation([MutationKeys.deletePreset], {
    mutationFn: (preset: t.TPreset | undefined) => dataService.deletePreset(preset),
    ...(options || {}),
  });
};

/* Avatar upload */
export const useUploadAvatarMutation = (
  options?: t.UploadAvatarOptions,
): UseMutationResult<
  t.AvatarUploadResponse, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  return useMutation([MutationKeys.avatarUpload], {
    mutationFn: (variables: FormData) => dataService.uploadAvatar(variables),
    ...(options || {}),
  });
};

/* Speech to text */
export const useSpeechToTextMutation = (
  options?: t.SpeechToTextOptions,
): UseMutationResult<
  t.SpeechToTextResponse, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  return useMutation([MutationKeys.speechToText], {
    mutationFn: (variables: FormData) => dataService.speechToText(variables),
    ...(options || {}),
  });
};

/* Text to speech */
export const useTextToSpeechMutation = (
  options?: t.TextToSpeechOptions,
): UseMutationResult<
  ArrayBuffer, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  return useMutation([MutationKeys.textToSpeech], {
    mutationFn: (variables: FormData) => dataService.textToSpeech(variables),
    ...(options || {}),
  });
};

/**
 * ASSISTANTS
 */

/**
 * Create a new assistant
 */
export const useCreateAssistantMutation = (
  options?: t.CreateAssistantMutationOptions,
): UseMutationResult<t.Assistant, Error, t.AssistantCreateParams> => {
  const queryClient = useQueryClient();
  return useMutation(
    (newAssistantData: t.AssistantCreateParams) => dataService.createAssistant(newAssistantData),
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (newAssistant, variables, context) => {
        const listRes = queryClient.getQueryData<t.AssistantListResponse>([
          QueryKeys.assistants,
          variables.endpoint,
          defaultOrderQuery,
        ]);

        if (!listRes) {
          return options?.onSuccess?.(newAssistant, variables, context);
        }

        const currentAssistants = [newAssistant, ...JSON.parse(JSON.stringify(listRes.data))];

        queryClient.setQueryData<t.AssistantListResponse>(
          [QueryKeys.assistants, variables.endpoint, defaultOrderQuery],
          {
            ...listRes,
            data: currentAssistants,
          },
        );
        return options?.onSuccess?.(newAssistant, variables, context);
      },
    },
  );
};

/**
 * Hook for updating an assistant
 */
export const useUpdateAssistantMutation = (
  options?: t.UpdateAssistantMutationOptions,
): UseMutationResult<
  t.Assistant,
  Error,
  { assistant_id: string; data: t.AssistantUpdateParams }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistant_id, data }: { assistant_id: string; data: t.AssistantUpdateParams }) => {
      const { endpoint } = data;
      const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
      const endpointConfig = endpointsConfig?.[endpoint];
      const version = endpointConfig?.version ?? defaultAssistantsVersion[endpoint];
      return dataService.updateAssistant({
        data,
        version,
        assistant_id,
      });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (updatedAssistant, variables, context) => {
        const listRes = queryClient.getQueryData<t.AssistantListResponse>([
          QueryKeys.assistants,
          variables.data.endpoint,
          defaultOrderQuery,
        ]);

        if (!listRes) {
          return options?.onSuccess?.(updatedAssistant, variables, context);
        }

        queryClient.setQueryData<t.AssistantDocument[]>(
          [QueryKeys.assistantDocs, variables.data.endpoint],
          (prev) => {
            if (!prev) {
              return prev;
            }
            return prev.map((doc) => {
              if (doc.assistant_id === variables.assistant_id) {
                return {
                  ...doc,
                  conversation_starters: updatedAssistant.conversation_starters,
                  append_current_datetime: variables.data.append_current_datetime,
                };
              }
              return doc;
            });
          },
        );

        queryClient.setQueryData<t.AssistantListResponse>(
          [QueryKeys.assistants, variables.data.endpoint, defaultOrderQuery],
          {
            ...listRes,
            data: listRes.data.map((assistant) => {
              if (assistant.id === variables.assistant_id) {
                return updatedAssistant;
              }
              return assistant;
            }),
          },
        );
        return options?.onSuccess?.(updatedAssistant, variables, context);
      },
    },
  );
};

/**
 * Hook for deleting an assistant
 */
export const useDeleteAssistantMutation = (
  options?: t.DeleteAssistantMutationOptions,
): UseMutationResult<void, Error, t.DeleteAssistantBody> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ assistant_id, model, endpoint }: t.DeleteAssistantBody) => {
      const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
      const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
      return dataService.deleteAssistant({ assistant_id, model, version, endpoint });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (_data, variables, context) => {
        const listRes = queryClient.getQueryData<t.AssistantListResponse>([
          QueryKeys.assistants,
          variables.endpoint,
          defaultOrderQuery,
        ]);

        if (!listRes) {
          return options?.onSuccess?.(_data, variables, context);
        }

        const data = listRes.data.filter((assistant) => assistant.id !== variables.assistant_id);

        queryClient.setQueryData<t.AssistantListResponse>(
          [QueryKeys.assistants, variables.endpoint, defaultOrderQuery],
          {
            ...listRes,
            data,
          },
        );

        return options?.onSuccess?.(_data, variables, data);
      },
    },
  );
};

/**
 * Hook for uploading an assistant avatar
 */
export const useUploadAssistantAvatarMutation = (
  options?: t.UploadAssistantAvatarOptions,
): UseMutationResult<
  t.Assistant, // response data
  unknown, // error
  t.AssistantAvatarVariables, // request
  unknown // context
> => {
  return useMutation([MutationKeys.assistantAvatarUpload], {
    mutationFn: ({ postCreation: _postCreation, ...variables }: t.AssistantAvatarVariables) =>
      dataService.uploadAssistantAvatar(variables),
    ...(options || {}),
  });
};

/**
 * Hook for updating Assistant Actions
 */
export const useUpdateAction = (
  options?: t.UpdateActionOptions,
): UseMutationResult<
  t.UpdateActionResponse, // response data
  unknown, // error
  t.UpdateActionVariables, // request
  unknown // context
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updateAction], {
    mutationFn: (variables: t.UpdateActionVariables) => dataService.updateAction(variables),

    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (updateActionResponse, variables, context) => {
      const listRes = queryClient.getQueryData<t.AssistantListResponse>([
        QueryKeys.assistants,
        variables.endpoint,
        defaultOrderQuery,
      ]);

      if (!listRes) {
        return options?.onSuccess?.(updateActionResponse, variables, context);
      }

      const updatedAssistant = updateActionResponse[1];

      queryClient.setQueryData<t.AssistantListResponse>(
        [QueryKeys.assistants, variables.endpoint, defaultOrderQuery],
        {
          ...listRes,
          data: listRes.data.map((assistant) => {
            if (assistant.id === variables.assistant_id) {
              return updatedAssistant;
            }
            return assistant;
          }),
        },
      );

      queryClient.setQueryData<t.Action[]>([QueryKeys.actions], (prev) => {
        return prev
          ?.map((action) => {
            if (action.action_id === variables.action_id) {
              return updateActionResponse[2];
            }
            return action;
          })
          .concat(
            variables.action_id != null && variables.action_id ? [] : [updateActionResponse[2]],
          );
      });

      return options?.onSuccess?.(updateActionResponse, variables, context);
    },
  });
};

/**
 * Hook for deleting an Assistant Action
 */
export const useDeleteAction = (
  options?: t.DeleteActionOptions,
): UseMutationResult<
  void, // response data for a delete operation is typically void
  Error, // error type
  t.DeleteActionVariables, // request variables
  unknown // context
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.deleteAction], {
    mutationFn: (variables: t.DeleteActionVariables) => {
      const { endpoint } = variables;
      const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
      const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
      return dataService.deleteAction({
        ...variables,
        version,
      });
    },

    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (_data, variables, context) => {
      let domain: string | undefined = '';
      queryClient.setQueryData<t.Action[]>([QueryKeys.actions], (prev) => {
        return prev?.filter((action) => {
          domain = action.metadata.domain;
          return action.action_id !== variables.action_id;
        });
      });

      queryClient.setQueryData<t.AssistantListResponse>(
        [QueryKeys.assistants, variables.endpoint, defaultOrderQuery],
        (prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            data: prev.data.map((assistant) => {
              if (assistant.id === variables.assistant_id) {
                return {
                  ...assistant,
                  tools: (assistant.tools ?? []).filter(
                    (tool) => !(tool.function?.name.includes(domain ?? '') ?? false),
                  ),
                };
              }
              return assistant;
            }),
          };
        },
      );

      return options?.onSuccess?.(_data, variables, context);
    },
  });
};

/**
 * Hook for verifying email address
 */
export const useVerifyEmailMutation = (
  options?: t.VerifyEmailOptions,
): UseMutationResult<t.VerifyEmailResponse, unknown, t.TVerifyEmail, unknown> => {
  return useMutation({
    mutationFn: (variables: t.TVerifyEmail) => dataService.verifyEmail(variables),
    ...(options || {}),
  });
};

/**
 * Hook for resending verficiation email
 */
export const useResendVerificationEmail = (
  options?: t.ResendVerifcationOptions,
): UseMutationResult<t.VerifyEmailResponse, unknown, t.TResendVerificationEmail, unknown> => {
  return useMutation({
    mutationFn: (variables: t.TResendVerificationEmail) =>
      dataService.resendVerificationEmail(variables),
    ...(options || {}),
  });
};

export const useAcceptTermsMutation = (
  options?: t.AcceptTermsMutationOptions,
): UseMutationResult<t.TAcceptTermsResponse, unknown, void, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.acceptTerms(), {
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<t.TUserTermsResponse>([QueryKeys.userTerms], {
        termsAccepted: true,
      });
      options?.onSuccess?.(data, variables, context);
    },
    onError: options?.onError,
    onMutate: options?.onMutate,
  });
};
