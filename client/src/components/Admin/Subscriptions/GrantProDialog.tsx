/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Input, Label, useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useGrantProMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import AdminActionDialog from './AdminActionDialog';
import { friendlyErrorMessage, getServerError } from './dialogUtils';

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be 500 characters or fewer'),
  plan: z.string().trim().max(120, 'Plan name is too long').optional(),
});

type FormValues = z.infer<typeof schema>;

type GrantProDialogProps = {
  userId: string;
  userEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function GrantProDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: GrantProDialogProps) {
  const { showToast } = useToastContext();
  const mutation = useGrantProMutation();
  const runMutation = useAdminMutation(mutation);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { reason: '', plan: 'god_mode' },
  });

  // Reset form whenever the dialog re-opens for a different user.
  useEffect(() => {
    if (open) {
      reset({ reason: '', plan: 'god_mode' });
      setServerError(null);
    }
  }, [open, userId, reset]);

  const description = useMemo(
    () =>
      userEmail
        ? `Grant Pro entitlement to ${userEmail}. This sets a manual override that takes precedence over RevenueCat.`
        : 'Grant Pro entitlement. This sets a manual override that takes precedence over RevenueCat.',
    [userEmail],
  );

  const onSubmit = async (values: FormValues) => {
    setServerError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      // Validation errors are already surfaced by RHF via register.
      return;
    }

    try {
      await runMutation({
        userId,
        reason: parsed.data.reason,
        plan: parsed.data.plan && parsed.data.plan.length > 0 ? parsed.data.plan : undefined,
      });
      showToast({ message: 'Pro access granted.' });
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
      title="Grant Pro"
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
            form="grant-pro-form"
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {isPending ? 'Granting…' : 'Grant Pro'}
          </button>
        </>
      }
    >
      <form
        id="grant-pro-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="grant-pro-reason">Reason</Label>
          <textarea
            id="grant-pro-reason"
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="grant-pro-plan">Plan</Label>
          <Input
            id="grant-pro-plan"
            placeholder="god_mode"
            disabled={isPending}
            className="text-gray-900 dark:text-gray-100"
            {...register('plan')}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Optional. Defaults to <code>god_mode</code>.
          </span>
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
