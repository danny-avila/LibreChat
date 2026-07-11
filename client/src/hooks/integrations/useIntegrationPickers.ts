import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToastContext } from '@librechat/client';
import { EToolResources, QueryKeys } from 'librechat-data-provider';
import type {
  EndpointFileConfig,
  IntegrationConnectionStatus,
  IntegrationProviderKey,
} from 'librechat-data-provider';
import type { FileHandlingState } from '~/hooks/Files/useFileHandling';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useGoogleDriveFileHandlingNoChatContext } from '~/hooks/Files/useGoogleDriveFileHandling';
import { useDropboxFileHandlingNoChatContext } from '~/hooks/Files/useDropboxFileHandling';
import { useBoxFileHandlingNoChatContext } from '~/hooks/Files/useBoxFileHandling';
import { useClioFileHandlingNoChatContext } from '~/hooks/Files/useClioFileHandling';
import { useMicrosoftOneDriveFileHandlingNoChatContext } from '~/hooks/Files/useMicrosoftOneDriveFileHandling';
import { useIntegrationTextAttachHandlingNoChatContext } from '~/hooks/Files/useIntegrationTextAttachHandling';
import { useIntegrationConnectors } from '~/hooks/integrations/useIntegrationConnectors';
import useLocalize from '~/hooks/useLocalize';
import { isIntegrationReconnectApiError } from '~/utils/integrationReconnect';

export type IntegrationPickerKey = IntegrationProviderKey | 'microsoft-mail' | 'microsoft-calendar';

export interface IntegrationPickerOpeners {
  openDrivePicker: () => void;
  openDropboxPicker: () => void;
  openBoxPicker: () => void;
  openClioPicker: () => void;
  openMicrosoftOneDrivePicker: () => void;
  openMicrosoftOutlookMailPicker: () => void;
  openMicrosoftOutlookCalendarPicker: () => void;
  openGmailPicker: () => void;
  openCalendarPicker: () => void;
}

export interface IntegrationPickerDialogsProps {
  activeIntegrationPicker: IntegrationPickerKey | null;
  closePicker: () => void;
  maxSelectionCount?: number;
  isDriveProcessing: boolean;
  isDropboxProcessing: boolean;
  isBoxProcessing: boolean;
  isClioProcessing: boolean;
  isMicrosoftProcessing: boolean;
  isTextAttachProcessing: boolean;
  handleGoogleDriveFilesSelected: (files: Parameters<HandleFiles>[0]) => void;
  handleDropboxFilesSelected: (files: Parameters<HandleDropboxFiles>[0]) => void;
  handleBoxFilesSelected: (files: Parameters<HandleBoxFiles>[0]) => void;
  handleClioFilesSelected: (files: Parameters<HandleClioFiles>[0]) => void;
  handleMicrosoftOneDriveFilesSelected: (files: Parameters<HandleOneDriveFiles>[0]) => void;
  handleGmailMessagesSelected: (messages: Array<{ id: string }>) => void;
  handleCalendarEventsSelected: (events: Array<{ id: string }>) => void;
  handleOutlookMailMessagesSelected: (messages: Array<{ id: string }>) => void;
  handleOutlookCalendarEventsSelected: (events: Array<{ id: string }>) => void;
  openIntegrationReconnect: (providerKey: IntegrationProviderKey) => void;
  connectPromptProvider: IntegrationProviderKey | null;
  setConnectPromptProvider: (providerKey: IntegrationProviderKey | null) => void;
  connectPromptLabelKey: string;
  connectPromptStatus?: IntegrationConnectionStatus;
  isConnectingPrompt?: boolean;
  handleIntegrationConnect: () => void;
}

type HandleFiles = ReturnType<
  typeof useGoogleDriveFileHandlingNoChatContext
>['handleGoogleDriveFiles'];
type HandleDropboxFiles = ReturnType<
  typeof useDropboxFileHandlingNoChatContext
>['handleDropboxFiles'];
type HandleBoxFiles = ReturnType<typeof useBoxFileHandlingNoChatContext>['handleBoxFiles'];
type HandleClioFiles = ReturnType<typeof useClioFileHandlingNoChatContext>['handleClioFiles'];
type HandleOneDriveFiles = ReturnType<
  typeof useMicrosoftOneDriveFileHandlingNoChatContext
>['handleMicrosoftOneDriveFiles'];

export interface UseIntegrationPickersResult {
  openers: IntegrationPickerOpeners;
  setToolResource: (value: EToolResources | undefined) => void;
  handleFileChange: ReturnType<typeof useFileHandlingNoChatContext>['handleFileChange'];
  dialogProps: IntegrationPickerDialogsProps;
}

