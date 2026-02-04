import { useState } from 'react';
import { Button, Input, Label, Spinner, useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useChangePasswordMutation } from '~/data-provider';

export default function ChangePassword() {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

  const { mutate: changePassword, isLoading } = useChangePasswordMutation({
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast({
        status: 'success',
        message: localize('com_auth_reset_password_success'),
      });
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : localize('com_ui_error');
      showToast({
        status: 'error',
        message,
      });
    },
  });

  const handleSubmit = () => {
    if (!canSubmit || !passwordsMatch) {
      return;
    }

    changePassword({ currentPassword, newPassword });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-base font-semibold">{localize('com_auth_reset_password')}</div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">{localize('com_auth_password_confirm')}</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <div className="text-xs text-red-500">{localize('com_auth_password_not_match')}</div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || !passwordsMatch || isLoading}
            variant="submit"
          >
            {isLoading ? <Spinner className="icon-sm" /> : localize('com_auth_reset_password')}
          </Button>
        </div>
      </div>
    </div>
  );
}
