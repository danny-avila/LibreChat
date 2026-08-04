import { memo, useRef, useMemo, useCallback, Fragment } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import type { ReactNode, ReactElement } from 'react';
import type { ToolCallGroupExpansionState } from './ToolCallGroup';
import { mapAttachments, filterAttachmentsForPart, groupSequentialToolCalls } from '~/utils';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import { EditTextPart, EmptyText, AgentUpdate } from './Parts';
import { lastVisibleContentIdx } from '~/utils/activityLabels';
import { MessageContext, SearchContext } from '~/Providers';
import PendingSkillCall from './Parts/PendingSkillCall';
import ApprovalProvider from './ApprovalContext';
import MemoryArtifacts from './MemoryArtifacts';
import ToolCallGroup from './ToolCallGroup';
import Container from './Container';
import Part from './Part';

const getToolCallId = (part: TMessageContentParts): string =>
  (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';

const getPartAgentId = (part: TMessageContentParts): string | undefined =>
  (part as { agentId?: string })?.agentId ??
  (part?.[ContentTypes.TOOL_CALL] as { agentId?: string } | undefined)?.agentId;

const getToolGroupId = (parts: PartWithIndex[], fallbackScope: number): string => {
  const firstPart = parts[0];
  if (!firstPart) {
    return 'empty';
  }
  /** Keyed on the first TOOL CALL, not the first part. An activity label
   *  absorbs the block's leading THINK part when its text lands, so keying on
   *  `parts[0]` would flip the key mid-run — remounting the group and losing
   *  whatever the user had expanded. The tool calls themselves do not move. */
  let firstToolIdx: number | undefined;
  for (const { part, idx } of parts) {
    const toolCallId = getToolCallId(part);
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    if (firstToolIdx === undefined && part?.type === ContentTypes.TOOL_CALL) {
      firstToolIdx = idx;
    }
  }
  /** Same reasoning for id-less tool calls: anchor to the first TOOL entry's
   *  index rather than the block's first part, which shifts when reasoning is
   *  absorbed. Only a block with no tool call at all falls back to `parts[0]`. */
  return `fallback:${fallbackScope}:${firstToolIdx ?? firstPart.idx}`;
};

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
  hideAttachments?: boolean;
  onToolExpand?: () => void;
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
  hideAttachments,
  onToolExpand,
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
        hideAttachments={hideAttachments}
        onToolExpand={onToolExpand}
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
  /** ISO timestamp of the parent message, surfaced in parallel column headers. */
  createdAt?: string | null;
  /**
   * Author icon + label node re-rendered before content that resumes after an
   * inline STEER part — the steer renders as a full user turn inside the
   * response, so what follows must be visibly re-attributed to the author.
   */
  authorHeader?: ReactNode;
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
  authorHeader,
  conversationId,
  isCreatedByUser,
  isLatestMessage,
  createdAt,
}: ContentPartsProps) {
  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;
  const toolGroupExpansionRef = useRef(new Map<string, ToolCallGroupExpansionState>());
  const fallbackScopeRef = useRef({ messageId, scope: 0 });
  if (fallbackScopeRef.current.messageId !== messageId) {
    if (!effectiveIsSubmitting) {
      fallbackScopeRef.current.scope += 1;
      toolGroupExpansionRef.current.clear();
    }
    fallbackScopeRef.current.messageId = messageId;
  }
  const fallbackScope = fallbackScopeRef.current.scope;

  const handleGroupExpansionChange = useCallback(
    (groupId: string, state: ToolCallGroupExpansionState) => {
      if (!state.userOverride) {
        toolGroupExpansionRef.current.delete(groupId);
        return;
      }
      toolGroupExpansionRef.current.set(groupId, state);
    },
    [],
  );

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
   * Skipped on the user side (they get `SkillPills` on the user
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
          partAttachments={filterAttachmentsForPart(
            attachmentMap[getToolCallId(part)],
            getPartAgentId(part),
          )}
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

  const renderGroupedPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean, onToolExpand?: () => void) => {
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
          partAttachments={filterAttachmentsForPart(
            attachmentMap[getToolCallId(part)],
            getPartAgentId(part),
          )}
          hideAttachments
          onToolExpand={onToolExpand}
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

  /** `postSteerAuthors` marks each part that resumes the response after a
   *  steer block — where attribution is re-rendered. The value is the ACTIVE
   *  agent id when a preceding AGENT_UPDATE handed the run off (the resumed
   *  content belongs to that agent, not the message-level author), undefined
   *  for the top-level `authorHeader`. Read BEFORE applying the current
   *  part's own handoff, so a resume point that IS an agent update keeps the
   *  pre-handoff author and lets the real marker announce the transition. */
  const { sequentialParts, postSteerAuthors } = useMemo(() => {
    const parts: PartWithIndex[] = [];
    const authors = new Map<number, string | undefined>();
    if (!content) {
      return { sequentialParts: parts, postSteerAuthors: authors };
    }
    let prevType: string | undefined;
    let activeAgentId: string | undefined;
    content.forEach((part, idx) => {
      if (!part) {
        return;
      }
      if (prevType === ContentTypes.STEER && part.type !== ContentTypes.STEER) {
        authors.set(idx, activeAgentId);
      }
      if (part.type === ContentTypes.AGENT_UPDATE) {
        activeAgentId = part[ContentTypes.AGENT_UPDATE]?.agentId || undefined;
      }
      prevType = part.type;
      parts.push({ part, idx });
    });
    return { sequentialParts: parts, postSteerAuthors: authors };
  }, [content]);

  const groupedParts = useMemo(
    () =>
      groupSequentialToolCalls(sequentialParts).map((group) => {
        if (group.type === 'single') {
          return group;
        }
        const groupId = getToolGroupId(group.parts, fallbackScope);
        const groupAttachments = group.parts.flatMap(
          ({ part }) =>
            filterAttachmentsForPart(attachmentMap[getToolCallId(part)], getPartAgentId(part)) ??
            [],
        );
        return { ...group, groupId, groupAttachments };
      }),
    [sequentialParts, attachmentMap, fallbackScope],
  );

  /** The re-attribution node for a part resuming after a steer block, shared
   *  by the sequential path and the parallel renderer's sequential stretches. */
  const renderResumeAttribution = useCallback(
    (idx: number): ReactElement | null => {
      if (authorHeader == null || !postSteerAuthors.has(idx)) {
        return null;
      }
      const activeAgentId = postSteerAuthors.get(idx);
      if (activeAgentId != null) {
        return <AgentUpdate key={`author-${messageId}-${idx}`} currentAgentId={activeAgentId} />;
      }
      return <Fragment key={`author-${messageId}-${idx}`}>{authorHeader}</Fragment>;
    },
    [authorHeader, postSteerAuthors, messageId],
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
  /** Skips trailing BLANK label reservations — they render nothing, and
   *  counting one as last would strip the streaming cursor from the last
   *  VISIBLE part until the next delta. */
  const lastContentIdx = lastVisibleContentIdx(safeContent);

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = safeContent.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    return (
      <ApprovalProvider>
        {renderPendingSkills()}
        <ParallelContentRenderer
          content={content}
          messageId={messageId}
          createdAt={createdAt}
          conversationId={conversationId}
          attachments={attachments}
          searchResults={searchResults}
          isSubmitting={effectiveIsSubmitting}
          renderPart={renderPart}
          renderResumeAttribution={renderResumeAttribution}
        />
      </ApprovalProvider>
    );
  }

  // Sequential content: render parts in order (90% of cases)
  return (
    <ApprovalProvider>
      <SearchContext.Provider value={{ searchResults }}>
        <MemoryArtifacts attachments={attachments} />
        {renderPendingSkills()}
        {showEmptyCursor && (
          <Container>
            <EmptyText />
          </Container>
        )}
        {groupedParts.flatMap((group) => {
          const firstIdx = group.type === 'single' ? group.part.idx : (group.parts[0]?.idx ?? -1);
          const nodes: ReactElement[] = [];
          const attribution = renderResumeAttribution(firstIdx);
          if (attribution != null) {
            nodes.push(attribution);
          }
          if (group.type === 'single') {
            const { part, idx } = group.part;
            nodes.push(renderPart(part, idx, idx === lastContentIdx));
            return nodes;
          }
          const { groupId } = group;
          nodes.push(
            <ToolCallGroup
              key={`tool-group-${groupId}`}
              parts={group.parts}
              isSubmitting={effectiveIsSubmitting}
              /** The label part is CONSUMED into the header, not listed in
               *  `parts` — a filled label at the content tail must still
               *  mark its group as last or nothing holds the streaming
               *  cursor until the next delta. */
              isLast={
                group.parts.some((p) => p.idx === lastContentIdx) ||
                group.labelPart?.idx === lastContentIdx
              }
              renderPart={renderGroupedPart}
              lastContentIdx={lastContentIdx}
              groupAttachments={group.groupAttachments}
              initialExpansionState={toolGroupExpansionRef.current.get(groupId)}
              onExpansionChange={(state) => handleGroupExpansionChange(groupId, state)}
              labelPart={group.labelPart}
            />,
          );
          return nodes;
        })}
      </SearchContext.Provider>
    </ApprovalProvider>
  );
});

export default ContentParts;
