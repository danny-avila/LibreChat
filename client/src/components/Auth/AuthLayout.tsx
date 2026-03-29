import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
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
            <a className="font-semibold text-green-600 hover:underline" href="/forgot-password">
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
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-brand-teal-50 via-white to-white dark:from-brand-teal-900 dark:via-gray-900 dark:to-gray-900">
      <Banner />
      <BlinkAnimation active={isFetching}>
        <div className="mx-auto mt-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-teal-600 to-brand-teal-800 shadow-lg">
            <svg width="38" height="38" viewBox="0 0 512 512" aria-hidden="true">
              <path
                d="M256,88 L278,174 L355,129 L310,206 L396,228 L310,250 L355,327 L278,282 L256,368 L234,282 L157,327 L202,250 L116,228 L202,206 L157,129 L234,174 Z"
                fill="#E8C84A"
              />
              <circle cx="256" cy="228" r="28" fill="rgba(8,61,78,0.8)"/>
              <path d="M256,214 L260,223 L270,228 L260,233 L256,242 L252,233 L242,228 L252,223 Z" fill="#C9A01E"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-brand-teal-700 dark:text-brand-teal-300">
            {localize('com_ui_logo', { 0: 'AtlasChat' })}
          </span>
        </div>
      </BlinkAnimation>
      <p className="mt-2 text-center text-sm text-text-secondary">
        <span lang="ar" dir="rtl">الذكاء الاصطناعي للجميع</span>
        <span className="mx-2 opacity-40">·</span>
        <span lang="fr">L'IA pour tous</span>
      </p>
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center px-4 py-6">
        <div className="auth-card-enterprise w-authPageWidth overflow-hidden bg-white px-6 py-6 dark:bg-gray-900 sm:max-w-md sm:rounded-2xl">
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-gray-900 dark:text-white"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
