import { memo, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { MessageContext, SearchContext } from '~/Providers';
import { EditTextPart, EmptyText } from './Parts';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import { mapAttachments } from '~/utils/map';
import SiblingHeader from './SiblingHeader';
import Container from './Container';
import { cn } from '~/utils';
import Part from './Part';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
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

const ContentParts = memo(
  ({
    content,
    messageId,
    conversationId,
    attachments,
    searchResults,
    isCreatedByUser,
    isLast,
    isSubmitting,
    isLatestMessage,
    edit,
    enterEdit,
    siblingIdx,
    setSiblingIdx,
  }: ContentPartsProps) => {
    const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

    const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

    type PartWithIndex = { part: TMessageContentParts; idx: number };
    type ParallelSection = {
      groupId: number;
      columns: Array<{ agentId: string; parts: PartWithIndex[] }>;
    };

    /**
     * Quick check: does any content part have a groupId?
     * This is a fast O(n) scan with early exit - avoids expensive grouping logic 90% of the time.
     */
    const hasParallelContent = useMemo(() => {
      if (!content) {
        return false;
      }
      for (const part of content) {
        if (part && (part as TMessageContentParts & { groupId?: number }).groupId != null) {
          return true;
        }
      }
      return false;
    }, [content]);

    /**
     * Only compute parallel sections when we actually have parallel content.
     * This expensive grouping logic is skipped for 90% of messages.
     */
    const { parallelSections, sequentialParts } = useMemo(() => {
      if (!content || !hasParallelContent) {
        // Fast path: no grouping needed, just wrap parts with indices
        const parts: PartWithIndex[] = [];
        if (content) {
          content.forEach((part, idx) => {
            if (part) {
              parts.push({ part, idx });
            }
          });
        }
        return { parallelSections: [], sequentialParts: parts };
      }

      // Slow path: group content by groupId for parallel rendering
      const groupMap = new Map<number, PartWithIndex[]>();
      const noGroup: PartWithIndex[] = [];

      content.forEach((part, idx) => {
        if (!part) {
          return;
        }

        const groupId = (part as TMessageContentParts & { groupId?: number }).groupId;

        if (groupId != null) {
          if (!groupMap.has(groupId)) {
            groupMap.set(groupId, []);
          }
          groupMap.get(groupId)!.push({ part, idx });
        } else {
          noGroup.push({ part, idx });
        }
      });

      // Build parallel sections with columns grouped by agentId
      const sections: ParallelSection[] = [];
      for (const [groupId, parts] of groupMap) {
        const columnMap = new Map<string, PartWithIndex[]>();

        for (const { part, idx } of parts) {
          const agentId =
            (part as TMessageContentParts & { agentId?: string }).agentId || 'unknown';
          if (!columnMap.has(agentId)) {
            columnMap.set(agentId, []);
          }
          columnMap.get(agentId)!.push({ part, idx });
        }

        // Sort columns: primary agent (no ____N suffix) first, added agents (with suffix) second
        // This ensures consistent column ordering regardless of which agent responds first
        const sortedAgentIds = Array.from(columnMap.keys()).sort((a, b) => {
          const aHasSuffix = a.includes('____');
          const bHasSuffix = b.includes('____');
          if (aHasSuffix && !bHasSuffix) {
            return 1;
          } // a has suffix, b doesn't → b first
          if (!aHasSuffix && bHasSuffix) {
            return -1;
          } // a doesn't have suffix, b does → a first
          return 0; // both have or both don't have suffix → keep original order
        });

        const columns = sortedAgentIds.map((agentId) => ({
          agentId,
          parts: columnMap.get(agentId)!,
        }));

        sections.push({ groupId, columns });
      }

      // Sort sections by the minimum index in each section
      sections.sort((a, b) => {
        const aMin = Math.min(...a.columns.flatMap((c) => c.parts.map((p) => p.idx)));
        const bMin = Math.min(...b.columns.flatMap((c) => c.parts.map((p) => p.idx)));
        return aMin - bMin;
      });

      return { parallelSections: sections, sequentialParts: noGroup };
    }, [content, hasParallelContent]);

    if (!content) {
      return null;
    }

    if (edit === true && enterEdit && setSiblingIdx) {
      return (
        <>
          {content.map((part, idx) => {
            if (!part) {
              return null;
            }
            const isTextPart =
              part?.type === ContentTypes.TEXT ||
              typeof (part as unknown as Agents.MessageContentText)?.text !== 'string';
            const isThinkPart =
              part?.type === ContentTypes.THINK ||
              typeof (part as unknown as Agents.ReasoningDeltaUpdate)?.think !== 'string';
            if (!isTextPart && !isThinkPart) {
              return null;
            }

            const isToolCall =
              part.type === ContentTypes.TOOL_CALL || part['tool_call_ids'] != null;
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

    /** Show cursor placeholder when content is empty but actively submitting */
    const showEmptyCursor = content.length === 0 && effectiveIsSubmitting;

    const renderPart = (part: TMessageContentParts, idx: number, isLastPart: boolean) => {
      const toolCallId = (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
      const partAttachments = attachmentMap[toolCallId];

      return (
        <MessageContext.Provider
          key={`provider-${messageId}-${idx}`}
          value={{
            messageId,
            isExpanded: true,
            conversationId,
            partIndex: idx,
            nextType: content[idx + 1]?.type,
            isSubmitting: effectiveIsSubmitting,
            isLatestMessage,
          }}
        >
          <Part
            part={part}
            attachments={partAttachments}
            isSubmitting={effectiveIsSubmitting}
            key={`part-${messageId}-${idx}`}
            isCreatedByUser={isCreatedByUser}
            isLast={isLastPart}
            showCursor={isLastPart && isLast}
          />
        </MessageContext.Provider>
      );
    };

    // Split sequential parts into before/between/after parallel sections
    const getSequentialSegments = () => {
      if (!hasParallelContent || parallelSections.length === 0) {
        return { before: sequentialParts, after: [] };
      }

      // Find boundary indices for parallel sections
      const allParallelIndices = parallelSections.flatMap((s) =>
        s.columns.flatMap((c) => c.parts.map((p) => p.idx)),
      );
      const minParallelIdx = Math.min(...allParallelIndices);
      const maxParallelIdx = Math.max(...allParallelIndices);

      return {
        before: sequentialParts.filter(({ idx }) => idx < minParallelIdx),
        after: sequentialParts.filter(({ idx }) => idx > maxParallelIdx),
      };
    };

    const { before: sequentialBefore, after: sequentialAfter } = getSequentialSegments();
    const lastContentIdx = content.length - 1;

    return (
      <>
        <SearchContext.Provider value={{ searchResults }}>
          <MemoryArtifacts attachments={attachments} />
          <Sources messageId={messageId} conversationId={conversationId || undefined} />
          {showEmptyCursor && (
            <Container>
              <EmptyText />
            </Container>
          )}
          {hasParallelContent ? (
            <>
              {/* Sequential content BEFORE parallel sections */}
              {sequentialBefore.map(({ part, idx }) => renderPart(part, idx, false))}

              {/* Parallel sections - each group renders as columns */}
              {parallelSections.map(({ groupId, columns }) => (
                <div
                  key={`parallel-group-${messageId}-${groupId}`}
                  className={cn('flex w-full flex-col gap-3 md:flex-row', 'sibling-content-group')}
                >
                  {columns.map(({ agentId, parts: columnParts }, colIdx) => {
                    // Check if first part is an empty-type placeholder (will be replaced by real content)
                    const firstPart = columnParts[0]?.part;
                    const showPlaceholderCursor =
                      effectiveIsSubmitting && firstPart && !firstPart.type;

                    return (
                      <div
                        key={`column-${messageId}-${groupId}-${agentId || colIdx}`}
                        className="min-w-0 flex-1 rounded-lg border border-border-light p-3"
                      >
                        <SiblingHeader agentId={agentId} />
                        {showPlaceholderCursor ? (
                          <Container>
                            <EmptyText />
                          </Container>
                        ) : (
                          columnParts.map(({ part, idx }) => {
                            const isLastInColumn = idx === columnParts[columnParts.length - 1]?.idx;
                            const isLastContent = idx === lastContentIdx;
                            return renderPart(part, idx, isLastInColumn && isLastContent);
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Sequential content AFTER parallel sections */}
              {sequentialAfter.map(({ part, idx }) =>
                renderPart(part, idx, idx === lastContentIdx),
              )}
            </>
          ) : (
            // Sequential mode: render parts normally (non-parallel)
            sequentialParts.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))
          )}
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
