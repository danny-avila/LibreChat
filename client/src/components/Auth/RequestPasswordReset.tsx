import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useRequestPasswordResetMutation } from 'librechat-data-provider/react-query';
import type { TRequestPasswordReset, TRequestPasswordResetResponse } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize } from '~/hooks';

function RequestPasswordReset() {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRequestPasswordReset>();
  const [resetLink, setResetLink] = useState<string | undefined>(undefined);
  const [bodyText, setBodyText] = useState<React.ReactNode | undefined>(undefined);
  const { startupConfig, setError, setHeaderText } = useOutletContext<TLoginLayoutContext>();

  const requestPasswordReset = useRequestPasswordResetMutation();

  const onSubmit = (data: TRequestPasswordReset) => {
    requestPasswordReset.mutate(data, {
      onSuccess: (data: TRequestPasswordResetResponse) => {
        if (!startupConfig?.emailEnabled) {
          setResetLink(data.link);
        }
      },
      onError: () => {
        setError('com_auth_error_reset_password');
        setTimeout(() => {
          setError(null);
        }, 5000);
      },
    });
  };

  useEffect(() => {
    if (bodyText) {
      return;
    }
    if (!requestPasswordReset.isSuccess) {
      setHeaderText('com_auth_reset_password');
      setBodyText(undefined);
      return;
    }

    if (startupConfig?.emailEnabled) {
      setHeaderText('com_auth_reset_password_link_sent');
      setBodyText(localize('com_auth_reset_password_email_sent'));
      return;
    }

    setHeaderText('com_auth_reset_password');
    setBodyText(
      <span>
        {localize('com_auth_click')}{' '}
        <a className="text-green-500 hover:underline" href={resetLink}>
          {localize('com_auth_here')}
        </a>{' '}
        {localize('com_auth_to_reset_your_password')}
      </span>,
    );
  }, [
    requestPasswordReset.isSuccess,
    startupConfig?.emailEnabled,
    resetLink,
    localize,
    setHeaderText,
    bodyText,
  ]);

  if (bodyText) {
    return (
      <div
        className="relative mt-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700 dark:bg-green-900 dark:text-white"
        role="alert"
      >
        {bodyText}
      </div>
    );
  }

  return (
    <form
      className="mt-6"
      aria-label="Password reset form"
      method="POST"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="mb-2">
        <div className="relative">
          <input
            type="email"
            id="email"
            autoComplete="off"
            aria-label={localize('com_auth_email')}
            {...register('email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 3,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            aria-invalid={!!errors.email}
            className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-gray-300 bg-transparent px-3.5 pb-3.5 pt-4 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-600 dark:text-white dark:focus:border-green-500"
            placeholder=" "
          />
          <label
            htmlFor="email"
            className="absolute start-1 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-3 text-sm text-gray-500 duration-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-3 peer-focus:text-green-600 dark:bg-gray-900 dark:text-gray-400 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
          >
            {localize('com_auth_email_address')}
          </label>
        </div>
        {errors.email && (
          <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="mt-6">
        <button
          type="submit"
          disabled={!!errors.email}
          className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
        >
          {localize('com_auth_continue')}
        </button>
        <div className="mt-4 flex justify-center">
          <a href="/login" className="text-sm text-green-500">
            {localize('com_auth_back_to_login')}
          </a>
        </div>
      </div>
    </form>
  );
}

export default RequestPasswordReset;
