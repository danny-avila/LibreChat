import { useForm } from 'react-hook-form';
import { TLoginUser } from '~/data-provider';

type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
};

function LoginForm({ onSubmit }: TLoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<TLoginUser>();

  return (
    <form
      className="mt-6"
      aria-label="Login form"
      method="POST"
      onSubmit={handleSubmit((data) => onSubmit(data))}
    >
      <div className="mb-2">
        <div className="relative">
          <input
            type="text"
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
            className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
          >
            Email address
          </label>
        </div>
        {errors.email && (
          <span role="alert" className="mt-1 text-sm text-red-600">
            {/* @ts-ignore not sure why*/}
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="mb-2">
        <div className="relative">
          <input
            type="password"
            id="password"
            autoComplete="current-password"
            aria-label="Password"
            {...register('password', {
              required: 'Password is required',
              minLength: {
                value: 8,
                message: 'Password must be at least 8 characters'
              },
              maxLength: {
                value: 40,
                message: 'Password must be less than 128 characters'
              }
            })}
            aria-invalid={!!errors.password}
            className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
            placeholder=" "
          ></input>
          <label
            htmlFor="password"
            className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
          >
            Password
          </label>
        </div>

        {errors.password && (
          <span role="alert" className="mt-1 text-sm text-red-600">
            {/* @ts-ignore not sure why*/}
            {errors.password.message}
          </span>
        )}
      </div>
      <a href="/forgot-password" className="text-sm text-green-500 hover:underline">
        Forgot Password?
      </a>
      <div className="mt-6">
        <button
          aria-label="Sign in"
          type="submit"
          className="w-full transform rounded-sm bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
        >
          Continue
        </button>
      </div>
    </form>
  );
}

export default LoginForm;
