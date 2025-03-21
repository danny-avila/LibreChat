import React from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { getEndpointField } from '~/utils';

interface DialogManagerProps {
  keyDialogOpen: boolean;
  keyDialogEndpoint?: EModelEndpoint;
  setKeyDialogOpen: (open: boolean) => void;
  endpointsConfig: Record<string, any>;
}

const DialogManager = ({
  keyDialogOpen,
  keyDialogEndpoint,
  setKeyDialogOpen,
  endpointsConfig,
}: DialogManagerProps) => {
  return (
    <>
      {keyDialogEndpoint && (
        <SetKeyDialog
          open={keyDialogOpen}
          endpoint={keyDialogEndpoint}
          endpointType={getEndpointField(endpointsConfig, keyDialogEndpoint, 'type')}
          onOpenChange={setKeyDialogOpen}
          userProvideURL={getEndpointField(endpointsConfig, keyDialogEndpoint, 'userProvideURL')}
        />
      )}
    </>
  );
};

export default DialogManager;
