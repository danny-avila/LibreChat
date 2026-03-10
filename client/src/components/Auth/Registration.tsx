import { useForm, Controller } from 'react-hook-form';
import React, { useContext, useState, useRef } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import { loginPage } from 'librechat-data-provider';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize, TranslationKeys } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const {
    watch,
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [deptInput, setDeptInput] = useState('');
  const [isDeptFocused, setIsDeptFocused] = useState(false);
  const deptInputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const registerUser = useRegisterUserMutation({
    onMutate: () => setIsSubmitting(true),
    onSuccess: () => {
      setIsSubmitting(false);
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/c/new', { replace: true });
            return 0;
          }
          return prev - 1;
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

  const renderFieldWrapper = (
    content: React.ReactNode,
    errorMsg?: string,
    hint?: string,
  ) => (
    <div className="mb-4">
      <div className="relative">{content}</div>
      {errorMsg && (
        <span role="alert" className="mt-1 text-sm text-red-500">
          {errorMsg}
        </span>
      )}
      {hint && <p className="mt-1 text-xs text-text-secondary-alt">{hint}</p>}
    </div>
  );

  const renderInput = (id: string, label: TranslationKeys, type: string, validation: object) =>
    renderFieldWrapper(
      <>
        <input
          id={id}
          type={type}
          autoComplete={id}
          aria-label={localize(label)}
          {...register(
            id as 'name' | 'email' | 'username' | 'password' | 'confirm_password',
            validation,
          )}
          aria-invalid={!!errors[id]}
          className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
          placeholder=" "
          data-testid={id}
        />
        <label
          htmlFor={id}
          className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
        >
          {localize(label)}
        </label>
      </>,
      errors[id] ? String(errors[id]?.message) : undefined,
    );

  const renderDepartmentsInput = () =>
    renderFieldWrapper(
      <Controller
        name="departments"
        control={control}
        defaultValue={[]}
        render={({ field }) => {
          const tags: string[] = field.value ?? [];
          const isFloated = tags.length > 0 || deptInput.length > 0 || isDeptFocused;

          const commitPending = () => {
            const trimmed = deptInput.trim();
            if (trimmed && !tags.includes(trimmed)) {
              field.onChange([...tags, trimmed]);
            }
            setDeptInput('');
          };

          return (
            <div
              className="min-h-[48px] w-full cursor-text rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2 pt-3 focus-within:border-green-500"
              onClick={() => deptInputRef.current?.focus()}
            >
              <label
                className={`pointer-events-none absolute start-3 z-10 origin-[0] transform bg-surface-primary px-2 text-sm duration-200 ${
                  isFloated
                    ? 'top-1.5 -translate-y-4 scale-75 text-green-500'
                    : 'top-1/2 -translate-y-1/2 scale-100 text-text-secondary-alt'
                }`}
              >
                {localize('com_auth_departments')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {tags.map((dept, index) => (
                  <span
                    key={index}
                    className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-sm text-green-700 dark:text-green-300"
                  >
                    {dept}
                    <button
                      type="button"
                      aria-label={`Remove ${dept}`}
                      className="ml-0.5 leading-none hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        field.onChange(tags.filter((_, i) => i !== index));
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  ref={deptInputRef}
                  type="text"
                  className="min-w-[140px] flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                  value={deptInput}
                  onChange={(e) => setDeptInput(e.target.value.toUpperCase())}
                  onFocus={() => setIsDeptFocused(true)}
                  onBlur={() => {
                    setIsDeptFocused(false);
                    commitPending();
                  }}
                  onKeyDown={(e) => {
                    const trimmed = deptInput.trim();
                    if ((e.key === 'Enter' || e.key === ',') && trimmed) {
                      e.preventDefault();
                      if (!tags.includes(trimmed)) {
                        field.onChange([...tags, trimmed]);
                      }
                      setDeptInput('');
                    }
                    if (e.key === 'Backspace' && !deptInput && tags.length > 0) {
                      field.onChange(tags.slice(0, -1));
                    }
                  }}
                />
              </div>
            </div>
          );
        }}
      />,
      undefined,
      localize('com_auth_departments_hint'),
    );

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
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
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) =>
              registerUser.mutate({ ...data, token: token ?? undefined }),
            )}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: { value: 3, message: localize('com_auth_name_min_length') },
              maxLength: { value: 80, message: localize('com_auth_name_max_length') },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: { value: 2, message: localize('com_auth_username_min_length') },
              maxLength: { value: 80, message: localize('com_auth_username_max_length') },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: { value: 1, message: localize('com_auth_email_min_length') },
              maxLength: { value: 120, message: localize('com_auth_email_max_length') },
              pattern: { value: /\S+@\S+\.\S+/, message: localize('com_auth_email_pattern') },
            })}
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: { value: 128, message: localize('com_auth_password_max_length') },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {renderDepartmentsInput()}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{ ...startupConfig.turnstile.options, theme: validTheme }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className="h-12 w-full rounded-2xl"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={loginPage()}
              aria-label="Login"
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_auth_login')}
            </a>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;