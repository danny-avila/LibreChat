import React from 'react';
import {
  EModelEndpoint,
  supportsFiles,
  fileConfig as defaultFileConfig,
  mergeFileConfig,
} from 'librechat-data-provider';
import { FileUpload, TooltipAnchor } from '~/components/ui';
import { useFileHandling, useLocalize } from '~/hooks';
import { useGetFileConfig } from '~/data-provider';
import { AttachmentIcon } from '~/components/svg';
import { cn } from '~/utils';

const AttachFile = ({
  endpoint,
  endpointType,
  isRTL,
  disabled = false,
}: {
  endpoint: EModelEndpoint | '';
  endpointType?: EModelEndpoint;
  isRTL: boolean;
  disabled?: boolean | null;
}) => {
  const localize = useLocalize();
  const { handleFileChange } = useFileHandling();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];

  if (!supportsFiles[endpointType ?? endpoint ?? ''] || endpointFileConfig?.disabled) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute',
        isRTL
          ? 'bottom-2 right-14 md:bottom-3.5 md:right-3'
          : 'bottom-2 left-2 md:bottom-3.5 md:left-4',
      )}
    >
      <FileUpload handleFileChange={handleFileChange} className="flex">
        <TooltipAnchor
          id="audio-recorder"
          aria-label={localize('com_sidepanel_attach_files')}
          disabled={!!disabled}
          className="btn relative text-black focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-opacity-50 dark:text-white"
          style={{ padding: 0 }}
          description={localize('com_sidepanel_attach_files')}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </TooltipAnchor>
      </FileUpload>
    </div>
  );
};

export default React.memo(AttachFile);
