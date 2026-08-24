import React, { useState, useEffect, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import type { TLoginUser, TStartupConfig } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import { useResendVerificationEmail, useGetStartupConfig } from '~/data-provider';
import { validateEmail } from '~/utils';
import { useLocalize } from '~/hooks';

type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
  startupConfig: TStartupConfig;
  error: Pick<TAuthContext, 'error'>['error'];
  setError: Pick<TAuthContext, 'setError'>['setError'];
};

/** BKL: AD 계정만 입력하면 사내 도메인을 자동으로 붙인다 (guest14 → guest14@bkl.co.kr) */
const BKL_EMAIL_DOMAIN = 'bkl.co.kr';

const normalizeBklEmail = (value: string): string => {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.includes('@')) {
    return trimmed;
  }
  return `${trimmed}@${BKL_EMAIL_DOMAIN}`;
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
  const bklMaintenance = startupConfig.bklMaintenance;
  const isBklMaintenance = bklMaintenance?.enabled === true;
  const bklMaintenanceUntil = bklMaintenance?.until;
  const bklMaintenanceMessage =
    bklMaintenance?.message ||
    (bklMaintenanceUntil
      ? `서버 점검 중입니다. ${bklMaintenanceUntil} 이후 이용 가능합니다.`
      : '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.');

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
      <span role="alert" className="mt-1 text-sm text-red-600 dark:text-red-500">
        {String(errorMessage)}
      </span>
    ) : null;
  };

  const handleResendEmail = () => {
    const email = normalizeBklEmail(getValues('email'));
    if (!email) {
      return setShowResendLink(false);
    }
    resendLinkMutation.mutate({ email });
  };

  return (
    <>
      {showResendLink && (
        <div className="mt-2 rounded-md border border-gray-400 bg-gray-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200">
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
      <form
        className="mt-6"
        aria-label="Login form"
        method="POST"
        onSubmit={handleSubmit((data) => onSubmit({ ...data, email: normalizeBklEmail(data.email) }))}
      >
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              id="email"
              autoComplete={useUsernameLogin ? 'username' : 'email'}
              aria-label="아이디"
              disabled={isBklMaintenance}
              {...register('email', {
                required: localize('com_auth_email_required'),
                maxLength: { value: 120, message: localize('com_auth_email_max_length') },
                validate: useUsernameLogin
                  ? undefined
                  : // BKL: AD 계정(도메인 생략)도 허용 — 정규화 후 이메일 형식 검증
                    (value) => validateEmail(normalizeBklEmail(value), localize('com_auth_email_pattern')),
              })}
              aria-invalid={!!errors.email}
              className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-gray-700 focus:outline-none dark:focus:border-gray-300"
              placeholder=" "
            />
            {/* peer-autofill: 크롬 자동완성 미리보기 상태에선 :placeholder-shown 이
                유지돼 라벨이 입력값 위를 가림 — autofill 시에도 라벨을 위로 띄운다 */}
            <label
              htmlFor="email"
              className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-autofill:top-1.5 peer-autofill:-translate-y-4 peer-autofill:scale-75 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-gray-700 dark:peer-focus:text-gray-300 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
            >
              {/* BKL: AD 계정 로그인 — "이메일 주소" 대신 "아이디" */}
              아이디
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
              disabled={isBklMaintenance}
              {...register('password', {
                required: localize('com_auth_password_required'),
                minLength: {
                  value: startupConfig?.minPasswordLength || 8,
                  message: localize('com_auth_password_min_length'),
                },
                maxLength: { value: 128, message: localize('com_auth_password_max_length') },
              })}
              aria-invalid={!!errors.password}
              className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-gray-700 focus:outline-none dark:focus:border-gray-300"
              placeholder=" "
            />
            <label
              htmlFor="password"
              className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-autofill:top-1.5 peer-autofill:-translate-y-4 peer-autofill:scale-75 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-gray-700 dark:peer-focus:text-gray-300 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
            >
              {localize('com_auth_password')}
            </label>
          </div>
          {renderError('password')}
        </div>
        {startupConfig.passwordResetEnabled && (
          <a
            href="/forgot-password"
            className="inline-flex p-1 text-sm font-medium text-gray-700 underline decoration-transparent transition-all duration-200 hover:text-black hover:decoration-black focus:text-black focus:decoration-black dark:text-gray-300 dark:hover:text-white dark:hover:decoration-white dark:focus:text-white dark:focus:decoration-white"
          >
            {localize('com_auth_password_forgot')}
          </a>
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

        <div className="mt-6">
          <Button
            aria-label={localize('com_auth_continue')}
            data-testid="login-button"
            type="submit"
            disabled={isBklMaintenance || (requireCaptcha && !turnstileToken) || isSubmitting}
            variant="submit"
            className="h-12 w-full rounded-2xl bg-gray-900 text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
          </Button>
        </div>
        {isBklMaintenance && (
          <div className="mt-4 rounded-xl border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-300">
            {bklMaintenanceMessage}
          </div>
        )}
      </form>
    </>
  );
};

export default LoginForm;
