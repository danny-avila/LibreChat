import React, { useState, useEffect } from 'react';
import { useCreateUserMutation } from 'librechat-data-provider/react-query';
import {
  OGDialog,
  Input,
} from '~/components/ui';
import { useForm } from 'react-hook-form';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import type { TUser } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';
import type { TRegisterUser } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { Spinner } from '~/components/svg';

type CreatUserProps = {
  showDialog?: boolean;
  setShowDialog?: (value: boolean) => void;
  onConfirm: () => void;
};

export default function CreatUser({
  showDialog,
  setShowDialog,
  onConfirm,
}: CreatUserProps) {

  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [loading, setLoading] = useState(false);

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const createUser = useCreateUserMutation({
    onMutate: () => {
      setLoading(true);
    },
    onSuccess: () => {
      showToast({ message: '创建用户成功！' });
      setLoading(false);
      onConfirm();
      setShowDialog && setShowDialog(false);
    },
    onError: (error: unknown) => {
      showToast({ message: '创建用户失败！', status: 'error' });
      setLoading(false);
      onConfirm();
    },
  });

  const handleConfirm = (data: TRegisterUser) => {
    console.log('确认创建新用户', data);
    return createUser.mutate({ ...data });
  };

  const renderInput = (id: string, label: string, type: string, validation: object) => (
    <div className="mb-2">
      <div className="relative">
        <input
          id={id}
          type={type}
          autoComplete={id}
          aria-label={localize(label)}
          {...register(
            id as 'name' | 'email' | 'username' | 'password' | 'confirm_password',
            validation,
          )}
          aria-invalid={!!errors[id]}
          className="webkit-dark-styles peer block w-full appearance-none rounded-md border border-gray-300 bg-transparent px-3.5 pb-3.5 pt-4 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-0 dark:border-gray-600 dark:text-white dark:focus:border-green-500"
          placeholder=" "
          data-testid={id}
        />
        <label
          htmlFor={id}
          className="absolute start-1 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-3 text-sm text-gray-500 duration-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-3 peer-focus:text-green-600 dark:bg-gray-900 dark:text-gray-400 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
        >
          {localize(label)}
        </label>
      </div>
      {errors[id] && (
        <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
          {String(errors[id]?.message) ?? ''}
        </span>
      )}
    </div>
  );

  const dialogContent = (
    <OGDialogTemplate
      showCloseButton={true}
      showCancelButton={false}
      title='创建新用户'
      className="z-[1000] max-w-[650px]"
      main={
        <>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <form
                className="mt-6"
                method="POST"
                onSubmit={handleSubmit(handleConfirm)}
              >
                {renderInput('name', 'com_auth_full_name', 'text', {
                  required: localize('com_auth_name_required'),
                  minLength: {
                    value: 3,
                    message: localize('com_auth_name_min_length'),
                  },
                  maxLength: {
                    value: 80,
                    message: localize('com_auth_name_max_length'),
                  },
                })}
                {renderInput('username', 'com_auth_username', 'text', {
                  minLength: {
                    value: 2,
                    message: localize('com_auth_username_min_length'),
                  },
                  maxLength: {
                    value: 80,
                    message: localize('com_auth_username_max_length'),
                  },
                })}
                {renderInput('email', 'com_auth_email', 'email', {
                  required: localize('com_auth_email_required'),
                  minLength: {
                    value: 1,
                    message: localize('com_auth_email_min_length'),
                  },
                  maxLength: {
                    value: 120,
                    message: localize('com_auth_email_max_length'),
                  },
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: localize('com_auth_email_pattern'),
                  },
                })}
                {renderInput('password', 'com_auth_password', 'password', {
                  required: localize('com_auth_password_required'),
                  minLength: {
                    value: 8,
                    message: localize('com_auth_password_min_length'),
                  },
                  maxLength: {
                    value: 128,
                    message: localize('com_auth_password_max_length'),
                  },
                })}
                {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
                  validate: (value: string) =>
                    value === password || localize('com_auth_password_not_match'),
                })}
                <div className="mt-6">
                  <button
                    disabled={Object.keys(errors).length > 0}
                    type="submit"
                    aria-label="Submit registration"
                    className="w-full transform rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
                  >
                    {loading ? <Spinner /> : '确 认'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      }
    />
  );

  return (
    <OGDialog open={showDialog} onOpenChange={setShowDialog}>
      {dialogContent}
    </OGDialog>
  );
}
