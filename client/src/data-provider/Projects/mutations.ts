import { useRecoilCallback } from 'recoil';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TChatProject,
  TConversation,
  TCreateChatProjectRequest,
  TDeleteChatProjectResponse,
  TUpdateChatProjectRequest,
  TAssignConversationToProjectRequest,
  TAssignConversationToProjectResponse,
} from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import { getSessionPrincipal } from '~/utils/session';
import { enqueue } from '~/utils';
import store from '~/store';

export const useCreateProjectMutation = (): UseMutationResult<
  TChatProject,
  unknown,
  TCreateChatProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TCreateChatProjectRequest) => dataService.createProject(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.projects]);
    },
  });
};

export const useUpdateProjectMutation = (): UseMutationResult<
  TChatProject,
  unknown,
  TUpdateChatProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TUpdateChatProjectRequest) => dataService.updateProject(payload), {
    onSuccess: (project) => {
      queryClient.setQueryData([QueryKeys.project, project._id], project);
      queryClient.invalidateQueries([QueryKeys.projects]);
    },
  });
};

export const useDeleteProjectMutation = (): UseMutationResult<
  TDeleteChatProjectResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  const clearActiveConversationProject = useRecoilCallback(
    ({ snapshot, set }) =>
      async (projectId: string) => {
        const conversation = await snapshot.getPromise(store.conversationByIndex(0));
        if (conversation?.conversationId && conversation.chatProjectId === projectId) {
          set(store.updateConversationSelector(conversation.conversationId), {
            ...conversation,
            chatProjectId: null,
          });
        }
      },
    [],
  );
  return useMutation((projectId: string) => dataService.deleteProject(projectId), {
    onSuccess: (_result, projectId) => {
      clearActiveConversationProject(projectId);
      // Invalidate so an *active* project-detail observer refetches and settles into a
      // not-found state — consumers (e.g. ChatRoute) can then react to the deletion.
      // (Removing it instead leaves observers stuck loading under `refetchOnMount: false`.)
      queryClient.invalidateQueries([QueryKeys.project, projectId]);
      // Drop any *inactive* cached detail so a later visit to the deleted project
      // refetches (→ not-found) rather than rendering stale cache within `cacheTime`.
      queryClient.removeQueries([QueryKeys.project, projectId], { type: 'inactive' });
      queryClient.invalidateQueries([QueryKeys.projects]);
      queryClient.invalidateQueries([QueryKeys.allConversations]);
      /** Deleting a project unsets chatProjectId on its chats, pinned ones included. */
      queryClient.invalidateQueries([QueryKeys.pinnedConversations]);
    },
  });
};

/** One queue per conversation: assignments to different chats stay independent. */
const ASSIGN_CONVERSATION_QUEUE = 'assign-conversation:';

/** Where each conversation is headed while a write for it is still queued or in
 *  flight, recorded here so every assignment path shares one answer: a drag
 *  helper that tracked only its own writes would keep reporting its
 *  destination after a menu action had moved the chat somewhere else. Each
 *  entry is identified by the write that made it, since comparing destinations
 *  alone cannot tell two moves to the same project apart. */
type PendingAssignment = { token: number; projectId: string | null; owner?: string };

const pendingAssignments = new Map<string, PendingAssignment>();
let assignmentToken = 0;

/** The destination of the newest write still outstanding, if there is one. */
export const getPendingAssignment = (conversationId: string): PendingAssignment | undefined => {
  const pending = pendingAssignments.get(conversationId);
  /* An entry left by another account describes a conversation this session
   * cannot see, so it must not answer for one of its own. */
  return pending && !isForeignSession(pending.owner) ? pending : undefined;
};

const isForeignSession = (owner?: string): boolean =>
  owner == null || getSessionPrincipal() !== owner;

export const useAssignConversationToProjectMutation = (): UseMutationResult<
  TAssignConversationToProjectResponse,
  unknown,
  TAssignConversationToProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  const updateActiveConversation = useRecoilCallback(
    ({ set }) =>
      (conversation: TConversation) => {
        if (!conversation.conversationId) {
          return;
        }
        set(store.updateConversationSelector(conversation.conversationId), {
          ...conversation,
          chatProjectId: conversation.chatProjectId ?? null,
        });
      },
    [],
  );

  return useMutation(
    /* Serialized per conversation, and here rather than at any one caller: the
     * drag targets, the row menu and the project dialog each hold their own
     * mutation instance, and the write is an unconditional update, so two of
     * them racing let whichever request reached the database last decide the
     * project regardless of which the user asked for first. */
    (payload: TAssignConversationToProjectRequest) => {
      const { conversationId, projectId } = payload;
      const owner = getSessionPrincipal();
      const token = ++assignmentToken;
      pendingAssignments.set(conversationId, { token, projectId: projectId ?? null, owner });
      return enqueue(`${ASSIGN_CONVERSATION_QUEUE}${owner ?? ''}:${conversationId}`, async () => {
        /* A queued write travels with whatever credentials are current when it
         * finally runs. Conversation ids are per-user, so sending one account's
         * under another's would act on whatever that id names over there. */
        if (isForeignSession(owner)) {
          throw new Error('assignment abandoned: the signed-in user changed');
        }
        try {
          const result = await dataService.assignConversationToProject(payload);
          if (isForeignSession(owner)) {
            /* The session turned over while the request was out. This cache is
             * not scoped by user, so publishing the answer now would describe
             * one account's conversation to the next. */
            return result;
          }
          /* The authoritative cache is written here, before the pending entry is
           * released, so a drag starting in between still sees the new project
           * from one of the two. Doing it in `onSuccess` left a gap while that
           * callback awaited the cancellation, and would not run at all once
           * the component that owns the mutation had unmounted. */
          await queryClient.cancelQueries([QueryKeys.conversation, conversationId]);
          queryClient.setQueryData([QueryKeys.conversation, conversationId], result.conversation);
          return result;
        } finally {
          /* Only the newest write clears the entry; by now the conversation
           * cache carries the truth, so no list refresh has to be waited on. */
          if (pendingAssignments.get(conversationId)?.token === token) {
            pendingAssignments.delete(conversationId);
          }
        }
      });
    },
    {
      onSuccess: (result) => {
        /* The conversation cache is written in the request itself, above. */
        updateActiveConversation(result.conversation);
        [result.previousProjectId, result.projectId].forEach((projectId) => {
          if (projectId) {
            queryClient.invalidateQueries([QueryKeys.project, projectId]);
          }
        });
        queryClient.invalidateQueries([QueryKeys.projects]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
        /** The pinned row carries `chatProjectId` for its options menu. */
        queryClient.invalidateQueries([QueryKeys.pinnedConversations]);
        queryClient.invalidateQueries([QueryKeys.projectConversations]);
      },
    },
  );
};
