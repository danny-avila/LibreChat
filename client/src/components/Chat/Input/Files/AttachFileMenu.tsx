import React, { useRef, useState, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { useSetRecoilState } from 'recoil';
import { FileSearch, ImageUpIcon, TerminalSquareIcon, FileType2Icon, FileText } from 'lucide-react';
import { FileUpload, TooltipAnchor, DropdownPopup, AttachmentIcon } from '@librechat/client';
import { EToolResources, EModelEndpoint, defaultAgentCapabilities } from 'librechat-data-provider';
import type { EndpointFileConfig } from 'librechat-data-provider';
import { useLocalize, useGetAgentsConfig, useFileHandling, useAgentCapabilities } from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import { cn } from '~/utils';

interface AttachFileMenuProps {
  conversationId: string;
  disabled?: boolean | null;
  endpointFileConfig?: EndpointFileConfig;
  endpoint?: string | null;
}

const AttachFileMenu = ({
  disabled,
  conversationId,
  endpointFileConfig,
  endpoint,
}: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();
  const { handleFileChange } = useFileHandling({
    overrideEndpoint: endpoint === EModelEndpoint.anthropic ? undefined : EModelEndpoint.agents,
    overrideEndpointFileConfig: endpointFileConfig,
  });

  const { agentsConfig } = useGetAgentsConfig();
  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const handleUploadClick = (fileType?: 'image' | 'document') => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    if (fileType === 'image') {
      inputRef.current.accept = 'image/*';
    } else if (fileType === 'document') {
      inputRef.current.accept = '.pdf,application/pdf';
    } else {
      inputRef.current.accept = '';
    }
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  const dropdownItems = useMemo(() => {
    const items = [
      {
        label: localize('com_ui_upload_image_input'),
        onClick: () => {
          setToolResource(undefined);
          handleUploadClick('image');
        },
        icon: <ImageUpIcon className="icon-md" />,
      },
    ];

    // Add document upload option for Anthropic endpoints
    if (endpoint === EModelEndpoint.anthropic) {
      items.push({
        label: 'Upload Document',
        onClick: () => {
          setToolResource(undefined);
          handleUploadClick('document');
        },
        icon: <FileText className="icon-md" />,
      });
    }

    // Hide OCR and File Search for Anthropic endpoints (native PDF support makes these irrelevant)
    if (capabilities.ocrEnabled && endpoint !== EModelEndpoint.anthropic) {
      items.push({
        label: localize('com_ui_upload_ocr_text'),
        onClick: () => {
          setToolResource(EToolResources.ocr);
          handleUploadClick();
        },
        icon: <FileType2Icon className="icon-md" />,
      });
    }

    if (capabilities.fileSearchEnabled && endpoint !== EModelEndpoint.anthropic) {
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

    if (capabilities.codeEnabled) {
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
  }, [capabilities, localize, setToolResource, setEphemeralAgent, endpoint]);

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
