import { useForm } from 'react-hook-form';
import { useOutletContext } from 'react-router-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResetPasswordMutation } from 'librechat-data-provider/react-query';
import type { TResetPassword } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize } from '~/hooks';

function ResetPassword() {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TResetPassword>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const password = watch('password');
  const resetPassword = useResetPasswordMutation();
  const { setError, setHeaderText } = useOutletContext<TLoginLayoutContext>();

  const onSubmit = (data: TResetPassword) => {
    resetPassword.mutate(data, {
      onError: () => {
        setError('com_auth_error_invalid_reset_token');
      },
      onSuccess: () => {
        setHeaderText('com_auth_reset_password_success');
      },
    });
  };

  if (resetPassword.isSuccess) {
    return (
      <>
        <div
          className="relative mb-8 mt-4 rounded-2xl border border-green-400 bg-green-100 px-4 py-3 text-center text-green-700 dark:bg-gray-900 dark:text-white"
          role="alert"
        >
          {localize('com_auth_login_with_new_password')}
        </div>
        <button
          onClick={() => navigate('/login')}
          aria-label={localize('com_auth_sign_in')}
          className="w-full transform rounded-2xl bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
        >
          {localize('com_auth_continue')}
        </button>
      </>
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
            type="hidden"
            id="token"
            value={params.get('token') ?? ''}
            {...register('token', { required: 'Unable to process: No valid reset token' })}
          />
          <input
            type="hidden"
            id="userId"
            value={params.get('userId') ?? ''}
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
            className="
              webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light
              bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none
           "
            placeholder=" "
          />
          <label
            htmlFor="password"
            className="
              absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200
              peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100
              peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500
              rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4
          "
          >
            {localize('com_auth_password')}
          </label>
        </div>

        {errors.password && (
          <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
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
            {...register('confirm_password', {
              validate: (value) => value === password || localize('com_auth_password_not_match'),
            })}
            aria-invalid={!!errors.confirm_password}
            className="
            webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light
            bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none
            "
            placeholder=" "
          />
          <label
            htmlFor="confirm_password"
            className="
              absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200
              peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100
              peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500
              rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4
            "
          >
            {localize('com_auth_password_confirm')}
          </label>
        </div>
        {errors.confirm_password && (
          <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
            {errors.confirm_password.message}
          </span>
        )}
        {errors.token && (
          <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
            {errors.token.message}
          </span>
        )}
        {errors.userId && (
          <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
            {errors.userId.message}
          </span>
        )}
      </div>
      <div className="mt-6">
        <button
          disabled={!!errors.password || !!errors.confirm_password}
          type="submit"
          aria-label={localize('com_auth_submit_registration')}
          className="
            w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-medium text-white
            transition-colors hover:bg-green-700 focus:outline-none focus:ring-2
            focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50
            disabled:hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700
          "
        >
          {localize('com_auth_continue')}
        </button>
      </div>
    </form>
  );
}

export default ResetPassword;
