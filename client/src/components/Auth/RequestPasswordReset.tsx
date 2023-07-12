import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import {
  useRequestPasswordResetMutation,
  TRequestPasswordReset,
  TRequestPasswordResetResponse
} from '@librechat/data-provider';

function RequestPasswordReset() {
  const lang = useRecoilValue(store.lang);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<TRequestPasswordReset>();
  const requestPasswordReset = useRequestPasswordResetMutation();
  const [success, setSuccess] = useState<boolean>(false);
  const [requestError, setRequestError] = useState<boolean>(false);
  const [resetLink, setResetLink] = useState<string>('');

  const onSubmit = (data: TRequestPasswordReset) => {
    requestPasswordReset.mutate(data, {
      onSuccess: (data: TRequestPasswordResetResponse) => {
        setSuccess(true);
        setResetLink(data.link);
      },
      onError: () => {
        setRequestError(true);
        setTimeout(() => {
          setRequestError(false);
        }, 5000);
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">{localize(lang, 'com_auth_reset_password')}</h1>
        {success && (
          <div
            className="relative mt-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700"
            role="alert"
          >
            {localize(lang, 'com_auth_click')}{' '}
            <a className="text-green-600 hover:underline" href={resetLink}>
              {localize(lang, 'com_auth_here')}
            </a>{' '}
            {localize(lang, 'com_auth_to_reset_your_password')}
            {/* An email has been sent with instructions on how to reset your password. */}
          </div>
        )}
        {requestError && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            {localize(lang, 'com_auth_error_reset_password')}
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
                type="email"
                id="email"
                autoComplete="off"
                aria-label={localize(lang, 'com_auth_email')}
                {...register('email', {
                  required: localize(lang, 'com_auth_email_required'),
                  minLength: {
                    value: 3,
                    message: localize(lang, 'com_auth_email_min_length')
                  },
                  maxLength: {
                    value: 120,
                    message: localize(lang, 'com_auth_email_max_length')
                  },
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: localize(lang, 'com_auth_email_pattern')
                  }
                })}
                aria-invalid={!!errors.email}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="email"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                {localize(lang, 'com_auth_email_address')}
              </label>
            </div>
            {errors.email && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore not sure why */}
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="mt-6">
            <button
              type="submit"
              disabled={!!errors.email}
              className="w-full rounded-sm border border-transparent bg-green-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-600 focus:outline-none active:bg-green-500"
            >
              {localize(lang, 'com_auth_continue')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RequestPasswordReset;
