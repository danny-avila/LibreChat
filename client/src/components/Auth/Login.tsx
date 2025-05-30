import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import SocialButton from '~/components/Auth/SocialButton';
import { OpenIDIcon } from '~/components';
import { useCreateGuest } from '~/data-provider';

const VISITED_STORAGE_KEY = 'appTitle';

function Login() {
  const localize = useLocalize();
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();
  const createGuest = useCreateGuest();

  const [searchParams, setSearchParams] = useSearchParams();
  const [hasAutoLoginAttempted, setHasAutoLoginAttempted] = useState(false);

  // Determine if auto-redirect should be disabled based on the URL parameter
  const disableAutoRedirect = searchParams.get('redirect') === 'false';

  // Persist the disable flag locally so that once detected, auto-redirect stays disabled.
  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  // Check if user has visited before
  const hasVisitedBefore = useCallback(() => {
    try {
      return !!localStorage.getItem(VISITED_STORAGE_KEY);
    } catch (error) {
      console.warn('Unable to access localStorage:', error);
      return true; // Default to true if localStorage is not available
    }
  }, []);

  // Auto guest login for first-time visitors
  const attemptAutoGuestLogin = useCallback(() => {
    if (!hasVisitedBefore() && !hasAutoLoginAttempted && startupConfig?.emailLoginEnabled) {
      setHasAutoLoginAttempted(true);
      // Create new subscription
      createGuest.mutate(
        {},
        {
          onSuccess: (guest: { username: string; password: string }) => {
            // Handle successful subscription creation
            if (guest) {
              const guestCredentials = {
                email: guest.username,
                password: guest.password,
              };
              console.log(guestCredentials);
              login(guestCredentials);
            } else {
              console.error('No guest user');
            }
          },
        },
      );
    }
  }, [
    hasVisitedBefore,
    hasAutoLoginAttempted,
    startupConfig?.emailLoginEnabled,
    createGuest,
    login,
  ]);

  // Once the disable flag is detected, update local state and remove the parameter from the URL.
  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  // Attempt auto guest login when component mounts and conditions are met
  useEffect(() => {
    attemptAutoGuestLogin();
  }, [attemptAutoGuestLogin]);

  // Determine whether we should auto-redirect to OpenID.
  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled &&
    hasVisitedBefore(); // Only auto-redirect for returning visitors

  useEffect(() => {
    if (shouldAutoRedirect) {
      console.log('Auto-redirecting to OpenID provider...');
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  // Render fallback UI if auto-redirect is active.
  if (shouldAutoRedirect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold">
          {localize('com_ui_redirecting_to_provider', { 0: startupConfig.openidLabel })}
        </p>
        <div className="mt-4">
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
        </div>
      </div>
    );
  }

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
            className="inline-flex p-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}
    </>
  );
}

export default Login;
