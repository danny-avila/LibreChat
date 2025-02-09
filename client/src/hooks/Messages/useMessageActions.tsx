import { useRecoilValue } from 'recoil';
import { useCallback, useMemo } from 'react';
import { isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
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
  };
}
