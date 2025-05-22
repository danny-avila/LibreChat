import React from 'react';
import { useForm } from 'react-hook-form';
import { OpenIDIcon } from '~/components';

interface MultiTenantOpenIDProps {
    serverDomain: string;
    openidLabel: string;
    openidImageUrl: string;
    localize: (key: string) => string;
}

/**
 * When multi‑tenant mode is enabled (startupConfig.emailLoginEnabled === true),
 * we render a form for the user to enter their email. When submitted, we perform a GET
 * request (via redirect) to /oauth/openid with the email as a query parameter.
 * If, for some reason, no email is provided, we simply redirect to /oauth/openid.
 */
function MultiTenantOpenID({
  serverDomain,
  openidLabel,
  openidImageUrl,
  localize,
}: MultiTenantOpenIDProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>();

  const onSubmit = (data: { email: string }) => {
    // If an email is provided, include it as a query parameter.
    // Otherwise, simply redirect without an email.
    const emailQuery =
            data.email && data.email.trim() !== ''
              ? `?email=${encodeURIComponent(data.email)}`
              : '';
    window.location.href = `${serverDomain}/oauth/openid${emailQuery}`;
  };

  const renderError = (fieldName: string) => {
    const errorMessage = errors[fieldName]?.message;
    return errorMessage ? (
      <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
        {String(errorMessage)}
      </span>
    ) : null;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2">
      <div className="mb-4">
        <div className="relative">
          <input
            type="email"
            id="email"
            autoComplete="email"
            aria-label={localize('com_auth_email')}
            {...register('email', {
              required: localize('com_auth_email_required'),
              maxLength: { value: 120, message: localize('com_auth_email_max_length') },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            aria-invalid={!!errors.email}
            className="
              webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light
              bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none
            "
            placeholder=" "
          />
          <label
            htmlFor="email"
            className="
              absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200
              peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100
              peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500
              rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4
            "
          >
            {localize('com_auth_email_address')}
          </label>
        </div>
        {renderError('email')}
      </div>

      <button
        type="submit"
        className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
        data-testid="openid"
      >
        {openidImageUrl ? (
          <img src={openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
        ) : (
          <OpenIDIcon />
        )}
        <p>{openidLabel}</p>
      </button>
    </form>
  );
}

export default MultiTenantOpenID;