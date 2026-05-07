/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Label, Textarea, useToastContext, NotificationSeverity } from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useImpersonateUserMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Please provide a reason.')
  .max(500, 'Reason must be 500 characters or fewer.');

type FormValues = { reason: string };

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ImpersonateDialog({ user, open, onOpenChange }: Props) {
  const { showToast } = useToastContext();
  const mutation = useImpersonateUserMutation();
  const runImpersonate = useAdminMutation(mutation);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { reason: '' } });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    const parsed = reasonSchema.safeParse(values.reason);
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      const { url } = await runImpersonate({ id: user._id, reason: parsed.data });
      // Same-tab navigation. Browser cookies are domain-scoped, not
      // tab-scoped: opening the consume URL in a new tab would overwrite
      // the admin's `refreshToken` cookie anyway, breaking the original
      // session on its next request. Replacing the current tab is
      // therefore the honest UX — and matches how most admin tools
      // ("view as user", "assume role") actually work.
      window.location.assign(url);
      // No toast — the page will navigate immediately.
      onOpenChange(false);
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
      title="Sign in as user"
      description={
        <>
          This will end your admin session and sign you in as{' '}
          <span className="font-mono">{user.email}</span>. Every action is logged as theirs; the
          audit trail links it back to your admin account. Log back in as yourself when you&apos;re
          done.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Switching…' : 'End admin session and sign in'}
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
        <Label htmlFor="impersonate-reason">Reason (required)</Label>
        <Textarea
          id="impersonate-reason"
          placeholder="Why are you impersonating this user?"
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
