import React, { useState, useRef } from 'react';
import {
  EModelEndpoint,
  supportsFiles,
  fileConfig as defaultFileConfig,
  mergeFileConfig,
} from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
import { AttachmentIcon } from '~/components/svg';
import { useFileHandling } from '~/hooks';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import { UploadFile, UrlIcon } from '~/components/svg';
import { FileUpload } from '~/components/ui';
import UrlModal from './UrlModal';  // Certifique-se de ajustar o caminho conforme necessário
import { Trigger } from '@radix-ui/react-popover';
import { useLocalize } from '~/hooks';

const AttachFile = ({
  endpoint,
  endpointType,
  disabled = false,
}: {
  endpoint: EModelEndpoint | '';
  endpointType?: EModelEndpoint;
  disabled?: boolean | null;
}) => {
  const { handleFiles } = useFileHandling();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];
  const localize = useLocalize();

  const [showMenu, setShowMenu] = useState(false);
  const [url, setUrl] = useState('');
  const [showUrlModal, setShowUrlModal] = useState(false);

  const fileInputRef = useRef(null);

  if (!supportsFiles[endpointType ?? endpoint ?? ''] || endpointFileConfig?.disabled) {
    return null;
  }

  const handleAttachClick = () => {
    setShowMenu(!showMenu);
  };

  const handleUrlSubmit = () => {
    handleFiles(url);
    setShowUrlModal(false);
    setUrl('');
    setShowMenu(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files || [];
    handleFiles(files);
    setShowMenu(false);
  };



  if (!supportsFiles[endpointType ?? endpoint ?? ''] || endpointFileConfig?.disabled) {
    return null;
  }

  return (
    <div className="absolute bottom-2 left-2 md:bottom-2 md:left-4">
      <Root open={showMenu} onOpenChange={setShowMenu}>
        <Trigger >
          <button
              disabled={!!disabled}
              type="button"
              className="btn relative p-0 text-black dark:text-white"
              aria-label="Attach files"
              style={{ padding: 0 }}
            >
              <div className="flex w-full items-center justify-center gap-2">
                <AttachmentIcon />
              </div>
            </button>
        </Trigger>
        <Portal>
          <Content
            side="bottom"
            align="start"
            className="mt-2 max-h-[65vh] min-w-[340px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white lg:max-h-[75vh]"
          >
            <div className="attach-file-options">
            <div className="menu-item hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600">
                <FileUpload handleFileChange={handleFileUpload} className="flex">
                <UploadFile  />
                <div className="mr-2"></div>
                <span>{localize('com_ui_upload_file')}</span>
                  
                </FileUpload>
              </div>
              {endpoint !== 'assistants' && (
                  <div className="menu-item hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600" onClick={() => {
                    setShowUrlModal(true);
                    setShowMenu(false);  // Fecha o menu ao abrir o modal
                  }}>
                    <UrlIcon />
                    <span>{localize('com_ui_submit_url')}</span>
                  </div>
              )}
            </div>
          </Content>
        </Portal>
      </Root>

      <UrlModal
        open={showUrlModal}
        url={url}
        setUrl={setUrl}
        onClose={() => setShowUrlModal(false)}
        onSubmit={handleUrlSubmit}
      />
    </div>
  );
};

export default React.memo(AttachFile);

