import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeSelector } from '~/components/ui';
import SocialButton from './SocialButton';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';

function Login() {
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 dark:bg-gray-900 sm:pt-0">
      <div className="absolute bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      <div className="mt-6 w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
        <h1
          className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
          style={{ userSelect: 'none' }}
        >
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
          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
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
      </div>
    </div>
  );
}

export default Login;
