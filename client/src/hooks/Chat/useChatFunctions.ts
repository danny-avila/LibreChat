import { v4 } from 'uuid';
import { cloneDeep } from 'lodash';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  ContentTypes,
  EModelEndpoint,
  isAgentsEndpoint,
  parseCompactConvo,
  replaceSpecialVars,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useSetRecoilState, useResetRecoilState, useRecoilValue } from 'recoil';
import type {
  TMessage,
  TSubmission,
  TConversation,
  TEndpointOption,
  TEndpointsConfig,
  EndpointSchemaKey,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { TAskFunction, ExtendedFile } from '~/common';
import useSetFilesToDelete from '~/hooks/Files/useSetFilesToDelete';
import useGetSender from '~/hooks/Conversations/useGetSender';
import store, { useGetEphemeralAgent } from '~/store';
import { getEndpointField, logger } from '~/utils';
import useUserKey from '~/hooks/Input/useUserKey';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

const logChatRequest = (request: Record<string, unknown>) => {
  logger.log('=====================================\nAsk function called with:');
  logger.dir(request);
  logger.log('=====================================');
};

export default function useChatFunctions({
  index = 0,
  files,
  setFiles,
  getMessages,
  setMessages,
  isSubmitting,
  latestMessage,
  setSubmission,
  setLatestMessage,
  conversation: immutableConversation,
}: {
  index?: number;
  isSubmitting: boolean;
  paramId?: string | undefined;
  conversation: TConversation | null;
  latestMessage: TMessage | null;
  getMessages: () => TMessage[] | undefined;
  setMessages: (messages: TMessage[]) => void;
  files?: Map<string, ExtendedFile>;
  setFiles?: SetterOrUpdater<Map<string, ExtendedFile>>;
  setSubmission: SetterOrUpdater<TSubmission | null>;
  setLatestMessage?: SetterOrUpdater<TMessage | null>;
}) {
  const navigate = useNavigate();
  const getSender = useGetSender();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const setFilesToDelete = useSetFilesToDelete();
  const getEphemeralAgent = useGetEphemeralAgent();
  const isTemporary = useRecoilValue(store.isTemporary);
  const { getExpiry } = useUserKey(immutableConversation?.endpoint ?? '');
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(index));
  const resetLatestMultiMessage = useResetRecoilState(store.latestMessageFamily(index + 1));

  const ask: TAskFunction = (
    {
      text,
      overrideConvoId,
      overrideUserMessageId,
      parentMessageId = null,
      conversationId = null,
      messageId = null,
    },
    {
      editedContent = null,
      editedMessageId = null,
      isRegenerate = false,
      isContinued = false,
      isEdited = false,
      overrideMessages,
      overrideFiles,
    } = {},
  ) => {
    setShowStopButton(false);
    resetLatestMultiMessage();
    if (!!isSubmitting || text === '') {
      return;
    }

    const conversation = cloneDeep(immutableConversation);

    const endpoint = conversation?.endpoint;
    if (endpoint === null) {
      console.error('No endpoint available');
      return;
    }

    conversationId = conversationId ?? conversation?.conversationId ?? null;
    if (conversationId == 'search') {
      console.error('cannot send any message under search view!');
      return;
    }

    if (isContinued && !latestMessage) {
      console.error('cannot continue AI message without latestMessage!');
      return;
    }

    const ephemeralAgent = getEphemeralAgent(conversationId ?? Constants.NEW_CONVO);
    const isEditOrContinue = isEdited || isContinued;

    let currentMessages: TMessage[] | null = overrideMessages ?? getMessages() ?? [];

    if (conversation?.promptPrefix) {
      conversation.promptPrefix = replaceSpecialVars({
        text: conversation.promptPrefix,
        user,
      });
    }

    // construct the query message
    // this is not a real messageId, it is used as placeholder before real messageId returned
    text = text.trim();
    const intermediateId = overrideUserMessageId ?? v4();
    parentMessageId = parentMessageId ?? latestMessage?.messageId ?? Constants.NO_PARENT;

    logChatRequest({
      index,
      conversation,
      latestMessage,
      conversationId,
      intermediateId,
      parentMessageId,
      currentMessages,
    });

    if (conversationId == Constants.NEW_CONVO) {
      parentMessageId = Constants.NO_PARENT;
      currentMessages = [];
      conversationId = null;
      navigate('/c/new', { state: { focusChat: true } });
    }

    const targetParentMessageId = isRegenerate ? messageId : latestMessage?.parentMessageId;
    /**
     * If the user regenerated or resubmitted the message, the current parent is technically
     * the latest user message, which is passed into `ask`; otherwise, we can rely on the
     * latestMessage to find the parent.
     */
    const targetParentMessage = currentMessages.find(
      (msg) => msg.messageId === targetParentMessageId,
    );

    let thread_id = targetParentMessage?.thread_id ?? latestMessage?.thread_id;
    if (thread_id == null) {
      thread_id = currentMessages.find((message) => message.thread_id)?.thread_id;
    }

    const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
    const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');

    /** This becomes part of the `endpointOption` */
    const convo = parseCompactConvo({
      endpoint: endpoint as EndpointSchemaKey,
      endpointType: endpointType as EndpointSchemaKey,
      conversation: conversation ?? {},
    });

    const { modelDisplayLabel } = endpointsConfig?.[endpoint ?? ''] ?? {};
    const endpointOption = Object.assign(
      {
        endpoint,
        endpointType,
        overrideConvoId,
        overrideUserMessageId,
      },
      convo,
    ) as TEndpointOption;
    if (endpoint !== EModelEndpoint.agents) {
      endpointOption.key = getExpiry();
      endpointOption.thread_id = thread_id;
      endpointOption.modelDisplayLabel = modelDisplayLabel;
    } else {
      endpointOption.key = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
    const responseSender = getSender({ model: conversation?.model, ...endpointOption });

    const currentMsg: TMessage = {
      text,
      sender: 'User',
      clientTimestamp: new Date().toLocaleString('sv').replace(' ', 'T'),
      isCreatedByUser: true,
      parentMessageId,
      conversationId,
      messageId: isContinued && messageId != null && messageId ? messageId : intermediateId,
      thread_id,
      error: false,
    };

    const submissionFiles = overrideFiles ?? targetParentMessage?.files;
    const reuseFiles =
      (isRegenerate || (overrideFiles != null && overrideFiles.length)) &&
      submissionFiles &&
      submissionFiles.length > 0;

    if (setFiles && reuseFiles === true) {
      currentMsg.files = [...submissionFiles];
      setFiles(new Map());
      setFilesToDelete({});
    } else if (setFiles && files && files.size > 0) {
      currentMsg.files = Array.from(files.values()).map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath,
        type: file.type ?? '', // Ensure type is not undefined
        height: file.height,
        width: file.width,
      }));
      setFiles(new Map());
      setFilesToDelete({});
    }

    const responseMessageId =
      editedMessageId ??
      (latestMessage?.messageId && isRegenerate
        ? latestMessage.messageId.replace(/_+$/, '') + '_'
        : null) ??
      null;
    const initialResponseId =
      responseMessageId ?? `${isRegenerate ? messageId : intermediateId}`.replace(/_+$/, '') + '_';

    const initialResponse: TMessage = {
      sender: responseSender,
      text: '',
      endpoint: endpoint ?? '',
      parentMessageId: isRegenerate ? messageId : intermediateId,
      messageId: initialResponseId,
      thread_id,
      conversationId,
      unfinished: false,
      isCreatedByUser: false,
      iconURL: convo?.iconURL,
      model: convo?.model,
      error: false,
    };

    if (isAssistantsEndpoint(endpoint)) {
      initialResponse.model = conversation?.assistant_id ?? '';
      initialResponse.text = '';
      initialResponse.content = [
        {
          type: ContentTypes.TEXT,
          [ContentTypes.TEXT]: {
            value: '',
          },
        },
      ];
    } else if (endpoint != null) {
      initialResponse.model = isAgentsEndpoint(endpoint)
        ? (conversation?.agent_id ?? '')
        : (conversation?.model ?? '');
      initialResponse.text = '';

      if (editedContent && latestMessage?.content) {
        initialResponse.content = cloneDeep(latestMessage.content);
        const { index, type, ...part } = editedContent;
        if (initialResponse.content && index >= 0 && index < initialResponse.content.length) {
          const contentPart = initialResponse.content[index];
          if (type === ContentTypes.THINK && contentPart.type === ContentTypes.THINK) {
            contentPart[ContentTypes.THINK] = part[ContentTypes.THINK];
          } else if (type === ContentTypes.TEXT && contentPart.type === ContentTypes.TEXT) {
            contentPart[ContentTypes.TEXT] = part[ContentTypes.TEXT];
          }
        }
      } else {
        initialResponse.content = [
          {
            type: ContentTypes.TEXT,
            [ContentTypes.TEXT]: {
              value: '',
            },
          },
        ];
      }
      setShowStopButton(true);
    }

    if (isContinued) {
      currentMessages = currentMessages.filter((msg) => msg.messageId !== responseMessageId);
    }

    logger.log('message_state', initialResponse);
    const submission: TSubmission = {
      conversation: {
        ...conversation,
        conversationId,
      },
      endpointOption,
      userMessage: {
        ...currentMsg,
        responseMessageId,
        overrideParentMessageId: isRegenerate ? messageId : null,
      },
      messages: currentMessages,
      isEdited: isEditOrContinue,
      isContinued,
      isRegenerate,
      initialResponse,
      isTemporary,
      ephemeralAgent,
      editedContent,
    };

    if (isRegenerate) {
      setMessages([...submission.messages, initialResponse]);
    } else {
      setMessages([...submission.messages, currentMsg, initialResponse]);
    }
    if (index === 0 && setLatestMessage) {
      setLatestMessage(initialResponse);
    }

    setSubmission(submission);
    logger.dir('message_stream', submission, { depth: null });
  };

  const regenerate = ({ parentMessageId }) => {
    const messages = getMessages();
    const parentMessage = messages?.find((element) => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isRegenerate: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found or not created by user.',
      );
    }
  };

  return {
    ask,
    regenerate,
  };
}
