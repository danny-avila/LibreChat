import { memo, useMemo } from 'react';
import type {
  TMessageContentParts,
  TContentMetadata,
  SearchResultData,
  TAttachment,
} from 'librechat-data-provider';
import { SearchContext } from '~/Providers';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import { EmptyText } from './Parts';
import SiblingHeader from './SiblingHeader';
import Container from './Container';
import { cn } from '~/utils';

export type PartWithIndex = { part: TMessageContentParts; idx: number };

export type ParallelColumn = {
  agentId: string;
  parts: PartWithIndex[];
};

export type ParallelSection = {
  groupId: number;
  columns: ParallelColumn[];
};

/**
 * Groups content parts by groupId for parallel rendering.
 * Parts with same groupId are displayed in columns, grouped by agentId.
 *
 * @param content - Array of content parts
 * @param contentMetadataMap - Optional map of content index to metadata (new approach)
 * @returns Object containing parallel sections and sequential parts
 */
export function groupParallelContent(
  content: Array<TMessageContentParts | undefined> | undefined,
  contentMetadataMap?: Map<number, TContentMetadata>,
): { parallelSections: ParallelSection[]; sequentialParts: PartWithIndex[] } {
  if (!content) {
    return { parallelSections: [], sequentialParts: [] };
  }

  const groupMap = new Map<number, PartWithIndex[]>();
  const noGroup: PartWithIndex[] = [];

  content.forEach((part, idx) => {
    if (!part) {
      return;
    }

    // Try to get metadata from map first (new approach), fall back to embedded metadata (legacy)
    const metadata = contentMetadataMap?.get(idx);
    const groupId =
      metadata?.groupId ?? (part as TMessageContentParts & { groupId?: number }).groupId;

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
      // Try metadata map first, fall back to embedded agentId
      const metadata = contentMetadataMap?.get(idx);
      const agentId =
        metadata?.agentId ??
        (part as TMessageContentParts & { agentId?: string }).agentId ??
        'unknown';

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
      }
      if (!aHasSuffix && bHasSuffix) {
        return -1;
      }
      return 0;
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
}

type ParallelColumnsProps = {
  columns: ParallelColumn[];
  groupId: number;
  messageId: string;
  isSubmitting: boolean;
  lastContentIdx: number;
  conversationId?: string | null;
  renderPart: (part: TMessageContentParts, idx: number, isLastPart: boolean) => React.ReactNode;
};

/**
 * Renders parallel content columns for a single groupId.
 */
export const ParallelColumns = memo(function ParallelColumns({
  columns,
  groupId,
  messageId,
  conversationId,
  isSubmitting,
  lastContentIdx,
  renderPart,
}: ParallelColumnsProps) {
  return (
    <div className={cn('flex w-full flex-col gap-3 md:flex-row', 'sibling-content-group')}>
      {columns.map(({ agentId, parts: columnParts }, colIdx) => {
        // Check if first part is an empty-type placeholder (will be replaced by real content)
        const firstPart = columnParts[0]?.part;
        const showPlaceholderCursor = isSubmitting && firstPart && !firstPart.type;

        return (
          <div
            key={`column-${messageId}-${groupId}-${agentId || colIdx}`}
            className="min-w-0 flex-1 rounded-lg border border-border-light p-3"
          >
            <SiblingHeader
              agentId={agentId}
              messageId={messageId}
              isSubmitting={isSubmitting}
              conversationId={conversationId}
            />
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
  );
});

type ParallelContentRendererProps = {
  content: Array<TMessageContentParts | undefined>;
  contentMetadataMap?: Map<number, TContentMetadata>;
  messageId: string;
  conversationId?: string | null;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
  isSubmitting: boolean;
  renderPart: (part: TMessageContentParts, idx: number, isLastPart: boolean) => React.ReactNode;
};

/**
 * Renders content with parallel sections (columns) and sequential parts.
 * Handles the layout of before/parallel/after content sections.
 */
export const ParallelContentRenderer = memo(function ParallelContentRenderer({
  content,
  contentMetadataMap,
  messageId,
  conversationId,
  attachments,
  searchResults,
  isSubmitting,
  renderPart,
}: ParallelContentRendererProps) {
  const { parallelSections, sequentialParts } = useMemo(
    () => groupParallelContent(content, contentMetadataMap),
    [content, contentMetadataMap],
  );

  const lastContentIdx = content.length - 1;

  // Split sequential parts into before/after parallel sections
  const { before, after } = useMemo(() => {
    if (parallelSections.length === 0) {
      return { before: sequentialParts, after: [] };
    }

    const allParallelIndices = parallelSections.flatMap((s) =>
      s.columns.flatMap((c) => c.parts.map((p) => p.idx)),
    );
    const minParallelIdx = Math.min(...allParallelIndices);
    const maxParallelIdx = Math.max(...allParallelIndices);

    return {
      before: sequentialParts.filter(({ idx }) => idx < minParallelIdx),
      after: sequentialParts.filter(({ idx }) => idx > maxParallelIdx),
    };
  }, [parallelSections, sequentialParts]);

  return (
    <SearchContext.Provider value={{ searchResults }}>
      <MemoryArtifacts attachments={attachments} />
      <Sources messageId={messageId} conversationId={conversationId || undefined} />

      {/* Sequential content BEFORE parallel sections */}
      {before.map(({ part, idx }) => renderPart(part, idx, false))}

      {/* Parallel sections - each group renders as columns */}
      {parallelSections.map(({ groupId, columns }) => (
        <ParallelColumns
          key={`parallel-group-${messageId}-${groupId}`}
          columns={columns}
          groupId={groupId}
          messageId={messageId}
          renderPart={renderPart}
          isSubmitting={isSubmitting}
          conversationId={conversationId}
          lastContentIdx={lastContentIdx}
        />
      ))}

      {/* Sequential content AFTER parallel sections */}
      {after.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
    </SearchContext.Provider>
  );
});

export default ParallelContentRenderer;
