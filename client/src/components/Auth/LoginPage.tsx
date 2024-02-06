import { ChangeEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { getLoginError } from '~/utils';
import { useLocalize } from '~/hooks';
import PasswordInput from '../Chat/Input/PasswordInput';
import { LoginForm } from '~/types/auth';
import { useLoginVeraUser } from '~/services/mutations/auth';

function Login() {
  const [email, setemail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const { isAuthenticated } = useAuthContext();
  const localize = useLocalize();
  const navigate = useNavigate();
  const loginVeraUserMutation = useLoginVeraUser();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/c/new', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setemail(e.target.value);
  };

  const handlePasswordChange = (newVal: string) => {
    setPassword(newVal);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loginForm: LoginForm = { email: email, password };
    loginVeraUserMutation.mutate(loginForm);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-login-base pt-6 sm:pt-0">
      <div className="w-authPageWidth overflow-hidden bg-white px-8 py-10 shadow-xl sm:max-w-lg sm:rounded-lg">
        <img src="/assets/vera-logo-color.svg" className="m-auto mb-8 h-16 w-auto" />
        <h1 className="mb-4 text-center text-xl font-semibold">
          {localize('com_auth_log_in_to_your_account')}
        </h1>

        <div className="mb-4">
          <label className="text-md mb-2 block text-gray-700" htmlFor="email">
            Email
          </label>
          <input
            className="block w-full rounded-md border border-gray-100 py-2 pl-3 pr-10 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            id="email"
            type="email"
            onChange={handleEmailChange}
            value={email}
          />
        </div>

        <div className="mb-8">
          <PasswordInput onChange={handlePasswordChange} value={password} />
        </div>

        {/* <p className="text-red-500 text-xs italic">Please choose a password.</p> */}
        <button
          onClick={handleSubmit}
          aria-label={localize('com_auth_sign_in')}
          className={`w-full transform rounded-md bg-vteal px-4 py-2 tracking-wide text-white transition-all duration-300 hover:opacity-40 focus:opacity-40 focus:outline-none ${
            loginVeraUserMutation.isPending ? 'cursor-not-allowed opacity-40' : ''
          }`}
          disabled={loginVeraUserMutation.isPending} // Disable the button while loading
        >
          {loginVeraUserMutation.isPending ? 'Loading...' : localize('com_auth_sign_in')}
        </button>
      </div>
      {/* <p>insert vera auth token</p>
      <input style={{ background: 'cyan' }} onChange={(e) => setPk(e.target.value)}></input>
      <button
        className="ml-2 border"
        onClick={(e) => {
          console.log(pk);
          loginVera(pk);
        }}
      >
        {' '}
        Submit
      </button> */}
    </div>
  );
}

export default Login;
