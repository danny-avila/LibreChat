import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import {
  supportsFiles,
  mergeFileConfig,
  EndpointFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { useFileHandling } from '~/hooks';
import AttachFile from './AttachFile';
import FileRow from './FileRow';
import store from '~/store';

function FileFormWrapper({
  children,
  disableInputs,
}: {
  disableInputs: boolean;
  children?: React.ReactNode;
}) {
  const { handleFileChange, abortUpload } = useFileHandling();
  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();

  const { files, setFiles, conversation, setFilesLoading } = useChatContext();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const isRTL = chatDirection === 'rtl';

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpointFileConfig = fileConfig.endpoints[_endpoint ?? ''] as
    | EndpointFileConfig
    | undefined;
  const endpointSupportsFiles: boolean = supportsFiles[endpointType ?? _endpoint ?? ''] ?? false;
  const isUploadDisabled = (disableInputs || endpointFileConfig?.disabled) ?? false;

  return (
    <>
      <FileRow
        files={files}
        setFiles={setFiles}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
        isRTL={isRTL}
        Wrapper={({ children }) => (
          <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">{children}</div>
        )}
      />
      {children}
      {endpointSupportsFiles && !isUploadDisabled && (
        <AttachFile isRTL={isRTL} disabled={disableInputs} handleFileChange={handleFileChange} />
      )}
    </>
  );
}

export default memo(FileFormWrapper);
