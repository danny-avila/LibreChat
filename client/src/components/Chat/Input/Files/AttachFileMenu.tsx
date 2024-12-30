import * as Ariakit from '@ariakit/react';
import React, { useRef, useState, useMemo } from 'react';
import { FileSearch, ImageUpIcon, FileUpIcon, TerminalSquareIcon } from 'lucide-react';
import {
  EToolResources,
  AgentCapabilities,
  BaseCapabilities,
  EModelEndpoint,
  mergeFileConfig,
  supportsGenericFiles,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { useGetFileConfig } from '~/data-provider';
import { FileUpload, TooltipAnchor, DropdownPopup } from '~/components/ui';
import { AttachmentIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AttachFileProps {
  endpoint: EModelEndpoint | null;
  isRTL: boolean;
  disabled?: boolean | null;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setToolResource?: React.Dispatch<React.SetStateAction<string | undefined>>;
}

const AttachFileMenu = ({
  endpoint,
  isRTL,
  disabled,
  setToolResource,
  handleFileChange,
}: AttachFileProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const _endpoint = endpoint ?? '';

  const genericFiles = useMemo(() => supportsGenericFiles[_endpoint] ?? false, [endpoint]);

  const capabilities = useMemo(
    () => endpointsConfig?.[_endpoint]?.capabilities ?? [],
    [endpointsConfig, _endpoint],
  );

  const fileFilter = useMemo(
    () => fileConfig.endpoints[_endpoint]?.fileFilter ?? '',
    [fileConfig, _endpoint],
  );

  const handleUploadClick = (isTool: boolean = true) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = isTool ? '' : fileFilter;
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  const dropdownItems = useMemo(() => {
    const items = [
      {
        label: genericFiles
          ? localize('com_ui_upload_file_input')
          : localize('com_ui_upload_image_input'),
        onClick: () => {
          setToolResource?.(undefined);
          handleUploadClick(false);
        },
        icon: genericFiles ? (
          <FileUpIcon className="icon-md" />
        ) : (
          <ImageUpIcon className="icon-md" />
        ),
      },
    ];

    if (capabilities.includes(BaseCapabilities.file_search)) {
      items.push({
        label: localize('com_ui_upload_file_search'),
        onClick: () => {
          setToolResource?.(EToolResources.file_search);
          handleUploadClick();
        },
        icon: <FileSearch className="icon-md" />,
      });
    }

    if (capabilities.includes(AgentCapabilities.execute_code)) {
      items.push({
        label: localize('com_ui_upload_code_files'),
        onClick: () => {
          setToolResource?.(EToolResources.execute_code);
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
    <FileUpload ref={inputRef} handleFileChange={handleFileChange}>
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

export default React.memo(AttachFileMenu);
