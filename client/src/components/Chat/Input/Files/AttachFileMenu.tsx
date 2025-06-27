import { useSetRecoilState } from 'recoil';
import * as Ariakit from '@ariakit/react';
import React, { useRef, useState, useMemo } from 'react';
import { FileSearch, ImageUpIcon, TerminalSquareIcon, FileType2Icon } from 'lucide-react';
import type { EndpointFileConfig } from 'librechat-data-provider';
import { FileUpload, TooltipAnchor, DropdownPopup, AttachmentIcon } from '~/components';
import { EToolResources, EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize, useFileHandling } from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import { cn } from '~/utils';

interface AttachFileMenuProps {
  conversationId: string;
  disabled?: boolean | null;
  endpointFileConfig?: EndpointFileConfig;
}

const AttachFileMenu = ({ disabled, conversationId, endpointFileConfig }: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { handleFileChange } = useFileHandling({
    overrideEndpoint: EModelEndpoint.agents,
    overrideEndpointFileConfig: endpointFileConfig,
  });

  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
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
          /** File search is not automatically enabled to simulate legacy behavior */
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
          setEphemeralAgent((prev) => ({
            ...prev,
            [EToolResources.execute_code]: true,
          }));
          handleUploadClick();
        },
        icon: <TerminalSquareIcon className="icon-md" />,
      });
    }

    return items;
  }, [capabilities, localize, setToolResource, setEphemeralAgent]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
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
      <DropdownPopup
        menuId="attach-file-menu"
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

export default React.memo(AttachFileMenu);
