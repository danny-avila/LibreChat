import { useOutletContext } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';

function Login() {
  const localize = useLocalize();
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();
  const redirectAttemptedRef = useRef(false);

  // Auto-redirect to OpenID provider if enabled
  // This is controlled by the OPENID_AUTO_REDIRECT environment variable
  // When enabled, users will be automatically redirected to the OpenID provider
  // without seeing the login form at all
  useEffect(() => {
    // Simple check if redirect is needed and not yet attempted
    if (
      !redirectAttemptedRef.current &&
      startupConfig?.openidLoginEnabled &&
      startupConfig?.openidAutoRedirect &&
      startupConfig?.serverDomain
    ) {
      // Mark that we've attempted to redirect
      redirectAttemptedRef.current = true;

      // Log and redirect
      console.log('Auto-redirecting to OpenID provider...');
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [startupConfig]);


  return (
    <>
      {error != null && <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>}
      {startupConfig?.emailLoginEnabled === true && (
        <LoginForm
          onSubmit={login}
          startupConfig={startupConfig}
          error={error}
          setError={setError}
        />
      )}
      {startupConfig?.registrationEnabled === true && (
        <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
          {' '}
          {localize('com_auth_no_account')}{' '}
          <a
            href="/register"
            className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}
    </>
  );
}

export default Login;
