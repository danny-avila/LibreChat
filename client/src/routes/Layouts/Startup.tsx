import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import { TranslationKeys, useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import AuthLayout from '~/components/Auth/AuthLayout';
import { getPostLoginRedirect } from '~/utils';

const headerMap: Record<string, TranslationKeys> = {
  '/login': 'com_auth_welcome_back',
  '/register': 'com_auth_create_account',
  '/forgot-password': 'com_auth_reset_password',
  '/reset-password': 'com_auth_reset_password',
  '/login/2fa': 'com_auth_verify_your_identity',
  '/login/2fa/setup': 'com_auth_two_factor_setup_required',
};

export default function StartupLayout({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const [error, setError] = useState<TranslationKeys | null>(null);
  const [headerText, setHeaderText] = useState<TranslationKeys | null>(null);
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const {
    data,
    isFetching,
    error: startupConfigError,
  } = useGetStartupConfig({
    enabled: isAuthenticated ? startupConfig === null : true,
  });
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  /**
   * Only an already-authenticated arrival is this layout's to redirect. When authentication
   * completes while an auth route is mounted, the auth context has already consumed the pending
   * destination and navigated there; re-resolving it here would find nothing left and replace that
   * destination with `/c/new`.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const destination =
      getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? '/c/new';
    navigateRef.current(destination, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design; see comment above
  }, []);

  useEffect(() => {
    if (data) {
      setStartupConfig(data);
    }
  }, [data]);

  useEffect(() => {
    document.title = startupConfig?.appTitle || 'LibreChat';
  }, [startupConfig?.appTitle]);

  useEffect(() => {
    setError(null);
    setHeaderText(null);
  }, [location.pathname]);

  const contextValue = {
    error,
    setError,
    headerText,
    setHeaderText,
    startupConfigError,
    startupConfig,
    isFetching,
  };

  return (
    <AuthLayout
      header={headerText ? localize(headerText) : localize(headerMap[location.pathname])}
      isFetching={isFetching}
      startupConfig={startupConfig}
      startupConfigError={startupConfigError}
      pathname={location.pathname}
      error={error}
    >
      <Outlet context={contextValue} />
    </AuthLayout>
  );
}
