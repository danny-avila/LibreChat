import { memo, useMemo, useCallback } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import { mapAttachments, groupSequentialToolCalls } from '~/utils';
import { MessageContext, SearchContext } from '~/Providers';
import { EditTextPart, EmptyText } from './Parts';
import PendingSkillCall from './Parts/PendingSkillCall';
import MemoryArtifacts from './MemoryArtifacts';
import ToolCallGroup from './ToolCallGroup';
import Container from './Container';
import Part from './Part';

type PartWithContextProps = {
  part: TMessageContentParts;
  idx: number;
  isLastPart: boolean;
  messageId: string;
  conversationId?: string | null;
  nextType?: string;
  isSubmitting: boolean;
  isLatestMessage?: boolean;
  isCreatedByUser: boolean;
  isLast: boolean;
  partAttachments: TAttachment[] | undefined;
};

const PartWithContext = memo(function PartWithContext({
  part,
  idx,
  isLastPart,
  messageId,
  conversationId,
  nextType,
  isSubmitting,
  isLatestMessage,
  isCreatedByUser,
  isLast,
  partAttachments,
}: PartWithContextProps) {
  const contextValue = useMemo(
    () => ({
      messageId,
      isExpanded: true as const,
      conversationId,
      partIndex: idx,
      nextType,
      isSubmitting,
      isLatestMessage,
    }),
    [messageId, conversationId, idx, nextType, isSubmitting, isLatestMessage],
  );

  return (
    <MessageContext.Provider value={contextValue}>
      <Part
        part={part}
        attachments={partAttachments}
        isSubmitting={isSubmitting}
        key={`part-${messageId}-${idx}`}
        isCreatedByUser={isCreatedByUser}
        isLast={isLastPart}
        showCursor={isLastPart && isLast}
      />
    </MessageContext.Provider>
  );
});

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
  /**
   * Skill names the user invoked manually via the `$` popover on this turn.
   * `createdHandler` seeds this on the assistant placeholder from
   * `submission.manualSkills`, and `finalHandler`'s server-backed
   * `responseMessage` replacement drops it — so the field is naturally
   * present only for the lifetime of the stream. Scalar string array (not
   * the full message object) so `React.memo` stays shallow-happy.
   */
  manualSkills?: string[];
  conversationId?: string | null;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
  isCreatedByUser: boolean;
  isLast: boolean;
  isSubmitting: boolean;
  isLatestMessage?: boolean;
  edit?: boolean;
  enterEdit?: (cancel?: boolean) => void | null | undefined;
  siblingIdx?: number;
  setSiblingIdx?:
    | ((value: number) => void | React.Dispatch<React.SetStateAction<number>>)
    | null
    | undefined;
};

/**
 * ContentParts renders message content parts, handling both sequential and parallel layouts.
 *
 * For 90% of messages (single-agent, no parallel execution), this renders sequentially.
 * For multi-agent parallel execution, it uses ParallelContentRenderer to show columns.
 */
