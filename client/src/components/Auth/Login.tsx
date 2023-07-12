import React, { useEffect } from 'react';
import LoginForm from './LoginForm';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';

import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { useGetStartupConfig } from '@librechat/data-provider';
import { GoogleIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components'

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const lang = useRecoilValue(store.lang);

  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">{localize(lang, 'com_auth_welcome_back')}</h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            {localize(lang, 'com_auth_error_login')}
          </div>
        )}
        <LoginForm onSubmit={login} />
        {startupConfig?.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            {localize(lang, 'com_auth_no_account')}{' '}
            <a href="/register" className="p-1 text-green-500 hover:underline">
              {localize(lang, 'com_auth_sign_up')}
            </a>
          </p>
        )}
        {startupConfig?.socialLoginEnabled && (
          <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
            <div className="absolute bg-white px-3 text-xs">Or</div>
          </div>
        )}
        {startupConfig?.googleLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Google"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/google`}>
                <GoogleIcon />
                <p>{localize(lang, 'com_auth_google_login')}</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.openidLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>
            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with OpenID"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/openid`}
              >
                {startupConfig.openidImageUrl ? (
                  <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
                ) : (
                  <OpenIDIcon />
                )}
                <p>{startupConfig.openidLabel}</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.githubLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with GitHub"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/github`}>
                <GithubIcon />
                <p>Login with Github</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.discordLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Discord"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/discord`}>
                <DiscordIcon />
                <p>Login with Discord</p>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
