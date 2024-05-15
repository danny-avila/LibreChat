import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';

import { useAuthContext } from '~/hooks/AuthContext';

import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import { TStartupConfig } from 'librechat-data-provider';
import AuthLayout from './AuthLayout';
import { ErrorMessage } from './ErrorMessage';

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const {
    data,
    isFetching,
    error: startupConfigError,
  } = useGetStartupConfig({
    enabled: startupConfig === null,
  });
  const localize = useLocalize();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data]);

  const loginFormRender = startupConfig?.emailLoginEnabled && <LoginForm onSubmit={login} />;
  const registrationRender = startupConfig?.registrationEnabled && (
    <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
      {' '}
      {localize('com_auth_no_account')}{' '}
      <a href="/register" className="p-1 text-green-500">
        {localize('com_auth_sign_up')}
      </a>
    </p>
  );

  return (
    <AuthLayout
      header={localize('com_auth_login')}
      isFetching={isFetching}
      startupConfig={startupConfig}
      startupConfigError={startupConfigError}
    >
      {error && <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>}
      {loginFormRender}
      {registrationRender}
    </AuthLayout>
  );
}

export default Login;
