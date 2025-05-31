import { useOutletContext, useSearchParams } from 'react-router-dom';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import SocialButton from '~/components/Auth/SocialButton';
import { OpenIDIcon } from '~/components';
import { useCreateGuest } from '~/data-provider';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext } from '~/hooks';
import { useContext } from 'react';

const VISITED_STORAGE_KEY = 'appTitle';
const MINIMUM_LOADING_DURATION = 1000; // 1000ms = 1 second

function Login() {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();
  const createGuest = useCreateGuest();

  const [searchParams, setSearchParams] = useSearchParams();
  const [hasAutoLoginAttempted, setHasAutoLoginAttempted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isShownLoading, setIsShownLoading] = useState(false);

  // Track loading start time
  const loadingStartTime = useRef<number>(Date.now());
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const disableAutoRedirect = searchParams.get('redirect') === 'false';
  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  const validTheme = theme === 'dark' ? 'dark' : 'light';

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Check if user has visited before
  const hasVisitedBefore = useCallback(() => {
    try {
      return !!localStorage.getItem(VISITED_STORAGE_KEY);
    } catch (error) {
      console.warn('Unable to access localStorage:', error);
      return true;
    }
  }, []);

  // Check if captcha is required
  const requiresCaptcha = useCallback(() => {
    return Boolean(startupConfig?.turnstile?.siteKey);
  }, [startupConfig?.turnstile?.siteKey]);

  // Enhanced loading state setter with minimum duration
  const setLoadingWithMinDuration = useCallback((loading: boolean) => {
    if (loading) {
      // Reset start time when starting to load
      loadingStartTime.current = Date.now();
      setIsLoading(true);
      return;
    }

    const elapsedTime = Date.now() - loadingStartTime.current;
    const remainingTime = Math.max(0, MINIMUM_LOADING_DURATION - elapsedTime);

    if (remainingTime > 0) {
      loadingTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
      }, remainingTime);
      return;
    }

    setIsLoading(false);
  }, []);

  // Create guest user with proper credentials handling
  const createGuestUser = useCallback(() => {
    createGuest.mutate(
      {},
      {
        onSuccess: (guest: { username: string; password: string }) => {
          if (guest) {
            const guestCredentials = {
              email: guest.username,
              password: guest.password,
            };
            login(guestCredentials);
          } else {
            console.error('No guest user');
            setLoadingWithMinDuration(false);
          }
        },
        onError: () => {
          setLoadingWithMinDuration(false);
        },
      },
    );
  }, [createGuest, login, setLoadingWithMinDuration]);

  // Auto guest login logic with captcha validation
  const attemptAutoGuestLogin = useCallback(() => {
    // If captcha is required, wait for validation
    if (requiresCaptcha()) {
      // Don't hide loading yet, wait for captcha
      return;
    }

    if (hasVisitedBefore()) {
      setLoadingWithMinDuration(false);
      return;
    }

    if (!hasAutoLoginAttempted) {
      setHasAutoLoginAttempted(true);
      createGuestUser();
    }
  }, [
    hasVisitedBefore,
    requiresCaptcha,
    createGuestUser,
    hasAutoLoginAttempted,
    setLoadingWithMinDuration,
  ]);

  const handleCaptchaError = useCallback(() => {
    setLoadingWithMinDuration(false);
  }, [setLoadingWithMinDuration]);

  // Handle successful captcha validation
  const handleCaptchaSuccess = useCallback(() => {
    // Create guest if auto-login was attempted but waiting for captcha
    if (hasVisitedBefore()) {
      setLoadingWithMinDuration(false);
      return;
    }

    if (!hasAutoLoginAttempted) {
      setHasAutoLoginAttempted(true);
      createGuestUser();
    }
  }, [hasAutoLoginAttempted, hasVisitedBefore, createGuestUser, setLoadingWithMinDuration]);

  // Handle URL parameter cleanup
  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  // Attempt auto guest login when component mounts
  useEffect(() => {
    if (!isShownLoading) {
      setIsShownLoading(true);
      setLoadingWithMinDuration(true);
    }
  }, [isShownLoading, setLoadingWithMinDuration]);

  useEffect(() => {
    if (startupConfig) {
      attemptAutoGuestLogin();
    }
  }, [attemptAutoGuestLogin, startupConfig]);

  // Auto-redirect logic for OpenID
  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled &&
    hasVisitedBefore();

  useEffect(() => {
    if (shouldAutoRedirect) {
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  const renderCaptcha = () => (
    <div className="my-4 flex justify-center">
      {startupConfig?.turnstile!.siteKey && (
        <Turnstile
          siteKey={startupConfig.turnstile!.siteKey}
          options={{
            ...startupConfig.turnstile!.options,
            theme: validTheme,
          }}
          onSuccess={handleCaptchaSuccess}
          onError={handleCaptchaError}
        />
      )}
    </div>
  );

  // Loading screen component
  const LoadingScreen = () => (
    <div className="fixed inset-0 z-50 ml-2 mr-2 flex flex-col items-center justify-center bg-surface-primary">
      <img
        src="/assets/omnexio-logo.png"
        alt="Omnexio Logo"
        className="mb-8 h-24 w-auto animate-pulse"
      />
      <p className="mb-8 text-lg font-semibold text-text-primary">
        {localize('com_ui_loading') || 'Loading...'}
      </p>
      {requiresCaptcha() && renderCaptcha()}
    </div>
  );

  // Show loading screen
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Render auto-redirect UI
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
          onCaptchaSuccess={handleCaptchaSuccess}
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
