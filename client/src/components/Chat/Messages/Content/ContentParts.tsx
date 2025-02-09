import { memo, useMemo, useState } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, Agents } from 'librechat-data-provider';
import { ThinkingButton } from '~/components/Artifacts/Thinking';
import EditTextPart from './Parts/EditTextPart';
import useLocalize from '~/hooks/useLocalize';
import { mapAttachments } from '~/utils/map';
import { MessageContext } from '~/Providers';
import store from '~/store';
import Part from './Part';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
  conversationId?: string | null;
  attachments?: TAttachment[];
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
    const messageAttachmentsMap = useRecoilValue(store.messageAttachmentsMap);
    const attachmentMap = useMemo(
      () => mapAttachments(attachments ?? messageAttachmentsMap[messageId] ?? []),
      [attachments, messageAttachmentsMap, messageId],
    );

    const hasReasoningParts = useMemo(
      () => content?.some((part) => part?.type === ContentTypes.THINK && part.think) ?? false,
      [content],
    );

    if (!content) {
      return null;
    }
    if (edit === true && enterEdit && setSiblingIdx) {
      return (
        <>
          {content.map((part, idx) => {
            if (part?.type !== ContentTypes.TEXT || typeof part.text !== 'string') {
              return null;
            }

            return (
              <EditTextPart
                index={idx}
                text={part.text}
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
              label={isSubmitting ? localize('com_ui_thinking') : localize('com_ui_thoughts')}
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
                  conversationId,
                  partIndex: idx,
                  isExpanded,
                  nextType: content[idx + 1]?.type,
                }}
              >
                <Part
                  part={part}
                  attachments={attachments}
                  isSubmitting={isSubmitting}
                  key={`part-${messageId}-${idx}`}
                  isCreatedByUser={isCreatedByUser}
                  showCursor={idx === content.length - 1 && isLast}
                />
              </MessageContext.Provider>
            );
          })}
      </>
    );
  },
);

export default ContentParts;
