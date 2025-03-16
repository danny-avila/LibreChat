import React from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { getEndpointField } from '~/utils';

interface DialogManagerProps {
  keyDialogOpen: boolean;
  keyDialogEndpoint?: EModelEndpoint;
  setKeyDialogOpen: (open: boolean) => void;
  specKeyDialogOpen: boolean;
  setSpecKeyDialogOpen: (open: boolean) => void;
  selectedSpecForKey: TModelSpec | null;
  endpointsConfig: Record<string, any>;
}

const DialogManager = ({
  keyDialogOpen,
  keyDialogEndpoint,
  setKeyDialogOpen,
  specKeyDialogOpen,
  setSpecKeyDialogOpen,
  selectedSpecForKey,
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
      {selectedSpecForKey?.preset.endpoint && (
        <SetKeyDialog
          open={specKeyDialogOpen}
          endpoint={selectedSpecForKey.preset.endpoint}
          endpointType={
            selectedSpecForKey.preset.endpointType ||
            getEndpointField(endpointsConfig, selectedSpecForKey.preset.endpoint, 'type')
          }
          onOpenChange={setSpecKeyDialogOpen}
        />
      )}
    </>
  );
};

export default DialogManager;
