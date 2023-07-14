import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import {
  useRegisterUserMutation,
  TRegisterUser,
  useGetStartupConfig
} from '@librechat/data-provider';
import { GoogleIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components'

function Registration() {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();

  const lang = useRecoilValue(store.lang);

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
      <img src="/assets/logo-no-background.png" alt="GPTChina.io" className="h-16 w-auto mb-6" />
      <p className="mb-4 text-center text-lg px-5">
        Your one stop solution for AI in China.
      </p>
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
        <h1 className="mb-4 text-center text-3xl">Create your account</h1>
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
                aria-label={localize(lang, 'com_auth_full_name')}
                {...register('name', {
                  required: localize(lang, 'com_auth_name_required'),
                  minLength: {
                    value: 3,
                    message: localize(lang, 'com_auth_name_min_length')
                  },
                  maxLength: {
                    value: 80,
                    message: localize(lang, 'com_auth_name_max_length')
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
                {localize(lang, 'com_auth_full_name')}
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
                aria-label={localize(lang, 'com_auth_username')}
                {...register('username', {
                  required: localize(lang, 'com_auth_username_required'),
                  minLength: {
                    value: 3,
                    message: localize(lang, 'com_auth_username_min_length')
                  },
                  maxLength: {
                    value: 20,
                    message: localize(lang, 'com_auth_username_max_length')
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
                {localize(lang, 'com_auth_username')}
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
                aria-label={localize(lang, 'com_auth_email')}
                {...register('email', {
                  required: localize(lang, 'com_auth_email_required'),
                  minLength: {
                    value: 3,
                    message: localize(lang, 'com_auth_email_min_length')
                  },
                  maxLength: {
                    value: 120,
                    message: localize(lang, 'com_auth_email_max_length')
                  },
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: localize(lang, 'com_auth_email_pattern')
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
                {localize(lang, 'com_auth_email')}
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
                aria-label={localize(lang, 'com_auth_password')}
                {...register('password', {
                  required: localize(lang, 'com_auth_password_required'),
                  minLength: {
                    value: 8,
                    message: localize(lang, 'com_auth_password_min_length')
                  },
                  maxLength: {
                    value: 128,
                    message: localize(lang, 'com_auth_password_max_length')
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
                {localize(lang, 'com_auth_password')}
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
                aria-label={localize(lang, 'com_auth_password_confirm')}
                // uncomment to block pasting in confirm field
                // onPaste={(e) => {
                //   e.preventDefault();
                //   return false;
                // }}
                {...register('confirm_password', {
                  validate: (value) => value === password || localize(lang, 'com_auth_password_not_match')
                })}
                aria-invalid={!!errors.confirm_password}
                className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
                placeholder=" "
              ></input>
              <label
                htmlFor="confirm_password"
                className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-sm text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
              >
                {localize(lang, 'com_auth_password_confirm')}
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
              {localize(lang, 'com_auth_continue')}
            </button>
          </div>
        </form>
        <p className="my-4 text-center text-sm font-light text-gray-700">
          {' '}
          {localize(lang, 'com_auth_already_have_account')}{' '}
          <a
            href="/login"
            aria-label="Login"
            className="p-1 font-medium text-green-500 hover:underline"
          >
            {localize(lang, 'com_auth_login')}
          </a>
        </p>
        {startupConfig?.socialLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t uppercase">
              <div className="absolute bg-white px-3 text-xs">Or</div>
            </div>

            {startupConfig?.googleLoginEnabled && (
              <div className="mt-4 flex gap-x-2">
                <a
                  aria-label="Login with Google"
                  className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                  href={`${startupConfig.serverDomain}/oauth/google`}>
                  <GoogleIcon />
                  <p>{localize(lang, 'com_auth_google_login')}</p>
                </a>
              </div>
            )}
            {startupConfig?.openidLoginEnabled && (
              <div className="mt-4 flex gap-x-2">
                <a
                  aria-label="Login with OpenID"
                  className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                  href={`${startupConfig.serverDomain}/oauth/openid`}
                >
                  {startupConfig.openidImageUrl ? (
                    <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
                  ) : (
                    <OpenIDIcon />
                  )}
                  <p>{startupConfig.openidLabel}</p>
                </a>
              </div>
            )}
            {startupConfig?.githubLoginEnabled && (
              <div className="mt-4 flex gap-x-2">
                <a
                  aria-label="Login with GitHub"
                  className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                  href={`${startupConfig.serverDomain}/oauth/github`}>
                  <GithubIcon />
                  <p>Login with Github</p>
                </a>
              </div>
            )}
            {startupConfig?.discordLoginEnabled && (
              <div className="mt-4 flex gap-x-2">
                <a
                  aria-label="Login with Discord"
                  className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                  href={`${startupConfig.serverDomain}/oauth/discord`}>
                  <DiscordIcon />
                  <p>Login with Discord</p>
                </a>
              </div>
            )}
          </>
        )}
      </div>
      <a href="/terms" className="p-1 text-green-500 hover:underline">
        Terms & Conditions
      </a>

      <a href="/privacy" className="p-1 text-green-500 hover:underline">
        Privacy Policy
      </a> 
    </div>
  );
}

export default Registration;
