/* eslint-disable i18next/no-literal-string */
import { useEffect } from 'react';
import { CodeCanBrandIcon } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import { hideAccessoryBar, showAccessoryBar } from '~/utils/keyboard';
import SocialLoginRender from './SocialLoginRender';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  useEffect(() => {
    void hideAccessoryBar();
    return () => {
      void showAccessoryBar();
    };
  }, []);

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto mb-4 sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto mb-4 sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="font-semibold text-ink-800 hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto mb-4 sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  const isSignup = pathname.includes('register');
  const isSignin = pathname === '/login' || pathname.endsWith('/login');
  const isAuthEntry = isSignup || isSignin;

  const Hero = () => (
    <div className="px-7 text-center">
      <div className="mb-6 flex justify-center">
        <CodeCanBrandIcon size={44} radius={10} />
      </div>
      <h1 className="font-serif text-[32px] font-medium leading-[1.1] tracking-[-0.015em] text-ink-800 dark:text-dm-text">
        {isSignup ? (
          <>
            Build with <span className="italic text-signal-amber">confidence.</span>
          </>
        ) : (
          <>Welcome back.</>
        )}
      </h1>
      {isSignup ? (
        <p className="mx-auto mt-3 max-w-[300px] text-[14px] leading-[1.5] text-cc-slate-500 dark:text-dm-text-mute">
          Instant, cited answers to every code question.
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-dm-ambient">
      <Banner />
      <DisplayError />

      <div className="flex flex-grow items-start justify-center pt-10 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px] px-5 pb-8 pt-6 sm:px-6 sm:py-8">
          {isAuthEntry ? <Hero /> : null}
          {!isAuthEntry && !hasStartupConfigError && !isFetching && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-ink-800 dark:text-dm-text"
              style={{ userSelect: 'none' }}
            >
              {/* legacy header shown for non-entry auth pages (reset password, 2fa, etc.) */}
              {localize('com_auth_create_account')}
            </h1>
          )}
          <div className={isAuthEntry ? 'mt-8' : ''}>{children}</div>
          {!pathname.includes('2fa') && isAuthEntry && (
            <SocialLoginRender
              startupConfig={startupConfig}
              mode={isSignup ? 'signup' : 'signin'}
            />
          )}
          {isAuthEntry ? (
            <p className="mt-6 text-center text-[13px] text-cc-slate-500 dark:text-dm-text-mute">
              {isSignup ? (
                <>
                  {localize('com_auth_already_have_account')}{' '}
                  <a
                    href="/login"
                    className="font-bold text-ink-800 hover:underline dark:text-signal-amber"
                  >
                    {localize('com_auth_login')}
                  </a>
                </>
              ) : (
                <>
                  {localize('com_auth_no_account')}{' '}
                  <a
                    href="/register"
                    className="font-bold text-ink-800 hover:underline dark:text-signal-amber"
                  >
                    {localize('com_auth_sign_up')}
                  </a>
                </>
              )}
            </p>
          ) : null}
        </div>
      </div>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
