import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { ThemeSelector } from '~/components/ui';
import SocialButton from './SocialButton';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import { BlinkAnimation } from './BlinkAnimation';
import { TStartupConfig } from 'librechat-data-provider';

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const {
    data,
    isFetching,
    error: startupConfigError,
  } = useGetStartupConfig({
    enabled: startupConfig === null,
  });
  const localize = useLocalize();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data]);

  const providerComponents = {
    discord: startupConfig?.discordLoginEnabled && (
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
    facebook: startupConfig?.facebookLoginEnabled && (
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
    github: startupConfig?.githubLoginEnabled && (
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
    google: startupConfig?.googleLoginEnabled && (
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
    openid: startupConfig?.openidLoginEnabled && (
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

  const privacyPolicy = startupConfig?.interface?.privacyPolicy;
  const termsOfService = startupConfig?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-green-500"
      href={privacyPolicy.externalUrl}
      target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className="text-sm text-green-500"
      href={termsOfService.externalUrl}
      target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const loginFormRender = startupConfig?.emailLoginEnabled && <LoginForm onSubmit={login} />;
  const registrationRender = startupConfig?.registrationEnabled && (
    <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
      {' '}
      {localize('com_auth_no_account')}{' '}
      <a href="/register" className="p-1 text-green-500">
        {localize('com_auth_sign_up')}
      </a>
    </p>
  );

  const socialLoginRender = startupConfig && startupConfig.socialLoginEnabled && (
    <>
      {startupConfig.emailLoginEnabled && (
        <>
          <div className="relative mt-6 flex w-full items-center justify-center border border-t border-gray-300 uppercase dark:border-gray-600">
            <div className="absolute bg-white px-3 text-xs text-black dark:bg-gray-900 dark:text-white">
              Or
            </div>
          </div>
          <div className="mt-8" />
        </>
      )}
      <div className="mt-2">
        {startupConfig.socialLogins?.map((provider) => providerComponents[provider] || null)}
      </div>
    </>
  );

  const errorRender = (errorMessage: string) => (
    <div
      className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
      role="alert"
    >
      {errorMessage}
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">
      <BlinkAnimation active={isFetching}>
        <div className="mt-12 h-24 w-full bg-cover">
          <img src="/assets/logo.svg" className="h-full w-full object-contain" alt="Logo" />
        </div>
      </BlinkAnimation>
      {startupConfigError !== null && (
        <div className="mt-16 flex justify-center">
          {errorRender(localize('com_auth_error_login_server'))}
        </div>
      )}
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <div className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          {!startupConfigError && !isFetching && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
              style={{ userSelect: 'none' }}
            >
              {localize('com_auth_welcome_back')}
            </h1>
          )}
          {error && errorRender(localize(getLoginError(error)))}
          {loginFormRender}
          {registrationRender}
          {socialLoginRender}
        </div>
      </div>
      <div className="align-end m-4 flex justify-center gap-2">
        {privacyPolicyRender}
        {privacyPolicyRender && termsOfServiceRender && (
          <div className="border-r-[1px] border-gray-300 dark:border-gray-600" />
        )}
        {termsOfServiceRender}
      </div>
    </div>
  );
}

export default Login;
