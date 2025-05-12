import { useForm } from 'react-hook-form';
import { useState, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useRequestPasswordResetMutation } from 'librechat-data-provider/react-query';
import type { TRequestPasswordReset, TRequestPasswordResetResponse } from 'librechat-data-provider';
import type { FC } from 'react';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize } from '~/hooks';

const BodyTextWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div
      className="relative mt-6 rounded-lg border border-blue-500/20 bg-blue-50/50 px-6 py-4 text-blue-700 shadow-sm transition-all dark:bg-blue-950/30 dark:text-blue-100"
      role="alert"
    >
      {children}
    </div>
  );
};

const ResetPasswordBodyText = () => {
  const localize = useLocalize();
  return (
    <div className="flex flex-col space-y-4">
      <p>{localize('com_auth_reset_password_if_email_exists')}</p>
      <a
        className="inline-flex text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        href="/login"
      >
        {localize('com_auth_back_to_login')}
      </a>
    </div>
  );
};

function RequestPasswordReset() {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRequestPasswordReset>();
  const [bodyText, setBodyText] = useState<ReactNode | undefined>(undefined);
  const { startupConfig, setHeaderText } = useOutletContext<TLoginLayoutContext>();

  const requestPasswordReset = useRequestPasswordResetMutation();

  const onSubmit = (data: TRequestPasswordReset) => {
    requestPasswordReset.mutate(data, {
      onSuccess: (data: TRequestPasswordResetResponse) => {
        if (data.link && !startupConfig?.emailEnabled) {
          setHeaderText('com_auth_reset_password');
          setBodyText(
            <span>
              {localize('com_auth_click')}{' '}
              <a className="text-blue-500 hover:underline" href={data.link}>
                {localize('com_auth_here')}
              </a>{' '}
              {localize('com_auth_to_reset_your_password')}
            </span>,
          );
        } else {
          setHeaderText('com_auth_reset_password_link_sent');
          setBodyText(<ResetPasswordBodyText />);
        }
      },
      onError: () => {
        setHeaderText('com_auth_reset_password_link_sent');
        setBodyText(<ResetPasswordBodyText />);
      },
    });
  };

  if (bodyText) {
    return <BodyTextWrapper>{bodyText}</BodyTextWrapper>;
  }

  return (
    <form
      className="mt-8 space-y-6"
      aria-label="Password reset form"
      method="POST"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="space-y-2">
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
            className="
              peer w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3
              text-base text-gray-900 placeholder-transparent transition-all
              focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20
              dark:border-gray-700 dark:text-white dark:focus:border-blue-500
            "
            placeholder="email@example.com"
          />
          <label
            htmlFor="email"
            className="
              absolute -top-2 left-2 z-10 bg-white px-2 text-sm text-gray-600
              transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-base
              peer-placeholder-shown:text-gray-500 peer-focus:-top-2 peer-focus:text-sm
              peer-focus:text-blue-600 dark:bg-gray-900 dark:text-gray-400
              dark:peer-focus:text-blue-500
            "
          >
            {localize('com_auth_email_address')}
          </label>
        </div>
        {errors.email && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-4">
        <button
          type="submit"
          disabled={!!errors.email}
          className="
            w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white
            transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2
            focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50
            disabled:hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700
          "
        >
          {localize('com_auth_continue')}
        </button>
        <a
          href="/login"
          className="block text-center text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {localize('com_auth_back_to_login')}
        </a>
      </div>
    </form>
  );
}

export default RequestPasswordReset;
