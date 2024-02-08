import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import SocialButton from './SocialButton';

function Login() {
  const [pk, setPk] = useState('');
  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // if (!startupConfig) {
  //   return null;
  // }

  const socialLogins = startupConfig?.socialLogins ?? [];

  const providerComponents = {
    discord: (
      <SocialButton
        key="discord"
        enabled={startupConfig?.discordLoginEnabled}
        serverDomain={startupConfig?.serverDomain}
        oauthPath="discord"
        Icon={DiscordIcon}
        label={localize('com_auth_discord_login')}
        id="discord"
      />
    ),
    facebook: (
      <SocialButton
        key="facebook"
        enabled={startupConfig?.facebookLoginEnabled}
        serverDomain={startupConfig?.serverDomain}
        oauthPath="facebook"
        Icon={FacebookIcon}
        label={localize('com_auth_facebook_login')}
        id="facebook"
      />
    ),
    github: (
      <SocialButton
        key="github"
        enabled={startupConfig?.githubLoginEnabled}
        serverDomain={startupConfig?.serverDomain}
        oauthPath="github"
        Icon={GithubIcon}
        label={localize('com_auth_github_login')}
        id="github"
      />
    ),
    google: (
      <SocialButton
        key="google"
        enabled={startupConfig?.googleLoginEnabled}
        serverDomain={startupConfig?.serverDomain}
        oauthPath="google"
        Icon={GoogleIcon}
        label={localize('com_auth_google_login')}
        id="google"
      />
    ),
    openid: (
      <SocialButton
        key="openid"
        enabled={startupConfig?.openidLoginEnabled}
        serverDomain={startupConfig?.serverDomain}
        oauthPath="openid"
        Icon={() =>
          startupConfig?.openidImageUrl ? (
            <img src={startupConfig?.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
          ) : (
            <OpenIDIcon />
          )
        }
        label={startupConfig?.openidLabel}
        id="openid"
      />
    ),
  };

  console.log('hi', isAuthenticated);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-login-base pt-6 sm:pt-0">
      <div className="mt-6 w-authPageWidth overflow-hidden bg-white px-8 py-10 sm:max-w-md sm:rounded-lg">
        <img src="/assets/vera-logo-color.svg" className="w-auto h-16 m-auto mb-8" />
        <h1 className="mb-4 text-center text-xl font-semibold">
          {localize('com_auth_log_in_to_your_account')}
        </h1>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" for="email">
            Email
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="email"
            type="email"
            placeholder="Enter your email"
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" for="password">
            Password
          </label>
          <input
            className="shadow appearance-none rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="password"
            type="password"
            placeholder="Enter your password"
          />

          {/* <p className="text-red-500 text-xs italic">Please choose a password.</p> */}
        </div>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            {localize(getLoginError(error))}
          </div>
        )}
        {startupConfig?.emailLoginEnabled && <LoginForm onSubmit={login} />}
        {startupConfig?.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            {localize('com_auth_no_account')}{' '}
            <a href="/register" className="p-1 font-medium text-green-500">
              {localize('com_auth_sign_up')}
            </a>
          </p>
        )}
        {startupConfig?.socialLoginEnabled && (
          <>
            {startupConfig?.emailLoginEnabled && (
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
        <button
          type="submit"
          aria-label={localize('com_auth_sign_in')}
          className="w-full transform rounded-md bg-vteal px-4 py-3 tracking-wide text-white transition-all duration-300 hover:bg-green-550 focus:bg-green-550 focus:outline-none"
        >
          {localize('com_auth_sign_in')}
        </button>
      </div>
      <p>insert vera auth token</p>
      <input style={{ background: 'cyan' }} onChange={(e) => setPk(e.target.value)}></input>
      <button
        className="ml-2 border"
        onClick={(e) => {
          console.log(pk);
          loginVera(pk);
        }}
      >
        {' '}
        Submit
      </button>
    </div>
  );
}

export default Login;
