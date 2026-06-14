import { useCallback, useEffect, useRef } from 'react';
import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  QueryKeys,
  Constants,
  EndpointURLs,
  ContentTypes,
  tPresetSchema,
  tMessageSchema,
  tConvoUpdateSchema,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type {
  TMessage,
  TConversation,
  EventSubmission,
  TStartupConfig,
} from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type { SetterOrUpdater } from 'recoil';
import type { TResData, TFinalResData, ConvoGenerator } from '~/common';
import type { ConversationCursorData } from '~/utils';
import {
  logger,
  setDraft,
  scrollToEnd,
  getAllContentText,
  upsertConvoInAllQueries,
  updateConvoInAllQueries,
  removeConvoFromAllQueries,
  findConversationInInfinite,
} from '~/utils';
import {
  startupConfigKey,
  queueTitleGeneration,
  markTitleGenerationProcessed,
} from '~/data-provider';
import useFocusRegeneratedResponse from '~/hooks/Chat/useFocusRegeneratedResponse';
import { shouldResetSubagentAtomsOnConversationChange } from './cleanup';
import useAttachmentHandler from '~/hooks/SSE/useAttachmentHandler';
import useContentHandler from '~/hooks/SSE/useContentHandler';
import useStepHandler from '~/hooks/SSE/useStepHandler';
import { useApplyAgentTemplate } from '~/hooks/Agents';
import { useAuthContext } from '~/hooks/AuthContext';
import { MESSAGE_UPDATE_INTERVAL } from '~/common';
import { useLiveAnnouncer } from '~/Providers';
import store from '~/store';

type TSyncData = {
  sync: boolean;
  thread_id: string;
  messages?: TMessage[];
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversationId: string;
};

type TTitleEvent = {
  event: 'title';
  data?: {
    conversationId?: string;
    title?: string;
  };
};

const hasRealTitle = (title?: string | null): title is string =>
  title != null && title !== '' && title !== 'New Chat';

/** Skill caches refreshed when a chat turn authors a skill via `create_file`/`edit_file`. */
const SKILL_QUERY_KEYS = [
  QueryKeys.skills,
  QueryKeys.skill,
  QueryKeys.skillFiles,
  QueryKeys.skillFileContent,
  QueryKeys.skillTree,
  QueryKeys.skillNodeContent,
] as const;

export const buildCreatedInitialResponse = ({
  initialResponse,
  userMessage,
  isRegenerate = false,
}: Pick<EventSubmission, 'initialResponse' | 'userMessage' | 'isRegenerate'>): TMessage => ({
  ...initialResponse,
  parentMessageId:
    isRegenerate && initialResponse.parentMessageId
      ? initialResponse.parentMessageId
      : userMessage.messageId,
  messageId:
    isRegenerate && initialResponse.messageId
      ? initialResponse.messageId
      : `${userMessage.messageId}_`,
  conversationId: userMessage.conversationId ?? initialResponse.conversationId,
});

export const isInitialNewConversationSubmission = ({
  userMessage,
}: Pick<EventSubmission, 'userMessage'>): boolean =>
  userMessage?.parentMessageId === Constants.NO_PARENT;

export const mergeRegenerateFinalMessages = ({
  messages,
  responseMessage,
  initialResponseId,
}: {
  messages: TMessage[];
  responseMessage: TMessage;
  initialResponseId?: string | null;
}): TMessage[] => {
  const finalMessages: TMessage[] = [];
  let inserted = false;

  for (const message of messages) {
    if (!message?.messageId || message.messageId === initialResponseId) {
      continue;
    }

    if (message.messageId === responseMessage.messageId) {
      finalMessages.push(responseMessage);
      inserted = true;
      continue;
    }

    finalMessages.push(message);
  }

  if (!inserted) {
    finalMessages.push(responseMessage);
  }

  return finalMessages;
};

export const getExistingConversationAbortMessages = ({
  messages,
  currentMessages,
  regenerateMessages,
  isRegenerate = false,
}: Pick<EventSubmission, 'messages' | 'regenerateMessages' | 'isRegenerate'> & {
  currentMessages?: TMessage[];
}): TMessage[] => {
  if (!isRegenerate) {
    return [...messages];
  }

  if (regenerateMessages?.length) {
    return [...regenerateMessages];
  }

  const sourceMessages = currentMessages?.length ? currentMessages : messages;
  return [...sourceMessages];
};

