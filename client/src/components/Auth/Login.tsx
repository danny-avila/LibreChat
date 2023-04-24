import {useForm} from 'react-hook-form';
import {TLoginUser} from '~/data-provider';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faFacebook} from '@fortawesome/free-brands-svg-icons';
import {faGoogle} from '@fortawesome/free-brands-svg-icons';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';

function Login() {
  const { login, error, isAuthenticated } = useAuthContext();
  const {
    register,
    handleSubmit,
    formState: {errors}
  } = useForm<TLoginUser>();

  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate('/chat/new');
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden">
      <div className="m-auto w-1/2 rounded-md bg-white p-6 shadow-xl lg:max-w-xl">
        <h1 className="text-center text-3xl font-semibold uppercase text-indigo-700 mb-4">Sign in</h1>
        <p className="text-center text-sm text-gray-500">Please enter your login credentials to continue.</p>
        {error && (
          <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            Unable to login with the information provided. Please check your credentials and try again.
          </div>
        )}
        <form className="mt-6"
          aria-label="Login form"
          method="POST"
          onSubmit={handleSubmit(data => login(data))}>
          <div className="mb-2">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-gray-800"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              aria-label="Email"
              {...register('email', {
                required: 'Email is required',
                minLength: {
                  value: 3,
                  message: 'Email must be at least 6 characters'
                },
                maxLength: {
                  value: 120,
                  message: 'Email should not be longer than 120 characters'
                },
                pattern: {
                  value: /\S+@\S+\.\S+/,
                  message: 'You must enter a valid email address'
                }
              })}
              aria-invalid={!!errors.email}
              className="mt-2 block w-full rounded-md border bg-white px-4 py-2 text-indigo-700 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-300 focus:ring-opacity-40"
            />
            {errors.email && (
              <span
                role="alert"
                className="mt-1 text-sm text-red-600"
              >
                {/* @ts-ignore */}
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-gray-800"
            >
              Password
            </label>
            <input
              type="password"
               id="password"
              aria-label="Password"
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters'
                },
                maxLength: {
                  value: 40,
                  message: 'Password must be less than 40 characters'
                }
              })}
              aria-invalid={!!errors.password}
              className="mt-2 block w-full rounded-md border bg-white px-4 py-2 text-indigo-700 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-300 focus:ring-opacity-40"
            />
            {errors.password && (
              <span
                role="alert"
                className="mt-1 text-sm text-red-600"
              >
                {/* @ts-ignore */}
                {errors.password.message}
              </span>
            )}
          </div>
          {/* <a
            href="#"
            className="text-xs text-indigo-600 hover:underline"
          >
            Forgot Password?
          </a> */}
          <div className="mt-6">
            <button 
              type="submit" 
              className="w-full transform rounded-md bg-indigo-700 px-4 py-2 tracking-wide text-white transition-colors duration-200 hover:bg-indigo-600 focus:bg-indigo-600 focus:outline-none">
              Login
            </button>
          </div>
        </form>
        <div className="relative mt-6 flex w-full items-center justify-center border border-t">
          <div className="absolute bg-white px-5">Or</div>
        </div>
        <div className="mt-4 flex gap-x-2">
          <button
            aria-label="Login with Google"
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-gray-600 p-2 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
          >
           <FontAwesomeIcon
              icon={faGoogle}
              size={'lg'}
            />
          </button>
          <button 
            type="button"
            aria-label="Login with Facebook"
            className="flex w-full items-center justify-center rounded-md border border-gray-600 p-2 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1">
            <FontAwesomeIcon
              icon={faFacebook} 
              size={'lg'}
            />
          </button>
        </div>

        <p className="mt-8 text-center text-xs font-light text-gray-700">
          {' '}
          Don't have an account?{' '}
          <a
            href="/register"
            className="font-medium text-indigo-600 hover:underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;
