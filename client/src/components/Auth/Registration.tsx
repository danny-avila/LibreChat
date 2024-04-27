import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useMemo } from 'react';
import { useRegisterUserMutation, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TRegisterUser } from 'librechat-data-provider';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { ThemeSelector } from '~/components/ui';
import SocialButton from './SocialButton';
import { useLocalize } from '~/hooks';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { type Container, type ISourceOptions, MoveDirection, OutMode } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import { TypeAnimation } from 'react-type-animation';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });

  const particlesLoaded = async (container?: Container): Promise<void> => {
    console.log(container);
  };

  const options: ISourceOptions = useMemo(
    () => ({
      background: {
        color: {
          value: '#2563eb',
        },
      },
      fpsLimit: 120,
      interactivity: {
        events: {
          onClick: {
            enable: true,
            mode: 'push',
          },
        },
        modes: {
          push: {
            quantity: 1,
          },
          repulse: {
            distance: 100,
            duration: 0.5,
          },
        },
      },
      particles: {
        color: {
          value: '#ffffff',
        },
        links: {
          color: '#ffffff',
          distance: 250,
          enable: true,
          opacity: 0.6,
          width: 0.5,
        },
        number: {
          density: {
            enable: true,
          },
          value: 130,
        },
        shape: {
          type: 'line',
        },
        size: {
          value: { min: 1, max: 5 },
        },
        move: {
          direction: 'none',
          random: true,
          enable: true,
          speed: 1.5,
          straight: false,
        },
      },
      detectRetina: false,
    }),
    [],
  );

  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const registerUser = useRegisterUserMutation();
  const password = watch('password');

  const onRegisterUserFormSubmit = async (data: TRegisterUser) => {
    try {
      await registerUser.mutateAsync(data);
      setRegistrationSuccess(true);
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
          className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-black/10 bg-white px-2.5 pb-2.5 pt-5 text-sm text-gray-800 focus:border-green-500 focus:outline-none dark:border-white/20 dark:bg-gray-900 dark:text-white dark:focus:border-green-500"
          placeholder=" "
          data-testid={id}
        ></input>
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500 dark:text-gray-200"
        >
          {localize(label)}
        </label>
      </div>
      {errors[id] && (
        <span role="alert" className="mt-1 text-sm text-black dark:text-white">
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

  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;

  const privacyPolicyRender = (
    <a
      className="text-xs font-medium text-blue-500"
      href={privacyPolicy?.externalUrl || 'privacy-policy'}
      target="_blank"
      rel="noreferrer"
    >
      {privacyPolicy?.externalUrl ? localize('com_ui_privacy_policy') : 'Privacy Policy'}
    </a>
  );

  const termsOfServiceRender = (
    <a
      className="text-xs font-medium text-blue-500"
      href={termsOfService?.externalUrl || 'terms-of-service'}
      target="_blank"
      rel="noreferrer"
    >
      {termsOfService?.externalUrl ? localize('com_ui_terms_of_service') : 'Terms of Service'}
    </a>
  );

  const domainLogos = {
    'gptchina.io': 'logo-china.png',
    'gptafrica.io': 'logo-africa.png',
    'gptglobal.io': 'logo-global.png',
    'gptiran.io': 'logo-iran.png',
    'gptitaly.io': 'logo-italy.png',
    'gptrussia.io': 'logo-russia.png',
    'gptusa.io': 'logo-usa.png',
    'novlisky.io': 'logo-novlisky.png',
  };

  const domainTitles = {
    'gptchina.io': 'GPT China',
    'gptafrica.io': 'GPT Africa',
    'gptglobal.io': 'GPT Global',
    'gptiran.io': 'GPT Iran',
    'gptitaly.io': 'GPT Italy',
    'gptrussia.io': 'GPT Russia',
    'gptusa.io': 'GPT USA',
    'novlisky.io': 'Novlisky',
  };

  const currentDomain = window.location.hostname;
  const logoImageFilename = domainLogos[currentDomain] || 'logo-novlisky.png';
  const domainTitle = domainTitles[currentDomain] || 'Novlisky';

  return (
    <section className="flex flex-col md:h-screen md:flex-row">
      <div className="fixed bottom-0 left-0 z-50 m-4">
        <ThemeSelector />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center justify-center bg-white dark:bg-gray-800 md:w-1/2">
        <div className="w-full overflow-hidden bg-white px-6 py-4 dark:bg-gray-800 sm:max-w-md sm:rounded-lg">
          <img
            src={`/assets/${logoImageFilename}`}
            className="mx-auto mb-10 h-16 w-auto"
            alt="Logo"
          />
          <h1
            className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
            style={{ userSelect: 'none' }}
          >
            {localize('com_auth_create_account')}
          </h1>
          {registrationSuccess && (
            <div
              className="rounded-md border border-blue-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
              role="alert"
            >
              {localize('com_auth_registration_success')}
            </div>
          )}
          {error && (
            <div
              className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
              role="alert"
              data-testid="registration-error"
            >
              {localize('com_auth_error_create')} {errorMessage}
            </div>
          )}
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit(onRegisterUserFormSubmit)}
          >
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
            {renderInput('email', 'com_auth_email', 'email', {
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
            <div className="mt-6">
              <button
                disabled={Object.keys(errors).length > 0}
                type="submit"
                aria-label="Submit registration"
                className="focus:bg-blue-650 w-full transform rounded-md bg-blue-600 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-blue-700 focus:outline-none active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-500 disabled:hover:bg-blue-500"
              >
                {localize('com_auth_continue')}
              </button>
            </div>
          </form>
          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a href="/login" aria-label="Login" className="p-1 font-medium text-blue-500">
              {localize('com_auth_login')}
            </a>
          </p>
          {startupConfig.socialLoginEnabled && (
            <>
              {startupConfig.emailLoginEnabled && (
                <>
                  <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
                    <div className="absolute bg-white px-3 text-xs text-black dark:bg-gray-900 dark:text-white">
                      Or
                    </div>
                  </div>
                  <div className="mt-8" />
                </>
              )}
              <div className="mt-2">
                {socialLogins.map((provider) => providerComponents[provider] || null)}
              </div>
            </>
          )}
          <div className="mt-4 flex justify-center gap-4 align-middle">
            {privacyPolicyRender}
            {privacyPolicyRender && termsOfServiceRender && (
              <div className="border-r-[1px] border-gray-300" />
            )}
            {termsOfServiceRender}
          </div>
        </div>
      </div>
      <div className="relative flex w-full flex-col justify-center bg-blue-500 p-24 dark:bg-blue-600 md:w-1/2">
        <Particles
          id="tsparticles"
          particlesLoaded={particlesLoaded}
          options={options}
          className="absolute inset-0"
        />
        <div className="z-10 text-left">
          <div className="z-10 text-left">
            <TypeAnimation
              sequence={[
                // Same substring at the start will only be typed once, initially
                `Welcome to ${domainTitle}`,
                1000,
              ]}
              speed={50}
              repeat={Infinity}
              cursor={true}
              className="mb-4 text-5xl font-bold text-white"
            />
          </div>
          <p className="mb-4 text-lg text-white">
            Unleash the power of advanced language models like Anthropic, Mistral, GPT-3, and GPT-4
            with Novliskys cutting-edge AI chat platform. Experience seamless, intelligent
            conversations tailored to your needs.
          </p>
          <p className="mb-4 text-lg text-white">
            With our pay-as-you-go pricing model, you can access this revolutionary technology
            without breaking the bank. Sign up now and explore the future of AI-driven
            communication.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Registration;
