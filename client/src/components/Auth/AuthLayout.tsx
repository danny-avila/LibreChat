import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { BKL_TAGLINE } from '~/components/Bkl/brand';
import PrismWordmark from '~/components/Bkl/PrismWordmark';
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
            <a
              className="font-semibold text-gray-800 hover:underline dark:text-gray-200"
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
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-gray-900">
      <Banner />
      <BlinkAnimation active={isFetching}>
        {/* BKL Prism 로그인 락업 — 사이드바·헤더와 같은 텍스트 워드마크를 쓴다.
            법인 마크 이미지를 'Prism' 글자 옆에 세웠을 때 로고의 글자 베이스라인이
            이미지 경계와 달라 정렬이 눈에 띄게 어긋났다. 둘을 한 줄의 텍스트로
            두면 베이스라인이 하나라 어긋날 여지가 없고, 표기도 다른 화면과 같아진다.
            아래 스펙트럼 선은 이름의 유래(백색광→스펙트럼)를 보여주는 유일한 장식이다. */}
        <div className="mt-8 flex w-full flex-col items-center gap-3">
          <PrismWordmark className="text-4xl font-semibold leading-none tracking-tight text-black dark:text-white" />
          <hr className="prism-rule w-40 max-w-[70vw]" aria-hidden="true" />
          <p className="text-sm text-text-secondary">{BKL_TAGLINE}</p>
        </div>
      </BlinkAnimation>
      <DisplayError />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>

      <main className="flex flex-grow items-center justify-center">
        {/* BKL: max-w-md(28rem)에서 제목이 2줄로 꺾여 max-w-lg 로 확장 */}
        <div className="w-authPageWidth overflow-hidden bg-white px-6 py-4 dark:bg-gray-900 sm:max-w-lg sm:rounded-lg">
          {/* BKL: 모바일 폭에서 '…환영합니/다' 줄꺾임 방지 — 작은 화면은 2xl,
              단어 중간이 아닌 어절 단위로만 줄바꿈(break-keep) */}
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 break-keep text-center text-2xl font-semibold text-black dark:text-white sm:text-3xl"
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
