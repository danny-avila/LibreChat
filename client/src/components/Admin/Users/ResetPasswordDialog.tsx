/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { Button, useToastContext, NotificationSeverity } from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useResetPasswordMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function ResetPasswordDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const resetMutation = useResetPasswordMutation();
  const runReset = useAdminMutation(resetMutation);

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setServerError(null);
  }, [open]);

  const onConfirm = async () => {
    setServerError(null);
    setPending(true);
    try {
      await runReset({ id: user._id });
      showToast({
        message: `Password reset email sent to ${user.email}`,
        severity: NotificationSeverity.SUCCESS,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setServerError(friendlyUserError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <UserActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Send password reset"
      description={
        <>
          A password reset email will be sent to <span className="font-mono">{user.email}</span>.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? 'Sending…' : 'Send reset email'}
          </Button>
        </>
      }
    >
      {serverError ? (
        <p className="text-xs text-red-500" role="alert">
          {serverError}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          The user will receive an email with a link to set a new password.
        </p>
      )}
    </UserActionDialog>
  );
}
