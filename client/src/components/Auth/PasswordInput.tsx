import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { UseFormRegisterReturn, FieldError } from 'react-hook-form';
import { useLocalize } from '~/hooks';

interface PasswordInputProps {
  id: string;
  label: string;
  register: UseFormRegisterReturn;
  error?: FieldError;
  autoComplete?: string;
  'data-testid'?: string;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  register,
  error,
  autoComplete = 'current-password',
  'data-testid': dataTestId,
}) => {
  const localize = useLocalize();
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="mb-2">
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          id={id}
          autoComplete={autoComplete}
          aria-label={label}
          {...register}
          aria-invalid={!!error}
          className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary pb-2.5 pe-10 ps-3.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
          placeholder=" "
          data-testid={dataTestId}
        />
        <label
          htmlFor={id}
          className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
        >
          {label}
        </label>
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-text-primary"
          aria-label={localize(showPassword ? 'com_ui_hide_password' : 'com_ui_show_password')}
        >
          {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {error && (
        <span role="alert" className="mt-1 text-sm text-red-600 dark:text-red-500">
          {String(error.message)}
        </span>
      )}
    </div>
  );
};

export default PasswordInput;
