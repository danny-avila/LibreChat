import React, { useRef, useState, useMemo } from 'react';
import { useSetRecoilState } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { FileType2Icon } from 'lucide-react';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
} from '@librechat/client';
import { EToolResources, defaultAgentCapabilities } from 'librechat-data-provider';
import type { EModelEndpoint, EndpointFileConfig } from 'librechat-data-provider';
import { useAgentCapabilities, useGetAgentsConfig, useFileHandling, useLocalize } from '~/hooks';
import useSharePointFileHandling from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { MenuItemProps } from '~/common';
import { BKL_ALLOWED_UPLOAD_ACCEPT, cn } from '~/utils';

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
}

const AttachFileMenu = ({ disabled, conversationId, endpointFileConfig }: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();
  const { handleFileChange } = useFileHandling();
  const { handleSharePointFiles, isProcessing, downloadProgress } = useSharePointFileHandling({
    toolResource,
  });

  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);

  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const openFilePicker = () => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = BKL_ALLOWED_UPLOAD_ACCEPT;
    inputRef.current.click();
  };

  /** 업로드 대상은 항상 context 다. 파일 선택 전에 미리 잡아둔다. */
  const markContextUpload = () => {
    setToolResource(EToolResources.context);
    setEphemeralAgent((prev) => ({
      ...prev,
      [EToolResources.context]: true,
    }));
  };

  const handleUploadClick = () => {
    markContextUpload();
    openFilePicker();
  };

  // SharePoint 가 꺼져 있으면 고를 게 하나뿐이라 메뉴를 띄우지 않고 바로
  // 파일 선택창을 연다. 켜져 있을 때만 드롭다운이 필요하다.
  const dropdownItems = useMemo(() => {
    if (!sharePointEnabled || !capabilities.contextEnabled) {
      return [] as MenuItemProps[];
    }
    return [
      {
        label: '새파일 업로드',
        onClick: handleUploadClick,
        icon: <FileType2Icon className="icon-md" />,
      },
      {
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {},
        icon: <SharePointIcon className="icon-md" />,
        subItems: [
          {
            label: '새파일 업로드',
            onClick: () => {
              markContextUpload();
              setIsSharePointDialogOpen(true);
            },
            icon: <FileType2Icon className="icon-md" />,
          },
        ],
      },
    ] as MenuItemProps[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localize, capabilities.contextEnabled, sharePointEnabled]);

  const useDropdown = dropdownItems.length > 0;

  const triggerClassName = cn(
    'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
    isPopoverActive && 'bg-surface-hover',
  );

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          className={triggerClassName}
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

  const directTrigger = (
    <TooltipAnchor
      render={
        <button
          type="button"
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          className={triggerClassName}
          onClick={handleUploadClick}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </button>
      }
      id="attach-file-menu-button"
      description={localize('com_sidepanel_attach_files')}
      disabled={isUploadDisabled}
    />
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
          handleFileChange(e, toolResource);
        }}
      >
        {useDropdown ? (
          <DropdownPopup
            menuId="attach-file-menu"
            className="overflow-visible"
            isOpen={isPopoverActive}
            setIsOpen={setIsPopoverActive}
            modal={true}
            unmountOnHide={true}
            trigger={menuTrigger}
            items={dropdownItems}
            iconClassName="mr-0"
          />
        ) : (
          directTrigger
        )}
      </FileUpload>
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
    </>
  );
};

export default React.memo(AttachFileMenu);
