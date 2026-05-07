/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input, Label, useToastContext, NotificationSeverity } from '@librechat/client';
import { useInviteUserMutation } from '~/data-provider/Admin';
import UserActionDialog from './UserActionDialog';
import { friendlyUserError } from './dialogUtils';

const formSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  name: z.string().trim().max(120, 'Name must be 120 characters or fewer.').optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function InviteUserDialog({ open, onOpenChange, onSuccess }: Props) {
  const { showToast } = useToastContext();
  const inviteMutation = useInviteUserMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { email: '', name: '' } });

  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ email: '', name: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? 'Invalid input.');
      return;
    }
    setServerError(null);
    setPending(true);
    try {
      const payload: { email: string; name?: string } = { email: parsed.data.email };
      if (parsed.data.name) payload.name = parsed.data.name;
      await inviteMutation.mutateAsync(payload);
      showToast({
        message: `Invite sent to ${parsed.data.email}`,
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
      title="Invite user"
      description="Send an invite email so a new user can finish creating their account."
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit(onSubmit)}>
            {pending ? 'Sending…' : 'Send invite'}
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
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            placeholder="user@example.com"
            disabled={pending}
            {...register('email')}
          />
          {errors.email ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.email.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input
            id="invite-name"
            type="text"
            autoComplete="off"
            placeholder="Jane Doe"
            disabled={pending}
            {...register('name')}
          />
          {errors.name ? (
            <p className="text-xs text-red-500" role="alert">
              {errors.name.message}
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
