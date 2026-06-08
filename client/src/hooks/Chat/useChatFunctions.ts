import { v4 } from 'uuid';
import { cloneDeep } from 'lodash';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import {
  Constants,
  QueryKeys,
  ContentTypes,
  EModelEndpoint,
  getEndpointField,
  isAgentsEndpoint,
  parseCompactConvo,
  replaceSpecialVars,
  isAssistantsEndpoint,
  getDefaultParamsEndpoint,
} from 'librechat-data-provider';
import type {
  TMessage,
  TSubmission,
  TConversation,
  TStartupConfig,
  TEndpointOption,
  TEndpointsConfig,
  EndpointSchemaKey,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { TAskFunction, ExtendedFile } from '~/common';
import {
  logger,
  hasStreamStartFailed,
  createDualMessageContent,
  getRouteChatProjectId,
} from '~/utils';
import useSetFilesToDelete from '~/hooks/Files/useSetFilesToDelete';
import useGetSender from '~/hooks/Conversations/useGetSender';
import store, { useGetEphemeralAgent } from '~/store';
import { startupConfigKey } from '~/data-provider';
import useUserKey from '~/hooks/Input/useUserKey';
import { useAuthContext } from '~/hooks';

const logChatRequest = (request: Record<string, unknown>) => {
  logger.log('=====================================\nAsk function called with:');
  logger.dir(request);
  logger.log('=====================================');
};

const getAppendParentMessageId = ({
  latestMessage,
  currentMessages,
}: {
  latestMessage: TMessage | null;
  currentMessages: TMessage[];
}) => {
  if (!latestMessage) {
    return Constants.NO_PARENT;
  }

  if (!hasStreamStartFailed(latestMessage)) {
    return latestMessage.messageId;
  }

  const failedUserMessage = currentMessages.find(
    (message) => message.messageId === latestMessage.parentMessageId,
  );
  if (failedUserMessage?.isCreatedByUser !== true) {
    return latestMessage.messageId;
  }

  return failedUserMessage.parentMessageId ?? Constants.NO_PARENT;
};

type RegenerateTargetResponseArgs = {
  messages: TMessage[];
  parentMessageId?: string | null;
  targetResponseMessageId?: string | null;
  latestMessage?: TMessage | null;
};

const isAssistantResponseForParent = (
  message: TMessage | null | undefined,
  parentMessageId?: string | null,
): message is TMessage =>
  !!message &&
  !message.isCreatedByUser &&
  !!parentMessageId &&
  message.parentMessageId === parentMessageId;

export function getPreliminaryRegenerateResponseMessageId(
  responseMessageId?: string | null,
): string | null {
  if (typeof responseMessageId !== 'string' || responseMessageId.length === 0) {
    return null;
  }

  return `${responseMessageId.replace(/_+$/, '')}_`;
}

export function getRegenerateTargetResponseMessage({
  messages,
  parentMessageId,
  targetResponseMessageId,
  latestMessage,
}: RegenerateTargetResponseArgs): TMessage | null {
  if (!parentMessageId) {
    return null;
  }

  if (targetResponseMessageId) {
    const targetResponse = messages.find(
      (message) =>
        message.messageId === targetResponseMessageId &&
        isAssistantResponseForParent(message, parentMessageId),
    );
    if (targetResponse) {
      return targetResponse;
    }
  }

  if (isAssistantResponseForParent(latestMessage, parentMessageId)) {
    return latestMessage;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (isAssistantResponseForParent(message, parentMessageId)) {
      return message;
    }
  }

  return null;
}

export function getRegenerateSubmissionMessages({
  messages,
  targetResponseMessage,
  initialResponseId,
}: {
  messages: TMessage[];
  targetResponseMessage?: TMessage | null;
  initialResponseId?: string | null;
}): TMessage[] {
  if (targetResponseMessage?.messageId) {
    const targetIndex = messages.findIndex(
      (message) => message.messageId === targetResponseMessage.messageId,
    );
    if (targetIndex >= 0) {
      return messages.slice(0, targetIndex);
    }
  }

  return messages.filter((msg) => msg.messageId !== initialResponseId);
}

export default function useChatFunctions({
  index = 0,
  files,
  setFiles,
  getMessages,
  setMessages,
  isSubmitting,
  latestMessage,
  setSubmission,
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
}) {
  const navigate = useNavigate();
  const getSender = useGetSender();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const setFilesToDelete = useSetFilesToDelete();
  const getEphemeralAgent = useGetEphemeralAgent();
  const isTemporary = useRecoilValue(store.isTemporary);
  const { getExpiry } = useUserKey(immutableConversation?.endpoint ?? '');
  const setIsSubmitting = useSetRecoilState(store.isSubmittingFamily(index));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(index));

  /**
   * Atomically read + reset the per-conversation queue of manually-invoked
   * skills from the `$` popover. Reading and resetting in a single Recoil
   * snapshot guarantees that if the user selects more skills between here and
   * the next submission, their picks are never silently lost into a reset atom.
   *
   * The `hasValue` guard is defensive: this atom has a synchronous default of
   * `[]` so `.contents` is always the resolved value in practice, but reading
   * `.contents` on a loading/errored loadable yields a Promise/Error, which
   * would make the `string[]` cast unsound.
   */
  const drainPendingManualSkills = useRecoilCallback(
    ({ snapshot, reset }) =>
      (convoId: string): string[] => {
        const loadable = snapshot.getLoadable(store.pendingManualSkillsByConvoId(convoId));
        const skills = loadable.state === 'hasValue' ? (loadable.contents as string[]) : [];
        if (skills.length > 0) {
          reset(store.pendingManualSkillsByConvoId(convoId));
        }
        return skills;
      },
    [],
  );

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
      targetResponseMessageId,
      overrideManualSkills,
      addedConvo,
    } = {},
  ) => {
    setShowStopButton(false);

    text = text.trim();
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
    /**
     * Manual skill selection resolution:
     *  - Explicit `overrideManualSkills` wins (regenerate / save-and-submit
     *    pass the original user message's persisted `manualSkills` so the
     *    resubmitted turn primes the same skills — the pills are still
     *    visible to the user, it would be strange to quietly drop them).
     *  - Regenerate / continue / edit without an override → empty, and the
     *    compose-time atom is deliberately NOT drained (those flows replay
     *    a prior turn, not compose a new one).
     *  - Fresh submit → drain the per-convo atom into the message.
     */
    let manualSkills = overrideManualSkills;
    if (manualSkills == null) {
      manualSkills =
        isRegenerate || isContinued || isEdited
          ? []
          : drainPendingManualSkills(conversationId ?? Constants.NEW_CONVO);
    }
    const isEditOrContinue = isEdited || isContinued;

    let currentMessages: TMessage[] = overrideMessages ?? getMessages() ?? [];

    if (conversation?.promptPrefix) {
      conversation.promptPrefix = replaceSpecialVars({
        text: conversation.promptPrefix,
        user,
      });
    }

    const chatProjectId =
      conversationId === Constants.NEW_CONVO
        ? getRouteChatProjectId()
        : (conversation?.chatProjectId ?? null);
    const conversationForPayload =
      chatProjectId != null ? { ...(conversation ?? {}), chatProjectId } : (conversation ?? {});

    // construct the query message
    // this is not a real messageId, it is used as placeholder before real messageId returned
    const intermediateId = overrideUserMessageId ?? v4();
    parentMessageId =
      parentMessageId ?? getAppendParentMessageId({ latestMessage, currentMessages });

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
      const projectSearch = chatProjectId ? `?projectId=${encodeURIComponent(chatProjectId)}` : '';
      navigate(`/c/new${projectSearch}`, { state: { focusChat: true } });
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
    const targetResponseMessage = isRegenerate
      ? getRegenerateTargetResponseMessage({
          messages: currentMessages,
          parentMessageId: messageId,
          targetResponseMessageId,
          latestMessage,
        })
      : null;

    let thread_id = targetParentMessage?.thread_id ?? latestMessage?.thread_id;
    if (thread_id == null) {
      thread_id = currentMessages.find((message) => message.thread_id)?.thread_id;
    }

    const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
    const startupConfig = queryClient.getQueryData<TStartupConfig>(startupConfigKey(true));
    const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
    const iconURL = conversation?.iconURL;
    const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, endpoint);

    /** This becomes part of the `endpointOption` */
    const convo = parseCompactConvo({
      endpoint: endpoint as EndpointSchemaKey,
      endpointType: endpointType as EndpointSchemaKey,
      conversation: conversationForPayload,
      defaultParamsEndpoint,
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
      chatProjectId ? { chatProjectId } : {},
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
      /**
       * UI-only metadata. Survives reload because the backend persists the
       * field on the message schema, and `SkillPills` reads straight
       * off the message so there's no Recoil state to clean up. Runtime
       * skill resolution reads the top-level `manualSkills` payload field.
       */
      manualSkills: manualSkills.length > 0 ? manualSkills : undefined,
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
      (isRegenerate
        ? getPreliminaryRegenerateResponseMessageId(
            targetResponseMessage?.messageId ?? targetResponseMessageId,
          )
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
      model: convo?.model,
      error: false,
      iconURL,
      /**
       * Seed the assistant placeholder with the turn's manually-invoked
       * skill names so `ContentParts` can render interim `SkillCall` cards
       * from the very first render — no round-trip through the `created`
       * SSE event required. Rides along with every subsequent spread
       * (`useStepHandler` response construction, `updateContent` result
       * spreads) and drops out naturally at `finalHandler` when the
       * server-backed `responseMessage` replacement takes over.
       */
      manualSkills: manualSkills.length > 0 ? manualSkills : undefined,
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
      } else if (addedConvo && conversation) {
        // Pre-populate placeholders for smooth UI - these will be overridden/extended
        // as SSE events arrive with actual content, preserving the agent-based agentId
        initialResponse.content = createDualMessageContent(
          conversation,
          addedConvo,
          endpointsConfig,
          startupConfig?.modelSpecs?.list,
        );
      } else {
        initialResponse.content = [];
      }
      setIsSubmitting(true);
      setShowStopButton(true);
    }

    if (isContinued) {
      currentMessages = currentMessages.filter((msg) => msg.messageId !== responseMessageId);
    }

    const submissionMessages = isRegenerate
      ? getRegenerateSubmissionMessages({
          messages: currentMessages,
          targetResponseMessage,
          initialResponseId: initialResponse.messageId,
        })
      : currentMessages;
    const regenerateMessages = isRegenerate ? [...currentMessages] : undefined;

    logger.log('message_state', initialResponse);
    const submission: TSubmission = {
      conversation: {
        ...conversation,
        ...(chatProjectId ? { chatProjectId } : {}),
        conversationId,
      },
      endpointOption,
      userMessage: {
        ...currentMsg,
        responseMessageId,
        overrideParentMessageId: isRegenerate ? messageId : null,
      },
      messages: submissionMessages,
      regenerateMessages,
      isEdited: isEditOrContinue,
      isContinued,
      isRegenerate,
      initialResponse,
      isTemporary,
      ephemeralAgent,
      editedContent,
      addedConvo,
      manualSkills: manualSkills.length > 0 ? manualSkills : undefined,
    };

    if (isRegenerate) {
      setMessages([...submissionMessages, initialResponse]);
    } else {
      setMessages([...submissionMessages, currentMsg, initialResponse]);
    }

    setSubmission(submission);
    logger.dir('message_stream', submission, { depth: null });
  };

  const regenerate = (
    message: Partial<Pick<TMessage, 'messageId' | 'parentMessageId' | 'isCreatedByUser'>>,
    options?: { addedConvo?: TConversation | null },
  ) => {
    const messages = getMessages();
    const parentMessageId =
      message.isCreatedByUser === true ? message.messageId : message.parentMessageId;
    const targetResponseMessageId =
      message.isCreatedByUser === true ? undefined : message.messageId;
    const parentMessage = messages?.find((element) => element.messageId == parentMessageId);

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask(
        { ...parentMessage },
        {
          isRegenerate: true,
          addedConvo: options?.addedConvo ?? undefined,
          targetResponseMessageId,
          /** Carry the original user message's manual skill picks forward
           *  so the regenerated response is primed with the same skills.
           *  The compose-time atom was drained on the first submit; without
           *  this the model sees an unprimed turn even though the pills
           *  still show on the user bubble. */
          overrideManualSkills: parentMessage.manualSkills,
        },
      );
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
