/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Label, Textarea, useToastContext, NotificationSeverity } from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useRevokeProMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const formSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Please provide a reason.')
    .max(500, 'Reason must be 500 characters or fewer.'),
});

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function RevokeProDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const revokeMutation = useRevokeProMutation();
  const runRevoke = useAdminMutation(revokeMutation);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: { reason: string }) => {
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await runRevoke({ userId: user._id, reason: parsed.data.reason });
      showToast({
        message: `Pro revoked for ${user.email}`,
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
      title="Revoke Pro"
      description={
        <>
          Revoke the Pro override for <span className="font-mono">{user.email}</span>.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Revoking…' : 'Revoke Pro'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)();
        }}
      >
        <Label htmlFor="revoke-pro-reason">Reason (required)</Label>
        <Textarea
          id="revoke-pro-reason"
          placeholder="Why is Pro being revoked?"
          maxLength={500}
          disabled={pending}
          {...register('reason')}
        />
        {errors.reason ? (
          <p className="text-xs text-red-500" role="alert">
            {errors.reason.message}
          </p>
        ) : null}
        {serverError ? (
          <p className="text-xs text-red-500" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </UserActionDialog>
  );
}
