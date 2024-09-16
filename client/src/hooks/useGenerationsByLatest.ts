import type { TMessage } from 'librechat-data-provider';
import { EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';

type TUseGenerations = {
  endpoint?: string;
  message?: TMessage;
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
  const {
    messageId,
    searchResult = false,
    error = false,
    finish_reason = '',
    isCreatedByUser = false,
  } = message ?? {};
  const isEditableEndpoint = Boolean(
    [
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.google,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.anthropic,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.azureOpenAI,
    ].find((e) => e === endpoint),
  );

  const continueSupported =
    latestMessage?.messageId === messageId &&
    finish_reason &&
    finish_reason !== 'stop' &&
    !isEditing &&
    !searchResult &&
    isEditableEndpoint;

  const branchingSupported = Boolean(
    [
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.chatGPTBrowser,
      EModelEndpoint.google,
      EModelEndpoint.bingAI,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.anthropic,
    ].find((e) => e === endpoint),
  );

  const regenerateEnabled =
    !isCreatedByUser && !searchResult && !isEditing && !isSubmitting && branchingSupported;

  const hideEditButton =
    isSubmitting ||
    error ||
    searchResult ||
    !branchingSupported ||
    (!isEditableEndpoint && !isCreatedByUser);

  const forkingSupported = !isAssistantsEndpoint(endpoint) && !searchResult;

  return {
    forkingSupported,
    continueSupported,
    regenerateEnabled,
    isEditableEndpoint,
    hideEditButton,
  };
}
