import type { TMessage } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';

type TUseGenerations = {
  endpoint?: string;
  message: TMessage;
  isSubmitting: boolean;
  isEditing?: boolean;
  latestMessage: TMessage | null;
};

export default function useGenerationsByLatest({
  endpoint,
  message,
  isSubmitting,
  isEditing = false,
  latestMessage,
}: TUseGenerations) {
  const { error, messageId, searchResult, finish_reason, isCreatedByUser } = message ?? {};
  const isEditableEndpoint = !![
    EModelEndpoint.openAI,
    EModelEndpoint.custom,
    EModelEndpoint.google,
    EModelEndpoint.assistants,
    EModelEndpoint.anthropic,
    EModelEndpoint.gptPlugins,
    EModelEndpoint.azureOpenAI,
  ].find((e) => e === endpoint);

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
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.chatGPTBrowser,
      EModelEndpoint.google,
      EModelEndpoint.bingAI,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.anthropic,
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
