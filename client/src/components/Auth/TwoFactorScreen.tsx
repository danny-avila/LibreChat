import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocalize } from '~/hooks';
import { useVerifyTwoFactorTempMutation } from 'librechat-data-provider/react-query';
import { useToastContext } from '~/Providers';

type TwoFactorFormInputs = {
  token?: string;
  backupCode?: string;
};

type TwoFactorScreenProps = {
  tempToken: string;
  onCancel: () => void;
};

const TwoFactorScreen: React.FC<TwoFactorScreenProps> = ({ tempToken, onCancel }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<TwoFactorFormInputs>();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  // This state controls whether to show the backup code input.
  const [useBackup, setUseBackup] = useState<boolean>(false);

  const { mutate: verifyTempMutate, isLoading } = useVerifyTwoFactorTempMutation();

  const onSubmit = (data: TwoFactorFormInputs) => {
    // Build the payload based on whether the backup code is used.
    const payload: any = { tempToken };
    if (useBackup && data.backupCode) {
      payload.backupCode = data.backupCode;
    } else if (data.token) {
      payload.token = data.token;
    }
    verifyTempMutate(payload, {
      onSuccess: (result) => {
        if (result.token) {
          // On success, redirect or update your auth context as needed.
          window.location.href = '/';
        }
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || localize('Error verifying 2FA');
        alert(errorMsg);
      },
    });
  };

  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Enter 2FA Code</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Show token input only if not using backup */}
        {!useBackup && (
          <div className="mb-4">
            <label className="block text-sm font-medium">2FA Code</label>
            <input
              type="text"
              {...register('token')}
              placeholder="Enter your 2FA code"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
            {errors.token && <span className="text-red-500 text-sm">{errors.token.message}</span>}
          </div>
        )}
        {/* Show backup code input only when using backup */}
        {useBackup && (
          <div className="mb-4">
            <label className="block text-sm font-medium">Backup Code</label>
            <input
              type="text"
              {...register('backupCode')}
              placeholder="Enter your backup code"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
            {errors.backupCode && <span className="text-red-500 text-sm">{errors.backupCode.message}</span>}
          </div>
        )}
        <div className="mb-4">
          {!useBackup ? (
            <button
              type="button"
              onClick={() => setUseBackup(true)}
              className="text-blue-600 hover:underline text-sm"
            >
                  Use Backup Code Instead?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setUseBackup(false)}
              className="text-blue-600 hover:underline text-sm"
            >
                  Use 2FA Code Instead?
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-400"
          >
              Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default TwoFactorScreen;