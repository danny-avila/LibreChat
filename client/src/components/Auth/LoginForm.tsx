import React, { useState, useEffect, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import type { TLoginUser, TStartupConfig } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import { useResendVerificationEmail, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
  startupConfig: TStartupConfig;
  error: Pick<TAuthContext, 'error'>['error'];
  setError: Pick<TAuthContext, 'setError'>['setError'];
};

const LoginForm: React.FC<TLoginFormProps> = ({ onSubmit, startupConfig, error, setError }) => {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TLoginUser>();
  const [showResendLink, setShowResendLink] = useState<boolean>(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const { data: config } = useGetStartupConfig();
  const useUsernameLogin = config?.ldap?.username;
  const validTheme = isDark(theme) ? 'dark' : 'light';
  const requireCaptcha = Boolean(startupConfig.turnstile?.siteKey);

  useEffect(() => {
    if (error && error.includes('422') && !showResendLink) {
      setShowResendLink(true);
    }
  }, [error, showResendLink]);

  const resendLinkMutation = useResendVerificationEmail({
    onMutate: () => {
      setError(undefined);
      setShowResendLink(false);
    },
  });

  if (!startupConfig) {
    return null;
  }

  const renderError = (fieldName: string) => {
    const errorMessage = errors[fieldName]?.message;
    return errorMessage ? (
      <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
        {String(errorMessage)}
      </span>
    ) : null;
  };

  const handleResendEmail = () => {
    const email = getValues('email');
    if (!email) {
      return setShowResendLink(false);
    }
    resendLinkMutation.mutate({ email });
  };

  return (
    <>
      {showResendLink && (
        <div className="mt-2 rounded-md border border-brand-blue-500 bg-brand-blue-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200">
          {localize('com_auth_email_verification_resend_prompt')}
          <button
            type="button"
            className="ml-2 text-blue-600 hover:underline"
            onClick={handleResendEmail}
            disabled={resendLinkMutation.isLoading}
          >
            {localize('com_auth_email_resend_link')}
          </button>
        </div>
      )}
      <form aria-label="Login form" method="POST" onSubmit={handleSubmit((data) => onSubmit(data))}>
        <div className="flex flex-col gap-2.5">
          <div>
            <label
              htmlFor="email"
              className="block rounded-[12px] border border-[rgba(11,47,91,0.16)] bg-white px-3.5 pb-2.5 pt-2 transition-colors focus-within:border-ink-800 dark:border-white/[0.14] dark:bg-dm-surface dark:focus-within:border-signal-amber"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-cc-slate-500 dark:text-dm-text-mute">
                {useUsernameLogin
                  ? localize('com_auth_username').replace(/ \(.*$/, '')
                  : localize('com_auth_email_address')}
              </span>
              <input
                type="text"
                id="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete={useUsernameLogin ? 'username' : 'email'}
                aria-label={localize('com_auth_email')}
                {...register('email', {
                  required: localize('com_auth_email_required'),
                  maxLength: { value: 120, message: localize('com_auth_email_max_length') },
                  pattern: {
                    value: useUsernameLogin ? /\S+/ : /\S+@\S+\.\S+/,
                    message: localize('com_auth_email_pattern'),
                  },
                })}
                aria-invalid={!!errors.email}
                placeholder={useUsernameLogin ? '' : 'you@company.com'}
                className="webkit-dark-styles mt-0.5 w-full border-0 bg-transparent p-0 text-[16px] text-ink-900 placeholder:text-cc-slate-400 focus:outline-none focus:ring-0 dark:text-dm-text dark:placeholder:text-dm-text-faint"
              />
            </label>
            {renderError('email')}
          </div>
          <div>
            <label
              htmlFor="password"
              className="block rounded-[12px] border border-[rgba(11,47,91,0.16)] bg-white px-3.5 pb-2.5 pt-2 transition-colors focus-within:border-ink-800 dark:border-white/[0.14] dark:bg-dm-surface dark:focus-within:border-signal-amber"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-cc-slate-500 dark:text-dm-text-mute">
                {localize('com_auth_password')}
              </span>
              <input
                type="password"
                id="password"
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
                className="webkit-dark-styles mt-0.5 w-full border-0 bg-transparent p-0 font-mono text-[16px] tracking-[0.2em] text-ink-900 focus:outline-none focus:ring-0 dark:text-dm-text"
              />
            </label>
            {renderError('password')}
          </div>
        </div>
        {startupConfig.passwordResetEnabled && (
          <div className="mt-2 flex justify-end">
            <a
              href="/forgot-password"
              className="text-[12px] font-semibold text-ink-800 transition-colors hover:underline dark:text-signal-amber"
            >
              {localize('com_auth_password_forgot')}
            </a>
          </div>
        )}

        {requireCaptcha && (
          <div className="my-4 flex justify-center">
            <Turnstile
              siteKey={startupConfig.turnstile!.siteKey}
              options={{
                ...startupConfig.turnstile!.options,
                theme: validTheme,
              }}
              onSuccess={setTurnstileToken}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />
          </div>
        )}

        <div className="mt-5">
          <Button
            aria-label={localize('com_auth_continue')}
            data-testid="login-button"
            type="submit"
            disabled={(requireCaptcha && !turnstileToken) || isSubmitting}
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] border-0 bg-ink-800 text-[15px] font-bold text-white shadow-[0_4px_12px_-2px_rgba(11,47,91,0.45)] transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-signal-amber dark:text-ink-900 dark:shadow-[0_4px_12px_-2px_rgba(242,182,68,0.45)] dark:hover:bg-[#F5C566]"
          >
            {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
          </Button>
        </div>
      </form>
    </>
  );
};

export default LoginForm;