/**
 * Bundles all integration file/text attach handlers, picker open state, and
 * reconnect/connect prompt logic so a host component (e.g. the integrations
 * sidebar panel) can open provider pickers and attach to the active
 * conversation via the shared `*NoChatContext` hooks.
 */
export default function useIntegrationPickers(
  fileState: FileHandlingState,
  {
    endpointFileConfig,
    integrationsEnabled,
  }: { endpointFileConfig?: EndpointFileConfig; integrationsEnabled: boolean },
): UseIntegrationPickersResult {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const toolResourceRef = useRef<EToolResources | undefined>();

  const [activeIntegrationPicker, setActiveIntegrationPicker] =
    useState<IntegrationPickerKey | null>(null);
  const [connectPromptProvider, setConnectPromptProvider] = useState<IntegrationProviderKey | null>(
    null,
  );

  const { handleFileChange } = useFileHandlingNoChatContext(undefined, fileState);
  const { handleGoogleDriveFiles, isProcessing: isDriveProcessing } =
    useGoogleDriveFileHandlingNoChatContext({ toolResource: toolResourceRef.current }, fileState);
  const { handleDropboxFiles, isProcessing: isDropboxProcessing } =
    useDropboxFileHandlingNoChatContext({ toolResource: toolResourceRef.current }, fileState);
  const { handleBoxFiles, isProcessing: isBoxProcessing } = useBoxFileHandlingNoChatContext(
    { toolResource: toolResourceRef.current },
    fileState,
  );
  const { handleClioFiles, isProcessing: isClioProcessing } = useClioFileHandlingNoChatContext(
    { toolResource: toolResourceRef.current },
    fileState,
  );
  const { handleMicrosoftOneDriveFiles, isProcessing: isMicrosoftProcessing } =
    useMicrosoftOneDriveFileHandlingNoChatContext(
      { toolResource: toolResourceRef.current },
      fileState,
    );
  const {
    attachGmailMessages,
    attachCalendarEvents,
    attachOutlookMailMessages,
    attachOutlookCalendarEvents,
    isProcessing: isTextAttachProcessing,
  } = useIntegrationTextAttachHandlingNoChatContext(
    { toolResource: toolResourceRef.current, providerLabel: 'Integration' },
    fileState,
  );

  const integrationConnectors = useIntegrationConnectors(integrationsEnabled);
  const connectPromptConnector = connectPromptProvider
    ? integrationConnectors[connectPromptProvider]
    : null;

  const setToolResource = useCallback((value: EToolResources | undefined) => {
    toolResourceRef.current = value;
  }, []);

  const closePicker = useCallback(() => {
    setActiveIntegrationPicker(null);
  }, []);

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

  const openDrivePicker = useCallback(() => setActiveIntegrationPicker('google-drive'), []);
  const openDropboxPicker = useCallback(() => setActiveIntegrationPicker('dropbox'), []);
  const openBoxPicker = useCallback(() => setActiveIntegrationPicker('box'), []);
  const openClioPicker = useCallback(() => setActiveIntegrationPicker('clio'), []);
  const openMicrosoftOneDrivePicker = useCallback(
    () => setActiveIntegrationPicker('microsoft'),
    [],
  );
  const openGmailPicker = useCallback(() => {
    toolResourceRef.current = EToolResources.context;
    setActiveIntegrationPicker('google-mail');
  }, []);
  const openCalendarPicker = useCallback(() => {
    toolResourceRef.current = EToolResources.context;
    setActiveIntegrationPicker('google-calendar');
  }, []);
  const openMicrosoftOutlookMailPicker = useCallback(() => {
    toolResourceRef.current = EToolResources.context;
    setActiveIntegrationPicker('microsoft-mail');
  }, []);
  const openMicrosoftOutlookCalendarPicker = useCallback(() => {
    toolResourceRef.current = EToolResources.context;
    setActiveIntegrationPicker('microsoft-calendar');
  }, []);

  const handleGoogleDriveFilesSelected = useCallback(
    async (driveFiles: Parameters<HandleFiles>[0]) => {
      try {
        await handleGoogleDriveFiles(driveFiles);
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Google Drive file processing error:', error);
        handleIntegrationAttachError(error, 'google-drive');
      }
    },
    [handleGoogleDriveFiles, handleIntegrationAttachError],
  );

  const handleDropboxFilesSelected = useCallback(
    async (dropboxFiles: Parameters<HandleDropboxFiles>[0]) => {
      try {
        await handleDropboxFiles(dropboxFiles);
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Dropbox file processing error:', error);
        handleIntegrationAttachError(error, 'dropbox');
      }
    },
    [handleDropboxFiles, handleIntegrationAttachError],
  );

  const handleBoxFilesSelected = useCallback(
    async (boxFiles: Parameters<HandleBoxFiles>[0]) => {
      try {
        await handleBoxFiles(boxFiles);
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Box file processing error:', error);
        handleIntegrationAttachError(error, 'box');
      }
    },
    [handleBoxFiles, handleIntegrationAttachError],
  );

  const handleClioFilesSelected = useCallback(
    async (clioFiles: Parameters<HandleClioFiles>[0]) => {
      try {
        await handleClioFiles(clioFiles);
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Clio file processing error:', error);
        handleIntegrationAttachError(error, 'clio');
      }
    },
    [handleClioFiles, handleIntegrationAttachError],
  );

  const handleMicrosoftOneDriveFilesSelected = useCallback(
    async (oneDriveFiles: Parameters<HandleOneDriveFiles>[0]) => {
      try {
        await handleMicrosoftOneDriveFiles(oneDriveFiles);
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Microsoft OneDrive file processing error:', error);
        handleIntegrationAttachError(error, 'microsoft');
      }
    },
    [handleMicrosoftOneDriveFiles, handleIntegrationAttachError],
  );

  const handleGmailMessagesSelected = useCallback(
    async (messages: Array<{ id: string }>) => {
      try {
        await attachGmailMessages(messages.map((message) => message.id));
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Gmail attach error:', error);
        handleIntegrationAttachError(error, 'google-mail');
      }
    },
    [attachGmailMessages, handleIntegrationAttachError],
  );

  const handleCalendarEventsSelected = useCallback(
    async (events: Array<{ id: string }>) => {
      try {
        await attachCalendarEvents(events.map((event) => event.id));
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Google Calendar attach error:', error);
        handleIntegrationAttachError(error, 'google-calendar');
      }
    },
    [attachCalendarEvents, handleIntegrationAttachError],
  );

  const handleOutlookMailMessagesSelected = useCallback(
    async (messages: Array<{ id: string }>) => {
      try {
        await attachOutlookMailMessages(messages.map((message) => message.id));
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Outlook mail attach error:', error);
        handleIntegrationAttachError(error, 'microsoft');
      }
    },
    [attachOutlookMailMessages, handleIntegrationAttachError],
  );

  const handleOutlookCalendarEventsSelected = useCallback(
    async (events: Array<{ id: string }>) => {
      try {
        await attachOutlookCalendarEvents(events.map((event) => event.id));
        setActiveIntegrationPicker(null);
      } catch (error) {
        console.error('Outlook calendar attach error:', error);
        handleIntegrationAttachError(error, 'microsoft');
      }
    },
    [attachOutlookCalendarEvents, handleIntegrationAttachError],
  );

  const handleIntegrationConnect = useCallback(async () => {
    const connector = connectPromptConnector;
    if (!connector) {
      return;
    }

    // Close the (modal) prompt before opening the Nango Connect UI. A Radix modal
    // dialog sets `pointer-events: none` on the body, which would leave the Nango
    // popup (portaled outside the dialog) visible but unclickable — a frozen screen.
    setConnectPromptProvider(null);
    await connector.connect();
  }, [connectPromptConnector]);

  return {
    openers: {
      openDrivePicker,
      openDropboxPicker,
      openBoxPicker,
      openClioPicker,
      openMicrosoftOneDrivePicker,
      openMicrosoftOutlookMailPicker,
      openMicrosoftOutlookCalendarPicker,
      openGmailPicker,
      openCalendarPicker,
    },
    setToolResource,
    handleFileChange,
    dialogProps: {
      activeIntegrationPicker,
      closePicker,
      maxSelectionCount: endpointFileConfig?.fileLimit,
      isDriveProcessing,
      isDropboxProcessing,
      isBoxProcessing,
      isClioProcessing,
      isMicrosoftProcessing,
      isTextAttachProcessing,
      handleGoogleDriveFilesSelected,
      handleDropboxFilesSelected,
      handleBoxFilesSelected,
      handleClioFilesSelected,
      handleMicrosoftOneDriveFilesSelected,
      handleGmailMessagesSelected,
      handleCalendarEventsSelected,
      handleOutlookMailMessagesSelected,
      handleOutlookCalendarEventsSelected,
      openIntegrationReconnect,
      connectPromptProvider,
      setConnectPromptProvider,
      connectPromptLabelKey: connectPromptConnector?.labelKey ?? 'com_integrations_google_drive',
      connectPromptStatus: connectPromptConnector?.status,
      isConnectingPrompt: connectPromptConnector?.isConnecting,
      handleIntegrationConnect,
    },
  };
}
