import React, { useEffect, useState } from 'react'; // Added useState here
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import SocialButton from './SocialButton';

function Login() {
  const [logoSrc, setLogoSrc] = useState('');
  const [altText, setAltText] = useState('');

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

  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const navigate = useNavigate();

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <img src={logoSrc} alt={altText} className="mb-6 h-16 w-auto" />
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">
          {localize('com_auth_welcome_back')}
        </h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            {localize(getLoginError(error))}
          </div>
        )}
        {startupConfig.emailLoginEnabled && <LoginForm onSubmit={login} />}
        {startupConfig.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            {localize('com_auth_no_account')}{' '}
            <a href="/register" className="p-1 font-medium text-green-500">
              {localize('com_auth_sign_up')}
            </a>
          </p>
        )}
        {startupConfig.socialLoginEnabled && (
          <>
            {startupConfig.emailLoginEnabled && (
              <>
                <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
                  <div className="absolute bg-white px-3 text-xs">Or</div>
                </div>
                <div className="mt-8" />
              </>
            )}
            <div className="mt-2">
              {socialLogins.map((provider) => providerComponents[provider] || null)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;
