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
    <FileUpload handleFileChange={handleFileChange} className="flex">
      <TooltipAnchor
        id="audio-recorder"
        aria-label={localize('com_sidepanel_attach_files')}
        disabled={isUploadDisabled}
        className={cn(
          'absolute flex size-[35px] items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          isRTL ? 'bottom-2 right-2' : 'bottom-2 left-2',
        )}
        description={localize('com_sidepanel_attach_files')}
      >
        <div className="flex w-full items-center justify-center gap-2">
          <AttachmentIcon />
        </div>
      </TooltipAnchor>
    </FileUpload>
  );
};

export default React.memo(AttachFile);
