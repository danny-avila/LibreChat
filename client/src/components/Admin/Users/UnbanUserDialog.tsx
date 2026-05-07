/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { Button, Label, Textarea, useToastContext, NotificationSeverity } from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useUnbanUserMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function UnbanUserDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const unbanMutation = useUnbanUserMutation();
  const runUnban = useAdminMutation(unbanMutation);

  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setServerError(null);
    }
  }, [open]);

  const onConfirm = async () => {
    setServerError(null);
    setPending(true);
    try {
      const trimmed = reason.trim();
      await runUnban({
        id: user._id,
        reason: trimmed.length > 0 ? trimmed : undefined,
      });
      showToast({
        message: `Unbanned ${user.email}`,
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
      title="Unban user"
      description={
        <>
          Restore sign-in access for <span className="font-mono">{user.email}</span>.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? 'Unbanning…' : 'Unban user'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="unban-reason">Reason (optional)</Label>
        <Textarea
          id="unban-reason"
          placeholder="Optional note to include in the audit log."
          value={reason}
          maxLength={500}
          disabled={pending}
          onChange={(e) => setReason(e.target.value)}
        />
        {serverError ? (
          <p className="text-xs text-red-500" role="alert">
            {serverError}
          </p>
        ) : null}
      </div>
    </UserActionDialog>
  );
}
