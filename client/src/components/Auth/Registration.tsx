import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useRegisterUserMutation, TRegisterUser, useGetStartupConfig } from '~/data-provider';

function Registration() {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors }
  } = useForm<TRegisterUser>({ mode: 'onChange' });

  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const registerUser = useRegisterUserMutation();

  const password = watch('password');

  const onRegisterUserFormSubmit = (data: TRegisterUser) => {
    registerUser.mutate(data, {
      onSuccess: () => {
        navigate('/chat/new');
      },
      onError: (error) => {
        setError(true);
        if (error.response?.data?.message) {
          setErrorMessage(error.response?.data?.message);
        }
      }
    });
  };

  useEffect(() => {
    if (startupConfig?.registrationEnabled === false) {
      navigate('/login');
    }
  }, [startupConfig, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl font-semibold">Create your account</h1>
        {error && (
          <div
            className="relative mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
            role="alert"
          >
            There was an error attempting to register your account. Please try again. {errorMessage}
          </div>
        )}
        <form
          className="mt-6"
          aria-label="Registration form"
          method="POST"
          onSubmit={handleSubmit((data) => onRegisterUserFormSubmit(data))}
        >
          <div className="mb-2">
            <div className="relative">
              <input
                id="name"
                type="text"
                autoComplete="name"
                aria-label="Full name"
                {...register('name', {
                  required: 'Name is required',
                  minLength: {
                    value: 3,
                    message: 'Name must be at least 3 characters'
                  },
                  maxLength: {
                    value: 80,
                    message: 'Name must be less than 80 characters'
                  }
                })}
                aria-invalid={!!errors.name}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="name"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                Full name
              </label>
            </div>

            {errors.name && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore not sure why*/}
                {errors.name.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type="text"
                id="username"
                aria-label="Username"
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 3,
                    message: 'Username must be at least 3 characters'
                  },
                  maxLength: {
                    value: 20,
                    message: 'Username must be less than 20 characters'
                  }
                })}
                aria-invalid={!!errors.username}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
                autoComplete="off"
              ></input>
              <label
                htmlFor="username"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                Username
              </label>
            </div>

            {errors.username && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore not sure why */}
                {errors.username.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type="email"
                id="email"
                autoComplete="email"
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
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="email"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                Email
              </label>
            </div>
            {errors.email && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore - Type 'string | FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined' is not assignable to type 'ReactNode' */}
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type="password"
                id="password"
                data-testid="password"
                autoComplete="current-password"
                aria-label="Password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters'
                  },
                  maxLength: {
                    value: 128,
                    message: 'Password must be 128 characters or less'
                  }
                })}
                aria-invalid={!!errors.password}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="password"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                Password
              </label>
            </div>

            {errors.password && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore not sure why */}
                {errors.password.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type="password"
                id="confirm_password"
                data-testid="confirm_password"
                aria-label="Confirm password"
                // uncomment to block pasting in confirm field
                // onPaste={(e) => {
                //   e.preventDefault();
                //   return false;
                // }}
                {...register('confirm_password', {
                  validate: (value) => value === password || 'Passwords do not match'
                })}
                aria-invalid={!!errors.confirm_password}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="confirm_password"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                Confirm password
              </label>
            </div>

            {errors.confirm_password && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore not sure why */}
                {errors.confirm_password.message}
              </span>
            )}
          </div>
          <div className="mt-6">
            <button
              disabled={
                !!errors.email ||
                !!errors.name ||
                !!errors.password ||
                !!errors.username ||
                !!errors.confirm_password
              }
              type="submit"
              aria-label="Submit registration"
              className="w-full transform rounded-sm bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-500"
            >
              Continue
            </button>
          </div>
        </form>
        <p className="my-4 text-center text-sm font-light text-gray-700">
          {' '}
          Already have an account?{' '}
          <a
            href="/login"
            aria-label="Login"
            className="p-1 font-medium text-green-500 hover:underline"
          >
            Login
          </a>
        </p>
        {startupConfig?.googleLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Google"
                href={`${startupConfig.serverDomain}/oauth/google`}
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 512 512"
                  id="google"
                  className="h-5 w-5"
                >
                  <path
                    fill="#fbbb00"
                    d="M113.47 309.408 95.648 375.94l-65.139 1.378C11.042 341.211 0 299.9 0 256c0-42.451 10.324-82.483 28.624-117.732h.014L86.63 148.9l25.404 57.644c-5.317 15.501-8.215 32.141-8.215 49.456.002 18.792 3.406 36.797 9.651 53.408z"
                  ></path>
                  <path
                    fill="#518ef8"
                    d="M507.527 208.176C510.467 223.662 512 239.655 512 256c0 18.328-1.927 36.206-5.598 53.451-12.462 58.683-45.025 109.925-90.134 146.187l-.014-.014-73.044-3.727-10.338-64.535c29.932-17.554 53.324-45.025 65.646-77.911h-136.89V208.176h245.899z"
                  ></path>
                  <path
                    fill="#28b446"
                    d="m416.253 455.624.014.014C372.396 490.901 316.666 512 256 512c-97.491 0-182.252-54.491-225.491-134.681l82.961-67.91c21.619 57.698 77.278 98.771 142.53 98.771 28.047 0 54.323-7.582 76.87-20.818l83.383 68.262z"
                  ></path>
                  <path
                    fill="#f14336"
                    d="m419.404 58.936-82.933 67.896C313.136 112.246 285.552 103.82 256 103.82c-66.729 0-123.429 42.957-143.965 102.724l-83.397-68.276h-.014C71.23 56.123 157.06 0 256 0c62.115 0 119.068 22.126 163.404 58.936z"
                  ></path>
                </svg>
                <p>Login with Google</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.openidLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>
            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with OpenID"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/openid`}
              >
                {startupConfig.openidImageUrl ? (
                  <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 512"
                    id="openid"
                    className="h-5 w-5"
                  >
                    <path d="M271.5 432l-68 32C88.5 453.7 0 392.5 0 318.2c0-71.5 82.5-131 191.7-144.3v43c-71.5 12.5-124 53-124 101.3 0 51 58.5 93.3 135.7 103v-340l68-33.2v384zM448 291l-131.3-28.5 36.8-20.7c-19.5-11.5-43.5-20-70-24.8v-43c46.2 5.5 87.7 19.5 120.3 39.3l35-19.8L448 291z"></path>
                  </svg>
                )}
                <p>{startupConfig.openidLabel}</p>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Registration;
