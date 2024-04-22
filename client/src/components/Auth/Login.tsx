import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeSelector } from '~/components/ui';
import SocialButton from './SocialButton';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { type Container, type ISourceOptions, MoveDirection, OutMode } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';

const apiUrl = process.env.REACT_APP_API_URL;

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const navigate = useNavigate();
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const particlesLoaded = async (container?: Container): Promise<void> => {
    console.log(container);
  };

  const options: ISourceOptions = useMemo(
    () => ({
      background: {
        color: {
          value: '#0d47a1',
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
            quantity: 4,
          },
          repulse: {
            distance: 100,
            duration: 0.4,
          },
        },
      },
      particles: {
        color: {
          value: '#ffffff',
        },
        links: {
          color: '#ffffff',
          distance: 200,
          enable: true,
          opacity: 0.5,
          width: 1,
        },
        number: {
          density: {
            enable: true,
          },
          value: 150,
        },
        opacity: {
          value: 0.5,
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
          speed: 2,
          straight: false,
        },
      },
      detectRetina: true,
    }),
    [],
  );

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!startupConfig) {
    return null;
  }

  const socialLogins = startupConfig.socialLogins ?? [];

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
      className="text-xs font-medium text-blue-300"
      href={privacyPolicy?.externalUrl || 'privacy-policy'}
      target="_blank"
      rel="noreferrer"
    >
      {privacyPolicy?.externalUrl ? localize('com_ui_privacy_policy') : 'Privacy Policy'}
    </a>
  );

  const termsOfServiceRender = (
    <a
      className="text-xs font-medium text-blue-300"
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

  const currentDomain = window.location.hostname;
  const logoImageFilename = domainLogos[currentDomain] || 'logo-novlisky.png';

  return (
    <section className="flex flex-col md:h-screen md:flex-row">
      <div className="relative z-10 flex w-full flex-col items-center justify-center bg-black p-6 dark:bg-gray-900 md:w-1/2">
        <div className="mt-6 w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          <img
            src={`/assets/${logoImageFilename}`}
            className="mx-auto mb-6 h-16 w-auto"
            alt="Logo"
          />
          <h1
            className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
            style={{ userSelect: 'none' }}
          >
            {localize('com_auth_welcome_back')}
          </h1>
          {error && (
            <div
              className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
              role="alert"
            >
              {localize(getLoginError(error))}
            </div>
          )}
          {startupConfig.emailLoginEnabled && <LoginForm onSubmit={login} />}
          {startupConfig.registrationEnabled && (
            <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
              {' '}
              {localize('com_auth_no_account')}{' '}
              <a href="/register" className="p-1 font-medium text-blue-300">
                {localize('com_auth_sign_up')}
              </a>
            </p>
          )}
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
          <h1 className="mb-4 text-4xl font-bold text-white">Welcome to Novlisky</h1>
          <h2 className="mb-2 text-2xl font-semibold text-white">AI-Powered Conversations</h2>
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
}

export default Login;
