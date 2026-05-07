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
import { useGrantProMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const formSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Please provide a reason.')
    .max(500, 'Reason must be 500 characters or fewer.'),
  plan: z.string().trim().max(120, 'Plan must be 120 characters or fewer.').optional(),
});

type Props = {
  user: AdminUserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function GrantProDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const grantMutation = useGrantProMutation();
  const runGrant = useAdminMutation(grantMutation);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ reason: string; plan: string }>({
    defaultValues: { reason: '', plan: '' },
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ reason: '', plan: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (raw: { reason: string; plan: string }) => {
    const parsed = formSchema.safeParse({
      reason: raw.reason,
      plan: raw.plan ? raw.plan : undefined,
    });
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      const payload: { userId: string; reason: string; plan?: string } = {
        userId: user._id,
        reason: parsed.data.reason,
      };
      if (parsed.data.plan) payload.plan = parsed.data.plan;
      await runGrant(payload);
      showToast({
        message: `Pro granted to ${user.email}`,
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
      title="Grant Pro"
      description={
        <>
          Grant a Pro override to <span className="font-mono">{user.email}</span>.
        </>
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Granting…' : 'Grant Pro'}
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
          <Label htmlFor="grant-pro-plan">Plan label (optional)</Label>
          <Input
            id="grant-pro-plan"
            type="text"
            placeholder="e.g. comp_pro"
            disabled={pending}
            {...register('plan')}
          />
          {errors.plan ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.plan.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="grant-pro-reason">Reason (required)</Label>
          <Textarea
            id="grant-pro-reason"
            placeholder="Why is Pro being granted?"
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
