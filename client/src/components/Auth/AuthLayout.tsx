import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { hasPublishedPolicies } from '~/utils/policies';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import LegalConsent from './LegalConsent';
import { Banner } from '../Banners';
import Footer from './Footer';
import { cn } from '~/utils';

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
  const isMeoAi = startupConfig?.appTitle === 'Meo AI';
  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const isRegister = pathname.includes('register');
  const isLogin = !pathname.includes('2fa') && pathname.includes('login');
  const showsSocialLogin = !isMeoAi && (isLogin || isRegister);
  const hasPolicies = hasPublishedPolicies(startupConfig);
  const registrationStatesConsent =
    !isMeoAi && isRegister && hasPolicies && !hasStartupConfigError && !isFetching;
  const statesConsentBelowProviders = !isMeoAi && isLogin && hasPolicies;
  const statesConsent = registrationStatesConsent || statesConsentBelowProviders;
  const isTwoFactorSetup = pathname === '/login/2fa/setup';

  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto w-full max-w-md px-6 pt-4">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    }
    if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto w-full max-w-md px-6 pt-4">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="text-accent-primary font-semibold hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    }
    if (error != null && error) {
      return (
        <div className="mx-auto w-full max-w-md px-6 pt-4">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  if (isMeoAi) {
    return (
      <div className="bg-surface-secondary relative flex min-h-screen min-h-[100dvh] flex-col" data-meo-auth-shell="">
        <Banner />
        <header className="flex min-h-16 items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="bg-accent-primary text-surface-primary inline-flex size-10 items-center justify-center rounded-2xl text-xs font-extrabold" aria-hidden="true">
              AI
            </span>
            <div className="flex flex-col">
              <strong className="text-text-primary text-base leading-tight">Meo AI</strong>
              <span className="text-text-secondary text-xs">A little help. More possibility.</span>
            </div>
          </div>
          <ThemeSelector />
        </header>

        <DisplayError />

        <main className="flex grow items-center justify-center px-4 pb-10">
          <section className="w-full max-w-md" aria-label="Sign in to Meo AI">
            <div className="border-border-light bg-surface-primary rounded-[26px] border px-6 py-8 shadow-sm sm:px-8">
              {isFetching && !startupConfig ? (
                <div className="animate-pulse" role="status" aria-label="Loading sign in">
                  <div className="bg-surface-secondary mx-auto h-8 w-2/3 rounded-xl" />
                  <div className="bg-surface-secondary mt-8 h-12 w-full rounded-2xl" />
                </div>
              ) : (
                <>
                  {!hasStartupConfigError && header && (
                    <div className="mb-7 text-center">
                      <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
                        {isLogin ? 'Continue to Meo AI' : header}
                      </h1>
                      {isLogin && (
                        <p className="text-text-secondary mt-2 text-sm leading-6">
                          Meo Account is the identity for Meo AI across web and native clients.
                        </p>
                      )}
                    </div>
                  )}
                  {children}
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-surface-primary relative flex min-h-screen flex-col">
      <Banner />
      <div className="mt-6 h-10 w-full bg-cover">
        <img
          src="assets/logo.svg"
          className="h-full w-full object-contain"
          alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
        />
      </div>
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <main className="flex grow items-center justify-center">
        <div
          className={cn(
            'bg-surface-primary overflow-hidden px-6 py-4 sm:rounded-lg',
            isTwoFactorSetup ? 'w-11/12 max-w-lg' : 'w-authPageWidth sm:max-w-md',
          )}
        >
          {!hasStartupConfigError && !isFetching && header && (
            <h1 className="text-text-primary mb-4 text-center text-3xl font-semibold" style={{ userSelect: 'none' }}>
              {header}
            </h1>
          )}
          {children}
          {showsSocialLogin && <SocialLoginRender startupConfig={startupConfig} showPasskey={isLogin} />}
          {statesConsentBelowProviders && <LegalConsent startupConfig={startupConfig} />}
        </div>
      </main>
      {!statesConsent && <Footer startupConfig={startupConfig} />}
    </div>
  );
}

export default AuthLayout;
