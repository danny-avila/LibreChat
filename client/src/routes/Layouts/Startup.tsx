import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import AuthLayout from '~/components/Auth/AuthLayout';
import { useLocalize } from '~/hooks';

const headerMap = {
  '/login': 'com_auth_login',
  '/register': 'com_auth_create_account',
  '/forgot-password': 'com_auth_forgot_password',
  '/reset-password': 'com_auth_reset_password',
};

export default function StartupLayout({ isAuthenticated }: { isAuthenticated?: boolean }) {
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

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data]);

  useEffect(() => {
    document.title = startupConfig?.appTitle || 'LibreChat';
  }, [startupConfig?.appTitle]);

  const contextValue = {
    startupConfig,
    startupConfigError,
    isFetching,
  };

  return (
    <AuthLayout
      header={localize(headerMap[location.pathname])}
      isFetching={isFetching}
      startupConfig={startupConfig}
      startupConfigError={startupConfigError}
    >
      <Outlet context={contextValue} />
    </AuthLayout>
  );
}
