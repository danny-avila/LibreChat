import { useForm } from 'react-hook-form';
import posthog from 'posthog-js';
import React, { useContext, useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import type { TRegisterUser, TRegisterUserResponse, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { markAuthSeen } from '~/utils/firstVisitFlag';
import { useLocalize, TranslationKeys } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();

  // Flip the first-visit flag so subsequent cold starts go straight to /login.
  useEffect(() => {
    markAuthSeen();
  }, []);
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: (data: TRegisterUserResponse) => {
      setIsSubmitting(false);

      // Identify before capturing sign_up so the event lands on the user's
      // distinct_id (which then matches RC's appUserID set in useRevenueCatInit).
      if (data.user?.id) {
        posthog.identify(data.user.id, {
          email: data.user.email,
          username: data.user.username,
        });
      }
      posthog.capture('sign_up', {
        method: 'email',
        email_verification_required: !data.token,
      });

      if (data.token && data.user) {
        sessionStorage.setItem(
          'registrationAuth',
          JSON.stringify({ token: data.token, user: data.user }),
        );
        navigate('/c/new', { replace: true });
        return;
      }

      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            navigate('/login', { replace: true });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
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
    label: TranslationKeys,
    type: string,
    validation: object,
    placeholder = '',
  ) => {
    const isEmail = id === 'email';
    const isPassword = type === 'password';
    return (
      <div>
        <label
          htmlFor={id}
          className="block rounded-[12px] border border-[rgba(11,47,91,0.16)] bg-white px-3.5 pb-2.5 pt-2 transition-colors focus-within:border-ink-800 dark:border-white/[0.14] dark:bg-dm-surface dark:focus-within:border-signal-amber"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-cc-slate-500 dark:text-dm-text-mute">
            {localize(label)}
          </span>
          <input
            id={id}
            type={type}
            autoCapitalize={isEmail ? 'none' : undefined}
            autoCorrect={isEmail ? 'off' : undefined}
            spellCheck={isEmail ? false : undefined}
            autoComplete={id}
            aria-label={localize(label)}
            {...register(
              id as 'name' | 'email' | 'username' | 'password' | 'confirm_password',
              validation,
            )}
            aria-invalid={!!errors[id]}
            placeholder={placeholder}
            data-testid={id}
            className={`webkit-dark-styles mt-0.5 w-full border-0 bg-transparent p-0 text-[16px] text-ink-900 placeholder:text-cc-slate-400 focus:outline-none focus:ring-0 dark:text-dm-text dark:placeholder:text-dm-text-faint ${
              isPassword ? 'font-mono tracking-[0.2em]' : ''
            }`}
          />
        </label>
        {errors[id] && (
          <span role="alert" className="mt-1 text-sm text-red-500">
            {String(errors[id]?.message) ?? ''}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-brand-blue-500 bg-brand-blue-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {!startupConfigError && !isFetching && (
        <>
          <form
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) =>
              registerUser.mutate({ ...data, token: token ?? undefined }),
            )}
          >
            <div className="flex flex-col gap-2.5">
              {renderInput('name', 'com_auth_full_name', 'text', {
                required: localize('com_auth_name_required'),
                minLength: {
                  value: 3,
                  message: localize('com_auth_name_min_length'),
                },
                maxLength: {
                  value: 80,
                  message: localize('com_auth_name_max_length'),
                },
              })}
              {renderInput(
                'email',
                'com_auth_email',
                'email',
                {
                  required: localize('com_auth_email_required'),
                  minLength: {
                    value: 1,
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
                },
                'you@company.com',
              )}
              {renderInput('password', 'com_auth_password', 'password', {
                required: localize('com_auth_password_required'),
                minLength: {
                  value: startupConfig?.minPasswordLength || 8,
                  message: localize('com_auth_password_min_length'),
                },
                maxLength: {
                  value: 128,
                  message: localize('com_auth_password_max_length'),
                },
              })}
              {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
                validate: (value: string) =>
                  value === password || localize('com_auth_password_not_match'),
              })}
            </div>

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-5">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] border-0 bg-ink-800 text-[15px] font-bold text-white shadow-[0_4px_12px_-2px_rgba(11,47,91,0.45)] transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-signal-amber dark:text-ink-900 dark:shadow-[0_4px_12px_-2px_rgba(242,182,68,0.45)] dark:hover:bg-[#F5C566]"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>
        </>
      )}
    </>
  );
};

export default Registration;
