import {
  useRevokeAllUserKeysMutation,
  useRevokeUserKeyMutation,
} from 'librechat-data-provider/react-query';
import React, { useState } from 'react';
import { Button, Label, OGDialog, OGDialogTrigger, Spinner } from '~/components';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize } from '~/hooks';

export const RevokeKeysButton = ({
  endpoint = '',
  all = false,
  disabled = false,
  setDialogOpen,
}: {
  endpoint?: string;
  all?: boolean;
  disabled?: boolean;
  setDialogOpen?: (open: boolean) => void;
}) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const revokeKeyMutation = useRevokeUserKeyMutation(endpoint);
  const revokeKeysMutation = useRevokeAllUserKeysMutation();

  const handleSuccess = () => {
    if (!setDialogOpen) {
      return;
    }

    setDialogOpen(false);
  };

  const onClick = () => {
    if (all) {
      revokeKeysMutation.mutate({});
    } else {
      revokeKeyMutation.mutate({}, { onSuccess: handleSuccess });
    }
  };

  const dialogTitle = all
    ? localize('com_ui_revoke_keys')
    : localize('com_ui_revoke_key_endpoint', endpoint);

  const dialogMessage = all
    ? localize('com_ui_revoke_keys_confirm')
    : localize('com_ui_revoke_key_confirm');

  const isLoading = revokeKeyMutation.isLoading || revokeKeysMutation.isLoading;

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogTrigger asChild>
        <Button
          variant="destructive"
          className="flex items-center justify-center rounded-lg transition-colors duration-200"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          {localize('com_ui_revoke')}
        </Button>
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={dialogTitle}
        className="max-w-[450px]"
        main={<Label className="text-left text-sm font-medium">{dialogMessage}</Label>}
        selection={{
          selectHandler: onClick,
          selectClasses:
            'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
          selectText: isLoading ? <Spinner /> : localize('com_ui_revoke'),
        }}
      />
    </OGDialog>
  );
};
