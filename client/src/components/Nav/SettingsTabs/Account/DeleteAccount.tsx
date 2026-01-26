import { LockIcon, Trash } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import {
  Label,
  Input,
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import { useDeleteUserMutation } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { LocalizeFunction } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const DeleteAccount = ({ disabled = false }: { title?: string; disabled?: boolean }) => {
  const localize = useLocalize();
  const { user, logout } = useAuthContext();
  const { mutate: deleteUser, isLoading: isDeleting } = useDeleteUserMutation({
    onMutate: () => logout(),
  });

  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState(true);

  const handleDeleteUser = () => {
    if (!isLocked) {
      deleteUser(undefined);
    }
  };

  const handleInputChange = useCallback(
    (newEmailInput: string) => {
      const isEmailCorrect =
        newEmailInput.trim().toLowerCase() === user?.email.trim().toLowerCase();
      setIsLocked(!isEmailCorrect);
    },
    [user?.email],
  );

  return (
    <>
      <OGDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <div className="flex items-center justify-between">
          <Label id="delete-account-label">{localize('com_nav_delete_account')}</Label>
          <OGDialogTrigger asChild>
            <Button
              aria-labelledby="delete-account-label"
              variant="destructive"
              onClick={() => setDialogOpen(true)}
              disabled={disabled}
            >
              {localize('com_ui_delete')}
            </Button>
          </OGDialogTrigger>
        </div>
        <OGDialogContent className="w-11/12 max-w-md">
          <OGDialogHeader>
            <OGDialogTitle className="text-lg font-medium leading-6">
              {localize('com_nav_delete_account_confirm')}
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="mb-8 text-sm text-black dark:text-white">
            <ul className="font-semibold text-amber-600">
              <li>{localize('com_nav_delete_warning')}</li>
              <li>{localize('com_nav_delete_data_info')}</li>
            </ul>
          </div>
          <div className="flex-col items-center justify-center">
            <div className="mb-4">
              {renderInput(
                localize('com_nav_delete_account_email_placeholder'),
                'email-confirm-input',
                user?.email ?? '',
                (e) => handleInputChange(e.target.value),
              )}
            </div>
            {renderDeleteButton(handleDeleteUser, isDeleting, isLocked, localize)}
          </div>
        </OGDialogContent>
      </OGDialog>
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
    <label className="mb-1 block text-sm font-medium text-black dark:text-white" htmlFor={id}>
      {label}
    </label>
    <Input id={id} onChange={onChange} placeholder={value} />
  </div>
);

const renderDeleteButton = (
  handleDeleteUser: () => void,
  isDeleting: boolean,
  isLocked: boolean,
  localize: LocalizeFunction,
) => (
  <button
    className={cn(
      'mt-4 flex w-full items-center justify-center rounded-lg bg-surface-tertiary px-4 py-2 transition-all duration-200',
      isLocked ? 'cursor-not-allowed opacity-30' : 'bg-destructive text-destructive-foreground',
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
            <LockIcon className="size-5" />
            <span className="ml-2">{localize('com_ui_locked')}</span>
          </>
        ) : (
          <>
            <Trash className="size-5" />
            <span className="ml-2">{localize('com_nav_delete_account_button')}</span>
          </>
        )}
      </>
    )}
  </button>
);

export default DeleteAccount;
