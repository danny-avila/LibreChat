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
import ExistingFilesImportModal from './ExistingFilesImportModal';

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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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

  const handleUploadClick = () => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = BKL_ALLOWED_UPLOAD_ACCEPT;
    inputRef.current.click();
  };

  const dropdownItems = useMemo(() => {
    const createMenuItems = (onAction: () => void, includeImport = true) => {
      const items: MenuItemProps[] = [];

      if (capabilities.contextEnabled) {
        items.push({
          label: '새파일 업로드',
          onClick: () => {
            setToolResource(EToolResources.context);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.context]: true,
            }));
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        });

        if (includeImport) {
          items.push({
            label: '기존파일 임포트',
            onClick: () => {
              setToolResource(EToolResources.context);
              setEphemeralAgent((prev) => ({
                ...prev,
                [EToolResources.context]: true,
              }));
              setIsImportModalOpen(true);
            },
            icon: <FileType2Icon className="icon-md" />,
          });
        }
      }

      return items;
    };

    const localItems = createMenuItems(handleUploadClick);

    if (sharePointEnabled) {
      const sharePointItems = createMenuItems(() => {
        setIsSharePointDialogOpen(true);
        // Note: toolResource will be set by the specific item clicked
      }, false);
      localItems.push({
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {},
        icon: <SharePointIcon className="icon-md" />,
        subItems: sharePointItems,
      });
      return localItems;
    }

    return localItems;
  }, [
    localize,
    capabilities,
    setToolResource,
    setEphemeralAgent,
    sharePointEnabled,
    setIsSharePointDialogOpen,
    setIsImportModalOpen,
  ]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
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
      </FileUpload>
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
      <ExistingFilesImportModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
    </>
  );
};

export default React.memo(AttachFileMenu);
