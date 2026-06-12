import React from 'react';
import { getEndpointField } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';

interface DialogManagerProps {
  keyDialogOpen: boolean;
  keyDialogEndpoint?: string | null;
  onOpenChange: (open: boolean) => void;
  endpointsConfig: TEndpointsConfig;
}

const DialogManager = ({
  keyDialogOpen,
  keyDialogEndpoint,
  onOpenChange,
  endpointsConfig,
}: DialogManagerProps) => {
  return (
    <>
      {keyDialogEndpoint && (
        <SetKeyDialog
          open={keyDialogOpen}
          endpoint={keyDialogEndpoint}
          endpointType={getEndpointField(endpointsConfig, keyDialogEndpoint, 'type')}
          onOpenChange={onOpenChange}
          userProvideURL={getEndpointField(endpointsConfig, keyDialogEndpoint, 'userProvideURL')}
          userProvideAccessKeyId={getEndpointField(
            endpointsConfig,
            keyDialogEndpoint,
            'userProvideAccessKeyId',
          )}
          userProvideSecretAccessKey={getEndpointField(
            endpointsConfig,
            keyDialogEndpoint,
            'userProvideSecretAccessKey',
          )}
          userProvideSessionToken={getEndpointField(
            endpointsConfig,
            keyDialogEndpoint,
            'userProvideSessionToken',
          )}
          userProvideBearerToken={getEndpointField(
            endpointsConfig,
            keyDialogEndpoint,
            'userProvideBearerToken',
          )}
        />
      )}
    </>
  );
};

export default DialogManager;
