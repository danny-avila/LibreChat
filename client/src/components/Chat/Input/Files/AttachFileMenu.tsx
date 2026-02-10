import React, { useRef, useState, useMemo } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
  Presentation,
  Sheet,
  FileText,
  Code2,
  Video,
  Music,
  Paperclip,
} from 'lucide-react';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  defaultAgentCapabilities,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
} from '@librechat/client';
import type { EndpointFileConfig } from 'librechat-data-provider';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useFileHandling,
  useLocalize,
} from '~/hooks';
import useSharePointFileHandling from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { MenuItemProps } from '~/common';
import { cn } from '~/utils';
import store from '~/store';

type FileUploadType = 'image' | 'document' | 'image_document' | 'image_document_video_audio' | 'presentation' | 'spreadsheet' | 'text_document' | 'code' | 'video' | 'audio' | 'any';

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
}

const AttachFileMenu = ({
  agentId,
  endpoint,
  disabled,
  endpointType,
  conversationId,
  endpointFileConfig,
  useResponsesApi,
}: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId),
  );
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

  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  const activeFeature = useRecoilValue(store.activeFeature);

  const acceptMap: Record<string, string> = {
    image: 'image/*,.heif,.heic',
    document: '.pdf,application/pdf',
    image_document: 'image/*,.heif,.heic,.pdf,application/pdf',
    image_document_video_audio: 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*',
    presentation: '.pptx,.ppt,.pdf,.key,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/pdf',
    spreadsheet: '.xlsx,.xls,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv',
    text_document: '.docx,.doc,.pdf,.txt,.md,.rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf,text/plain,text/markdown',
    code: '.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.swift,.kt,.cs,.html,.css,.json,.xml,.yaml,.yml,.sql,.sh,.bat,.ps1,text/*',
    video: 'video/*',
    audio: 'audio/*,.mp3,.wav,.flac,.aac,.ogg,.m4a,.wma',
    any: '',
  };

  const handleUploadClick = (fileType?: FileUploadType) => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = fileType ? (acceptMap[fileType] ?? '') : '';
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  const dropdownItems = useMemo(() => {
    // Feature-specific upload menus
    const featureMenuItems: Record<string, (onAction: (fileType?: FileUploadType) => void) => MenuItemProps[]> = {
      slides: (onAction) => [
        {
          label: 'Upload Presentation',
          onClick: () => { setToolResource(undefined); onAction('presentation'); },
          icon: <Presentation className="icon-md" />,
        },
        {
          label: 'Upload Image',
          onClick: () => { setToolResource(undefined); onAction('image'); },
          icon: <ImageUpIcon className="icon-md" />,
        },
      ],
      sheets: (onAction) => [
        {
          label: 'Upload Spreadsheet',
          onClick: () => { setToolResource(undefined); onAction('spreadsheet'); },
          icon: <Sheet className="icon-md" />,
        },
        {
          label: 'Upload as Text',
          onClick: () => { setToolResource(EToolResources.context); onAction(); },
          icon: <FileType2Icon className="icon-md" />,
        },
      ],
      docs: (onAction) => [
        {
          label: 'Upload Document',
          onClick: () => { setToolResource(undefined); onAction('text_document'); },
          icon: <FileText className="icon-md" />,
        },
        {
          label: 'Upload as Text',
          onClick: () => { setToolResource(EToolResources.context); onAction(); },
          icon: <FileType2Icon className="icon-md" />,
        },
      ],
      dev: (onAction) => [
        {
          label: 'Upload Code',
          onClick: () => { setToolResource(undefined); onAction('code'); },
          icon: <Code2 className="icon-md" />,
        },
        {
          label: 'Upload as Text',
          onClick: () => { setToolResource(EToolResources.context); onAction(); },
          icon: <FileType2Icon className="icon-md" />,
        },
      ],
      image: (onAction) => [
        {
          label: 'Upload Image',
          onClick: () => { setToolResource(undefined); onAction('image'); },
          icon: <ImageUpIcon className="icon-md" />,
        },
      ],
      video: (onAction) => [
        {
          label: 'Upload Video',
          onClick: () => { setToolResource(undefined); onAction('video'); },
          icon: <Video className="icon-md" />,
        },
      ],
      music: (onAction) => [
        {
          label: 'Upload Audio',
          onClick: () => { setToolResource(undefined); onAction('audio'); },
          icon: <Music className="icon-md" />,
        },
      ],
      mail: (onAction) => [
        {
          label: 'Upload Attachment',
          onClick: () => { setToolResource(undefined); onAction('any'); },
          icon: <Paperclip className="icon-md" />,
        },
      ],
    };

    // If a feature is active and has custom upload items, use those
    if (activeFeature && featureMenuItems[activeFeature]) {
      return featureMenuItems[activeFeature](handleUploadClick);
    }

    // For Chat (default): skip the menu, just open file picker directly
    // This is handled in the button click below, return empty to signal direct upload
    if (!activeFeature || activeFeature === 'chat' || activeFeature === 'agent') {
      return null;
    }

    const createMenuItems = (onAction: (fileType?: FileUploadType) => void) => {
      const items: MenuItemProps[] = [];

      let currentProvider = provider || endpoint;

      // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
      if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
        currentProvider = Providers.OPENROUTER;
      }

      const isAzureWithResponsesApi =
        currentProvider === EModelEndpoint.azureOpenAI && useResponsesApi;

      if (
        isDocumentSupportedProvider(endpointType) ||
        isDocumentSupportedProvider(currentProvider) ||
        isAzureWithResponsesApi
      ) {
        items.push({
          label: localize('com_ui_upload_provider'),
          onClick: () => {
            setToolResource(undefined);
            let fileType: Exclude<FileUploadType, 'image' | 'document'> = 'image_document';
            if (currentProvider === Providers.GOOGLE || currentProvider === Providers.OPENROUTER) {
              fileType = 'image_document_video_audio';
            }
            onAction(fileType);
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

      if (capabilities.contextEnabled) {
        items.push({
          label: localize('com_ui_upload_ocr_text'),
          onClick: () => {
            setToolResource(EToolResources.context);
            onAction();
          },
          icon: <FileType2Icon className="icon-md" />,
        });
      }

      if (capabilities.fileSearchEnabled && fileSearchAllowedByAgent) {
        items.push({
          label: localize('com_ui_upload_file_search'),
          onClick: () => {
            setToolResource(EToolResources.file_search);
            setEphemeralAgent((prev) => ({
              ...prev,
              [EToolResources.file_search]: true,
            }));
            onAction();
          },
          icon: <FileSearch className="icon-md" />,
        });
      }

      if (capabilities.codeEnabled && codeAllowedByAgent) {
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
    localize,
    endpoint,
    provider,
    endpointType,
    capabilities,
    useResponsesApi,
    setToolResource,
    setEphemeralAgent,
    sharePointEnabled,
    codeAllowedByAgent,
    fileSearchAllowedByAgent,
    setIsSharePointDialogOpen,
    activeFeature,
  ]);

  // Direct upload button (no dropdown) for Chat/Agent modes
  const directUploadButton = (
    <TooltipAnchor
      render={
        <button
          type="button"
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach files"
          onClick={() => handleUploadClick('image_document_video_audio')}
          className="flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50"
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

  // If no dropdown items (Chat/Agent mode), render direct file picker button
  if (!dropdownItems) {
    return (
      <>
        <FileUpload
          ref={inputRef}
          handleFileChange={(e) => {
            handleFileChange(e, toolResource);
          }}
        >
          {directUploadButton}
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
  }

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
