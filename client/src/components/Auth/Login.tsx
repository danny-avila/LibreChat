import { useEffect, useState } from 'react';
import { OpenIDIcon, useToastContext } from '@librechat/client';
import { ErrorTypes, registerPage } from 'librechat-data-provider';
import { useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import type { TLoginLayoutContext } from '~/common';
import type { TranslationKeys } from '~/hooks';
import { getLoginError, peekPostLoginRedirect, persistRedirectToSession } from '~/utils';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import SocialButton from '~/components/Auth/SocialButton';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';

interface LoginLocationState {
  redirect_to?: string;
}

/** Error codes the server appends to the login redirect when an OAuth navigation is rejected. */
const oauthErrorKeys: Record<string, TranslationKeys> = {
  [ErrorTypes.AUTH_FAILED]: 'com_auth_error_oauth_failed',
  [ErrorTypes.AUTH_RATE_LIMITED]: 'com_auth_error_login_rl',
  [ErrorTypes.AUTH_BANNED]: 'com_auth_error_login_ban',
};

function Login() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const postLoginRedirect = peekPostLoginRedirect(searchParams) ?? undefined;
  const disableAutoRedirect = searchParams.get('redirect') === 'false';
  const isMeoAi = startupConfig?.appTitle === 'Meo AI';

  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  useEffect(() => {
    const redirectTo = searchParams.get('redirect_to');
    if (redirectTo) {
      persistRedirectToSession(redirectTo);
    } else {
      const state = location.state as LoginLocationState | null;
      if (state?.redirect_to) {
        persistRedirectToSession(state.redirect_to);
      }
    }

    const oauthError = searchParams?.get('error');
    /** `hasOwn` keeps an attacker-supplied `?error=toString` off the prototype chain. */
    const oauthErrorKey =
      oauthError != null && Object.hasOwn(oauthErrorKeys, oauthError)
        ? oauthErrorKeys[oauthError]
        : undefined;
    if (oauthErrorKey != null) {
      showToast({
        message: localize(oauthErrorKey),
        status: 'error',
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, localize, location.state]);

  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled;

  useEffect(() => {
    if (shouldAutoRedirect) {
      console.log('Auto-redirecting to OpenID provider...');
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  if (shouldAutoRedirect) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center p-4">
        <p className="text-text-secondary text-sm">
          {isMeoAi
            ? 'Opening Meo Account…'
            : localize('com_ui_redirecting_to_provider', { 0: startupConfig.openidLabel })}
        </p>
      </div>
    );
  }

  if (isMeoAi) {
    const meoAccountReady = Boolean(
      startupConfig?.openidLoginEnabled && startupConfig?.serverDomain,
    );

    return (
      <>
        {error != null && <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>}
        {meoAccountReady ? (
          <>
            <SocialButton
              enabled={true}
              serverDomain={startupConfig!.serverDomain}
              oauthPath="openid"
              Icon={() =>
                startupConfig?.openidImageUrl ? (
                  <img
                    src={startupConfig.openidImageUrl}
                    alt="Meo Account"
                    className="h-5 w-5 rounded-md"
                  />
                ) : (
                  <OpenIDIcon />
                )
              }
              label="Continue with Meo Account"
              id="meo-account"
              redirectTo={postLoginRedirect}
            />
            <p className="text-text-secondary mt-4 text-center text-xs leading-5">
              Sign in or create your account on Meo Account. Meo AI never keeps a separate password.
            </p>
          </>
        ) : (
          <ErrorMessage>
            Meo Account sign-in is not configured. Enable the Meo Account OpenID provider for this deployment.
          </ErrorMessage>
        )}
      </>
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
        <p className="text-text-secondary my-4 text-center text-sm font-light">
          {' '}
          {localize('com_auth_no_account')}{' '}
          <a
            href={registerPage()}
            className="text-accent-primary hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover inline-flex p-1 text-sm font-medium underline decoration-transparent transition-all duration-200"
          >
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}
    </>
  );
}

export default Login;
