import { useForm } from 'react-hook-form';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { TLoginUser } from '@librechat/data-provider';

type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
};

function LoginForm({ onSubmit }: TLoginFormProps) {
  const lang = useRecoilValue(store.lang);

  const {
    register,
    handleSubmit,
    formState: { errors },
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
            aria-label={localize(lang, 'com_auth_email')}
            {...register('email', {
              required: localize(lang, 'com_auth_email_required'),
              minLength: {
                value: 3,
                message: localize(lang, 'com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize(lang, 'com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize(lang, 'com_auth_email_pattern'),
              },
            })}
            aria-invalid={!!errors.email}
            className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
            placeholder=" "
          ></input>
          <label
            htmlFor="email"
            className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
          >
            {localize(lang, 'com_auth_email_address')}
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
            aria-label={localize(lang, 'com_auth_password')}
            {...register('password', {
              required: localize(lang, 'com_auth_password_required'),
              minLength: {
                value: 8,
                message: localize(lang, 'com_auth_password_min_length'),
              },
              maxLength: {
                value: 40,
                message: localize(lang, 'com_auth_password_max_length'),
              },
            })}
            aria-invalid={!!errors.password}
            className="peer block w-full appearance-none rounded-t-md border-0 border-b-2 border-gray-300 bg-gray-50 px-2.5 pb-2.5 pt-5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0"
            placeholder=" "
          ></input>
          <label
            htmlFor="password"
            className="absolute left-2.5 top-4 z-10 origin-[0] -translate-y-4 scale-75 transform text-gray-500 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-green-500"
          >
            {localize(lang, 'com_auth_password')}
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
        {localize(lang, 'com_auth_password_forgot')}
      </a>
      <div className="mt-6">
        <button
          aria-label="Sign in"
          type="submit"
          className="w-full transform rounded-sm bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
        >
          {localize(lang, 'com_auth_continue')}
        </button>
      </div>
    </form>
  );
}

export default LoginForm;
