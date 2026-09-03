import { Constants, EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';

type TUseGenerations = {
  error?: boolean;
  endpoint?: string;
  messageId?: string;
  isEditing?: boolean;
  isSubmitting: boolean;
  searchResult?: boolean;
  finish_reason?: string;
  latestMessageId?: string;
  isCreatedByUser?: boolean;
};

export default function useGenerationsByLatest({
  error = false,
  endpoint,
  messageId,
  isEditing = false,
  isSubmitting,
  searchResult = false,
  finish_reason = '',
  latestMessageId,
  isCreatedByUser = false,
}: TUseGenerations) {
  const isEditableEndpoint = Boolean(
    [
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.google,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.anthropic,
      EModelEndpoint.azureOpenAI,
    ].find((e) => e === endpoint),
  );

  /** The tool-call-limit notice already offers Keep going / Answer now. The hover
   *  Continue would re-submit the parent user turn with `isContinued`, a different
   *  and weaker path sitting next to the intended one. */
  const continueSupported =
    latestMessageId === messageId &&
    Boolean(finish_reason) &&
    finish_reason !== 'stop' &&
    finish_reason !== Constants.TOOL_CALL_LIMIT_FINISH_REASON &&
    !isEditing &&
    !isSubmitting &&
    !searchResult &&
    isEditableEndpoint;

  const branchingSupported = Boolean(
    [
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.openAI,
      EModelEndpoint.custom,
      EModelEndpoint.agents,
      EModelEndpoint.bedrock,
      EModelEndpoint.google,
      EModelEndpoint.anthropic,
    ].find((e) => e === endpoint),
  );

  const regenerateEnabled =
    !isCreatedByUser && !searchResult && !isEditing && !isSubmitting && branchingSupported;

  const isActiveStreamingMessage =
    isSubmitting && (latestMessageId == null || messageId === latestMessageId);

  const hideEditButton =
    isActiveStreamingMessage ||
    error ||
    searchResult ||
    !branchingSupported ||
    (!isEditableEndpoint && !isCreatedByUser);

  const forkingSupported = !isAssistantsEndpoint(endpoint) && !searchResult;

  return {
    forkingSupported,
    continueSupported,
    regenerateEnabled,
    isActiveStreamingMessage,
    isEditableEndpoint,
    hideEditButton,
  };
}
