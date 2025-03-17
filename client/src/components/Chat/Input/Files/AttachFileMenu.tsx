import * as Ariakit from '@ariakit/react';
import React, { useRef, useState, useMemo } from 'react';
import { EToolResources, EModelEndpoint } from 'librechat-data-provider';
import { FileSearch, ImageUpIcon, TerminalSquareIcon, FileType2Icon } from 'lucide-react';
import { FileUpload, TooltipAnchor, DropdownPopup } from '~/components/ui';
import { useGetEndpointsQuery } from '~/data-provider';
import { AttachmentIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AttachFileProps {
  isRTL: boolean;
  disabled?: boolean | null;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>, toolResource?: string) => void;
}

const AttachFile = ({ isRTL, disabled, handleFileChange }: AttachFileProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const capabilities = useMemo(
    () => endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [],
    [endpointsConfig],
  );

  const handleUploadClick = (isImage?: boolean) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = isImage === true ? 'image/*' : '';
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  const dropdownItems = useMemo(() => {
    const items = [
      {
        label: localize('com_ui_upload_image_input'),
        onClick: () => {
          setToolResource(undefined);
          handleUploadClick(true);
        },
        icon: <ImageUpIcon className="icon-md" />,
      },
    ];

    if (capabilities.includes(EToolResources.ocr)) {
      items.push({
        label: localize('com_ui_upload_ocr_text'),
        onClick: () => {
          setToolResource(EToolResources.ocr);
          handleUploadClick();
        },
        icon: <FileType2Icon className="icon-md" />,
      });
    }

    if (capabilities.includes(EToolResources.file_search)) {
      items.push({
        label: localize('com_ui_upload_file_search'),
        onClick: () => {
          setToolResource(EToolResources.file_search);
          handleUploadClick();
        },
        icon: <FileSearch className="icon-md" />,
      });
    }

    if (capabilities.includes(EToolResources.execute_code)) {
      items.push({
        label: localize('com_ui_upload_code_files'),
        onClick: () => {
          setToolResource(EToolResources.execute_code);
          handleUploadClick();
        },
        icon: <TerminalSquareIcon className="icon-md" />,
      });
    }

    return items;
  }, [capabilities, localize, setToolResource]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          className={cn(
            'absolute flex size-[35px] items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
            isRTL ? 'bottom-2 right-2' : 'bottom-2 left-1 md:left-2',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </Ariakit.MenuButton>
      }
      id="attach-file-menu-button"
      description={localize('com_sidepanel_attach_files')}
      disabled={isUploadDisabled}
    />
  );

  return (
    <FileUpload
      ref={inputRef}
      handleFileChange={(e) => {
        handleFileChange(e, toolResource);
      }}
    >
      <div className="relative select-none">
        <DropdownPopup
          menuId="attach-file-menu"
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          modal={true}
          trigger={menuTrigger}
          items={dropdownItems}
          iconClassName="mr-0"
        />
      </div>
    </FileUpload>
  );
};

export default React.memo(AttachFile);
