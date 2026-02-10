import React, { useState } from 'react';
import {
  OGDialogTemplate,
  Button,
  Label,
  OGDialog,
  OGDialogTrigger,
  Spinner,
  useToastContext,
} from '@librechat/client';
import { useMailConnectionStatus, useDisconnectMailMutation } from '~/data-provider';

function ConnectedMailAccounts() {
  const { data: mailStatus, isLoading: statusLoading } = useMailConnectionStatus();
  const { showToast } = useToastContext();
  const [openGmail, setOpenGmail] = useState(false);
  const [openOutlook, setOpenOutlook] = useState(false);

  const disconnectMutation = useDisconnectMailMutation({
    onSuccess: (_data, provider) => {
      showToast({
        message: `${provider === 'gmail' ? 'Gmail' : 'Outlook'} disconnected`,
        status: 'success',
      });
    },
    onError: () => {
      showToast({ message: 'Failed to disconnect email', status: 'error' });
    },
  });

  const handleDisconnect = (provider: string) => {
    disconnectMutation.mutate(provider);
    if (provider === 'gmail') {
      setOpenGmail(false);
    } else {
      setOpenOutlook(false);
    }
  };

  const isConnected = mailStatus?.gmail || mailStatus?.outlook;

  if (statusLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="font-medium">Connected Email</Label>
      {!isConnected && (
        <p className="text-xs text-text-secondary">No email accounts connected</p>
      )}
      {mailStatus?.gmail && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm">Gmail</span>
          </div>
          <OGDialog open={openGmail} onOpenChange={setOpenGmail}>
            <OGDialogTrigger asChild>
              <Button variant="destructive" size="sm" onClick={() => setOpenGmail(true)}>
                Disconnect
              </Button>
            </OGDialogTrigger>
            <OGDialogTemplate
              showCloseButton={false}
              title="Disconnect Gmail"
              className="max-w-[450px]"
              main={
                <Label className="text-left text-sm font-medium">
                  Are you sure you want to disconnect Gmail? AI will no longer be able to access
                  your email.
                </Label>
              }
              selection={{
                selectHandler: () => handleDisconnect('gmail'),
                selectClasses:
                  'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
                selectText: disconnectMutation.isLoading ? <Spinner /> : 'Disconnect',
              }}
            />
          </OGDialog>
        </div>
      )}
      {mailStatus?.outlook && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm">Outlook</span>
          </div>
          <OGDialog open={openOutlook} onOpenChange={setOpenOutlook}>
            <OGDialogTrigger asChild>
              <Button variant="destructive" size="sm" onClick={() => setOpenOutlook(true)}>
                Disconnect
              </Button>
            </OGDialogTrigger>
            <OGDialogTemplate
              showCloseButton={false}
              title="Disconnect Outlook"
              className="max-w-[450px]"
              main={
                <Label className="text-left text-sm font-medium">
                  Are you sure you want to disconnect Outlook? AI will no longer be able to access
                  your email.
                </Label>
              }
              selection={{
                selectHandler: () => handleDisconnect('outlook'),
                selectClasses:
                  'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
                selectText: disconnectMutation.isLoading ? <Spinner /> : 'Disconnect',
              }}
            />
          </OGDialog>
        </div>
      )}
    </div>
  );
}

export default React.memo(ConnectedMailAccounts);
