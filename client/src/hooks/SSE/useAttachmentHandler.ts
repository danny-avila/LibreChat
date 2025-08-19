import { useSetRecoilState } from 'recoil';
import type { QueryClient } from '@tanstack/react-query';
import { QueryKeys, Tools } from 'librechat-data-provider';
import type { TAttachment, EventSubmission, MemoriesResponse } from 'librechat-data-provider';
import { handleMemoryArtifact } from '~/utils/memory';
import store from '~/store';

export default function useAttachmentHandler(queryClient?: QueryClient) {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);

  return ({ data }: { data: TAttachment; submission: EventSubmission }) => {
    const { messageId } = data;

    if (queryClient && data?.filepath && !data.filepath.includes('/api/files')) {
      queryClient.setQueryData([QueryKeys.files], (oldData: TAttachment[] | undefined) => {
        return [data, ...(oldData || [])];
      });
    }

    if (queryClient && data.type === Tools.memory && data[Tools.memory]) {
      const memoryArtifact = data[Tools.memory];

      queryClient.setQueryData([QueryKeys.memories], (oldData: MemoriesResponse | undefined) => {
        if (!oldData) {
          return oldData;
        }

        return handleMemoryArtifact({ memoryArtifact, currentData: oldData }) || oldData;
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
