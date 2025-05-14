import { useSetRecoilState } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TAttachment, EventSubmission } from 'librechat-data-provider';
import store from '~/store';

export default function useAttachmentHandler(queryClient?: QueryClient) {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);

  return ({ data }: { data: TAttachment; submission: EventSubmission }) => {
    const { messageId } = data;

    if (queryClient && !data?.filepath?.startsWith('/api/files')) {
      queryClient.setQueryData([QueryKeys.files], (oldData: TAttachment[] | undefined) => {
        return [data, ...(oldData || [])];
      });
    }

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
