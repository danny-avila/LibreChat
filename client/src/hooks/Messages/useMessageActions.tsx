import { useRecoilValue } from 'recoil';
import { useCallback, useMemo, useState } from 'react';
import {
  isAssistantsEndpoint,
  isAgentsEndpoint,
  TMessageFeedback,
  TUpdateFeedbackRequest,
  TFeedbackRating,
  TFeedbackContent,
} from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import {
  useChatContext,
  useAddedChatContext,
  useAssistantsMapContext,
  useAgentsMapContext,
} from '~/Providers';
import useCopyToClipboard from './useCopyToClipboard';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';
import { useUpdateFeedbackMutation } from 'librechat-data-provider/react-query';

export type TMessageActions = Pick<
  TMessageProps,
  'message' | 'currentEditId' | 'setCurrentEditId'
> & {
  isMultiMessage?: boolean;
};
export default function useMessageActions(props: TMessageActions) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { message, currentEditId, setCurrentEditId, isMultiMessage } = props;

  const {
    ask,
    index,
    regenerate,
    latestMessage,
    handleContinue,
    setLatestMessage,
    conversation: rootConvo,
    isSubmitting: isSubmittingRoot,
  } = useChatContext();
  const { conversation: addedConvo, isSubmitting: isSubmittingAdditional } = useAddedChatContext();
  const conversation = useMemo(
    () => (isMultiMessage === true ? addedConvo : rootConvo),
    [isMultiMessage, addedConvo, rootConvo],
  );

  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();

  const { text, content, messageId = null, isCreatedByUser } = message ?? {};
  const edit = useMemo(() => messageId === currentEditId, [messageId, currentEditId]);
  const [rated, setRated] = useState<TMessageFeedback>({ rating: undefined });

  const enterEdit = useCallback(
    (cancel?: boolean) => setCurrentEditId && setCurrentEditId(cancel === true ? -1 : messageId),
    [messageId, setCurrentEditId],
  );

  const assistant = useMemo(() => {
    if (!isAssistantsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    const endpointKey = conversation?.endpoint ?? '';
    const modelKey = message?.model ?? '';

    return assistantMap?.[endpointKey] ? assistantMap[endpointKey][modelKey] : undefined;
  }, [conversation?.endpoint, message?.model, assistantMap]);

  const agent = useMemo(() => {
    if (!isAgentsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    if (!agentsMap) {
      return undefined;
    }

    const modelKey = message?.model ?? '';
    if (modelKey) {
      return agentsMap[modelKey];
    }

    const agentId = conversation?.agent_id ?? '';
    if (agentId) {
      return agentsMap[agentId];
    }
  }, [agentsMap, conversation?.agent_id, conversation?.endpoint, message?.model]);

  const isSubmitting = useMemo(
    () => (isMultiMessage === true ? isSubmittingAdditional : isSubmittingRoot),
    [isMultiMessage, isSubmittingAdditional, isSubmittingRoot],
  );

  const regenerateMessage = useCallback(() => {
    if ((isSubmitting && isCreatedByUser === true) || !message) {
      return;
    }

    regenerate(message);
  }, [isSubmitting, isCreatedByUser, message, regenerate]);

  const copyToClipboard = useCopyToClipboard({ text, content });

  const messageLabel = useMemo(() => {
    if (message?.isCreatedByUser === true) {
      return UsernameDisplay ? (user?.name ?? '') || user?.username : localize('com_user_message');
    } else if (agent) {
      return agent.name ?? 'Assistant';
    } else if (assistant) {
      return assistant.name ?? 'Assistant';
    } else {
      return message?.sender;
    }
  }, [message, agent, assistant, UsernameDisplay, user, localize]);

  const feedbackMutation = useUpdateFeedbackMutation(
    conversation?.conversationId || '',
    message?.messageId || '',
  );

  const handleFeedback = useCallback(
    (rating: TFeedbackRating, content?: TFeedbackContent) => {
      if (!conversation?.conversationId || !message?.messageId || !feedbackMutation?.mutate) {
        console.error('Feedback mutation is not available.');
        return;
      }
      // Format the payload based on the direct content parameter
      const formattedPayload: TUpdateFeedbackRequest = { rating };

      if (content) {
        formattedPayload.ratingContent = {
          tags: Array.isArray(content.tags) ? content.tags : [],
          text: typeof content.text === 'string' ? content.text : '',
        };
      }
      feedbackMutation.mutate(formattedPayload, {
        onSuccess: (data) => {
          const convertedData: TMessageFeedback = {
            rating: data.rating,
            ratingContent: data.ratingContent as TFeedbackContent,
          };

          setRated(convertedData);
        },
      });
    },
    [conversation?.conversationId, message?.messageId, feedbackMutation],
  );

  return {
    ask,
    edit,
    index,
    agent,
    assistant,
    enterEdit,
    conversation,
    messageLabel,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    setLatestMessage,
    regenerateMessage,
    handleFeedback,
    rated,
  };
}
