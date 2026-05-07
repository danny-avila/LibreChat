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
import { useSetBalanceMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const formSchema = z.object({
  tokenCredits: z
    .number({ invalid_type_error: 'Enter a non-negative integer.' })
    .int('Must be an integer.')
    .min(0, 'Token credits cannot be negative.'),
  reason: z
    .string()
    .trim()
    .min(1, 'Please provide a reason.')
    .max(500, 'Reason must be 500 characters or fewer.'),
});

type Props = {
  user: AdminUserListItem;
  currentBalance?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function SetBalanceDialog({
  user,
  currentBalance,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { showToast } = useToastContext();
  const setMutation = useSetBalanceMutation();
  const runSet = useAdminMutation(setMutation);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ tokenCredits: string; reason: string }>({
    defaultValues: { tokenCredits: '', reason: '' },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ tokenCredits: '', reason: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (raw: { tokenCredits: string; reason: string }) => {
    const num = Number(raw.tokenCredits);
    const parsed = formSchema.safeParse({ tokenCredits: num, reason: raw.reason });
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      await runSet({
        userId: user._id,
        tokenCredits: parsed.data.tokenCredits,
        reason: parsed.data.reason,
      });
      showToast({
        message: `Balance set to ${parsed.data.tokenCredits.toLocaleString()} tokens for ${user.email}`,
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
      title="Set balance"
      description={
        <>
          Replace <span className="font-mono">{user.email}</span>&apos;s balance with an absolute
          value.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Saving…' : 'Set balance'}
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
          <Label htmlFor="set-balance-tokens">Token credits</Label>
          <div className="relative">
            <Input
              id="set-balance-tokens"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              placeholder="e.g. 100000"
              disabled={pending}
              className="pr-16"
              {...register('tokenCredits')}
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
          {errors.tokenCredits ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.tokenCredits.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="set-balance-reason">Reason (required)</Label>
          <Textarea
            id="set-balance-reason"
            placeholder="Why is the balance being set?"
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
