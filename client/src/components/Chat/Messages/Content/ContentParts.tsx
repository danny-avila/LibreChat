import { memo, useMemo, useState } from 'react';
import { useRecoilState } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { ThinkingButton } from '~/components/Artifacts/Thinking';
import { MessageContext, SearchContext } from '~/Providers';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import useLocalize from '~/hooks/useLocalize';
import { mapAttachments } from '~/utils/map';
import { EditTextPart } from './Parts';
import store from '~/store';
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
    edit,
    enterEdit,
    siblingIdx,
    setSiblingIdx,
  }: ContentPartsProps) => {
    const localize = useLocalize();
    const [showThinking, setShowThinking] = useRecoilState<boolean>(store.showThinking);
    const [isExpanded, setIsExpanded] = useState(showThinking);
    const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

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
          <Sources />
          {hasReasoningParts && (
            <div className="mb-5">
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
                  isSubmitting && isLast ? localize('com_ui_thinking') : localize('com_ui_thoughts')
                }
              />
            </div>
          )}
          {content
            .filter((part) => part)
            .map((part, idx) => {
              const toolCallId =
                (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
              const attachments = attachmentMap[toolCallId];

              return (
                <MessageContext.Provider
                  key={`provider-${messageId}-${idx}`}
                  value={{
                    messageId,
                    isExpanded,
                    conversationId,
                    partIndex: idx,
                    nextType: content[idx + 1]?.type,
                  }}
                >
                  <Part
                    part={part}
                    attachments={attachments}
                    isSubmitting={isSubmitting}
                    key={`part-${messageId}-${idx}`}
                    isCreatedByUser={isCreatedByUser}
                    isLast={idx === content.length - 1}
                    showCursor={idx === content.length - 1 && isLast}
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
