import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  useRegisterUserMutation,
  TRegisterUser,
  useGetStartupConfig
} from '@librechat/data-provider';
import { GoogleIcon, GithubIcon, DiscordIcon /* ...rest */ } from '~/components'

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
        //@ts-ignore - error is of type unknown
        if (error.response?.data?.message) {
          //@ts-ignore - error is of type unknown
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
        {startupConfig?.socialLoginEnabled && (
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>
        )}
        {startupConfig?.googleLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Google"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/github`}> 
                <GoogleIcon />
                <p>Login with Google</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.openidLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

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
        {startupConfig?.githubLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with GitHub"

                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/github`}> 
                <GithubIcon />
                <p>Login with Github</p>
              </a>
            </div>
          </>
        )}
        {startupConfig?.discordLoginEnabled && startupConfig?.socialLoginEnabled && (
          <>

            <div className="mt-4 flex gap-x-2">
              <a
                aria-label="Login with Discord"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/discord`}> 
                  <DiscordIcon />
                  <p>Login with Discord</p>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Registration;
