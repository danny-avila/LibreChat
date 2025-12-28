import { useCallback, useRef } from 'react';
import {
  Constants,
  StepTypes,
  ContentTypes,
  ToolCallTypes,
  getNonEmptyValue,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  PartMetadata,
  ContentMetadata,
  EventSubmission,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { AnnounceOptions } from '~/common';
import { MESSAGE_UPDATE_INTERVAL } from '~/common';

type TUseStepHandler = {
  announcePolite: (options: AnnounceOptions) => void;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  /** @deprecated - isSubmitting should be derived from submission state */
  setIsSubmitting?: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
};

type TStepEvent = {
  event: string;
  data:
    | Agents.MessageDeltaEvent
    | Agents.AgentUpdate
    | Agents.RunStep
    | Agents.ToolEndEvent
    | {
        runId?: string;
        message: string;
      };
};

type MessageDeltaUpdate = { type: ContentTypes.TEXT; text: string; tool_call_ids?: string[] };

type ReasoningDeltaUpdate = { type: ContentTypes.THINK; think: string };

type AllContentTypes =
  | ContentTypes.TEXT
  | ContentTypes.THINK
  | ContentTypes.TOOL_CALL
  | ContentTypes.IMAGE_FILE
  | ContentTypes.IMAGE_URL
  | ContentTypes.ERROR;

export default function useStepHandler({
  setMessages,
  getMessages,
  announcePolite,
  lastAnnouncementTimeRef,
}: TUseStepHandler) {
  const toolCallIdMap = useRef(new Map<string, string | undefined>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());

  /**
   * Calculate content index for a run step.
   * For edited content scenarios, offset by initialContent length.
   */
  const calculateContentIndex = useCallback(
    (
      serverIndex: number,
      initialContent: TMessageContentParts[],
      incomingContentType: string,
      existingContent?: TMessageContentParts[],
    ): number => {
      /** Only apply -1 adjustment for TEXT or THINK types when they match existing content */
      if (
        initialContent.length > 0 &&
        (incomingContentType === ContentTypes.TEXT || incomingContentType === ContentTypes.THINK)
      ) {
        const targetIndex = serverIndex + initialContent.length - 1;
        const existingType = existingContent?.[targetIndex]?.type;
        if (existingType === incomingContentType) {
          return targetIndex;
        }
      }
      return serverIndex + initialContent.length;
    },
    [],
  );

  /** Metadata to propagate onto content parts for parallel rendering - uses ContentMetadata from data-provider */

  const updateContent = (
    message: TMessage,
    index: number,
    contentPart: Agents.MessageContentComplex,
    finalUpdate = false,
    metadata?: ContentMetadata,
  ) => {
    const contentType = contentPart.type ?? '';
    if (!contentType) {
      console.warn('No content type found in content part');
      return message;
    }

    const updatedContent = [...(message.content || [])] as Array<
      Partial<TMessageContentParts> | undefined
    >;
    if (!updatedContent[index]) {
      updatedContent[index] = { type: contentPart.type as AllContentTypes };
    }

    /** Prevent overwriting an existing content part with a different type */
    const existingType = (updatedContent[index]?.type as string | undefined) ?? '';
    if (
      existingType &&
      existingType !== contentType &&
      !contentType.startsWith(existingType) &&
      !existingType.startsWith(contentType)
    ) {
      console.warn('Content type mismatch', { existingType, contentType, index });
      return message;
    }

    if (
      contentType.startsWith(ContentTypes.TEXT) &&
      ContentTypes.TEXT in contentPart &&
      typeof contentPart.text === 'string'
    ) {
      const currentContent = updatedContent[index] as MessageDeltaUpdate;
      const update: MessageDeltaUpdate = {
        type: ContentTypes.TEXT,
        text: (currentContent.text || '') + contentPart.text,
      };

      if (contentPart.tool_call_ids != null) {
        update.tool_call_ids = contentPart.tool_call_ids;
      }
      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.AGENT_UPDATE) &&
      ContentTypes.AGENT_UPDATE in contentPart &&
      contentPart.agent_update
    ) {
      const update: Agents.AgentUpdate = {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: contentPart.agent_update,
      };

      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.THINK) &&
      ContentTypes.THINK in contentPart &&
      typeof contentPart.think === 'string'
    ) {
      const currentContent = updatedContent[index] as ReasoningDeltaUpdate;
      const update: ReasoningDeltaUpdate = {
        type: ContentTypes.THINK,
        think: (currentContent.think || '') + contentPart.think,
      };

      updatedContent[index] = update;
    } else if (contentType === ContentTypes.IMAGE_URL && 'image_url' in contentPart) {
      const currentContent = updatedContent[index] as {
        type: ContentTypes.IMAGE_URL;
        image_url: string;
      };
      updatedContent[index] = {
        ...currentContent,
      };
    } else if (contentType === ContentTypes.TOOL_CALL && 'tool_call' in contentPart) {
      const existingContent = updatedContent[index] as Agents.ToolCallContent | undefined;
      const existingToolCall = existingContent?.tool_call;
      const toolCallArgs = (contentPart.tool_call as Agents.ToolCall).args;
      /** When args are a valid object, they are likely already invoked */
      let args =
        finalUpdate ||
        typeof existingToolCall?.args === 'object' ||
        typeof toolCallArgs === 'object'
          ? contentPart.tool_call.args
          : (existingToolCall?.args ?? '') + (toolCallArgs ?? '');
      /** Preserve previously streamed args when final update omits them */
      if (finalUpdate && args == null && existingToolCall?.args != null) {
        args = existingToolCall.args;
      }

      const id = getNonEmptyValue([contentPart.tool_call.id, existingToolCall?.id]) ?? '';
      const name = getNonEmptyValue([contentPart.tool_call.name, existingToolCall?.name]) ?? '';

      const newToolCall: Agents.ToolCall & PartMetadata = {
        id,
        name,
        args,
        type: ToolCallTypes.TOOL_CALL,
        auth: contentPart.tool_call.auth,
        expires_at: contentPart.tool_call.expires_at,
      };

      if (finalUpdate) {
        newToolCall.progress = 1;
        newToolCall.output = contentPart.tool_call.output;
      }

      updatedContent[index] = {
        type: ContentTypes.TOOL_CALL,
        tool_call: newToolCall,
      };
    }

    // Apply metadata to the content part for parallel rendering
    // This must happen AFTER all content updates to avoid being overwritten
    if (metadata?.agentId != null || metadata?.groupId != null) {
      const part = updatedContent[index] as TMessageContentParts & ContentMetadata;
      if (metadata.agentId != null) {
        part.agentId = metadata.agentId;
      }
      if (metadata.groupId != null) {
        part.groupId = metadata.groupId;
      }
    }

    return { ...message, content: updatedContent as TMessageContentParts[] };
  };

  /** Extract metadata from runStep for parallel content rendering */
  const getStepMetadata = (runStep: Agents.RunStep | undefined): ContentMetadata | undefined => {
    if (!runStep?.agentId && runStep?.groupId == null) {
      return undefined;
    }
    const metadata = {
      agentId: runStep.agentId,
      // Only set groupId when explicitly provided by the server
      // Sequential handoffs have agentId but no groupId
      // Parallel execution has both agentId AND groupId
      groupId: runStep.groupId,
    };
    return metadata;
  };

  const stepHandler = useCallback(
    ({ event, data }: TStepEvent, submission: EventSubmission) => {
      const messages = getMessages() || [];
      const { userMessage } = submission;
      let parentMessageId = userMessage.messageId;

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      let initialContent: TMessageContentParts[] = [];
      // For editedContent scenarios, use the initial response content for index offsetting
      if (submission?.editedContent != null) {
        initialContent = submission?.initialResponse?.content ?? initialContent;
      }

      if (event === 'on_run_step') {
        const runStep = data as Agents.RunStep;
        let responseMessageId = runStep.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);

        // Calculate content index - use server index, offset by initialContent for edit scenarios
        const contentIndex = runStep.index + initialContent.length;

        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          // Find the actual response message - check if last message is a response, otherwise use initialResponse
          const lastMessage = messages[messages.length - 1] as TMessage;
          const responseMessage =
            lastMessage && !lastMessage.isCreatedByUser
              ? lastMessage
              : (submission?.initialResponse as TMessage);

          // For edit scenarios, initialContent IS the complete starting content (not to be merged)
          // For resume scenarios (no editedContent), initialContent is empty and we use existingContent
          const existingContent = responseMessage?.content ?? [];
          const mergedContent: TMessageContentParts[] =
            initialContent.length > 0 ? initialContent : existingContent;

          response = {
            ...responseMessage,
            parentMessageId,
            conversationId: userMessage.conversationId,
            messageId: responseMessageId,
            content: mergedContent,
          };

          messageMap.current.set(responseMessageId, response);

          // Get fresh messages to handle multi-tab scenarios where messages may have loaded
          // after this handler started (Tab 2 may have more complete history now)
          const freshMessages = getMessages() || [];
          const currentMessages = freshMessages.length > messages.length ? freshMessages : messages;

          // Remove any existing response placeholder
          let updatedMessages = currentMessages.filter((m) => m.messageId !== responseMessageId);

          // Ensure userMessage is present (multi-tab: Tab 2 may not have it yet)
          if (!updatedMessages.some((m) => m.messageId === userMessage.messageId)) {
            updatedMessages = [...updatedMessages, userMessage as TMessage];
          }

          setMessages([...updatedMessages, response]);
        }

        // Store tool call IDs if present
        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          let updatedResponse = { ...response };
          (runStep.stepDetails.tool_calls as Agents.ToolCall[]).forEach((toolCall) => {
            const toolCallId = toolCall.id ?? '';
            if ('id' in toolCall && toolCallId) {
              toolCallIdMap.current.set(runStep.id, toolCallId);
            }

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCall.name ?? '',
                args: toolCall.args,
                id: toolCallId,
              },
            };

            // Use the pre-calculated contentIndex which handles parallel agent indexing
            updatedResponse = updateContent(
              updatedResponse,
              contentIndex,
              contentPart,
              false,
              getStepMetadata(runStep),
            );
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_agent_update') {
        const { agent_update } = data as Agents.AgentUpdate;
        let responseMessageId = agent_update.runId || '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in agent update event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          // Agent updates don't need index adjustment
          const currentIndex = agent_update.index + initialContent.length;
          // Agent updates carry their own agentId - use default groupId if agentId is present
          const agentUpdateMeta: ContentMetadata | undefined = agent_update.agentId
            ? { agentId: agent_update.agentId, groupId: 1 }
            : undefined;
          const updatedResponse = updateContent(
            response,
            currentIndex,
            data,
            false,
            agentUpdateMeta,
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_message_delta') {
        const messageDelta = data as Agents.MessageDeltaEvent;
        const runStep = stepMap.current.get(messageDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for message delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && messageDelta.delta.content) {
          const contentPart = Array.isArray(messageDelta.delta.content)
            ? messageDelta.delta.content[0]
            : messageDelta.delta.content;

          if (contentPart == null) {
            return;
          }

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(
            response,
            currentIndex,
            contentPart,
            false,
            getStepMetadata(runStep),
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_reasoning_delta') {
        const reasoningDelta = data as Agents.ReasoningDeltaEvent;
        const runStep = stepMap.current.get(reasoningDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for reasoning delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && reasoningDelta.delta.content != null) {
          const contentPart = Array.isArray(reasoningDelta.delta.content)
            ? reasoningDelta.delta.content[0]
            : reasoningDelta.delta.content;

          if (contentPart == null) {
            return;
          }

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(
            response,
            currentIndex,
            contentPart,
            false,
            getStepMetadata(runStep),
          );
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_run_step_delta') {
        const runStepDelta = data as Agents.RunStepDeltaEvent;
        const runStep = stepMap.current.get(runStepDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for run step delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (
          response &&
          runStepDelta.delta.type === StepTypes.TOOL_CALLS &&
          runStepDelta.delta.tool_calls
        ) {
          let updatedResponse = { ...response };

          runStepDelta.delta.tool_calls.forEach((toolCallDelta) => {
            const toolCallId = toolCallIdMap.current.get(runStepDelta.id) ?? '';

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCallDelta.name ?? '',
                args: toolCallDelta.args ?? '',
                id: toolCallId,
              },
            };

            if (runStepDelta.delta.auth != null) {
              contentPart.tool_call.auth = runStepDelta.delta.auth;
              contentPart.tool_call.expires_at = runStepDelta.delta.expires_at;
            }

            // Use server's index, offset by initialContent for edit scenarios
            const currentIndex = runStep.index + initialContent.length;
            updatedResponse = updateContent(
              updatedResponse,
              currentIndex,
              contentPart,
              false,
              getStepMetadata(runStep),
            );
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_run_step_completed') {
        const { result } = data as unknown as { result: Agents.ToolEndEvent };

        const { id: stepId } = result;

        const runStep = stepMap.current.get(stepId);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for completed tool call event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          let updatedResponse = { ...response };

          const contentPart: Agents.MessageContentComplex = {
            type: ContentTypes.TOOL_CALL,
            tool_call: result.tool_call,
          };

          // Use server's index, offset by initialContent for edit scenarios
          const currentIndex = runStep.index + initialContent.length;
          updatedResponse = updateContent(
            updatedResponse,
            currentIndex,
            contentPart,
            true,
            getStepMetadata(runStep),
          );

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      }

      return () => {
        toolCallIdMap.current.clear();
        messageMap.current.clear();
        stepMap.current.clear();
      };
    },
    [getMessages, lastAnnouncementTimeRef, announcePolite, setMessages, calculateContentIndex],
  );

  const clearStepMaps = useCallback(() => {
    toolCallIdMap.current.clear();
    messageMap.current.clear();
    stepMap.current.clear();
  }, []);

  /**
   * Sync a message into the step handler's messageMap.
   * Call this after receiving sync event to ensure subsequent deltas
   * build on the synced content, not stale content.
   */
  const syncStepMessage = useCallback((message: TMessage) => {
    if (message?.messageId) {
      messageMap.current.set(message.messageId, { ...message });
    }
  }, []);

  return { stepHandler, clearStepMaps, syncStepMessage };
}
