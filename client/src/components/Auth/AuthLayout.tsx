import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { hasPublishedPolicies } from '~/utils/policies';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import LegalConsent from './LegalConsent';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const isRegister = pathname.includes('register');
  const isLogin = !pathname.includes('2fa') && pathname.includes('login');
  const showsSocialLogin = isLogin || isRegister;
  /** Both ways in state it, rather than the layout guessing which of them can
   *  create an account. That guess is not available here: account creation
   *  also happens on a first provider sign-in, on a first LDAP sign-in through
   *  the ordinary form, and is gated server-side by ALLOW_SOCIAL_REGISTRATION,
   *  which the startup payload does not carry. The sentence is about
   *  continuing, which is what both screens do, and it names the same policies
   *  the footer bar linked, so a screen states them once. */
  const statesConsent =
    (isRegister || isLogin) &&
    !hasStartupConfigError &&
    !isFetching &&
    hasPublishedPolicies(startupConfig);
  /** Registration states it under its own submit button, where it is read
   *  before the account is created rather than below however many provider
   *  buttons a deployment configured. On the login screen those buttons are
   *  the account creation, so there the sentence closes the card. */
  const statesConsentBelowProviders = statesConsent && !isRegister;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a
              className="font-semibold text-accent-primary hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-primary">
      <Banner />
      <BlinkAnimation active={isFetching}>
        <div className="mt-6 h-10 w-full bg-cover">
          <img
            src="assets/logo.svg"
            className="h-full w-full object-contain"
            alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
          />
        </div>
      </BlinkAnimation>
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-surface-primary px-6 py-4 sm:max-w-md sm:rounded-lg">
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-text-primary"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          {showsSocialLogin && <SocialLoginRender startupConfig={startupConfig} />}
          {statesConsentBelowProviders && <LegalConsent startupConfig={startupConfig} />}
        </div>
      </main>
      {!statesConsent && <Footer startupConfig={startupConfig} />}
    </div>
  );
}

export default AuthLayout;
