import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import * as Ariakit from '@ariakit/react';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
  useToastContext,
} from '@librechat/client';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  isIntegrationConnected,
  isPermissiveMimeConfig,
  defaultAgentCapabilities,
  bedrockDocumentExtensions,
  isDocumentSupportedProvider,
  QueryKeys,
} from 'librechat-data-provider';
import type {
  EndpointFileConfig,
  IntegrationProviderKey,
  TConversation,
} from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useFileHandlingNoChatContext,
  useLocalize,
} from '~/hooks';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { useGoogleDriveFileHandlingNoChatContext } from '~/hooks/Files/useGoogleDriveFileHandling';
import { useIntegrationTextAttachHandlingNoChatContext } from '~/hooks/Files/useIntegrationTextAttachHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import {
  ConnectProviderPrompt,
  GmailPickerDialog,
  GoogleCalendarPickerDialog,
  GoogleDrivePickerDialog,
  INTEGRATION_ATTACH_MENU,
} from '~/components/Integrations';
import { useGetStartupConfig, useIntegrationsQuery } from '~/data-provider';
import { useNangoConnect } from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import { MenuItemProps } from '~/common';
import { cn } from '~/utils';
import { isIntegrationReconnectApiError } from '~/utils/integrationReconnect';

type FileUploadType =
  | 'image'
  | 'document'
  | 'image_document'
  | 'image_document_extended'
  | 'image_document_video_audio';

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversation: TConversation | null;
}

