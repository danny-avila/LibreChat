import { memo, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useChatContext } from '~/Providers';
import { useQueryParams } from '~/hooks';
import AttachFile from './AttachFile';
import FileRow from './FileRow';
import store from '~/store';

function FileFormWrapper({ children, disableInputs } : {
  disableInputs: boolean;
  children?: React.ReactNode;
}) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useQueryParams({ textAreaRef });

  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const isRTL = chatDirection === 'rtl';

  const {
    files,
    setFiles,
    conversation,
    setFilesLoading,
  } = useChatContext();

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };

  return (<>
    <FileRow
      files={files}
      setFiles={setFiles}
      setFilesLoading={setFilesLoading}
      isRTL={isRTL}
      Wrapper={({ children }) => (
        <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
          {children}
        </div>
      )}
    />
    {children}
    <AttachFile
      isRTL={isRTL}
      disabled={disableInputs}
      endpoint={_endpoint ?? ''}
      endpointType={endpointType}
    />
  </>);
}

export default memo(FileFormWrapper);