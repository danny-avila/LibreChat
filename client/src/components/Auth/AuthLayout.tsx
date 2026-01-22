import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';

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
  const logoUrl = startupConfig?.interface?.loginImageUrl;
  const logoText = startupConfig?.interface?.loginText;

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">
      <Banner />
      <BlinkAnimation active={isFetching}>
        {logoUrl ? (
          <div className="mt-6 flex w-full justify-center">
            <img
              src={logoUrl}
              className="max-h-64 w-auto object-contain"
              alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
            />
          </div>
        ) : (
          <div className="mt-6 flex w-full justify-center">
            <img
              src="assets/logo.svg"
              className="max-h-10 w-auto object-contain"
              alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
            />
          </div>
        )}
      </BlinkAnimation>
      
      {/* Welcome back header and login buttons below logo */}
      {!hasStartupConfigError && !isFetching && header && (
        <div className="mt-6 text-center">
          <h1
            className="mb-4 text-3xl font-semibold text-black dark:text-white"
            style={{ userSelect: 'none' }}
          >
            {header}
          </h1>
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <div className="mx-auto max-w-md">
                <SocialLoginRender startupConfig={startupConfig} />
              </div>
            )}
        </div>
      )}
      
      {/* ——— WELCOME SECTIONS ——— */}
      {logoText && (
        <section className="mx-auto w-full max-w-2xl space-y-8 p-6 text-black dark:text-white">
          <div>
            <div className="prose dark:prose-invert w-full max-w-none !text-text-primary">
              <MarkdownLite content={logoText} />
            </div>
          </div>
        </section>
      )}
      {/* — end welcome sections — */}
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          {children}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
