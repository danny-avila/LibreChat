import React, { useEffect } from 'react';
import LoginForm from './LoginForm';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';

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
        {startupConfig?.googleLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>
            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Google"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/google`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 512 512"
                  id="google"
                  className="h-5 w-5"
                >
                  <path
                    fill="#fbbb00"
                    d="M113.47 309.408 95.648 375.94l-65.139 1.378C11.042 341.211 0 299.9 0 256c0-42.451 10.324-82.483 28.624-117.732h.014L86.63 148.9l25.404 57.644c-5.317 15.501-8.215 32.141-8.215 49.456.002 18.792 3.406 36.797 9.651 53.408z"
                  ></path>
                  <path
                    fill="#518ef8"
                    d="M507.527 208.176C510.467 223.662 512 239.655 512 256c0 18.328-1.927 36.206-5.598 53.451-12.462 58.683-45.025 109.925-90.134 146.187l-.014-.014-73.044-3.727-10.338-64.535c29.932-17.554 53.324-45.025 65.646-77.911h-136.89V208.176h245.899z"
                  ></path>
                  <path
                    fill="#28b446"
                    d="m416.253 455.624.014.014C372.396 490.901 316.666 512 256 512c-97.491 0-182.252-54.491-225.491-134.681l82.961-67.91c21.619 57.698 77.278 98.771 142.53 98.771 28.047 0 54.323-7.582 76.87-20.818l83.383 68.262z"
                  ></path>
                  <path
                    fill="#f14336"
                    d="m419.404 58.936-82.933 67.896C313.136 112.246 285.552 103.82 256 103.82c-66.729 0-123.429 42.957-143.965 102.724l-83.397-68.276h-.014C71.23 56.123 157.06 0 256 0c62.115 0 119.068 22.126 163.404 58.936z"
                  ></path>
                </svg>
                <p>Login with Google</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.openidLoginEnabled && (
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
        {startupConfig?.githubLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>
            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with GitHub"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/github`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  id="github"
                  className="h-5 w-5"
                >
                  <path
                    fill="currentColor"
                    d="M12 0a12 12 0 0 0-3.84 23.399c.608.112.832-.256.832-.576v-2.015c-3.395.736-4.115-1.632-4.115-1.632a3.241 3.241 0 0 0-1.359-1.792c-1.104-.736.064-.736.064-.736a2.566 2.566 0 0 1 1.824 1.216a2.638 2.638 0 0 0 3.616 1.024a2.607 2.607 0 0 1 .768-1.6c-2.688-.32-5.504-1.344-5.504-5.984a4.677 4.677 0 0 1 1.216-3.168a4.383 4.383 0 0 1 .128-3.136s1.024-.32 3.36 1.216a11.66 11.66 0 0 1 6.112 0c2.336-1.536 3.36-1.216 3.36-1.216a4.354 4.354 0 0 1 .128 3.136a4.628 4.628 0 0 1 1.216 3.168c0 4.672-2.848 5.664-5.536 5.952a2.881 2.881 0 0 1 .832 2.24v3.36c0 .32.224.672.832.576A12 12 0 0 0 12 0z"
                  />
                </svg>
                <p>Login with GitHub</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.discordLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>
            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Discord"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/discord`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 1024 1024"
                  id="discord"
                  className="h-6 w-6"
                >
                  <path
                    fill="currentColor"
                    d="M689.43 349a422.21 422.21 0 0 0-104.22-32.32 1.58 1.58 0 0 0-1.68.79 294.11 294.11 0 0 0-13 26.66 389.78 389.78 0 0 0-117.05 0 269.75 269.75 0 0 0-13.18-26.66 1.64 1.64 0 0 0-1.68-.79A421 421 0 0 0 334.44 349a1.49 1.49 0 0 0-.69.59c-66.37 99.17-84.55 195.9-75.63 291.41a1.76 1.76 0 0 0 .67 1.2 424.58 424.58 0 0 0 127.85 64.63 1.66 1.66 0 0 0 1.8-.59 303.45 303.45 0 0 0 26.15-42.54 1.62 1.62 0 0 0-.89-2.25 279.6 279.6 0 0 1-39.94-19 1.64 1.64 0 0 1-.16-2.72c2.68-2 5.37-4.1 7.93-6.22a1.58 1.58 0 0 1 1.65-.22c83.79 38.26 174.51 38.26 257.31 0a1.58 1.58 0 0 1 1.68.2c2.56 2.11 5.25 4.23 8 6.24a1.64 1.64 0 0 1-.14 2.72 262.37 262.37 0 0 1-40 19 1.63 1.63 0 0 0-.87 2.28 340.72 340.72 0 0 0 26.13 42.52 1.62 1.62 0 0 0 1.8.61 423.17 423.17 0 0 0 128-64.63 1.64 1.64 0 0 0 .67-1.18c10.68-110.44-17.88-206.38-75.7-291.42a1.3 1.3 0 0 0-.63-.63zM427.09 582.85c-25.23 0-46-23.16-46-51.6s20.38-51.6 46-51.6c25.83 0 46.42 23.36 46 51.6.02 28.44-20.37 51.6-46 51.6zm170.13 0c-25.23 0-46-23.16-46-51.6s20.38-51.6 46-51.6c25.83 0 46.42 23.36 46 51.6.01 28.44-20.17 51.6-46 51.6z"
                  />
                </svg>
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
