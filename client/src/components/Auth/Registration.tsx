import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useRegisterUserMutation, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TRegisterUser } from 'librechat-data-provider';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useLocalize } from '~/hooks';
import SocialButton from './SocialButton';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();

  const [logoSrc, setLogoSrc] = useState('');
  const [altText, setAltText] = useState('');

  const localize = useLocalize();

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });

  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const registerUser = useRegisterUserMutation();
  const password = watch('password');

  const onRegisterUserFormSubmit = async (data: TRegisterUser) => {
    try {
      await registerUser.mutateAsync(data);
      navigate('/c/new');
    } catch (error) {
      setError(true);
      //@ts-ignore - error is of type unknown
      if (error.response?.data?.message) {
        //@ts-ignore - error is of type unknown
        setErrorMessage(error.response?.data?.message);
      }
    }
  };

  useEffect(() => {
    const host = window.location.hostname;
    let logoPath = '';
    let alt = '';

    switch (host) {
      case 'gptglobal.io':
        logoPath = '/assets/logo-global.png';
        alt = 'GPT Global Logo';
        break;
      case 'gptchina.io':
        logoPath = '/assets/logo-china.png';
        alt = 'GPT China';
        break;
      case 'gptusa.io':
        logoPath = '/assets/logo-usa.png';
        alt = 'GPT USA';
        break;
      case 'gptrussia.io':
        logoPath = '/assets/logo-russia.png';
        alt = 'GPT Russia';
        break;
      default:
        logoPath = '/assets/logo-china.png';
        alt = 'GPT Global';
    }

    setLogoSrc(logoPath);
    setAltText(alt);
  }, []);

  useEffect(() => {
    if (startupConfig?.registrationEnabled === false) {
      navigate('/login');
    }
  }, [startupConfig, navigate]);

  if (!startupConfig) {
    return null;
  }

  const socialLogins = startupConfig.socialLogins ?? [];

  const renderInput = (id: string, label: string, type: string, validation: object) => (
    <div className="mb-2">
      <div className="relative">
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
          className="peer block w-full appearance-none rounded-md border border-gray-300 bg-white px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
          placeholder=" "
          data-testid={id}
        ></input>
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
        >
          {localize(label)}
        </label>
      </div>
      {errors[id] && (
        <span role="alert" className="mt-1 text-sm text-black">
          {String(errors[id]?.message) ?? ''}
        </span>
      )}
    </div>
  );

  const providerComponents = {
    discord: (
      <SocialButton
        key="discord"
        enabled={startupConfig.discordLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="discord"
        Icon={DiscordIcon}
        label={localize('com_auth_discord_login')}
        id="discord"
      />
    ),
    facebook: (
      <SocialButton
        key="facebook"
        enabled={startupConfig.facebookLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="facebook"
        Icon={FacebookIcon}
        label={localize('com_auth_facebook_login')}
        id="facebook"
      />
    ),
    github: (
      <SocialButton
        key="github"
        enabled={startupConfig.githubLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="github"
        Icon={GithubIcon}
        label={localize('com_auth_github_login')}
        id="github"
      />
    ),
    google: (
      <SocialButton
        key="google"
        enabled={startupConfig.googleLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="google"
        Icon={GoogleIcon}
        label={localize('com_auth_google_login')}
        id="google"
      />
    ),
    openid: (
      <SocialButton
        key="openid"
        enabled={startupConfig.openidLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="openid"
        Icon={() =>
          startupConfig.openidImageUrl ? (
            <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
          ) : (
            <OpenIDIcon />
          )
        }
        label={startupConfig.openidLabel}
        id="openid"
      />
    ),
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <img src={logoSrc} alt={altText} className="mx-auto mb-6 h-16 w-auto" />
        <h1 className="text-center text-3xl font-extrabold text-gray-900">
          {localize('com_auth_create_account')}
        </h1>
        {error && (
          <div
            className="relative mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
            data-testid="registration-error"
          >
            {localize('com_auth_error_create')} {errorMessage}
          </div>
        )}
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <form
            className="space-y-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit(onRegisterUserFormSubmit)}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 1,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_username_max_length'),
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 3,
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
            })}
            {renderInput('password', 'com_auth_password', 'password', {
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
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value) => value === password || localize('com_auth_password_not_match'),
            })}
            <div>
              <button
                disabled={Object.keys(errors).length > 0}
                type="submit"
                className="flex w-full justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {localize('com_auth_continue')}
              </button>
            </div>
          </form>
          <p className="mt-2 text-center text-sm text-gray-600">
            {localize('com_auth_already_have_account')}{' '}
            <a href="/login" className="font-medium text-green-600 hover:text-green-500">
              {localize('com_auth_login')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Registration;
