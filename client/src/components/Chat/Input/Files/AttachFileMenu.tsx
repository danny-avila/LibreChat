import React, { useRef, useState, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { useSetRecoilState } from 'recoil';
import {
  FileSearch,
  ImageUpIcon,
  TerminalSquareIcon,
  FileType2Icon,
  FileImageIcon,
} from 'lucide-react';
import {
  EToolResources,
  EModelEndpoint,
  defaultAgentCapabilities,
  isDocumentSupportedEndpoint,
} from 'librechat-data-provider';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
} from '@librechat/client';
import type { EndpointFileConfig } from 'librechat-data-provider';
import { useLocalize, useGetAgentsConfig, useFileHandling, useAgentCapabilities } from '~/hooks';
import useSharePointFileHandling from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig, useGetAgentByIdQuery } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { useChatContext } from '~/Providers/ChatContext';
import { MenuItemProps } from '~/common';
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
    overrideEndpoint: EModelEndpoint.agents,
    overrideEndpointFileConfig: endpointFileConfig,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } = useSharePointFileHandling({
    overrideEndpoint: EModelEndpoint.agents,
    overrideEndpointFileConfig: endpointFileConfig,
    toolResource,
  });
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);
  const { agentsConfig } = useGetAgentsConfig();
  const { conversation } = useChatContext();

  // Get agent details if using an agent
  const { data: agent } = useGetAgentByIdQuery(conversation?.agent_id ?? '', {
    enabled: !!conversation?.agent_id && conversation?.agent_id !== 'ephemeral',
  });

  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const handleUploadClick = (
    fileType?: 'image' | 'document' | 'multimodal' | 'google_multimodal',
  ) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    if (fileType === 'image') {
      inputRef.current.accept = 'image/*';
    } else if (fileType === 'document') {
      inputRef.current.accept = '.pdf,application/pdf';
    } else if (fileType === 'multimodal') {
      inputRef.current.accept = 'image/*,.pdf,application/pdf';
    } else if (fileType === 'google_multimodal') {
      inputRef.current.accept = 'image/*,.pdf,application/pdf,video/*,audio/*';
    } else {
      inputRef.current.accept = '';
    }
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  const dropdownItems = useMemo(() => {
    const createMenuItems = (
      onAction: (fileType?: 'image' | 'document' | 'multimodal' | 'google_multimodal') => void,
    ) => {
      const items: MenuItemProps[] = [];

      const currentProvider = agent?.provider ?? endpoint;
      const isOpenAIOrAzure =
        currentProvider === EModelEndpoint.openAI || currentProvider === EModelEndpoint.azureOpenAI;
      const useResponsesApiEnabled = conversation?.useResponsesApi ?? false;

      const shouldShowDirectAttach =
        isDocumentSupportedEndpoint(currentProvider) &&
        (!isOpenAIOrAzure || useResponsesApiEnabled);

      if (shouldShowDirectAttach) {
        items.push({
          label: localize('com_ui_upload_provider'),
          onClick: () => {
            setToolResource(EToolResources.direct_attach);
            onAction(
              (agent?.provider ?? endpoint) === EModelEndpoint.google
                ? 'google_multimodal'
                : 'multimodal',
            );
          },
          icon: <FileImageIcon className="icon-md" />,
        });
      } else {
        items.push({
          label: localize('com_ui_upload_image_input'),
          onClick: () => {
            setToolResource(undefined);
            onAction('image');
          },
          icon: <ImageUpIcon className="icon-md" />,
        });
      }

      if (capabilities.ocrEnabled) {
        items.push({
          label: localize('com_ui_upload_ocr_text'),
          onClick: () => {
            setToolResource(EToolResources.ocr);
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        });
      }

      if (capabilities.fileSearchEnabled) {
        items.push({
          label: localize('com_ui_upload_file_search'),
          onClick: () => {
            setToolResource(EToolResources.file_search);
            onAction();
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
            onAction();
          },
          icon: <TerminalSquareIcon className="icon-md" />,
        });
      }

      return items;
    };

    const localItems = createMenuItems(handleUploadClick);

    if (sharePointEnabled) {
      const sharePointItems = createMenuItems(() => {
        setIsSharePointDialogOpen(true);
        // Note: toolResource will be set by the specific item clicked
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
  }, [
    capabilities,
    localize,
    setToolResource,
    setEphemeralAgent,
    sharePointEnabled,
    setIsSharePointDialogOpen,
    endpoint,
    agent?.provider,
  ]);

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
    </>
  );
};

export default React.memo(AttachFileMenu);
