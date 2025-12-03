import { useCallback, useRef } from 'react';
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
import type { TResData, TFinalResData, ConvoGenerator } from '~/common';
import type { InfiniteData } from '@tanstack/react-query';
import type { TGenTitleMutation } from '~/data-provider';
import type { SetterOrUpdater, Resetter } from 'recoil';
import type { ConversationCursorData } from '~/utils';
import {
  logger,
  setDraft,
  scrollToEnd,
  getAllContentText,
  addConvoToAllQueries,
  updateConvoInAllQueries,
  removeConvoFromAllQueries,
  findConversationInInfinite,
} from '~/utils';
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

export type EventHandlerParams = {
  isAddedRequest?: boolean;
  genTitle?: TGenTitleMutation;
  setCompleted: React.Dispatch<React.SetStateAction<Set<unknown>>>;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  setIsSubmitting: SetterOrUpdater<boolean>;
  setConversation?: SetterOrUpdater<TConversation | null>;
  newConversation?: ConvoGenerator;
  setShowStopButton: SetterOrUpdater<boolean>;
  resetLatestMessage?: Resetter;
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
    const latestPartValue = latestContentPart?.[latestContentPart.type ?? ''];
    isValidContentPart =
      latestContentPart.type !== ContentTypes.TEXT ||
      (latestContentPart.type === ContentTypes.TEXT && typeof latestPartValue === 'string')
        ? true
        : latestPartValue?.value !== '';
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
  genTitle,
  setMessages,
  getMessages,
  setCompleted,
  isAddedRequest = false,
  setConversation,
  setIsSubmitting,
  newConversation,
  setShowStopButton,
  resetLatestMessage,
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

  const contentHandler = useContentHandler({ setMessages, getMessages });
  const { stepHandler, clearStepMaps } = useStepHandler({
    setMessages,
    getMessages,
    announcePolite,
    setIsSubmitting,
    lastAnnouncementTimeRef,
  });
  const attachmentHandler = useAttachmentHandler(queryClient);

  const messageHandler = useCallback(
    (data: string | undefined, submission: EventSubmission) => {
      const {
        messages,
        userMessage,
        plugin,
        plugins,
        initialResponse,
        isRegenerate = false,
      } = submission;
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
            plugin: plugin ?? null,
            plugins: plugins ?? [],
          },
        ]);
      } else {
        setMessages([
          ...messages,
          userMessage,
          {
            ...initialResponse,
            text,
            plugin: plugin ?? null,
            plugins: plugins ?? [],
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

      // refresh title
      if (genTitle && isNewConvo && requestMessage.parentMessageId === Constants.NO_PARENT) {
        setTimeout(() => {
          genTitle.mutate({ conversationId: convoUpdate.conversationId as string });
        }, 2500);
      }

      if (setConversation && !isAddedRequest) {
        setConversation((prevState) => {
          const update = { ...prevState, ...convoUpdate };
          return update;
        });
      }

      setIsSubmitting(false);
    },
    [setMessages, setConversation, genTitle, isAddedRequest, queryClient, setIsSubmitting],
  );

  const syncHandler = useCallback(
    (data: TSyncData, submission: EventSubmission) => {
      const { conversationId, thread_id, responseMessage, requestMessage } = data;
      const { initialResponse, messages: _messages, userMessage } = submission;
      const messages = _messages.filter((msg) => msg.messageId !== userMessage.messageId);

      setMessages([
        ...messages,
        requestMessage,
        {
          ...initialResponse,
          ...responseMessage,
        },
      ]);

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
          addConvoToAllQueries(queryClient, update);
        } else {
          updateConvoInAllQueries(queryClient, update.conversationId!, (_c) => update);
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
      if (resetLatestMessage) {
        logger.log('latest_message', 'syncHandler: resetting latest message');
        resetLatestMessage();
      }
    },
    [
      queryClient,
      setMessages,
      isAddedRequest,
      announcePolite,
      setConversation,
      setShowStopButton,
      resetLatestMessage,
    ],
  );

  const createdHandler = useCallback(
    (data: TResData, submission: EventSubmission) => {
      queryClient.invalidateQueries([QueryKeys.mcpConnectionStatus]);
      const { messages, userMessage, isRegenerate = false, isTemporary = false } = submission;
      const initialResponse = {
        ...submission.initialResponse,
        parentMessageId: userMessage.messageId,
        messageId: userMessage.messageId + '_',
      };
      if (isRegenerate) {
        setMessages([...messages, initialResponse]);
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
            addConvoToAllQueries(queryClient, update);
          } else {
            updateConvoInAllQueries(queryClient, update.conversationId!, (_c) => update);
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
          startupConfig: queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]),
        });
      }

      if (resetLatestMessage) {
        logger.log('latest_message', 'createdHandler: resetting latest message');
        resetLatestMessage();
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
      resetLatestMessage,
      applyAgentTemplate,
    ],
  );

  const finalHandler = useCallback(
    (data: TFinalResData, submission: EventSubmission) => {
      const { requestMessage, responseMessage, conversation, runMessages } = data;
      const {
        messages,
        conversation: submissionConvo,
        isRegenerate = false,
        isTemporary = false,
      } = submission;

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

      setShowStopButton(false);
      setCompleted((prev) => new Set(prev.add(submission.initialResponse.messageId)));

      const currentMessages = getMessages();
      /* Early return if messages are empty; i.e., the user navigated away */
      if (!currentMessages || currentMessages.length === 0) {
        setIsSubmitting(false);
        return;
      }

      /* a11y announcements */
      announcePolite({ message: 'end', isStatus: true });
      announcePolite({ message: getAllContentText(responseMessage) });

      const isNewConvo = conversation.conversationId !== submissionConvo.conversationId;

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
        setIsSubmitting(false);
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
        finalMessages = [...messages, responseMessage];
      } else if (requestMessage != null && responseMessage != null) {
        finalMessages = [...messages, requestMessage, responseMessage];
      }
      if (finalMessages.length > 0) {
        setFinalMessages(conversation.conversationId, finalMessages);
      } else if (
        isAssistantsEndpoint(submissionConvo.endpoint) &&
        (!submissionConvo.conversationId || submissionConvo.conversationId === Constants.NEW_CONVO)
      ) {
        queryClient.setQueryData<TMessage[]>(
          [QueryKeys.messages, conversation.conversationId],
          [...currentMessages],
        );
      }

      if (isNewConvo && submissionConvo.conversationId) {
        removeConvoFromAllQueries(queryClient, submissionConvo.conversationId);
      }

      /* Refresh title */
      if (
        genTitle &&
        isNewConvo &&
        !isTemporary &&
        requestMessage &&
        requestMessage.parentMessageId === Constants.NO_PARENT
      ) {
        setTimeout(() => {
          genTitle.mutate({ conversationId: conversation.conversationId as string });
        }, 2500);
      }

      if (setConversation && isAddedRequest !== true) {
        setConversation((prevState) => {
          const update = {
            ...prevState,
            ...(conversation as TConversation),
          };
          if (prevState?.model != null && prevState.model !== submissionConvo.model) {
            update.model = prevState.model;
          }
          const cachedConvo = queryClient.getQueryData<TConversation>([
            QueryKeys.conversation,
            conversation.conversationId,
          ]);
          if (!cachedConvo) {
            queryClient.setQueryData([QueryKeys.conversation, conversation.conversationId], update);
          }
          return update;
        });

        if (conversation.conversationId && submission.ephemeralAgent) {
          applyAgentTemplate({
            targetId: conversation.conversationId,
            sourceId: submissionConvo.conversationId,
            ephemeralAgent: submission.ephemeralAgent,
            specName: submission.conversation?.spec,
            startupConfig: queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]),
          });
        }

        if (location.pathname === `/c/${Constants.NEW_CONVO}`) {
          navigate(`/c/${conversation.conversationId}`, { replace: true });
        }
      }

      setIsSubmitting(false);
    },
    [
      navigate,
      genTitle,
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
        const responseMessage = messages[messages.length - 1];
        if (requestMessage.messageId !== responseMessage.parentMessageId) {
          // the request message is the parent of response, which we search for backwards
          for (let i = messages.length - 3; i >= 0; i--) {
            if (messages[i].messageId === responseMessage.parentMessageId) {
              requestMessage = messages[i];
              break;
            }
          }
        }
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
      finalHandler,
      newConversation,
      setIsSubmitting,
      token,
      cancelHandler,
      getMessages,
      setMessages,
    ],
  );

  return {
    clearStepMaps,
    stepHandler,
    syncHandler,
    finalHandler,
    errorHandler,
    messageHandler,
    contentHandler,
    createdHandler,
    attachmentHandler,
    abortConversation,
  };
}
