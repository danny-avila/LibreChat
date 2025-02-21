import React, { useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploadDisabled = disabled ?? false;

  return (
    <FileUpload ref={inputRef} handleFileChange={handleFileChange}>
      <TooltipAnchor
        description={localize('com_sidepanel_attach_files')}
        id="attach-file"
        disabled={isUploadDisabled}
        render={
          <button
            aria-label={localize('com_sidepanel_attach_files')}
            disabled={isUploadDisabled}
            className={cn(
              'absolute flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
              isRTL ? 'bottom-2 right-2' : 'bottom-2 left-2',
            )}
            onKeyDownCapture={(e) => {
              if (!inputRef.current) {
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                inputRef.current.value = '';
                inputRef.current.click();
              }
            }}
            onClick={() => {
              if (!inputRef.current) {
                return;
              }
              inputRef.current.value = '';
              inputRef.current.click();
            }}
          >
            <div className="flex w-full items-center justify-center gap-2">
              <AttachmentIcon />
            </div>
          </button>
        }
      />
    </FileUpload>
  );
};

export default React.memo(AttachFile);
