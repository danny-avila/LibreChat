import { useSetRecoilState } from 'recoil';
import type { QueryClient } from '@tanstack/react-query';
import { QueryKeys, Tools } from 'librechat-data-provider';
import type {
  MemoriesResponse,
  EventSubmission,
  TAttachment,
  TFile,
} from 'librechat-data-provider';
import { handleMemoryArtifact } from '~/utils/memory';
import store from '~/store';

export default function useAttachmentHandler(queryClient?: QueryClient) {
  const setAttachmentsMap = useSetRecoilState(store.messageAttachmentsMap);

  return ({ data }: { data: TAttachment; submission: EventSubmission }) => {
    const { messageId } = data;

    const fileData = data as TFile;
    if (
      queryClient &&
      fileData?.file_id &&
      fileData?.filepath &&
      !fileData.filepath.includes('/api/files')
    ) {
      queryClient.setQueryData([QueryKeys.files], (oldData: TFile[] | undefined) => {
        if (!oldData) {
          return [fileData];
        }
        const existingIndex = oldData.findIndex((file) => file.file_id === fileData.file_id);
        if (existingIndex > -1) {
          const updated = [...oldData];
          updated[existingIndex] = { ...oldData[existingIndex], ...fileData };
          return updated;
        }
        return [fileData, ...oldData];
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

    /* Cross-turn filename reuse keeps the same `file_id` across runs.
     * If a prior turn left `[QueryKeys.filePreview, file_id]` cached at
     * `status: 'ready'`, a new pending attachment would mount against
     * that stale cache and `useFilePreview`'s `refetchInterval` (which
     * only polls on `pending`) would never start. Invalidate the
     * preview query whenever a new attachment arrives — the resolved
     * fields the SSE event carries are themselves authoritative for the
     * upsert below, and the next `useFilePreview` mount will refetch
     * fresh state. (Codex P1 review on PR #12957.) */
    if (queryClient && (data as Partial<TFile>).file_id) {
      queryClient.invalidateQueries([QueryKeys.filePreview, (data as Partial<TFile>).file_id]);
    }

    setAttachmentsMap((prevMap) => {
      const messageAttachments =
        (prevMap as Record<string, TAttachment[] | undefined>)[messageId] || [];
      /* Upsert by `file_id` rather than always appending. The
       * deferred-preview flow emits the same attachment twice: first
       * with `status: 'pending'` and `text: null`, then again with
       * `status: 'ready'` (and text/textFormat) or `'failed'` (with
       * previewError). The second event must merge over the first in
       * place — appending would render the artifact card twice, once
       * stuck pending and once resolved. Attachments without a
       * `file_id` (lightweight types like web_search / file_search
       * citations) keep the legacy append behavior. */
      const fileId = (data as Partial<TFile>).file_id;
      if (fileId) {
        const existingIndex = messageAttachments.findIndex(
          (a) => (a as Partial<TFile>).file_id === fileId,
        );
        if (existingIndex > -1) {
          const merged = [...messageAttachments];
          merged[existingIndex] = { ...messageAttachments[existingIndex], ...data };
          return { ...prevMap, [messageId]: merged };
        }
      }
      return {
        ...prevMap,
        [messageId]: [...messageAttachments, data],
      };
    });
  };
}
