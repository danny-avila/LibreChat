import React, { useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { OpenIDIcon } from '~/components';
import { getLoginError } from '~/utils';

function Login() {
  const { error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();

  const navigate = useNavigate();
  const qimaLoginLogo = '/assets/qima-login-logo.svg';

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 flex w-96 flex-col items-center overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <img
          src={qimaLoginLogo}
          alt="OpenID Logo"
          className="mb-6 h-[90px] w-[90px] rounded-[8px] bg-[#00AB76] p-2 text-center"
        />
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
        {startupConfig?.openidLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>
            <div className="mt-2 flex gap-x-2">
              <a
                aria-label="Login with Office365"
                className="flex w-full items-center justify-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
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
      </div>
    </div>
  );
}

export default Login;
