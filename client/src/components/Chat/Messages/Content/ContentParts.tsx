import { memo, useMemo, useState, useCallback } from 'react';
import { useAtom } from 'jotai';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { ThinkingButton } from '~/components/Artifacts/Thinking';
import { MessageContext, SearchContext } from '~/Providers';
import { showThinkingAtom } from '~/store/showThinking';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import { mapAttachments } from '~/utils/map';
import { EditTextPart } from './Parts';
import { useLocalize } from '~/hooks';
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
    const localize = useLocalize();
    const [showThinking, setShowThinking] = useAtom(showThinkingAtom);
    const [isExpanded, setIsExpanded] = useState(showThinking);
    const [isContentHovered, setIsContentHovered] = useState(false);
    const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

    const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

    const handleContentEnter = useCallback(() => setIsContentHovered(true), []);
    const handleContentLeave = useCallback(() => setIsContentHovered(false), []);

    const hasReasoningParts = useMemo(() => {
      const hasThinkPart = content?.some((part) => part?.type === ContentTypes.THINK) ?? false;
      const allThinkPartsHaveContent =
        content?.every((part) => {
          if (part?.type !== ContentTypes.THINK) {
            return true;
          }

          if (typeof part.think === 'string') {
            const cleanedContent = part.think.replace(/<\/?think>/g, '').trim();
            return cleanedContent.length > 0;
          }

          return false;
        }) ?? false;

      return hasThinkPart && allThinkPartsHaveContent;
    }, [content]);

    // Extract all reasoning text for copy functionality
    const reasoningContent = useMemo(() => {
      if (!content) {
        return '';
      }
      return content
        .filter((part) => part?.type === ContentTypes.THINK)
        .map((part) => {
          if (typeof part?.think === 'string') {
            return part.think.replace(/<\/?think>/g, '').trim();
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
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

    return (
      <>
        <SearchContext.Provider value={{ searchResults }}>
          <MemoryArtifacts attachments={attachments} />
          <Sources messageId={messageId} conversationId={conversationId || undefined} />
          {hasReasoningParts && (
            <div onMouseEnter={handleContentEnter} onMouseLeave={handleContentLeave}>
              <div className="sticky top-0 z-10 mb-2 bg-surface-secondary pb-2 pt-2">
                <ThinkingButton
                  isExpanded={isExpanded}
                  onClick={() =>
                    setIsExpanded((prev) => {
                      const val = !prev;
                      setShowThinking(val);
                      return val;
                    })
                  }
                  label={
                    effectiveIsSubmitting && isLast
                      ? localize('com_ui_thinking')
                      : localize('com_ui_thoughts')
                  }
                  content={reasoningContent}
                  isContentHovered={isContentHovered}
                />
              </div>
              {content
                .filter((part) => part?.type === ContentTypes.THINK)
                .map((part) => {
                  const originalIdx = content.indexOf(part);
                  return (
                    <MessageContext.Provider
                      key={`provider-${messageId}-${originalIdx}`}
                      value={{
                        messageId,
                        isExpanded,
                        conversationId,
                        partIndex: originalIdx,
                        nextType: content[originalIdx + 1]?.type,
                        isSubmitting: effectiveIsSubmitting,
                        isLatestMessage,
                      }}
                    >
                      <Part
                        part={part}
                        attachments={undefined}
                        isSubmitting={effectiveIsSubmitting}
                        key={`part-${messageId}-${originalIdx}`}
                        isCreatedByUser={isCreatedByUser}
                        isLast={originalIdx === content.length - 1}
                        showCursor={false}
                      />
                    </MessageContext.Provider>
                  );
                })}
            </div>
          )}
          {content
            .filter((part) => part && part.type !== ContentTypes.THINK)
            .map((part) => {
              const originalIdx = content.indexOf(part);
              const toolCallId =
                (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
              const attachments = attachmentMap[toolCallId];

              return (
                <MessageContext.Provider
                  key={`provider-${messageId}-${originalIdx}`}
                  value={{
                    messageId,
                    isExpanded,
                    conversationId,
                    partIndex: originalIdx,
                    nextType: content[originalIdx + 1]?.type,
                    isSubmitting: effectiveIsSubmitting,
                    isLatestMessage,
                  }}
                >
                  <Part
                    part={part}
                    attachments={attachments}
                    isSubmitting={effectiveIsSubmitting}
                    key={`part-${messageId}-${originalIdx}`}
                    isCreatedByUser={isCreatedByUser}
                    isLast={originalIdx === content.length - 1}
                    showCursor={originalIdx === content.length - 1 && isLast}
                  />
                </MessageContext.Provider>
              );
            })}
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
