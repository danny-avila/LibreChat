import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useFileHandling } from '~/hooks';
import FileRow from './FileRow';
import store from '~/store';

function FileFormChat({ conversation }: { conversation: TConversation | null }) {
  const { files, setFiles, setFilesLoading } = useChatContext();
  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const { endpoint: _endpoint } = conversation ?? { endpoint: null };
  const { abortUpload } = useFileHandling();

  const isRTL = chatDirection === 'rtl';

  return (
    <>
      <FileRow
        files={files}
        setFiles={setFiles}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
        isRTL={isRTL}
        Wrapper={({ children }) => <div className="mx-2 mt-2 flex flex-wrap gap-2">{children}</div>}
      />
    </>
  );
}

export default memo(FileFormChat);
