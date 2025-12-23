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
  /** Message-level model/endpoint/agent for sibling header fallback */
  messageModel?: string | null;
  messageEndpoint?: string | null;
  messageAgentId?: string | null;
  /** message.sender - pre-computed display name */
  messageSender?: string | null;
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
    messageModel,
    messageEndpoint,
    messageAgentId,
    messageSender,
  }: ContentPartsProps) => {
    const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

    const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

    /**
     * Group content parts by siblingIndex for side-by-side rendering.
     * Parts with consecutive siblingIndex values (0, 1, 2...) are parallel content from the same step.
     * A new group starts when siblingIndex resets to 0 or when we encounter a part without siblingIndex.
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
      let lastSiblingIndex = -1;

      content.forEach((part, idx) => {
        if (!part) {
          return;
        }

        const siblingIndex = (part as TMessageContentParts & { siblingIndex?: number })
          .siblingIndex;

        if (siblingIndex != null) {
          // Check if this is a new sibling group (siblingIndex resets to 0 or goes backwards)
          const isNewGroup = siblingIndex <= lastSiblingIndex;

          if (isNewGroup && currentSiblingGroup) {
            // Push the previous group and start a new one
            groups.push(currentSiblingGroup);
            currentSiblingGroup = null;
          }

          if (!currentSiblingGroup) {
            currentSiblingGroup = { type: 'siblings', parts: [] };
          }
          currentSiblingGroup.parts.push({ part, idx });
          lastSiblingIndex = siblingIndex;
        } else {
          // No siblingIndex - render as single
          if (currentSiblingGroup) {
            groups.push(currentSiblingGroup);
            currentSiblingGroup = null;
          }
          groups.push({ type: 'single', parts: [{ part, idx }] });
          lastSiblingIndex = -1;
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

            // If sibling group has only 1 part, render as single to avoid layout shift during streaming
            if (group.parts.length === 1) {
              const { part, idx } = group.parts[0];
              return renderPart(part, idx, isLastGroup && idx === content.length - 1);
            }

            // Render sibling group side-by-side (only when we have 2+ siblings)
            // For sibling groups, check if this group contains the last content part
            const groupContainsLastContent = group.parts.some(
              ({ idx }) => idx === content.length - 1,
            );
            const isLastPartInMessage = isLastGroup && groupContainsLastContent;

            return (
              <div
                key={`sibling-group-${messageId}-${groupIdx}`}
                className={cn('flex w-full flex-col gap-3 md:flex-row', 'sibling-content-group')}
              >
                {group.parts.map(({ part, idx }) => {
                  const agentId = (part as TMessageContentParts & { agentId?: string }).agentId;
                  // Only pass message-level fallbacks for parts without their own agentId
                  // (i.e., the primary agent's content). Added agents have their own agentId
                  // which encodes their endpoint/model info.
                  const useMessageFallbacks = !agentId;

                  return (
                    <div
                      key={`sibling-${messageId}-${idx}`}
                      className="min-w-0 flex-1 rounded-lg border border-border-light p-3"
                    >
                      <SiblingHeader
                        agentId={agentId}
                        messageModel={useMessageFallbacks ? messageModel : undefined}
                        messageEndpoint={useMessageFallbacks ? messageEndpoint : undefined}
                        messageAgentId={useMessageFallbacks ? messageAgentId : undefined}
                        messageSender={useMessageFallbacks ? messageSender : undefined}
                      />
                      {renderPart(part, idx, isLastPartInMessage)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
