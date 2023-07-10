import React, { useEffect } from 'react';
import LoginForm from './LoginForm';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '@librechat/data-provider';
import { GoogleIcon, GithubIcon, DiscordIcon /* ...rest */ } from '~/components'

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat/new');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">Welcome back</h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            Unable to login with the information provided. Please check your credentials and try again.
          </div>
        )}
        <LoginForm onSubmit={login} />
        {startupConfig?.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            Don&apos;t have an account?{' '}
            <a href="/register" className="p-1 text-green-500 hover:underline">
              Sign up
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
                <p>Login with Google</p>
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    id="openid"
                    className="h-5 w-5"
                  >
                    <path d="M271.5 432l-68 32C88.5 453.7 0 392.5 0 318.2c0-71.5 82.5-131 191.7-144.3v43c-71.5 12.5-124 53-124 101.3 0 51 58.5 93.3 135.7 103v-340l68-33.2v384zM448 291l-131.3-28.5 36.8-20.7c-19.5-11.5-43.5-20-70-24.8v-43c46.2 5.5 87.7 19.5 120.3 39.3l35-19.8L448 291z"></path>
                  </svg>
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
