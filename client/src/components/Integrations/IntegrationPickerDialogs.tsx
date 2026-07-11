import type { IntegrationPickerDialogsProps } from '~/hooks/integrations/useIntegrationPickers';
import { ConnectProviderPrompt } from './ConnectProviderPrompt';
import { GoogleDrivePickerDialog } from './GoogleDrivePickerDialog';
import { GmailPickerDialog } from './GmailPickerDialog';
import { GoogleCalendarPickerDialog } from './GoogleCalendarPickerDialog';
import { DropboxPickerDialog } from './DropboxPickerDialog';
import { BoxPickerDialog } from './BoxPickerDialog';
import { ClioPickerDialog } from './ClioPickerDialog';
import { MicrosoftOneDrivePickerDialog } from './MicrosoftOneDrivePickerDialog';
import { MicrosoftOutlookMailPickerDialog } from './MicrosoftOutlookMailPickerDialog';
import { MicrosoftOutlookCalendarPickerDialog } from './MicrosoftOutlookCalendarPickerDialog';

/**
 * Renders every integration picker dialog plus the connect/reconnect prompt.
 * Driven entirely by `dialogProps` produced by `useIntegrationPickers`, so it
 * can be mounted anywhere with access to the active conversation's file state.
 */
export function IntegrationPickerDialogs({
  activeIntegrationPicker,
  closePicker,
  maxSelectionCount,
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
  connectPromptLabelKey,
  connectPromptStatus,
  isConnectingPrompt,
  handleIntegrationConnect,
}: IntegrationPickerDialogsProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closePicker();
    }
  };

  return (
    <>
      <GoogleDrivePickerDialog
        isOpen={activeIntegrationPicker === 'google-drive'}
        onOpenChange={handleOpenChange}
        onFilesSelected={handleGoogleDriveFilesSelected}
        isAttaching={isDriveProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('google-drive')}
      />
      <DropboxPickerDialog
        isOpen={activeIntegrationPicker === 'dropbox'}
        onOpenChange={handleOpenChange}
        onFilesSelected={handleDropboxFilesSelected}
        isAttaching={isDropboxProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('dropbox')}
      />
      <BoxPickerDialog
        isOpen={activeIntegrationPicker === 'box'}
        onOpenChange={handleOpenChange}
        onFilesSelected={handleBoxFilesSelected}
        isAttaching={isBoxProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('box')}
      />
      <ClioPickerDialog
        isOpen={activeIntegrationPicker === 'clio'}
        onOpenChange={handleOpenChange}
        onFilesSelected={handleClioFilesSelected}
        isAttaching={isClioProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('clio')}
      />
      <MicrosoftOneDrivePickerDialog
        isOpen={activeIntegrationPicker === 'microsoft'}
        onOpenChange={handleOpenChange}
        onFilesSelected={handleMicrosoftOneDriveFilesSelected}
        isAttaching={isMicrosoftProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('microsoft')}
      />
      <GmailPickerDialog
        isOpen={activeIntegrationPicker === 'google-mail'}
        onOpenChange={handleOpenChange}
        onMessagesSelected={handleGmailMessagesSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('google-mail')}
      />
      <GoogleCalendarPickerDialog
        isOpen={activeIntegrationPicker === 'google-calendar'}
        onOpenChange={handleOpenChange}
        onEventsSelected={handleCalendarEventsSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('google-calendar')}
      />
      <MicrosoftOutlookMailPickerDialog
        isOpen={activeIntegrationPicker === 'microsoft-mail'}
        onOpenChange={handleOpenChange}
        onMessagesSelected={handleOutlookMailMessagesSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('microsoft')}
      />
      <MicrosoftOutlookCalendarPickerDialog
        isOpen={activeIntegrationPicker === 'microsoft-calendar'}
        onOpenChange={handleOpenChange}
        onEventsSelected={handleOutlookCalendarEventsSelected}
        isAttaching={isTextAttachProcessing}
        maxSelectionCount={maxSelectionCount}
        onReconnect={() => openIntegrationReconnect('microsoft')}
      />
      <ConnectProviderPrompt
        isOpen={connectPromptProvider != null}
        onOpenChange={(open) => {
          if (!open) {
            setConnectPromptProvider(null);
          }
        }}
        labelKey={connectPromptLabelKey}
        status={connectPromptStatus}
        isConnecting={isConnectingPrompt}
        onConnect={handleIntegrationConnect}
        canDisconnect={false}
      />
    </>
  );
}
