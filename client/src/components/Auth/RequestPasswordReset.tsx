import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import {
  useGetStartupConfig,
  useRequestPasswordResetMutation,
} from 'librechat-data-provider/react-query';
import type { TRequestPasswordReset, TRequestPasswordResetResponse } from 'librechat-data-provider';
import { ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';

function RequestPasswordReset() {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRequestPasswordReset>();
  const requestPasswordReset = useRequestPasswordResetMutation();
  const config = useGetStartupConfig();
  const [requestError, setRequestError] = useState<boolean>(false);
  const [resetLink, setResetLink] = useState<string | undefined>(undefined);
  const [headerText, setHeaderText] = useState<string>('');
  const [bodyText, setBodyText] = useState<React.ReactNode | undefined>(undefined);

  const onSubmit = (data: TRequestPasswordReset) => {
    requestPasswordReset.mutate(data, {
      onSuccess: (data: TRequestPasswordResetResponse) => {
        console.log('emailEnabled: ', config.data?.emailEnabled);
        if (!config.data?.emailEnabled) {
          setResetLink(data.link);
        }
      },
      onError: () => {
        setRequestError(true);
        setTimeout(() => {
          setRequestError(false);
        }, 5000);
      },
    });
  };

  useEffect(() => {
    if (requestPasswordReset.isSuccess) {
      if (config.data?.emailEnabled) {
        setHeaderText(localize('com_auth_reset_password_link_sent'));
        setBodyText(localize('com_auth_reset_password_email_sent'));
      } else {
        setHeaderText(localize('com_auth_reset_password'));
        setBodyText(
          <span>
            {localize('com_auth_click')}{' '}
            <a className="text-green-500 hover:underline" href={resetLink}>
              {localize('com_auth_here')}
            </a>{' '}
            {localize('com_auth_to_reset_your_password')}
          </span>,
        );
      }
    } else {
      setHeaderText(localize('com_auth_reset_password'));
      setBodyText(undefined);
    }
  }, [requestPasswordReset.isSuccess, config.data?.emailEnabled, resetLink, localize]);

  const renderFormContent = () => {
    if (bodyText) {
      return (
        <div
          className="relative mt-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700 dark:bg-green-900 dark:text-white"
          role="alert"
        >
          {bodyText}
        </div>
      );
    } else {
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
              ></input>
              <label
                htmlFor="email"
                className="absolute start-1 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-3 text-sm text-gray-500 duration-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-3 peer-focus:text-green-600 dark:bg-gray-900 dark:text-gray-400 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
              >
                {localize('com_auth_email_address')}
              </label>
            </div>
            {errors.email && (
              <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
                {/* @ts-ignore not sure why */}
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
  };

  const privacyPolicy = config.data?.interface?.privacyPolicy;
  const termsOfService = config.data?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-green-500"
      href={privacyPolicy.externalUrl}
      target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className="text-sm text-green-500"
      href={termsOfService.externalUrl}
      target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">
      <div className="mt-12 h-24 w-full bg-cover">
        <img src="/assets/logo.svg" className="h-full w-full object-contain" alt="Logo" />
      </div>
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <div className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
            {headerText}
          </h1>
          {requestError && (
            <div
              className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
              role="alert"
            >
              {localize('com_auth_error_reset_password')}
            </div>
          )}
          {renderFormContent()}
        </div>
      </div>
      <div className="align-end m-4 flex justify-center gap-2">
        {privacyPolicyRender}
        {privacyPolicyRender && termsOfServiceRender && (
          <div className="border-r-[1px] border-gray-300 dark:border-gray-600" />
        )}
        {termsOfServiceRender}
      </div>
    </div>
  );
}

export default RequestPasswordReset;