export type EventHandlerParams = {
  isAddedRequest?: boolean;
  setCompleted: React.Dispatch<React.SetStateAction<Set<unknown>>>;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  setIsSubmitting: SetterOrUpdater<boolean>;
  setConversation?: SetterOrUpdater<TConversation | null>;
  newConversation?: ConvoGenerator;
  setShowStopButton: SetterOrUpdater<boolean>;
};

const createErrorMessage = ({
  errorMetadata,
  getMessages,
  submission,
  error,
}: {
  getMessages: () => TMessage[] | undefined;
  errorMetadata?: Partial<TMessage>;
  submission: EventSubmission;
  error?: Error | unknown;
}): TMessage => {
  const currentMessages = getMessages();
  const latestMessage = currentMessages?.[currentMessages.length - 1];
  let errorMessage: TMessage;
  const text = submission.initialResponse.text.length > 45 ? submission.initialResponse.text : '';
  const errorText =
    (errorMetadata?.text || text || (error as Error | undefined)?.message) ??
    'Error cancelling request';
  const latestContent = latestMessage?.content ?? [];
  let isValidContentPart = false;
  if (latestContent.length > 0) {
    const latestContentPart = latestContent[latestContent.length - 1];
    if (latestContentPart != null) {
      const latestPartValue = latestContentPart[latestContentPart.type ?? ''];
      isValidContentPart =
        latestContentPart.type !== ContentTypes.TEXT ||
        (latestContentPart.type === ContentTypes.TEXT && typeof latestPartValue === 'string')
          ? true
          : latestPartValue?.value !== '';
    }
  }
  if (
    latestMessage?.conversationId &&
    latestMessage?.messageId &&
    latestContent &&
    isValidContentPart
  ) {
    const content = [...latestContent];
    content.push({
      type: ContentTypes.ERROR,
      error: errorText,
    });
    errorMessage = {
      ...latestMessage,
      ...errorMetadata,
      error: undefined,
      text: '',
      content,
    };
    if (
      submission.userMessage.messageId &&
      submission.userMessage.messageId !== errorMessage.parentMessageId
    ) {
      errorMessage.parentMessageId = submission.userMessage.messageId;
    }
    return errorMessage;
  } else if (errorMetadata) {
    return errorMetadata as TMessage;
  } else {
    errorMessage = {
      ...submission,
      ...submission.initialResponse,
      text: errorText,
      unfinished: !!text.length,
      error: true,
    };
  }
  return tMessageSchema.parse(errorMessage) as TMessage;
};

export const getConvoTitle = ({
  parentId,
  queryClient,
  currentTitle,
  conversationId,
}: {
  parentId?: string | null;
  queryClient: ReturnType<typeof useQueryClient>;
  currentTitle?: string | null;
  conversationId?: string | null;
}): string | null | undefined => {
  if (
    parentId !== Constants.NO_PARENT &&
    (currentTitle?.toLowerCase().includes('new chat') ?? false)
  ) {
    const currentConvo = queryClient.getQueryData<TConversation>([
      QueryKeys.conversation,
      conversationId,
    ]);
    if (currentConvo?.title) {
      return currentConvo.title;
    }
    const convos = queryClient.getQueryData<InfiniteData<ConversationCursorData>>([
      QueryKeys.allConversations,
    ]);
    const cachedConvo = findConversationInInfinite(convos, conversationId ?? '');
    return cachedConvo?.title ?? currentConvo?.title ?? null;
  }
  return currentTitle;
};

