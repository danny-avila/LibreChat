import { useEffect } from 'react';
import LoginForm from './LoginForm';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '@librechat/data-provider';

function Login({loginRedirect}: {loginRedirect: string}) {
  const { login, error, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(loginRedirect);
    }
  }, [isAuthenticated, navigate, loginRedirect]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">Welcome back</h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            Unable to login with the information provided. Please check your credentials and try
            again.
          </div>
        )}
        <LoginForm onSubmit={login} />
        {startupConfig?.registrationEnabled && (
          <p className="my-4 text-center text-sm font-light text-gray-700">
            {' '}
            Don&apos;t have an account?{' '}
            <a href="/register" className="p-1 text-green-500 hover:underline">
              Sign up
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
