import React, { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginPage } from 'librechat-data-provider';
import { Turnstile } from '@marsidev/react-turnstile';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import {
  ThemeContext,
  SecretInput,
  Spinner,
  Button,
  Input,
  isDark,
  floatingLabel,
} from '@librechat/client';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import {
  useLocalize,
  TranslationKeys,
  getOrganizationErrorCode,
  useOrganizationErrorMessage,
} from '~/hooks';
import { useOrganizationInvitePreviewQuery } from '~/data-provider';
import { ErrorMessage } from './ErrorMessage';
import LegalConsent from './LegalConsent';

/** Organizations mode adds the name of the organization the account will create. */
type RegistrationForm = TRegisterUser & { organizationName?: string };

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<RegistrationForm>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';

  /* Organizations mode: an invite link joins its organization instead of creating one. */
  const organizationsEnabled = startupConfig?.organizations?.enabled === true;
  const organizationInvite = organizationsEnabled ? (queryParams.get('invite') ?? '') : '';
  const getOrganizationError = useOrganizationErrorMessage();
  const { data: invitePreview, error: invitePreviewError } =
    useOrganizationInvitePreviewQuery(organizationInvite);
  const lockedEmail = invitePreview?.email;
  useEffect(() => {
    if (lockedEmail) {
      setValue('email', lockedEmail, { shouldValidate: true });
    }
  }, [lockedEmail, setValue]);

  const getOrganizationFields = (
    organizationName?: string,
  ): Pick<TRegisterUser, 'organization' | 'organizationInvite'> => {
    if (organizationInvite) {
      return { organizationInvite };
    }
    if (organizationsEnabled) {
      return { organization: { name: organizationName ?? '' } };
    }
    return {};
  };

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setIsSubmitting(false);
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            navigate('/c/new', { replace: true });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if (getOrganizationErrorCode(error)) {
        setErrorMessage(getOrganizationError(error));
        return;
      }
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
    { readOnly = false }: { readOnly?: boolean } = {},
  ) => {
    const fieldLabel = localize(label);
    const field = register(
      id as 'name' | 'email' | 'username' | 'password' | 'confirm_password' | 'organizationName',
      validation,
    );

    return (
      <div className="mb-4">
        <div className="relative">
          {type === 'password' ? (
            <SecretInput
              colorTransition
              id={id}
              autoComplete={id}
              aria-label={fieldLabel}
              {...field}
              aria-invalid={!!errors[id]}
              variant="floating"
              placeholder=" "
              data-testid={id}
              label={fieldLabel}
            />
          ) : (
            <>
              <Input
                colorTransition
                id={id}
                type={type}
                autoComplete={id}
                aria-label={fieldLabel}
                {...field}
                readOnly={readOnly}
                aria-invalid={!!errors[id]}
                variant="floating"
                placeholder=" "
                data-testid={id}
              />
              <label htmlFor={id} className={floatingLabel}>
                {fieldLabel}
              </label>
            </>
          )}
        </div>
        {errors[id] && (
          <span role="alert" className="text-text-destructive mt-1 text-sm">
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
          className="border-status-success-border bg-status-success-subtle text-text-secondary rounded-md border px-3 py-2 text-sm"
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
            onSubmit={handleSubmit(({ organizationName, ...data }: RegistrationForm) =>
              registerUser.mutate({
                ...data,
                token: token ?? undefined,
                ...getOrganizationFields(organizationName),
              }),
            )}
          >
            {organizationInvite && invitePreview && (
              <p className="text-text-primary mb-4 text-center text-sm" data-testid="invite-join">
                {localize('com_auth_join_org', { 0: invitePreview.organization.name })}
              </p>
            )}
            {organizationInvite && invitePreviewError != null && (
              <ErrorMessage>{getOrganizationError(invitePreviewError)}</ErrorMessage>
            )}
            {organizationsEnabled &&
              !organizationInvite &&
              renderInput('organizationName', 'com_auth_org_name', 'text', {
                required: localize('com_auth_org_name_required'),
                validate: (value: string) => {
                  const length = value.trim().length;
                  return (length >= 2 && length <= 80) || localize('com_auth_org_name_length');
                },
              })}
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
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 2,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_username_max_length'),
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
              { readOnly: !!lockedEmail },
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
                shape="soft"
                size="auth"
                className="w-full"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>

            {/* Under the button it is agreed to, and read before the account is
                created; the auth layout drops its footer bar in exchange. */}
            <LegalConsent startupConfig={startupConfig} />
          </form>

          <p className="text-text-secondary my-4 text-center text-sm font-light">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={loginPage()}
              aria-label="Login"
              className="text-accent-primary hover:text-accent-primary-hover inline-flex p-1 text-sm font-medium transition-colors"
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