const ContentParts = memo(function ContentParts({
  edit,
  isLast,
  content,
  manualSkills,
  messageId,
  enterEdit,
  siblingIdx,
  attachments,
  isSubmitting,
  setSiblingIdx,
  searchResults,
  conversationId,
  isCreatedByUser,
  isLatestMessage,
}: ContentPartsProps) {
  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  /**
   * Interim skill cards — rendered in a separate slot ABOVE the Parts
   * iteration based purely on the `manualSkills` message field. `content`
   * is only read to determine the "Running → Ran" visual transition
   * (`hasRealContent`), never to gate visibility, so backend deltas /
   * optimistic emissions can't race the pending cards off the screen.
   *
   * Lifecycle:
   *  - `useChatFunctions` seeds `manualSkills` on the assistant placeholder
   *    at construction → cards appear immediately on submit, with the
   *    shimmering "Running X" state (no content yet).
   *  - Through the stream, `useStepHandler` spreads the response on every
   *    update so `manualSkills` rides along; once the first real content
   *    part lands, `hasRealContent` flips true and the cards switch to
   *    the static "Ran X" state — matching what users see for
   *    model-invoked skills as they finish priming.
   *  - At finalize, `finalHandler` replaces the message with the server
   *    response (no `manualSkills` field) → interim cards disappear and
   *    the real `skill` tool_call part in `content` takes over.
   *
   * Skipped on the user side (they get `ManualSkillPills` on the user
   * bubble) and when no skills were invoked on this turn.
   */
  const pendingSkills = useMemo(
    () => (!isCreatedByUser && manualSkills != null ? manualSkills : []),
    [isCreatedByUser, manualSkills],
  );
  const hasPendingSkills = pendingSkills.length > 0;

  /**
   * True once the assistant has started streaming something meaningful —
   * any non-text part, OR a text part with non-empty content. Drives the
   * "Running X → Ran X" transition on pending cards. An empty-text
   * placeholder (some endpoints seed one in `initialResponse.content` on
   * assistant-side) does NOT count as real content, to avoid flipping
   * the transition before the model has actually produced anything.
   */
  const hasRealContent = useMemo(
    () =>
      (content ?? []).some((part) => {
        if (part == null) {
          return false;
        }
        if (part.type !== ContentTypes.TEXT) {
          return true;
        }
        const text = typeof part.text === 'string' ? part.text : (part.text?.value ?? '');
        return text.length > 0;
      }),
    [content],
  );

  const renderPendingSkills = () =>
    pendingSkills.map((name) => (
      <PendingSkillCall key={`pending-skill-${name}`} skillName={name} loaded={hasRealContent} />
    ));

  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean) => {
      const toolCallId = (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
      return (
        <PartWithContext
          key={`provider-${messageId}-${idx}`}
          idx={idx}
          part={part}
          isLast={isLast}
          messageId={messageId}
          isLastPart={isLastPart}
          conversationId={conversationId}
          isLatestMessage={isLatestMessage}
          isCreatedByUser={isCreatedByUser}
          nextType={content?.[idx + 1]?.type}
          isSubmitting={effectiveIsSubmitting}
          partAttachments={attachmentMap[toolCallId]}
        />
      );
    },
    [
      attachmentMap,
      content,
      conversationId,
      effectiveIsSubmitting,
      isCreatedByUser,
      isLast,
      isLatestMessage,
      messageId,
    ],
  );

  // Early return: no content to render AND no pending skill cards
  if (!content && !hasPendingSkills) {
    return null;
  }

  // Edit mode: render editable text parts. Interim skill cards are a
  // mid-stream concern, not relevant in edit mode.
  if (edit === true && enterEdit && setSiblingIdx) {
    return (
      <>
        {(content ?? []).map((part, idx) => {
          if (!part) {
            return null;
          }
          const isTextPart =
            part?.type === ContentTypes.TEXT ||
            typeof (part as unknown as Agents.MessageContentText)?.text === 'string';
          const isThinkPart =
            part?.type === ContentTypes.THINK ||
            typeof (part as unknown as Agents.ReasoningDeltaUpdate)?.think === 'string';
          if (!isTextPart && !isThinkPart) {
            return null;
          }

          const isToolCall = part.type === ContentTypes.TOOL_CALL || part['tool_call_ids'] != null;
          if (isToolCall) {
            return null;
          }

          return (
            <EditTextPart
              index={idx}
              part={part as Agents.MessageContentText | Agents.ReasoningDeltaUpdate}
              messageId={messageId}
              isSubmitting={isSubmitting}
              enterEdit={enterEdit}
              siblingIdx={siblingIdx ?? null}
              setSiblingIdx={setSiblingIdx}
              key={`edit-${messageId}-${idx}`}
            />
          );
        })}
      </>
    );
  }

  const safeContent = content ?? [];
  const showEmptyCursor = safeContent.length === 0 && effectiveIsSubmitting;
  const lastContentIdx = safeContent.length - 1;

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = safeContent.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    return (
      <>
        {renderPendingSkills()}
        <ParallelContentRenderer
          content={content}
          messageId={messageId}
          conversationId={conversationId}
          attachments={attachments}
          searchResults={searchResults}
          isSubmitting={effectiveIsSubmitting}
          renderPart={renderPart}
        />
      </>
    );
  }

  // Sequential content: render parts in order (90% of cases)
  const sequentialParts: PartWithIndex[] = [];
  safeContent.forEach((part, idx) => {
    if (part) {
      sequentialParts.push({ part, idx });
    }
  });
  const groupedParts = groupSequentialToolCalls(sequentialParts);

  return (
    <SearchContext.Provider value={{ searchResults }}>
      <MemoryArtifacts attachments={attachments} />
      {renderPendingSkills()}
      {showEmptyCursor && (
        <Container>
          <EmptyText />
        </Container>
      )}
      {groupedParts.map((group) => {
        if (group.type === 'single') {
          const { part, idx } = group.part;
          return renderPart(part, idx, idx === lastContentIdx);
        }
        return (
          <ToolCallGroup
            key={`tool-group-${group.parts[0].idx}`}
            parts={group.parts}
            isSubmitting={effectiveIsSubmitting}
            isLast={group.parts.some((p) => p.idx === lastContentIdx)}
            renderPart={renderPart}
            lastContentIdx={lastContentIdx}
          />
        );
      })}
    </SearchContext.Provider>
  );
});

export default ContentParts;
