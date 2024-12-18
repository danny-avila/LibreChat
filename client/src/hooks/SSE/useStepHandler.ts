import { useCallback, useRef } from 'react';
import { StepTypes, ContentTypes, ToolCallTypes, getNonEmptyValue } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  PartMetadata,
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
  setIsSubmitting: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
};

type TStepEvent = {
  event: string;
  data:
    | Agents.MessageDeltaEvent
    | Agents.RunStep
    | Agents.ToolEndEvent
    | {
        runId?: string;
        message: string;
      };
};

type MessageDeltaUpdate = { type: ContentTypes.TEXT; text: string; tool_call_ids?: string[] };

type AllContentTypes =
  | ContentTypes.TEXT
  | ContentTypes.TOOL_CALL
  | ContentTypes.IMAGE_FILE
  | ContentTypes.IMAGE_URL
  | ContentTypes.ERROR;

export default function useStepHandler({
  setMessages,
  getMessages,
  setIsSubmitting,
  announcePolite,
  lastAnnouncementTimeRef,
}: TUseStepHandler) {
  const toolCallIdMap = useRef(new Map<string, string | undefined>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());

  const updateContent = (
    message: TMessage,
    index: number,
    contentPart: Agents.MessageContentComplex,
    finalUpdate = false,
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
      const toolCallArgs = (contentPart.tool_call.args as unknown as string | undefined) ?? '';

      const args = finalUpdate
        ? contentPart.tool_call.args
        : (existingToolCall?.args ?? '') + toolCallArgs;

      const id = getNonEmptyValue([contentPart.tool_call.id, existingToolCall?.id]) ?? '';
      const name = getNonEmptyValue([contentPart.tool_call.name, existingToolCall?.name]) ?? '';

      const newToolCall: Agents.ToolCall & PartMetadata = {
        id,
        name,
        args,
        type: ToolCallTypes.TOOL_CALL,
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

    return { ...message, content: updatedContent as TMessageContentParts[] };
  };

  return useCallback(
    ({ event, data }: TStepEvent, submission: EventSubmission) => {
      const messages = getMessages() || [];
      const { userMessage } = submission;
      setIsSubmitting(true);

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      if (event === 'on_run_step') {
        const runStep = data as Agents.RunStep;
        const responseMessageId = runStep.runId ?? '';
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);
        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          const responseMessage = messages[messages.length - 1] as TMessage;

          response = {
            ...responseMessage,
            parentMessageId: userMessage.messageId,
            conversationId: userMessage.conversationId,
            messageId: responseMessageId,
            content: [],
          };

          messageMap.current.set(responseMessageId, response);
          setMessages([...messages.slice(0, -1), response]);
        }

        // Store tool call IDs if present
        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          runStep.stepDetails.tool_calls.forEach((toolCall) => {
            const toolCallId = toolCall.id ?? '';
            if ('id' in toolCall && toolCallId) {
              toolCallIdMap.current.set(runStep.id, toolCallId);
            }
          });
        }
      } else if (event === 'on_agent_update') {
        const { runId, message } = data as { runId?: string; message: string };
        const responseMessageId = runId ?? '';
        if (!responseMessageId) {
          console.warn('No message id found in agent update event');
          return;
        }

        const responseMessage = messages[messages.length - 1] as TMessage;

        const response = {
          ...responseMessage,
          parentMessageId: userMessage.messageId,
          conversationId: userMessage.conversationId,
          messageId: responseMessageId,
          content: [
            {
              type: ContentTypes.TEXT,
              text: message,
            },
          ],
        } as TMessage;

        setMessages([...messages.slice(0, -1), response]);
      } else if (event === 'on_message_delta') {
        const messageDelta = data as Agents.MessageDeltaEvent;
        const runStep = stepMap.current.get(messageDelta.id);
        const responseMessageId = runStep?.runId ?? '';

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for message delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && messageDelta.delta.content) {
          const contentPart = Array.isArray(messageDelta.delta.content)
            ? messageDelta.delta.content[0]
            : messageDelta.delta.content;

          const updatedResponse = updateContent(response, runStep.index, contentPart);

          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_run_step_delta') {
        const runStepDelta = data as Agents.RunStepDeltaEvent;
        const runStep = stepMap.current.get(runStepDelta.id);
        const responseMessageId = runStep?.runId ?? '';

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

            updatedResponse = updateContent(updatedResponse, runStep.index, contentPart);
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === runStep.runId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_run_step_completed') {
        const { result } = data as unknown as { result: Agents.ToolEndEvent };

        const { id: stepId } = result;

        const runStep = stepMap.current.get(stepId);
        const responseMessageId = runStep?.runId ?? '';

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

          updatedResponse = updateContent(updatedResponse, runStep.index, contentPart, true);

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === runStep.runId ? updatedResponse : msg,
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
    [getMessages, setIsSubmitting, lastAnnouncementTimeRef, announcePolite, setMessages],
  );
}
