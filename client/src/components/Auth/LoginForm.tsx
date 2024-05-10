import React from 'react';
import { useForm } from 'react-hook-form';
import { useLocalize } from '~/hooks';
import { TLoginUser } from 'librechat-data-provider';

type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
};

const LoginForm: React.FC<TLoginFormProps> = ({ onSubmit }) => {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TLoginUser>();

  const renderError = (fieldName: string) => {
    const errorMessage = errors[fieldName]?.message;
    return errorMessage ? (
      <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
        {String(errorMessage)}
      </span>
    ) : null;
  };

  return (
    <form
      className="mt-6"
      aria-label="Login form"
      method="POST"
      onSubmit={handleSubmit((data) => onSubmit(data))}
    >
      <div className="mb-2">
        <div className="relative">
          <input
            type="text"
            id="email"
            autoComplete="email"
            aria-label={localize('com_auth_email')}
            {...register('email', {
              required: localize('com_auth_email_required'),
              maxLength: { value: 120, message: localize('com_auth_email_max_length') },
              pattern: { value: /\S+@\S+\.\S+/, message: localize('com_auth_email_pattern') },
            })}
            aria-invalid={!!errors.email}
            className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-gray-300 bg-transparent px-3.5 pb-3.5 pt-4 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-600 dark:text-white dark:focus:border-green-500"
            placeholder=" "
          />
          <label
            htmlFor="email"
            className="absolute start-1 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-3 text-sm text-gray-500 duration-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-3 peer-focus:text-green-600 dark:bg-gray-900 dark:text-gray-400 peer-focus:dark:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
          >
            {localize('com_auth_email_address')}
          </label>
        </div>
        {renderError('email')}
      </div>
      <div className="mb-2">
        <div className="relative">
          <input
            type="password"
            id="password"
            autoComplete="current-password"
            aria-label={localize('com_auth_password')}
            {...register('password', {
              required: localize('com_auth_password_required'),
              minLength: { value: 8, message: localize('com_auth_password_min_length') },
              maxLength: { value: 128, message: localize('com_auth_password_max_length') },
            })}
            aria-invalid={!!errors.password}
            className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-gray-300 bg-transparent px-3.5 pb-3.5 pt-4 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-600 dark:text-white dark:focus:border-green-500"
            placeholder=" "
          />
          <label
            htmlFor="password"
            className="absolute start-1 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-3 text-sm text-gray-500 duration-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-3 peer-focus:text-green-600 dark:bg-gray-900 dark:text-gray-400 peer-focus:dark:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
          >
            {localize('com_auth_password')}
          </label>
        </div>
        {renderError('password')}
      </div>
      <a href="/forgot-password" className="text-sm text-green-500">
        {localize('com_auth_password_forgot')}
      </a>
      <div className="mt-6">
        <button
          aria-label="Sign in"
          data-testid="login-button"
          type="submit"
          className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
        >
          {localize('com_auth_continue')}
        </button>
      </div>
    </form>
  );
};

export default LoginForm;
