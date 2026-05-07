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
import { useAdjustBalanceMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const formSchema = z.object({
  delta: z
    .number({ invalid_type_error: 'Enter a number of tokens.' })
    .int('Delta must be an integer.')
    .refine((n) => n !== 0, 'Delta cannot be zero.'),
  reason: z
    .string()
    .trim()
    .min(1, 'Please provide a reason.')
    .max(500, 'Reason must be 500 characters or fewer.'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  user: AdminUserListItem;
  currentBalance?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function AdjustBalanceDialog({
  user,
  currentBalance,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { showToast } = useToastContext();
  const adjustMutation = useAdjustBalanceMutation();
  const runAdjust = useAdminMutation(adjustMutation);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ delta: string; reason: string }>({
    defaultValues: { delta: '', reason: '' },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ delta: '', reason: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (raw: { delta: string; reason: string }) => {
    const deltaNum = Number(raw.delta);
    const parsed = formSchema.safeParse({ delta: deltaNum, reason: raw.reason });
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await runAdjust({
        userId: user._id,
        delta: parsed.data.delta,
        reason: parsed.data.reason,
      });
      showToast({
        message: `Balance adjusted by ${parsed.data.delta.toLocaleString()} tokens for ${user.email}`,
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
      title="Adjust balance"
      description={
        <>
          Apply a relative change to <span className="font-mono">{user.email}</span>&apos;s token
          balance. Use a negative number to remove tokens.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Adjusting…' : 'Apply adjustment'}
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
          <Label htmlFor="adjust-balance-delta">Delta (tokens)</Label>
          <div className="relative">
            <Input
              id="adjust-balance-delta"
              type="number"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 50000 or -10000"
              disabled={pending}
              className="pr-16"
              {...register('delta')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              tokens
            </span>
          </div>
          {typeof currentBalance === 'number' ? (
            <p className="text-xs text-muted-foreground">
              Current balance: {currentBalance.toLocaleString()} tokens
            </p>
          ) : null}
          {errors.delta ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.delta.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="adjust-balance-reason">Reason (required)</Label>
          <Textarea
            id="adjust-balance-reason"
            placeholder="Why is this adjustment being made?"
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
