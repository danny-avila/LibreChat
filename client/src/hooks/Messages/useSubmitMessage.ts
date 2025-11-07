import { v4 } from 'uuid';
import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, replaceSpecialVars } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import { useN8nWebhook } from '~/hooks/useN8nWebhook';
import store from '~/store';

const appendIndex = (index: number, value?: string) => {
  if (!value) {
    return value;
  }
  return `${value}${Constants.COMMON_DIVIDER}${index}`;
};

export default function useSubmitMessage() {
  const { user } = useAuthContext();
  const methods = useChatFormContext();
  const { ask, index, getMessages, setMessages, latestMessage } = useChatContext();
  const { addedIndex, ask: askAdditional, conversation: addedConvo } = useAddedChatContext();
  const { callN8nWebhook, isLoading: isWebhookLoading } = useN8nWebhook();

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    async (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      
      // Check if n8n integration is enabled (you can add env var check here)
      const isN8nEnabled = process.env.REACT_APP_ENABLE_N8N === 'true';
      
      if (true) {
        try {
          // Call n8n webhook and get response
          const n8nResponse = await callN8nWebhook(data.text);
          
          // Create a mock AI response message to display n8n result
          const responseMessage = {
            messageId: v4(),
            text: n8nResponse,
            sender: 'Assistant',
            isCreatedByUser: false,
            parentMessageId: v4(),
            conversationId: v4(),
            clientTimestamp: new Date().toISOString(),
            error: false,
          };
          
          // Create user message
          const userMessage = {
            messageId: v4(),
            text: data.text,
            sender: 'User',
            isCreatedByUser: true,
            parentMessageId: latestMessage?.messageId || null,
            conversationId:  v4(),
            clientTimestamp: new Date().toISOString(),
            error: false,
          };
          
          // Update messages in the UI
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages, userMessage, responseMessage]);
          
          // Reset form
          methods.reset();
          return;
        } catch (error) {
          console.error('n8n webhook failed:', error);
          
          // Create error message instead of falling through to AI
          const errorMessage = {
            messageId: v4(),
            text: `n8n webhook failed: ${error.message}`,
            sender: 'System',
            isCreatedByUser: false,
            parentMessageId: v4(),
            conversationId:  v4(),
            clientTimestamp: new Date().toISOString(),
            error: true,
          };
          
          const userMessage = {
            messageId: v4(),
            text: data.text,
            sender: 'User',
            isCreatedByUser: true,
            parentMessageId: latestMessage?.messageId || null,
            conversationId:  v4(),
            clientTimestamp: new Date().toISOString(),
            error: false,
          };
          
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages, userMessage, errorMessage]);
          methods.reset();
          return; // Prevent AI model calls
        }
      }
      
      // If we reach here, n8n is disabled or not working, but we still want to prevent AI calls
      // Comment out or remove the lines below if you NEVER want AI model responses
      console.log('n8n integration is disabled or failed, skipping AI model calls');
      methods.reset();
      return;
      
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      const hasAdded = addedIndex && activeConvos[addedIndex] && addedConvo;
      const isNewMultiConvo =
        hasAdded &&
        activeConvos.every((convoId) => convoId === Constants.NEW_CONVO) &&
        !rootMessages?.length;
      const overrideConvoId = isNewMultiConvo ? v4() : undefined;
      const overrideUserMessageId = hasAdded ? v4() : undefined;
      const rootIndex = addedIndex - 1;
      const clientTimestamp = new Date().toISOString();

      ask({
        text: data.text,
        overrideConvoId: appendIndex(rootIndex, overrideConvoId),
        overrideUserMessageId: appendIndex(rootIndex, overrideUserMessageId),
        clientTimestamp,
      });

      if (hasAdded) {
        askAdditional(
          {
            text: data.text,
            overrideConvoId: appendIndex(addedIndex, overrideConvoId),
            overrideUserMessageId: appendIndex(addedIndex, overrideUserMessageId),
            clientTimestamp,
          },
          { overrideMessages: rootMessages },
        );
      }
      methods.reset();
    },
    [
      ask,
      methods,
      addedIndex,
      addedConvo,
      setMessages,
      getMessages,
      activeConvos,
      askAdditional,
      latestMessage,
      callN8nWebhook,
    ],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const currentText = methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt, isWebhookLoading };
}
