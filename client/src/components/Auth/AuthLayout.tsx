import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';
import { useCallback, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { LangSelector } from '../Nav/SettingsTabs/General/General';
import { LanguageOption } from '~/common';
import Cookies from 'js-cookie';
import { useRecoilState } from 'recoil';
import store from '~/store';
import { Languages } from 'lucide-react';


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

  const [isLangOpen, setIsLangOpen] = useState(() => {
    return !localStorage.getItem('lang_selected');
  });
  const [langcode, setLangcode] = useRecoilState(store.lang);


  const languageOptions: LanguageOption[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'en-US', label: 'English' },
    { value: 'pa', label: 'ਪੰਜਾਬੀ' },
  ];


  const handleLangChange = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang =
          (typeof navigator !== 'undefined'
            ? navigator.language || navigator.languages?.[0]
            : null) ?? 'en-US';
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });

      setLangcode(userLang);
      localStorage.setItem('lang_selected', 'true');
      setIsLangOpen(false);
      Cookies.set('lang', userLang, { expires: 365 });
    },
    [setLangcode],
  );

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
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">


      <Transition appear show={isLangOpen}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => {
            handleLangChange("auto");
            setIsLangOpen(false);
          }}
        > {/* Backdrop */}
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40 dark:bg-black/70" />
          </TransitionChild>

          {/* Panel */}
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex items-center justify-center p-4">
              <DialogPanel
                className="
            w-full max-w-sm
            rounded-2xl
            bg-white dark:bg-gray-900
            p-6
            shadow-2xl
            ring-1 ring-black/5 dark:ring-white/10
          "
              >
                <DialogTitle className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Select Language
                  </h2>

                  <button
                    onClick={() => setIsLangOpen(false)}
                    className="
                rounded-md p-1
                text-gray-500 hover:text-gray-900
                dark:text-gray-400 dark:hover:text-gray-100
                transition
              "
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </DialogTitle>

                <LangSelector
                  langcode={langcode}
                  // onChange={(value) => {
                  //   localStorage.setItem('lang', value);
                  //   localStorage.setItem('lang_selected', 'true');
                  //   setLangcode(value);
                  //   setIsLangOpen(false);
                  // }}
                  onChange={handleLangChange}
                  defaultLanguageOptions={languageOptions}
                  portal={false}
                />
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>


      <Banner />
      <BlinkAnimation active={isFetching}>
        <div className="mt-6 h-10 w-full bg-cover">
          <img
            src="assets/annam-logo.png"
            className="h-full w-full object-contain"
            alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
          />
        </div>
      </BlinkAnimation>
      <DisplayError />

      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <ThemeSelector returnThemeOnly />

        <button
          onClick={() => setIsLangOpen(true)}
          aria-label="Select language"
          className="
            flex items-center
            rounded-lg
            p-2
            text-foreground
            transition-colors
            hover:bg-surface-hover
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-blue-600
            focus-visible:ring-offset-2
            dark:focus-visible:ring-0
          "
        >
          <Languages className="h-5 w-5 stroke-[1.5]" />
        </button>
      </div>


      <main className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-md sm:rounded-lg">
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center text-3xl font-semibold text-black dark:text-white"
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
