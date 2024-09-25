import { useCallback } from 'react';
import type { TMessage, TAttachment, EventSubmission } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { AnnounceOptions } from '~/common';

type TUseAttachmentHandler = {
  announcePolite: (options: AnnounceOptions) => void;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  setIsSubmitting: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
};

export default function useAttachmentHandler({
  setMessages,
  getMessages,
  setIsSubmitting,
  announcePolite,
  lastAnnouncementTimeRef,
}: TUseAttachmentHandler) {
  return useCallback(
    ({ data, submission }: { data: TAttachment; submission: EventSubmission }) => {
      console.log('Attachment Handler', data, submission);
    },
    [getMessages, setIsSubmitting, lastAnnouncementTimeRef, announcePolite, setMessages],
  );
}
