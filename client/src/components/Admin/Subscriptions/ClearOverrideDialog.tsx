/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Label, useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useClearOverrideMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import AdminActionDialog from './AdminActionDialog';
import { friendlyErrorMessage, getServerError } from './dialogUtils';

const schema = z.object({
  reason: z.string().trim().max(500, 'Reason must be 500 characters or fewer').optional(),
});

type FormValues = z.infer<typeof schema>;

type ClearOverrideDialogProps = {
  userId: string;
  userEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ClearOverrideDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: ClearOverrideDialogProps) {
  const { showToast } = useToastContext();
  const mutation = useClearOverrideMutation();
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

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) return;

    try {
      const reason =
        parsed.data.reason && parsed.data.reason.length > 0 ? parsed.data.reason : undefined;
      await runMutation({ userId, reason });
      showToast({ message: 'Manual override cleared.' });
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
      title="Clear manual override"
      description={
        <span>
          {userEmail ? `For ${userEmail}. ` : null}
          This allows the natural RevenueCat sync to take over again. No other fields are changed.
        </span>
      }
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
            form="clear-override-form"
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {isPending ? 'Clearing…' : 'Clear override'}
          </button>
        </>
      }
    >
      <form
        id="clear-override-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="clear-override-reason">Reason (optional)</Label>
          <textarea
            id="clear-override-reason"
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100"
            disabled={isPending}
            aria-invalid={errors.reason ? 'true' : 'false'}
            {...register('reason', {
              maxLength: { value: 500, message: 'Reason must be 500 characters or fewer' },
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
