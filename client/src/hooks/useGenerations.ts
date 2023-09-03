import type { TMessage } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';

type TUseGenerations = {
  endpoint?: string;
  message: TMessage;
  isSubmitting: boolean;
  isEditing?: boolean;
};

export default function useGenerations({
  endpoint,
  message,
  isSubmitting,
  isEditing = false,
}: TUseGenerations) {
  const latestMessage = useRecoilValue(store.latestMessage);

  const { error, messageId, searchResult, finish_reason, isCreatedByUser } = message ?? {};
  const isEditableEndpoint = !!['azureOpenAI', 'openAI', 'gptPlugins', 'anthropic'].find(
    (e) => e === endpoint,
  );

  const continueSupported =
    latestMessage?.messageId === messageId &&
    finish_reason &&
    finish_reason !== 'stop' &&
    !isEditing &&
    !searchResult &&
    isEditableEndpoint;

  const branchingSupported =
    // 5/21/23: Bing is allowing editing and Message regenerating
    !![
      'azureOpenAI',
      'openAI',
      'chatGPTBrowser',
      'google',
      'bingAI',
      'gptPlugins',
      'anthropic',
    ].find((e) => e === endpoint);

  const regenerateEnabled =
    !isCreatedByUser && !searchResult && !isEditing && !isSubmitting && branchingSupported;

  const hideEditButton =
    isSubmitting ||
    error ||
    searchResult ||
    !branchingSupported ||
    (!isEditableEndpoint && !isCreatedByUser);

  return {
    continueSupported,
    regenerateEnabled,
    hideEditButton,
  };
}
