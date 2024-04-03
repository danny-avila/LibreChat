import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResetPasswordMutation } from 'librechat-data-provider/react-query';
import type { TResetPassword } from 'librechat-data-provider';
import { ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';

function ResetPassword() {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TResetPassword>();
  const resetPassword = useResetPasswordMutation();
  const [resetError, setResetError] = useState<boolean>(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const password = watch('password');

  const onSubmit = (data: TResetPassword) => {
    resetPassword.mutate(data, {
      onError: () => {
        setResetError(true);
      },
    });
  };

  if (resetPassword.isSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
        <div className="absolute bottom-0 left-0 m-4">
          <ThemeSelector />
        </div>
        <div className="mt-6 w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
            {localize('com_auth_reset_password_success')}
          </h1>
          <div
            className="relative mb-8 mt-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-center text-green-700 dark:bg-gray-900 dark:text-white"
            role="alert"
          >
            {localize('com_auth_login_with_new_password')}
          </div>
          <button
            onClick={() => navigate('/login')}
            aria-label={localize('com_auth_sign_in')}
            className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
          >
            {localize('com_auth_continue')}
          </button>
        </div>
      </div>
    );
  } else {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
        <div className="absolute bottom-0 left-0 m-4">
          <ThemeSelector />
        </div>
        <div className="mt-6 w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          <h1 className="mb-4 text-center text-3xl font-semibold text-black dark:text-white">
            {localize('com_auth_reset_password')}
          </h1>
          {resetError && (
            <div
              className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
              role="alert"
            >
              {localize('com_auth_error_invalid_reset_token')}{' '}
              <a className="font-semibold text-green-600 hover:underline" href="/forgot-password">
                {localize('com_auth_click_here')}
              </a>{' '}
              {localize('com_auth_to_try_again')}
            </div>
          )}
          <form
            className="mt-6"
            aria-label="Password reset form"
            method="POST"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="mb-2">
              <div className="relative">
                <input
                  type="hidden"
                  id="token"
                  // @ts-ignore - Type 'string | null' is not assignable to type 'string | number | readonly string[] | undefined'
                  value={params.get('token')}
                  {...register('token', { required: 'Unable to process: No valid reset token' })}
                />
                <input
                  type="hidden"
                  id="userId"
                  // @ts-ignore - Type 'string | null' is not assignable to type 'string | number | readonly string[] | undefined'
                  value={params.get('userId')}
                  {...register('userId', { required: 'Unable to process: No valid user id' })}
                />
                <input
                  type="password"
                  id="password"
                  autoComplete="current-password"
                  aria-label={localize('com_auth_password')}
                  {...register('password', {
                    required: localize('com_auth_password_required'),
                    minLength: {
                      value: 8,
                      message: localize('com_auth_password_min_length'),
                    },
                    maxLength: {
                      value: 128,
                      message: localize('com_auth_password_max_length'),
                    },
                  })}
                  aria-invalid={!!errors.password}
                  className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-black/10 bg-white px-2.5 pb-2.5 pt-5 text-sm text-gray-800 focus:border-green-500 focus:outline-none dark:border-white/20 dark:bg-gray-900 dark:text-white dark:focus:border-green-500"
                  placeholder=" "
                ></input>
                <label
                  htmlFor="password"
                  className="pointer-events-none absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500 dark:text-gray-200"
                >
                  {localize('com_auth_password')}
                </label>
              </div>

              {errors.password && (
                <span role="alert" className="mt-1 text-sm text-black dark:text-white">
                  {/* @ts-ignore not sure why */}
                  {errors.password.message}
                </span>
              )}
            </div>
            <div className="mb-2">
              <div className="relative">
                <input
                  type="password"
                  id="confirm_password"
                  aria-label={localize('com_auth_password_confirm')}
                  // uncomment to prevent pasting in confirm field
                  onPaste={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                  {...register('confirm_password', {
                    validate: (value) =>
                      value === password || localize('com_auth_password_not_match'),
                  })}
                  aria-invalid={!!errors.confirm_password}
                  className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-black/10 bg-white px-2.5 pb-2.5 pt-5 text-sm text-gray-800 focus:border-green-500 focus:outline-none dark:border-white/20 dark:bg-gray-900 dark:text-white dark:focus:border-green-500"
                  placeholder=" "
                ></input>
                <label
                  htmlFor="confirm_password"
                  className="pointer-events-none absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500 dark:text-gray-200"
                >
                  {localize('com_auth_password_confirm')}
                </label>
              </div>
              {errors.confirm_password && (
                <span role="alert" className="mt-1 text-sm text-black dark:text-white">
                  {/* @ts-ignore not sure why */}
                  {errors.confirm_password.message}
                </span>
              )}
              {errors.token && (
                <span role="alert" className="mt-1 text-sm text-black dark:text-white">
                  {/* @ts-ignore not sure why */}
                  {errors.token.message}
                </span>
              )}
              {errors.userId && (
                <span role="alert" className="mt-1 text-sm text-black dark:text-white">
                  {/* @ts-ignore not sure why */}
                  {errors.userId.message}
                </span>
              )}
            </div>
            <div className="mt-6">
              <button
                disabled={!!errors.password || !!errors.confirm_password}
                type="submit"
                aria-label={localize('com_auth_submit_registration')}
                className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-all duration-300 hover:bg-green-550 focus:bg-green-550 focus:outline-none"
              >
                {localize('com_auth_continue')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

export default ResetPassword;
