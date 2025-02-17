import React, { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { REGEXP_ONLY_DIGITS, REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot, Label } from '~/components';
import { useVerifyTwoFactorTempMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface VerifyPayload {
  tempToken: string;
  token?: string;
  backupCode?: string;
}

type TwoFactorFormInputs = {
  token?: string;
  backupCode?: string;
};

const TwoFactorScreen: React.FC = React.memo(() => {
  const [searchParams] = useSearchParams();
  const tempTokenRaw = searchParams.get('tempToken');
  const tempToken = tempTokenRaw !== null && tempTokenRaw !== '' ? tempTokenRaw : '';

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TwoFactorFormInputs>();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [useBackup, setUseBackup] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { mutate: verifyTempMutate } = useVerifyTwoFactorTempMutation({
    onSuccess: (result) => {
      if (result.token != null && result.token !== '') {
        window.location.href = '/';
      }
    },
    onMutate: () => {
      setIsLoading(true);
    },
    onError: (error: unknown) => {
      setIsLoading(false);
      const err = error as { response?: { data?: { message?: unknown } } };
      const errorMsg =
        typeof err.response?.data?.message === 'string'
          ? err.response.data.message
          : 'Error verifying 2FA';
      showToast({ message: errorMsg, status: 'error' });
    },
  });

  const onSubmit = useCallback(
    (data: TwoFactorFormInputs) => {
      const payload: VerifyPayload = { tempToken };
      if (useBackup && data.backupCode != null && data.backupCode !== '') {
        payload.backupCode = data.backupCode;
      } else if (data.token != null && data.token !== '') {
        payload.token = data.token;
      }
      verifyTempMutate(payload);
    },
    [tempToken, useBackup, verifyTempMutate],
  );

  const toggleBackupOn = useCallback(() => {
    setUseBackup(true);
  }, []);

  const toggleBackupOff = useCallback(() => {
    setUseBackup(false);
  }, []);

  return (
    <div className="mt-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Label className="flex justify-center break-keep text-center text-sm text-text-primary">
          {localize('com_auth_two_factor')}
        </Label>
        {!useBackup && (
          <div className="my-4 flex justify-center text-text-primary">
            <Controller
              name="token"
              control={control}
              render={({ field: { onChange, value } }) => (
                <InputOTP
                  maxLength={6}
                  value={value != null ? value : ''}
                  onChange={onChange}
                  pattern={REGEXP_ONLY_DIGITS}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              )}
            />
            {errors.token && <span className="text-sm text-red-500">{errors.token.message}</span>}
          </div>
        )}
        {useBackup && (
          <div className="my-4 flex justify-center text-text-primary">
            <Controller
              name="backupCode"
              control={control}
              render={({ field: { onChange, value } }) => (
                <InputOTP
                  maxLength={8}
                  value={value != null ? value : ''}
                  onChange={onChange}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                    <InputOTPSlot index={6} />
                    <InputOTPSlot index={7} />
                  </InputOTPGroup>
                </InputOTP>
              )}
            />
            {errors.backupCode && (
              <span className="text-sm text-red-500">{errors.backupCode.message}</span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            aria-label={localize('com_auth_continue')}
            data-testid="login-button"
            disabled={isLoading}
            className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-80 dark:bg-green-600 dark:hover:bg-green-700"
          >
            {isLoading ? localize('com_auth_email_verifying_ellipsis') : localize('com_ui_verify')}
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          {!useBackup ? (
            <button
              type="button"
              onClick={toggleBackupOn}
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_ui_use_backup_code')}
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleBackupOff}
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_ui_use_2fa_code')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

export default TwoFactorScreen;
