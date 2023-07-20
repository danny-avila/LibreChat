import { useEffect } from 'react';
import LoginForm from './LoginForm';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '@librechat/data-provider';

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
        <h1 className="mb-4 text-center text-3xl font-semibold">{navigator.languages[0]==='zh-CN'?'欢迎回来':'Welcome back'}</h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            {navigator.languages[0]==='zh-CN'?'无法使用提供的信息登录。请检查您的凭据，然后重试。':'Unable to login with the information provided. Please check your credentials and try again.'}
          </div>
        )}
        <LoginForm onSubmit={login} />
        {startupConfig?.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            {navigator.languages[0]==='zh-CN'?'没有账号？点击':'Don&apos;t have an account?'}{' '}
            <a href="/register" className="p-1 text-green-500 hover:underline">
              {navigator.languages[0]==='zh-CN'?'注册':'Sign up'}
            </a>
          </p>
        )}
        {startupConfig?.googleLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">{navigator.languages[0]==='zh-CN'?'或':'Or'}</div>
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
                <p>{navigator.languages[0]==='zh-CN'?'使用Google登录':'Login with Google'}</p>
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

      </div>
    </div>
  );
}

export default Login;
