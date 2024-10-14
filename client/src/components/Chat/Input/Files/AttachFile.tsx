import React from 'react';
import { FileUpload, TooltipAnchor } from '~/components/ui';
import { AttachmentIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AttachFile = ({
  isRTL,
  disabled,
  handleFileChange,
}: {
  isRTL: boolean;
  disabled?: boolean | null;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;

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
          disabled={isUploadDisabled}
          aria-label={localize('com_sidepanel_attach_files')}
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
