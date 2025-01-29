import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, Agents } from 'librechat-data-provider';
import EditTextPart from './Parts/EditTextPart';
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
    const messageAttachmentsMap = useRecoilValue(store.messageAttachmentsMap);
    const attachmentMap = useMemo(
      () => mapAttachments(attachments ?? messageAttachmentsMap[messageId] ?? []),
      [attachments, messageAttachmentsMap, messageId],
    );

    console.log('content', content);
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
