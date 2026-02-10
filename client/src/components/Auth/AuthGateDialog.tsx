import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { OGDialog, OGDialogContent, OGDialogTitle, Spinner, Button } from '@librechat/client';
import { useRecoilState } from 'recoil';
import type { TLoginUser, TRegisterUser, TError } from 'librechat-data-provider';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { getLoginError, validateEmail } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

type Tab = 'login' | 'register';

export default function AuthGateDialog() {
  const [open, setOpen] = useRecoilState(store.authGateOpen);
  const [tab, setTab] = useState<Tab>('login');
  const localize = useLocalize();
  const { login, error, setError, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  // Auto-close when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && open) {
      setOpen(false);
      setError(undefined);
    }
  }, [isAuthenticated, open, setOpen, setError]);

  const handleClose = () => {
    setOpen(false);
    setError(undefined);
  };

  return (
    <OGDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <OGDialogContent
        className="w-11/12 max-w-md overflow-hidden rounded-2xl border border-border-light bg-surface-primary p-0 shadow-xl sm:w-96"
        style={{ borderRadius: '1rem' }}
      >
        <OGDialogTitle className="sr-only">
          {tab === 'login' ? 'Sign In' : 'Create Account'}
        </OGDialogTitle>

        {/* Tab switcher */}
        <div className="flex border-b border-border-light">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(undefined); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'login'
                ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(undefined); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'register'
                ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {localize(getLoginError(error))}
            </div>
          )}

          {tab === 'login' ? (
            <LoginTab
              onSubmit={login}
              startupConfig={startupConfig}
            />
          ) : (
            <RegisterTab
              startupConfig={startupConfig}
              onSuccess={handleClose}
            />
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function LoginTab({
  onSubmit,
  startupConfig,
}: {
  onSubmit: (data: TLoginUser) => void;
  startupConfig: ReturnType<typeof useGetStartupConfig>['data'];
}) {
  const localize = useLocalize();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TLoginUser>();

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data))}>
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            id="gate-email"
            autoComplete="email"
            aria-label={localize('com_auth_email')}
            {...register('email', {
              required: localize('com_auth_email_required'),
              maxLength: { value: 120, message: localize('com_auth_email_max_length') },
              validate: (value) => validateEmail(value, localize('com_auth_email_pattern')),
            })}
            aria-invalid={!!errors.email}
            className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
            placeholder=" "
          />
          <label
            htmlFor="gate-email"
            className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
          >
            {localize('com_auth_email_address')}
          </label>
        </div>
        {errors.email && (
          <span className="mt-1 text-sm text-red-600 dark:text-red-500">
            {String(errors.email.message)}
          </span>
        )}
      </div>

      <div className="mb-4">
        <div className="relative">
          <input
            type="password"
            id="gate-password"
            autoComplete="current-password"
            aria-label={localize('com_auth_password')}
            {...register('password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: { value: 128, message: localize('com_auth_password_max_length') },
            })}
            aria-invalid={!!errors.password}
            className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
            placeholder=" "
          />
          <label
            htmlFor="gate-password"
            className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
          >
            {localize('com_auth_password')}
          </label>
        </div>
        {errors.password && (
          <span className="mt-1 text-sm text-red-600 dark:text-red-500">
            {String(errors.password.message)}
          </span>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        variant="submit"
        className="h-12 w-full rounded-2xl"
      >
        {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
      </Button>
    </form>
  );
}

function RegisterTab({
  startupConfig,
  onSuccess,
}: {
  startupConfig: ReturnType<typeof useGetStartupConfig>['data'];
  onSuccess: () => void;
}) {
  const localize = useLocalize();
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const registerUser = useRegisterUserMutation({
    onMutate: () => setIsSubmitting(true),
    onSuccess: () => {
      setIsSubmitting(false);
      onSuccess();
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
    },
  });

  const renderInput = (
    id: string,
    label: string,
    type: string,
    autoComplete: string,
    validation: object,
  ) => (
    <div className="mb-4">
      <div className="relative">
        <input
          id={`gate-${id}`}
          type={type}
          autoComplete={autoComplete}
          aria-label={label}
          {...register(
            id as 'name' | 'email' | 'username' | 'password' | 'confirm_password',
            validation,
          )}
          aria-invalid={!!errors[id]}
          className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
          placeholder=" "
        />
        <label
          htmlFor={`gate-${id}`}
          className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
        >
          {label}
        </label>
      </div>
      {errors[id] && (
        <span className="mt-1 text-sm text-red-500">{String(errors[id]?.message)}</span>
      )}
    </div>
  );

  return (
    <>
      {errorMessage && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </div>
      )}
      <form
        onSubmit={handleSubmit((data: TRegisterUser) => registerUser.mutate(data))}
      >
        {renderInput('name', localize('com_auth_full_name'), 'text', 'name', {
          required: localize('com_auth_name_required'),
          minLength: { value: 3, message: localize('com_auth_name_min_length') },
          maxLength: { value: 80, message: localize('com_auth_name_max_length') },
        })}
        {renderInput('email', localize('com_auth_email'), 'email', 'email', {
          required: localize('com_auth_email_required'),
          maxLength: { value: 120, message: localize('com_auth_email_max_length') },
          pattern: { value: /\S+@\S+\.\S+/, message: localize('com_auth_email_pattern') },
        })}
        {renderInput(
          'password',
          localize('com_auth_password'),
          'password',
          'new-password',
          {
            required: localize('com_auth_password_required'),
            minLength: {
              value: startupConfig?.minPasswordLength || 8,
              message: localize('com_auth_password_min_length'),
            },
            maxLength: { value: 128, message: localize('com_auth_password_max_length') },
          },
        )}
        {renderInput(
          'confirm_password',
          localize('com_auth_password_confirm'),
          'password',
          'new-password',
          {
            validate: (value: string) =>
              value === password || localize('com_auth_password_not_match'),
          },
        )}

        <Button
          type="submit"
          disabled={Object.keys(errors).length > 0 || isSubmitting}
          variant="submit"
          className="h-12 w-full rounded-2xl"
        >
          {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
        </Button>
      </form>
    </>
  );
}
