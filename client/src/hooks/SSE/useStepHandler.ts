import { useCallback, useRef } from 'react';
import { StepTypes, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { Agents, PartMetadata, TMessage } from 'librechat-data-provider';
import { getNonEmptyValue } from 'librechat-data-provider';

type TUseStepHandler = {
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
};

type TStepEvent = {
  event: string;
  data: Agents.MessageDeltaEvent | Agents.RunStep | Agents.ToolEndEvent;
};

export default function useStepHandler({ setMessages, getMessages }: TUseStepHandler) {
  const toolCallIdMap = useRef(new Map<string, string>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());

  const updateContent = (
    message: TMessage,
    index: number,
    contentPart: Agents.MessageContentComplex,
    finalUpdate = false,
  ) => {
    if (!contentPart.type) {
      console.warn('No content type found in content part');
      return message;
    }

    const updatedContent = [...(message.content || [])];
    if (!updatedContent[index]) {
      updatedContent[index] = { type: contentPart.type };
    }

    if (
      contentPart.type.startsWith(ContentTypes.TEXT) &&
      ContentTypes.TEXT in contentPart &&
      typeof contentPart.text === 'string'
    ) {
      const currentContent = updatedContent[index] as { type: ContentTypes.TEXT; text: string };
      updatedContent[index] = {
        type: ContentTypes.TEXT,
        text: (currentContent.text || '') + contentPart.text,
      };
    } else if (contentPart.type === 'image_url' && 'image_url' in contentPart) {
      const currentContent = updatedContent[index] as { type: 'image_url'; image_url: string };
      updatedContent[index] = {
        ...currentContent,
      };
    } else if (contentPart.type === ContentTypes.TOOL_CALL && 'tool_call' in contentPart) {
      const existingContent = updatedContent[index] as Agents.ToolCallContent;

      const args = finalUpdate
        ? contentPart.tool_call.args
        : (existingContent?.tool_call?.args || '') + (contentPart.tool_call.args || '');

      const id = getNonEmptyValue([contentPart.tool_call.id, existingContent?.tool_call?.id]) ?? '';
      const name =
        getNonEmptyValue([contentPart.tool_call.name, existingContent?.tool_call?.name]) ?? '';

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

    return { ...message, content: updatedContent };
  };

  return useCallback(
    ({ event, data }: TStepEvent) => {
      const messages = getMessages() || [];

      if (event === 'on_run_step') {
        const runStep = data as Agents.RunStep;
        const responseMessageId = runStep.runId;
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);
        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          const responseMessage = messages[messages.length - 1] as TMessage;
          const userMessage = messages[messages.length - 2];

          response = {
            ...responseMessage,
            parentMessageId: userMessage?.messageId,
            conversationId: userMessage?.conversationId,
            messageId: responseMessageId,
            content: [],
          };

          messageMap.current.set(responseMessageId, response);
          setMessages([...messages.slice(0, -1), response]);
        }

        // Store tool call IDs if present
        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          runStep.stepDetails.tool_calls.forEach((toolCall) => {
            if ('id' in toolCall && toolCall.id) {
              toolCallIdMap.current.set(runStep.id, toolCall.id);
            }
          });
        }
      } else if (event === 'on_message_delta') {
        const messageDelta = data as Agents.MessageDeltaEvent;
        const runStep = stepMap.current.get(messageDelta.id);
        if (!runStep || !runStep.runId) {
          console.warn('No run step or runId found for message delta event');
          return;
        }

        const response = messageMap.current.get(runStep.runId);
        if (response && messageDelta.delta.content) {
          const contentPart = Array.isArray(messageDelta.delta.content)
            ? messageDelta.delta.content[0]
            : messageDelta.delta.content;

          const updatedResponse = updateContent(response, runStep.index, contentPart);

          messageMap.current.set(runStep.runId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_run_step_delta') {
        const runStepDelta = data as Agents.RunStepDeltaEvent;
        const runStep = stepMap.current.get(runStepDelta.id);
        if (!runStep || !runStep.runId) {
          console.warn('No run step or runId found for run step delta event');
          return;
        }

        const response = messageMap.current.get(runStep.runId);
        if (
          response &&
          runStepDelta.delta.type === StepTypes.TOOL_CALLS &&
          runStepDelta.delta.tool_calls
        ) {
          let updatedResponse = { ...response };

          runStepDelta.delta.tool_calls.forEach((toolCallDelta) => {
            const toolCallId = toolCallIdMap.current.get(runStepDelta.id) || '';

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCallDelta.name ?? '',
                args: toolCallDelta.args || '',
                id: toolCallId,
              },
            };

            updatedResponse = updateContent(updatedResponse, runStep.index, contentPart);
          });

          messageMap.current.set(runStep.runId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === runStep.runId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_run_step_completed') {
        const { result } = data as unknown as { result: Agents.ToolEndEvent };

        const { id: stepId } = result;

        const runStep = stepMap.current.get(stepId);
        if (!runStep || !runStep.runId) {
          console.warn('No run step or runId found for completed tool call event');
          return;
        }

        const response = messageMap.current.get(runStep.runId);
        if (response) {
          let updatedResponse = { ...response };

          const contentPart: Agents.MessageContentComplex = {
            type: ContentTypes.TOOL_CALL,
            tool_call: result.tool_call,
          };

          updatedResponse = updateContent(updatedResponse, runStep.index, contentPart, true);

          messageMap.current.set(runStep.runId, updatedResponse);
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
    [getMessages, stepMap, messageMap, setMessages, toolCallIdMap],
  );
}
