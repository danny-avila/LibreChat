import { useSetRecoilState } from 'recoil';
import type { TAttachment, EventSubmission } from 'librechat-data-provider';
import store from '~/store';

export default function useAttachmentHandler() {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);

  return ({ data }: { data: TAttachment; submission: EventSubmission }) => {
    const { messageId } = data;

    setAttachmentsMap((prevMap) => {
      const messageAttachments =
        (prevMap as Record<string, TAttachment[] | undefined>)[messageId] || [];
      return {
        ...prevMap,
        [messageId]: [...messageAttachments, data],
      };
    });
  };
}