export default function useEventHandlers({
  setMessages,
  getMessages,
  setCompleted,
  isAddedRequest = false,
  setConversation,
  setIsSubmitting,
  newConversation,
  setShowStopButton,
}: EventHandlerParams) {
  const queryClient = useQueryClient();
  const { announcePolite } = useLiveAnnouncer();
  const applyAgentTemplate = useApplyAgentTemplate();
  const setAbortScroll = useSetRecoilState(store.abortScroll);
  const navigate = useNavigate();
  const location = useLocation();

  const lastAnnouncementTimeRef = useRef(Date.now());
  const { conversationId: paramId } = useParams();
  const { token } = useAuthContext();

  const { contentHandler, resetContentHandler } = useContentHandler({ setMessages, getMessages });
  /** `refetchType: 'all'` so cached-but-unmounted skill queries refresh too —
   *  they opt out of `refetchOnMount`, so a plain invalidation would leave
   *  the Skills panel stale until a manual refresh. */
  const onSkillAuthoringComplete = useCallback(() => {
    for (const key of SKILL_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key], refetchType: 'all' });
    }
  }, [queryClient]);
  const { stepHandler, clearStepMaps, resetSubagentAtoms, syncStepMessage } = useStepHandler({
    setMessages,
    getMessages,
    announcePolite,
    setIsSubmitting,
    lastAnnouncementTimeRef,
    onSkillAuthoringComplete,
  });
  const attachmentHandler = useAttachmentHandler(queryClient);

  /** Wipe the per-subagent Recoil atoms on conversation navigation.
   *  Historical subagent dialogs rehydrate from the persisted
   *  `subagent_content` on each `tool_call` (written by the backend
   *  at message-save time), so clearing live atoms on switch
   *  doesn't lose any viewable history — it just keeps `atomFamily`
   *  bounded across multi-conversation sessions.
   *
   *  Rule: reset on real conversation switches, but preserve atoms for
   *  the single `new` → saved-id transition created by this active run.
   *  Transitions FROM null or undefined pass through:
   *    - initial mount on a new-chat route: nothing to clear.
   *    - new-chat URL stamp mid-stream (`new` → savedId): the final
   *      handler marks that saved id before navigation so the in-flight
   *      subagent ticker/content state survives. Cancelled subagent
   *      runs depend on this live atom because the server may not have
   *      persisted `subagent_content` before interruption.
   *  Cases that DO reset (previous non-null, value changed):
   *    - id1 → id2 (switching between established chats)
   *    - new → id (user selected an existing chat from the sidebar)
   *    - id → null (user clicked "new chat")
   *    - id → undefined (route teardown / navigate away) */
  const lastConversationIdRef = useRef<string | null | undefined>(paramId);
  const preserveSubagentAtomsForNewConvoIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastConversationIdRef.current;
    const preserveNewConversationId = preserveSubagentAtomsForNewConvoIdRef.current;
    lastConversationIdRef.current = paramId;
    preserveSubagentAtomsForNewConvoIdRef.current = null;
    if (
      shouldResetSubagentAtomsOnConversationChange(previous, paramId, preserveNewConversationId)
    ) {
      resetSubagentAtoms();
    }
  }, [paramId, resetSubagentAtoms]);

  /** Final cleanup on component unmount. `useStepHandler` keeps the
   *  set of known atom keys in a ref; when the hook unmounts (user
   *  navigates away from the chat route entirely) that ref is lost,
   *  so a subsequent remount can't clear atoms it never saw created.
   *  Flush at the teardown boundary to keep `atomFamily` bounded
   *  across route changes. */
  useEffect(
    () => () => {
      resetSubagentAtoms();
    },
    [resetSubagentAtoms],
  );

  const messageHandler = useCallback(
    (data: string | undefined, submission: EventSubmission) => {
      const { messages, userMessage, initialResponse, isRegenerate = false } = submission;
      const text = data ?? '';
      setIsSubmitting(true);

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      if (isRegenerate) {
        setMessages([
          ...messages,
          {
            ...initialResponse,
            text,
          },
        ]);
      } else {
        setMessages([
          ...messages,
          userMessage,
          {
            ...initialResponse,
            text,
          },
        ]);
      }
    },
    [setMessages, announcePolite, setIsSubmitting],
  );

  const cancelHandler = useCallback(
    (data: TResData, submission: EventSubmission) => {
      const { requestMessage, responseMessage, conversation } = data;
      const { messages, isRegenerate = false } = submission;
      const convoUpdate =
        (conversation as TConversation | null) ?? (submission.conversation as TConversation);

      // update the messages
      if (isRegenerate) {
        const messagesUpdate = (
          [...messages, responseMessage] as Array<TMessage | undefined>
        ).filter((msg) => msg);
        setMessages(messagesUpdate as TMessage[]);
      } else {
        const messagesUpdate = (
          [...messages, requestMessage, responseMessage] as Array<TMessage | undefined>
        ).filter((msg) => msg);
        setMessages(messagesUpdate as TMessage[]);
      }

      const isNewConvo = conversation.conversationId !== submission.conversation.conversationId;
      if (isNewConvo) {
        removeConvoFromAllQueries(queryClient, submission.conversation.conversationId as string);
      }

      if (setConversation && !isAddedRequest) {
        setConversation((prevState) => {
          const update = { ...prevState, ...convoUpdate };
          return update;
        });
      }

      setIsSubmitting(false);
    },
    [setMessages, setConversation, isAddedRequest, queryClient, setIsSubmitting],
  );

  const syncHandler = useCallback(
    (data: TSyncData, submission: EventSubmission) => {
      const { conversationId, thread_id, responseMessage, requestMessage } = data;
      const { initialResponse, messages: _messages, userMessage } = submission;
      const messages = _messages.filter((msg) => msg.messageId !== userMessage.messageId);

      const nextResponseMessage = {
        ...initialResponse,
        ...responseMessage,
      };

      setMessages([...messages, requestMessage, nextResponseMessage]);

      announcePolite({
        message: 'start',
        isStatus: true,
      });

      let update = {} as TConversation;
      if (setConversation && !isAddedRequest) {
        setConversation((prevState) => {
          const parentId = requestMessage.parentMessageId;
          const title = getConvoTitle({
            parentId,
            queryClient,
            conversationId,
            currentTitle: prevState?.title,
          });
          update = tConvoUpdateSchema.parse({
            ...prevState,
            conversationId,
            thread_id,
            title,
            messages: [requestMessage.messageId, responseMessage.messageId],
          }) as TConversation;
          return update;
        });

        if (requestMessage.parentMessageId === Constants.NO_PARENT) {
          upsertConvoInAllQueries(queryClient, update);
        } else {
          updateConvoInAllQueries(queryClient, update.conversationId!, (_c) => update, true);
        }
        if (update.chatProjectId) {
          queryClient.invalidateQueries([QueryKeys.projects]);
          queryClient.invalidateQueries([QueryKeys.project, update.chatProjectId]);
        }
      } else if (setConversation) {
        setConversation((prevState) => {
          update = tConvoUpdateSchema.parse({
            ...prevState,
            conversationId,
            thread_id,
            messages: [requestMessage.messageId, responseMessage.messageId],
          }) as TConversation;
          return update;
        });
      }

      setShowStopButton(true);
    },
    [queryClient, setMessages, isAddedRequest, announcePolite, setConversation, setShowStopButton],
  );

  const focusRegeneratedResponse = useFocusRegeneratedResponse();

  const createdHandler = useCallback(
    (data: TResData, submission: EventSubmission) => {
      queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);
      queryClient.invalidateQueries([QueryKeys.mcpTools]);
      const { messages, userMessage, isRegenerate = false, isTemporary = false } = submission;
      /**
       * The spread carries `manualSkills` through from
       * `submission.initialResponse` — `useChatFunctions` seeds the field
       * there at construction so the assistant placeholder already has it
       * by the time this handler fires. Subsequent `useStepHandler`
       * spreads and `updateContent` spreads preserve it, and
       * `finalHandler`'s server-backed `responseMessage` replacement
       * drops it, which is the right behavior: by finalize the real
       * `skill` tool_call is in `content` and takes over rendering.
       */
      const initialResponse = buildCreatedInitialResponse({
        initialResponse: submission.initialResponse,
        userMessage,
        isRegenerate,
      });
      if (isRegenerate) {
        setMessages([...messages, initialResponse]);
        focusRegeneratedResponse(initialResponse.parentMessageId);
      } else {
        setMessages([...messages, userMessage, initialResponse]);
      }

      const { conversationId, parentMessageId } = userMessage;
      lastAnnouncementTimeRef.current = Date.now();
      announcePolite({
        message: 'start',
        isStatus: true,
      });

      let update = {} as TConversation;
      if (setConversation && !isAddedRequest) {
        setConversation((prevState) => {
          const parentId = isRegenerate ? userMessage.overrideParentMessageId : parentMessageId;
          const title = getConvoTitle({
            parentId,
            queryClient,
            conversationId,
            currentTitle: prevState?.title,
          });
          update = tConvoUpdateSchema.parse({
            ...prevState,
            conversationId,
            title,
          }) as TConversation;
          return update;
        });

        if (!isTemporary) {
          if (parentMessageId === Constants.NO_PARENT) {
            upsertConvoInAllQueries(queryClient, update);
          } else {
            updateConvoInAllQueries(queryClient, update.conversationId!, (_c) => update, true);
          }
          if (update.chatProjectId) {
            queryClient.invalidateQueries([QueryKeys.projects]);
            queryClient.invalidateQueries([QueryKeys.project, update.chatProjectId]);
          }
        }
      } else if (setConversation) {
        setConversation((prevState) => {
          update = tConvoUpdateSchema.parse({
            ...prevState,
            conversationId,
          }) as TConversation;
          return update;
        });
      }

      if (conversationId) {
        applyAgentTemplate({
          targetId: conversationId,
          sourceId: submission.conversation?.conversationId,
          ephemeralAgent: submission.ephemeralAgent,
          specName: submission.conversation?.spec,
          startupConfig: queryClient.getQueryData<TStartupConfig>(startupConfigKey(true)),
        });
      }

      scrollToEnd(() => setAbortScroll(false));
    },
    [
      setMessages,
      queryClient,
      setAbortScroll,
      isAddedRequest,
      announcePolite,
      setConversation,
      applyAgentTemplate,
      focusRegeneratedResponse,
    ],
  );

  const titleHandler = useCallback(
    (event: TTitleEvent) => {
      const { conversationId, title } = event.data ?? {};
      if (!conversationId || !hasRealTitle(title)) {
        return;
      }

      queryClient.setQueryData<TConversation>([QueryKeys.conversation, conversationId], (convo) =>
        convo ? { ...convo, title } : convo,
      );
      updateConvoInAllQueries(queryClient, conversationId, (convo) => ({ ...convo, title }));
      markTitleGenerationProcessed(conversationId);

      if (location.pathname.includes(conversationId)) {
        document.title = title;
      }

      if (setConversation && !isAddedRequest) {
        setConversation((prevState) => {
          if (!prevState) {
            return prevState;
          }
          if (prevState.conversationId && prevState.conversationId !== conversationId) {
            return prevState;
          }
          return {
            ...prevState,
            conversationId,
            title,
          };
        });
      }
    },
    [queryClient, location.pathname, setConversation, isAddedRequest],
  );

  const finalHandler = useCallback(
    (data: TFinalResData, submission: EventSubmission) => {
      const { requestMessage, responseMessage, conversation, runMessages } = data;
      const {
        messages,
        conversation: submissionConvo,
        isRegenerate = false,
        isTemporary: _isTemporary = false,
      } = submission;
      const serverConversation = conversation as TConversation;

      try {
        // Handle early abort - aborted before any response message was saved.
        if ((data as Record<string, unknown>).earlyAbort) {
          console.log('[finalHandler] Early abort detected - no response message saved');
          setShowStopButton(false);
          setIsSubmitting(false);

          const currentConvoId = submissionConvo.conversationId;
          const isInitialNewConvo = isInitialNewConversationSubmission(submission);
          const isExistingConvo =
            currentConvoId && currentConvoId !== Constants.NEW_CONVO && !isInitialNewConvo;
          if (isExistingConvo) {
            const abortMessages = getExistingConversationAbortMessages({
              messages,
              isRegenerate,
              currentMessages: getMessages(),
              regenerateMessages: submission.regenerateMessages,
            });
            setMessages(abortMessages);
            queryClient.setQueryData<TMessage[]>(
              [QueryKeys.messages, currentConvoId],
              abortMessages,
            );
            setDraft({ id: currentConvoId, value: requestMessage?.text });
            return;
          }

          if (currentConvoId && currentConvoId !== Constants.NEW_CONVO) {
            removeConvoFromAllQueries(queryClient, currentConvoId);
            queryClient.removeQueries({ queryKey: [QueryKeys.conversation, currentConvoId] });
            queryClient.removeQueries({ queryKey: [QueryKeys.messages, currentConvoId] });
          }
          setMessages([]);
          queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
          setDraft({ id: String(Constants.NEW_CONVO), value: requestMessage?.text });
          if (location.pathname !== `/c/${Constants.NEW_CONVO}`) {
            navigate(`/c/${Constants.NEW_CONVO}`, { replace: true });
          }
          return;
        }

        if (responseMessage?.attachments && responseMessage.attachments.length > 0) {
          // Process each attachment through the attachmentHandler
          responseMessage.attachments.forEach((attachment) => {
            const attachmentData = {
              ...attachment,
              messageId: responseMessage.messageId,
            };

            attachmentHandler({
              data: attachmentData,
              submission: submission as EventSubmission,
            });
          });
        }

        setCompleted((prev) => new Set(prev.add(submission.initialResponse.messageId)));

        const currentMessages = getMessages();
        /* Early return if messages are empty; i.e., the user navigated away */
        if (!currentMessages || currentMessages.length === 0) {
          return;
        }

        /* a11y announcements */
        announcePolite({ message: 'end', isStatus: true });
        announcePolite({ message: getAllContentText(responseMessage) });

        const isNewConvo = conversation.conversationId !== submissionConvo.conversationId;

        // Skip temporary conversations — the server never generates titles for them.
        if (isNewConvo && conversation.conversationId && !_isTemporary) {
          queueTitleGeneration(conversation.conversationId);
        }

        const setFinalMessages = (id: string | null, _messages: TMessage[]) => {
          setMessages(_messages);
          queryClient.setQueryData<TMessage[]>([QueryKeys.messages, id], _messages);
        };

        const hasNoResponse =
          responseMessage?.content?.[0]?.['text']?.value ===
            submission.initialResponse?.content?.[0]?.['text']?.value ||
          !!responseMessage?.content?.[0]?.['tool_call']?.auth;

        /** Handle edge case where stream is cancelled before any response, which creates a blank page */
        if (!conversation.conversationId && hasNoResponse) {
          const currentConvoId =
            (submissionConvo.conversationId ?? conversation.conversationId) || Constants.NEW_CONVO;
          if (isNewConvo && submissionConvo.conversationId) {
            removeConvoFromAllQueries(queryClient, submissionConvo.conversationId);
          }

          const isNewChat =
            location.pathname === `/c/${Constants.NEW_CONVO}` &&
            currentConvoId === Constants.NEW_CONVO;

          setFinalMessages(currentConvoId, isNewChat ? [] : [...messages]);
          setDraft({ id: currentConvoId, value: requestMessage?.text });
          if (isNewChat) {
            navigate(`/c/${Constants.NEW_CONVO}`, { replace: true, state: { focusChat: true } });
          }
          return;
        }

        /* Update messages; if assistants endpoint, client doesn't receive responseMessage */
        let finalMessages: TMessage[] = [];
        if (runMessages) {
          finalMessages = [...runMessages];
        } else if (isRegenerate && responseMessage) {
          finalMessages = mergeRegenerateFinalMessages({
            messages: submission.regenerateMessages ?? currentMessages ?? messages,
            responseMessage,
            initialResponseId: submission.initialResponse.messageId,
          });
        } else if (requestMessage != null && responseMessage != null) {
          finalMessages = [...messages, requestMessage, responseMessage];
        }

        /* Preserve files from current messages when server response lacks them */
        if (finalMessages.length > 0) {
          const currentMsgMap = new Map(
            currentMessages
              .filter((m) => m.files && m.files.length > 0)
              .map((m) => [m.messageId, m.files]),
          );
          for (let i = 0; i < finalMessages.length; i++) {
            const msg = finalMessages[i];
            const preservedFiles = currentMsgMap.get(msg.messageId);
            if (msg.files == null && preservedFiles) {
              finalMessages[i] = { ...msg, files: preservedFiles };
            }
          }
        }

        if (finalMessages.length > 0) {
          setFinalMessages(conversation.conversationId, finalMessages);
        } else if (
          isAssistantsEndpoint(submissionConvo.endpoint) &&
          (!submissionConvo.conversationId ||
            submissionConvo.conversationId === Constants.NEW_CONVO)
        ) {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversation.conversationId],
            [...currentMessages],
          );
        }

        if (isNewConvo && submissionConvo.conversationId) {
          removeConvoFromAllQueries(queryClient, submissionConvo.conversationId);
        }

        /** A title applied locally (e.g. an immediate-mode title fetched while the
         *  response was still streaming) must survive the final event, whose
         *  `conversation` was built before the title was saved and so carries no
         *  title yet — otherwise the chat reverts to "New Chat" until reload. This
         *  holds for a stopped turn too: the server persists a title that finished
         *  generating before the Stop, so the local one stays in sync. */
        if (setConversation && isAddedRequest !== true) {
          setConversation((prevState) => {
            const update = {
              ...prevState,
              ...(conversation as TConversation),
            };
            if (prevState?.model != null && prevState.model !== submissionConvo.model) {
              update.model = prevState.model;
            }
            const prevTitle = prevState?.title;
            if (!hasRealTitle(conversation.title) && hasRealTitle(prevTitle)) {
              update.title = prevTitle;
            }
            if (conversation.conversationId) {
              queryClient.setQueryData<TConversation>(
                [QueryKeys.conversation, conversation.conversationId],
                (cachedConvo) => {
                  const merged = {
                    ...cachedConvo,
                    ...serverConversation,
                  } as TConversation;
                  const cachedTitle = cachedConvo?.title;
                  if (!hasRealTitle(serverConversation.title) && hasRealTitle(cachedTitle)) {
                    merged.title = cachedTitle;
                  }
                  return merged;
                },
              );
            }
            return update;
          });

          if (conversation.conversationId && submission.ephemeralAgent) {
            applyAgentTemplate({
              targetId: conversation.conversationId,
              sourceId: submissionConvo.conversationId,
              ephemeralAgent: submission.ephemeralAgent,
              specName: submission.conversation?.spec,
              startupConfig: queryClient.getQueryData<TStartupConfig>(startupConfigKey(true)),
            });
          }

          if (conversation.chatProjectId) {
            queryClient.invalidateQueries([QueryKeys.projects]);
            queryClient.invalidateQueries([QueryKeys.project, conversation.chatProjectId]);
          }

          if (location.pathname === `/c/${Constants.NEW_CONVO}`) {
            preserveSubagentAtomsForNewConvoIdRef.current = conversation.conversationId;
            navigate(`/c/${conversation.conversationId}`, { replace: true });
          }
        }
      } finally {
        setShowStopButton(false);
        setIsSubmitting(false);
      }
    },
    [
      navigate,
      getMessages,
      setMessages,
      queryClient,
      setCompleted,
      isAddedRequest,
      announcePolite,
      setConversation,
      setIsSubmitting,
      setShowStopButton,
      location.pathname,
      applyAgentTemplate,
      attachmentHandler,
    ],
  );

  const errorHandler = useCallback(
    ({ data, submission }: { data?: TResData; submission: EventSubmission }) => {
      const { messages, userMessage, initialResponse } = submission;
      setCompleted((prev) => new Set(prev.add(initialResponse.messageId)));

      const conversationId =
        userMessage.conversationId ?? submission.conversation?.conversationId ?? '';

      const setErrorMessages = (convoId: string, errorMessage: TMessage) => {
        const finalMessages: TMessage[] = [...messages, userMessage, errorMessage];
        setMessages(finalMessages);
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, convoId], finalMessages);
      };

      const parseErrorResponse = (data: TResData | Partial<TMessage>): TMessage => {
        const metadata = data['responseMessage'] ?? data;
        const errorMessage: Partial<TMessage> = {
          ...initialResponse,
          ...metadata,
          error: true,
          parentMessageId: userMessage.messageId,
        };

        if (errorMessage.messageId === undefined || errorMessage.messageId === '') {
          errorMessage.messageId = v4();
        }

        return tMessageSchema.parse(errorMessage) as TMessage;
      };

      if (!data) {
        const convoId = conversationId || `_${v4()}`;
        const errorMetadata = parseErrorResponse({
          text: 'Error connecting to server, try refreshing the page.',
          ...submission,
          conversationId: convoId,
        });
        const errorResponse = createErrorMessage({
          errorMetadata,
          getMessages,
          submission,
        });
        setErrorMessages(convoId, errorResponse);
        if (newConversation) {
          newConversation({
            template: { conversationId: convoId },
            preset: tPresetSchema.parse(submission.conversation),
          });
        }
        setIsSubmitting(false);
        return;
      }

      const receivedConvoId = data.conversationId ?? '';
      if (!conversationId && !receivedConvoId) {
        const convoId = `_${v4()}`;
        const errorResponse = parseErrorResponse(data);
        setErrorMessages(convoId, errorResponse);
        if (newConversation) {
          newConversation({
            template: { conversationId: convoId },
            preset: tPresetSchema.parse(submission.conversation),
          });
        }
        setIsSubmitting(false);
        return;
      } else if (!receivedConvoId) {
        const errorResponse = parseErrorResponse(data);
        setErrorMessages(conversationId, errorResponse);
        setIsSubmitting(false);
        return;
      }

      const errorResponse = tMessageSchema.parse({
        ...data,
        error: true,
        parentMessageId: userMessage.messageId,
      }) as TMessage;

      setErrorMessages(receivedConvoId, errorResponse);
      if (receivedConvoId && paramId === Constants.NEW_CONVO && newConversation) {
        newConversation({
          template: { conversationId: receivedConvoId },
          preset: tPresetSchema.parse(submission.conversation),
        });
      }

      setIsSubmitting(false);
      return;
    },
    [
      setCompleted,
      setMessages,
      paramId,
      newConversation,
      setIsSubmitting,
      getMessages,
      queryClient,
    ],
  );

  const abortConversation = useCallback(
    async (conversationId = '', submission: EventSubmission, messages?: TMessage[]) => {
      const runAbortKey = `${conversationId}:${messages?.[messages.length - 1]?.messageId ?? ''}`;
      const { endpoint: _endpoint, endpointType } =
        (submission.conversation as TConversation | null) ?? {};
      const endpoint = endpointType ?? _endpoint;
      if (
        !isAssistantsEndpoint(endpoint) &&
        messages?.[messages.length - 1] != null &&
        messages[messages.length - 2] != null
      ) {
        let requestMessage = messages[messages.length - 2];
        const _responseMessage = messages[messages.length - 1];
        if (requestMessage.messageId !== _responseMessage.parentMessageId) {
          // the request message is the parent of response, which we search for backwards
          for (let i = messages.length - 3; i >= 0; i--) {
            if (messages[i].messageId === _responseMessage.parentMessageId) {
              requestMessage = messages[i];
              break;
            }
          }
        }
        /** Sanitize content array to remove undefined parts from interrupted streaming */
        const responseMessage = {
          ..._responseMessage,
          content: _responseMessage.content?.filter((part) => part != null),
        };
        try {
          finalHandler(
            {
              conversation: {
                conversationId,
              },
              requestMessage,
              responseMessage,
            },
            submission,
          );
        } catch (error) {
          console.error('Error in finalHandler during abort:', error);
          setShowStopButton(false);
          setIsSubmitting(false);
        }
        return;
      } else if (!isAssistantsEndpoint(endpoint)) {
        const convoId = conversationId || `_${v4()}`;
        logger.log('conversation', 'Aborted conversation with minimal messages, ID: ' + convoId);
        if (newConversation) {
          newConversation({
            template: { conversationId: convoId },
            preset: tPresetSchema.parse(submission.conversation),
          });
        }
        setIsSubmitting(false);
        return;
      }

      try {
        const response = await fetch(`${EndpointURLs[endpoint ?? '']}/abort`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            abortKey: runAbortKey,
            endpoint,
          }),
        });

        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType != null && contentType.includes('application/json')) {
          const data = await response.json();
          if (response.status === 404) {
            setIsSubmitting(false);
            return;
          }
          if (data.final === true) {
            finalHandler(data, submission);
          } else {
            cancelHandler(data, submission);
          }
        } else if (response.status === 204 || response.status === 200) {
          setIsSubmitting(false);
        } else {
          throw new Error(
            'Unexpected response from server; Status: ' +
              response.status +
              ' ' +
              response.statusText,
          );
        }
      } catch (error) {
        const errorResponse = createErrorMessage({
          getMessages,
          submission,
          error,
        });
        setMessages([...submission.messages, submission.userMessage, errorResponse]);
        if (newConversation) {
          newConversation({
            template: { conversationId: conversationId || errorResponse.conversationId || v4() },
            preset: tPresetSchema.parse(submission.conversation),
          });
        }
        setIsSubmitting(false);
      }
    },
    [
      token,
      getMessages,
      setMessages,
      finalHandler,
      cancelHandler,
      newConversation,
      setIsSubmitting,
      setShowStopButton,
    ],
  );

  return {
    stepHandler,
    syncHandler,
    finalHandler,
    errorHandler,
    clearStepMaps,
    messageHandler,
    contentHandler,
    createdHandler,
    titleHandler,
    syncStepMessage,
    attachmentHandler,
    abortConversation,
    resetContentHandler,
  };
}
