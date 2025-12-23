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

    /**
     * Partition content into columns by agentId for parallel agent rendering.
     * Each unique agentId gets its own column, containing all that agent's content.
     * Parts without agentId are rendered sequentially (non-parallel mode).
     */
    const { hasParallelContent, columns, sequentialParts } = useMemo(() => {
      if (!content) {
        return { hasParallelContent: false, columns: [], sequentialParts: [] };
      }

      // Collect parts by agentId (agent column)
      const columnMap = new Map<string, Array<{ part: TMessageContentParts; idx: number }>>();
      const sequential: Array<{ part: TMessageContentParts; idx: number }> = [];
      // Track order agents appeared for consistent column ordering
      const agentOrder: string[] = [];

      content.forEach((part, idx) => {
        if (!part) {
          return;
        }

        const partMeta = part as TMessageContentParts & { agentId?: string };
        const agentId = partMeta.agentId;

        if (agentId) {
          if (!columnMap.has(agentId)) {
            columnMap.set(agentId, []);
            agentOrder.push(agentId);
          }
          columnMap.get(agentId)!.push({ part, idx });
        } else {
          sequential.push({ part, idx });
        }
      });

      // Convert to sorted array of columns (maintain order agents appeared)
      const sortedColumns = agentOrder.map((agentId) => ({
        agentId,
        parts: columnMap.get(agentId)!,
      }));

      return {
        // Render in column mode if ANY parts have agentId (even if just one agent so far)
        // This ensures streaming content displays while waiting for other agents
        hasParallelContent: sortedColumns.length >= 1,
        columns: sortedColumns,
        sequentialParts: sequential,
      };
    }, [content]);

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
            // Parallel mode: render columns side-by-side, each column contains all agent's content
            <div
              key={`parallel-columns-${messageId}`}
              className={cn('flex w-full flex-col gap-3 md:flex-row', 'sibling-content-group')}
            >
              {columns.map(({ agentId, parts: columnParts }, colIdx) => {
                return (
                  <div
                    key={`column-${messageId}-${agentId || colIdx}`}
                    className="min-w-0 flex-1 rounded-lg border border-border-light p-3"
                  >
                    <SiblingHeader agentId={agentId} />
                    {columnParts.map(({ part, idx }) => {
                      const isLastInColumn = idx === columnParts[columnParts.length - 1]?.idx;
                      const isLastContent = idx === content.length - 1;
                      return renderPart(part, idx, isLastInColumn && isLastContent);
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            // Sequential mode: render parts normally (non-parallel)
            sequentialParts.map(({ part, idx }) =>
              renderPart(part, idx, idx === content.length - 1),
            )
          )}
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