const AttachFileMenu = ({
  agentId,
  endpoint,
  disabled,
  endpointType,
  conversationId,
  endpointFileConfig,
  useResponsesApi,
  files,
  setFiles,
  setFilesLoading,
  conversation,
}: AttachFileMenuProps) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId),
  );
  const toolResourceRef = useRef<EToolResources | undefined>();
  const { handleFileChange } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      { toolResource: toolResourceRef.current },
      { files, setFiles, setFilesLoading, conversation },
    );
  const { handleGoogleDriveFiles, isProcessing: isDriveProcessing } =
    useGoogleDriveFileHandlingNoChatContext(
      { toolResource: toolResourceRef.current },
      { files, setFiles, setFilesLoading, conversation },
    );
  const {
    attachGmailMessages,
    attachCalendarEvents,
    isProcessing: isTextAttachProcessing,
  } = useIntegrationTextAttachHandlingNoChatContext(
    { toolResource: toolResourceRef.current, providerLabel: 'Integration' },
    { files, setFiles, setFilesLoading, conversation },
  );

  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;
  const integrationsEnabled = startupConfig?.integrationsEnabled === true;

  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);
  const [activeIntegrationPicker, setActiveIntegrationPicker] =
    useState<IntegrationProviderKey | null>(null);
  const [connectPromptProvider, setConnectPromptProvider] = useState<IntegrationProviderKey | null>(
    null,
  );

  const googleDriveConnect = useNangoConnect({
    providerKey: 'google-drive',
    enabled: integrationsEnabled,
  });
  const googleMailConnect = useNangoConnect({
    providerKey: 'google-mail',
    enabled: integrationsEnabled,
  });
  const googleCalendarConnect = useNangoConnect({
    providerKey: 'google-calendar',
    enabled: integrationsEnabled,
  });

  const integrationConnectors = useMemo(
    () => ({
      'google-drive': googleDriveConnect,
      'google-mail': googleMailConnect,
      'google-calendar': googleCalendarConnect,
    }),
    [googleDriveConnect, googleMailConnect, googleCalendarConnect],
  );

  const connectPromptConnector = connectPromptProvider
    ? integrationConnectors[connectPromptProvider]
    : null;

  const openIntegrationReconnect = useCallback(
    (providerKey: IntegrationProviderKey) => {
      setActiveIntegrationPicker(null);
      setConnectPromptProvider(providerKey);
      queryClient.invalidateQueries([QueryKeys.integrations]);
      queryClient.invalidateQueries([QueryKeys.integrationStatus, providerKey]);
    },
    [queryClient],
  );

  const handleIntegrationAttachError = useCallback(
    (error: unknown, providerKey: IntegrationProviderKey) => {
      if (!isIntegrationReconnectApiError(error)) {
        return;
      }
      showToast({
        message: localize('com_integrations_reconnect_required_toast'),
        status: 'warning',
      });
      openIntegrationReconnect(providerKey);
    },
    [localize, openIntegrationReconnect, showToast],
  );

  const { data: integrationsList } = useIntegrationsQuery({
    enabled: integrationsEnabled,
  });

  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const { fileSearchAllowedByAgent, codeAllowedByAgent, provider } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  const handleUploadClick = useCallback(
    (fileType?: FileUploadType) => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.value = '';
      if (
        fileType !== undefined &&
        isPermissiveMimeConfig(endpointFileConfig?.supportedMimeTypes)
      ) {
        inputRef.current.accept = '';
      } else if (fileType === 'image') {
        inputRef.current.accept = 'image/*,.heif,.heic';
      } else if (fileType === 'document') {
        inputRef.current.accept = '.pdf,application/pdf';
      } else if (fileType === 'image_document') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf';
      } else if (fileType === 'image_document_extended') {
        inputRef.current.accept = `image/*,.heif,.heic,${bedrockDocumentExtensions}`;
      } else if (fileType === 'image_document_video_audio') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*';
      } else {
        inputRef.current.accept = '';
      }
      inputRef.current.click();
      inputRef.current.accept = '';
    },
    [endpointFileConfig?.supportedMimeTypes],
  );

  const closeAttachMenu = useCallback(() => {
    setIsPopoverActive(false);
  }, []);

  const openDrivePicker = useCallback(() => {
    closeAttachMenu();
    setActiveIntegrationPicker('google-drive');
  }, [closeAttachMenu]);

  const dropdownItems = useMemo(() => {
    const setToolResource = (value: EToolResources | undefined) => {
      toolResourceRef.current = value;
    };

    const createMenuItems = (onAction: (fileType?: FileUploadType) => void) => {
      const items: MenuItemProps[] = [];

      let currentProvider = provider || endpoint;

      // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
      if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
        currentProvider = Providers.OPENROUTER;
      }

      const isAzureWithResponsesApi =
        (currentProvider === EModelEndpoint.azureOpenAI ||
          endpointType === EModelEndpoint.azureOpenAI) &&
        useResponsesApi === true;

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
            } else if (
              currentProvider === Providers.BEDROCK ||
              endpointType === EModelEndpoint.bedrock
            ) {
              fileType = 'image_document_extended';
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
          label: localize('com_ui_upload_code_environment'),
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

    if (integrationsEnabled) {
      for (const integration of integrationsList?.integrations ?? []) {
        if (!integration.enabled) {
          continue;
        }

        const menuConfig = INTEGRATION_ATTACH_MENU[integration.providerKey];
        if (!menuConfig) {
          continue;
        }

        const isConnected = isIntegrationConnected(integration.status);
        const providerKey = integration.providerKey;
        const { menuLabelKey, Icon } = menuConfig;

        if (providerKey === 'google-drive' && isConnected) {
          localItems.push({
            label: localize(menuLabelKey as Parameters<typeof localize>[0]),
            onClick: () => {},
            icon: <Icon className="icon-md" />,
            subItems: createMenuItems(openDrivePicker),
          });
          continue;
        }

        localItems.push({
          label: localize(menuLabelKey as Parameters<typeof localize>[0]),
          onClick: () => {
            if (isConnected) {
              if (providerKey === 'google-mail' || providerKey === 'google-calendar') {
                toolResourceRef.current = EToolResources.context;
              }
              closeAttachMenu();
              setActiveIntegrationPicker(providerKey);
              return;
            }
            closeAttachMenu();
            setConnectPromptProvider(providerKey);
          },
          icon: <Icon className="icon-md" />,
        });
      }
    }

    if (sharePointEnabled) {
      const sharePointItems = createMenuItems(() => {
        closeAttachMenu();
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
  }, [
    localize,
    endpoint,
    provider,
    endpointType,
    capabilities,
    useResponsesApi,
    handleUploadClick,
    setEphemeralAgent,
    sharePointEnabled,
    integrationsEnabled,
    integrationsList?.integrations,
    codeAllowedByAgent,
    fileSearchAllowedByAgent,
    closeAttachMenu,
    openDrivePicker,
    setIsSharePointDialogOpen,
    setActiveIntegrationPicker,
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
  const handleIntegrationConnect = async () => {
    if (!connectPromptConnector) {
      return;
    }

    const connected = await connectPromptConnector.connect();
    if (connected) {
      setConnectPromptProvider(null);
    }
  };

  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };

  const handleGoogleDriveFilesSelected = async (
    driveFiles: Parameters<typeof handleGoogleDriveFiles>[0],
  ) => {
    closeAttachMenu();
    try {
      await handleGoogleDriveFiles(driveFiles);
      setActiveIntegrationPicker(null);
    } catch (error) {
      console.error('Google Drive file processing error:', error);
      handleIntegrationAttachError(error, 'google-drive');
    }
  };

  const handleGmailMessagesSelected = async (messages: Array<{ id: string }>) => {
    try {
      await attachGmailMessages(messages.map((message) => message.id));
      setActiveIntegrationPicker(null);
    } catch (error) {
      console.error('Gmail attach error:', error);
      handleIntegrationAttachError(error, 'google-mail');
    }
  };

  const handleCalendarEventsSelected = async (events: Array<{ id: string }>) => {
    try {
      await attachCalendarEvents(events.map((event) => event.id));
      setActiveIntegrationPicker(null);
    } catch (error) {
      console.error('Google Calendar attach error:', error);
      handleIntegrationAttachError(error, 'google-calendar');
    }
  };

  return (
    <>
      <FileUpload
        ref={inputRef}
        handleFileChange={(e) => {
          handleFileChange(e, toolResourceRef.current);
          toolResourceRef.current = undefined;
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
      <GoogleDrivePickerDialog
        isOpen={activeIntegrationPicker === 'google-drive'}
        onOpenChange={(open) => {
          if (!open) {
            closeAttachMenu();
            setActiveIntegrationPicker(null);
          }
        }}
        onFilesSelected={handleGoogleDriveFilesSelected}
        isAttaching={isDriveProcessing}
        maxSelectionCount={endpointFileConfig?.fileLimit}
        onReconnect={() => openIntegrationReconnect('google-drive')}
      />
      <GmailPickerDialog
        isOpen={activeIntegrationPicker === 'google-mail'}
        onOpenChange={(open) => {
          if (!open) {
            setActiveIntegrationPicker(null);
          }
        }}
        onMessagesSelected={handleGmailMessagesSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={endpointFileConfig?.fileLimit}
        onReconnect={() => openIntegrationReconnect('google-mail')}
      />
      <GoogleCalendarPickerDialog
        isOpen={activeIntegrationPicker === 'google-calendar'}
        onOpenChange={(open) => {
          if (!open) {
            setActiveIntegrationPicker(null);
          }
        }}
        onEventsSelected={handleCalendarEventsSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={endpointFileConfig?.fileLimit}
        onReconnect={() => openIntegrationReconnect('google-calendar')}
      />
      <ConnectProviderPrompt
        isOpen={connectPromptProvider != null}
        onOpenChange={(open) => {
          if (!open) {
            setConnectPromptProvider(null);
          }
        }}
        labelKey={connectPromptConnector?.labelKey ?? 'com_integrations_google_drive'}
        status={connectPromptConnector?.status}
        isConnecting={connectPromptConnector?.isConnecting}
        onConnect={handleIntegrationConnect}
      />
    </>
  );
};

export default React.memo(AttachFileMenu);
