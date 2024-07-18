import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '~/components/ui';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import { useDeleteUserMutation } from '~/data-provider';
import { Spinner, LockIcon } from '~/components/svg';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import DangerButton from '../DangerButton';

const DeleteAccount = ({ disabled = false }: { title?: string; disabled?: boolean }) => {
  const localize = useLocalize();
  const { user, logout } = useAuthContext();
  const { mutate: deleteUser, isLoading: isDeleting } = useDeleteUserMutation({
    onMutate: () => logout(),
  });

  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [isLocked, setIsLocked] = useState(true);

  const onClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleDeleteUser = () => {
    if (!isLocked) {
      deleteUser(undefined);
    }
  };

  const handleInputChange = useCallback(
    (newEmailInput: string, newDeleteInput: string) => {
      const isEmailCorrect =
        newEmailInput.trim().toLowerCase() === user?.email?.trim().toLowerCase();
      const isDeleteInputCorrect = newDeleteInput === 'DELETE';
      setIsLocked(!(isEmailCorrect && isDeleteInputCorrect));
    },
    [user?.email],
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <span>{localize('com_nav_delete_account')}</span>
        <label>
          <DangerButton
            id={'delete-user-account'}
            disabled={disabled}
            onClick={onClick}
            actionTextCode="com_ui_delete"
            className={cn(
              'btn relative border-none bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-700',
            )}
            confirmClear={false}
            infoTextCode={''}
            dataTestIdInitial={''}
            dataTestIdConfirm={''}
          />
        </label>
      </div>
      <Dialog open={isDialogOpen} onOpenChange={() => setDialogOpen(false)}>
        <DialogContent
          className={cn('shadow-2xl md:h-[500px] md:w-[450px]')}
          style={{ borderRadius: '12px', padding: '20px' }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-medium leading-6">
              {localize('com_nav_delete_account_confirm')}
            </DialogTitle>
          </DialogHeader>
          <div className="mb-20 text-sm text-black dark:text-white">
            <ul>
              <li>{localize('com_nav_delete_warning')}</li>
              <li>{localize('com_nav_delete_data_info')}</li>
            </ul>
          </div>
          <div className="flex-col items-center justify-center">
            <div className="mb-4">
              {renderInput(
                localize('com_nav_delete_account_email_placeholder'),
                'email-confirm-input',
                user?.email || '',
                (e) => {
                  setEmailInput(e.target.value);
                  handleInputChange(e.target.value, deleteInput);
                },
              )}
            </div>
            <div className="mb-4">
              {renderInput(
                localize('com_nav_delete_account_confirm_placeholder'),
                'delete-confirm-input',
                '',
                (e) => {
                  setDeleteInput(e.target.value);
                  handleInputChange(emailInput, e.target.value);
                },
              )}
            </div>
            {renderDeleteButton(handleDeleteUser, isDeleting, isLocked, localize)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const renderInput = (
  label: string,
  id: string,
  value: string,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
) => (
  <div className="mb-4">
    <label className="mb-1 block text-sm font-medium text-black dark:text-white">{label}</label>
    <Input
      id={id}
      onChange={onChange}
      placeholder={value}
      className={cn(
        defaultTextProps,
        'h-10 max-h-10 w-full max-w-full rounded-md bg-white px-3 py-2',
        removeFocusOutlines,
      )}
    />
  </div>
);

const renderDeleteButton = (
  handleDeleteUser: () => void,
  isDeleting: boolean,
  isLocked: boolean,
  localize: (key: string) => string,
) => (
  <button
    className={cn(
      'mt-4 flex w-full items-center justify-center rounded-lg px-4 py-2 transition-colors duration-200',
      isLocked
        ? 'cursor-not-allowed bg-gray-200 text-gray-300 dark:bg-gray-500 dark:text-gray-600'
        : isDeleting
          ? 'cursor-not-allowed bg-gray-100 text-gray-700 dark:bg-gray-400 dark:text-gray-700'
          : 'bg-red-700 text-white hover:bg-red-800 ',
    )}
    onClick={handleDeleteUser}
    disabled={isDeleting || isLocked}
  >
    {isDeleting ? (
      <div className="flex h-6 justify-center">
        <Spinner className="icon-sm m-auto" />
      </div>
    ) : (
      <>
        {isLocked ? (
          <>
            <LockIcon />
            <span className="ml-2">{localize('com_ui_locked')}</span>
          </>
        ) : (
          <>
            <LockIcon />
            <span className="ml-2">{localize('com_nav_delete_account_button')}</span>
          </>
        )}
      </>
    )}
  </button>
);

export default DeleteAccount;
