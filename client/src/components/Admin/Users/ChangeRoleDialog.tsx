/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Label, Textarea, useToastContext, NotificationSeverity } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useChangeUserRoleMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Please provide a reason.')
  .max(500, 'Reason must be 500 characters or fewer.');

type FormValues = { role: string; reason: string };

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const roleOptions = [
  { value: SystemRoles.USER, label: 'USER' },
  { value: SystemRoles.ADMIN, label: 'ADMIN' },
];

export default function ChangeRoleDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const changeRoleMutation = useChangeUserRoleMutation();
  const runChange = useAdminMutation(changeRoleMutation);

  const initialRole = user.role === SystemRoles.ADMIN ? SystemRoles.USER : SystemRoles.ADMIN;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { role: initialRole, reason: '' },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ role: initialRole, reason: '' });
      setServerError(null);
    }
  }, [open, reset, initialRole]);

  const selectedRole = watch('role');

  const onSubmit = async (values: FormValues) => {
    const parsed = reasonSchema.safeParse(values.reason);
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    if (values.role === user.role) {
      setServerError('Choose a different role to apply a change.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await runChange({
        id: user._id,
        role: values.role,
        reason: parsed.data,
      });
      showToast({
        message: `Role updated to ${values.role} for ${user.email}`,
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
      title="Change role"
      description={
        <>
          Update the role for <span className="font-mono">{user.email}</span>. Current role:{' '}
          <span className="font-semibold">{user.role ?? 'USER'}</span>.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Updating…' : 'Update role'}
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
          <Label htmlFor="change-role-select">New role</Label>
          <select
            id="change-role-select"
            disabled={pending}
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            {...register('role')}
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {selectedRole === user.role ? (
            <p className="text-xs text-muted-foreground">This is the user&apos;s current role.</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="change-role-reason">Reason (required)</Label>
          <Textarea
            id="change-role-reason"
            placeholder="Why is this role change being made?"
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
