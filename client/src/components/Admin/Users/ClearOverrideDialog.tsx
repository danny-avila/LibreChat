/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { Button, Label, Textarea, useToastContext, NotificationSeverity } from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useClearOverrideMutation } from '~/data-provider/Admin';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function ClearOverrideDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const clearMutation = useClearOverrideMutation();

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
      await clearMutation.mutateAsync({
        userId: user._id,
        reason: trimmed.length > 0 ? trimmed : undefined,
      });
      showToast({
        message: `Manual override cleared for ${user.email}`,
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
      title="Clear manual override"
      description={
        <>
          Remove the manual subscription override for{' '}
          <span className="font-mono">{user.email}</span>. RevenueCat will become the source of
          truth again.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? 'Clearing…' : 'Clear override'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="clear-override-reason">Reason (optional)</Label>
        <Textarea
          id="clear-override-reason"
          placeholder="Optional note for the audit log."
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
