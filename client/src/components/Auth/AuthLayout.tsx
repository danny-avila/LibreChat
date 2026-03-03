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
            <a className="font-semibold hover:underline" style={{ color: '#c9a87c' }} href="/forgot-password">
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
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0d0d14' }}
    >
      <Banner />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="assets/logo.svg"
          alt=""
          className="h-[700px] w-[700px] object-contain"
          style={{ opacity: 0.06 }}
        />
      </div>
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <main
        className="relative z-10 flex w-full max-w-md flex-col gap-6 rounded-2xl px-10 py-10"
        style={{
          backgroundColor: 'rgba(13, 13, 20, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(201, 168, 124, 0.15)',
        }}
      >
        <BlinkAnimation active={isFetching}>
          <div className="flex justify-center">
            <img
              src="assets/by_jenny_schweigler.png"
              alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'KARRIERE.MUM' })}
              className="h-32 w-auto object-contain"
              style={{ opacity: 0.9 }}
            />
          </div>
        </BlinkAnimation>
        <DisplayError />
        {!hasStartupConfigError && !isFetching && header && (
          <div className="text-center">
            <h1
              className="text-xl font-semibold"
              style={{ color: '#c9a87c', userSelect: 'none' }}
            >
              {header}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Melde dich mit deiner E-Mail und deinem Passwort an
            </p>
          </div>
        )}
        {children}
        {!pathname.includes('2fa') &&
          (pathname.includes('login') || pathname.includes('register')) && (
            <SocialLoginRender startupConfig={startupConfig} />
          )}
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
