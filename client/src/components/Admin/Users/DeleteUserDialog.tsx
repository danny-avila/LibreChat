/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Input,
  Label,
  Textarea,
  useToastContext,
  NotificationSeverity,
} from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useDeleteUserMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Please provide a reason.')
  .max(500, 'Reason must be 500 characters or fewer.');

type FormValues = { confirmEmail: string; reason: string };

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function DeleteUserDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const deleteMutation = useDeleteUserMutation();
  const runDelete = useAdminMutation(deleteMutation);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { confirmEmail: '', reason: '' } });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ confirmEmail: '', reason: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const confirmEmailValue = watch('confirmEmail');
  const emailMatches = confirmEmailValue.trim().toLowerCase() === user.email.toLowerCase();

  const onSubmit = async (values: FormValues) => {
    const reasonResult = reasonSchema.safeParse(values.reason);
    if (!reasonResult.success) {
      setServerError(reasonResult.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    if (!emailMatches) {
      setServerError(`Type "${user.email}" exactly to confirm.`);
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await runDelete({
        id: user._id,
        confirmEmail: values.confirmEmail.trim(),
        reason: reasonResult.data,
      });
      showToast({
        message: `Deleted ${user.email}`,
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
      title="Delete user"
      description={
        <span className="text-red-600 dark:text-red-400">
          This permanently deletes the user account, transactions, and balance. This action cannot
          be undone.
        </span>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !emailMatches}
            onClick={handleSubmit(onSubmit)}
          >
            {pending ? 'Deleting…' : 'Delete user'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-confirm-email">
            Type <span className="font-mono text-red-600 dark:text-red-400">{user.email}</span> to
            confirm
          </Label>
          <Input
            id="delete-confirm-email"
            type="email"
            autoComplete="off"
            placeholder={user.email}
            disabled={pending}
            {...register('confirmEmail')}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-reason">Reason (required)</Label>
          <Textarea
            id="delete-reason"
            placeholder="Why is this account being deleted?"
            maxLength={500}
            disabled={pending}
            {...register('reason')}
          />
          {errors.reason ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.reason.message}
            </p>
          ) : null}
        </div>
        {serverError ? (
          <p className="text-xs text-red-500" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </UserActionDialog>
  );
}
