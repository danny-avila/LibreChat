import { LockIcon, Trash } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import {
  Input,
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogHeader,
  OGDialogTitle,
} from '~/components';
import { useDeleteUserMutation, useGetOmnexioSubscriptionPlans } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';
import { LocalizeFunction } from '~/common';

const DeleteAccount = ({ disabled = false }: { title?: string; disabled?: boolean }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user, logout } = useAuthContext();
  const { mutate: deleteUser, isLoading: isDeleting } = useDeleteUserMutation({
    onMutate: () => logout(),
  });

  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState(true);

  // Fetch subscription plans to check if user has an active subscription
  const subscriptionPlansQuery = useGetOmnexioSubscriptionPlans();

  const handleDeleteUser = () => {
    if (isLocked) {
      return;
    }

    // Check if user has an active subscription (any plan with id not equal to 1)
    const currentPlan = subscriptionPlansQuery.data?.find((plan) => plan.isCurrent);
    if (currentPlan && parseInt(currentPlan.id) > 1) {
      showToast({
        message: localize('com_nav_delete_subscription_active'),
        status: 'error',
      });
      return;
    }

    deleteUser(undefined);
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
          <span>{localize('com_nav_delete_account')}</span>
          <OGDialogTrigger asChild>
            <Button
              variant="destructive"
              className="flex items-center justify-center rounded-lg transition-colors duration-200"
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
              {subscriptionPlansQuery.data &&
                subscriptionPlansQuery.data.some(
                  (plan) => plan.isCurrent && parseInt(plan.id) > 1,
                ) && (
                  <li className="mt-2 text-red-500">
                    {localize('com_nav_delete_subscription_warning')}
                  </li>
                )}
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
            {renderDeleteButton(
              handleDeleteUser,
              isDeleting,
              isLocked ||
                (subscriptionPlansQuery.data?.some(
                  (plan) => plan.isCurrent && parseInt(plan.id) > 1,
                ) ??
                  false),
              localize,
              subscriptionPlansQuery.data?.some(
                (plan) => plan.isCurrent && parseInt(plan.id) > 1,
              ) ?? false,
            )}
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
  hasActiveSubscription: boolean,
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
        ) : hasActiveSubscription ? (
          <>
            <LockIcon className="size-5" />
            <span className="ml-2">{localize('com_nav_delete_subscription_active_btn')}</span>
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
