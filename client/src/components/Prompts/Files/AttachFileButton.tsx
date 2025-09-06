import * as Ariakit from '@ariakit/react';
import { EToolResources } from 'librechat-data-provider';
import React, { useRef, useState, useMemo, useCallback } from 'react';
import { FileUpload, DropdownPopup, AttachmentIcon } from '@librechat/client';
import { FileSearch, ImageUpIcon, TerminalSquareIcon, FileType2Icon } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface AttachFileButtonProps {
  handleFileChange?: (event: React.ChangeEvent<HTMLInputElement>, toolResource?: string) => void;
  disabled?: boolean | null;
}

const AttachFileButton = ({ handleFileChange, disabled }: AttachFileButtonProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();

  const handleUploadClick = useCallback((isImage?: boolean) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = isImage === true ? 'image/*' : '';
    inputRef.current.click();
    inputRef.current.accept = '';
  }, []);

  const dropdownItems = useMemo(() => {
    return [
      {
        label: localize('com_ui_upload_image_input'),
        onClick: () => {
          setToolResource(EToolResources.image_edit);
          handleUploadClick(true);
        },
        icon: <ImageUpIcon className="icon-md" />,
      },
      {
        label: localize('com_ui_upload_ocr_text'),
        onClick: () => {
          setToolResource(EToolResources.ocr);
          handleUploadClick();
        },
        icon: <FileType2Icon className="icon-md" />,
      },
      {
        label: localize('com_ui_upload_file_search'),
        onClick: () => {
          setToolResource(EToolResources.file_search);
          handleUploadClick();
        },
        icon: <FileSearch className="icon-md" />,
      },
      {
        label: localize('com_ui_upload_code_files'),
        onClick: () => {
          setToolResource(EToolResources.execute_code);
          handleUploadClick();
        },
        icon: <TerminalSquareIcon className="icon-md" />,
      },
    ];
  }, [localize, handleUploadClick]);

  const menuTrigger = (
    <Ariakit.MenuButton
      disabled={isUploadDisabled}
      id="attach-file-button-menu"
      aria-label="Attach File Options"
      className="flex items-center gap-2 rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50"
    >
      <AttachmentIcon className="h-4 w-4" />
      {localize('com_ui_attach_files')}
    </Ariakit.MenuButton>
  );

  return (
    <FileUpload
      ref={inputRef}
      handleFileChange={(e) => {
        handleFileChange?.(e, toolResource);
      }}
    >
      <DropdownPopup
        menuId="attach-file-button"
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
  );
};

export default React.memo(AttachFileButton);
