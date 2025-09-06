import React, { useRef, useState, useMemo } from 'react';
import { Upload, Folder } from 'lucide-react';
import {
  Button,
  TooltipAnchor,
  AttachmentIcon,
  DropdownPopup,
  FileUpload,
} from '@librechat/client';
import { EToolResources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { usePromptFileHandling } from '~/hooks/Prompts';
import PromptFileRow from './PromptFileRow';
import * as Ariakit from '@ariakit/react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PromptFileUploadProps {
  files: ExtendedFile[];
  onFilesChange: (files: ExtendedFile[]) => void;
  onToolResourcesChange?: (toolResources: any) => void;
  disabled?: boolean;
  className?: string;
  variant?: 'button' | 'icon';
  showFileList?: boolean;
}

const PromptFileUpload: React.FC<PromptFileUploadProps> = ({
  files,
  onFilesChange,
  onToolResourcesChange,
  disabled = false,
  className = '',
  variant = 'button',
  showFileList = true,
}) => {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [toolResource, setToolResource] = useState<string>(EToolResources.file_search);

  const { handleFileChange, promptFiles, getToolResources, areFilesReady, fileStats } =
    usePromptFileHandling({
      fileSetter: onFilesChange,
      initialFiles: files,
    });

  // Update parent component when files change
  React.useEffect(() => {
    if (onToolResourcesChange && areFilesReady) {
      const toolResources = getToolResources();
      onToolResourcesChange(toolResources);
    }
  }, [promptFiles, areFilesReady, getToolResources, onToolResourcesChange]);

  const handleUploadClick = (isImage?: boolean) => {
    if (isImage) {
      setToolResource(EToolResources.image_edit);
    } else {
      setToolResource(EToolResources.file_search);
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveFile = (fileId: string) => {
    const updatedFiles = promptFiles.filter(
      (file) => file.temp_file_id !== fileId && file.file_id !== fileId,
    );
    onFilesChange(updatedFiles);
  };

  const dropdownItems = useMemo(() => {
    return [
      {
        label: localize('com_ui_upload_file_search'),
        onClick: () => handleUploadClick(false),
        icon: <Folder className="icon-md" />,
      },
      {
        label: localize('com_ui_upload_ocr_text'),
        onClick: () => handleUploadClick(true),
        icon: <AttachmentIcon className="icon-md" />,
      },
    ];
  }, [localize]);

  const getButtonText = () => {
    if (fileStats.uploading > 0) {
      return `${localize('com_ui_uploading')} (${fileStats.uploading})`;
    }
    if (fileStats.total > 0) {
      return `${fileStats.total} ${localize('com_ui_files_attached')}`;
    }
    return localize('com_ui_attach_files');
  };

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={disabled}
          id="prompt-attach-file-menu-button"
          aria-label="Attach File Options"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </Ariakit.MenuButton>
      }
      id="prompt-attach-file-menu-button"
      description={localize('com_sidepanel_attach_files')}
      disabled={disabled}
    />
  );

  if (variant === 'icon') {
    return (
      <>
        <FileUpload
          ref={fileInputRef}
          handleFileChange={(e) => {
            handleFileChange(e, toolResource);
          }}
        >
          <DropdownPopup
            menuId="prompt-attach-file-menu"
            className="overflow-visible"
            isOpen={isPopoverActive}
            setIsOpen={setIsPopoverActive}
            modal={true}
            unmountOnHide={true}
            trigger={menuTrigger}
            items={dropdownItems}
            iconClassName="mr-0"
          />
        </FileUpload>

        {showFileList && (
          <PromptFileRow files={promptFiles} onRemoveFile={handleRemoveFile} className="mt-2" />
        )}
      </>
    );
  }

  return (
    <div className={className}>
      <FileUpload
        ref={fileInputRef}
        handleFileChange={(e) => {
          handleFileChange(e, toolResource);
        }}
      >
        <DropdownPopup
          menuId="prompt-attach-file-menu-button"
          className="overflow-visible"
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          modal={true}
          unmountOnHide={true}
          trigger={
            <Button
              type="button"
              disabled={disabled}
              variant="outline"
              className={cn('flex items-center gap-2', fileStats.uploading > 0 && 'opacity-70')}
            >
              {fileStats.uploading > 0 ? (
                <Upload className="h-4 w-4 animate-pulse" />
              ) : (
                <AttachmentIcon className="h-4 w-4" />
              )}
              {getButtonText()}
            </Button>
          }
          items={dropdownItems}
          iconClassName="mr-0"
        />
      </FileUpload>

      {showFileList && promptFiles.length > 0 && (
        <PromptFileRow files={promptFiles} onRemoveFile={handleRemoveFile} className="mt-3" />
      )}
    </div>
  );
};

export default PromptFileUpload;
