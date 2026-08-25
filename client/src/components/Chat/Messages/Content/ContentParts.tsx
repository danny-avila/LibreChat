import { memo, useRef, useMemo, useEffect, useCallback, Fragment } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import type { ReactNode, ReactElement } from 'react';
import type { ToolCallGroupExpansionState } from './ToolCallGroup';
import {
  mapAttachments,
  getPartKeyIndex,
  filterAttachmentsForPart,
  groupSequentialToolCalls,
} from '~/utils';
import WorkspaceChanges, { partitionWorkspaceChanges } from './Parts/WorkspaceChanges';
import { groupActivityPhases, lastCursorContentIdx } from '~/utils/activityLabels';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import MemoryArtifacts, { hasMemoryArtifacts } from './MemoryArtifacts';
import { MessageContext, SearchContext } from '~/Providers';
import PendingSkillCall from './Parts/PendingSkillCall';
import ActivityPhaseGroup from './ActivityPhaseGroup';
import { hasPendingApprovalInPart } from '~/utils';
import EditContentParts from './EditContentParts';
import { EmptyText, AgentUpdate } from './Parts';
import ApprovalProvider from './ApprovalContext';
import Sources from '~/components/Web/Sources';
import ToolCallGroup from './ToolCallGroup';
import Container from './Container';
import Part from './Part';

/** An empty TEXT part — the placeholder some endpoints seed in
 * `initialResponse.content` before the model produces anything. */
const isEmptyTextPart = (part: TMessageContentParts | undefined): boolean => {
  if (part == null || part.type !== ContentTypes.TEXT) {
    return false;
  }
  const text = typeof part.text === 'string' ? part.text : (part.text?.value ?? '');
  return text.length === 0;
};

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
  let firstToolKeyIdx: number | undefined;
  for (const { part, idx } of parts) {
    const toolCallId = getToolCallId(part);
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    if (firstToolKeyIdx === undefined && part?.type === ContentTypes.TOOL_CALL) {
      firstToolKeyIdx = getPartKeyIndex(part, idx);
    }
  }
  /** Same reasoning for id-less tool calls: anchor to the first TOOL entry's
   *  index rather than the block's first part, which shifts when reasoning is
   *  absorbed. Only a block with no tool call at all falls back to `parts[0]`. */
  return `fallback:${fallbackScope}:${firstToolKeyIdx ?? getPartKeyIndex(firstPart.part, firstPart.idx)}`;
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
        key={`part-${messageId}-${getPartKeyIndex(part, idx)}`}
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
  /** Internal recursion guard for nested phase segments. */
  nestedActivityPhase?: boolean;
  /** Internal signal that the parent already removed message-level workspace attachments. */
  workspaceAttachmentsPartitioned?: boolean;
  /** Absolute transcript index represented by `content[0]` in a phase slice. */
  contentIndexOffset?: number;
  /** Absolute transcript index for each compacted sparse segment entry. */
  contentIndices?: ReadonlyArray<number>;
  /** Message-wide steer attribution retained across nested phase segments. */
  resumeAuthors?: ReadonlyMap<number, string | undefined>;
  /** Message-wide tool-group expansion overrides retained across phase slices. */
  toolGroupExpansionState?: Map<string, ToolCallGroupExpansionState>;
};

/**
 * ContentParts renders message content parts, handling both sequential and parallel layouts.
 *
 * For 90% of messages (single-agent, no parallel execution), this renders sequentially.
 * For multi-agent parallel execution, it uses ParallelContentRenderer to show columns.
 */
