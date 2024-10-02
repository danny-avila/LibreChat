import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts, TAttachment, Agents } from 'librechat-data-provider';
import EditTextPart from './Parts/EditTextPart';
import { mapAttachments } from '~/utils/map';
import store from '~/store';
import Part from './Part';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
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
              <Part
                part={part}
                isSubmitting={isSubmitting}
                attachments={attachments}
                key={`display-${messageId}-${idx}`}
                showCursor={idx === content.length - 1 && isLast}
                messageId={messageId}
                isCreatedByUser={isCreatedByUser}
              />
            );
          })}
      </>
    );
  },
);

export default ContentParts;
