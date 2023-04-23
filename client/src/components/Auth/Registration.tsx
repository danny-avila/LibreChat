import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useRegisterUserMutation, TRegisterUser } from '~/data-provider';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faFacebook} from '@fortawesome/free-brands-svg-icons';
import {faGoogle} from '@fortawesome/free-brands-svg-icons';


function Registration() {
  const navigate = useNavigate();
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors }
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const [error, setError] = useState(false);
  const registerUser = useRegisterUserMutation();

  const password = watch('password');

  const onRegisterUserFormSubmit = (data: TRegisterUser) => {
    registerUser.mutate(data, {
      onSuccess: () => {
        navigate('/login');
      },
      onError: () => {
        setError(true);
      }
    });
  };

  return (
    <div>
      <div className="flex min-h-screen flex-col items-center pt-6 sm:justify-center sm:pt-0">
        <div className="mt-6 w-full overflow-hidden bg-white px-6 py-4 shadow-md sm:max-w-lg sm:rounded-lg">
          <h1 className="mb-4 text-center text-3xl font-semibold uppercase text-indigo-700">
            Register Account
          </h1>
          <p className="mb-4 text-center text-sm text-gray-500">
            Complete the form below to create a new account.
          </p>
          {error && (
            <div
              className="relative mb-5 mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
              role="alert"
            >
              There was an error attempting to register your account. Please try again.
            </div>
          )}
          <form
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit(data => onRegisterUserFormSubmit(data))}
          >
            <div>
              <label
                htmlFor="name"
                className="undefined block text-sm font-medium text-gray-700"
              >
                Name
              </label>
              <div className="flex flex-col items-start">
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  aria-label="Name"
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm invalid:border-red-600 focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
                {errors.name && (
                  <span
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {/* @ts-ignore */}
                    {errors.name.message}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label
                htmlFor="username"
                className="undefined block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <div className="flex flex-col items-start">
                <input
                  id="username"
                  type="text"
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm invalid:ring-red-600 focus:border-indigo-300 focus:ring focus:ring-indigo-200"
                  aria-invalid={!!errors.username}
                />
                {errors.username && (
                  <span
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {/* @ts-ignore */}
                    {errors.username.message}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label
                htmlFor="email"
                className="undefined block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <div className="flex flex-col items-start">
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm invalid:ring-red-600 focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                  aria-invalid={!!errors.email}
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
            </div>
            <div className="mt-4">
              <label
                htmlFor="password"
                className="undefined block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="flex flex-col items-start">
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm invalid:ring-red-600 focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
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
            </div>
            <div className="mt-4">
              <label
                htmlFor="confirm_password"
                className="undefined block text-sm font-medium text-gray-700"
              >
                Confirm Password
              </label>
              <div className="flex flex-col items-start">
                <input
                  type="password"
                  id="confirm_password"
                  aria-label="Confirm Password"
                  onPaste={e => {
                    e.preventDefault();
                    return false;
                  }}
                  {...register('confirm_password', {
                    validate: value => value === password || 'Passwords do not match'
                  })}
                  aria-invalid={!!errors.confirm_password}
                  className="invalid:ring-red-500 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
                {errors.confirm_password && (
                  <span
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {/* @ts-ignore */}
                    {errors.confirm_password.message}
                  </span>
                )}
              </div>
            </div>
            <a
              href="#"
              className="text-xs text-indigo-600 hover:underline"
            >
              Forgot Password?
            </a>
            <div className="mt-4 flex items-center">
              <button
                disabled={!!errors.email || !!errors.name || !!errors.password || !!errors.username || !!errors.confirm_password}
                type="submit"
                aria-label="Submit registration"
                className="w-full transform rounded-md disabled:bg-indigo-300 bg-indigo-700 px-4 py-2 tracking-wide text-white transition-colors duration-200 hover:bg-indigo-600 focus:bg-indigo-600 focus:outline-none"
              >
                Register
              </button>
            </div>
          </form>
          <div className="text-grey-600 mt-4">
            Already have an account?{' '}
            <span>
              <a
                className="text-indigo-600 hover:underline"
                href="/login"
              >
                Log in
              </a>
            </span>
          </div>
          <div className="my-4 flex w-full items-center">
            <hr className="w-full" />
            <p className="px-3 ">OR</p>
            <hr className="w-full" />
          </div>
          <div className="my-6 space-y-2">
            <button
              aria-label="Login with Google"
              type="button"
              className="flex w-full items-center justify-center space-x-3 rounded-md border p-2 focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 dark:border-gray-400"
            >
              <FontAwesomeIcon
                icon={faGoogle}
                size={'lg'}
              />
              <p>Login with Google</p>
            </button>
            <button
              aria-label="Login with Facebook"
              role="button"
              className="flex w-full items-center justify-center space-x-3 rounded-md border p-4 focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 dark:border-gray-400"
            >
              <FontAwesomeIcon
                icon={faFacebook} 
                size={'lg'}
              />
              <p>Login with Facebook</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Registration;
