import * as Ariakit from '@ariakit/react';
import { EToolResources } from 'librechat-data-provider';
import React, { useRef, useState, useMemo, useCallback } from 'react';
import { FileSearch, ImageUpIcon, TerminalSquareIcon, FileType2Icon } from 'lucide-react';
import { FileUpload, DropdownPopup, AttachmentIcon, SharePointIcon } from '@librechat/client';
import useSharePointFileHandling from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { MenuItemProps } from '~/common';
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
  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);

  const { handleSharePointFiles, isProcessing, downloadProgress } = useSharePointFileHandling({
    toolResource,
  });
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

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
    const createMenuItems = (onAction: (isImage?: boolean) => void) => {
      const items: MenuItemProps[] = [
        {
          label: localize('com_ui_upload_image_input'),
          onClick: () => {
            setToolResource(EToolResources.image_edit);
            onAction(true);
          },
          icon: <ImageUpIcon className="icon-md" />,
        },
        {
          label: localize('com_ui_upload_ocr_text'),
          onClick: () => {
            setToolResource(EToolResources.ocr);
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        },
        {
          label: localize('com_ui_upload_file_search'),
          onClick: () => {
            setToolResource(EToolResources.file_search);
            onAction();
          },
          icon: <FileSearch className="icon-md" />,
        },
        {
          label: localize('com_ui_upload_code_files'),
          onClick: () => {
            setToolResource(EToolResources.execute_code);
            onAction();
          },
          icon: <TerminalSquareIcon className="icon-md" />,
        },
      ];
      return items;
    };

    const localItems = createMenuItems(handleUploadClick);

    if (sharePointEnabled) {
      const sharePointItems = createMenuItems(() => {
        setIsSharePointDialogOpen(true);
      });
      localItems.push({
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {},
        icon: <SharePointIcon className="icon-md" />,
        subItems: sharePointItems,
      });
      return localItems;
    }

    return localItems;
  }, [localize, handleUploadClick, sharePointEnabled, setIsSharePointDialogOpen]);

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

  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };

  return (
    <>
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
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
      />
    </>
  );
};

export default React.memo(AttachFileButton);
