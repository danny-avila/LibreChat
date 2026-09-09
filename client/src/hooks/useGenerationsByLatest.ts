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
  /** The editor would show at least one field for this message. A turn made only
   *  of a summary, an error or tool calls offers none. */
  hasEditablePart?: boolean;
  /** For a model turn: whether the message it hangs off is the user turn a rerun
   *  would replay. `undefined` when the thread is unavailable (a search or share
   *  row) or the parent was not resolved, which withholds nothing. */
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
  hasEditablePart = true,
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
   *  a model turn hanging off another model turn has none: the submission would
   *  mint a user message under an existing response's id and run on empty text.
   *  A manual compaction is that shape by construction — it parents onto the leaf
   *  it summarized — and an imported or restored thread reaches it whenever a
   *  reply is chained onto a reply. An unknown parent withholds nothing, and the
   *  rerun paths refuse it on their own. */
  const hasNoUserTurnToReplay = !isCreatedByUser && parentIsUserMessage === false;

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
    !hasNoUserTurnToReplay &&
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
    !hasNoUserTurnToReplay &&
    branchingSupported;

  const isActiveStreamingMessage =
    isSubmitting && (latestMessageId == null || messageId === latestMessageId);

  /** The editor stays available on a model turn with no user turn behind it as
   *  long as it has a part to edit — an imported chain's reply is still saved
   *  directly, which needs no rerun. A turn with neither, the manual compaction
   *  shape whether it finished or persisted an error part, would open an editor
   *  with no field and one inert Rerun. */
  const hideEditButton =
    isActiveStreamingMessage ||
    error ||
    searchResult ||
    (hasNoUserTurnToReplay && !hasEditablePart) ||
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