const ContentPartsBody = memo(function ContentPartsBody({
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
  nestedActivityPhase = false,
  workspaceAttachmentsPartitioned = false,
  contentIndexOffset = 0,
  contentIndices,
  resumeAuthors,
  toolGroupExpansionState,
}: ContentPartsProps) {
  const { inlineAttachments, workspaceChanges } = useMemo(
    () =>
      workspaceAttachmentsPartitioned
        ? { inlineAttachments: attachments ?? [], workspaceChanges: [] }
        : partitionWorkspaceChanges(attachments),
    [attachments, workspaceAttachmentsPartitioned],
  );
  const attachmentMap = useMemo(() => mapAttachments(inlineAttachments), [inlineAttachments]);
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;
  const localToolGroupExpansionRef = useRef(new Map<string, ToolCallGroupExpansionState>());
  const expansionState = toolGroupExpansionState ?? localToolGroupExpansionRef.current;
  const fallbackScopeRef = useRef({ messageId, scope: 0 });
  if (fallbackScopeRef.current.messageId !== messageId) {
    if (!effectiveIsSubmitting) {
      fallbackScopeRef.current.scope += 1;
      expansionState.clear();
    }
    fallbackScopeRef.current.messageId = messageId;
  }
  const fallbackScope = fallbackScopeRef.current.scope;
  const localIndexByAbsolute = useMemo(
    () =>
      contentIndices == null
        ? undefined
        : new Map(contentIndices.map((absoluteIndex, localIndex) => [absoluteIndex, localIndex])),
    [contentIndices],
  );
  const absoluteIndexAt = useCallback(
    (localIndex: number) => contentIndices?.[localIndex] ?? localIndex + contentIndexOffset,
    [contentIndexOffset, contentIndices],
  );
  /** Hoisted above the early returns to feed the entrance-detection hook
   *  below, so it is memoized rather than re-walked on every unrelated
   *  re-render of a message that has no phases at all. */
  const phaseSegments = useMemo(
    () => (nestedActivityPhase ? undefined : groupActivityPhases(content)),
    [nestedActivityPhase, content],
  );
  const completedPhaseIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const segment of phaseSegments ?? []) {
      if (segment.type === 'phase') {
        indices.add(getPartKeyIndex(segment.labelPart, segment.labelIndex));
      }
    }
    return indices;
  }, [phaseSegments]);
  /** A phase label can finish after the root text stream settles, so
   *  `isSubmitting` is not a reliable entrance signal. Compare committed
   *  phase markers instead: a marker that appears after this renderer has
   *  mounted is live; markers present on the first render are history.
   *
   *  The recorded set is scoped to the message it described. `MultiMessage`
   *  renders siblings without a key, so this instance survives a sibling
   *  switch with its refs intact — an unscoped set would report the previous
   *  sibling's phases and animate the newly selected sibling's history. */
  const previousPhaseRef = useRef<{ messageId: string; indices: Set<number> } | null>(null);
  const previousPhaseIndices =
    previousPhaseRef.current?.messageId === messageId ? previousPhaseRef.current.indices : null;
  useEffect(() => {
    previousPhaseRef.current = { messageId, indices: completedPhaseIndices };
  }, [messageId, completedPhaseIndices]);

  const handleGroupExpansionChange = useCallback(
    (groupId: string, state: ToolCallGroupExpansionState) => {
      if (!state.userOverride) {
        expansionState.delete(groupId);
        return;
      }
      expansionState.set(groupId, state);
    },
    [expansionState],
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
    () => (content ?? []).some((part) => part != null && !isEmptyTextPart(part)),
    [content],
  );

  const renderPendingSkills = () =>
    pendingSkills.map((name) => (
      <PendingSkillCall key={`pending-skill-${name}`} skillName={name} loaded={hasRealContent} />
    ));

  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean) => {
      const localIdx = localIndexByAbsolute?.get(idx) ?? idx - contentIndexOffset;
      return (
        <PartWithContext
          key={`provider-${messageId}-${getPartKeyIndex(part, idx)}`}
          idx={idx}
          part={part}
          isLast={isLast}
          messageId={messageId}
          isLastPart={isLastPart}
          conversationId={conversationId}
          isLatestMessage={isLatestMessage}
          isCreatedByUser={isCreatedByUser}
          nextType={content?.[localIdx + 1]?.type}
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
      contentIndexOffset,
      localIndexByAbsolute,
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
      const localIdx = localIndexByAbsolute?.get(idx) ?? idx - contentIndexOffset;
      return (
        <PartWithContext
          key={`provider-${messageId}-${getPartKeyIndex(part, idx)}`}
          idx={idx}
          part={part}
          isLast={isLast}
          messageId={messageId}
          isLastPart={isLastPart}
          conversationId={conversationId}
          isLatestMessage={isLatestMessage}
          isCreatedByUser={isCreatedByUser}
          nextType={content?.[localIdx + 1]?.type}
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
      contentIndexOffset,
      localIndexByAbsolute,
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
  const { sequentialParts, detectedResumeAuthors } = useMemo(() => {
    const parts: PartWithIndex[] = [];
    const authors = new Map<number, string | undefined>();
    if (!content) {
      return { sequentialParts: parts, detectedResumeAuthors: authors };
    }
    let prevType: string | undefined;
    let activeAgentId: string | undefined;
    content.forEach((part, localIdx) => {
      if (!part) {
        return;
      }
      const idx = absoluteIndexAt(localIdx);
      if (prevType === ContentTypes.STEER && part.type !== ContentTypes.STEER) {
        authors.set(idx, activeAgentId);
      }
      if (part.type === ContentTypes.AGENT_UPDATE) {
        activeAgentId = part[ContentTypes.AGENT_UPDATE]?.agentId || undefined;
      }
      prevType = part.type;
      parts.push({ part, idx });
    });
    return { sequentialParts: parts, detectedResumeAuthors: authors };
  }, [absoluteIndexAt, content]);
  const postSteerAuthors = resumeAuthors ?? detectedResumeAuthors;

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
    (idx: number, keyIdx: number = idx): ReactElement | null => {
      if (authorHeader == null || !postSteerAuthors.has(idx)) {
        return null;
      }
      const activeAgentId = postSteerAuthors.get(idx);
      if (activeAgentId != null) {
        return <AgentUpdate key={`author-${messageId}-${keyIdx}`} currentAgentId={activeAgentId} />;
      }
      return <Fragment key={`author-${messageId}-${keyIdx}`}>{authorHeader}</Fragment>;
    },
    [authorHeader, postSteerAuthors, messageId],
  );

  // Early return: no content to render AND no pending skill cards
  if (!content && !hasPendingSkills && workspaceChanges.length === 0) {
    return null;
  }

  // Interim skill cards are a mid-stream concern, not relevant in edit mode.
  if (edit === true && enterEdit && setSiblingIdx) {
    return (
      <ApprovalProvider>
        <SearchContext.Provider value={{ searchResults }}>
          <MemoryArtifacts attachments={attachments} />
          <EditContentParts
            content={content ?? []}
            contentIndexOffset={contentIndexOffset}
            messageId={messageId}
            isSubmitting={isSubmitting}
            enterEdit={enterEdit}
            siblingIdx={siblingIdx ?? null}
            setSiblingIdx={setSiblingIdx}
            renderReadOnlyPart={(part, idx, isLastPart) => renderPart(part, idx, isLastPart)}
          />
          <WorkspaceChanges attachments={workspaceChanges} />
        </SearchContext.Provider>
      </ApprovalProvider>
    );
  }

  if (phaseSegments != null) {
    const relativeGlobalLastContentIdx = lastCursorContentIdx(content ?? []);
    const globalLastContentIdx =
      relativeGlobalLastContentIdx < 0 ? -1 : absoluteIndexAt(relativeGlobalLastContentIdx);
    /** Segment keys anchor to their first defined part's stable index, never
     *  to the segment's ordinal: hole-only slots form phantom segments while
     *  a run streams and vanish from the compacted final content, so ordinal
     *  keys shift at settle and remount every segment body after them. */
    const segmentKeyIndex = (segment: {
      content: Array<TMessageContentParts | undefined>;
      contentIndices: number[];
      startIndex: number;
    }): number => {
      for (let i = 0; i < segment.content.length; i++) {
        const part = segment.content[i];
        if (part != null) {
          return getPartKeyIndex(part, absoluteIndexAt(segment.contentIndices[i]));
        }
      }
      return absoluteIndexAt(segment.startIndex);
    };
    const renderSegment = (
      segmentContent: Array<TMessageContentParts | undefined>,
      segmentStartIndex: number,
      segmentIndices: ReadonlyArray<number>,
      key: string,
    ) => {
      return (
        <ContentPartsBody
          key={key}
          content={segmentContent}
          messageId={messageId}
          createdAt={createdAt}
          authorHeader={authorHeader}
          conversationId={conversationId}
          attachments={inlineAttachments}
          searchResults={searchResults}
          isCreatedByUser={isCreatedByUser}
          isLast={isLast && segmentIndices.includes(globalLastContentIdx)}
          isSubmitting={isSubmitting}
          isLatestMessage={isLatestMessage}
          nestedActivityPhase
          workspaceAttachmentsPartitioned
          contentIndexOffset={segmentStartIndex}
          contentIndices={segmentIndices}
          resumeAuthors={postSteerAuthors}
          toolGroupExpansionState={expansionState}
        />
      );
    };
    const hasParallelContent = content?.some((part) => part?.groupId != null) === true;
    return (
      <ApprovalProvider>
        <SearchContext.Provider value={{ searchResults }}>
          <MemoryArtifacts attachments={attachments} />
          {hasParallelContent && (
            <Sources messageId={messageId} conversationId={conversationId || undefined} />
          )}
          {renderPendingSkills()}
          {phaseSegments.map((segment) => {
            if (segment.type !== 'phase') {
              return renderSegment(
                segment.content,
                absoluteIndexAt(segment.startIndex),
                segment.contentIndices.map(absoluteIndexAt),
                `phase-adjacent-${segmentKeyIndex(segment)}`,
              );
            }
            const phaseKeyIndex = getPartKeyIndex(segment.labelPart, segment.labelIndex);
            return (
              <ActivityPhaseGroup
                key={`activity-phase-${messageId}-${phaseKeyIndex}`}
                labelPart={segment.labelPart}
                hasContent={segment.hasContent}
                hasPendingApproval={segment.content.some(
                  (part) => part != null && hasPendingApprovalInPart(part),
                )}
                animateEntrance={
                  previousPhaseIndices != null && !previousPhaseIndices.has(phaseKeyIndex)
                }
                showCursor={
                  isLast &&
                  effectiveIsSubmitting &&
                  absoluteIndexAt(segment.labelIndex) === globalLastContentIdx
                }
              >
                {renderSegment(
                  segment.content,
                  absoluteIndexAt(segment.startIndex),
                  segment.contentIndices.map(absoluteIndexAt),
                  `phase-content-${phaseKeyIndex}`,
                )}
              </ActivityPhaseGroup>
            );
          })}
          <WorkspaceChanges attachments={workspaceChanges} />
        </SearchContext.Provider>
      </ApprovalProvider>
    );
  }

  const safeContent = content ?? [];
  /** A solitary seeded empty TEXT part (useChatFunctions' assistant-side
   *  placeholder) is the same waiting state as no content at all — route it
   *  through EmptyText instead of Markdown's flush initializing dot so both
   *  flows share the gated header-axis nudge. Never solitary mid-stream, so
   *  empty TEXT after real parts keeps its flush in-flow cursor. */
  const solitaryEmptyText = safeContent.length === 1 && isEmptyTextPart(safeContent[0]);
  const showEmptyCursor = (safeContent.length === 0 || solitaryEmptyText) && effectiveIsSubmitting;
  /** Skips trailing blank label reservations and empty provider placeholders,
   * keeping the cursor attached to the last visible output. */
  const relativeLastContentIdx = lastCursorContentIdx(safeContent);
  const lastContentIdx = relativeLastContentIdx < 0 ? -1 : absoluteIndexAt(relativeLastContentIdx);

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = safeContent.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    const parallelContent = (
      <>
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
          showDecorations={!nestedActivityPhase}
          contentIndexOffset={contentIndexOffset}
          contentIndices={contentIndices}
        />
        {!nestedActivityPhase && <WorkspaceChanges attachments={workspaceChanges} />}
      </>
    );
    return nestedActivityPhase ? (
      parallelContent
    ) : (
      <ApprovalProvider>{parallelContent}</ApprovalProvider>
    );
  }

  // Sequential content: render parts in order (90% of cases)
  const sequentialContent = (
    <SearchContext.Provider value={{ searchResults }}>
      {!nestedActivityPhase && <MemoryArtifacts attachments={attachments} />}
      {!nestedActivityPhase && renderPendingSkills()}
      {showEmptyCursor && (
        <Container>
          {/** Nudge only when the dot is truly first under the header — leading
           * memory/skill rows and nested phases keep it flush. */}
          <EmptyText
            underHeaderIcon={
              !nestedActivityPhase && !hasPendingSkills && !hasMemoryArtifacts(attachments)
            }
          />
        </Container>
      )}
      {!showEmptyCursor &&
        groupedParts.flatMap((group) => {
          const first = group.type === 'single' ? group.part : group.parts[0];
          const firstIdx = first?.idx ?? -1;
          const nodes: ReactElement[] = [];
          const attribution = renderResumeAttribution(
            firstIdx,
            first ? getPartKeyIndex(first.part, first.idx) : firstIdx,
          );
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
              initialExpansionState={expansionState.get(groupId)}
              onExpansionChange={(state) => handleGroupExpansionChange(groupId, state)}
              labelPart={group.labelPart}
            />,
          );
          return nodes;
        })}
      {!nestedActivityPhase && <WorkspaceChanges attachments={workspaceChanges} />}
    </SearchContext.Provider>
  );
  if (nestedActivityPhase) {
    return sequentialContent;
  }
  return <ApprovalProvider>{sequentialContent}</ApprovalProvider>;
});

const ContentParts = memo(function ContentParts(props: ContentPartsProps) {
  return <ContentPartsBody {...props} />;
});

export default ContentParts;
