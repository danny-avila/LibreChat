import { useOutletContext } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import LoginForm from './LoginForm';
import { isMiniWechat } from '~/utils/wechat';
import { Button } from '../ui';
import { useState } from 'react';

function Login() {
  const localize = useLocalize();
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();

  const [showAccountLogin, setShowAccountLogin] = useState(false);
  const isInMiniWechat = isMiniWechat();

  return (
    <>
      {error && <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>}

      {
        isInMiniWechat && !showAccountLogin ? <div>
          <button
            aria-label="Sign in"
            data-testid="login-button"
            type="submit"
            className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
          >
            微信授权登录
          </button>
          <button
            aria-label="Sign in"
            data-testid="login-button"
            type="submit"
            onClick={() => {
              setShowAccountLogin(true);
            }}
            className="w-full mt-5 transform rounded-md bg-gray-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-gray-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
          >
            账号密码登录
          </button>
        </div> :
          <>
            {(!isInMiniWechat || showAccountLogin) && startupConfig?.emailLoginEnabled && (
              <LoginForm
                onSubmit={login}
                startupConfig={startupConfig}
                error={error}
                setError={setError}
              />
            )}
          </>
      }

      {startupConfig?.registrationEnabled && (
        <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
          {' '}
          {localize('com_auth_no_account')}{' '}
          <a href="/register" className="p-1 text-green-500">
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}

    </>
  );
}

export default Login;
