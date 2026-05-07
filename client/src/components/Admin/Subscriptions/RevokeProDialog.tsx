/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Label, useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useRevokeProMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import AdminActionDialog from './AdminActionDialog';
import { friendlyErrorMessage, getServerError } from './dialogUtils';

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be 500 characters or fewer'),
});

type FormValues = z.infer<typeof schema>;

type RevokeProDialogProps = {
  userId: string;
  userEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function RevokeProDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: RevokeProDialogProps) {
  const { showToast } = useToastContext();
  const mutation = useRevokeProMutation();
  const runMutation = useAdminMutation(mutation);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
      setServerError(null);
    }
  }, [open, userId, reset]);

  const description = useMemo(
    () =>
      userEmail
        ? `Revoke Pro access for ${userEmail}. This sets a manual override blocking RevenueCat sync.`
        : 'Revoke Pro access. This sets a manual override blocking RevenueCat sync.',
    [userEmail],
  );

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;

    try {
      await runMutation({ userId, reason: parsed.data.reason });
      showToast({ message: 'Pro access revoked.' });
      onOpenChange(false);
    } catch (err) {
      const { code } = getServerError(err);
      const friendly = friendlyErrorMessage(err);
      if (code === 'USER_NOT_FOUND' || code === 'NO_SUBSCRIPTION') {
        setServerError(friendly);
        return;
      }
      setServerError(friendly);
      showToast({ message: friendly, severity: NotificationSeverity.ERROR });
    }
  };

  const isPending = mutation.isLoading;

  return (
    <AdminActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
      title="Revoke Pro"
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="revoke-pro-form"
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Revoking…' : 'Revoke Pro'}
          </button>
        </>
      }
    >
      <form
        id="revoke-pro-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="revoke-pro-reason">Reason</Label>
          <textarea
            id="revoke-pro-reason"
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100"
            disabled={isPending}
            aria-invalid={errors.reason ? 'true' : 'false'}
            {...register('reason', {
              required: 'Reason is required',
              maxLength: { value: 500, message: 'Reason must be 500 characters or fewer' },
              validate: (v) =>
                (v.trim().length >= 1 && v.trim().length <= 500) ||
                'Reason must be 1-500 characters',
            })}
          />
          {errors.reason ? (
            <span className="text-xs text-red-500" role="alert">
              {errors.reason.message}
            </span>
          ) : null}
        </div>
        {serverError ? (
          <div className="text-sm text-red-500" role="alert">
            {serverError}
          </div>
        ) : null}
      </form>
    </AdminActionDialog>
  );
}
