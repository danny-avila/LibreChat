import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import AuthLayout from '~/components/Auth/AuthLayout';
import { TranslationKeys, useLocalize } from '~/hooks';

const headerMap: Record<string, TranslationKeys> = {
  '/login': 'com_auth_welcome_back',
  '/register': 'com_auth_create_account',
  '/forgot-password': 'com_auth_reset_password',
  '/reset-password': 'com_auth_reset_password',
  '/login/2fa': 'com_auth_verify_your_identity',
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
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (isAuthenticated) {
      // If a redirect_to param or stored redirect exists, navigate there after login page mounts
      const encoded = searchParams.get('redirect_to');
      const urlRedirect = encoded ? decodeURIComponent(encoded) : null;
      const storedRedirect = sessionStorage.getItem('post_login_redirect_to');

      const finalRedirect = urlRedirect || storedRedirect;
      if (finalRedirect) {
        if (storedRedirect) sessionStorage.removeItem('post_login_redirect_to');
        // Clean the query param from URL
        if (encoded) {
          const params = new URLSearchParams(searchParams);
          params.delete('redirect_to');
          setSearchParams(params, { replace: true });
        }
        navigate(finalRedirect, { replace: true });
        return;
      }
      navigate('/c/new', { replace: true });
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data, searchParams, setSearchParams]);

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
