import type { TMessage } from 'librechat-data-provider';

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
  const continueSupported = !!['azureOpenAI', 'openAI', 'gptPlugins', 'anthropic'].find(
    (e) => e === endpoint,
  );

  const branchingSupported =
    // azureOpenAI, openAI, chatGPTBrowser support branching, so edit enabled
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
  // Sydney in bingAI supports branching, so edit enabled

  const editEnabled =
    !message?.error &&
    // message?.isCreatedByUser &&
    !message?.searchResult &&
    !isEditing &&
    branchingSupported;

  // for now, once branching is supported, regerate will be enabled
  const regenerateEnabled =
    // !message?.error &&
    !message?.isCreatedByUser &&
    !message?.searchResult &&
    !isEditing &&
    !isSubmitting &&
    branchingSupported;

  return {
    continueSupported,
    editEnabled,
    regenerateEnabled,
  };
}
