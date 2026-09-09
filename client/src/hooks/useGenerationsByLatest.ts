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
  /** Every content part of this message is a summary. Half of the manual
   *  compaction shape; on its own it also matches a turn that auto-summarized and
   *  was cancelled before its first answer token. */
  isSummaryOnlyContent?: boolean;
  /** For a model turn: whether the message it hangs off is the user turn a rerun
   *  would replay. `undefined` when the thread is unavailable (a search or share
   *  row) or the parent was not resolved, which withholds nothing. A manual
   *  compaction parents onto the leaf it summarized, so it is the one model turn
   *  with no user turn behind it. */
  parentIsUserMessage?: boolean;
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
  isSummaryOnlyContent = false,
  parentIsUserMessage,
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

  /** Every rerun shape replays the message's parent as the turn's user message, so
   *  a manual compaction has nothing to replay: it parents onto the leaf it
   *  summarized, and the submission would mint a user message under an existing
   *  response's id. Both halves are required — a model turn hanging off another
   *  model turn is otherwise an ordinary imported or restored chain whose stored
   *  content stays editable, and summary-only content alone is also what a
   *  cancelled auto-summarized turn persists. A compaction's redo path is the
   *  context indicator's Compact action. An unknown parent withholds nothing, and
   *  the rerun paths refuse it on their own. */
  const isManualCompaction =
    !isCreatedByUser && isSummaryOnlyContent && parentIsUserMessage === false;

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
    !isManualCompaction &&
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
    !isCreatedByUser &&
    !searchResult &&
    !isEditing &&
    !isSubmitting &&
    !isManualCompaction &&
    branchingSupported;

  const isActiveStreamingMessage =
    isSubmitting && (latestMessageId == null || messageId === latestMessageId);

  const hideEditButton =
    isActiveStreamingMessage ||
    error ||
    searchResult ||
    isManualCompaction ||
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
