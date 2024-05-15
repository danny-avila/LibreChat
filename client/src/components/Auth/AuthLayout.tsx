import { ThemeSelector } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { BlinkAnimation } from './BlinkAnimation';
import { TStartupConfig } from 'librechat-data-provider';
import SocialLoginRender from './SocialLoginRender';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
}) {
  const localize = useLocalize();
  const errorRender = (errorMessage: string) => (
    <div
      className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
      role="alert"
    >
      {errorMessage}
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">
      <BlinkAnimation active={isFetching}>
        <div className="mt-12 h-24 w-full bg-cover">
          <img src="/assets/logo.svg" className="h-full w-full object-contain" alt="Logo" />
        </div>
      </BlinkAnimation>
      {startupConfigError !== null && startupConfigError !== undefined && (
        <div className="mt-16 flex justify-center">
          {errorRender(localize('com_auth_error_login_server'))}
        </div>
      )}
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <div className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          {!startupConfigError && !isFetching && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          <SocialLoginRender startupConfig={startupConfig} />
        </div>
      </div>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
