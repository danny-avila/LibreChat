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
import parseJsonField from './Parts/parseJsonField';
import MemoryArtifacts from './MemoryArtifacts';
import SkillCall from './Parts/SkillCall';
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
   * Skill names the user invoked manually via the `$` popover on this turn,
   * seeded onto the message by `createdHandler` from `submission.manualSkills`.
   * Scalar array (not the full message object) so `React.memo`'s shallow
   * comparison on this component doesn't get churned every time the message
   * reference changes for unrelated reasons.
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
 * Derive the set of skill names already present in content as real `skill`
 * tool_call parts (from the backend's prime injection or a model call).
 * Used to drop the pending placeholder once the real prime part lands at
 * finalize — de-duplication is by `args.skillName`, not tool_call id, since
 * the synthetic's id (`pending_${name}`) differs from the real one
 * (`call_manual_skill_${runId}_${idx}`).
 */
function collectExistingSkillNames(
  content: Array<TMessageContentParts | undefined> | undefined,
): Set<string> {
  const names = new Set<string>();
  if (!content) {
    return names;
  }
  for (const part of content) {
    if (part?.type !== ContentTypes.TOOL_CALL) {
      continue;
    }
    const toolCall = (part as { tool_call?: { name?: string; args?: unknown } }).tool_call;
    if (toolCall?.name !== 'skill') {
      continue;
    }
    const skillName = parseJsonField(
      toolCall.args as string | Record<string, unknown> | undefined,
      'skillName',
    );
    if (skillName) {
      names.add(skillName);
    }
  }
  return names;
}

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
   * Pending skill cards — rendered ABOVE the Parts iteration as a separate
   * slot (not prepended to `content`), so synthetic entries don't shift
   * the indices React uses as keys for streamed text/tool parts and cause
   * remount flicker mid-stream.
   *
   * Each pending entry renders through the real `SkillCall` component with
   * `progress < 1` + empty `output` → the pulsing "Running X" UI. When the
   * backend's real prime `tool_call` (same skillName) lands in `content` at
   * finalize, `collectExistingSkillNames` filters it out of the pending set
   * and the real prime takes over in the Parts iteration. Layout is
   * identical because the backend unshifts primes to the front of content,
   * so the skill cards stay anchored to the top either way.
   *
   * Skipped on the user side (users see `ManualSkillPills` on their
   * bubble) and when no skills were queued on this turn.
   */
  const pendingSkillNames = useMemo(() => {
    if (isCreatedByUser || !manualSkills || manualSkills.length === 0) {
      return [];
    }
    const existingNames = collectExistingSkillNames(content);
    return manualSkills.filter((name) => !existingNames.has(name));
  }, [content, manualSkills, isCreatedByUser]);

  const renderPendingSkills = () => {
    if (pendingSkillNames.length === 0) {
      return null;
    }
    return (
      <>
        {pendingSkillNames.map((name) => (
          <SkillCall
            key={`pending-skill-${name}`}
            args={JSON.stringify({ skillName: name })}
            output=""
            initialProgress={0.1}
            isSubmitting={effectiveIsSubmitting}
          />
        ))}
      </>
    );
  };

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

  // Early return: no content to render AND no pending skill placeholders
  if (!content && pendingSkillNames.length === 0) {
    return null;
  }

  // Edit mode: render editable text parts. Pending skill placeholders are
  // a mid-stream concern, not relevant in edit mode.
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
