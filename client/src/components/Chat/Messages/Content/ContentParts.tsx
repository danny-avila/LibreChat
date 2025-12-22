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
     * Group content parts by siblingIndex for side-by-side rendering.
     * Parts with the same siblingIndex are parallel content from multi-agent runs.
     */
    const groupedContent = useMemo(() => {
      if (!content) {
        return [];
      }

      type ContentGroup = {
        type: 'single' | 'siblings';
        parts: Array<{ part: TMessageContentParts; idx: number }>;
      };

      const groups: ContentGroup[] = [];
      let currentSiblingGroup: ContentGroup | null = null;

      content.forEach((part, idx) => {
        if (!part) {
          return;
        }

        const siblingIndex = (part as TMessageContentParts & { siblingIndex?: number })
          .siblingIndex;

        if (siblingIndex != null) {
          // This part has a siblingIndex - group with other siblings
          if (!currentSiblingGroup) {
            currentSiblingGroup = { type: 'siblings', parts: [] };
          }
          currentSiblingGroup.parts.push({ part, idx });
        } else {
          // No siblingIndex - render as single
          if (currentSiblingGroup) {
            groups.push(currentSiblingGroup);
            currentSiblingGroup = null;
          }
          groups.push({ type: 'single', parts: [{ part, idx }] });
        }
      });

      // Push any remaining sibling group
      if (currentSiblingGroup) {
        groups.push(currentSiblingGroup);
      }

      return groups;
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
          {groupedContent.map((group, groupIdx) => {
            const isLastGroup = groupIdx === groupedContent.length - 1;

            if (group.type === 'single') {
              const { part, idx } = group.parts[0];
              return renderPart(part, idx, isLastGroup && idx === content.length - 1);
            }

            // Render sibling group side-by-side
            return (
              <div
                key={`sibling-group-${messageId}-${groupIdx}`}
                className={cn('flex w-full flex-col gap-3 md:flex-row', 'sibling-content-group')}
              >
                {group.parts.map(({ part, idx }, partIdx) => (
                  <div key={`sibling-${messageId}-${idx}`} className="min-w-0 flex-1">
                    {renderPart(part, idx, isLastGroup && partIdx === group.parts.length - 1)}
                  </div>
                ))}
              </div>
            );
          })}
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
